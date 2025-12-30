import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';

export class Battle {
    public fleet1: Fleet;
    public fleet2: Fleet;
    public finished: boolean = false;

    constructor(fleet1: Fleet, fleet2: Fleet) {
        this.fleet1 = fleet1;
        this.fleet2 = fleet2;
        // Set states to combat
        fleet1.state = 'combat';
        fleet2.state = 'combat';
        fleet1.activeBattle = this;
        fleet2.activeBattle = this;
    }

    update(dt: number) {
        // Fleet1 attacks Fleet2
        const damage1 = this.fleet1.strength * 0.01 * 10 * dt;
        this.fleet2.accumulatedDamage += damage1;

        // Apply integer damage
        const integerDamage1 = Math.floor(this.fleet2.accumulatedDamage);
        if (integerDamage1 > 0) {
            this.fleet2.strength = Math.max(0, this.fleet2.strength - integerDamage1);
            this.fleet2.accumulatedDamage -= integerDamage1;

            // Player gets money per integer damage dealt
            if (this.fleet1.isPlayer) {
                this.fleet1.money = Math.floor(this.fleet1.money + integerDamage1*100);
            }
        }

        // Fleet2 attacks Fleet1 (automatic response)
        const damage2 = this.fleet2.strength * 0.01 * 10 * dt;
        this.fleet1.accumulatedDamage += damage2;

        // Apply integer damage
        const integerDamage2 = Math.floor(this.fleet1.accumulatedDamage);
        if (integerDamage2 > 0) {
            this.fleet1.strength = Math.max(0, this.fleet1.strength - integerDamage2);
            this.fleet1.accumulatedDamage -= integerDamage2;

            // Player gets money per integer damage dealt
            if (this.fleet2.isPlayer) {
                this.fleet2.money = Math.floor(this.fleet2.money + integerDamage2*100);
            }
        }

        // Check if battle finished
        if (this.fleet1.strength <= 0 || this.fleet2.strength <= 0) {
            this.finished = true;
            // Reset states
            if (this.fleet1.strength > 0) {
                this.fleet1.state = 'normal';
                this.fleet1.activeBattle = null;
            }
            if (this.fleet2.strength > 0) {
                this.fleet2.state = 'normal';
                this.fleet2.activeBattle = null;
            }
        }
    }

    get position(): Vector2 {
        const x = (this.fleet1.position.x + this.fleet2.position.x) / 2;
        const y = (this.fleet1.position.y + this.fleet2.position.y) / 2;
        return new Vector2(x, y);
    }

    get radius(): number {
        const dist = Vector2.distance(this.fleet1.position, this.fleet2.position);
        return dist / 2 + 100; // Half distance + padding
    }
}
