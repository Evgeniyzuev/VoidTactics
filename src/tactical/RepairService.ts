import type { Fleet } from '../entities/Fleet';
import { TACTICAL_BALANCE } from './ShipDefinitions';

export interface StationServiceQuote {
    fuel: number;
    supplies: number;
    ammunition: number;
    hull: number;
    armor: number;
    total: number;
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
        return { fuel, supplies, ammunition, hull, armor, total: Math.ceil(fuel + supplies + ammunition + hull + armor) };
    }

    static purchaseStationService(fleet: Fleet) {
        const quote = this.quoteStationService(fleet);
        if (quote.total <= 0) {
            this.restoreAtStation(fleet);
            return { ok: true, cost: 0 };
        }
        if (fleet.money < quote.total) return { ok: false, cost: quote.total };
        fleet.money -= quote.total;
        for (const ship of fleet.ships) {
            if (ship.state === 'destroyed') continue;
            if (ship.state === 'disabled') ship.stabilize();
            ship.hull = ship.maxHull;
            ship.armor = ship.maxArmor;
            ship.shield = ship.maxShield;
            ship.energy = ship.maxEnergy;
            ship.ammunition = ship.definition.ammunition * ship.statScale;
            ship.crew = ship.definition.crew * ship.statScale;
            ship.damagedSystems = [];
        }
        fleet.fuel = fleet.maxFuel;
        fleet.supplies = fleet.maxSupplies;
        fleet.setReadiness(100);
        return { ok: true, cost: quote.total };
    }
}
