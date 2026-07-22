import { describe, expect, it, vi } from 'vitest';
import { Attack } from '../src/core/Attack';
import type { Game } from '../src/core/Game';
import { Fleet } from '../src/entities/Fleet';
import { ABILITY_DEFINITIONS, ABILITY_EQUIPMENT_MARKET, AbilityService } from '../src/tactical/AbilityService';
import { SystemManager } from '../src/core/SystemManager';
import { SensorService } from '../src/tactical/SensorService';
import { RepairService } from '../src/tactical/RepairService';
import { Ship } from '../src/tactical/Ship';
import { TACTICAL_BALANCE, WEAPONS } from '../src/tactical/ShipDefinitions';
import { Vector2 } from '../src/utils/Vector2';

function createFleet(x = 0) {
    const fleet = new Fleet(x, 0, '#fff', false);
    const ship = new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] });
    fleet.ships = [ship];
    fleet.selectedShipId = ship.id;
    fleet.fuel = fleet.maxFuel;
    fleet.supplies = fleet.maxSupplies;
    return fleet;
}

function createGameStub(player: Fleet) {
    const attacks: Attack[] = [];
    return {
        getPlayerFleet: () => player,
        getBubbleZones: () => [],
        getAttacks: () => attacks,
        activateNpcAbility: vi.fn(() => false),
        addCombatShot: vi.fn(),
        awardPlayerMoney: vi.fn(),
        spawnDebris: vi.fn()
    } as unknown as Game;
}

describe('fleet fuel and readiness', () => {
    it('allows the player to steer while an active battle is running', () => {
        const fleet = new Fleet(0, 0, '#fff', true);
        fleet.activeBattle = {};
        fleet.state = 'combat';
        fleet.setTarget(new Vector2(500, 0));

        fleet.update(0.5);

        expect(fleet.position.x).toBeGreaterThan(0);
    });

    it('reports full base Threat only at full hull and full readiness', () => {
        const fleet = createFleet();
        const ship = fleet.ships[0];

        expect(fleet.operationalReadiness).toBe(100);
        expect(fleet.threatRating).toBeCloseTo(ship.maxCombatRating, 10);

        ship.hull *= 0.5;
        expect(fleet.threatRating).toBeLessThan(ship.maxCombatRating);
        ship.hull = ship.maxHull;
        fleet.setReadiness(25);
        expect(fleet.threatRating).toBeCloseTo(fleet.baseThreatRating * fleet.readinessEfficiency, 10);
        expect(fleet.threatRating).toBeLessThan(fleet.baseThreatRating);
    });

    it('burns fuel by distance and applies the afterburner multiplier', () => {
        const normal = createFleet();
        const boosted = createFleet();
        normal.velocity = new Vector2(100, 0);
        boosted.velocity = new Vector2(100, 0);
        const normalFuelBefore = normal.fuel;
        const boostedFuelBefore = boosted.fuel;
        boosted.abilities.afterburner.charges = 1;

        expect(AbilityService.activate(boosted, 'afterburner').ok).toBe(true);
        normal.update(1);
        boosted.update(1);

        const expectedNormalBurn = 100 * TACTICAL_BALANCE.fuelPerDistance;
        expect(normalFuelBefore - normal.fuel).toBeCloseTo(expectedNormalBurn, 10);
       expect(boostedFuelBefore - boosted.fuel).toBeCloseTo(
            expectedNormalBurn * TACTICAL_BALANCE.afterburnerFuelMultiplier +
                boosted.ships[0].energyRecharge * TACTICAL_BALANCE.energyFuelPerPoint,
           10
       );
    });

    it('keeps an empty fleet mobile at exactly the emergency-speed fraction', () => {
        const normal = createFleet();
        const empty = createFleet();
        normal.setTarget(new Vector2(10_000, 0));
        empty.setTarget(new Vector2(10_000, 0));
        empty.fuel = 0;

        normal.update(0.1);
        empty.update(0.1);

        expect(normal.velocity.mag()).toBeGreaterThan(0);
        expect(empty.velocity.mag()).toBeCloseTo(
            normal.velocity.mag() * TACTICAL_BALANCE.emergencySpeedMultiplier,
            10
        );
        empty.abilities.afterburner.charges = 1;
        expect(AbilityService.activate(empty, 'afterburner').ok).toBe(false);
        expect(empty.abilities.afterburner.charges).toBe(1);
    });

    it('clamps fuel when removing a ship reduces fleet capacity', () => {
        const fleet = createFleet();
        fleet.ships.push(new Ship({ hullId: 'tender', weaponIds: ['pulse'], moduleIds: [] }));
        fleet.fuel = fleet.maxFuel;
        fleet.ships.pop();

        fleet.update(0);

        expect(fleet.fuel).toBe(fleet.maxFuel);
        expect(fleet.fuel).toBe(fleet.ships[0].maxFuelCapacity);
    });

    it('recovers readiness at one point per second for exactly one supply per ten points', () => {
        const fleet = createFleet();
        fleet.setReadiness(80);
        fleet.supplies = 3;

        fleet.update(5);

        expect(fleet.operationalReadiness).toBeCloseTo(85, 10);
        expect(fleet.supplies).toBeCloseTo(2.5, 10);

        fleet.supplies = 0;
        fleet.update(5);
        expect(fleet.operationalReadiness).toBeCloseTo(85, 10);
    });
});

describe('shared Energy', () => {
    it('spends Energy on weapon fire and increases both cost and damage while overcharged', () => {
        function fireOnce(overcharged: boolean) {
            const attacker = createFleet();
            const target = createFleet();
            target.ships[0].shield = 0;
            target.ships[0].armor = 0;
            if (overcharged) {
                attacker.abilities.fire.charges = 1;
                expect(AbilityService.activate(attacker, 'fire').ok).toBe(true);
            }
            const energyBeforeShot = attacker.ships[0].energy;
            const hullBefore = target.ships[0].hull;
            const attack = new Attack(attacker, target, createGameStub(attacker));

            attack.update(0.1);

            return {
                energySpent: energyBeforeShot - attacker.ships[0].energy,
                hullDamage: hullBefore - target.ships[0].hull
            };
        }

        const normal = fireOnce(false);
        const overcharged = fireOnce(true);
        const baseWeaponEnergy = WEAPONS.pulse.energyCost / WEAPONS.pulse.cooldown * 0.1;

        expect(normal.energySpent).toBeCloseTo(baseWeaponEnergy, 10);
        expect(overcharged.energySpent).toBeCloseTo(baseWeaponEnergy * TACTICAL_BALANCE.overchargeEnergyMultiplier, 10);
        expect(overcharged.hullDamage).toBeCloseTo(normal.hullDamage * TACTICAL_BALANCE.overchargeDamageMultiplier, 10);
    });

    it('spends Energy while regenerating shields', () => {
        const ship = createFleet().ships[0];
        ship.shield -= 10;
        ship.shieldRechargeDelay = 0;
        ship.energy = ship.maxEnergy;
        const shieldBefore = ship.shield;
        const energyBefore = ship.energy;

        ship.update(1);

        const expectedShield = ship.maxShield * TACTICAL_BALANCE.shieldRechargeFraction;
        expect(ship.shield - shieldBefore).toBeCloseTo(expectedShield, 10);
        expect(energyBefore - ship.energy).toBeCloseTo(
            expectedShield * TACTICAL_BALANCE.shieldEnergyPerPoint,
            10
        );
    });

    it('does not regenerate Energy or shields while disabled', () => {
        const ship = createFleet().ships[0];
        ship.state = 'disabled';
        ship.energy = 0;
        ship.shield = 0;
        ship.shieldRechargeDelay = 0;

        ship.update(10);

        expect(ship.energy).toBe(0);
        expect(ship.shield).toBe(0);
    });

    it('restarts the shield delay when an unshielded active ship is hit', () => {
        const ship = createFleet().ships[0];
        ship.shield = 0;
        ship.shieldRechargeDelay = 0;

        ship.applyDamage(1, 'energy');

        expect(ship.shieldRechargeDelay).toBe(TACTICAL_BALANCE.shieldRechargeDelay);
    });

    it('pays Scan Pulse from the pooled current Energy in exact proportions', () => {
        const fleet = createFleet();
        const second = new Ship({ hullId: 'bulwark', weaponIds: ['pulse'], moduleIds: [] });
        fleet.ships.push(second);
        fleet.ships[0].energy = 60;
        second.energy = 10;
        const availableBefore = fleet.totalEnergy;
        const firstBefore = fleet.ships[0].energy;
        const secondBefore = second.energy;
        const expectedCost = fleet.maxEnergy * ABILITY_DEFINITIONS.scan.energyFraction;
        const sensors = new SensorService();

        const result = AbilityService.activateScanPulse(fleet, sensors, 5);

        expect(result.ok).toBe(true);
        expect(firstBefore - fleet.ships[0].energy).toBeCloseTo(expectedCost * firstBefore / availableBefore, 10);
        expect(secondBefore - second.energy).toBeCloseTo(expectedCost * secondBefore / availableBefore, 10);
        expect(availableBefore - fleet.totalEnergy).toBeCloseTo(expectedCost, 10);
        expect(sensors.getScanPulseState(fleet)).toEqual({ rangeUntil: 9, signatureUntil: 13 });
    });

    it('does not start Scan Pulse when pooled Energy is insufficient', () => {
        const fleet = createFleet();
        fleet.ships[0].energy = fleet.maxEnergy * ABILITY_DEFINITIONS.scan.energyFraction - 0.01;
        const before = fleet.totalEnergy;
        const sensors = new SensorService();

        const result = AbilityService.activateScanPulse(fleet, sensors, 0);

        expect(result.ok).toBe(false);
        expect(fleet.totalEnergy).toBe(before);
        expect(sensors.getScanPulseState(fleet)).toBeNull();
    });
});

describe('narrow consumable effects', () => {
    it('Emergency Repair changes hull only', () => {
        const fleet = createFleet();
        const ship = fleet.ships[0];
        ship.hull -= 30;
        ship.armor -= 7;
        ship.shield -= 9;
        ship.shieldRechargeDelay = 100;
        fleet.abilities.medkit.charges = 1;
        const before = { hull: ship.hull, armor: ship.armor, shield: ship.shield, energy: ship.energy };

        const result = AbilityService.activate(fleet, 'medkit');
        ship.update(6);

        expect(result.ok).toBe(true);
        expect(ship.hull).toBeCloseTo(before.hull + ship.maxHull * 0.2, 10);
        expect(ship.armor).toBe(before.armor);
        expect(ship.shield).toBe(before.shield);
        expect(ship.energy).toBe(before.energy);
        expect(fleet.abilities.medkit.charges).toBe(0);
    });

    it('Emergency Repair stabilizes disabled hull at 8% and then repairs another 20%', () => {
        const fleet = createFleet();
        const ship = fleet.ships[0];
        ship.state = 'disabled';
        ship.hull = 0;
        ship.disabledDamage = 12;
        fleet.abilities.medkit.charges = 1;

        const result = AbilityService.activate(fleet, 'medkit');
        expect(result.ok).toBe(true);
        expect(ship.state).toBe('active');
        expect(ship.hull).toBeCloseTo(ship.maxHull * 0.08, 10);
        ship.shieldRechargeDelay = 100;
        ship.update(6);

        expect(ship.hull).toBeCloseTo(ship.maxHull * 0.28, 10);
        expect(ship.disabledDamage).toBe(0);
    });

    it('Shield Cell changes shield only', () => {
        const fleet = createFleet();
        const ship = fleet.ships[0];
        ship.hull -= 5;
        ship.armor -= 7;
        ship.shield -= 30;
        ship.energy -= 11;
        fleet.abilities.shield.charges = 1;
        const before = { hull: ship.hull, armor: ship.armor, shield: ship.shield, energy: ship.energy };

       const result = AbilityService.activate(fleet, 'shield');
        ship.shieldRechargeDelay = 100;
        fleet.fuel = 0;
        fleet.update(TACTICAL_BALANCE.shieldCellDuration);

       expect(result.ok).toBe(true);
        expect(ship.shield).toBeCloseTo(before.shield + fleet.maxShield * TACTICAL_BALANCE.shieldCellFraction, 10);
        expect(ship.hull).toBe(before.hull);
        expect(ship.armor).toBe(before.armor);
        expect(ship.energy).toBe(before.energy);
        expect(fleet.abilities.shield.charges).toBe(0);
    });

    it('Weapon Overcharge has no upfront Energy cost and charges readiness on expiry', () => {
        const fleet = createFleet();
        const ship = fleet.ships[0];
        ship.hull -= 5;
        ship.armor -= 7;
        ship.shield -= 9;
        fleet.abilities.fire.charges = 1;
        const before = { hull: ship.hull, armor: ship.armor, shield: ship.shield, energy: ship.energy };

        const result = AbilityService.activate(fleet, 'fire');

        expect(result.ok).toBe(true);
        expect(ship.overchargeTimer).toBe(fleet.abilities.fire.duration);
        expect(ship.energy).toBe(before.energy);
        expect(ship.hull).toBe(before.hull);
        expect(ship.armor).toBe(before.armor);
        expect(ship.shield).toBe(before.shield);
        expect(fleet.abilities.fire.charges).toBe(0);
        expect(ABILITY_DEFINITIONS.fire.readinessCost).toBe(5);

        fleet.update(fleet.abilities.fire.duration);
        expect(fleet.operationalReadiness).toBe(95);
    });

    it('does not consume charges for invalid Repair, Shield Cell, or Overcharge targets', () => {
        const repairFleet = createFleet();
        repairFleet.abilities.medkit.charges = 1;
        expect(AbilityService.activate(repairFleet, 'medkit').ok).toBe(false);
        expect(repairFleet.abilities.medkit.charges).toBe(1);

        const shieldFleet = createFleet();
        shieldFleet.abilities.shield.charges = 1;
        expect(AbilityService.activate(shieldFleet, 'shield').ok).toBe(false);
        expect(shieldFleet.abilities.shield.charges).toBe(1);

        const fireFleet = createFleet();
        fireFleet.ships[0].state = 'destroyed';
        fireFleet.abilities.fire.charges = 1;
        expect(AbilityService.activate(fireFleet, 'fire').ok).toBe(false);
        expect(fireFleet.abilities.fire.charges).toBe(1);
        expect(fireFleet.ships[0].overchargeTimer).toBe(0);

        const emptyEnergyFleet = createFleet();
        emptyEnergyFleet.ships[0].energy = 0;
        emptyEnergyFleet.abilities.fire.charges = 1;
        expect(AbilityService.activate(emptyEnergyFleet, 'fire').ok).toBe(false);
        expect(emptyEnergyFleet.abilities.fire.charges).toBe(1);
    });
});

describe('supplies and station service', () => {
    function createRepairFleet() {
        const fleet = createFleet();
        const support = new Ship({ hullId: 'tender', weaponIds: ['pulse'], moduleIds: [] });
        support.order = { type: 'repair', issuedAt: 0 };
        fleet.ships.push(support);
        return fleet;
    }

    it('spends exactly two supplies over four seconds to stabilize disabled hull', () => {
        const fleet = createRepairFleet();
        const target = fleet.ships[0];
        target.state = 'disabled';
        target.hull = 0;
        fleet.supplies = 2;

        RepairService.update(fleet, TACTICAL_BALANCE.disabledStabilizeSeconds, true);

        expect(target.state).toBe('active');
        expect(target.hull).toBeCloseTo(target.maxHull * TACTICAL_BALANCE.disabledStabilizeHullFraction, 10);
        expect(fleet.supplies).toBe(0);
    });

    it('uses the documented hull, armor and ammunition ratios outside combat', () => {
        const fleet = createRepairFleet();
        const target = fleet.ships[0];

        target.hull -= TACTICAL_BALANCE.fieldHullPerSupply;
        fleet.supplies = 1;
        RepairService.update(fleet, TACTICAL_BALANCE.fieldHullPerSupply / TACTICAL_BALANCE.fieldHullRepairPerSecond, false);
        expect(target.hull).toBe(target.maxHull);
        expect(fleet.supplies).toBeCloseTo(0, 10);

        target.armor -= TACTICAL_BALANCE.fieldArmorPerSupply;
        fleet.supplies = 1;
        RepairService.update(fleet, TACTICAL_BALANCE.fieldArmorPerSupply / TACTICAL_BALANCE.fieldArmorRepairPerSecond, false);
        expect(target.armor).toBe(target.maxArmor);
        expect(fleet.supplies).toBeCloseTo(0, 10);

        target.ammunition -= TACTICAL_BALANCE.ammunitionPerSupply;
        fleet.supplies = 1;
        RepairService.update(fleet, TACTICAL_BALANCE.ammunitionPerSupply / TACTICAL_BALANCE.fieldAmmoRestorePerSecond, false);
        expect(target.ammunition).toBe(target.definition.ammunition * target.statScale);
        expect(fleet.supplies).toBeCloseTo(0, 10);
    });

    it('quotes paid logistics and structural work while recharging shield and Energy for free', () => {
        const fleet = createFleet();
        const ship = fleet.ships[0];
        fleet.fuel -= 2;
        fleet.supplies -= 1;
        ship.ammunition -= 3;
        ship.hull -= 4;
        ship.armor -= 5;
        ship.shield = 0;
        ship.energy = 0;

        const quote = RepairService.quoteStationService(fleet);
        expect(quote.total).toBe(2 * TACTICAL_BALANCE.stationFuelPrice
            + TACTICAL_BALANCE.stationSupplyPrice
            + 3 * TACTICAL_BALANCE.stationAmmoPrice
            + 4 * TACTICAL_BALANCE.stationHullPrice
            + 5 * TACTICAL_BALANCE.stationArmorPrice);

        RepairService.restoreAtStation(fleet);
        expect(ship.shield).toBe(ship.maxShield);
        expect(ship.energy).toBe(ship.maxEnergy);
        expect(ship.hull).toBe(ship.maxHull - 4);
        expect(ship.armor).toBe(ship.maxArmor - 5);
        expect(fleet.fuel).toBe(fleet.maxFuel - 2);
        expect(fleet.supplies).toBe(fleet.maxSupplies - 1);
    });

    it('partially refuels with the available station budget', () => {
        const fleet = createRepairFleet();
        fleet.fuel = fleet.maxFuel - 10;
        fleet.money = 3;

        const result = RepairService.purchaseStationService(fleet, 'fuel');

        expect(result.ok).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.cost).toBeCloseTo(3, 10);
        expect(fleet.money).toBeCloseTo(0, 10);
        expect(fleet.fuel).toBeCloseTo(fleet.maxFuel - (10 - 3 / TACTICAL_BALANCE.stationFuelPrice), 10);
    });

    it('partially repairs hull when a full station repair is unaffordable', () => {
        const fleet = createRepairFleet();
        const target = fleet.ships[0];
        target.hull -= 20;
        fleet.money = 6;

        const result = RepairService.purchaseStationService(fleet, 'repairs');

        expect(result.ok).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.cost).toBeCloseTo(6, 10);
        expect(target.hull).toBeCloseTo(target.maxHull - 10, 10);
        expect(fleet.money).toBeCloseTo(0, 10);
    });

    it('does not stabilize a disabled ship for free at Terra', () => {
        const fleet = createRepairFleet();
        const target = fleet.ships[0];
        target.state = 'disabled';
        target.hull = 0;
        fleet.money = 0;

        const unpaid = RepairService.purchaseStationService(fleet, 'repairs');
        expect(unpaid.ok).toBe(false);
        expect(target.state).toBe('disabled');
        expect(target.hull).toBe(0);

        fleet.money = 22;
        const paid = RepairService.purchaseStationService(fleet, 'repairs');
        expect(paid.ok).toBe(true);
        expect(target.state).toBe('active');
        expect(target.hull).toBeGreaterThanOrEqual(target.maxHull * TACTICAL_BALANCE.disabledStabilizeHullFraction);
    });

    it('defines a symmetric equipment market for every consumable charge', () => {
        const fleet = createFleet();
        fleet.money = ABILITY_EQUIPMENT_MARKET.buyPrice;
        fleet.abilities.bubble.charges = 1;

        fleet.money -= ABILITY_EQUIPMENT_MARKET.buyPrice;
        fleet.abilities.bubble.charges++;
        fleet.money += ABILITY_EQUIPMENT_MARKET.sellPrice;
        fleet.abilities.bubble.charges--;

        expect(fleet.abilities.bubble.charges).toBe(1);
        expect(fleet.money).toBe(ABILITY_EQUIPMENT_MARKET.sellPrice);
        expect(ABILITY_EQUIPMENT_MARKET.maxCharges).toBe(10);
    });
});

describe('ship tactical persistence', () => {
    it('round-trips damaged systems, disabled damage, and shield recharge delay', () => {
        const ship = createFleet().ships[0];
        ship.damagedSystems = ['sensors', 'weapons'];
        ship.disabledDamage = 13.5;
        ship.shieldRechargeDelay = 2.75;

        const restored = Ship.fromSnapshot(ship.snapshot());

        expect(restored.damagedSystems).toEqual(['sensors', 'weapons']);
        expect(restored.damagedSystems).not.toBe(ship.damagedSystems);
        expect(restored.disabledDamage).toBe(13.5);
        expect(restored.shieldRechargeDelay).toBe(2.75);
    });
});

describe('Terra defense ring', () => {
    it('does not create permanent defense fleets around Terra', () => {
        const entities = new SystemManager().getSystemEntities(1);
        const defenseFleets = entities.filter(entity => entity instanceof Fleet && entity.faction === 'military' && entity.maxSpeed === 0);

        expect(defenseFleets).toHaveLength(0);
    });
});
