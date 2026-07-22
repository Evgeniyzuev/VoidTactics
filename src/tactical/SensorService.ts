import type { Fleet, Faction } from '../entities/Fleet';
import type { WorldEvent, WorldEventKind } from '../entities/WorldEvent';
import { TACTICAL_BALANCE } from './ShipDefinitions';

export type ContactLevel = 'blip' | 'classified' | 'identified';
export type SensorTarget = Fleet | WorldEvent;

export interface SensorTargetRef<T extends SensorTarget = SensorTarget> {
    contactId: string;
    entity: T;
}

export type SensorTargetInput<T extends SensorTarget = SensorTarget> = T | SensorTargetRef<T>;

export interface ScanPulseState {
    rangeUntil: number;
    signatureUntil: number;
}

export interface SensorProfile {
    sensorRange: number;
    scanResolution: number;
    signature: number;
    rangeMultiplier: number;
    signatureMultiplier: number;
    scanPulseActive: boolean;
    scanPulseSignatureActive: boolean;
}

export interface SensorIntel {
    faction: Faction | null;
    threat: number | null;
    threatMin: number | null;
    threatMax: number | null;
    shipCount: number | null;
    shipCountMin: number | null;
    shipCountMax: number | null;
    roles: string[] | null;
    signalKind: WorldEventKind | null;
    signalTitle: string | null;
}

export interface SensorContact<T extends SensorTarget = SensorTarget> {
    id: string;
    target: T;
    targetKind: 'fleet' | 'signal';
    level: ContactLevel;
    distance: number;
    detectionRange: number;
    nominalScanRange: number;
    scanProgress: number;
    firstSeenAt: number;
    lastSeenAt: number;
    staleUntil: number;
    stale: boolean;
    lastKnownPosition: { x: number; y: number };
    lastKnownVelocity: { x: number; y: number };
    intel: SensorIntel;
}

export interface SensorServiceConfig {
    staleMemorySeconds: number;
    damagedSensorMultiplier: number;
    damagedCommandScanMultiplier: number;
    sensorSkillRangePerSqrtLevel: number;
    sensorSkillSignaturePerLevel: number;
    sensorSkillSignatureFloor: number;
    cloakSignatureMultiplier: number;
    afterburnerSignatureMultiplier: number;
    emptyFuelSignatureMultiplier: number;
    baseSensorRangeMultiplier: number;
    fleetRangeUsesNominalBoundary: boolean;
    classifyFleetsAtNominalBoundary: boolean;
    retainFleetStaleContacts: boolean;
    scanPulseRangeMultiplier: number;
    scanPulseSignatureMultiplier: number;
    scanPulseRangeDuration: number;
    scanPulseSignatureDuration: number;
    minimumDetectionSignatureMultiplier: number;
    maximumDetectionSignatureMultiplier: number;
    minimumScanSeconds: number;
    maximumScanSeconds: number;
    classifiedProgress: number;
    scanResolutionRangeDivisor: number;
    minimumScanResolution: number;
    eventSignatures: Readonly<Record<WorldEventKind, number>>;
    fleetId?: (fleet: Fleet) => string | undefined;
}

export const DEFAULT_SENSOR_CONFIG: Readonly<SensorServiceConfig> = {
    staleMemorySeconds: TACTICAL_BALANCE.staleContactSeconds,
    damagedSensorMultiplier: TACTICAL_BALANCE.sensorDamageMultiplier,
    damagedCommandScanMultiplier: 0.75,
    sensorSkillRangePerSqrtLevel: 0.05,
    sensorSkillSignaturePerLevel: 0.08,
    sensorSkillSignatureFloor: 0.6,
    cloakSignatureMultiplier: 0.25,
    afterburnerSignatureMultiplier: TACTICAL_BALANCE.afterburnerSignatureMultiplier,
    emptyFuelSignatureMultiplier: TACTICAL_BALANCE.emptyFuelSignatureMultiplier,
    baseSensorRangeMultiplier: TACTICAL_BALANCE.baseSensorRangeMultiplier,
    fleetRangeUsesNominalBoundary: true,
    classifyFleetsAtNominalBoundary: true,
    retainFleetStaleContacts: false,
    scanPulseRangeMultiplier: TACTICAL_BALANCE.scanPulseRangeMultiplier,
    scanPulseSignatureMultiplier: TACTICAL_BALANCE.scanPulseSignatureMultiplier,
    scanPulseRangeDuration: TACTICAL_BALANCE.scanPulseDuration,
    scanPulseSignatureDuration: TACTICAL_BALANCE.scanPulseSignatureDuration,
    minimumDetectionSignatureMultiplier: 0.65,
    maximumDetectionSignatureMultiplier: 2,
    minimumScanSeconds: 0.75,
    maximumScanSeconds: 4,
    classifiedProgress: 0.25,
    scanResolutionRangeDivisor: 1200,
    minimumScanResolution: 0.5,
    eventSignatures: { anomaly: 0.85, distress: 1.2, salvage: 0.65 }
};

interface ObserverState {
    contacts: Map<string, SensorContact>;
    lastUpdateAt: number;
}

type FutureHullDefinition = Fleet['ships'][number]['definition'] & { scanResolution?: number };

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

function isTargetRef(value: SensorTargetInput): value is SensorTargetRef {
    return typeof value === 'object' && value !== null && 'contactId' in value && 'entity' in value;
}

function isWorldEvent(value: SensorTarget): value is WorldEvent {
    return 'kind' in value && 'timeLeft' in value && 'phase' in value;
}

function hashUnit(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
}

function emptyIntel(): SensorIntel {
    return {
        faction: null,
        threat: null,
        threatMin: null,
        threatMax: null,
        shipCount: null,
        shipCountMin: null,
        shipCountMax: null,
        roles: null,
        signalKind: null,
        signalTitle: null
    };
}

/**
 * Deterministic tactical contact tracker. It owns only transient sensor memory;
 * callers remain responsible for charging Energy and persisting scan-pulse use.
 */
export class SensorService {
    private readonly config: SensorServiceConfig;
    private readonly observers = new WeakMap<Fleet, ObserverState>();
    private readonly pulses = new WeakMap<Fleet, ScanPulseState>();
    private readonly runtimeIds = new WeakMap<object, string>();
    private nextRuntimeFleetId = 1;

    constructor(config: Partial<SensorServiceConfig> = {}) {
        this.config = {
            ...DEFAULT_SENSOR_CONFIG,
            ...config,
            eventSignatures: { ...DEFAULT_SENSOR_CONFIG.eventSignatures, ...config.eventSignatures }
        };
    }

    public activateScanPulse(
        fleet: Fleet,
        now: number,
        rangeDuration = this.config.scanPulseRangeDuration,
        signatureDuration = this.config.scanPulseSignatureDuration
    ): ScanPulseState {
        this.assertFinite(now, 'now');
        const previous = this.pulses.get(fleet);
        const state = {
            rangeUntil: Math.max(previous?.rangeUntil ?? now, now + Math.max(0, rangeDuration)),
            signatureUntil: Math.max(previous?.signatureUntil ?? now, now + Math.max(0, signatureDuration))
        };
        this.pulses.set(fleet, state);
        return { ...state };
    }

    public getScanPulseState(fleet: Fleet): ScanPulseState | null {
        const state = this.pulses.get(fleet);
        return state ? { ...state } : null;
    }

    public clearScanPulse(fleet: Fleet) {
        this.pulses.delete(fleet);
    }

    public getFleetProfile(fleet: Fleet, now: number): SensorProfile {
        this.assertFinite(now, 'now');
        const activeShips = fleet.ships.filter(ship => ship.state === 'active');
        const skillLevel = Math.max(0, fleet.getSkillLevel('sensors'));
        const skillRangeMultiplier = 1 + this.config.sensorSkillRangePerSqrtLevel * Math.sqrt(skillLevel);
        let sensorRange = 0;
        let scanResolution = 0;

        for (const ship of activeShips) {
            const moduleSensorBonus = ship.modules.reduce((sum, module) => sum + (module.sensorModifier ?? 0), 0);
            const moduleScanResolutionBonus = ship.modules.reduce(
                (sum, module) => sum + (module.scanResolutionModifier ?? 0),
                0
            );
            const sensorDamageMultiplier = ship.damagedSystems.includes('sensors')
                ? this.config.damagedSensorMultiplier
                : 1;
            const shipSensorRange = (ship.definition.sensorRange + moduleSensorBonus) * sensorDamageMultiplier;
            sensorRange = Math.max(sensorRange, shipSensorRange);

            const definition = ship.definition as FutureHullDefinition;
            const baseResolution = definition.scanResolution
                ?? shipSensorRange / this.config.scanResolutionRangeDivisor;
            const commandMultiplier = ship.damagedSystems.includes('command')
                ? this.config.damagedCommandScanMultiplier
                : 1;
            scanResolution = Math.max(
                scanResolution,
                (baseResolution + moduleScanResolutionBonus) * commandMultiplier
            );
        }

        const pulse = this.pulses.get(fleet);
        const scanPulseActive = (pulse?.rangeUntil ?? -Infinity) > now;
        const scanPulseSignatureActive = (pulse?.signatureUntil ?? -Infinity) > now;
        const rangeMultiplier = scanPulseActive ? this.config.scanPulseRangeMultiplier : 1;
        let signatureMultiplier = 1;
        if (fleet.isCloaked) signatureMultiplier *= this.config.cloakSignatureMultiplier;
        if (fleet.abilities.afterburner.active) signatureMultiplier *= this.config.afterburnerSignatureMultiplier;
        if (scanPulseSignatureActive) signatureMultiplier *= this.config.scanPulseSignatureMultiplier;
        if (activeShips.length > 0 && fleet.fuel <= 0) {
            signatureMultiplier *= this.config.emptyFuelSignatureMultiplier;
        }

        const signatureSkillMultiplier = Math.max(
            this.config.sensorSkillSignatureFloor,
            1 - this.config.sensorSkillSignaturePerLevel * skillLevel
        );
        const signature = activeShips.reduce((sum, ship) => (
            sum + ship.definition.signature * Math.sqrt(Math.max(0.02, ship.statScale))
        ), 0) * signatureSkillMultiplier * signatureMultiplier;

        return {
            sensorRange: sensorRange * this.config.baseSensorRangeMultiplier * skillRangeMultiplier * rangeMultiplier
                * (fleet.inAsteroidBelt ? 0.2 : 1),
            scanResolution: Math.max(this.config.minimumScanResolution, scanResolution),
            signature: Math.max(0.01, signature),
            rangeMultiplier,
            signatureMultiplier,
            scanPulseActive,
            scanPulseSignatureActive
        };
    }

    public update(
        observer: Fleet,
        targets: readonly SensorTargetInput[],
        dt: number,
        now: number
    ): readonly SensorContact[] {
        this.assertFinite(dt, 'dt');
        this.assertFinite(now, 'now');
        const elapsed = Math.max(0, dt);
        const state = this.stateFor(observer, now);
        const observerProfile = this.getFleetProfile(observer, now);
        const suppliedIds = new Set<string>();

        for (const input of targets) {
            const target = isTargetRef(input) ? input.entity : input;
            if (target === observer) continue;
            const id = isTargetRef(input) ? this.normalizeExplicitId(input.contactId) : this.idFor(target);
            if (suppliedIds.has(id)) continue;
            suppliedIds.add(id);
            this.runtimeIds.set(target, id);
            this.updateTarget(state, observer, observerProfile, target, id, elapsed, now);
        }

        for (const [id, contact] of state.contacts) {
            if (!suppliedIds.has(id) || contact.stale) this.updateStaleContact(contact, now);
            if (now > contact.staleUntil) state.contacts.delete(id);
        }
        state.lastUpdateAt = Math.max(state.lastUpdateAt, now);
        return this.sortedContacts(state);
    }

    public getContacts(observer: Fleet): readonly SensorContact[] {
        const state = this.observers.get(observer);
        return state ? this.sortedContacts(state) : [];
    }

    public getContact(observer: Fleet, targetOrId: SensorTarget | string): SensorContact | null {
        const state = this.observers.get(observer);
        if (!state) return null;
        const id = typeof targetOrId === 'string' ? targetOrId : this.runtimeIds.get(targetOrId);
        return id ? state.contacts.get(id) ?? null : null;
    }

    public forgetObserver(observer: Fleet) {
        this.observers.delete(observer);
    }

    public forgetContact(observer: Fleet, targetOrId: SensorTarget | string) {
        const state = this.observers.get(observer);
        if (!state) return;
        const id = typeof targetOrId === 'string' ? targetOrId : this.runtimeIds.get(targetOrId);
        if (id) state.contacts.delete(id);
    }

    public canRender(observer: Fleet, targetOrContact: SensorTarget | SensorContact | string) {
        const contact = this.resolveContact(observer, targetOrContact);
        // Expired contacts are removed during update; retained stale contacts are
        // useful for signals, but fleets leaving the nominal radar boundary
        // disappear from the tactical map immediately.
        if (!contact) return false;
        if (!contact.stale) return true;
        return contact.targetKind !== 'fleet' || this.config.retainFleetStaleContacts;
    }

    public canInspect(observer: Fleet, targetOrContact: SensorTarget | SensorContact | string) {
        const contact = this.resolveContact(observer, targetOrContact);
        return contact !== null && !contact.stale && contact.level !== 'blip';
    }

    public canAttack(observer: Fleet, targetOrContact: SensorTarget | SensorContact | string) {
        const contact = this.resolveContact(observer, targetOrContact);
        const target = contact?.targetKind === 'fleet' ? contact.target as Fleet : null;
        return contact !== null
            && !contact.stale
            && contact.targetKind === 'fleet'
            && contact.level !== 'blip'
            && !target?.isCloaked
            && target?.ships.some(ship => ship.state === 'active') === true;
    }

    private updateTarget(
        state: ObserverState,
        observer: Fleet,
        observerProfile: SensorProfile,
        target: SensorTarget,
        id: string,
        dt: number,
        now: number
    ) {
        const distance = this.distance(observer, target);
        const targetSignature = this.targetSignature(target, now);
        const signatureRangeMultiplier = clamp(
            Math.sqrt(targetSignature),
            this.config.minimumDetectionSignatureMultiplier,
            this.config.maximumDetectionSignatureMultiplier
        );
        const signatureDetectionRange = observerProfile.sensorRange * signatureRangeMultiplier;
        const isFleetTarget = !isWorldEvent(target);
        // The belt masks ships entering it from observers outside. An observer
        // already in the belt is already covered by its reduced profile above.
        const beltTargetMultiplier = isFleetTarget && (target as Fleet).inAsteroidBelt && !observer.inAsteroidBelt ? 0.2 : 1;
        const detectionRange = isFleetTarget && this.config.fleetRangeUsesNominalBoundary
            ? observerProfile.sensorRange * beltTargetMultiplier
            : signatureDetectionRange * beltTargetMultiplier;
        const targetIsActive = !isWorldEvent(target) || target.active;
        const detected = targetIsActive && distance <= detectionRange && observerProfile.sensorRange > 0;
        let contact = state.contacts.get(id);

        if (!detected) {
            if (contact) this.updateStaleContact(contact, now);
            return;
        }

        if (!contact) {
            contact = this.createContact(target, id, distance, detectionRange, observerProfile.sensorRange, now);
            // A fleet crossing the nominal radar boundary immediately provides
            // an approximate tactical estimate. Exact roles and defenses still
            // require normal scan progress to reach Identified.
            if (isFleetTarget && this.config.classifyFleetsAtNominalBoundary) {
                contact.scanProgress = this.config.classifiedProgress;
                contact.level = 'classified';
            }
            state.contacts.set(id, contact);
        }
        contact.target = target;
        contact.targetKind = isWorldEvent(target) ? 'signal' : 'fleet';
        contact.distance = distance;
        contact.detectionRange = detectionRange;
        contact.nominalScanRange = observerProfile.sensorRange;
        contact.lastSeenAt = now;
        contact.staleUntil = now + this.config.staleMemorySeconds;
        contact.stale = false;
        contact.lastKnownPosition = { x: target.position.x, y: target.position.y };
        contact.lastKnownVelocity = { x: target.velocity.x, y: target.velocity.y };

        if (distance <= observerProfile.sensorRange * beltTargetMultiplier) {
            const scanSeconds = this.scanSeconds(distance, observerProfile, targetSignature);
            contact.scanProgress = clamp(contact.scanProgress + dt / scanSeconds, 0, 1);
        }
        contact.level = contact.scanProgress >= 1
            ? 'identified'
            : contact.scanProgress >= this.config.classifiedProgress ? 'classified' : 'blip';
        contact.intel = this.intelFor(contact);
    }

    private createContact(
        target: SensorTarget,
        id: string,
        distance: number,
        detectionRange: number,
        nominalScanRange: number,
        now: number
    ): SensorContact {
        return {
            id,
            target,
            targetKind: isWorldEvent(target) ? 'signal' : 'fleet',
            level: 'blip',
            distance,
            detectionRange,
            nominalScanRange,
            scanProgress: 0,
            firstSeenAt: now,
            lastSeenAt: now,
            staleUntil: now + this.config.staleMemorySeconds,
            stale: false,
            lastKnownPosition: { x: target.position.x, y: target.position.y },
            lastKnownVelocity: { x: target.velocity.x, y: target.velocity.y },
            intel: emptyIntel()
        };
    }

    private updateStaleContact(contact: SensorContact, now: number) {
        if (now > contact.lastSeenAt) contact.stale = true;
    }

    private scanSeconds(distance: number, observer: SensorProfile, targetSignature: number) {
        const distanceFactor = clamp(distance / Math.max(1, observer.sensorRange), 0, 1);
        const quality = clamp(observer.scanResolution * Math.sqrt(targetSignature), 0.5, 2.5);
        const duration = this.config.minimumScanSeconds
            + (this.config.maximumScanSeconds - this.config.minimumScanSeconds) * distanceFactor / quality;
        return clamp(duration, this.config.minimumScanSeconds, this.config.maximumScanSeconds);
    }

    private targetSignature(target: SensorTarget, now: number) {
        if (isWorldEvent(target)) return this.config.eventSignatures[target.kind];
        return this.getFleetProfile(target, now).signature;
    }

    private intelFor(contact: SensorContact): SensorIntel {
        if (contact.level === 'blip') return emptyIntel();
        if (isWorldEvent(contact.target)) {
            const event = contact.target;
            if (contact.level === 'identified') {
                return {
                    ...emptyIntel(),
                    threat: event.threatBudget,
                    threatMin: event.threatBudget,
                    threatMax: event.threatBudget,
                    signalKind: event.kind,
                    signalTitle: event.title
                };
            }
            const bias = 0.75 + hashUnit(contact.id) * 0.5;
            const estimatedThreat = Math.max(1, Math.round(event.threatBudget * bias));
            return {
                ...emptyIntel(),
                threat: estimatedThreat,
                threatMin: Math.max(1, Math.round(estimatedThreat * 0.75)),
                threatMax: Math.max(1, Math.round(estimatedThreat * 1.25)),
                signalKind: null,
                signalTitle: 'Classified signal'
            };
        }

        const fleet = contact.target;
        const activeShips = fleet.ships.filter(ship => ship.state !== 'destroyed');
        if (contact.level === 'identified') {
            return {
                ...emptyIntel(),
                faction: fleet.faction,
                threat: fleet.threatRating,
                threatMin: fleet.threatRating,
                threatMax: fleet.threatRating,
                shipCount: activeShips.length,
                shipCountMin: activeShips.length,
                shipCountMax: activeShips.length,
                roles: [...new Set(activeShips.map(ship => ship.role))]
            };
        }

        const bias = 0.75 + hashUnit(contact.id) * 0.5;
        const estimatedThreat = Math.max(1, Math.round(fleet.threatRating * bias));
        const shipError = hashUnit(`${contact.id}:ships`) < 0.5 ? -1 : 1;
        const estimatedShips = Math.max(1, activeShips.length + shipError);
        return {
            ...emptyIntel(),
            faction: fleet.faction,
            threat: estimatedThreat,
            threatMin: Math.max(1, Math.round(estimatedThreat * 0.75)),
            threatMax: Math.max(1, Math.round(estimatedThreat * 1.25)),
            shipCount: estimatedShips,
            shipCountMin: Math.max(1, estimatedShips - 1),
            shipCountMax: estimatedShips + 1,
            roles: null
        };
    }

    private stateFor(observer: Fleet, now: number) {
        let state = this.observers.get(observer);
        if (!state) {
            state = { contacts: new Map(), lastUpdateAt: now };
            this.observers.set(observer, state);
        }
        return state;
    }

    private resolveContact(observer: Fleet, targetOrContact: SensorTarget | SensorContact | string) {
        if (typeof targetOrContact === 'object' && 'lastSeenAt' in targetOrContact && 'scanProgress' in targetOrContact) {
            return targetOrContact;
        }
        return this.getContact(observer, targetOrContact);
    }

    private sortedContacts(state: ObserverState) {
        return [...state.contacts.values()].sort((left, right) => left.id.localeCompare(right.id));
    }

    private idFor(target: SensorTarget) {
        const known = this.runtimeIds.get(target);
        if (known) return known;
        let id: string;
        if (isWorldEvent(target)) {
            id = `event:${target.directorId || target.id}`;
        } else {
            const externalId = this.config.fleetId?.(target);
            const stableShipId = target.ships[0]?.id;
            id = externalId || stableShipId
                ? `fleet:${externalId || stableShipId}`
                : `fleet:runtime-${this.nextRuntimeFleetId++}`;
        }
        this.runtimeIds.set(target, id);
        return id;
    }

    private normalizeExplicitId(id: string) {
        const normalized = id.trim();
        if (!normalized) throw new Error('Sensor contactId cannot be empty.');
        return normalized;
    }

    private distance(observer: Fleet, target: SensorTarget) {
        const dx = target.position.x - observer.position.x;
        const dy = target.position.y - observer.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private assertFinite(value: number, name: string): asserts value is number {
        if (!Number.isFinite(value)) throw new RangeError(`SensorService ${name} must be finite.`);
    }
}
