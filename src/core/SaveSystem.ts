import { Fleet, type FleetSkillId } from '../entities/Fleet';
import { Ship, type ShipSnapshot } from '../tactical/Ship';
import type { FleetDoctrine } from '../tactical/ShipDefinitions';
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

export interface GameSaveData {
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

export class SaveSystem {
    static save(player: Fleet, npcs: Fleet[]) {
        const serializeFleet = (fleet: Fleet): SavedFleetState => ({
            x: fleet.position.x, y: fleet.position.y, vx: fleet.velocity.x, vy: fleet.velocity.y,
            color: fleet.color, strength: fleet.strength, faction: fleet.faction
        });
        const data: GameSaveData = {
            version: 3,
            player: serializeFleet(player),
            npcs: npcs.map(serializeFleet),
            playerShips: player.ships.map(ship => ship.snapshot()),
            commandCapacity: player.commandCapacity,
            supplies: player.supplies,
            maxSupplies: player.maxSupplies,
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
            lastSaveTime: Date.now()
        };
        localStorage.setItem('vt_save_v3', JSON.stringify(data));
    }

    static load(): GameSaveData | null {
        const raw = localStorage.getItem('vt_save_v3');
        try {
            if (raw) {
                const data = JSON.parse(raw) as GameSaveData;
                if (data.version === 3) return data;
            }
            const v2Raw = localStorage.getItem('vt_save_v2');
            if (!v2Raw) return null;
            const old = JSON.parse(v2Raw) as { player: SavedFleetState, npcs: SavedFleetState[], playerShips: ShipSnapshot[], lastSaveTime: number };
            return {
                version: 3, player: old.player, npcs: old.npcs, playerShips: old.playerShips || [],
                commandCapacity: 24, supplies: 30, maxSupplies: 30,
                money: 0,
                doctrine: { targetPriority: 'nearest', preferredRange: 'balanced', aggression: 'balanced' },
                skillPoints: 0,
                skills: { leadership: 0, logistics: 0, engineering: 0, sensors: 0, navigation: 0, tactics: 0 },
                lastSaveTime: old.lastSaveTime
            };
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
        fleet.supplies = data.supplies;
        fleet.maxSupplies = data.maxSupplies;
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
}
