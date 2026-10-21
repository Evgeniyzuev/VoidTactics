import type { Faction, FleetSkillId } from '../entities/Fleet';
import { Ship } from './Ship';
import { COMBAT_BALANCE, getShipAccelerationMultiplier, getShipMassMultiplier, getShipProgressionScale, getShipSensorMultiplier, getShipSignatureMultiplier, getShipSpeedMultiplier, getShipTurnRateMultiplier, HULLS, MODULES, SHIP_PROGRESSION_BALANCE, TACTICAL_BALANCE, WEAPONS, type ShipLoadout, type ShipRole } from './ShipDefinitions';

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

export function getShopSizeLevel(offer: Pick<ShopShipDefinition, 'sizeRequired'>): number {
    return getShopSizeMultiplier(offer.sizeRequired);
}

export function getShopTechMultiplier(techRequired: number): number {
    return techRequired + 1;
}

export function getShopTechLevel(offer: Pick<ShopShipDefinition, 'techRequired'>): number {
    return getShopTechMultiplier(offer.techRequired);
}

export function getShopCommandCost(offer: Pick<ShopShipDefinition, 'sizeRequired'>): number {
    return getShopSizeLevel(offer);
}

export function getShopMultiplier(offer: Pick<ShopShipDefinition, 'sizeRequired' | 'techRequired'>): number {
    return getShopStatScale(offer);
}

export function getShopStatScale(offer: Pick<ShopShipDefinition, 'sizeRequired' | 'techRequired'>): number {
    return getShipProgressionScale(getShopSizeLevel(offer), getShopTechLevel(offer));
}

export function getShopRequirements(offer: Pick<ShopShipDefinition, 'sizeRequired' | 'techRequired' | 'requiredSkills'>): Partial<Record<FleetSkillId, number>> {
    const requirements: Partial<Record<FleetSkillId, number>> = {};
    // Every ship requires explicit Size and Tech training. This keeps the
    // starting skills meaningful: without spending points, nothing from the
    // shipyard matrix can be purchased, including Size 1 / Tech 1.
    requirements.size = getShopSizeLevel(offer);
    requirements.tech = getShopTechLevel(offer);
    for (const [skill, level] of Object.entries(offer.requiredSkills || {})) {
        if (typeof level === 'number' && level > 0) requirements[skill as FleetSkillId] = level;
    }
    return requirements;
}

// The first shipyard pass intentionally has one neutral chassis. Size and
// Tech are the only progression axes; combat roles remain available to NPC
// fleets and can be split into separate fittings later.
const SHIPYARD_BASE_ROLE: ShipRole = 'striker';
const SHIPYARD_BASE_PRICE = 145;

type ShipyardSizeLabel = ShopShipDefinition['size'];

function getShipyardSizeLabel(sizeLevel: number): ShipyardSizeLabel {
    if (sizeLevel <= 3) return 'small';
    if (sizeLevel <= 6) return 'medium';
    return 'large';
}

function createShopShip(sizeLevel: number, techLevel: number): ShopShipDefinition {
    const role = SHIPYARD_BASE_ROLE;
    const sizeRequired = sizeLevel - 1;
    const techRequired = techLevel - 1;
    const basePrice = SHIPYARD_BASE_PRICE;
    const price = Math.round(basePrice * sizeLevel * techLevel);
    return {
        id: `ship-s${sizeLevel}-t${techLevel}`,
        name: `S${String(sizeLevel).padStart(2, '0')} / T${String(techLevel).padStart(2, '0')}`,
        role,
        loadout: LOADOUTS[role],
        basePrice,
        price,
        rank: (sizeLevel - 1) * 10 + techLevel,
        size: getShipyardSizeLabel(sizeLevel),
        sizeRequired,
        techRequired
    };
}

/** The shipyard is deliberately a complete Size 1..10 by Tech 1..10 matrix. */
export const SHOP_SHIPS: ShopShipDefinition[] = Array.from({ length: 10 }, (_, sizeIndex) =>
    Array.from({ length: 10 }, (_, techIndex) => createShopShip(sizeIndex + 1, techIndex + 1))
).flat();

export interface ShopShipStats {
    threat: number;
    dps: number;
    shield: number;
    armor: number;
    hull: number;
    energy: number;
    energyRecharge: number;
    shieldRecharge: number;
    speed: number;
    acceleration: number;
    turnRate: number;
    sensorRange: number;
    signature: number;
    fuel: number;
    cargo: number;
    ammunition: number;
    mass: number;
    repair: number;
    commandCost: number;
}

export function getShopShipStats(offer: ShopShipDefinition): ShopShipStats {
    const hull = HULLS[offer.loadout.hullId];
    const sizeLevel = getShopSizeLevel(offer);
    const techLevel = getShopTechLevel(offer);
    const scale = getShopStatScale(offer);
    const modules = offer.loadout.moduleIds.map(id => MODULES[id]).filter(Boolean);
    const dps = offer.loadout.weaponIds.reduce((sum, id) => {
        const weapon = WEAPONS[id];
        return sum + (weapon ? weapon.damage / Math.max(0.1, weapon.cooldown) : 0);
    }, 0) * scale;
    const energy = (hull.energyCapacity + modules.reduce((sum, module) => sum + (module.energyCapacityModifier || 0), 0)) * scale;
    const energyRecharge = (hull.energyRecharge + modules.reduce((sum, module) => sum + (module.energyRechargeModifier || 0), 0)) * scale;
    const repair = modules.reduce((sum, module) => sum + (module.repairPerSecond || 0), 0) * scale;
    const utilityBase = offer.role === 'support' || offer.role === 'scout' ? 6 : offer.role === 'defender' || offer.role === 'flagship' ? 5 : 2;
    const utility = utilityBase * scale;
    return {
        threat: hull.hull * scale * COMBAT_BALANCE.hullThreatWeight + dps * COMBAT_BALANCE.offenseThreatWeight + utility,
        dps,
        shield: hull.shield * scale,
        armor: hull.armor * scale,
        hull: hull.hull * scale,
        energy,
        energyRecharge,
        shieldRecharge: hull.shield * scale * TACTICAL_BALANCE.shieldRechargeFraction,
        speed: SHIP_PROGRESSION_BALANCE.baseFleetSpeed * getShipSpeedMultiplier(sizeLevel, techLevel),
        acceleration: getShipAccelerationMultiplier(sizeLevel, techLevel),
        turnRate: getShipTurnRateMultiplier(sizeLevel, techLevel),
        sensorRange: hull.sensorRange * getShipSensorMultiplier(sizeLevel, techLevel),
        signature: hull.signature * Math.sqrt(Math.max(0.02, scale)) * getShipSignatureMultiplier(sizeLevel, techLevel),
        fuel: hull.fuelCapacity * scale,
        cargo: hull.cargo * scale,
        ammunition: hull.ammunition * scale,
        mass: hull.mass * getShipMassMultiplier(sizeLevel),
        repair,
        commandCost: sizeLevel
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
