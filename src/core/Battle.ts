import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';

export class Battle {
    public sideA: Fleet[] = [];
    public sideB: Fleet[] = [];
    public roundTimer: number = 1.0; // 1 second per round
    public finished: boolean = false;
    public initialSizeA: number = 0;
    public initialSizeB: number = 0;
    public dead: Fleet[] = [];
    public totalInitialStrength: number = 0;
    public totalDamageDealt: number = 0;
    public damageDealtByPlayer: number = 0;
    public playerFleet: Fleet | null = null;

    constructor(f1: Fleet, f2: Fleet, player?: Fleet) {
        this.sideA.push(f1);
        this.sideB.push(f2);
        this.initialSizeA = f1.strength;
        this.initialSizeB = f2.strength;
        this.totalInitialStrength = f1.strength + f2.strength;
        if (player) this.playerFleet = player;
        f1.activeBattle = this;
        f2.activeBattle = this;
        f1.state = 'combat';
        f2.state = 'combat';
        f1.combatTimer = this.roundTimer;
        f2.combatTimer = this.roundTimer;
        f1.accumulatedDamage = 0;
        f2.accumulatedDamage = 0;
    }

    joinSide(fleet: Fleet, side: 'A' | 'B') {
        const targetSide = side === 'A' ? this.sideA : this.sideB;
        if (!targetSide.includes(fleet)) {
            targetSide.push(fleet);
            if (side === 'A') this.initialSizeA += fleet.strength;
            else this.initialSizeB += fleet.strength;
            this.totalInitialStrength += fleet.strength;
            fleet.activeBattle = this;
            fleet.state = 'combat';
            fleet.combatTimer = this.roundTimer;
            fleet.accumulatedDamage = 0;
            this.roundTimer = Math.max(this.roundTimer, 2.0);
        }
    }

    addFleet(fleet: Fleet, against: Fleet) {
        if (this.sideA.includes(against)) {
            if (!this.sideB.includes(fleet)) {
                this.sideB.push(fleet);
                this.initialSizeB += fleet.strength;
                this.totalInitialStrength += fleet.strength;
                fleet.activeBattle = this;
                fleet.state = 'combat';
                fleet.combatTimer = this.roundTimer;
                fleet.accumulatedDamage = 0;
            }
        } else if (this.sideB.includes(against)) {
            if (!this.sideA.includes(fleet)) {
                this.sideA.push(fleet);
                this.initialSizeA += fleet.strength;
                this.totalInitialStrength += fleet.strength;
                fleet.activeBattle = this;
                fleet.state = 'combat';
                fleet.combatTimer = this.roundTimer;
                fleet.accumulatedDamage = 0;
            }
        }
        this.roundTimer = Math.max(this.roundTimer, 2.0); // Reset/Extend timer
    }

    update(dt: number) {
        this.roundTimer -= dt;
        // The individual fleet update also ticks timers, but we sync here
        for (const f of this.sideA) f.combatTimer = this.roundTimer;
        for (const f of this.sideB) f.combatTimer = this.roundTimer;

        if (this.roundTimer <= 0) {
            this.applyDamage();
            this.roundTimer = 1.0; // Reset for next round
            this.checkFinished();
        }
    }

    private applyDamage() {
        const sizeA = this.totalSizeA;
        const sizeB = this.totalSizeB;

        if (sizeA === 0 || sizeB === 0) return; // No damage if one side empty

        // Damage to A: (sizeB^2 / sizeA) * 0.1 ±10%
        const baseDamageA = (sizeB / sizeA) * 0.1;
        const varianceA = baseDamageA * 0.1 * (Math.random() * 2 - 1); // ±10%
        const damageA = Math.max(0, baseDamageA + varianceA);

        // Damage to B: (sizeA^2 / sizeB) * 0.1 ±10%
        const baseDamageB = (sizeA / sizeB) * 0.1;
        const varianceB = baseDamageB * 0.1 * (Math.random() * 2 - 1);
        const damageB = Math.max(0, baseDamageB + varianceB);

        // Distribute to sideA fleets proportionally
        this.distributeDamage(this.sideA, damageA);

        // Distribute to sideB fleets proportionally
        this.distributeDamage(this.sideB, damageB);

        // Accumulate total damage dealt
        this.totalDamageDealt += damageA + damageB;

        // Accumulate damage dealt by player
        if (this.playerFleet) {
            if (this.sideA.includes(this.playerFleet)) {
                // Player is in side A, damage dealt to B
                const playerShare = this.playerFleet.strength / this.totalSizeA;
                this.damageDealtByPlayer += playerShare * damageB;
            } else if (this.sideB.includes(this.playerFleet)) {
                // Player is in side B, damage dealt to A
                const playerShare = this.playerFleet.strength / this.totalSizeB;
                this.damageDealtByPlayer += playerShare * damageA;
            }
        }

        // Mark fleets with strength < 1 as dead
        for (const f of this.sideA) {
            if (f.strength < 1 && !this.dead.includes(f)) {
                this.dead.push(f);
            }
        }
        for (const f of this.sideB) {
            if (f.strength < 1 && !this.dead.includes(f)) {
                this.dead.push(f);
            }
        }
    }

    private distributeDamage(fleets: Fleet[], totalDamage: number) {
        const totalStrength = fleets.reduce((sum, f) => sum + f.strength, 0);
        if (totalStrength === 0) return;

        for (const fleet of fleets) {
            const share = fleet.strength / totalStrength;
            const damage = totalDamage * share;  // Fractional damage
            fleet.accumulatedDamage += damage;

            // Apply integer damage when accumulated >= 1
            const integerDamage = Math.floor(fleet.accumulatedDamage);
            if (integerDamage > 0) {
                fleet.strength = Math.max(0, fleet.strength - integerDamage);
                fleet.accumulatedDamage -= integerDamage;
            }
        }
    }

    private checkFinished() {
        const aliveA = this.sideA.filter(f => !this.dead.includes(f)).length;
        const aliveB = this.sideB.filter(f => !this.dead.includes(f)).length;
        if (aliveA === 0 || aliveB === 0) {
            this.finished = true;
            // Reset states for alive fleets
            for (const f of this.sideA) {
                if (!this.dead.includes(f)) {
                    f.activeBattle = null;
                    f.state = 'normal';
                }
            }
            for (const f of this.sideB) {
                if (!this.dead.includes(f)) {
                    f.activeBattle = null;
                    f.state = 'normal';
                }
            }
        }
    }

    get totalSizeA(): number {
        return this.sideA.reduce((sum, f) => sum + f.strength, 0);
    }

    get totalSizeB(): number {
        return this.sideB.reduce((sum, f) => sum + f.strength, 0);
    }

    contains(f: Fleet): boolean {
        return this.sideA.includes(f) || this.sideB.includes(f);
    }

    get position(): Vector2 {
        const allFleets = [...this.sideA, ...this.sideB];
        if (allFleets.length === 0) return new Vector2(0, 0);

        let totalX = 0;
        let totalY = 0;
        for (const fleet of allFleets) {
            totalX += fleet.position.x;
            totalY += fleet.position.y;
        }

        return new Vector2(totalX / allFleets.length, totalY / allFleets.length);
    }

    get radius(): number {
        const center = this.position;
        const allFleets = [...this.sideA, ...this.sideB];
        if (allFleets.length === 0) return 50;

        let maxDist = 0;
        for (const fleet of allFleets) {
            const dist = Vector2.distance(center, fleet.position);
            maxDist = Math.max(maxDist, dist);
        }

        // Add buffer for joining
        return maxDist + 100;
    }
}
