import { describe, expect, it } from 'vitest';
import { Fleet } from '../src/entities/Fleet';
import { WorldEvent } from '../src/entities/WorldEvent';
import { Ship } from '../src/tactical/Ship';
import { SensorService } from '../src/tactical/SensorService';

function createFleet(
    x: number,
    hullId = 'lance',
    options: { statScale?: number; moduleIds?: string[]; faction?: Fleet['faction'] } = {}
) {
    const fleet = new Fleet(x, 0, '#fff', false);
    const ship = new Ship({
        hullId,
        weaponIds: hullId === 'specter' ? ['jammer'] : ['pulse'],
        moduleIds: options.moduleIds ?? []
    });
    if (options.statScale !== undefined) ship.setStatScale(options.statScale);
    fleet.ships = [ship];
    fleet.faction = options.faction ?? 'pirate';
    fleet.fuel = fleet.maxFuel;
    return fleet;
}

function exactRangeService() {
    return new SensorService({
        minimumDetectionSignatureMultiplier: 1,
        maximumDetectionSignatureMultiplier: 1,
        minimumScanSeconds: 4,
        maximumScanSeconds: 4
    });
}

describe('SensorService profiles', () => {
    it('applies hull, module, skill, sensor damage and scan-resolution data', () => {
        const service = new SensorService();
        const fleet = createFleet(0, 'specter', { moduleIds: ['electronicSuite'] });

        const healthy = service.getFleetProfile(fleet, 0);
        expect(healthy.sensorRange).toBeCloseTo(2100, 6);
        expect(healthy.scanResolution).toBeCloseTo(2.1, 6);

        fleet.ships[0].damagedSystems.push('sensors', 'command');
        fleet.skills.sensors = 4;
        const damaged = service.getFleetProfile(fleet, 0);

        expect(damaged.sensorRange).toBeCloseTo((1750 + 350) * 0.55 * 1.1, 6);
        expect(damaged.scanResolution).toBeCloseTo(2.1 * 0.75, 6);
        expect(damaged.sensorRange).toBeLessThan(healthy.sensorRange);
    });

    it('computes deterministic signature modifiers including scale and pulse windows', () => {
        const service = new SensorService();
        const fleet = createFleet(0, 'lance', { statScale: 4 });
        fleet.skills.sensors = 2;
        fleet.isCloaked = true;
        fleet.abilities.afterburner.active = true;
        fleet.fuel = 0;
        service.activateScanPulse(fleet, 10);

        const duringPulse = service.getFleetProfile(fleet, 12);
        const baseSignature = 0.9 * Math.sqrt(4);
        const skillMultiplier = 1 - 0.08 * 2;
        expect(duringPulse.signature).toBeCloseTo(
            baseSignature * skillMultiplier * 0.25 * 1.75 * 1.25 * 2,
            8
        );
        expect(duringPulse.sensorRange).toBeCloseTo(1000 * (1 + 0.05 * Math.sqrt(2)) * 2, 8);
        expect(duringPulse.scanPulseActive).toBe(true);

        const afterRangePulse = service.getFleetProfile(fleet, 15);
        expect(afterRangePulse.scanPulseActive).toBe(false);
        expect(afterRangePulse.scanPulseSignatureActive).toBe(true);
        expect(afterRangePulse.sensorRange).toBeCloseTo(1000 * (1 + 0.05 * Math.sqrt(2)), 8);

        const afterPulse = service.getFleetProfile(fleet, 19);
        expect(afterPulse.scanPulseSignatureActive).toBe(false);
        expect(afterPulse.signature).toBeCloseTo(duringPulse.signature / 2, 8);
    });
});

describe('SensorService contacts', () => {
    it('detects a target at the exact boundary and rejects it immediately outside', () => {
        const observer = createFleet(0);
        const onBoundary = createFleet(1000);
        const outside = createFleet(1000.001);
        const service = exactRangeService();

        const contacts = service.update(observer, [
            { contactId: 'boundary', entity: onBoundary },
            { contactId: 'outside', entity: outside }
        ], 0, 0);

        expect(contacts.map(contact => contact.id)).toEqual(['boundary']);
        expect(contacts[0].distance).toBeCloseTo(1000, 8);
        expect(contacts[0].level).toBe('blip');
    });

    it('advances scan progress by caller-provided dt and unlocks gates by level', () => {
        const observer = createFleet(0);
        const target = createFleet(500, 'lance', { faction: 'raider' });
        const service = exactRangeService();
        const ref = { contactId: 'scan-target', entity: target } as const;

        let contact = service.update(observer, [ref], 0.5, 0.5)[0];
        expect(contact.scanProgress).toBeCloseTo(0.125, 8);
        expect(contact.level).toBe('blip');
        expect(service.canInspect(observer, contact)).toBe(false);
        expect(service.canAttack(observer, contact)).toBe(false);

        contact = service.update(observer, [ref], 0.5, 1)[0];
        expect(contact.scanProgress).toBeCloseTo(0.25, 8);
        expect(contact.level).toBe('classified');
        expect(service.canInspect(observer, contact)).toBe(true);
        expect(service.canAttack(observer, contact)).toBe(true);
        expect(contact.intel.faction).toBe('raider');
        expect(contact.intel.roles).toBeNull();

        contact = service.update(observer, [ref], 3, 4)[0];
        expect(contact.scanProgress).toBe(1);
        expect(contact.level).toBe('identified');
        expect(contact.intel.roles).toEqual(['striker']);
        expect(contact.intel.threat).toBeCloseTo(target.threatRating, 8);
    });

    it('does not scan a high-signature blip beyond nominal sensor range', () => {
        const observer = createFleet(0);
        const target = createFleet(1500, 'bulwark', { statScale: 4 });
        const service = new SensorService({ minimumScanSeconds: 1, maximumScanSeconds: 1 });

        const contact = service.update(observer, [{ contactId: 'large-target', entity: target }], 10, 10)[0];

        expect(contact).toBeDefined();
        expect(contact.distance).toBeGreaterThan(contact.nominalScanRange);
        expect(contact.detectionRange).toBeGreaterThan(contact.distance);
        expect(contact.scanProgress).toBe(0);
        expect(contact.level).toBe('blip');
    });

    it('keeps a stale last-known contact for eight seconds, then forgets it', () => {
        const observer = createFleet(0);
        const target = createFleet(200);
        const service = exactRangeService();
        const ref = { contactId: 'stale-target', entity: target } as const;

        let contact = service.update(observer, [ref], 4, 4)[0];
        expect(contact.level).toBe('identified');
        target.position.x = 5000;

        contact = service.update(observer, [ref], 0.1, 4.1)[0];
        expect(contact.stale).toBe(true);
        expect(contact.lastKnownPosition.x).toBe(200);
        expect(service.canRender(observer, contact)).toBe(true);
        expect(service.canInspect(observer, contact)).toBe(false);
        expect(service.canAttack(observer, contact)).toBe(false);

        expect(service.update(observer, [ref], 0, 12)).toHaveLength(1);
        expect(service.update(observer, [ref], 0, 12.001)).toHaveLength(0);
        expect(service.canRender(observer, 'stale-target')).toBe(false);
    });

    it('allows inspecting a classified signal but never attacking it', () => {
        const observer = createFleet(0);
        const signal = new WorldEvent(300, 0, 'distress', 'Distress convoy', 120);
        const service = exactRangeService();
        const ref = { contactId: 'signal', entity: signal } as const;

        const contact = service.update(observer, [ref], 1, 1)[0];

        expect(contact.level).toBe('classified');
        expect(service.canInspect(observer, contact)).toBe(true);
        expect(service.canAttack(observer, contact)).toBe(false);
        expect(contact.intel.signalKind).toBeNull();
        expect(contact.intel.signalTitle).toBe('Classified signal');
    });

    it('updates one hundred strategic contacts in a single 10 Hz sensor tick', () => {
        const observer = createFleet(0, 'specter');
        const targets = Array.from({ length: 100 }, (_, index) => ({
            contactId: `strategic-${index}`,
            entity: createFleet(120 + index * 8)
        }));
        const service = exactRangeService();

        const contacts = service.update(observer, targets, 0.1, 0.1);

        expect(contacts).toHaveLength(100);
        expect(new Set(contacts.map(contact => contact.id)).size).toBe(100);
    });
});
