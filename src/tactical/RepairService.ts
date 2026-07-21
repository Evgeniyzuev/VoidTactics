import type { Fleet } from '../entities/Fleet';
import { TACTICAL_BALANCE } from './ShipDefinitions';

export interface StationServiceQuote {
    fuel: number;
    supplies: number;
    ammunition: number;
    hull: number;
    armor: number;
    repairsTotal: number;
    total: number;
}

export type StationServiceMode = 'all' | 'fuel' | 'repairs';

export interface StationServiceResult {
    ok: boolean;
    cost: number;
    partial: boolean;
    mode: StationServiceMode;
}

export class RepairService {
    static update(fleet: Fleet, dt: number, inCombat: boolean) {
        const support = fleet.ships.find(ship => ship.alive && ship.role === 'support');
        if (fleet.supplies <= 0) return;

        const disabled = fleet.ships.find(ship => ship.state === 'disabled');
        if (disabled && support?.order.type === 'repair' &&
            fleet.supplies >= TACTICAL_BALANCE.disabledStabilizeSupplyCost &&
            fleet.totalEnergy >= TACTICAL_BALANCE.disabledStabilizeEnergyCost) {
            fleet.stabilizationProgress += dt;
            if (fleet.stabilizationProgress >= TACTICAL_BALANCE.disabledStabilizeSeconds) {
                disabled.stabilize();
                fleet.supplies -= TACTICAL_BALANCE.disabledStabilizeSupplyCost;
                fleet.consumePooledEnergy(TACTICAL_BALANCE.disabledStabilizeEnergyCost);
                fleet.stabilizationProgress = 0;
            }
            return;
        }
        fleet.stabilizationProgress = 0;

        const damaged = fleet.ships.filter(ship => ship.alive && ship.hull < ship.maxHull).sort((a, b) => a.integrity - b.integrity)[0];
        // A fleet can perform slow emergency field repairs by itself. A support
        // ship keeps the documented rate, making support the efficient option.
        if (inCombat && (!support || support.order.type !== 'repair')) return;
        const repairSpeedMultiplier = support?.order.type === 'repair' ? 1 : 0.25;

        const engineeringBonus = 1 + fleet.getSkillLevel('engineering') * 0.2;
        const repairWithResources = (desired: number, energyPerUnit: number, unitsPerSupply: number) => {
            const repair = Math.min(
                Math.max(0, desired),
                fleet.supplies * unitsPerSupply,
                fleet.totalEnergy / Math.max(0.001, energyPerUnit)
            );
            if (repair <= 0) return 0;
            fleet.supplies = Math.max(0, fleet.supplies - repair / unitsPerSupply);
            fleet.consumePooledEnergy(repair * energyPerUnit);
            return repair;
        };

        if (damaged) {
            const rate = (inCombat ? TACTICAL_BALANCE.combatHullRepairPerSecond : TACTICAL_BALANCE.fieldHullRepairPerSecond) * engineeringBonus * repairSpeedMultiplier;
            const repair = repairWithResources(
                Math.min(rate * dt, damaged.maxHull - damaged.hull),
                TACTICAL_BALANCE.fieldRepairEnergyPerHull,
                TACTICAL_BALANCE.fieldHullPerSupply
            );
            damaged.restore(repair);
            return;
        }

        const armorTarget = fleet.ships.filter(ship => ship.alive && ship.armor < ship.maxArmor)
            .sort((a, b) => a.armor / Math.max(1, a.maxArmor) - b.armor / Math.max(1, b.maxArmor))[0];
        if (armorTarget) {
            const armorRate = (inCombat ? TACTICAL_BALANCE.fieldArmorRepairPerSecond * 0.35 : TACTICAL_BALANCE.fieldArmorRepairPerSecond) * engineeringBonus * repairSpeedMultiplier;
            const repair = repairWithResources(
                Math.min(armorRate * dt, armorTarget.maxArmor - armorTarget.armor),
                TACTICAL_BALANCE.fieldRepairEnergyPerArmor,
                TACTICAL_BALANCE.fieldArmorPerSupply
            );
            armorTarget.armor += repair;
            return;
        }

        const ammoTarget = fleet.ships.filter(ship => ship.alive && ship.ammunition < ship.definition.ammunition * ship.statScale)[0];
        if (ammoTarget) {
            const maximum = ammoTarget.definition.ammunition * ammoTarget.statScale;
            const restored = Math.min(TACTICAL_BALANCE.fieldAmmoRestorePerSecond * engineeringBonus * repairSpeedMultiplier * dt, maximum - ammoTarget.ammunition, fleet.supplies * TACTICAL_BALANCE.ammunitionPerSupply);
            ammoTarget.ammunition += restored;
            fleet.supplies = Math.max(0, fleet.supplies - restored / TACTICAL_BALANCE.ammunitionPerSupply);
        }
    }

    /** Free dock-side recharge. Consumable and structural work is purchased separately. */
    static restoreAtStation(fleet: Fleet) {
        for (const ship of fleet.ships) {
            if (ship.state === 'destroyed') continue;
            ship.shield = ship.maxShield;
            ship.energy = ship.maxEnergy;
        }
    }

    static quoteStationService(fleet: Fleet): StationServiceQuote {
        const fuel = Math.max(0, fleet.maxFuel - fleet.fuel) * TACTICAL_BALANCE.stationFuelPrice;
        const supplies = Math.max(0, fleet.maxSupplies - fleet.supplies) * TACTICAL_BALANCE.stationSupplyPrice;
        const serviceable = fleet.ships.filter(ship => ship.state !== 'destroyed');
        const ammunition = serviceable.reduce((sum, ship) => (
            sum + Math.max(0, ship.definition.ammunition * ship.statScale - ship.ammunition)
        ), 0) * TACTICAL_BALANCE.stationAmmoPrice;
        const hull = serviceable.reduce((sum, ship) => sum + Math.max(0, ship.maxHull - ship.hull), 0) * TACTICAL_BALANCE.stationHullPrice;
        const armor = serviceable.reduce((sum, ship) => sum + Math.max(0, ship.maxArmor - ship.armor), 0) * TACTICAL_BALANCE.stationArmorPrice;
        const repairsTotal = supplies + ammunition + hull + armor;
        return { fuel, supplies, ammunition, hull, armor, repairsTotal, total: fuel + supplies + ammunition + hull + armor };
    }

    static purchaseStationService(fleet: Fleet, mode: StationServiceMode = 'all'): StationServiceResult {
        const quote = this.quoteStationService(fleet);
        const requestedCost = mode === 'fuel' ? quote.fuel : mode === 'repairs' ? quote.repairsTotal : quote.total;
        const startingMoney = Math.max(0, fleet.money);
        if (requestedCost <= 0) {
            this.restoreAtStation(fleet);
            return { ok: true, cost: 0, partial: false, mode };
        }

        let budget = startingMoney;
        let spent = 0;
        const buy = (units: number, price: number) => {
            if (units <= 0 || price <= 0 || budget <= 0) return 0;
            const purchased = Math.min(units, budget / price);
            const cost = purchased * price;
            budget -= cost;
            spent += cost;
            return purchased;
        };

        if (mode === 'all' || mode === 'fuel') {
            fleet.fuel += buy(Math.max(0, fleet.maxFuel - fleet.fuel), TACTICAL_BALANCE.stationFuelPrice);
        }

        if (mode === 'all' || mode === 'repairs') {
            const serviceable = fleet.ships.filter(ship => ship.state !== 'destroyed');

            // Put a limited repair budget into the most tangible damage first.
            // A disabled ship only returns to combat after enough paid hull has
            // been restored to reach the normal stabilization threshold.
            for (const ship of serviceable) {
                const hull = buy(Math.max(0, ship.maxHull - ship.hull), TACTICAL_BALANCE.stationHullPrice);
                ship.hull = Math.min(ship.maxHull, ship.hull + hull);
                if (ship.state === 'disabled' && ship.hull >= ship.maxHull * TACTICAL_BALANCE.disabledStabilizeHullFraction) {
                    ship.state = 'active';
                    ship.disabledDamage = 0;
                }
            }
            for (const ship of serviceable) {
                const armor = buy(Math.max(0, ship.maxArmor - ship.armor), TACTICAL_BALANCE.stationArmorPrice);
                ship.armor = Math.min(ship.maxArmor, ship.armor + armor);
            }
            for (const ship of serviceable) {
                const ammunition = buy(
                    Math.max(0, ship.definition.ammunition * ship.statScale - ship.ammunition),
                    TACTICAL_BALANCE.stationAmmoPrice
                );
                ship.ammunition += ammunition;
            }
            fleet.supplies += buy(Math.max(0, fleet.maxSupplies - fleet.supplies), TACTICAL_BALANCE.stationSupplyPrice);
        }

        fleet.money = Math.max(0, budget);
        this.restoreAtStation(fleet);
        const fullyPaid = startingMoney + 1e-6 >= requestedCost;
        if (fullyPaid && mode === 'all') {
            fleet.setReadiness(100);
        }
        if (mode !== 'fuel' && fleet.ships.every(ship => ship.state === 'destroyed' || (ship.hull >= ship.maxHull && ship.armor >= ship.maxArmor))) {
            for (const ship of fleet.ships) {
                if (ship.state !== 'destroyed') ship.damagedSystems = [];
            }
        }
        return {
            ok: spent > 0 || quote.total <= 0,
            cost: spent,
            partial: !fullyPaid,
            mode
        };
    }
}
