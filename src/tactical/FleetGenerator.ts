import type { Faction, FleetSkillId } from '../entities/Fleet';
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
    statScale: number;
    requiredSkill?: { skill: FleetSkillId; level: number };
}

export const SHOP_SHIPS: ShopShipDefinition[] = [
    { id: 'flagship', name: 'Command Cruiser', role: 'flagship', loadout: LOADOUTS.flagship, price: 1200, requiredLevel: 1, size: 'large', statScale: 1, description: 'Command link and balanced weapons.' },
    { id: 'defender', name: 'Bulwark', role: 'defender', loadout: LOADOUTS.defender, price: 850, requiredLevel: 1, size: 'large', statScale: 1, description: 'Intercepts attacks and anchors the formation.' },
    { id: 'striker', name: 'Lance', role: 'striker', loadout: LOADOUTS.striker, price: 900, requiredLevel: 1, size: 'medium', statScale: 1, description: 'Short and medium range damage dealer.' },
    { id: 'support', name: 'Tender', role: 'support', loadout: LOADOUTS.support, price: 1000, requiredLevel: 1, size: 'large', statScale: 1, description: 'Repairs hulls and stabilizes disabled ships.' },
    { id: 'scout', name: 'Specter', role: 'scout', loadout: LOADOUTS.scout, price: 1100, requiredLevel: 2, size: 'small', statScale: 1, description: 'Detection and electronic warfare.' },
    { id: 'artillery', name: 'Siege', role: 'artillery', loadout: LOADOUTS.artillery, price: 1400, requiredLevel: 3, size: 'large', statScale: 1, description: 'Long-range firepower; needs reconnaissance.' },
    { id: 'command-mk3', name: 'Command Cruiser Mk III', role: 'flagship', loadout: LOADOUTS.flagship, price: 7200, requiredLevel: 3, size: 'large', statScale: 3, requiredSkill: { skill: 'leadership', level: 4 }, description: 'Heavy command hull with triple systems.' },
    { id: 'bulwark-mk4', name: 'Bulwark Mk IV', role: 'defender', loadout: LOADOUTS.defender, price: 12500, requiredLevel: 5, size: 'large', statScale: 5, requiredSkill: { skill: 'tactics', level: 6 }, description: 'Fortress-grade armor and interception systems.' },
    { id: 'lance-mk4', name: 'Lance Mk IV', role: 'striker', loadout: LOADOUTS.striker, price: 9800, requiredLevel: 4, size: 'medium', statScale: 4, requiredSkill: { skill: 'tactics', level: 5 }, description: 'High-output assault ship.' },
    { id: 'tender-mk3', name: 'Tender Mk III', role: 'support', loadout: LOADOUTS.support, price: 8500, requiredLevel: 4, size: 'large', statScale: 4, requiredSkill: { skill: 'engineering', level: 5 }, description: 'Mobile repair and logistics platform.' },
    { id: 'specter-mk4', name: 'Specter Mk IV', role: 'scout', loadout: LOADOUTS.scout, price: 7800, requiredLevel: 4, size: 'small', statScale: 4, requiredSkill: { skill: 'sensors', level: 5 }, description: 'Deep reconnaissance and electronic warfare.' },
    { id: 'siege-mk7', name: 'Longbow Mk VII', role: 'artillery', loadout: LOADOUTS.artillery, price: 24000, requiredLevel: 7, size: 'large', statScale: 7, requiredSkill: { skill: 'sensors', level: 8 }, description: 'Strategic artillery with extreme range.' },
    { id: 'command-apex', name: 'Aegis Apex', role: 'flagship', loadout: LOADOUTS.flagship, price: 48000, requiredLevel: 10, size: 'large', statScale: 10, requiredSkill: { skill: 'leadership', level: 12 }, description: 'Late-game command ship; ten times the baseline systems.' },
    { id: 'siege-apex', name: 'Longbow Apex', role: 'artillery', loadout: LOADOUTS.artillery, price: 72000, requiredLevel: 12, size: 'large', statScale: 12, requiredSkill: { skill: 'tactics', level: 15 }, description: 'Endgame artillery platform with overwhelming output.' }
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
