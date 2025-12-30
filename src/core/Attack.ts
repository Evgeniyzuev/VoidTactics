import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';
import { Game } from './Game';

export class Attack {
    public attacker: Fleet;
    public target: Fleet;
    public finished: boolean = false;
    private game: Game;

    constructor(attacker: Fleet, target: Fleet, game: Game) {
        this.attacker = attacker;
        this.target = target;
        this.game = game;
        // Set attack states
        attacker.currentTarget = target;
        attacker.state = 'combat';
    }

    update(dt: number) {
        // Check if attack should be interrupted (distance > 2 * interception radius)
        const dist = Vector2.distance(this.attacker.position, this.target.position);
        const maxDist = 200; // 2 * 100 (interception radius)
        if (dist > maxDist) {
            this.finished = true;
            // Reset states
            this.attacker.state = 'normal';
            this.attacker.currentTarget = null;
            this.target.state = 'normal';
            this.target.currentTarget = null;
            return;
        }

        // Attacker deals damage to target
        const damage = this.attacker.strength * 0.01 * 10 * dt;
        this.target.accumulatedDamage += damage;

        // Apply integer damage
        const integerDamage = Math.floor(this.target.accumulatedDamage);
        if (integerDamage > 0) {
            this.target.strength = Math.max(0, this.target.strength - integerDamage);
            this.target.accumulatedDamage -= integerDamage;

            // Player gets money per integer damage dealt
            if (this.attacker.isPlayer) {
                this.attacker.money = Math.floor(this.attacker.money + integerDamage * 50);
            }

            // Target responds if not attacking anyone
            if (this.target.currentTarget === null && !this.target.isCloaked) {
                // Target starts attacking back immediately (no distance check)
                const counterAttack = new Attack(this.target, this.attacker, this.game);
                this.game.getAttacks().push(counterAttack);
            }
        }

        // Check if attack finished (target dead or attacker dead)
        if (this.target.strength <= 0 || this.attacker.strength <= 0) {
            this.finished = true;
            // Reset states
            if (this.attacker.strength > 0) {
                this.attacker.state = 'normal';
                this.attacker.currentTarget = null;
            }
            if (this.target.strength > 0) {
                this.target.state = 'normal';
                this.target.currentTarget = null;
            }
        }
    }

    get position(): Vector2 {
        const x = (this.attacker.position.x + this.target.position.x) / 2;
        const y = (this.attacker.position.y + this.target.position.y) / 2;
        return new Vector2(x, y);
    }

    get radius(): number {
        const dist = Vector2.distance(this.attacker.position, this.target.position);
        return dist / 2 + 100; // Half distance + padding
    }
}
