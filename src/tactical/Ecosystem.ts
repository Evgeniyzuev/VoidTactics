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
