import { describe, expect, it } from 'vitest';
import {
    SIGNAL_DEFINITIONS,
    SignalDirector,
    type SignalSpawnContext,
    type WorldEventPendingChoice
} from '../src/core/SignalDirector';
import { WorldEvent } from '../src/entities/WorldEvent';

const CONTEXT: SignalSpawnContext = {
    playerPosition: { x: 200, y: -300 },
    playerSensorRange: 1_200,
    playerThreat: 100,
    systemBounds: {
        center: { x: 0, y: 0 },
        radius: 8_000,
        margin: 100
    }
};

function spawnFirst(director: SignalDirector) {
    const firstDelay = director.secondsUntilNextSignal;
    expect(firstDelay).toBeGreaterThanOrEqual(10);
    expect(firstDelay).toBeLessThanOrEqual(20);
    const result = director.update(firstDelay, CONTEXT);
    expect(result.spawned).toHaveLength(1);
    return result.spawned[0]!;
}

describe('SignalDirector', () => {
    it('produces identical signals and RNG state for the same seed', () => {
        const first = new SignalDirector({ seed: 0xC0FFEE, systemDanger: 17 });
        const second = new SignalDirector({ seed: 0xC0FFEE, systemDanger: 17 });

        expect(first.secondsUntilNextSignal).toBe(second.secondsUntilNextSignal);
        expect(spawnFirst(first)).toEqual(spawnFirst(second));

        const nextDelay = first.secondsUntilNextSignal;
        expect(nextDelay).toBe(second.secondsUntilNextSignal);
        expect(first.update(nextDelay, CONTEXT)).toEqual(second.update(nextDelay, CONTEXT));
        expect(first.snapshot()).toEqual(second.snapshot());
    });

    it('uses the configured timing windows and never exceeds three active events', () => {
        const director = new SignalDirector({ seed: 42 });
        const firstDelay = director.secondsUntilNextSignal;

        expect(director.update(Math.max(0, firstDelay - 0.01), CONTEXT).spawned).toHaveLength(0);
        expect(director.update(director.secondsUntilNextSignal, CONTEXT).spawned).toHaveLength(1);
        expect(director.secondsUntilNextSignal).toBeGreaterThanOrEqual(45);
        expect(director.secondsUntilNextSignal).toBeLessThanOrEqual(90);

        const secondDelay = director.secondsUntilNextSignal;
        expect(director.update(secondDelay, CONTEXT).spawned).toHaveLength(1);
        expect(director.secondsUntilNextSignal).toBeGreaterThanOrEqual(45);
        expect(director.secondsUntilNextSignal).toBeLessThanOrEqual(90);

        const thirdDelay = director.secondsUntilNextSignal;
        expect(director.update(thirdDelay, CONTEXT).spawned).toHaveLength(1);
        expect(director.getActiveEvents()).toHaveLength(3);

        const whileFull = director.update(30, CONTEXT);
        expect(whileFull.spawned).toHaveLength(0);
        expect(director.getActiveEvents()).toHaveLength(3);
    });

    it('restores a snapshot without changing the deterministic continuation', () => {
        const original = new SignalDirector({ seed: 7_654_321, systemDanger: 8 });
        const firstSignal = spawnFirst(original);
        original.markDiscovered(firstSignal.id);
        original.update(12.345, CONTEXT);
        const engaged = original.markEngaged(firstSignal.id, true)!;
        const pendingChoice: WorldEventPendingChoice = {
            kind: 'combat',
            choiceId: 'assist',
            victoryOutcome: 'transport-saved',
            defeatOutcome: 'transport-lost',
            victoryDangerDelta: -2,
            defeatDangerDelta: 2
        };
        original.setPendingChoice(firstSignal.id, pendingChoice);

        const saved = original.snapshot();
        const restored = SignalDirector.fromSnapshot(saved);
        expect(restored.snapshot()).toEqual(saved);
        expect(restored.getEvent(firstSignal.id)).toMatchObject({
            phase: 'engaged',
            engagedAt: engaged.engagedAt,
            pendingChoice
        });

        const untilNextSignal = original.secondsUntilNextSignal;
        expect(restored.secondsUntilNextSignal).toBe(untilNextSignal);
        expect(restored.update(untilNextSignal, CONTEXT)).toEqual(original.update(untilNextSignal, CONTEXT));
        expect(restored.snapshot()).toEqual(original.snapshot());
    });

    it('allows a resolved event reward to be claimed exactly once', () => {
        const director = new SignalDirector({ seed: 91, systemDanger: 10 });
        const signal = spawnFirst(director);

        expect(director.claimReward(signal.id)).toBe(false);
        expect(director.resolveEvent(signal.id, 'assisted', -3)?.phase).toBe('resolved');
        expect(director.systemDanger).toBe(7);
        expect(director.claimReward(signal.id)).toBe(true);
        expect(director.claimReward(signal.id)).toBe(false);

        director.resolveEvent(signal.id, 'duplicate-resolution', -3);
        expect(director.systemDanger).toBe(7);
        expect(director.getEvent(signal.id)?.outcome).toBe('assisted');
        expect(director.getEvent(signal.id)?.rewardGranted).toBe(true);

        const restored = SignalDirector.fromSnapshot(director.snapshot());
        expect(restored.getEvent(signal.id)?.rewardGranted).toBe(true);
        expect(restored.claimReward(signal.id)).toBe(false);
    });

    it('restores a pending combat choice that can be applied to a WorldEvent', () => {
        const director = new SignalDirector({ seed: 512 });
        const signal = spawnFirst(director);
        const pendingChoice: WorldEventPendingChoice = {
            kind: 'combat',
            choiceId: 'assist',
            victoryOutcome: 'transport-saved',
            defeatOutcome: 'transport-lost',
            victoryDangerDelta: -2,
            defeatDangerDelta: 2
        };
        director.markEngaged(signal.id);
        director.setPendingChoice(signal.id, pendingChoice);

        const restored = SignalDirector.fromSnapshot(director.snapshot());
        const restoredChoice = restored.getEvent(signal.id)!.pendingChoice;
        const runtimeEvent = new WorldEvent(10, 20, 'distress', 'Distress convoy', 300);
        runtimeEvent.setPendingChoice(restoredChoice);
        expect(runtimeEvent.pendingChoice).toEqual(pendingChoice);

        runtimeEvent.resolve(pendingChoice.victoryOutcome);
        expect(runtimeEvent.pendingChoice).toBeNull();
    });

    it('expires signals once and applies their configured danger consequence once', () => {
        const initialDanger = 20;
        const director = new SignalDirector({ seed: 1_337, systemDanger: initialDanger });
        const signal = spawnFirst(director);
        const event = director.getEvent(signal.id)!;
        const definition = SIGNAL_DEFINITIONS.find(candidate => candidate.id === signal.definitionId)!;

        expect(event.ttl).toBeGreaterThanOrEqual(240);
        expect(event.ttl).toBeLessThanOrEqual(480);
        const result = director.update(event.timeLeft, CONTEXT);
        expect(result.expired.map(expired => expired.id)).toContain(signal.id);
        expect(director.getEvent(signal.id)?.phase).toBe('expired');
        expect(director.getEvent(signal.id)?.outcome).toBe('missed');
        expect(director.systemDanger).toBeCloseTo(initialDanger + definition.missedDangerDelta);

        const dangerAfterExpiry = director.systemDanger;
        director.update(0, CONTEXT);
        expect(director.systemDanger).toBe(dangerAfterExpiry);
        expect(director.claimReward(signal.id)).toBe(false);
    });
});
