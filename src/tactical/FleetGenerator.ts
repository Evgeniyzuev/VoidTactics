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
    basePrice: number;
    price: number;
    requiredLevel: number;
    description: string;
    size: 'small' | 'medium' | 'large';
    tier: number;
    sizeRequired: number;
    techRequired: number;
    requiredSkill?: { skill: FleetSkillId; level: number };
}

export function getShopSizeMultiplier(sizeRequired: number): number {
    return sizeRequired + 1;
}

export function getShopTechMultiplier(techRequired: number): number {
    return techRequired + 1;
}

export function getShopMultiplier(offer: Pick<ShopShipDefinition, 'sizeRequired' | 'techRequired'>): number {
    return getShopSizeMultiplier(offer.sizeRequired) * getShopTechMultiplier(offer.techRequired);
}

type ShopShipSeed = Omit<ShopShipDefinition, 'price'>;

function createShopShip(seed: ShopShipSeed): ShopShipDefinition {
    return { ...seed, price: seed.basePrice * getShopMultiplier(seed) };
}

export const SHOP_SHIPS: ShopShipDefinition[] = [
    createShopShip({ id: 'flagship', name: 'Command Cruiser', role: 'flagship', loadout: LOADOUTS.flagship, basePrice: 1200, requiredLevel: 1, size: 'large', tier: 0, sizeRequired: 2, techRequired: 0, description: 'Command link and balanced weapons.' }),
    createShopShip({ id: 'defender', name: 'Bulwark', role: 'defender', loadout: LOADOUTS.defender, basePrice: 850, requiredLevel: 1, size: 'large', tier: 0, sizeRequired: 2, techRequired: 0, description: 'Intercepts attacks and anchors the formation.' }),
    createShopShip({ id: 'striker', name: 'Lance', role: 'striker', loadout: LOADOUTS.striker, basePrice: 900, requiredLevel: 1, size: 'medium', tier: 0, sizeRequired: 1, techRequired: 0, description: 'Short and medium range damage dealer.' }),
    createShopShip({ id: 'support', name: 'Tender', role: 'support', loadout: LOADOUTS.support, basePrice: 1000, requiredLevel: 1, size: 'large', tier: 0, sizeRequired: 2, techRequired: 0, description: 'Repairs hulls and stabilizes disabled ships.' }),
    createShopShip({ id: 'scout', name: 'Specter', role: 'scout', loadout: LOADOUTS.scout, basePrice: 1100, requiredLevel: 2, size: 'small', tier: 0, sizeRequired: 0, techRequired: 0, description: 'Detection and electronic warfare.' }),
    createShopShip({ id: 'artillery', name: 'Siege', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 1400, requiredLevel: 3, size: 'large', tier: 0, sizeRequired: 2, techRequired: 0, description: 'Long-range firepower; needs reconnaissance.' }),
    createShopShip({ id: 'command-mk3', name: 'Command Cruiser Mk III', role: 'flagship', loadout: LOADOUTS.flagship, basePrice: 1200, requiredLevel: 3, size: 'large', tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: Tech 2 command systems.' }),
    createShopShip({ id: 'bulwark-mk4', name: 'Bulwark Mk IV', role: 'defender', loadout: LOADOUTS.defender, basePrice: 850, requiredLevel: 5, size: 'large', tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: fortress-grade armor and interception.' }),
    createShopShip({ id: 'lance-mk4', name: 'Lance Mk IV', role: 'striker', loadout: LOADOUTS.striker, basePrice: 900, requiredLevel: 4, size: 'medium', tier: 1, sizeRequired: 1, techRequired: 1, description: 'Tier 1: high-output assault ship.' }),
    createShopShip({ id: 'tender-mk3', name: 'Tender Mk III', role: 'support', loadout: LOADOUTS.support, basePrice: 1000, requiredLevel: 4, size: 'large', tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: mobile repair and logistics platform.' }),
    createShopShip({ id: 'specter-mk4', name: 'Specter Mk IV', role: 'scout', loadout: LOADOUTS.scout, basePrice: 1100, requiredLevel: 4, size: 'small', tier: 1, sizeRequired: 0, techRequired: 1, description: 'Tier 1: deep reconnaissance and electronic warfare.' }),
    createShopShip({ id: 'siege-mk7', name: 'Longbow Mk VII', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 1400, requiredLevel: 7, size: 'large', tier: 1, sizeRequired: 2, techRequired: 1, description: 'Tier 1: strategic artillery with extreme range.' }),
    createShopShip({ id: 'command-apex', name: 'Aegis Apex', role: 'flagship', loadout: LOADOUTS.flagship, basePrice: 1200, requiredLevel: 10, size: 'large', tier: 2, sizeRequired: 2, techRequired: 2, description: 'Tier 2: Tech 3 command systems.' }),
    createShopShip({ id: 'siege-apex', name: 'Longbow Apex', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 1400, requiredLevel: 12, size: 'large', tier: 2, sizeRequired: 2, techRequired: 2, description: 'Tier 2: endgame artillery platform.' }),
    createShopShip({ id: 'command-leviathan', name: 'Aegis Leviathan', role: 'flagship', loadout: LOADOUTS.flagship, basePrice: 1200, requiredLevel: 20, size: 'large', tier: 3, sizeRequired: 2, techRequired: 3, description: 'Tier 3: Tech 4 command systems.' }),
    createShopShip({ id: 'siege-leviathan', name: 'Longbow Leviathan', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 1400, requiredLevel: 24, size: 'large', tier: 3, sizeRequired: 2, techRequired: 3, description: 'Tier 3: superheavy siege platform.' })
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
    const scale = getShopMultiplier(offer);
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
