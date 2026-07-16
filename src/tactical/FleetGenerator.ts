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
    rank: number;
    size: 'small' | 'medium' | 'large';
    sizeRequired: number;
    techRequired: number;
    requiredSkills?: Partial<Record<FleetSkillId, number>>;
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

export function getShopRequirements(offer: Pick<ShopShipDefinition, 'sizeRequired' | 'techRequired' | 'requiredSkills'>): Partial<Record<FleetSkillId, number>> {
    const requirements: Partial<Record<FleetSkillId, number>> = {};
    if (offer.sizeRequired > 0) requirements.size = offer.sizeRequired;
    if (offer.techRequired > 0) requirements.tech = offer.techRequired;
    for (const [skill, level] of Object.entries(offer.requiredSkills || {})) {
        if (typeof level === 'number' && level > 0) requirements[skill as FleetSkillId] = level;
    }
    return requirements;
}

type ShopShipSeed = Omit<ShopShipDefinition, 'price'>;

function createShopShip(seed: ShopShipSeed): ShopShipDefinition {
    return { ...seed, price: seed.basePrice * getShopMultiplier(seed) };
}

export const SHOP_SHIPS: ShopShipDefinition[] = [
    createShopShip({ id: 'wisp', name: 'Wisp', role: 'scout', loadout: LOADOUTS.scout, basePrice: 250, rank: 1, size: 'small', sizeRequired: 0, techRequired: 0 }),
    createShopShip({ id: 'needle', name: 'Needle', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 300, rank: 2, size: 'small', sizeRequired: 0, techRequired: 1, requiredSkills: { sensors: 1, tactics: 1 } }),
    createShopShip({ id: 'lance', name: 'Lance', role: 'striker', loadout: LOADOUTS.striker, basePrice: 400, rank: 3, size: 'medium', sizeRequired: 1, techRequired: 0, requiredSkills: { navigation: 1, tactics: 1 } }),
    createShopShip({ id: 'tender', name: 'Tender', role: 'support', loadout: LOADOUTS.support, basePrice: 450, rank: 4, size: 'medium', sizeRequired: 1, techRequired: 1, requiredSkills: { logistics: 1, engineering: 1 } }),
    createShopShip({ id: 'command-cruiser', name: 'Command Cruiser', role: 'flagship', loadout: LOADOUTS.flagship, basePrice: 625, rank: 5, size: 'large', sizeRequired: 2, techRequired: 0, requiredSkills: { leadership: 2, tactics: 1 } }),
    createShopShip({ id: 'bulwark', name: 'Bulwark', role: 'defender', loadout: LOADOUTS.defender, basePrice: 750, rank: 6, size: 'large', sizeRequired: 2, techRequired: 0, requiredSkills: { engineering: 2, tactics: 2 } }),
    createShopShip({ id: 'longbow', name: 'Longbow', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 300, rank: 7, size: 'large', sizeRequired: 2, techRequired: 2, requiredSkills: { sensors: 2, tactics: 2 } }),
    createShopShip({ id: 'lance-mk4', name: 'Lance Mk IV', role: 'striker', loadout: LOADOUTS.striker, basePrice: 400, rank: 8, size: 'medium', sizeRequired: 1, techRequired: 3, requiredSkills: { navigation: 3, tactics: 2 } }),
    createShopShip({ id: 'tender-prime', name: 'Tender Prime', role: 'support', loadout: LOADOUTS.support, basePrice: 450, rank: 9, size: 'large', sizeRequired: 2, techRequired: 2, requiredSkills: { logistics: 3, engineering: 3 } }),
    createShopShip({ id: 'aegis-apex', name: 'Aegis Apex', role: 'flagship', loadout: LOADOUTS.flagship, basePrice: 625, rank: 10, size: 'large', sizeRequired: 3, techRequired: 1, requiredSkills: { leadership: 3, tactics: 3, sensors: 2 } }),
    createShopShip({ id: 'bulwark-bastion', name: 'Bulwark Bastion', role: 'defender', loadout: LOADOUTS.defender, basePrice: 750, rank: 11, size: 'large', sizeRequired: 3, techRequired: 1, requiredSkills: { engineering: 4, tactics: 4, leadership: 3 } }),
    createShopShip({ id: 'longbow-leviathan', name: 'Longbow Leviathan', role: 'artillery', loadout: LOADOUTS.artillery, basePrice: 300, rank: 12, size: 'large', sizeRequired: 3, techRequired: 5, requiredSkills: { tactics: 5, sensors: 4, engineering: 4 } })
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
    const utilityBase = offer.role === 'support' || offer.role === 'scout' ? 6 : offer.role === 'defender' || offer.role === 'flagship' ? 5 : 2;
    const utility = utilityBase * scale;
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
    static generate(targetThreat: number, faction: Faction, maxShips = 8): Ship[] {
        const target = Math.max(0, targetThreat);
        const limit = Math.min(8, Math.max(1, Math.floor(maxShips)));
        const shipCount = Math.min(limit, Math.max(1, Math.round(target / 35)));
        const roles = DOCTRINES[faction] || DOCTRINES.civilian;
        const veryWeak = target < 35;
        const ships: Ship[] = [];

        for (let index = 0; index < shipCount; index++) {
            const role = veryWeak ? 'striker' : roles[index % roles.length];
            const loadout = LOADOUTS[role];
            const ship = new Ship({ ...loadout, weaponIds: [...loadout.weaponIds], moduleIds: [...loadout.moduleIds] });
            if (ship.role === 'defender') ship.order = { type: 'protect', issuedAt: 0 };
            if (ship.role === 'support') ship.order = { type: 'repair', issuedAt: 0 };
            ships.push(ship);
        }

        const baseThreat = ships.reduce((sum, ship) => sum + ship.maxCombatRating, 0);
        const scale = baseThreat > 0 ? target / baseThreat : 1;
        for (const ship of ships) ship.setStatScale(scale);
        return ships;
    }
}
