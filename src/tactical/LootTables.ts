import { pick, rand, randInt, weightedPick } from '../utils/Rng';
import type { FleetAbilityId } from './AbilityService';

export interface LootDrop {
    abilityIds: FleetAbilityId[];
    resources: { fuel: number; supplies: number } | null;
    salvageMultiplier: number;
    /** Chance of a relic draft (1 = guaranteed). */
    relicChance: number;
}

interface FactionLoot {
    abilities: Partial<Record<FleetAbilityId, number>>;
    resourceChance: number;
    salvage: number;
}

/** What each faction tends to carry; weights are relative within a faction. */
const FACTION_LOOT: Record<string, FactionLoot> = {
    civilian: { abilities: { shield: 2, medkit: 2, afterburner: 1 }, resourceChance: 0.5, salvage: 0.8 },
    trader: { abilities: { afterburner: 1, medkit: 1 }, resourceChance: 0.9, salvage: 2.0 },
    pirate: { abilities: { afterburner: 3, mine: 2, decoy: 2, fire: 1 }, resourceChance: 0.35, salvage: 1.1 },
    orc: { abilities: { fire: 3, bubble: 2, medkit: 2, net: 1 }, resourceChance: 0.2, salvage: 1.0 },
    raider: { abilities: { cloak: 3, decoy: 2, mine: 2, net: 2 }, resourceChance: 0.25, salvage: 1.3 },
    military: { abilities: { shield: 3, net: 2, medkit: 2, bubble: 2 }, resourceChance: 0.4, salvage: 1.2 },
    mercenary: { abilities: { fire: 2, afterburner: 2, net: 2, shield: 1 }, resourceChance: 0.3, salvage: 1.2 }
};

const FALLBACK_LOOT: FactionLoot = { abilities: { afterburner: 1, shield: 1, medkit: 1 }, resourceChance: 0.3, salvage: 1 };

/**
 * Rolls what a destroyed fleet drops. Stronger victims (relative to the
 * killer) roll more crates and a better relic chance; weaker prey still pays
 * a little so a snowball can start from easy hunts.
 */
export function rollLoot(victimFaction: string, victimPower: number, killerPower: number, wanted = false): LootDrop {
    const table = FACTION_LOOT[victimFaction] ?? FALLBACK_LOOT;
    const ratio = Math.max(0.01, victimPower) / Math.max(1, killerPower);

    let dropCount = rand() < 0.45 ? 1 : 2;
    if (ratio >= 1) dropCount += 1;
    if (ratio >= 3) dropCount += 1;
    if (wanted) dropCount += 2;

    const ids = Object.keys(table.abilities) as FleetAbilityId[];
    const abilityIds: FleetAbilityId[] = [];
    for (let i = 0; i < dropCount; i++) {
        abilityIds.push(ids.length > 0 ? weightedPick(ids, id => table.abilities[id] ?? 0) : pick(['afterburner', 'shield', 'medkit'] as FleetAbilityId[]));
    }

    const resources = rand() < table.resourceChance
        ? { fuel: randInt(8, 18) * (1 + Math.min(3, ratio)), supplies: randInt(1, 3) + (ratio >= 1 ? 2 : 0) }
        : null;

    const relicChance = wanted ? 1 : Math.max(0.04, Math.min(0.6, 0.05 + 0.1 * ratio));

    return { abilityIds, resources, salvageMultiplier: table.salvage * (wanted ? 2.5 : 1), relicChance };
}
