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
        // No-op
    }

    static saveFleetSize(size: number) {
        localStorage.setItem('vt_fleet_size', size.toString());
    }

    static loadFleetSize(): number | null {
        const val = localStorage.getItem('vt_fleet_size');
        return val ? parseInt(val, 10) : null;
    }
}
