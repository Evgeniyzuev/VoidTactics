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
        if (!support || fleet.supplies <= 0) return;

        const disabled = fleet.ships.find(ship => ship.state === 'disabled');
        if (disabled && support.order.type === 'repair' && fleet.supplies >= TACTICAL_BALANCE.disabledStabilizeSupplyCost) {
            fleet.stabilizationProgress += dt;
            if (fleet.stabilizationProgress >= TACTICAL_BALANCE.disabledStabilizeSeconds) {
                disabled.stabilize();
                fleet.supplies -= TACTICAL_BALANCE.disabledStabilizeSupplyCost;
                fleet.stabilizationProgress = 0;
            }
            return;
        }
        fleet.stabilizationProgress = 0;

        const damaged = fleet.ships.filter(ship => ship.alive && ship.hull < ship.maxHull).sort((a, b) => a.integrity - b.integrity)[0];
        if (inCombat && support.order.type !== 'repair') return;

        const engineeringBonus = 1 + fleet.getSkillLevel('engineering') * 0.2;
        if (damaged) {
            const rate = (inCombat ? TACTICAL_BALANCE.combatHullRepairPerSecond : TACTICAL_BALANCE.fieldHullRepairPerSecond) * engineeringBonus;
            const repair = Math.min(rate * dt, damaged.maxHull - damaged.hull, fleet.supplies * TACTICAL_BALANCE.fieldHullPerSupply);
            damaged.restore(repair);
            fleet.supplies = Math.max(0, fleet.supplies - repair / TACTICAL_BALANCE.fieldHullPerSupply);
            return;
        }
        if (inCombat) return;

        const armorTarget = fleet.ships.filter(ship => ship.alive && ship.armor < ship.maxArmor)
            .sort((a, b) => a.armor / Math.max(1, a.maxArmor) - b.armor / Math.max(1, b.maxArmor))[0];
        if (armorTarget) {
            const repair = Math.min(TACTICAL_BALANCE.fieldArmorRepairPerSecond * engineeringBonus * dt, armorTarget.maxArmor - armorTarget.armor, fleet.supplies * TACTICAL_BALANCE.fieldArmorPerSupply);
            armorTarget.armor += repair;
            fleet.supplies = Math.max(0, fleet.supplies - repair / TACTICAL_BALANCE.fieldArmorPerSupply);
            return;
        }

        const ammoTarget = fleet.ships.filter(ship => ship.alive && ship.ammunition < ship.definition.ammunition * ship.statScale)[0];
        if (ammoTarget) {
            const maximum = ammoTarget.definition.ammunition * ammoTarget.statScale;
            const restored = Math.min(TACTICAL_BALANCE.fieldAmmoRestorePerSecond * engineeringBonus * dt, maximum - ammoTarget.ammunition, fleet.supplies * TACTICAL_BALANCE.ammunitionPerSupply);
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
        const repairsTotal = Math.ceil(supplies + ammunition + hull + armor);
        return { fuel, supplies, ammunition, hull, armor, repairsTotal, total: Math.ceil(fuel + supplies + ammunition + hull + armor) };
    }

    static purchaseStationService(fleet: Fleet, mode: StationServiceMode = 'all'): StationServiceResult {
        const quote = this.quoteStationService(fleet);
        const requestedCost = mode === 'fuel' ? Math.ceil(quote.fuel) : mode === 'repairs' ? quote.repairsTotal : quote.total;
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
            fleet.supplies += buy(Math.max(0, fleet.maxSupplies - fleet.supplies), TACTICAL_BALANCE.stationSupplyPrice);

            const serviceable = fleet.ships.filter(ship => ship.state !== 'destroyed');
            for (const ship of serviceable) {
                if (ship.state === 'disabled' && ship.hull < ship.maxHull) ship.stabilize();
                const ammunition = buy(
                    Math.max(0, ship.definition.ammunition * ship.statScale - ship.ammunition),
                    TACTICAL_BALANCE.stationAmmoPrice
                );
                ship.ammunition += ammunition;
            }
            for (const ship of serviceable) {
                const hull = buy(Math.max(0, ship.maxHull - ship.hull), TACTICAL_BALANCE.stationHullPrice);
                ship.hull = Math.min(ship.maxHull, ship.hull + hull);
            }
            for (const ship of serviceable) {
                const armor = buy(Math.max(0, ship.maxArmor - ship.armor), TACTICAL_BALANCE.stationArmorPrice);
                ship.armor = Math.min(ship.maxArmor, ship.armor + armor);
            }
        }

        fleet.money = Math.max(0, budget);
        this.restoreAtStation(fleet);
        const fullyPaid = startingMoney >= requestedCost;
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
