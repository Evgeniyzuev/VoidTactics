import { Fleet } from '../entities/Fleet';
import { Ship, type ShipSnapshot } from '../tactical/Ship';

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
    version: 2;
    player: SavedFleetState;
    npcs: SavedFleetState[];
    playerShips: ShipSnapshot[];
    lastSaveTime: number;
}

export class SaveSystem {
    static save(player: Fleet, npcs: Fleet[]) {
        const serializeFleet = (fleet: Fleet): SavedFleetState => ({
            x: fleet.position.x, y: fleet.position.y, vx: fleet.velocity.x, vy: fleet.velocity.y,
            color: fleet.color, strength: fleet.strength, faction: fleet.faction
        });
        const data: GameSaveData = {
            version: 2,
            player: serializeFleet(player),
            npcs: npcs.map(serializeFleet),
            playerShips: player.ships.map(ship => ship.snapshot()),
            lastSaveTime: Date.now()
        };
        localStorage.setItem('vt_save_v2', JSON.stringify(data));
    }

    static load(): GameSaveData | null {
        const raw = localStorage.getItem('vt_save_v2');
        if (!raw) return null;
        try {
            const data = JSON.parse(raw) as GameSaveData;
            return data.version === 2 ? data : null;
        } catch { return null; }
    }

    static restoreShips(fleet: Fleet, snapshots: ShipSnapshot[]) {
        if (!snapshots?.length) return;
        fleet.ships = snapshots.map(snapshot => Ship.fromSnapshot(snapshot));
        fleet.selectedShipId = fleet.ships.find(ship => ship.role === 'flagship')?.id || fleet.ships[0]?.id || null;
    }

    static clear() {
        localStorage.removeItem('vt_fleet_size');
        localStorage.removeItem('vt_autosave_fleet_size');
        localStorage.removeItem('vt_fleet_progress');
        localStorage.removeItem('vt_autosave_fleet_progress');
        localStorage.removeItem('vt_fleet_ability_charges');
        localStorage.removeItem('vt_autosave_fleet_ability_charges');
        localStorage.removeItem('vt_save_v2');
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
