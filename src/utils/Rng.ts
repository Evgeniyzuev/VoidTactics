/**
 * Seedable game RNG (mulberry32). All simulation code uses `rand()` instead of
 * `Math.random()` so a world seed reproduces spawns, loot and AI decisions.
 */
let state = (Date.now() ^ 0x9e3779b9) >>> 0;
let currentSeed = state;

export function setSeed(seed: number) {
    currentSeed = seed >>> 0;
    state = currentSeed;
}

export function getSeed(): number {
    return currentSeed;
}

export function rand(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(min: number, max: number): number {
    return min + rand() * (max - min);
}

export function randInt(minInclusive: number, maxInclusive: number): number {
    return Math.floor(randRange(minInclusive, maxInclusive + 1));
}

export function pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

export function weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
    if (total <= 0) return pick(items);
    let roll = rand() * total;
    for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll <= 0) return item;
    }
    return items[items.length - 1];
}

/** Stateless hash in [0, 1) for decisions that must not consume the shared stream. */
export function hashUnit(key: string): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}
