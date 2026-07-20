import { Fleet, type Faction, type FleetSkillId } from '../entities/Fleet';
import type { WorldEventPendingChoice, WorldEventPhase } from '../entities/WorldEvent';
import { Ship, type ShipSnapshot } from '../tactical/Ship';
import { HULLS, MODULES, type FleetDoctrine } from '../tactical/ShipDefinitions';
import { SignalDirector, type SignalDirectorSnapshot } from './SignalDirector';
import { Vector2 } from '../utils/Vector2';

export interface SavedFleetState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    strength: number;
    faction: string;
}

export interface PlayerProgressSave {
    totalMoneyEarned: number;
    level: number;
    levelThreshold: number;
    nextLevelThreshold: number;
}

export interface AbilityChargesSave {
    afterburner: number;
    cloak: number;
    bubble: number;
    mine: number;
    medkit: number;
    fire: number;
    shield: number;
}

export interface FleetResourcesSave {
    fuel: number;
    maxFuel: number;
    supplies: number;
    maxSupplies: number;
    readiness: number;
}

export type EventFleetRole = 'transport' | 'raider' | 'responder';

export interface EventFleetSnapshot {
    faction: Faction;
    color: string;
    role: EventFleetRole;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    ships: ShipSnapshot[];
    fuel: number;
    supplies: number;
    maxSupplies: number;
    readiness: number;
    commandCapacity: number;
    abilityCharges: AbilityChargesSave;
}

export interface WorldEventRuntimeSnapshot {
    directorId: string;
    phase: WorldEventPhase;
    phaseAge: number;
    scenarioSpawned: boolean;
    reinforcementsSpawned: boolean;
    playerInvolved: boolean;
    pendingChoice: WorldEventPendingChoice | null;
    transport: EventFleetSnapshot | null;
    raiders: EventFleetSnapshot[];
    responders: EventFleetSnapshot[];
}

export interface SaveWorldState {
    currentSystemId?: string;
    signalDirector?: SignalDirectorSnapshot;
    worldEvents?: WorldEventRuntimeSnapshot[];
}

export interface GameSaveDataV4 {
    version: 4;
    player: SavedFleetState;
    npcs: SavedFleetState[];
    playerShips: ShipSnapshot[];
    commandCapacity: number;
    resources: FleetResourcesSave;
    money: number;
    doctrine: FleetDoctrine;
    skillPoints: number;
    skills: Record<FleetSkillId, number>;
    progress?: PlayerProgressSave;
    abilityCharges?: AbilityChargesSave;
    currentSystemId: string;
    systemId: string;
    worldSeed: number;
    rngState: number;
    systemDanger: number;
    signalDirector?: SignalDirectorSnapshot;
    worldEvents?: WorldEventRuntimeSnapshot[];
    lastSaveTime: number;
}

/** Backwards-compatible name used by the current Game integration. */
export type GameSaveData = GameSaveDataV4;

export class SaveSystem {
    static save(
        player: Fleet,
        npcs: Fleet[],
        world: SaveWorldState = {}
    ) {
        const serializeFleet = (fleet: Fleet): SavedFleetState => ({
            x: fleet.position.x, y: fleet.position.y, vx: fleet.velocity.x, vy: fleet.velocity.y,
            color: fleet.color, strength: fleet.strength, faction: fleet.faction
        });
        const signalSnapshot = world.signalDirector;
        const systemId = world.currentSystemId || 'sol';
        const data: GameSaveDataV4 = {
            version: 4,
            player: serializeFleet(player),
            npcs: npcs.map(serializeFleet),
            playerShips: player.ships.map(ship => ship.snapshot()),
            commandCapacity: player.commandCapacity,
            resources: {
                fuel: player.fuel,
                maxFuel: player.maxFuel,
                supplies: player.supplies,
                maxSupplies: player.maxSupplies,
                readiness: player.operationalReadiness
            },
            money: player.money,
            doctrine: player.doctrine,
            skillPoints: player.skillPoints,
            skills: player.skills,
            progress: {
                totalMoneyEarned: player.totalMoneyEarned,
                level: player.level,
                levelThreshold: player.levelThreshold,
                nextLevelThreshold: player.nextLevelThreshold
            },
            abilityCharges: {
                afterburner: player.abilities.afterburner.charges,
                cloak: player.abilities.cloak.charges,
                bubble: player.abilities.bubble.charges,
                mine: player.abilities.mine.charges,
                medkit: player.abilities.medkit.charges,
                fire: player.abilities.fire.charges,
                shield: player.abilities.shield.charges
            },
            currentSystemId: systemId,
            systemId,
            worldSeed: signalSnapshot?.seed ?? 0,
            rngState: signalSnapshot?.rngState ?? 0,
            systemDanger: signalSnapshot?.systemDanger ?? 0,
            signalDirector: signalSnapshot,
            worldEvents: world.worldEvents,
            lastSaveTime: Date.now()
        };
        localStorage.setItem('vt_save_v4', JSON.stringify(data));
    }

    static load(): GameSaveData | null {
        try {
            const v4Raw = localStorage.getItem('vt_save_v4');
            if (v4Raw) {
                const data = JSON.parse(v4Raw) as GameSaveData;
                if (data.version === 4) {
                    data.systemId ||= data.currentSystemId || 'sol';
                    data.currentSystemId ||= data.systemId;
                    data.worldSeed ??= data.signalDirector?.seed ?? 0;
                    data.rngState ??= data.signalDirector?.rngState ?? 0;
                    data.systemDanger ??= data.signalDirector?.systemDanger ?? 0;
                    return data;
                }
            }
            const v3Raw = localStorage.getItem('vt_save_v3');
            if (v3Raw) return this.migrateV3(JSON.parse(v3Raw) as LegacyV3Save);
            const v2Raw = localStorage.getItem('vt_save_v2');
            if (!v2Raw) return null;
            const old = JSON.parse(v2Raw) as LegacyV2Save;
            return this.migrateV3({
                version: 3, player: old.player, npcs: old.npcs, playerShips: old.playerShips || [],
                commandCapacity: 4, supplies: 30, maxSupplies: 30,
                money: 0,
                doctrine: { targetPriority: 'nearest', preferredRange: 'balanced', aggression: 'balanced' },
                skillPoints: 3,
                skills: this.defaultSkills(),
                lastSaveTime: old.lastSaveTime
            });
        } catch { return null; }
    }

    static restoreShips(fleet: Fleet, snapshots: ShipSnapshot[]) {
        if (!snapshots?.length) return;
        fleet.ships = snapshots.map(snapshot => Ship.fromSnapshot(snapshot));
        fleet.selectedShipId = fleet.ships.find(ship => ship.role === 'flagship')?.id || fleet.ships[0]?.id || null;
    }

    static restoreFleet(fleet: Fleet, data: GameSaveData) {
        this.restoreShips(fleet, data.playerShips);
        fleet.commandCapacity = data.commandCapacity;
        fleet.supplies = Math.max(0, data.resources.supplies);
        fleet.maxSupplies = Math.max(1, data.resources.maxSupplies);
        fleet.fuel = Math.max(0, Math.min(fleet.maxFuel, data.resources.fuel));
        fleet.setReadiness(data.resources.readiness);
        if (typeof data.money === 'number') fleet.money = data.money;
        fleet.doctrine = data.doctrine;
        fleet.skillPoints = data.skillPoints || 0;
        fleet.skills = { ...fleet.skills, ...(data.skills || {}) };
        if (data.player) {
            fleet.position = new Vector2(data.player.x, data.player.y);
            fleet.velocity = new Vector2(data.player.vx, data.player.vy);
            fleet.color = data.player.color;
        }
        if (data.progress) {
            fleet.totalMoneyEarned = data.progress.totalMoneyEarned;
            fleet.level = data.progress.level;
            fleet.levelThreshold = data.progress.levelThreshold;
            fleet.nextLevelThreshold = data.progress.nextLevelThreshold;
        }
        if (data.abilityCharges) {
            fleet.abilities.afterburner.charges = data.abilityCharges.afterburner;
            fleet.abilities.cloak.charges = data.abilityCharges.cloak;
            fleet.abilities.bubble.charges = data.abilityCharges.bubble;
            fleet.abilities.mine.charges = data.abilityCharges.mine;
            fleet.abilities.medkit.charges = data.abilityCharges.medkit;
            fleet.abilities.fire.charges = data.abilityCharges.fire;
            fleet.abilities.shield.charges = data.abilityCharges.shield;
        }
    }

    static clear() {
        localStorage.removeItem('vt_fleet_size');
        localStorage.removeItem('vt_autosave_fleet_size');
        localStorage.removeItem('vt_fleet_progress');
        localStorage.removeItem('vt_autosave_fleet_progress');
        localStorage.removeItem('vt_fleet_ability_charges');
        localStorage.removeItem('vt_autosave_fleet_ability_charges');
        localStorage.removeItem('vt_save_v2');
        localStorage.removeItem('vt_save_v3');
        localStorage.removeItem('vt_save_v4');
    }

    static saveFleetSize(size: number) {
        localStorage.setItem('vt_fleet_size', size.toString());
    }

    static loadFleetSize(): number | null {
        const val = localStorage.getItem('vt_fleet_size');
        return val ? parseInt(val, 10) : null;
    }

    static saveFleetProgress(progress: PlayerProgressSave) {
        localStorage.setItem('vt_fleet_progress', JSON.stringify(progress));
    }

    static loadFleetProgress(): PlayerProgressSave | null {
        const val = localStorage.getItem('vt_fleet_progress');
        return val ? (JSON.parse(val) as PlayerProgressSave) : null;
    }

    static saveFleetAbilityCharges(charges: AbilityChargesSave) {
        localStorage.setItem('vt_fleet_ability_charges', JSON.stringify(charges));
    }

    static loadFleetAbilityCharges(): AbilityChargesSave | null {
        const val = localStorage.getItem('vt_fleet_ability_charges');
        return val ? (JSON.parse(val) as AbilityChargesSave) : null;
    }

    static saveAutosaveFleetSize(size: number) {
        localStorage.setItem('vt_autosave_fleet_size', size.toString());
    }

    static loadAutosaveFleetSize(): number | null {
        const val = localStorage.getItem('vt_autosave_fleet_size');
        return val ? parseInt(val, 10) : null;
    }

    static saveAutosaveFleetProgress(progress: PlayerProgressSave) {
        localStorage.setItem('vt_autosave_fleet_progress', JSON.stringify(progress));
    }

    static loadAutosaveFleetProgress(): PlayerProgressSave | null {
        const val = localStorage.getItem('vt_autosave_fleet_progress');
        return val ? (JSON.parse(val) as PlayerProgressSave) : null;
    }

    static saveAutosaveFleetAbilityCharges(charges: AbilityChargesSave) {
        localStorage.setItem('vt_autosave_fleet_ability_charges', JSON.stringify(charges));
    }

    static loadAutosaveFleetAbilityCharges(): AbilityChargesSave | null {
        const val = localStorage.getItem('vt_autosave_fleet_ability_charges');
        return val ? (JSON.parse(val) as AbilityChargesSave) : null;
    }

    static clearAutosave() {
        localStorage.removeItem('vt_autosave_fleet_size');
        localStorage.removeItem('vt_autosave_fleet_progress');
        localStorage.removeItem('vt_autosave_fleet_ability_charges');
    }

    private static migrateV3(old: LegacyV3Save): GameSaveData {
        const originalShips = old.playerShips || [];
        const playerShips = originalShips.map(snapshot => this.migrateShipSnapshot(snapshot));
        const maxFuel = originalShips.reduce((sum, snapshot) => sum + this.snapshotFuelCapacity(snapshot), 0);
        const fuel = originalShips.reduce((sum, snapshot) => (
            sum + Math.max(0, Math.min(this.snapshotFuelCapacity(snapshot), snapshot.fuel ?? this.snapshotFuelCapacity(snapshot)))
        ), 0);
        const signalDirector = new SignalDirector({ seed: this.legacyWorldSeed(old) }).snapshot();
        return {
            version: 4,
            player: old.player,
            npcs: old.npcs || [],
            playerShips,
            commandCapacity: old.commandCapacity || 4,
            resources: {
                fuel: Math.min(maxFuel, fuel),
                maxFuel,
                supplies: Math.max(0, old.supplies ?? 30),
                maxSupplies: Math.max(1, old.maxSupplies ?? 30),
                readiness: 100
            },
            money: old.money || 0,
            doctrine: old.doctrine || { targetPriority: 'nearest', preferredRange: 'balanced', aggression: 'balanced' },
            skillPoints: old.skillPoints || 0,
            skills: { ...this.defaultSkills(), ...(old.skills || {}) },
            progress: old.progress,
            abilityCharges: old.abilityCharges,
            currentSystemId: 'sol',
            systemId: 'sol',
            worldSeed: signalDirector.seed,
            rngState: signalDirector.rngState,
            systemDanger: signalDirector.systemDanger,
            signalDirector,
            lastSaveTime: old.lastSaveTime || Date.now()
        };
    }

    private static migrateShipSnapshot(snapshot: ShipSnapshot): ShipSnapshot {
        const definition = HULLS[snapshot.loadout.hullId] || HULLS.command;
        const scale = Math.max(0.02, snapshot.statScale || 1);
        const moduleCapacity = snapshot.loadout.moduleIds.reduce((sum, id) => sum + (MODULES[id]?.energyCapacityModifier || 0), 0);
        const maxEnergy = (definition.energyCapacity + moduleCapacity) * scale;
        const oldMaxFlux = maxEnergy * 1.5;
        const energy = snapshot.flux === undefined
            ? Math.max(0, Math.min(maxEnergy, snapshot.energy ?? maxEnergy))
            : maxEnergy * (1 - Math.max(0, Math.min(1, snapshot.flux / Math.max(1, oldMaxFlux))));
        return { ...snapshot, energy, flux: undefined, fuel: undefined };
    }

    private static snapshotFuelCapacity(snapshot: ShipSnapshot) {
        const definition = HULLS[snapshot.loadout.hullId] || HULLS.command;
        return definition.fuelCapacity * Math.max(0.02, snapshot.statScale || 1);
    }

    private static legacyWorldSeed(old: LegacyV3Save) {
        const savedAt = Number.isFinite(old.lastSaveTime) ? Math.trunc(old.lastSaveTime) : 0;
        const x = Number.isFinite(old.player.x) ? Math.trunc(old.player.x * 100) : 0;
        const y = Number.isFinite(old.player.y) ? Math.trunc(old.player.y * 100) : 0;
        return (savedAt ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ 0x564F4944) >>> 0;
    }

    private static defaultSkills(): Record<FleetSkillId, number> {
        return { leadership: 0, logistics: 0, engineering: 0, sensors: 0, navigation: 0, tactics: 0, size: 0, tech: 0 };
    }
}

interface LegacyV2Save {
    player: SavedFleetState;
    npcs: SavedFleetState[];
    playerShips: ShipSnapshot[];
    lastSaveTime: number;
}

interface LegacyV3Save {
    version: 3;
    player: SavedFleetState;
    npcs: SavedFleetState[];
    playerShips: ShipSnapshot[];
    commandCapacity: number;
    supplies: number;
    maxSupplies: number;
    money: number;
    doctrine: FleetDoctrine;
    skillPoints: number;
    skills: Record<FleetSkillId, number>;
    progress?: PlayerProgressSave;
    abilityCharges?: AbilityChargesSave;
    lastSaveTime: number;
}
