import type { Fleet } from '../entities/Fleet';

export class RepairService {
    static update(fleet: Fleet, dt: number, inCombat: boolean) {
        const support = fleet.ships.find(ship => ship.alive && ship.role === 'support');
        if (!support || fleet.supplies <= 0) return;

        const disabled = fleet.ships.find(ship => ship.state === 'disabled');
        if (disabled && support.order.type === 'repair' && fleet.supplies >= 2) {
            fleet.stabilizationProgress += dt;
            if (fleet.stabilizationProgress >= 4) {
                disabled.stabilize();
                fleet.supplies -= 2;
                fleet.stabilizationProgress = 0;
            }
            return;
        }
        fleet.stabilizationProgress = 0;

        const damaged = fleet.ships.filter(ship => ship.alive && ship.hull < ship.maxHull).sort((a, b) => a.integrity - b.integrity)[0];
        if (!damaged) return;
        if (inCombat && support.order.type !== 'repair') return;

        const rate = inCombat ? 0.8 : 4;
        const repair = Math.min(rate * dt, damaged.maxHull - damaged.hull, fleet.supplies * 5);
        damaged.restore(repair);
        fleet.supplies = Math.max(0, fleet.supplies - repair / 5);
    }

    static restoreAtStation(fleet: Fleet) {
        for (const ship of fleet.ships) {
            if (ship.state === 'destroyed') continue;
            if (ship.state === 'disabled') ship.stabilize();
            ship.hull = ship.maxHull;
            ship.armor = ship.maxArmor;
            ship.shield = ship.maxShield;
            ship.energy = ship.maxEnergy;
            ship.flux = 0;
            ship.ammunition = ship.definition.ammunition * ship.statScale;
            ship.fuel = ship.definition.fuel * ship.statScale;
            ship.crew = ship.definition.crew * ship.statScale;
            ship.damagedSystems = [];
        }
        fleet.supplies = fleet.maxSupplies;
    }
}
