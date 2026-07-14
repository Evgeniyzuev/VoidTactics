import { Fleet } from '../entities/Fleet';
import { Ship, type ShipSnapshot } from '../tactical/Ship';
import type { FleetDoctrine } from '../tactical/ShipDefinitions';

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
    doctrine: FleetDoctrine;
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
            doctrine: player.doctrine,
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
                doctrine: { targetPriority: 'nearest', preferredRange: 'balanced', aggression: 'balanced' },
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
        fleet.doctrine = data.doctrine;
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
