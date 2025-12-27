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
    private static STORAGE_KEY = 'voidtactics_save_v1';

    static save(player: Fleet, npcs: Fleet[]) {
        const data: GameSaveData = {
            player: {
                x: player.position.x,
                y: player.position.y,
                vx: player.velocity.x,
                vy: player.velocity.y,
                color: player.color,
                strength: player.strength,
                faction: player.faction
            },
            npcs: npcs.map(npc => ({
                x: npc.position.x,
                y: npc.position.y,
                vx: npc.velocity.x,
                vy: npc.velocity.y,
                color: npc.color,
                strength: npc.strength,
                faction: npc.faction
            })),
            lastSaveTime: Date.now()
        };

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            console.log('Game Saved');
        } catch (e) {
            console.error('Failed to save game', e);
        }
    }

    static load(): GameSaveData | null {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to parse save', e);
            return null;
        }
    }

    static clear() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
}
