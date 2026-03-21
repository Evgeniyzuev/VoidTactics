import { Fleet } from '../entities/Fleet';

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
}

export interface GameSaveData {
    player: SavedFleetState;
    npcs: SavedFleetState[];
    lastSaveTime: number;
}

export class SaveSystem {
    static save(_player: Fleet, _npcs: Fleet[]) {
        // Saving to local cache is disabled.
        // Data persists only during the current session.
    }

    static load(): GameSaveData | null {
        // Skip loading from local storage.
        return null;
    }

    static clear() {
        localStorage.removeItem('vt_fleet_size');
        localStorage.removeItem('vt_autosave_fleet_size');
        localStorage.removeItem('vt_fleet_progress');
        localStorage.removeItem('vt_autosave_fleet_progress');
        localStorage.removeItem('vt_fleet_ability_charges');
        localStorage.removeItem('vt_autosave_fleet_ability_charges');
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
