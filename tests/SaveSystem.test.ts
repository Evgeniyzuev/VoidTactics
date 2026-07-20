import { beforeEach, describe, expect, it } from 'vitest';
import {
    SaveSystem,
    type EventFleetSnapshot,
    type GameSaveDataV4,
    type WorldEventRuntimeSnapshot
} from '../src/core/SaveSystem';
import { SignalDirector } from '../src/core/SignalDirector';
import { Fleet } from '../src/entities/Fleet';
import { Ship, type ShipSnapshot } from '../src/tactical/Ship';
import { HULLS, MODULES } from '../src/tactical/ShipDefinitions';
import { Vector2 } from '../src/utils/Vector2';

class LocalStorageMock implements Storage {
    private values = new Map<string, string>();

    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const storage = new LocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
});

function makeSnapshot(
    id: string,
    hullId: string,
    overrides: Partial<ShipSnapshot> = {}
): ShipSnapshot {
    const definition = HULLS[hullId]!;
    return {
        id,
        loadout: { hullId, weaponIds: ['pulse'], moduleIds: [] },
        hull: definition.hull,
        armor: definition.armor,
        shield: definition.shield,
        energy: definition.energyCapacity,
        order: { type: 'escort', issuedAt: 0 },
        statScale: 1,
        state: 'active',
        ammunition: definition.ammunition,
        crew: definition.crew,
        ...overrides
    };
}

describe('SaveSystem v4', () => {
    beforeEach(() => storage.clear());

    it('migrates a legacy save without ship snapshots into one repaired flagship with fuel', () => {
        storage.setItem('vt_save_v2', JSON.stringify({
            player: { x: 10, y: -20, vx: 0, vy: 0, color: '#33ccff', strength: 10, maxStrength: 42, faction: 'player' },
            npcs: [],
            lastSaveTime: 123
        }));

        const migrated = SaveSystem.load();

        expect(migrated?.version).toBe(4);
        expect(migrated?.playerShips).toHaveLength(1);
        expect(migrated?.playerShips[0]?.variantName).toBe('Legacy Flagship');
        expect(migrated?.resources.maxFuel).toBeGreaterThan(0);
        expect(migrated?.resources.fuel).toBe(migrated?.resources.maxFuel);
    });

    it('round-trips ships, resources, progression, charges, and the signal director snapshot', () => {
        const player = new Fleet(125, -275, '#19bfff', true);
        const flagship = new Ship({
            hullId: 'command',
            weaponIds: ['pulse', 'missile'],
            moduleIds: ['commandLink']
        }, 'ship-7001');
        flagship.setStatScale(1.25);
        flagship.hull -= 17;
        flagship.armor -= 9;
        flagship.shield -= 13;
        flagship.energy -= 21;
        flagship.order = { type: 'attack', targetShipId: 'ship-7002', issuedAt: 42 };
        flagship.variantName = 'Persistence';
        flagship.purchasePrice = 9_500;
        flagship.ammunition -= 11;

        const support = new Ship({
            hullId: 'tender',
            weaponIds: ['jammer'],
            moduleIds: ['repairDrones', 'electronicSuite']
        }, 'ship-7002');
        support.setStatScale(0.8);
        support.hull -= 4;
        support.energy -= 8;
        support.order = { type: 'repair', issuedAt: 44 };

        player.ships = [flagship, support];
        player.selectedShipId = support.id;
        player.position = new Vector2(125, -275);
        player.velocity = new Vector2(12, -4);
        player.commandCapacity = 13;
        player.supplies = 18.5;
        player.maxSupplies = 80;
        player.fuel = 143.25;
        player.setReadiness(63.5);
        player.money = 12_345;
        player.doctrine = { targetPriority: 'support', preferredRange: 'long', aggression: 'cautious' };
        player.skillPoints = 7;
        player.skills = {
            leadership: 3, logistics: 4, engineering: 2, sensors: 5,
            navigation: 3, tactics: 4, size: 2, tech: 5
        };
        player.totalMoneyEarned = 54_321;
        player.level = 8;
        player.levelThreshold = 40_000;
        player.nextLevelThreshold = 60_000;
        player.abilities.afterburner.charges = 2;
        player.abilities.cloak.charges = 3;
        player.abilities.bubble.charges = 4;
        player.abilities.mine.charges = 5;
        player.abilities.medkit.charges = 6;
        player.abilities.fire.charges = 7;
        player.abilities.shield.charges = 8;

        const npc = new Fleet(-400, 900, '#ff5353', false);
        npc.faction = 'pirate';
        npc.strength = 77;

        const signalDirector = new SignalDirector({ seed: 0xA11CE, systemDanger: 12 });
        const signalResult = signalDirector.update(signalDirector.secondsUntilNextSignal, {
            playerPosition: player.position,
            playerSensorRange: 1_500,
            playerThreat: player.threatRating,
            systemBounds: { center: { x: 0, y: 0 }, radius: 8_000 }
        });
        signalDirector.markDiscovered(signalResult.spawned[0]!.id);
        const expectedSignals = signalDirector.snapshot();
        const expectedShips = player.ships.map(ship => ship.snapshot());

        SaveSystem.save(player, [npc], {
            currentSystemId: 'alpha-centauri',
            signalDirector: expectedSignals
        });
        const loaded = SaveSystem.load();

        expect(loaded).not.toBeNull();
        expect(loaded).toMatchObject({
            version: 4,
            commandCapacity: 13,
            money: 12_345,
            skillPoints: 7,
            currentSystemId: 'alpha-centauri'
        });
        expect(loaded!.playerShips).toEqual(expectedShips);
        expect(loaded!.resources).toEqual({
            fuel: 143.25,
            maxFuel: player.maxFuel,
            supplies: 18.5,
            maxSupplies: 80,
            readiness: 63.5
        });
        expect(loaded!.skills).toEqual(player.skills);
        expect(loaded!.doctrine).toEqual(player.doctrine);
        expect(loaded!.progress).toEqual({
            totalMoneyEarned: 54_321,
            level: 8,
            levelThreshold: 40_000,
            nextLevelThreshold: 60_000
        });
        expect(loaded!.abilityCharges).toEqual({
            afterburner: 2, cloak: 3, bubble: 4, mine: 5,
            medkit: 6, fire: 7, shield: 8
        });
        expect(loaded!.signalDirector).toEqual(expectedSignals);

        const restored = new Fleet(0, 0, '#fff', true);
        SaveSystem.restoreFleet(restored, loaded!);
        expect(restored.ships.map(ship => ship.snapshot())).toEqual(expectedShips);
        expect(restored.position).toEqual(new Vector2(125, -275));
        expect(restored.velocity).toEqual(new Vector2(12, -4));
        expect(restored.fuel).toBe(143.25);
        expect(restored.supplies).toBe(18.5);
        expect(restored.operationalReadiness).toBe(63.5);
        expect(restored.money).toBe(12_345);
        expect(restored.skills).toEqual(player.skills);
        expect(restored.abilities.shield.charges).toBe(8);
    });

    it('serializes the exact runtime shape of active event fleets and tolerates an absent container', () => {
        const player = new Fleet(0, 0, '#19bfff', true);
        const director = new SignalDirector({ seed: 0xE7E17, systemDanger: 9 });
        const spawned = director.update(director.secondsUntilNextSignal, {
            playerPosition: player.position,
            playerSensorRange: 1_200,
            playerThreat: player.threatRating,
            systemBounds: { center: { x: 0, y: 0 }, radius: 8_000 }
        }).spawned[0]!;
        const pendingChoice = {
            kind: 'combat' as const,
            choiceId: 'assist',
            victoryOutcome: 'transport-saved',
            defeatOutcome: 'transport-lost',
            victoryDangerDelta: -2,
            defeatDangerDelta: 2
        };
        director.markEngaged(spawned.id, true);
        director.setPendingChoice(spawned.id, pendingChoice);

        const charges = {
            afterburner: 1, cloak: 2, bubble: 3, mine: 4,
            medkit: 5, fire: 6, shield: 7
        };
        const transport: EventFleetSnapshot = {
            faction: 'trader',
            color: '#daa520',
            role: 'transport',
            position: { x: 145, y: -220 },
            velocity: { x: 18, y: -3 },
            ships: [makeSnapshot('ship-8801', 'tender', {
                hull: HULLS.tender!.hull - 24,
                shield: 0,
                energy: 37,
                ammunition: 41
            })],
            fuel: 53,
            supplies: 7.5,
            maxSupplies: 30,
            readiness: 48,
            commandCapacity: 6,
            abilityCharges: charges
        };
        const raider: EventFleetSnapshot = {
            faction: 'pirate',
            color: '#ff4444',
            role: 'raider',
            position: { x: 330, y: -175 },
            velocity: { x: -12, y: 6 },
            ships: [makeSnapshot('ship-8802', 'lance', {
                order: { type: 'attack', targetShipId: 'ship-8801', issuedAt: 19 }
            })],
            fuel: 61,
            supplies: 3,
            maxSupplies: 20,
            readiness: 82,
            commandCapacity: 5,
            abilityCharges: { ...charges, cloak: 1 }
        };
        const runtimeEvents: WorldEventRuntimeSnapshot[] = [{
            directorId: spawned.id,
            phase: 'engaged',
            phaseAge: 23.75,
            scenarioSpawned: true,
            reinforcementsSpawned: false,
            playerInvolved: true,
            pendingChoice,
            transport,
            raiders: [raider],
            responders: []
        }];

        SaveSystem.save(player, [], {
            currentSystemId: 'sol',
            signalDirector: director.snapshot(),
            worldEvents: runtimeEvents
        });

        const serialized = JSON.parse(storage.getItem('vt_save_v4')!) as GameSaveDataV4;
        expect(serialized.worldEvents).toEqual(runtimeEvents);
        expect(SaveSystem.load()!.worldEvents).toEqual(runtimeEvents);

        delete serialized.worldEvents;
        storage.setItem('vt_save_v4', JSON.stringify(serialized));
        expect(SaveSystem.load()!.worldEvents).toBeUndefined();
    });

    it('migrates v3 ships, fuel, Energy, progression, skills, and charges into deterministic v4 state', () => {
        const commandScale = 1.5;
        const commandMaxEnergy = (
            HULLS.command!.energyCapacity + MODULES.electronicSuite!.energyCapacityModifier!
        ) * commandScale;
        const commandFlux = commandMaxEnergy * 1.5 * 0.25;
        const scoutScale = 2;
        const scoutMaxEnergy = HULLS.specter!.energyCapacity * scoutScale;

        const ships: ShipSnapshot[] = [
            makeSnapshot('ship-8101', 'command', {
                loadout: {
                    hullId: 'command',
                    weaponIds: ['pulse', 'missile'],
                    moduleIds: ['electronicSuite']
                },
                statScale: commandScale,
                energy: 1,
                flux: commandFlux,
                fuel: 50
            }),
            makeSnapshot('ship-8102', 'specter', {
                loadout: { hullId: 'specter', weaponIds: ['jammer'], moduleIds: [] },
                statScale: scoutScale,
                energy: scoutMaxEnergy,
                flux: scoutMaxEnergy * 1.5,
                fuel: 999
            })
        ];
        const legacy = {
            version: 3,
            player: { x: 50, y: -75, vx: 3, vy: 4, color: '#33ccff', strength: 99, faction: 'player' },
            npcs: [{ x: 400, y: 500, vx: 0, vy: 0, color: '#f44', strength: 80, faction: 'pirate' }],
            playerShips: ships,
            commandCapacity: 9,
            supplies: 16,
            maxSupplies: 45,
            money: 7_777,
            doctrine: { targetPriority: 'artillery', preferredRange: 'long', aggression: 'aggressive' },
            skillPoints: 6,
            skills: {
                leadership: 2, logistics: 3, engineering: 4, sensors: 5,
                navigation: 2, tactics: 1, size: 3, tech: 4
            },
            progress: {
                totalMoneyEarned: 22_000,
                level: 6,
                levelThreshold: 18_000,
                nextLevelThreshold: 27_000
            },
            abilityCharges: {
                afterburner: 1, cloak: 2, bubble: 3, mine: 4,
                medkit: 5, fire: 6, shield: 7
            },
            lastSaveTime: 1_723_456_789_012
        };
        storage.setItem('vt_save_v3', JSON.stringify(legacy));

        const migrated = SaveSystem.load();
        const repeated = SaveSystem.load();

        expect(migrated).not.toBeNull();
        expect(migrated!.version).toBe(4);
        expect(migrated!.money).toBe(7_777);
        expect(migrated!.skills).toEqual(legacy.skills);
        expect(migrated!.progress).toEqual(legacy.progress);
        expect(migrated!.abilityCharges).toEqual(legacy.abilityCharges);
        expect(migrated!.playerShips.map(ship => ship.id)).toEqual(['ship-8101', 'ship-8102']);
        expect(migrated!.playerShips[0]!.energy).toBeCloseTo(commandMaxEnergy * 0.75);
        expect(migrated!.playerShips[1]!.energy).toBe(0);
        expect(migrated!.playerShips[0]!.flux).toBeUndefined();
        expect(migrated!.playerShips[1]!.flux).toBeUndefined();
        expect(migrated!.playerShips[0]!.fuel).toBeUndefined();
        expect(migrated!.resources).toEqual({
            fuel: 50 + HULLS.specter!.fuelCapacity * scoutScale,
            maxFuel: HULLS.command!.fuelCapacity * commandScale + HULLS.specter!.fuelCapacity * scoutScale,
            supplies: 16,
            maxSupplies: 45,
            readiness: 100
        });
        expect(migrated!.currentSystemId).toBe('sol');
        expect(migrated!.signalDirector).toMatchObject({
            version: 1,
            elapsedTime: 0,
            spawnSequence: 0,
            systemDanger: 0,
            events: []
        });
        expect(migrated!.signalDirector!.seed).toBeTypeOf('number');
        expect(migrated!.worldEvents).toBeUndefined();
        expect(repeated!.signalDirector).toEqual(migrated!.signalDirector);
    });

    it('advances the generated ship id after restoring numeric ship-* ids', () => {
        const restoredFleet = new Fleet(0, 0, '#0cf', true);
        const highId = 9_000_000;
        SaveSystem.restoreShips(restoredFleet, [makeSnapshot(`ship-${highId}`, 'lance')]);

        const nextShip = new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] });
        const match = /^ship-(\d+)$/.exec(nextShip.id);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBeGreaterThan(highId);
        expect(nextShip.id).not.toBe(restoredFleet.ships[0]!.id);
    });
});
