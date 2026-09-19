import type { Vector2 } from './Vector2';

export interface Positioned {
    position: Vector2;
}

/** Uniform grid for broad-phase proximity queries. */
export class SpatialHash<T extends Positioned> {
    private readonly cells = new Map<string, T[]>();
    public readonly cellSize: number;

    constructor(cellSize: number) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('SpatialHash cellSize must be positive and finite.');
        }
        this.cellSize = cellSize;
    }

    clear() {
        this.cells.clear();
    }

    rebuild(items: readonly T[]) {
        this.cells.clear();
        for (const item of items) this.insert(item);
    }

    insert(item: T) {
        const key = this.key(this.cell(item.position.x), this.cell(item.position.y));
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(item);
        else this.cells.set(key, [item]);
    }

    query(position: Vector2, radius: number): T[] {
        const safeRadius = Math.max(0, radius);
        const minX = this.cell(position.x - safeRadius);
        const maxX = this.cell(position.x + safeRadius);
        const minY = this.cell(position.y - safeRadius);
        const maxY = this.cell(position.y + safeRadius);
        const radiusSquared = safeRadius * safeRadius;
        const result: T[] = [];

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const bucket = this.cells.get(this.key(x, y));
                if (!bucket) continue;
                for (const item of bucket) {
                    const dx = item.position.x - position.x;
                    const dy = item.position.y - position.y;
                    if (dx * dx + dy * dy <= radiusSquared) result.push(item);
                }
            }
        }
        return result;
    }

    private cell(value: number) {
        return Math.floor(value / this.cellSize);
    }

    private key(x: number, y: number) {
        return `${x}:${y}`;
    }
}
