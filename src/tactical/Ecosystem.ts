export type EcosystemBand = 'prey' | 'competitor' | 'predator' | 'apex';

export interface ThreatAssessment {
    band: EcosystemBand;
    ratio: number;
    label: string;
    risk: string;
}

export function assessRelativeThreat(subjectThreat: number, referenceThreat: number): ThreatAssessment {
    const ratio = Math.max(0, subjectThreat) / Math.max(1, referenceThreat);
    if (ratio < 0.55) {
        return { band: 'prey', ratio, label: 'PREY', risk: 'Likely catch; low direct threat' };
    }
    if (ratio < 1.5) {
        return { band: 'competitor', ratio, label: 'COMPETITOR', risk: 'Costly fight; losses likely' };
    }
    if (ratio < 6) {
        return { band: 'predator', ratio, label: 'PREDATOR', risk: 'Avoid without allies or an advantage' };
    }
    return { band: 'apex', ratio, label: 'APEX THREAT', risk: 'Escape and break contact' };
}

export function requiredAttackAdvantage(faction: string): number {
    if (faction === 'military' || faction === 'mercenary') return 0;
    if (faction === 'raider') return 1.15;
    if (faction === 'orc') return 1.25;
    if (faction === 'pirate') return 1.35;
    return 2.2;
}

// ---------------------------------------------------------------------------
// NPC engagement model
//
// NPCs fight only when the expected value of the fight is positive from what
// they can perceive. All numbers live in FACTION_PROFILES so balance and
// behaviour can be tuned (and tested) without touching AIController.
// ---------------------------------------------------------------------------

export type NpcIntent = 'roam' | 'hunt' | 'flee' | 'lured' | 'scavenge' | 'respond';

export interface FactionProfile {
    /** Cost of losing a fight, in units of the base reward (1.0). Low = reckless. */
    lossFear: number;
    /** How strongly cargo and wounded targets raise the expected reward. */
    greed: number;
    /** Win chance below which the NPC runs from a hostile (0 = never flees). */
    fleeBelow: number;
    /** Share of nearby allies' threat added to the NPC's own power. */
    allyWeight: number;
    /** Seconds of tunnel vision after choosing a chase target. */
    commitSeconds: number;
    /** Is drawn to weak-looking prey and distress calls. */
    opportunist: boolean;
    /** Goes to help distress calls. */
    responder: boolean;
}

const DEFAULT_PROFILE: FactionProfile = {
    lossFear: 2.2, greed: 0.5, fleeBelow: 0.7, allyWeight: 0.3, commitSeconds: 0, opportunist: false, responder: false
};

export const FACTION_PROFILES: Record<string, FactionProfile> = {
    civilian: { ...DEFAULT_PROFILE, lossFear: 99, greed: 0, fleeBelow: 0.9, allyWeight: 0.2 },
    trader: { ...DEFAULT_PROFILE, lossFear: 99, greed: 0, fleeBelow: 0.65, allyWeight: 0.3 },
    pirate: { lossFear: 1.6, greed: 1.0, fleeBelow: 0.3, allyWeight: 0.55, commitSeconds: 14, opportunist: true, responder: false },
    orc: { lossFear: 0.7, greed: 0.4, fleeBelow: 0.1, allyWeight: 0.4, commitSeconds: 20, opportunist: true, responder: false },
    raider: { lossFear: 0.4, greed: 0.6, fleeBelow: 0, allyWeight: 0.3, commitSeconds: 30, opportunist: true, responder: false },
    military: { lossFear: 0.8, greed: 0.2, fleeBelow: 0.12, allyWeight: 0.8, commitSeconds: 10, opportunist: false, responder: true },
    mercenary: { lossFear: 0.9, greed: 0.8, fleeBelow: 0.15, allyWeight: 0.6, commitSeconds: 10, opportunist: false, responder: true },
    player: DEFAULT_PROFILE
};

export function getFactionProfile(faction: string): FactionProfile {
    return FACTION_PROFILES[faction] ?? DEFAULT_PROFILE;
}

const WIN_CHANCE_STEEPNESS = 2.5;

/** Logistic chance that `own` beats `enemy`; 0.5 at equal power. */
export function winChance(ownPower: number, enemyPower: number): number {
    const ratio = Math.max(0.01, ownPower) / Math.max(0.01, enemyPower);
    return 1 / (1 + Math.exp(-WIN_CHANCE_STEEPNESS * Math.log(ratio)));
}

export interface EngagementInput {
    faction: string;
    ownPower: number;
    allyPower: number;
    /** Power the NPC believes the target has (from its sensor contact). */
    perceivedEnemyPower: number;
    enemyFaction: string;
    /** 0 = freshly repaired, 1 = nearly dead; weak targets are tempting. */
    enemyWounded: number;
    committed?: boolean;
}

export interface EngagementAssessment {
    winChance: number;
    reward: number;
    expectedValue: number;
    attack: boolean;
    flee: boolean;
}

export function targetReward(faction: string, enemyFaction: string, enemyWounded: number): number {
    const profile = getFactionProfile(faction);
    let reward = 1;
    if (enemyFaction === 'trader') reward += 2 * profile.greed;
    else if (enemyFaction === 'civilian') reward += 0.6 * profile.greed;
    reward += 0.8 * profile.greed * Math.max(0, Math.min(1, enemyWounded));
    return reward;
}

export function evaluateEngagement(input: EngagementInput): EngagementAssessment {
    const profile = getFactionProfile(input.faction);
    const power = input.ownPower + input.allyPower * profile.allyWeight;
    const chance = winChance(power, input.perceivedEnemyPower);
    const reward = targetReward(input.faction, input.enemyFaction, input.enemyWounded);
    // Once committed an NPC accepts a slightly worse deal rather than dither.
    const fear = profile.lossFear * (input.committed ? 0.85 : 1);
    const expectedValue = chance * reward - (1 - chance) * fear;
    return {
        winChance: chance,
        reward,
        expectedValue,
        attack: expectedValue > 0,
        flee: chance < profile.fleeBelow
    };
}
