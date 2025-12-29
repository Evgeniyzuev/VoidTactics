import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';

export class Battle {
    public fleets: Fleet[] = []; // All fleets in battle
    public roundTimer: number = 1.0; // 1 second per round
    public finished: boolean = false;
    public dead: Fleet[] = [];
    public totalInitialStrength: number = 0;
    public totalDamageDealt: number = 0;
    public damageDealtByPlayer: number = 0;
    public playerFleet: Fleet | null = null;

    constructor(f1: Fleet, f2: Fleet, player?: Fleet) {
        this.fleets.push(f1, f2);
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

    addFleet(fleet: Fleet) {
        if (!this.fleets.includes(fleet)) {
            this.fleets.push(fleet);
            this.totalInitialStrength += fleet.strength;
            fleet.activeBattle = this;
            fleet.state = 'combat';
            fleet.combatTimer = this.roundTimer;
            fleet.accumulatedDamage = 0;
        }
    }

    update(dt: number) {
        this.roundTimer -= dt;
        // Sync timers
        for (const f of this.fleets) f.combatTimer = this.roundTimer;

        if (this.roundTimer <= 0) {
            this.assignTargets();
            this.applyDamage();
            this.roundTimer = 0.1; // Reset for next round
            this.checkFinished();
        }
    }

    private assignTargets() {
        // Each fleet chooses the closest enemy as target
        for (const fleet of this.fleets) {
            if (this.dead.includes(fleet)) continue;
            let closest: Fleet | null = null;
            let minDist = Infinity;
            for (const other of this.fleets) {
                if (other === fleet || this.dead.includes(other) || this.isAlly(fleet, other)) continue;
                const dist = Vector2.distance(fleet.position, other.position);
                if (dist < minDist) {
                    minDist = dist;
                    closest = other;
                }
            }
            fleet.currentTarget = closest;
        }
    }

    private isAlly(f1: Fleet, f2: Fleet): boolean {
        // Simplified: same faction or allied factions
        return f1.faction === f2.faction ||
               (f1.faction === 'military' && f2.faction === 'civilian') ||
               (f1.faction === 'civilian' && f2.faction === 'military');
    }

    private applyDamage() {
        for (const fleet of this.fleets) {
            if (this.dead.includes(fleet) || !fleet.currentTarget || this.dead.includes(fleet.currentTarget)) continue;

            // Damage proportional to attacker's current strength (0.1 per strength point)
            const damage = fleet.strength * 0.03;
            fleet.currentTarget.accumulatedDamage += damage;

            // Apply integer damage
            const integerDamage = Math.floor(fleet.currentTarget.accumulatedDamage);
            if (integerDamage > 0) {
                fleet.currentTarget.strength = Math.max(0, fleet.currentTarget.strength - integerDamage);
                fleet.currentTarget.accumulatedDamage -= integerDamage;

                // Player gets 100$ per integer damage dealt
                if (fleet === this.playerFleet) {
                    fleet.money += integerDamage * 100;
                }
            }

            this.totalDamageDealt += damage;

            // Player damage tracking (for stats)
            if (fleet === this.playerFleet) {
                this.damageDealtByPlayer += integerDamage;
            }
        }

        // Mark dead
        for (const f of this.fleets) {
            if (f.strength <= 0 && !this.dead.includes(f)) {
                this.dead.push(f);
            }
        }
    }

    private checkFinished() {
        const aliveFleets = this.fleets.filter(f => !this.dead.includes(f));
        if (aliveFleets.length <= 1) {
            this.finished = true;
            // Reset states
            for (const f of aliveFleets) {
                f.activeBattle = null;
                f.state = 'normal';
                f.currentTarget = null;
            }
        }
    }

    contains(f: Fleet): boolean {
        return this.fleets.includes(f);
    }

    get position(): Vector2 {
        if (this.fleets.length === 0) return new Vector2(0, 0);
        let totalX = 0, totalY = 0;
        for (const fleet of this.fleets) {
            totalX += fleet.position.x;
            totalY += fleet.position.y;
        }
        return new Vector2(totalX / this.fleets.length, totalY / this.fleets.length);
    }

    get radius(): number {
        const center = this.position;
        if (this.fleets.length === 0) return 50;
        let maxDist = 0;
        for (const fleet of this.fleets) {
            const dist = Vector2.distance(center, fleet.position);
            maxDist = Math.max(maxDist, dist);
        }
        return maxDist + 100;
    }
}
