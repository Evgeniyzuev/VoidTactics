import { describe, expect, it } from 'vitest';
import { rollLoot } from '../src/tactical/LootTables';
import { RELICS, draftRelics } from '../src/tactical/Relics';
import { setSeed } from '../src/utils/Rng';

describe('loot tables', () => {
    it('is deterministic for a seed', () => {
        setSeed(77);
        const a = rollLoot('pirate', 10, 10);
        setSeed(77);
        const b = rollLoot('pirate', 10, 10);
        expect(a).toEqual(b);
    });

    it('stronger victims yield more drops and a better relic chance', () => {
        setSeed(5);
        const weak = rollLoot('orc', 2, 20);
        setSeed(5);
        const strong = rollLoot('orc', 60, 20);
        expect(strong.abilityIds.length).toBeGreaterThanOrEqual(weak.abilityIds.length);
        expect(strong.relicChance).toBeGreaterThan(weak.relicChance);
        expect(weak.relicChance).toBeGreaterThanOrEqual(0.04);
    });

    it('wanted targets always offer a relic and drop extra loot', () => {
        setSeed(9);
        const wanted = rollLoot('raider', 40, 20, true);
        expect(wanted.relicChance).toBe(1);
        expect(wanted.abilityIds.length).toBeGreaterThanOrEqual(3);
    });

    it('factions drop their characteristic systems', () => {
        setSeed(3);
        const loot = rollLoot('raider', 20, 20);
        expect(loot.abilityIds.every(id => ['cloak', 'decoy', 'mine', 'net'].includes(id))).toBe(true);
    });
});

describe('relic draft', () => {
    it('offers three distinct unowned relics', () => {
        setSeed(11);
        const options = draftRelics(['ghost-hull']);
        expect(options).toHaveLength(3);
        expect(new Set(options.map(o => o.id)).size).toBe(3);
        expect(options.some(o => o.id === 'ghost-hull')).toBe(false);
    });

    it('stops offering when everything is owned', () => {
        expect(draftRelics(Object.keys(RELICS) as never[])).toHaveLength(0);
    });
});
