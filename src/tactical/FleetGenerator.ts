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

export interface ShopShipDefinition {
    id: string;
    name: string;
    role: ShipRole;
    loadout: ShipLoadout;
    price: number;
    requiredLevel: number;
    description: string;
    size: 'small' | 'medium' | 'large';
}

export const SHOP_SHIPS: ShopShipDefinition[] = [
    { id: 'flagship', name: 'Command Cruiser', role: 'flagship', loadout: LOADOUTS.flagship, price: 1200, requiredLevel: 1, size: 'large', description: 'Command link and balanced weapons.' },
    { id: 'defender', name: 'Bulwark', role: 'defender', loadout: LOADOUTS.defender, price: 850, requiredLevel: 1, size: 'large', description: 'Intercepts attacks and anchors the formation.' },
    { id: 'striker', name: 'Lance', role: 'striker', loadout: LOADOUTS.striker, price: 900, requiredLevel: 1, size: 'medium', description: 'Short and medium range damage dealer.' },
    { id: 'support', name: 'Tender', role: 'support', loadout: LOADOUTS.support, price: 1000, requiredLevel: 1, size: 'large', description: 'Repairs hulls and stabilizes disabled ships.' },
    { id: 'scout', name: 'Specter', role: 'scout', loadout: LOADOUTS.scout, price: 1100, requiredLevel: 2, size: 'small', description: 'Detection and electronic warfare.' },
    { id: 'artillery', name: 'Siege', role: 'artillery', loadout: LOADOUTS.artillery, price: 1400, requiredLevel: 3, size: 'large', description: 'Long-range firepower; needs reconnaissance.' }
];

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
