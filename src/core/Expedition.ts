/**
 * Strategic expedition layer.
 *
 * This module deliberately contains no DOM, Canvas or Fleet dependencies. It
 * owns the deterministic sector graph and the small amount of persistent
 * progression that sits above the tactical simulation.
 */

export type SectorType = 'home' | 'frontier' | 'relay' | 'anomaly' | 'warzone' | 'deep' | 'void';
export type SectorVisitState = 'undiscovered' | 'discovered' | 'visited';

export interface SectorNode {
    id: string;
    systemId: number;
    name: string;
    type: SectorType;
    dangerTier: number;
    localSeed: number;
    connections: string[];
    requiredArtifact?: string;
    safeHarbor: boolean;
}

export interface SectorState {
    nodeId: string;
    visitState: SectorVisitState;
    danger: number;
    routeSafety: number;
    discoveredPoi: string[];
    activeConsequences: string[];
    lastUpdated: number;
}

export type ArtifactEffect =
    | 'wayfinder'
    | 'sensor-range'
    | 'command-capacity'
    | 'recovery-protection'
    | 'salvage-yield';

export interface ArtifactDefinition {
    id: string;
    name: string;
    description: string;
    effect: ArtifactEffect;
    value: number;
    foundIn: string;
}

export interface RecoveryState {
    active: boolean;
    safeNodeId: string;
    readinessPenalty: number;
    cargoLossFraction: number;
    repairDebt: number;
    expiresAt: number;
}

export interface ProgressionState {
    seed: number;
    currentSectorId: string;
    discoveredSectors: string[];
    artifacts: string[];
    unlockedTech: string[];
    permissions: string[];
    sectorStates: Record<string, SectorState>;
    recovery: RecoveryState;
}

export interface TravelResult {
    ok: boolean;
    reason?: string;
    route: string[];
    fuelCost: number;
    etaSeconds: number;
}

export interface EncounterChoiceDefinition {
    id: string;
    label: string;
    cost?: { fuel?: number; supplies?: number; energyFraction?: number };
    reward?: { credits?: number; supplies?: number; fuelFraction?: number; artifactId?: string };
    dangerDelta: number;
    routeSafetyDelta?: number;
}

export interface EncounterDefinition {
    id: string;
    title: string;
    category: 'distress' | 'derelict' | 'salvage' | 'patrol' | 'trader' | 'hunter';
    phases: string[];
    choices: EncounterChoiceDefinition[];
    weight: number;
}

export const SECTOR_NODES: readonly SectorNode[] = [
    {
        id: 'sol', systemId: 1, name: 'Sol System', type: 'home', dangerTier: 1, localSeed: 0x534f4c,
        connections: ['alpha', 'frontier', 'relay'], safeHarbor: true
    },
    {
        id: 'alpha', systemId: 2, name: 'Alpha Centauri', type: 'frontier', dangerTier: 2, localSeed: 0x414c5048,
        connections: ['sol', 'frontier', 'anomaly'], safeHarbor: true
    },
    {
        id: 'frontier', systemId: 3, name: 'Frontier Reach', type: 'frontier', dangerTier: 2, localSeed: 0x46524e54,
        connections: ['sol', 'alpha', 'relay', 'warzone'], safeHarbor: false
    },
    {
        id: 'relay', systemId: 4, name: 'Relay Expanse', type: 'relay', dangerTier: 3, localSeed: 0x52454c59,
        connections: ['sol', 'frontier', 'warzone'], safeHarbor: true
    },
    {
        id: 'anomaly', systemId: 5, name: 'Anomaly Verge', type: 'anomaly', dangerTier: 4, localSeed: 0x414e4f4d,
        connections: ['alpha', 'frontier', 'deep'], requiredArtifact: 'artifact-wayfinder', safeHarbor: false
    },
    {
        id: 'warzone', systemId: 6, name: 'Broken March', type: 'warzone', dangerTier: 5, localSeed: 0x5741525a,
        connections: ['frontier', 'relay', 'deep'], requiredArtifact: 'artifact-wayfinder', safeHarbor: false
    },
    {
        id: 'deep', systemId: 7, name: 'Deep Drift', type: 'deep', dangerTier: 6, localSeed: 0x44454550,
        connections: ['anomaly', 'warzone', 'void'], requiredArtifact: 'artifact-long-range-array', safeHarbor: false
    },
    {
        id: 'void', systemId: 8, name: 'The Quiet Void', type: 'void', dangerTier: 7, localSeed: 0x564f4944,
        connections: ['deep'], requiredArtifact: 'artifact-command-relay', safeHarbor: false
    }
];

export const ARTIFACT_DEFINITIONS: readonly ArtifactDefinition[] = [
    {
        id: 'artifact-wayfinder', name: 'Wayfinder Core',
        description: 'Old navigation logic reveals sealed frontier routes and reduces expedition fuel cost.',
        effect: 'wayfinder', value: 0.2, foundIn: 'frontier'
    },
    {
        id: 'artifact-long-range-array', name: 'Long-Range Array',
        description: 'A dormant sensor lattice extends the fleet radar without adding another ship.',
        effect: 'sensor-range', value: 0.2, foundIn: 'anomaly'
    },
    {
        id: 'artifact-command-relay', name: 'Command Relay',
        description: 'A recovered relay coordinates a larger fleet through one simple doctrine layer.',
        effect: 'command-capacity', value: 3, foundIn: 'warzone'
    },
    {
        id: 'artifact-emergency-protocol', name: 'Emergency Protocol',
        description: 'Recovery routines protect the fleet from the worst consequences of defeat.',
        effect: 'recovery-protection', value: 0.5, foundIn: 'deep'
    },
    {
        id: 'artifact-salvage-matrix', name: 'Salvage Matrix',
        description: 'A pattern-matching system improves the value extracted from wreck fields.',
        effect: 'salvage-yield', value: 0.25, foundIn: 'void'
    }
];

export const ENCOUNTER_DEFINITIONS: readonly EncounterDefinition[] = [
    {
        id: 'distress-convoy', title: 'Distress convoy', category: 'distress', weight: 1.2,
        phases: ['distress call', 'interception', 'resolution'],
        choices: [
            { id: 'assist', label: 'Assist convoy', reward: { credits: 300, supplies: 8 }, dangerDelta: -2, routeSafetyDelta: 8 },
            { id: 'raid', label: 'Raid survivors', reward: { credits: 240, fuelFraction: 0.15 }, dangerDelta: 2, routeSafetyDelta: -8 },
            { id: 'ignore', label: 'Ignore', dangerDelta: 1, routeSafetyDelta: -2 }
        ]
    },
    {
        id: 'silent-derelict', title: 'Silent derelict', category: 'derelict', weight: 1,
        phases: ['weak transponder', 'remote scan', 'salvage or ambush'],
        choices: [
            { id: 'scan', label: 'Scan remotely', cost: { energyFraction: 0.1 }, reward: { credits: 160 }, dangerDelta: -0.25 },
            { id: 'board', label: 'Board derelict', reward: { credits: 320 }, dangerDelta: 0.5 },
            { id: 'withdraw', label: 'Withdraw', dangerDelta: 0 }
        ]
    },
    {
        id: 'salvage-race', title: 'Salvage race', category: 'salvage', weight: 1,
        phases: ['wreck field', 'rival contact', 'claim resolution'],
        choices: [
            { id: 'share', label: 'Share salvage', reward: { credits: 150, supplies: 4 }, dangerDelta: -0.5, routeSafetyDelta: 2 },
            { id: 'claim', label: 'Claim everything', reward: { credits: 300, fuelFraction: 0.15 }, dangerDelta: 0.75, routeSafetyDelta: -3 },
            { id: 'withdraw', label: 'Withdraw', dangerDelta: 0 }
        ]
    },
    {
        id: 'border-patrol', title: 'Border patrol', category: 'patrol', weight: 0.8,
        phases: ['long-range contact', 'inspection', 'passage or pursuit'],
        choices: [
            { id: 'pass', label: 'Submit to inspection', reward: { credits: 80 }, dangerDelta: -0.5, routeSafetyDelta: 3 },
            { id: 'evade', label: 'Evade patrol', cost: { fuel: 8 }, dangerDelta: 1, routeSafetyDelta: -3 },
            { id: 'challenge', label: 'Challenge patrol', reward: { credits: 420 }, dangerDelta: 2, routeSafetyDelta: -6 }
        ]
    },
    {
        id: 'wandering-trader', title: 'Wandering trader', category: 'trader', weight: 0.85,
        phases: ['merchant signal', 'exchange', 'departure'],
        choices: [
            { id: 'trade', label: 'Trade supplies for fuel', cost: { supplies: 3 }, reward: { fuelFraction: 0.2 }, dangerDelta: -0.5, routeSafetyDelta: 2 },
            { id: 'buy-intel', label: 'Buy route intelligence', cost: { fuel: 4 }, reward: { credits: 0 }, dangerDelta: -1, routeSafetyDelta: 8 },
            { id: 'pass', label: 'Pass by', dangerDelta: 0 }
        ]
    },
    {
        id: 'hunter-ambush', title: 'Hunter ambush', category: 'hunter', weight: 0.7,
        phases: ['quiet approach', 'intercept', 'escape or counterattack'],
        choices: [
            { id: 'break-contact', label: 'Break contact', cost: { fuel: 12 }, dangerDelta: -0.5 },
            { id: 'counterattack', label: 'Counterattack', reward: { credits: 520, supplies: 3 }, dangerDelta: 1.5, routeSafetyDelta: -4 },
            { id: 'hide', label: 'Hide and wait', cost: { supplies: 2 }, dangerDelta: 0, routeSafetyDelta: 1 }
        ]
    }
];

export const DEFAULT_EXPEDITION_SEED = 0x564f4944;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function cloneSectorState(state: SectorState): SectorState {
    return {
        ...state,
        discoveredPoi: [...state.discoveredPoi],
        activeConsequences: [...state.activeConsequences]
    };
}

function cloneRecovery(recovery: RecoveryState): RecoveryState {
    return { ...recovery };
}

function hashSeed(seed: number, value: number): number {
    let result = (seed ^ value) >>> 0;
    result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
    result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
    return (result ^ (result >>> 16)) >>> 0;
}

function buildDefaultState(seed: number): ProgressionState {
    const sectorStates: Record<string, SectorState> = {};
    for (const node of SECTOR_NODES) {
        sectorStates[node.id] = {
            nodeId: node.id,
            visitState: node.id === 'sol' ? 'visited' : ['alpha', 'frontier', 'relay'].includes(node.id) ? 'discovered' : 'undiscovered',
            danger: node.dangerTier * 5,
            routeSafety: node.safeHarbor ? 80 : 50,
            discoveredPoi: [],
            activeConsequences: [],
            lastUpdated: 0
        };
    }
    return {
        seed: seed >>> 0,
        currentSectorId: 'sol',
        discoveredSectors: ['sol', 'alpha', 'frontier', 'relay'],
        artifacts: [],
        unlockedTech: [],
        permissions: [],
        sectorStates,
        recovery: {
            active: false,
            safeNodeId: 'sol',
            readinessPenalty: 0,
            cargoLossFraction: 0,
            repairDebt: 0,
            expiresAt: 0
        }
    };
}

export class ExpeditionManager {
    private state: ProgressionState;

    constructor(snapshot?: Partial<ProgressionState>, seed = DEFAULT_EXPEDITION_SEED) {
        const defaults = buildDefaultState(snapshot?.seed ?? seed);
        this.state = {
            ...defaults,
            ...snapshot,
            discoveredSectors: [...(snapshot?.discoveredSectors ?? defaults.discoveredSectors)],
            artifacts: [...(snapshot?.artifacts ?? [])],
            unlockedTech: [...(snapshot?.unlockedTech ?? [])],
            permissions: [...(snapshot?.permissions ?? [])],
            sectorStates: Object.fromEntries(SECTOR_NODES.map(node => [
                node.id,
                cloneSectorState(snapshot?.sectorStates?.[node.id] ?? defaults.sectorStates[node.id]!)
            ])),
            recovery: cloneRecovery(snapshot?.recovery ?? defaults.recovery)
        };
        this.normalize();
    }

    static create(seed = DEFAULT_EXPEDITION_SEED): ExpeditionManager {
        return new ExpeditionManager(undefined, seed);
    }

    get currentNode(): SectorNode {
        return this.getNode(this.state.currentSectorId) || SECTOR_NODES[0]!;
    }

    get currentState(): SectorState {
        return this.state.sectorStates[this.currentNode.id]!;
    }

    get snapshot(): ProgressionState {
        return {
            ...this.state,
            discoveredSectors: [...this.state.discoveredSectors],
            artifacts: [...this.state.artifacts],
            unlockedTech: [...this.state.unlockedTech],
            permissions: [...this.state.permissions],
            sectorStates: Object.fromEntries(Object.entries(this.state.sectorStates).map(([id, sector]) => [id, cloneSectorState(sector)])),
            recovery: cloneRecovery(this.state.recovery)
        };
    }

    get nodes(): readonly SectorNode[] { return SECTOR_NODES; }
    get artifacts(): readonly string[] { return this.state.artifacts; }
    get isRecovering(): boolean { return this.state.recovery.active; }

    setCurrentSector(id: string): boolean {
        const node = this.getNode(id);
        if (!node || !this.hasAccess(node)) return false;
        this.state.currentSectorId = id;
        this.discover(id);
        this.state.sectorStates[id]!.visitState = 'visited';
        return true;
    }

    setCurrentBySystemId(systemId: number): boolean {
        const node = this.getNodeBySystemId(systemId);
        return node ? this.setCurrentSector(node.id) : false;
    }

    getNode(id: string): SectorNode | undefined {
        return SECTOR_NODES.find(node => node.id === id);
    }

    getNodeBySystemId(systemId: number): SectorNode | undefined {
        return SECTOR_NODES.find(node => node.systemId === systemId);
    }

    getState(id: string): SectorState | undefined {
        const state = this.state.sectorStates[id];
        return state ? cloneSectorState(state) : undefined;
    }

    hasArtifact(id: string): boolean {
        return this.state.artifacts.includes(id);
    }

    hasAccess(node: SectorNode): boolean {
        return !node.requiredArtifact || this.hasArtifact(node.requiredArtifact);
    }

    isDiscovered(id: string): boolean {
        return this.state.discoveredSectors.includes(id);
    }

    discover(id: string): boolean {
        const node = this.getNode(id);
        if (!node || !this.hasAccess(node)) return false;
        if (!this.state.discoveredSectors.includes(id)) this.state.discoveredSectors.push(id);
        const sector = this.state.sectorStates[id];
        if (sector && sector.visitState === 'undiscovered') sector.visitState = 'discovered';
        return true;
    }

    grantArtifact(id: string): boolean {
        if (!ARTIFACT_DEFINITIONS.some(artifact => artifact.id === id) || this.hasArtifact(id)) return false;
        this.state.artifacts.push(id);
        const artifact = ARTIFACT_DEFINITIONS.find(candidate => candidate.id === id)!;
        if (artifact.effect === 'wayfinder') this.state.permissions.push('frontier-routes');
        if (artifact.effect === 'command-capacity') this.state.permissions.push('deep-routes');
        for (const node of SECTOR_NODES) {
            if (this.hasAccess(node)) this.discover(node.id);
        }
        return true;
    }

    /**
     * Finds a route through already discovered, accessible nodes. The result
     * is intentionally small and deterministic so the map remains readable.
     */
    findRoute(targetId: string): string[] {
        if (!this.getNode(targetId) || !this.isDiscovered(targetId)) return [];
        const queue: string[][] = [[this.currentNode.id]];
        const visited = new Set<string>([this.currentNode.id]);
        while (queue.length) {
            const route = queue.shift()!;
            const last = this.getNode(route[route.length - 1]!);
            if (!last) continue;
            if (last.id === targetId) return route;
            for (const neighbor of last.connections) {
                if (visited.has(neighbor) || !this.isDiscovered(neighbor)) continue;
                visited.add(neighbor);
                queue.push([...route, neighbor]);
            }
        }
        return [];
    }

    estimateTravel(targetId: string): TravelResult {
        const target = this.getNode(targetId);
        if (!target) return { ok: false, reason: 'Unknown sector.', route: [], fuelCost: 0, etaSeconds: 0 };
        if (!this.isDiscovered(targetId)) return { ok: false, reason: 'Sector has not been discovered.', route: [], fuelCost: 0, etaSeconds: 0 };
        if (!this.hasAccess(target)) return { ok: false, reason: 'A recovered artifact is required.', route: [], fuelCost: 0, etaSeconds: 0 };
        const route = this.findRoute(targetId);
        if (!route.length) return { ok: false, reason: 'No safe route is known.', route: [], fuelCost: 0, etaSeconds: 0 };
        const hops = Math.max(0, route.length - 1);
        const dangerousHops = route
            .slice(1)
            .map(id => this.getNode(id)?.dangerTier ?? 1)
            .reduce((sum, danger) => sum + danger, 0);
        const discount = this.hasArtifact('artifact-wayfinder') ? 0.8 : 1;
        const fuelCost = Math.max(5, Math.ceil((hops * 16 + dangerousHops * 3) * discount));
        return { ok: true, route, fuelCost, etaSeconds: hops * 45 + dangerousHops * 10 };
    }

    travelTo(targetId: string, availableFuel: number): TravelResult {
        const estimate = this.estimateTravel(targetId);
        const target = this.getNode(targetId);
        if (!estimate.ok || !target) return estimate;
        if (availableFuel + 1e-6 < estimate.fuelCost) return { ...estimate, ok: false, reason: 'Not enough fuel for the expedition route.' };
        this.state.currentSectorId = targetId;
        this.discover(targetId);
        const sector = this.state.sectorStates[targetId]!;
        sector.visitState = 'visited';
        sector.lastUpdated = 0;
        for (const neighbor of target.connections) {
            const connected = this.getNode(neighbor);
            if (connected && this.hasAccess(connected)) this.discover(connected.id);
        }
        return estimate;
    }

    recordOutcome(dangerDelta = 0, routeSafetyDelta = 0, consequence?: string): void {
        const sector = this.state.sectorStates[this.currentNode.id]!;
        sector.danger = clamp(sector.danger + dangerDelta, 0, 100);
        sector.routeSafety = clamp(sector.routeSafety + routeSafetyDelta, 0, 100);
        if (consequence && !sector.activeConsequences.includes(consequence)) sector.activeConsequences.push(consequence);
    }

    tick(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0) return;
        for (const sector of Object.values(this.state.sectorStates)) {
            sector.lastUpdated += dt;
            if (sector.lastUpdated >= 60) {
                sector.lastUpdated = 0;
                sector.danger = clamp(sector.danger - 0.1, 0, 100);
                sector.routeSafety = clamp(sector.routeSafety + 0.15, 0, 100);
            }
        }
        if (this.state.recovery.active && this.state.recovery.expiresAt > 0) {
            this.state.recovery.expiresAt = Math.max(0, this.state.recovery.expiresAt - dt);
            if (this.state.recovery.expiresAt <= 0) this.state.recovery.active = false;
        }
    }

    beginRecovery(gameClock: number): RecoveryState {
        const hasProtection = this.hasArtifact('artifact-emergency-protocol');
        this.state.currentSectorId = this.findNearestSafeNode();
        this.discover(this.state.currentSectorId);
        this.state.sectorStates[this.state.currentSectorId]!.visitState = 'visited';
        this.state.recovery = {
            active: true,
            safeNodeId: this.state.currentSectorId,
            readinessPenalty: hasProtection ? 12 : 25,
            cargoLossFraction: hasProtection ? 0.1 : 0.25,
            repairDebt: hasProtection ? 12 : 25,
            expiresAt: gameClock + 180
        };
        this.recordOutcome(1.5, -8, 'recent-defeat');
        return cloneRecovery(this.state.recovery);
    }

    clearRecovery(): void {
        this.state.recovery.active = false;
        this.state.recovery.readinessPenalty = 0;
        this.state.recovery.cargoLossFraction = 0;
        this.state.recovery.repairDebt = 0;
        this.state.recovery.expiresAt = 0;
    }

    private findNearestSafeNode(): string {
        if (this.currentNode.safeHarbor) return this.currentNode.id;
        const queue = [this.currentNode.id];
        const visited = new Set(queue);
        while (queue.length) {
            const id = queue.shift()!;
            const node = this.getNode(id);
            if (node?.safeHarbor && this.isDiscovered(id)) return id;
            for (const neighbor of node?.connections ?? []) {
                if (!visited.has(neighbor) && this.isDiscovered(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        return 'sol';
    }

    private normalize(): void {
        this.state.seed = (this.state.seed || DEFAULT_EXPEDITION_SEED) >>> 0;
        if (!this.getNode(this.state.currentSectorId)) this.state.currentSectorId = 'sol';
        this.state.discoveredSectors = [...new Set(this.state.discoveredSectors.filter(id => !!this.getNode(id)))];
        this.state.artifacts = [...new Set(this.state.artifacts.filter(id => ARTIFACT_DEFINITIONS.some(artifact => artifact.id === id)))];
        if (!this.state.discoveredSectors.includes('sol')) this.state.discoveredSectors.unshift('sol');
        if (!this.state.sectorStates.sol) this.state.sectorStates.sol = buildDefaultState(this.state.seed).sectorStates.sol!;
        this.discover('alpha');
        for (const node of SECTOR_NODES) {
            if (this.hasAccess(node) && this.state.discoveredSectors.includes(node.id)) {
                this.state.sectorStates[node.id]!.visitState = this.state.sectorStates[node.id]!.visitState === 'undiscovered' ? 'discovered' : this.state.sectorStates[node.id]!.visitState;
            }
        }
    }
}

/** Stable local-system seed derived from the expedition seed and sector id. */
export function getSectorSeed(expeditionSeed: number, node: SectorNode): number {
    return hashSeed(expeditionSeed >>> 0, node.localSeed);
}
