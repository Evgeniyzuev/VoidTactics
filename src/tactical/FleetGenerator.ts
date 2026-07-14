import type { Faction } from '../entities/Fleet';
import { Ship } from './Ship';
import { HULLS, type ShipLoadout, type ShipRole } from './ShipDefinitions';

const LOADOUTS: Record<ShipRole, ShipLoadout> = {
    flagship: { hullId: 'command', weaponIds: ['pulse', 'autocannon'], moduleIds: ['commandLink'] },
    defender: { hullId: 'bulwark', weaponIds: ['autocannon', 'autocannon'], moduleIds: [] },
    striker: { hullId: 'lance', weaponIds: ['pulse', 'missile'], moduleIds: [] },
    artillery: { hullId: 'siege', weaponIds: ['railgun'], moduleIds: [] },
    scout: { hullId: 'specter', weaponIds: ['jammer'], moduleIds: ['electronicSuite'] },
    support: { hullId: 'tender', weaponIds: ['pulse'], moduleIds: ['repairDrones'] }
};

const DOCTRINES: Record<Faction, ShipRole[]> = {
    player: ['flagship', 'defender', 'striker', 'support', 'scout', 'artillery'],
    civilian: ['support', 'scout', 'defender', 'striker'],
    trader: ['support', 'defender', 'striker', 'scout'],
    military: ['flagship', 'defender', 'striker', 'artillery', 'support', 'scout'],
    mercenary: ['flagship', 'striker', 'defender', 'artillery', 'scout', 'support'],
    pirate: ['striker', 'scout', 'striker', 'artillery', 'defender'],
    orc: ['defender', 'striker', 'striker', 'artillery'],
    raider: ['scout', 'striker', 'artillery', 'striker']
};

export class FleetGenerator {
    static generate(budget: number, faction: Faction, maxShips = 8): Ship[] {
        const targetBudget = Math.max(20, Math.min(280, budget));
        const roles = DOCTRINES[faction] || DOCTRINES.civilian;
        const ships: Ship[] = [];
        let spent = 0;
        let cursor = Math.abs(Math.floor(budget * 17 + faction.length * 13)) % roles.length;

        while (ships.length < maxShips) {
            const role = roles[cursor % roles.length];
            const loadout = LOADOUTS[role];
            const cost = HULLS[loadout.hullId].tacticalValue;
            if (ships.length > 0 && spent + cost > targetBudget) break;
            const ship = new Ship({ ...loadout, weaponIds: [...loadout.weaponIds], moduleIds: [...loadout.moduleIds] });
            if (ship.role === 'defender') ship.order = { type: 'protect', issuedAt: 0 };
            if (ship.role === 'support') ship.order = { type: 'repair', issuedAt: 0 };
            ships.push(ship);
            spent += cost;
            cursor++;
        }

        return ships.length ? ships : [new Ship(LOADOUTS.scout)];
    }
}
