import { weightedPick } from '../utils/Rng';

export type RelicId =
    | 'ghost-hull' | 'long-lens' | 'salvager' | 'bounty-chip'
    | 'thrifty-drive' | 'recycler' | 'siren' | 'veteran';

export interface RelicDefinition {
    id: RelicId;
    name: string;
    icon: string;
    rarity: 'common' | 'rare';
    description: string;
}

/** Relics bend the rules instead of adding a flat bonus; each has one hook. */
export const RELICS: Readonly<Record<RelicId, RelicDefinition>> = {
    'ghost-hull': { id: 'ghost-hull', name: 'Ghost Hull', icon: '👁', rarity: 'common', description: 'Fleet signature −20%: NPCs notice you later and give up sooner.' },
    'long-lens': { id: 'long-lens', name: 'Long Lens', icon: '🔭', rarity: 'common', description: 'Radar range +20%: see prey and danger first.' },
    salvager: { id: 'salvager', name: 'Salvager Rig', icon: '⚙', rarity: 'common', description: 'Wrecks leave +50% salvage and an extra crate roll.' },
    'bounty-chip': { id: 'bounty-chip', name: 'Bounty Chip', icon: '💳', rarity: 'common', description: 'All credits earned +25%.' },
    'thrifty-drive': { id: 'thrifty-drive', name: 'Thrifty Drive', icon: '⛽', rarity: 'common', description: 'Fuel burn −30%: longer hunts, bigger detours.' },
    recycler: { id: 'recycler', name: 'Charge Recycler', icon: '♻', rarity: 'rare', description: '35% chance that using a system keeps its charge.' },
    siren: { id: 'siren', name: 'Siren Core', icon: '📡', rarity: 'rare', description: 'Decoy Beacons last twice as long and draw NPCs from farther away.' },
    veteran: { id: 'veteran', name: 'Veteran Crew', icon: '🎖', rarity: 'rare', description: 'Experience from kills and events +25%.' }
};

export const RELIC_IDS = Object.keys(RELICS) as RelicId[];

export const RELIC_EFFECTS = {
    signatureMultiplier: 0.8,
    sensorMultiplier: 1.2,
    salvageMultiplier: 1.5,
    moneyMultiplier: 1.25,
    fuelBurnMultiplier: 0.7,
    recycleChance: 0.35,
    decoyDurationMultiplier: 2,
    decoyAttractionMultiplier: 1.6,
    experienceMultiplier: 1.25
} as const;

/** Three distinct relics the player does not own yet; rare ones are less likely. */
export function draftRelics(owned: readonly RelicId[], count = 3): RelicDefinition[] {
    const pool = RELIC_IDS.filter(id => !owned.includes(id)).map(id => RELICS[id]);
    const picks: RelicDefinition[] = [];
    while (picks.length < count && pool.length > 0) {
        const choice = weightedPick(pool, relic => relic.rarity === 'rare' ? 0.5 : 1);
        picks.push(choice);
        pool.splice(pool.indexOf(choice), 1);
    }
    return picks;
}
