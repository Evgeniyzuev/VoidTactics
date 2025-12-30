import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';

export class Battle {
    public attacker: Fleet;
    public defender: Fleet;
    public finished: boolean = false;

    constructor(attacker: Fleet, defender: Fleet) {
        this.attacker = attacker;
        this.defender = defender;
        // Set states to combat
        attacker.state = 'combat';
        defender.state = 'combat';
        attacker.activeBattle = this;
        defender.activeBattle = this;
    }

    update(dt: number) {
        // Attacker attacks Defender (one-sided)
        const damage = this.attacker.strength * 0.01 * 10 * dt;
        this.defender.accumulatedDamage += damage;

        // Apply integer damage
        const integerDamage = Math.floor(this.defender.accumulatedDamage);
        if (integerDamage > 0) {
            this.defender.strength = Math.max(0, this.defender.strength - integerDamage);
            this.defender.accumulatedDamage -= integerDamage;

            // Player gets money per integer damage dealt
            if (this.attacker.isPlayer) {
                this.attacker.money = Math.floor(this.attacker.money + integerDamage * 100);
            }
        }

        // Check if battle finished (defender dead or attacker dead)
        if (this.defender.strength <= 0 || this.attacker.strength <= 0) {
            this.finished = true;
            // Reset states
            if (this.attacker.strength > 0) {
                this.attacker.state = 'normal';
                this.attacker.activeBattle = null;
            }
            if (this.defender.strength > 0) {
                this.defender.state = 'normal';
                this.defender.activeBattle = null;
            }
        }
    }

    get position(): Vector2 {
        const x = (this.attacker.position.x + this.defender.position.x) / 2;
        const y = (this.attacker.position.y + this.defender.position.y) / 2;
        return new Vector2(x, y);
    }

    get radius(): number {
        const dist = Vector2.distance(this.attacker.position, this.defender.position);
        return dist / 2 + 100; // Half distance + padding
    }
}
