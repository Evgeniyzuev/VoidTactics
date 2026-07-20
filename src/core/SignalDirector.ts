import type { WorldEventPendingChoice } from '../entities/WorldEvent';

export type SignalEventKind =
    | 'distress-convoy'
    | 'derelict-trap'
    | 'unstable-anomaly'
    | 'stranded-tanker'
    | 'salvage-race';

export type SignalWorldEventKind = 'anomaly' | 'distress' | 'salvage';
export type SignalEventPhase = 'hidden' | 'discovered' | 'engaged' | 'resolved' | 'expired';

export interface SignalPoint {
    x: number;
    y: number;
}

export interface SignalChoiceDefinition {
    id: string;
    label: string;
    dangerDelta: number;
}

/** Data-only event configuration. Event-specific gameplay remains in Game. */
export interface SignalDefinition {
    id: SignalEventKind;
    title: string;
    worldEventKind: SignalWorldEventKind;
    weight: number;
    dangerWeight: number;
    threatScale: readonly [min: number, max: number];
    phases: readonly string[];
    choices: readonly SignalChoiceDefinition[];
    missedDangerDelta: number;
}

export interface CircularSystemBounds {
    center: Readonly<SignalPoint>;
    radius: number;
    margin?: number;
}

export type SignalAvoidCallback = (
    position: Readonly<SignalPoint>,
    definition: Readonly<SignalDefinition>,
    activeEvents: readonly WorldEventSnapshot[]
) => boolean;

export interface SignalSpawnContext {
    playerPosition: Readonly<SignalPoint>;
    playerSensorRange: number;
    playerThreat: number;
    systemBounds: Readonly<CircularSystemBounds>;
    /** Return true when a candidate overlaps a viewport, body, gate, or other forbidden area. */
    avoid?: SignalAvoidCallback;
}

export interface SavedSignalEvent {
    id: string;
    definitionId: SignalEventKind;
    worldEventKind: SignalWorldEventKind;
    title: string;
    position: SignalPoint;
    phase: SignalEventPhase;
    createdAt: number;
    engagedAt: number | null;
    timeLeft: number;
    ttl: number;
    threatBudget: number;
    outcome: string | null;
    rewardGranted: boolean;
    dangerApplied: boolean;
    playerInvolved: boolean;
    pendingChoice: WorldEventPendingChoice | null;
}

export type WorldEventSnapshot = SavedSignalEvent;
export type { WorldEventPendingChoice } from '../entities/WorldEvent';

export interface SignalSpawnDescriptor {
    id: string;
    definitionId: SignalEventKind;
    worldEventKind: SignalWorldEventKind;
    title: string;
    position: SignalPoint;
    timeLeft: number;
    threatBudget: number;
}

export interface SignalDirectorUpdate {
    spawned: SignalSpawnDescriptor[];
    expired: WorldEventSnapshot[];
}

export interface SignalDirectorSnapshot {
    version: 1;
    seed: number;
    rngState: number;
    elapsedTime: number;
    nextSpawnIn: number;
    spawnSequence: number;
    systemDanger: number;
    events: SavedSignalEvent[];
}

export interface SignalDirectorOptions {
    seed: number;
    systemDanger?: number;
}

/** Runtime rewards, costs and encounter multipliers kept out of Game orchestration. */
export const SIGNAL_EVENT_BALANCE = {
    minimumThreatBudget: 4,
    interactionPadding: 25,
    distress: {
        minimumReferenceThreat: 10,
        autoStartDistance: 500,
        autoStartTimeLeft: 90,
        involvementDistance: 1400,
        reinforcementDelay: 35,
        savedDangerDelta: -2,
        lostDangerDelta: 2,
        transportThreatMultiplier: 0.45,
        hunterThreatMultiplier: 0.75,
        responderThreatMultiplier: 0.9,
        predatorThreatMultiplier: 2.2,
        assistCredits: 300,
        assistSupplies: 8,
        assistSalvage: 24,
        simulatedSalvage: 10,
        lostSalvageInvolved: 42,
        lostSalvageSimulated: 28,
        missedSalvage: 8,
        raidCredits: 240,
        raidCrateFuel: 8,
        raidCrateSupplies: 4
    },
    derelict: {
        remoteScanEnergyFraction: 0.1,
        remoteScanCredits: 160,
        remoteCrateFuel: 6,
        remoteCrateSupplies: 2,
        ambushChance: 0.55,
        ambushThreatMultiplier: 0.9,
        recoveryCredits: 320,
        defeatDangerDelta: 0.5
    },
    anomaly: {
        analysisEnergyFraction: 0.2,
        analysisCredits: 260,
        stabilizationSupplyCost: 3,
        stabilizationCredits: 200
    },
    tanker: {
        assistanceSupplyCost: 5,
        assistanceFuelFraction: 0.25,
        assistanceCredits: 180,
        patrolThreatMultiplier: 0.8,
        seizureFuelFraction: 0.35,
        seizureCredits: 80,
        defeatDangerDelta: 1
    },
    salvage: {
        competitorThreatMultiplier: 0.75,
        sharedCredits: 150,
        sharedSupplies: 4,
        rivalThreatMultiplier: 0.95,
        claimedCredits: 300,
        claimedCrateFuel: 7,
        claimedCrateSupplies: 5,
        defeatDangerDelta: 0.25
    }
} as const;

export const SIGNAL_DEFINITIONS: readonly SignalDefinition[] = [
    {
        id: 'distress-convoy',
        title: 'Distress convoy',
        worldEventKind: 'distress',
        weight: 1.15,
        dangerWeight: 0.7,
        threatScale: [0.65, 1.8],
        phases: ['distress call', 'pirate interception', 'third-party response'],
        choices: [
            { id: 'assist', label: 'Assist convoy', dangerDelta: -2 },
            { id: 'raid', label: 'Raid survivors', dangerDelta: 2 },
            { id: 'ignore', label: 'Ignore', dangerDelta: 1 }
        ],
        missedDangerDelta: 1
    },
    {
        id: 'derelict-trap',
        title: 'Silent derelict',
        worldEventKind: 'salvage',
        weight: 1,
        dangerWeight: 0.35,
        threatScale: [0.45, 1.5],
        phases: ['weak transponder', 'remote scan', 'salvage or ambush'],
        choices: [
            { id: 'scan', label: 'Scan remotely', dangerDelta: -0.25 },
            { id: 'board', label: 'Board derelict', dangerDelta: 0 },
            { id: 'withdraw', label: 'Withdraw', dangerDelta: 0 }
        ],
        missedDangerDelta: 0.25
    },
    {
        id: 'unstable-anomaly',
        title: 'Unstable anomaly',
        worldEventKind: 'anomaly',
        weight: 0.95,
        dangerWeight: -0.15,
        threatScale: [0.3, 1.2],
        phases: ['energy echo', 'spectral analysis', 'collapse'],
        choices: [
            { id: 'analyze', label: 'Spend Energy to analyze', dangerDelta: -0.5 },
            { id: 'stabilize', label: 'Spend supplies to stabilize', dangerDelta: -1 },
            { id: 'leave', label: 'Leave', dangerDelta: 0.25 }
        ],
        missedDangerDelta: 0.25
    },
    {
        id: 'stranded-tanker',
        title: 'Stranded tanker',
        worldEventKind: 'distress',
        weight: 0.9,
        dangerWeight: 0.2,
        threatScale: [0.35, 0.9],
        phases: ['fuel leak', 'negotiation', 'rescue or seizure'],
        choices: [
            { id: 'supply', label: 'Trade supplies for fuel', dangerDelta: -1 },
            { id: 'seize', label: 'Seize remaining fuel', dangerDelta: 1.5 },
            { id: 'ignore', label: 'Ignore', dangerDelta: 0.5 }
        ],
        missedDangerDelta: 0.5
    },
    {
        id: 'salvage-race',
        title: 'Salvage race',
        worldEventKind: 'salvage',
        weight: 1,
        dangerWeight: 0.45,
        threatScale: [0.8, 1.7],
        phases: ['wreck field', 'rival contact', 'claim resolution'],
        choices: [
            { id: 'share', label: 'Share salvage', dangerDelta: -0.5 },
            { id: 'claim', label: 'Claim everything', dangerDelta: 0.75 },
            { id: 'withdraw', label: 'Withdraw', dangerDelta: 0 }
        ],
        missedDangerDelta: 0.5
    }
];

const DEFINITION_BY_ID = new Map(SIGNAL_DEFINITIONS.map(definition => [definition.id, definition]));
const ACTIVE_PHASES: ReadonlySet<SignalEventPhase> = new Set(['hidden', 'discovered', 'engaged']);
const MAX_ACTIVE_EVENTS = 3;
const MAX_PLACEMENT_ATTEMPTS = 20;
const FIRST_SPAWN_MIN = 10;
const FIRST_SPAWN_MAX = 20;
const NEXT_SPAWN_MIN = 45;
const NEXT_SPAWN_MAX = 90;
const RETRY_DELAY = 10;
const TTL_MIN = 240;
const TTL_MAX = 480;
const MIN_DISTANCE_FACTOR = 1.1;
const MAX_DISTANCE_FACTOR = 2.2;
const HISTORY_LIMIT = 64;

interface MutableWorldEvent extends WorldEventSnapshot {
    position: SignalPoint;
}

class SeededRandom {
    private state: number;

    constructor(state: number) {
        this.state = state >>> 0;
    }

    next(): number {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let value = this.state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    range(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    getState(): number {
        return this.state;
    }

    setState(state: number): void {
        this.state = state >>> 0;
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function copyEvent(event: Readonly<WorldEventSnapshot>): WorldEventSnapshot {
    return {
        ...event,
        position: { ...event.position },
        pendingChoice: event.pendingChoice ? { ...event.pendingChoice } : null
    };
}

function isActive(event: Readonly<WorldEventSnapshot>): boolean {
    return ACTIVE_PHASES.has(event.phase);
}

function isFinitePoint(point: Readonly<SignalPoint>): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * Seeded scheduler for signals. It owns timing and persistence, while Game owns
 * fleets, rewards, dialogs, and the rendered WorldEvent entities.
 */
export class SignalDirector {
    private seed: number;
    private rng: SeededRandom;
    private elapsedTime = 0;
    private nextSpawnIn: number;
    private spawnSequence = 0;
    private danger = 0;
    private events = new Map<string, MutableWorldEvent>();

    constructor(options: SignalDirectorOptions) {
        this.seed = options.seed >>> 0;
        this.rng = new SeededRandom(this.seed);
        this.danger = clamp(options.systemDanger ?? 0, 0, 100);
        this.nextSpawnIn = this.rng.range(FIRST_SPAWN_MIN, FIRST_SPAWN_MAX);
    }

    static fromSnapshot(snapshot: Readonly<SignalDirectorSnapshot>): SignalDirector {
        const director = new SignalDirector({ seed: snapshot.seed, systemDanger: snapshot.systemDanger });
        director.restore(snapshot);
        return director;
    }

    get systemDanger(): number {
        return this.danger;
    }

    get secondsUntilNextSignal(): number {
        return Math.max(0, this.nextSpawnIn);
    }

    update(dt: number, context: Readonly<SignalSpawnContext>): SignalDirectorUpdate {
        if (!Number.isFinite(dt) || dt < 0) throw new Error('SignalDirector.update requires a finite, non-negative dt.');
        this.validateContext(context);

        this.elapsedTime += dt;
        const expired: WorldEventSnapshot[] = [];
        for (const event of this.events.values()) {
            if (!isActive(event)) continue;
            event.timeLeft = Math.max(0, event.timeLeft - dt);
            if (event.timeLeft > 0) continue;
            event.phase = 'expired';
            event.outcome = 'missed';
            event.pendingChoice = null;
            this.applyDanger(event, this.requireDefinition(event.definitionId).missedDangerDelta);
            expired.push(copyEvent(event));
        }

        this.nextSpawnIn -= dt;
        const spawned: SignalSpawnDescriptor[] = [];
        while (this.nextSpawnIn <= 0 && this.activeEventCount() < MAX_ACTIVE_EVENTS) {
            const descriptor = this.trySpawn(context);
            if (!descriptor) {
                this.nextSpawnIn = RETRY_DELAY;
                break;
            }
            spawned.push(descriptor);
            this.nextSpawnIn += this.rng.range(NEXT_SPAWN_MIN, NEXT_SPAWN_MAX);
        }

        if (this.activeEventCount() >= MAX_ACTIVE_EVENTS && this.nextSpawnIn < 0) {
            this.nextSpawnIn = 0;
        }
        this.pruneHistory();
        return { spawned, expired };
    }

    markDiscovered(eventId: string): WorldEventSnapshot | null {
        return this.setActivePhase(eventId, 'discovered');
    }

    markEngaged(eventId: string, playerInvolved = true): WorldEventSnapshot | null {
        const event = this.events.get(eventId);
        if (!event || !isActive(event)) return null;
        event.phase = 'engaged';
        event.engagedAt ??= this.elapsedTime;
        event.playerInvolved ||= playerInvolved;
        return copyEvent(event);
    }

    setPendingChoice(eventId: string, choice: Readonly<WorldEventPendingChoice> | null): WorldEventSnapshot | null {
        const event = this.events.get(eventId);
        if (!event || !isActive(event)) return null;
        event.pendingChoice = choice ? { ...choice } : null;
        return copyEvent(event);
    }

    resolveEvent(eventId: string, outcome: string, dangerDelta = 0): WorldEventSnapshot | null {
        const event = this.events.get(eventId);
        if (!event) return null;
        if (!isActive(event)) return copyEvent(event);
        event.phase = 'resolved';
        event.outcome = outcome;
        event.pendingChoice = null;
        this.applyDanger(event, dangerDelta);
        this.pruneHistory();
        return copyEvent(event);
    }

    /** Returns true exactly once for a resolved event. Reward contents are owned by Game. */
    claimReward(eventId: string): boolean {
        const event = this.events.get(eventId);
        if (!event || event.phase !== 'resolved' || event.rewardGranted) return false;
        event.rewardGranted = true;
        this.pruneHistory();
        return true;
    }

    adjustSystemDanger(delta: number): number {
        if (!Number.isFinite(delta)) return this.danger;
        this.danger = clamp(this.danger + delta, 0, 100);
        return this.danger;
    }

    getEvent(eventId: string): WorldEventSnapshot | null {
        const event = this.events.get(eventId);
        return event ? copyEvent(event) : null;
    }

    getActiveEvents(): WorldEventSnapshot[] {
        return [...this.events.values()].filter(isActive).map(copyEvent);
    }

    snapshot(): SignalDirectorSnapshot {
        return {
            version: 1,
            seed: this.seed,
            rngState: this.rng.getState(),
            elapsedTime: this.elapsedTime,
            nextSpawnIn: this.nextSpawnIn,
            spawnSequence: this.spawnSequence,
            systemDanger: this.danger,
            events: [...this.events.values()].map(copyEvent)
        };
    }

    restore(snapshot: Readonly<SignalDirectorSnapshot>): void {
        if (snapshot.version !== 1) throw new Error(`Unsupported SignalDirector snapshot version: ${snapshot.version}`);
        this.seed = snapshot.seed >>> 0;
        this.rng.setState(snapshot.rngState);
        this.elapsedTime = Math.max(0, snapshot.elapsedTime);
        this.nextSpawnIn = Math.max(0, snapshot.nextSpawnIn);
        this.spawnSequence = Math.max(0, Math.floor(snapshot.spawnSequence));
        this.danger = clamp(snapshot.systemDanger, 0, 100);
        this.events.clear();
        for (const saved of snapshot.events) {
            if (this.events.has(saved.id) || !DEFINITION_BY_ID.has(saved.definitionId) || !isFinitePoint(saved.position)) continue;
            this.events.set(saved.id, {
                ...saved,
                position: { ...saved.position },
                engagedAt: Number.isFinite(saved.engagedAt) ? Math.max(0, saved.engagedAt!) : null,
                pendingChoice: saved.pendingChoice ? { ...saved.pendingChoice } : null,
                timeLeft: Math.max(0, saved.timeLeft),
                ttl: Math.max(0, saved.ttl),
                threatBudget: Math.max(4, Math.round(saved.threatBudget))
            });
        }
        this.pruneHistory();
    }

    private setActivePhase(eventId: string, phase: 'discovered' | 'engaged'): WorldEventSnapshot | null {
        const event = this.events.get(eventId);
        if (!event || !isActive(event)) return null;
        event.phase = phase;
        return copyEvent(event);
    }

    private trySpawn(context: Readonly<SignalSpawnContext>): SignalSpawnDescriptor | null {
        const definition = this.pickDefinition();
        const activeEvents = this.getActiveEvents();
        const sensorRange = Math.max(1, context.playerSensorRange);
        const minimumSeparation = Math.max(180, sensorRange * 0.15);
        let position: SignalPoint | null = null;

        for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
            const angle = this.rng.range(0, Math.PI * 2);
            const distance = sensorRange * this.rng.range(MIN_DISTANCE_FACTOR, MAX_DISTANCE_FACTOR);
            const candidate = {
                x: context.playerPosition.x + Math.cos(angle) * distance,
                y: context.playerPosition.y + Math.sin(angle) * distance
            };
            if (!this.isInsideBounds(candidate, context.systemBounds)) continue;
            if (activeEvents.some(event => this.distance(candidate, event.position) < minimumSeparation)) continue;
            if (context.avoid?.(candidate, definition, activeEvents)) continue;
            position = candidate;
            break;
        }
        if (!position) return null;

        const ttl = this.rng.range(TTL_MIN, TTL_MAX);
        const threatScale = this.rng.range(definition.threatScale[0], definition.threatScale[1]);
        const threatBudget = Math.max(4, Math.round(Math.max(1, context.playerThreat) * threatScale));
        const id = `signal-${this.seed.toString(36)}-${this.spawnSequence.toString(36)}`;
        this.spawnSequence++;
        const event: MutableWorldEvent = {
            id,
            definitionId: definition.id,
            worldEventKind: definition.worldEventKind,
            title: definition.title,
            position,
            phase: 'hidden',
            createdAt: this.elapsedTime,
            engagedAt: null,
            timeLeft: ttl,
            ttl,
            threatBudget,
            outcome: null,
            rewardGranted: false,
            dangerApplied: false,
            playerInvolved: false,
            pendingChoice: null
        };
        this.events.set(id, event);
        return this.toSpawnDescriptor(event);
    }

    private pickDefinition(): SignalDefinition {
        const activeKinds = new Set(this.getActiveEvents().map(event => event.definitionId));
        const weighted = SIGNAL_DEFINITIONS.map(definition => {
            const dangerFactor = clamp(1 + (this.danger / 100) * definition.dangerWeight, 0.25, 2);
            const repeatFactor = activeKinds.has(definition.id) ? 0.35 : 1;
            return { definition, weight: definition.weight * dangerFactor * repeatFactor };
        });
        const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
        let roll = this.rng.range(0, totalWeight);
        for (const item of weighted) {
            roll -= item.weight;
            if (roll <= 0) return item.definition;
        }
        return SIGNAL_DEFINITIONS[SIGNAL_DEFINITIONS.length - 1]!;
    }

    private applyDanger(event: MutableWorldEvent, delta: number): void {
        if (event.dangerApplied) return;
        event.dangerApplied = true;
        this.adjustSystemDanger(delta);
    }

    private activeEventCount(): number {
        let count = 0;
        for (const event of this.events.values()) {
            if (isActive(event)) count++;
        }
        return count;
    }

    private pruneHistory(): void {
        const removable = [...this.events.values()]
            .filter(event => event.phase === 'expired' || (event.phase === 'resolved' && event.rewardGranted))
            .sort((a, b) => a.createdAt - b.createdAt);
        const excess = Math.max(0, this.events.size - HISTORY_LIMIT);
        for (let index = 0; index < excess && index < removable.length; index++) {
            this.events.delete(removable[index]!.id);
        }
    }

    private toSpawnDescriptor(event: Readonly<MutableWorldEvent>): SignalSpawnDescriptor {
        return {
            id: event.id,
            definitionId: event.definitionId,
            worldEventKind: event.worldEventKind,
            title: event.title,
            position: { ...event.position },
            timeLeft: event.timeLeft,
            threatBudget: event.threatBudget
        };
    }

    private isInsideBounds(point: Readonly<SignalPoint>, bounds: Readonly<CircularSystemBounds>): boolean {
        const usableRadius = Math.max(0, bounds.radius - Math.max(0, bounds.margin ?? 0));
        return this.distance(point, bounds.center) <= usableRadius;
    }

    private distance(a: Readonly<SignalPoint>, b: Readonly<SignalPoint>): number {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    private requireDefinition(id: SignalEventKind): SignalDefinition {
        const definition = DEFINITION_BY_ID.get(id);
        if (!definition) throw new Error(`Unknown signal definition: ${id}`);
        return definition;
    }

    private validateContext(context: Readonly<SignalSpawnContext>): void {
        if (!isFinitePoint(context.playerPosition)) throw new Error('SignalDirector requires a finite player position.');
        if (!isFinitePoint(context.systemBounds.center)) throw new Error('SignalDirector requires a finite system center.');
        if (!Number.isFinite(context.playerSensorRange) || context.playerSensorRange <= 0) {
            throw new Error('SignalDirector requires a positive playerSensorRange.');
        }
        if (!Number.isFinite(context.playerThreat) || context.playerThreat < 0) {
            throw new Error('SignalDirector requires a non-negative playerThreat.');
        }
        if (!Number.isFinite(context.systemBounds.radius) || context.systemBounds.radius <= 0) {
            throw new Error('SignalDirector requires positive system bounds.');
        }
    }
}

/** Arguments match the current WorldEvent(x, y, kind, title, timeLeft) constructor. */
export function toWorldEventConstructorArgs(
    descriptor: Readonly<SignalSpawnDescriptor>
): [x: number, y: number, kind: SignalWorldEventKind, title: string, timeLeft: number] {
    return [
        descriptor.position.x,
        descriptor.position.y,
        descriptor.worldEventKind,
        descriptor.title,
        descriptor.timeLeft
    ];
}
