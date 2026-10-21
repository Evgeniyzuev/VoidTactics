import { describe, expect, it } from 'vitest';
import { evaluateEngagement, winChance } from '../src/tactical/Ecosystem';
import { rand, setSeed } from '../src/utils/Rng';

const base = { allyPower: 0, enemyWounded: 0, enemyFaction: 'player' };

describe('engagement model', () => {
    it('win chance is monotonic and 50% at parity', () => {
        expect(winChance(10, 10)).toBeCloseTo(0.5, 6);
        expect(winChance(20, 10)).toBeGreaterThan(winChance(12, 10));
        expect(winChance(5, 10)).toBeLessThan(0.5);
    });

    it('pirates avoid equal fights but take weaker prey', () => {
        expect(evaluateEngagement({ ...base, faction: 'pirate', ownPower: 10, perceivedEnemyPower: 10 }).attack).toBe(false);
        expect(evaluateEngagement({ ...base, faction: 'pirate', ownPower: 10, perceivedEnemyPower: 5 }).attack).toBe(true);
    });

    it('pirates take riskier fights against loaded traders', () => {
        const input = { faction: 'pirate', ownPower: 10, allyPower: 0, enemyWounded: 0, perceivedEnemyPower: 12 };
        expect(evaluateEngagement({ ...input, enemyFaction: 'player' }).attack).toBe(false);
        expect(evaluateEngagement({ ...input, enemyFaction: 'trader' }).attack).toBe(true);
    });

    it('wounded targets are more tempting', () => {
        const input = { ...base, faction: 'pirate', ownPower: 10, perceivedEnemyPower: 10 };
        expect(evaluateEngagement({ ...input, enemyWounded: 0 }).attack).toBe(false);
        expect(evaluateEngagement({ ...input, enemyWounded: 0.9 }).attack).toBe(true);
    });

    it('civilians never attack and flee unless overwhelming', () => {
        const strong = evaluateEngagement({ ...base, faction: 'civilian', ownPower: 10, perceivedEnemyPower: 9 });
        expect(strong.attack).toBe(false);
        expect(strong.flee).toBe(true);
    });

    it('raiders never flee, orcs accept worse odds than pirates', () => {
        expect(evaluateEngagement({ ...base, faction: 'raider', ownPower: 1, perceivedEnemyPower: 100 }).flee).toBe(false);
        const input = { ...base, ownPower: 9, perceivedEnemyPower: 10 };
        expect(evaluateEngagement({ ...input, faction: 'orc' }).attack).toBe(true);
        expect(evaluateEngagement({ ...input, faction: 'pirate' }).attack).toBe(false);
    });

    it('allies shift the decision', () => {
        const alone = evaluateEngagement({ ...base, faction: 'pirate', ownPower: 7, perceivedEnemyPower: 10 });
        const pack = evaluateEngagement({ ...base, faction: 'pirate', ownPower: 7, allyPower: 12, perceivedEnemyPower: 10 });
        expect(alone.attack).toBe(false);
        expect(pack.attack).toBe(true);
    });
});

describe('seeded rng', () => {
    it('reproduces a sequence from a seed', () => {
        setSeed(1234);
        const a = [rand(), rand(), rand()];
        setSeed(1234);
        const b = [rand(), rand(), rand()];
        expect(a).toEqual(b);
        expect(a.every(v => v >= 0 && v < 1)).toBe(true);
    });
});
