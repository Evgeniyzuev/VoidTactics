import { CelestialBody } from '../entities/CelestialBody';
import { Fleet, type Faction } from '../entities/Fleet';
import { WarpGate } from '../entities/WarpGate';
import { Vector2 } from '../utils/Vector2';
import { Entity } from '../entities/Entity';

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
                    { type: 'trader', weight: 0.05 },
                    { type: 'mercenary', weight: 0.05 },
                    { type: 'pirate', weight: 0.25 },
                    { type: 'orc', weight: 0.20 },
                    { type: 'military', weight: 0.10 },
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
                    { type: 'mercenary', weight: 0.15 },
                    { type: 'civilian', weight: 0.137 },
                    { type: 'pirate', weight: 0.085 },
                    { type: 'orc', weight: 0.054 },
                    { type: 'military', weight: 0.074 }
                ],
                strengthMin: 100,
                strengthMax: 300,
                spawnInterval: 10 // 10 seconds
            },
            entities: this.createAlphaCentauriEntities()
        });
    }

    private createSolEntities(): Entity[] {
        const entities: Entity[] = [];

        // Star
        const star = new CelestialBody(0, 0, 150, '#FFD700', 'Sol', true);
        entities.push(star);

        // Planets
        const terra = new CelestialBody(800, 0, 40, '#00CED1', 'Terra');
        entities.push(terra);

        const luna = new CelestialBody(860, 0, 10, '#AAAAAA', 'Luna');
        luna.orbitParent = terra;
        luna.orbitRadius = 60;
        luna.orbitSpeed = 0.125;
        entities.push(luna);

        entities.push(new CelestialBody(-1200, 400, 60, '#FF4500', 'Marsish'));

        const jupiter = new CelestialBody(400, -1500, 110, '#DEB887', 'Jupiter');
        entities.push(jupiter);

        // Jupiter satellites
        const moons = [
            { name: 'Io', radius: 8, color: '#F0E68C', orbitRadius: 160, orbitSpeed: 0.2 },
            { name: 'Europa', radius: 7, color: '#E0FFFF', orbitRadius: 220, orbitSpeed: 0.15 },
            { name: 'Ganymede', radius: 12, color: '#D2B48C', orbitRadius: 300, orbitSpeed: 0.1 }
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
        const saturn = new CelestialBody(-3000, -2000, 95, '#F4A460', 'Saturn');
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
            const dist = 2000 + Math.random() * 500;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 5 + Math.random() * 15;
            entities.push(new CelestialBody(x, y, size, '#888888', 'Asteroid'));
        }

        entities.push(new CelestialBody(-600, -600, 20, '#FF00FF', 'Outpost Alpha'));

        // Warp Gate to Alpha Centauri
        const warpGate = new WarpGate(3500, 2500, 2, 'Gate to Alpha Centauri');
        entities.push(warpGate);

        return entities;
    }

    private createAlphaCentauriEntities(): Entity[] {
        const entities: Entity[] = [];

        // Star (binary system - Alpha Centauri A)
        const starA = new CelestialBody(0, 0, 140, '#FFA500', 'Alpha Centauri A', true);
        entities.push(starA);

        // Companion star (Alpha Centauri B)
        const starB = new CelestialBody(300, 200, 120, '#FF8C00', 'Alpha Centauri B', true);
        entities.push(starB);

        // Planets
        const proximaB = new CelestialBody(600, 100, 35, '#8B4513', 'Proxima b');
        entities.push(proximaB);

        const centauriPrime = new CelestialBody(-800, -300, 45, '#4169E1', 'Centauri Prime');
        entities.push(centauriPrime);

        // Moons for Centauri Prime
        const lunaPrime = new CelestialBody(-820, -280, 12, '#C0C0C0', 'Luna Prime');
        lunaPrime.orbitParent = centauriPrime;
        lunaPrime.orbitRadius = 40;
        lunaPrime.orbitSpeed = 0.15;
        entities.push(lunaPrime);

        // Gas giant
        const centauriGas = new CelestialBody(1200, -800, 100, '#9370DB', 'Centauri Gas');
        entities.push(centauriGas);

        // Asteroid field
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 1800 + Math.random() * 600;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 4 + Math.random() * 12;
            entities.push(new CelestialBody(x, y, size, '#696969', 'Asteroid'));
        }

        // Mining outposts
        entities.push(new CelestialBody(-400, 800, 18, '#FF1493', 'Mining Outpost Zeta'));
        entities.push(new CelestialBody(1500, 600, 22, '#32CD32', 'Research Station Beta'));

        // Warp Gate back to Sol
        const warpGate = new WarpGate(-3500, -2500, 1, 'Gate to Sol System');
        entities.push(warpGate);

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

    public shouldSpawnMoreFleets(systemId: number, currentFleets: Fleet[]): boolean {
        const system = this.systems.get(systemId);
        if (!system) return false;

        const rules = system.spawnRules;

        // Check if we have timed spawning (like Alpha Centauri)
        if (rules.spawnInterval) {
            const lastSpawn = this.spawnTimers.get(systemId) || 0;
            if (lastSpawn < rules.spawnInterval) {
                return false; // Not time to spawn yet
            }
            // Time to spawn - reset timer and allow spawn
            this.spawnTimers.set(systemId, 0);
            return true;
        }

        // Regular population-based spawning
        const currentCount = currentFleets.length;
        return currentCount < rules.targetFleetCount;
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

    public canFactionSpawn(faction: Faction, fleets: Fleet[]): boolean {
        // Only apply percentage restrictions to civilian and military
        if (faction !== 'civilian' && faction !== 'military') {
            return true;
        }

        const totalFleets = fleets.length;
        if (totalFleets === 0) {
            return true; // Always allow spawning if no fleets exist
        }

        const counts = this.countFleetsByFaction(fleets);

        if (faction === 'civilian') {
            const civilianPercentage = (counts.civilian / totalFleets) * 100;
            return civilianPercentage <= 40;
        } else if (faction === 'military') {
            const militaryPercentage = (counts.military / totalFleets) * 100;
            return militaryPercentage <= 20;
        }

        return true;
    }

    public spawnFleetsForSystem(systemId: number, playerStrength: number, fleets: Fleet[], forcedFaction?: Faction): Fleet[] {
        const system = this.systems.get(systemId);
        if (!system) return [];

        const rules = system.spawnRules;

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
                let rand = Math.random();
                selectedFaction = 'civilian'; // default fallback

                for (const factionWeight of rules.factionWeights) {
                    if (rand < factionWeight.weight) {
                        selectedFaction = factionWeight.type;
                        break;
                    }
                    rand -= factionWeight.weight;
                }

                // Check if this faction can spawn within percentage limits
                if (this.canFactionSpawn(selectedFaction, fleets)) {
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
        if (!this.canFactionSpawn(selectedFaction, fleets)) {
            console.log(`System ${systemId}: Faction ${selectedFaction} cannot spawn due to percentage limits`);
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
            if (selectedFaction === 'civilian' || selectedFaction === 'military') {
                distance = 500 + Math.random() * 3500; // Inner region: 500-4000
            } else {
                distance = 4000 + Math.random() * 4000; // Outer region: 4000-8000
            }
        } else {
            distance = 1000 + Math.random() * 3000;
        }
        const startX = Math.cos(angle) * distance;
        const startY = Math.sin(angle) * distance;

        const npc = new Fleet(startX, startY, factionColors[selectedFaction], false);
        npc.faction = selectedFaction;

        // Set strength based on system rules
        if (rules.strengthMin === rules.strengthMax) {
            // Fixed strength range
            npc.strength = rules.strengthMin + Math.random() * (rules.strengthMax - rules.strengthMin);
        } else {
            // Dynamic strength based on player (original logic)
            const coefficients = [0.5, 1, 2, 4, 8];
            const coeff = coefficients[Math.floor(Math.random() * coefficients.length)];

            let baseS = playerStrength * coeff;

            // Apply variance and clamp to system limits
            const variance = 0.6 + Math.random() * 0.7;
            let finalStrength = Math.max(rules.strengthMin, Math.min(rules.strengthMax, Math.round(baseS * variance)));

            // Traders are bulkier
            if (selectedFaction === 'trader') finalStrength *= 2.5;

            npc.strength = finalStrength;
        }

        // Give initial target to roam
        const celestialBodies = system.entities.filter(e => e instanceof CelestialBody) as CelestialBody[];
        if (celestialBodies.length > 0) {
            const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
            const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
            npc.setTarget(poi.position.add(offset));
        } else {
            npc.setTarget(new Vector2((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000));
        }

        console.log(`System ${systemId}: Spawning ${selectedFaction} fleet (strength: ${npc.strength})`);
        return [npc];
    }

    public getTargetFleetCount(systemId: number): number {
        const system = this.systems.get(systemId);
        return system ? system.spawnRules.targetFleetCount : 35;
    }
}
