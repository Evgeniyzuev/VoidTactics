import { describe, expect, it } from 'vitest';
import { CadenceScheduler, getFleetSimulationInterval, getFleetSimulationTier } from '../src/core/SimulationScheduler';

describe('fleet simulation scheduler', () => {
    it('assigns cheaper cadences as fleets move away from the tactical area', () => {
        expect(getFleetSimulationTier(0)).toBe('tactical');
        expect(getFleetSimulationInterval(0)).toBe(0);
        expect(getFleetSimulationTier(3000 ** 2)).toBe('local');
        expect(getFleetSimulationInterval(3000 ** 2)).toBe(0.1);
        expect(getFleetSimulationTier(8000 ** 2)).toBe('remote');
        expect(getFleetSimulationInterval(8000 ** 2)).toBe(0.5);
        expect(getFleetSimulationTier(15000 ** 2)).toBe('background');
        expect(getFleetSimulationInterval(15000 ** 2)).toBe(1);
    });

    it('keeps active battles on the tactical cadence', () => {
        expect(getFleetSimulationInterval(15000 ** 2, true)).toBe(0.1);
    });

    it('returns accumulated elapsed time when a remote subject is due', () => {
        const scheduler = new CadenceScheduler<{ id: string }>();
        const subject = { id: 'remote-1' };

        expect(scheduler.consume(subject, 0.1, 0.5)).toBe(0);
        expect(scheduler.consume(subject, 0.4, 0.5)).toBeCloseTo(0.5, 10);
        expect(scheduler.consume(subject, 0.25, 0.5)).toBe(0);
        expect(scheduler.consume(subject, 0.25, 0.5)).toBeCloseTo(0.5, 10);
    });
});
