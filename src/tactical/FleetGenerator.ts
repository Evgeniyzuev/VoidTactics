import type { Faction, FleetSkillId } from '../entities/Fleet';
import { Ship } from './Ship';
import { COMBAT_BALANCE, HULLS, WEAPONS, type ShipLoadout, type ShipRole } from './ShipDefinitions';

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
    tier: number;
    sizeRequired: number;
    techRequired: number;
    requiredSkill?: { skill: FleetSkillId; level: number };
}

export const SHOP_SHIPS: ShopShipDefinition[] = [
    { id: 'flagship', name: 'Command Cruiser', role: 'flagship', loadout: LOADOUTS.flagship, price: 1200, requiredLevel: 1, size: 'large', statScale: 1.6, tier: 0, sizeRequired: 2, techRequired: 0, description: 'Command link and balanced weapons.' },
    { id: 'defender', name: 'Bulwark', role: 'defender', loadout: LOADOUTS.defender, price: 850, requiredLevel: 1, size: 'large', statScale: 1, tier: 0, sizeRequired: 2, techRequired: 0, description: 'Intercepts attacks and anchors the formation.' },
    { id: 'striker', name: 'Lance', role: 'striker', loadout: LOADOUTS.striker, price: 900, requiredLevel: 1, size: 'medium', statScale: 2.2, tier: 0, sizeRequired: 1, techRequired: 0, description: 'Short and medium range damage dealer.' },
    { id: 'support', name: 'Tender', role: 'support', loadout: LOADOUTS.support, price: 1000, requiredLevel: 1, size: 'large', statScale: 2.2, tier: 0, sizeRequired: 2, techRequired: 0, description: 'Repairs hulls and stabilizes disabled ships.' },
    { id: 'scout', name: 'Specter', role: 'scout', loadout: LOADOUTS.scout, price: 1100, requiredLevel: 2, size: 'small', statScale: 4.2, tier: 0, sizeRequired: 0, techRequired: 0, description: 'Detection and electronic warfare.' },
    { id: 'artillery', name: 'Siege', role: 'artillery', loadout: LOADOUTS.artillery, price: 1400, requiredLevel: 3, size: 'large', statScale: 4.5, tier: 0, sizeRequired: 2, techRequired: 0, description: 'Long-range firepower; needs reconnaissance.' },
    { id: 'command-mk3', name: 'Command Cruiser Mk III', role: 'flagship', loadout: LOADOUTS.flagship, price: 2160, requiredLevel: 3, size: 'large', statScale: 3.2, tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: approximately twice the command systems.' },
    { id: 'bulwark-mk4', name: 'Bulwark Mk IV', role: 'defender', loadout: LOADOUTS.defender, price: 1530, requiredLevel: 5, size: 'large', statScale: 2, tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: fortress-grade armor and interception.' },
    { id: 'lance-mk4', name: 'Lance Mk IV', role: 'striker', loadout: LOADOUTS.striker, price: 1620, requiredLevel: 4, size: 'medium', statScale: 4.4, tier: 1, sizeRequired: 1, techRequired: 1, description: 'Tier 1: high-output assault ship.' },
    { id: 'tender-mk3', name: 'Tender Mk III', role: 'support', loadout: LOADOUTS.support, price: 1800, requiredLevel: 4, size: 'large', statScale: 4.4, tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: mobile repair and logistics platform.' },
    { id: 'specter-mk4', name: 'Specter Mk IV', role: 'scout', loadout: LOADOUTS.scout, price: 1980, requiredLevel: 4, size: 'small', statScale: 8.4, tier: 1, sizeRequired: 0, techRequired: 1, description: 'Tier 1: deep reconnaissance and electronic warfare.' },
    { id: 'siege-mk7', name: 'Longbow Mk VII', role: 'artillery', loadout: LOADOUTS.artillery, price: 2520, requiredLevel: 7, size: 'large', statScale: 9, tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: strategic artillery with extreme range.' },
    { id: 'command-apex', name: 'Aegis Apex', role: 'flagship', loadout: LOADOUTS.flagship, price: 3888, requiredLevel: 10, size: 'large', statScale: 6.4, tier: 2, sizeRequired: 2, techRequired: 2, description: 'Tier 2: four times the baseline command systems.' },
    { id: 'siege-apex', name: 'Longbow Apex', role: 'artillery', loadout: LOADOUTS.artillery, price: 4536, requiredLevel: 12, size: 'large', statScale: 18, tier: 2, sizeRequired: 2, techRequired: 2, description: 'Tier 2: endgame artillery platform.' },
    { id: 'command-leviathan', name: 'Aegis Leviathan', role: 'flagship', loadout: LOADOUTS.flagship, price: 6998, requiredLevel: 20, size: 'large', statScale: 12.8, tier: 3, sizeRequired: 2, techRequired: 3, description: 'Tier 3: eight times the baseline command systems.' },
    { id: 'siege-leviathan', name: 'Longbow Leviathan', role: 'artillery', loadout: LOADOUTS.artillery, price: 8165, requiredLevel: 24, size: 'large', statScale: 36, tier: 3, sizeRequired: 2, techRequired: 3, description: 'Tier 3: superheavy siege platform.' }
];

export interface ShopShipStats {
    threat: number;
    dps: number;
    shield: number;
    armor: number;
    hull: number;
}

export function getShopShipStats(offer: ShopShipDefinition): ShopShipStats {
    const hull = HULLS[offer.loadout.hullId];
    const scale = offer.statScale;
    const dps = offer.loadout.weaponIds.reduce((sum, id) => {
        const weapon = WEAPONS[id];
        return sum + (weapon ? weapon.damage / Math.max(0.1, weapon.cooldown) : 0);
    }, 0) * scale;
    const utility = offer.role === 'support' || offer.role === 'scout' ? 6 : offer.role === 'defender' || offer.role === 'flagship' ? 5 : 2;
    return {
        threat: hull.hull * scale * COMBAT_BALANCE.hullThreatWeight + dps * COMBAT_BALANCE.offenseThreatWeight + utility,
        dps,
        shield: hull.shield * scale,
        armor: hull.armor * scale,
        hull: hull.hull * scale
    };
}

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
