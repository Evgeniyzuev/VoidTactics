import { CelestialBody } from '../entities/CelestialBody';
import { Fleet, type Faction } from '../entities/Fleet';
import { WarpGate } from '../entities/WarpGate';
import { Vector2 } from '../utils/Vector2';
import { Entity } from '../entities/Entity';
import { FleetGenerator } from '../tactical/FleetGenerator';
import { SECTOR_NODES, getSectorSeed, type SectorNode } from './Expedition';
import { MilitaryStation } from '../entities/MilitaryStation';

/** Shared world-space scale for the local system map. */
export const SYSTEM_SPACE_SCALE = 0.5;

const scaleSpace = (value: number) => value * SYSTEM_SPACE_SCALE;

export interface SpawnRules {
    targetFleetCount: number;
    factionWeights: { type: Faction, weight: number }[];
    strengthMin: number;
    strengthMax: number;
    spawnInterval?: number; // in seconds, for timed spawns
}

export interface SystemConfig {
    id: number;
    name: string;
    spawnRules: SpawnRules;
    entities: Entity[];
}

export class SystemManager {
    private systems: Map<number, SystemConfig> = new Map();
    private spawnTimers: Map<number, number> = new Map(); // systemId -> time since last spawn
    private threatCoefficientCursor: Map<number, number> = new Map();
    private readonly threatCoefficients = [1, 0.5, 0.25, 0.125, 2, 4, 8, 16];

    constructor() {
        this.initializeSystems();
    }

    private initializeSystems() {
        // System 1: Sol
        this.systems.set(1, {
            id: 1,
            name: 'Sol System',
            spawnRules: {
                targetFleetCount: 60,
                factionWeights: [
                    { type: 'civilian', weight: 0.30 },
                    { type: 'trader', weight: 0.017 },
                    { type: 'mercenary', weight: 0.0 },
                    { type: 'pirate', weight: 0.25 },
                    { type: 'orc', weight: 0.17 },
                    { type: 'military', weight: 0.13 },
                    { type: 'raider', weight: 0.05 }
                ],
                strengthMin: 5,
                strengthMax: 1000
            },
            entities: this.createSolEntities()
        });

        // System 2: Alpha Centauri
        this.systems.set(2, {
            id: 2,
            name: 'Alpha Centauri System',
            spawnRules: {
                targetFleetCount: 50, // Can have more fleets
                factionWeights: [
                    { type: 'raider', weight: 0.5 },
                    { type: 'mercenary', weight: 0.0 },
                    { type: 'civilian', weight: 0.137 },
                    { type: 'pirate', weight: 0.085 },
                    { type: 'orc', weight: 0.024 },
                    { type: 'military', weight: 0.104 }
                ],
                strengthMin: 100,
                strengthMax: 300,
                spawnInterval: 10 // 10 seconds
            },
            entities: this.createAlphaCentauriEntities()
        });

        // The first two systems keep their authored layouts. The remaining
        // expedition nodes use deterministic local templates so the strategic
        // graph always has a complete, playable route.
        for (const node of SECTOR_NODES) {
            if (node.systemId <= 2) continue;
            this.systems.set(node.systemId, {
                id: node.systemId,
                name: node.name,
                spawnRules: this.getProceduralSpawnRules(node),
                entities: this.createProceduralEntities(node)
            });
        }
    }

    private getProceduralSpawnRules(node: SectorNode): SpawnRules {
        const danger = node.dangerTier;
        const factionWeights: { type: Faction; weight: number }[] = node.type === 'relay'
            ? [
                { type: 'civilian', weight: 0.2 }, { type: 'trader', weight: 0.2 },
                { type: 'military', weight: 0.25 }, { type: 'pirate', weight: 0.15 },
                { type: 'raider', weight: 0.1 }, { type: 'orc', weight: 0.05 }, { type: 'mercenary', weight: 0.05 }
            ]
            : node.type === 'warzone' || node.type === 'void'
                ? [
                    { type: 'pirate', weight: 0.22 }, { type: 'raider', weight: 0.2 },
                    { type: 'orc', weight: 0.18 }, { type: 'military', weight: 0.18 },
                    { type: 'mercenary', weight: 0.1 }, { type: 'civilian', weight: 0.07 }, { type: 'trader', weight: 0.05 }
                ]
                : [
                    { type: 'civilian', weight: 0.16 }, { type: 'trader', weight: 0.1 },
                    { type: 'pirate', weight: 0.2 }, { type: 'raider', weight: 0.18 },
                    { type: 'military', weight: 0.14 }, { type: 'orc', weight: 0.12 }, { type: 'mercenary', weight: 0.1 }
                ];
        return {
            targetFleetCount: Math.max(34, 42 - danger * 2),
            factionWeights,
            strengthMin: 10 * danger,
            strengthMax: 600 * danger,
            spawnInterval: node.type === 'void' ? 7 : undefined
        };
    }

    private createProceduralEntities(node: SectorNode): Entity[] {
        const entities: Entity[] = [];
        let state = getSectorSeed(0x564f4944, node);
        const random = () => {
            state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6D2B79F5) >>> 0;
            return state / 0x100000000;
        };
        const starColors: Record<SectorNode['type'], string> = {
            home: '#FFD700', frontier: '#FFA500', relay: '#A8D8FF', anomaly: '#C084FC',
            warzone: '#FF6347', deep: '#64748B', void: '#CBD5E1'
        };
        entities.push(new CelestialBody(0, 0, 110 + node.dangerTier * 5, starColors[node.type], `${node.name} Primary`, true));

        const planetCount = 2 + (node.systemId % 3);
        for (let index = 0; index < planetCount; index++) {
            const angle = random() * Math.PI * 2;
            const distance = scaleSpace(500 + index * 520 + random() * 180);
            const radius = 20 + random() * 28;
            const colors = ['#38BDF8', '#F59E0B', '#A78BFA', '#34D399', '#F87171'];
            entities.push(new CelestialBody(
                Math.cos(angle) * distance,
                Math.sin(angle) * distance,
                radius,
                colors[index % colors.length]!,
                `${node.name} ${String.fromCharCode(65 + index)}`
            ));
        }

        for (let index = 0; index < 18 + node.dangerTier * 2; index++) {
            const angle = random() * Math.PI * 2;
            const distance = scaleSpace(1900 + random() * 2600);
            entities.push(new CelestialBody(
                Math.cos(angle) * distance,
                Math.sin(angle) * distance,
                5 + random() * 12,
                node.type === 'anomaly' ? '#C084FC' : '#64748B',
                'Asteroid'
            ));
        }

        entities.push(new CelestialBody(scaleSpace(-650), scaleSpace(700), 18, node.safeHarbor ? '#32CD32' : '#EF4444', `${node.name} Outpost`));
        node.connections.forEach((neighborId, index) => {
            const neighbor = SECTOR_NODES.find(candidate => candidate.id === neighborId);
            if (!neighbor) return;
            const angle = (index / Math.max(1, node.connections.length)) * Math.PI * 2 - Math.PI / 2;
            entities.push(new WarpGate(
                Math.cos(angle) * scaleSpace(3500),
                Math.sin(angle) * scaleSpace(3500),
                neighbor.systemId,
                `Gate to ${neighbor.name}`
            ));
        });
        return entities;
    }

    private createSolEntities(): Entity[] {
        const entities: Entity[] = [];

        // Star
        const star = new CelestialBody(0, 0, 150, '#FFD700', 'Sol', true);
        entities.push(star);

        // Planets
        const terra = new CelestialBody(scaleSpace(800), 0, 40, '#00CED1', 'Terra');
        entities.push(terra);
        // Terra's home fleet is stationary, civilian and indestructible. It
        // protects the respawn approach without adding a moving escort fleet.
        entities.push(new MilitaryStation(800, -120, 'Terra Civilian Guard', {
            attackRadius: 200,
            threatBudget: 12000
        }));


        const luna = new CelestialBody(scaleSpace(860), 0, 10, '#AAAAAA', 'Luna');
        luna.orbitParent = terra;
        luna.orbitRadius = scaleSpace(60);
        luna.orbitSpeed = 0.125;
        entities.push(luna);

        entities.push(new CelestialBody(scaleSpace(-1200), scaleSpace(400), 60, '#FF4500', 'Marsish'));

        const jupiter = new CelestialBody(scaleSpace(400), scaleSpace(-1500), 110, '#DEB887', 'Jupiter');
        entities.push(jupiter);

        // Jupiter satellites
        const moons = [
            { name: 'Io', radius: 8, color: '#F0E68C', orbitRadius: scaleSpace(160), orbitSpeed: 0.2 },
            { name: 'Europa', radius: 7, color: '#E0FFFF', orbitRadius: scaleSpace(220), orbitSpeed: 0.15 },
            { name: 'Ganymede', radius: 12, color: '#D2B48C', orbitRadius: scaleSpace(300), orbitSpeed: 0.1 }
        ];

        moons.forEach(m => {
            const moon = new CelestialBody(0, 0, m.radius, m.color, m.name);
            moon.orbitParent = jupiter;
            moon.orbitRadius = m.orbitRadius;
            moon.orbitSpeed = m.orbitSpeed;
            moon.orbitAngle = Math.random() * Math.PI * 2;
            entities.push(moon);
        });

        // Saturn
        const saturn = new CelestialBody(scaleSpace(-3000), scaleSpace(-2000), 95, '#F4A460', 'Saturn');
        saturn.rings = {
            bands: [
                { innerRadius: 110, outerRadius: 130, color: 'rgba(210, 180, 140, 0.4)' },
                { innerRadius: 132, outerRadius: 155, color: 'rgba(245, 222, 179, 0.7)' },
                { innerRadius: 157, outerRadius: 165, color: 'rgba(210, 180, 140, 0.3)' },
                { innerRadius: 167, outerRadius: 185, color: 'rgba(245, 222, 179, 0.5)' }
            ],
            angle: Math.PI / 6
        };
        entities.push(saturn);

        // Asteroid Belt
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = scaleSpace(2000 + Math.random() * 500);
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 5 + Math.random() * 15;
            entities.push(new CelestialBody(x, y, size, '#888888', 'Asteroid'));
        }

        entities.push(new CelestialBody(scaleSpace(-600), scaleSpace(-600), 20, '#FF00FF', 'Outpost Alpha'));

        // Warp Gate to Alpha Centauri
        const warpGate = new WarpGate(scaleSpace(3500), scaleSpace(2500), 2, 'Gate to Alpha Centauri');
        entities.push(warpGate);
        entities.push(new WarpGate(scaleSpace(-3500), scaleSpace(2500), 3, 'Gate to Frontier Reach'));
        entities.push(new WarpGate(scaleSpace(3500), scaleSpace(-2500), 4, 'Gate to Relay Expanse'));

        return entities;
    }

    private createAlphaCentauriEntities(): Entity[] {
        const entities: Entity[] = [];

        // Star (binary system - Alpha Centauri A)
        const starA = new CelestialBody(0, 0, 140, '#FFA500', 'Alpha Centauri A', true);
        entities.push(starA);

        // Companion star (Alpha Centauri B)
        const starB = new CelestialBody(scaleSpace(300), scaleSpace(200), 120, '#FF8C00', 'Alpha Centauri B', true);
        entities.push(starB);

        // Planets
        const proximaB = new CelestialBody(scaleSpace(600), scaleSpace(100), 35, '#8B4513', 'Proxima b');
        entities.push(proximaB);

        const centauriPrime = new CelestialBody(scaleSpace(-800), scaleSpace(-300), 45, '#4169E1', 'Centauri Prime');
        entities.push(centauriPrime);

        // Moons for Centauri Prime
        const lunaPrime = new CelestialBody(scaleSpace(-820), scaleSpace(-280), 12, '#C0C0C0', 'Luna Prime');
        lunaPrime.orbitParent = centauriPrime;
        lunaPrime.orbitRadius = scaleSpace(40);
        lunaPrime.orbitSpeed = 0.15;
        entities.push(lunaPrime);

        // Gas giant
        const centauriGas = new CelestialBody(scaleSpace(1200), scaleSpace(-800), 100, '#9370DB', 'Centauri Gas');
        entities.push(centauriGas);

        // Asteroid field
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = scaleSpace(1800 + Math.random() * 600);
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 4 + Math.random() * 12;
            entities.push(new CelestialBody(x, y, size, '#696969', 'Asteroid'));
        }

        // Mining outposts
        entities.push(new CelestialBody(scaleSpace(-400), scaleSpace(800), 18, '#FF1493', 'Mining Outpost Zeta'));
        entities.push(new CelestialBody(scaleSpace(1500), scaleSpace(600), 22, '#32CD32', 'Research Station Beta'));

        // Warp Gate back to Sol
        const warpGate = new WarpGate(scaleSpace(-3500), scaleSpace(-2500), 1, 'Gate to Sol System');
        entities.push(warpGate);
        entities.push(new WarpGate(scaleSpace(3500), scaleSpace(-2500), 3, 'Gate to Frontier Reach'));
        entities.push(new WarpGate(scaleSpace(-3500), scaleSpace(2500), 5, 'Gate to Anomaly Verge'));

        return entities;
    }

    public getSystemEntities(systemId: number): Entity[] {
        const system = this.systems.get(systemId);
        return system ? [...system.entities] : [];
    }

    public getSystemName(systemId: number): string {
        const system = this.systems.get(systemId);
        return system ? system.name : 'Unknown System';
    }

    public shouldSpawnMoreFleets(systemId: number, currentFleets: Fleet[], difficultyMultiplier: number): boolean {
        const system = this.systems.get(systemId);
        if (!system) return false;

        const rules = system.spawnRules;

        // Check if we have timed spawning (like Alpha Centauri)
        if (rules.spawnInterval) {
            const lastSpawn = this.spawnTimers.get(systemId) || 0;
            const interval = Math.max(0.1, rules.spawnInterval / Math.max(0.1, difficultyMultiplier));
            const targetCount = Math.max(1, Math.round(rules.targetFleetCount * Math.max(1, difficultyMultiplier)));
            if (currentFleets.length >= targetCount) return false;
            if (lastSpawn < interval) {
                return false; // Not time to spawn yet
            }
            // Time to spawn - reset timer and allow spawn
            this.spawnTimers.set(systemId, 0);
            return true;
        }

        // Regular population-based spawning
        const currentCount = currentFleets.length;
        const targetCount = Math.max(1, Math.round(rules.targetFleetCount * Math.max(1, difficultyMultiplier)));
        return currentCount < targetCount;
    }

    public updateSpawnTimers(systemId: number, dt: number) {
        const system = this.systems.get(systemId);
        if (!system || !system.spawnRules.spawnInterval) return;

        const currentTimer = this.spawnTimers.get(systemId) || 0;
        this.spawnTimers.set(systemId, currentTimer + dt);
    }

    public countFleetsByFaction(fleets: Fleet[]): Record<Faction, number> {
        const counts: Record<Faction, number> = {
            'player': 0,
            'civilian': 0,
            'pirate': 0,
            'orc': 0,
            'military': 0,
            'raider': 0,
            'trader': 0,
            'mercenary': 0
        };

        for (const fleet of fleets) {
            counts[fleet.faction]++;
        }

        return counts;
    }

    public canFactionSpawn(faction: Faction, fleets: Fleet[], playerLevel: number = 1): boolean {
        const totalFleets = fleets.length;
        if (totalFleets === 0) {
            return true; // Always allow spawning if no fleets exist
        }

        const counts = this.countFleetsByFaction(fleets);

        if (faction === 'military' || faction === 'mercenary') {
            const maxByLevel = Math.max(0, Math.floor(playerLevel) + 5);
            return counts[faction] < maxByLevel;
        }

        if (faction === 'civilian') {
            const civilianPercentage = (counts.civilian / totalFleets) * 100;
            return civilianPercentage <= 40;
        }

        return true;
    }

    public spawnFleetsForSystem(systemId: number, playerStrength: number, fleets: Fleet[], difficultyMultiplier: number, forcedFaction?: Faction, playerLevel: number = 1, systemDanger: number = 0): Fleet[] {
        void difficultyMultiplier;
        const system = this.systems.get(systemId);
        if (!system) return [];

        const rules = system.spawnRules;
        const danger = Math.max(0, Math.min(100, systemDanger));
        const levelAdjustedWeights = this.getLevelAdjustedWeights(rules.factionWeights, playerLevel).map(entry => ({
            ...entry,
            weight: entry.weight * (entry.type === 'pirate' || entry.type === 'raider'
                ? 1 + danger / 50
                : entry.type === 'military' ? 1 + danger / 200 : 1)
        }));

        // Pick faction based on weights with percentage restrictions
        let selectedFaction: Faction = 'civilian';
        let attempts = 0;
        const maxAttempts = 10;

        if (forcedFaction) {
            selectedFaction = forcedFaction;
        } else if (rules.factionWeights.length === 1) {
            // Only one faction available (like orcs in Alpha Centauri)
            selectedFaction = rules.factionWeights[0].type;
        } else {
            // Try to find a faction that can spawn within percentage limits
            while (attempts < maxAttempts) {
                const totalWeight = levelAdjustedWeights.reduce((sum, w) => sum + w.weight, 0);
                let rand = Math.random() * Math.max(0.0001, totalWeight);
                selectedFaction = 'civilian'; // default fallback

                for (const factionWeight of levelAdjustedWeights) {
                    if (rand < factionWeight.weight) {
                        selectedFaction = factionWeight.type;
                        break;
                    }
                    rand -= factionWeight.weight;
                }

                // Check if this faction can spawn within percentage limits
                if (this.canFactionSpawn(selectedFaction, fleets, playerLevel)) {
                    break;
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    console.log(`System ${systemId}: Max attempts reached for faction selection, skipping spawn`);
                    return []; // No valid faction found within limits
                }
            }
        }

        // If the selected faction still can't spawn (e.g., forced faction), skip
        if (!this.canFactionSpawn(selectedFaction, fleets, playerLevel)) {
            console.log(`System ${systemId}: Faction ${selectedFaction} cannot spawn due to limits`);
            return [];
        }

        // Get faction color
        const factionColors: Record<Faction, string> = {
            'player': '#00AAFF',
            'civilian': '#32CD32',
            'pirate': '#FF4444',
            'orc': '#9370DB',
            'military': '#FFFF00',
            'raider': '#888888',
            'trader': '#DAA520',
            'mercenary': '#FF8C00'
        };

        // Generate random position
        const angle = Math.random() * Math.PI * 2;
        let distance: number;
        if (systemId === 1) {
            if (selectedFaction === 'civilian' || selectedFaction === 'military' || selectedFaction === 'mercenary') {
                distance = scaleSpace(900 + Math.random() * 7600); // Inner region: 450-4250
            } else {
                distance = scaleSpace(8500 + Math.random() * 7500); // Outer region: 4250-8000
            }
        } else {
            distance = scaleSpace(1200 + Math.random() * 12000);
        }
        const startX = Math.cos(angle) * distance;
        const startY = Math.sin(angle) * distance;

        const npc = new Fleet(startX, startY, factionColors[selectedFaction], false);
        npc.faction = selectedFaction;

        // Cycle through the complete ecosystem scale so every system gets both
        // smaller and larger fleets relative to the current player fleet.
        const cursor = this.threatCoefficientCursor.get(systemId) || 0;
        const coefficient = this.threatCoefficients[cursor % this.threatCoefficients.length];
        this.threatCoefficientCursor.set(systemId, cursor + 1);
        const variance = 0.7 + Math.random() * 0.6;
        const sectorTier = SECTOR_NODES.find(node => node.systemId === systemId)?.dangerTier || 1;
        // Sector danger is the main driver of NPC power. Player threat only
        // contributes a bounded catch-up term, so a successful expedition can
        // snowball instead of fighting an endlessly rubber-banded universe.
        const sectorReferenceThreat = Math.max(10, sectorTier * 22 + systemDanger * 0.35, playerStrength * 0.35);
        const fleetBudget = Math.max(0, sectorReferenceThreat * coefficient * variance);
        npc.ships = FleetGenerator.generate(fleetBudget, selectedFaction);
        npc.supplies = npc.maxSupplies;
        npc.fuel = npc.maxFuel;
        npc.commandCapacity = Math.max(12, npc.commandUsed);
        npc.selectedShipId = npc.ships[0]?.id || null;
        npc.abilities.net.charges = Math.floor(Math.random() * 4);
        npc.clampAbilityChargesToCapacity();
        if (selectedFaction === 'military' || selectedFaction === 'mercenary') npc.doctrine.targetPriority = 'artillery';
        if (selectedFaction === 'pirate') npc.doctrine.targetPriority = 'damaged';
        if (selectedFaction === 'raider') npc.doctrine.targetPriority = 'support';

        // Give initial target to roam
        const celestialBodies = system.entities.filter(e => e instanceof CelestialBody) as CelestialBody[];
        if (celestialBodies.length > 0) {
            const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
            const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
            npc.setTarget(poi.position.add(offset));
        } else {
            npc.setTarget(new Vector2((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000));
        }

        console.log(`System ${systemId}: Spawning ${selectedFaction} fleet (×${coefficient}, variance ${variance.toFixed(2)}, threat ${npc.threatRating.toFixed(0)})`);
        return [npc];
    }

    private getLevelAdjustedWeights(baseWeights: { type: Faction, weight: number }[], playerLevel: number): { type: Faction, weight: number }[] {
        if (!playerLevel || playerLevel <= 1) return baseWeights;
        const levelFactor = Math.min(1, (playerLevel - 1) / 20);

        return baseWeights.map((entry) => {
            let weight = entry.weight;
            if (entry.type === 'civilian') {
                weight = Math.max(0.12, weight * (1 - 0.5 * levelFactor));
            } else if (entry.type === 'military') {
                weight = Math.max(0.1, weight * (1 - 0.5 * levelFactor));
            } else if (entry.type === 'pirate') {
                weight = Math.min(0.35, weight * (1 + 0.35 * levelFactor));
            } else if (entry.type === 'orc') {
                weight = Math.min(0.30, weight * (1 + 0.30 * levelFactor));
            }
            return { type: entry.type, weight };
        });
    }

    public getTargetFleetCount(systemId: number): number {
        const system = this.systems.get(systemId);
        return system ? system.spawnRules.targetFleetCount : 35;
    }
}
