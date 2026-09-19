import { describe, expect, it } from 'vitest';
import { SystemManager } from '../src/core/SystemManager';
import { SpatialHash } from '../src/utils/SpatialHash';
import { Vector2 } from '../src/utils/Vector2';

describe('SpatialHash', () => {
    it('returns only objects inside the requested radius', () => {
        const index = new SpatialHash<{ position: Vector2 }>(400);
        const near = { position: new Vector2(100, 0) };
        const diagonal = { position: new Vector2(250, 250) };
        const far = { position: new Vector2(900, 0) };
        index.rebuild([near, diagonal, far]);

        expect(index.query(new Vector2(0, 0), 400)).toEqual([near, diagonal]);
        expect(index.query(new Vector2(0, 0), 200)).toEqual([near]);
    });
});

describe('timed fleet population', () => {
    it('does not add another timed fleet at the population ceiling', () => {
        const manager = new SystemManager();
        const fleets = Array.from({ length: 50 }, () => ({}) as any);

        manager.updateSpawnTimers(2, 10);

        expect(manager.shouldSpawnMoreFleets(2, fleets, 1)).toBe(false);
    });
});
