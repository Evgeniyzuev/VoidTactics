import { describe, expect, it } from 'vitest';
import { ARTIFACT_DEFINITIONS, ExpeditionManager, SECTOR_NODES } from '../src/core/Expedition';

describe('ExpeditionManager', () => {
    it('creates the same eight-node graph for the same seed', () => {
        const first = ExpeditionManager.create(0x12345678).snapshot;
        const second = ExpeditionManager.create(0x12345678).snapshot;

        expect(SECTOR_NODES).toHaveLength(8);
        expect(first).toEqual(second);
        expect(first.currentSectorId).toBe('sol');
        expect(first.discoveredSectors).toEqual(['sol', 'alpha', 'frontier', 'relay']);
    });

    it('requires discoveries and artifacts before opening deep routes', () => {
        const expedition = ExpeditionManager.create(7);

        expect(expedition.isDiscovered('anomaly')).toBe(false);
        expect(expedition.estimateTravel('anomaly').ok).toBe(false);

        expect(expedition.travelTo('frontier', 999).ok).toBe(true);
        expect(expedition.grantArtifact('artifact-wayfinder')).toBe(true);
        expect(expedition.isDiscovered('anomaly')).toBe(true);
        expect(expedition.estimateTravel('anomaly').ok).toBe(true);
    });

    it('applies route costs and preserves soft recovery state', () => {
        const expedition = ExpeditionManager.create(9);
        const route = expedition.travelTo('frontier', 999);
        expect(route.ok).toBe(true);
        expect(route.fuelCost).toBeGreaterThan(0);

        expedition.grantArtifact('artifact-emergency-protocol');
        const recovery = expedition.beginRecovery(120);
        expect(recovery.safeNodeId).toBe('sol');
        expect(recovery.active).toBe(true);
        expect(recovery.cargoLossFraction).toBeLessThan(0.25);
        expect(expedition.currentNode.id).toBe('sol');
    });

    it('contains rule-changing artifacts rather than only numeric upgrades', () => {
        expect(ARTIFACT_DEFINITIONS.map(artifact => artifact.effect)).toEqual([
            'wayfinder', 'sensor-range', 'command-capacity', 'recovery-protection', 'salvage-yield'
        ]);
    });
});
