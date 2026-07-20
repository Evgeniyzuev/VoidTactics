import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';
import { Game } from './Game';
import { CelestialBody } from '../entities/CelestialBody';
import { TargetResolver } from '../tactical/TargetResolver';
import { COMBAT_BALANCE, TACTICAL_BALANCE } from '../tactical/ShipDefinitions';

export class Attack {
    public attacker: Fleet;
    public target: Fleet;
    public finished: boolean = false;
    private game: Game;
    private simulationAccumulator = 0;
    constructor(attacker: Fleet, target: Fleet, game: Game) {
        this.attacker = attacker;
        this.target = target;
        this.game = game;
        if (target instanceof CelestialBody) {
            attacker.state = 'mining';
            return;
        }
        // Set attack states
        attacker.currentTarget = target;
        attacker.state = 'combat';
        attacker.activeBattle = this;
        target.state = 'combat';
        if (!target.activeBattle) target.activeBattle = this;

        // Disable cloak if player is attacking
        if (attacker.isPlayer) {
            attacker.abilities.cloak.active = false;
            attacker.isCloaked = false;
        }
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
            if (this.attacker.activeBattle === this) this.attacker.activeBattle = null;
            this.target.state = 'normal';
            this.target.currentTarget = null;
            if (this.target.activeBattle === this) this.target.activeBattle = null;
            return;
        }

        // Check if target is an asteroid (CelestialBody)
        if (this.target instanceof CelestialBody) {
            // Asteroid mining logic - 100x increased rate
            const miningRate = this.attacker.ships.filter(ship => ship.alive).length * 0.5;
            const moneyGained = miningRate * dt;

            if (this.attacker.isPlayer) {
                this.game.awardPlayerMoney(moneyGained);
            }

            // Update mining progress (optional visual feedback)
            if (this.target.miningYield > 0) {
                this.target.miningProgress += dt * miningRate;
                if (this.target.miningProgress >= this.target.miningYield) {
                    this.target.miningProgress = this.target.miningYield;
                    this.finished = true;
                }
            }

            return; // Skip normal combat logic for asteroids
        }

        this.simulationAccumulator += dt;
        const player = this.game.getPlayerFleet();
        const nearPlayer = this.attacker === player || this.target === player ||
            Vector2.distance(this.position, player.position) < 2500;
        const tacticalStep = nearPlayer ? 0.1 : 0.5;
        if (this.simulationAccumulator < tacticalStep) return;
        dt = this.simulationAccumulator;
        this.simulationAccumulator = 0;

        // Tactical damage is produced by the surviving ships and resolved through
        // shields, armor and hull instead of subtracting an abstract fleet number.
        this.attacker.ensureComposition();
        this.target.ensureComposition();
        const firingShips = this.attacker.ships
            .filter(ship => ship.alive && ship.order.type !== 'retreat' && ship.order.type !== 'repair');
        let totalDamage = 0;
        let totalHullDamage = 0;
        for (const ship of firingShips) {
            const targetShip = TargetResolver.resolve(ship, this.target.ships, this.attacker.doctrine, firingShips);
            if (!targetShip) continue;
            const weaponsPenalty = ship.damagedSystems.includes('weapons') ? 0.55 : 1;
            for (const weapon of ship.weapons) {
                const usesAmmo = weapon.damageType !== 'energy';
                if (usesAmmo && ship.ammunition <= 0) continue;
                const overcharged = ship.overchargeTimer > 0;
                const energyPerSecond = weapon.energyCost / Math.max(0.1, weapon.cooldown) * (overcharged ? TACTICAL_BALANCE.overchargeEnergyMultiplier : 1);
                if (!ship.spendEnergy(energyPerSecond * dt)) continue;
                let damage = weapon.damage * ship.statScale / Math.max(0.1, weapon.cooldown) * COMBAT_BALANCE.damageScale * dt * weaponsPenalty * this.attacker.readinessEfficiency;
                if (overcharged) damage *= TACTICAL_BALANCE.overchargeDamageMultiplier;
                if (usesAmmo) ship.ammunition = Math.max(0, ship.ammunition - dt / Math.max(0.1, weapon.cooldown) * 0.05);
                totalDamage += damage;
                const hullDamage = this.target.receiveTacticalDamage(damage, weapon.damageType, targetShip.id);
                totalHullDamage += hullDamage;
                this.game.addCombatShot(this.attacker, this.target, weapon.damageType, hullDamage > 0);
            }
        }
        this.target.accumulatedDamage += totalHullDamage;

        if (totalDamage > 0) {
            // Bounties are paid only for actual hull damage. Shield and armor
            // pressure matters tactically but does not reduce the target threat.
            if (this.attacker.isPlayer && totalHullDamage > 0) {
                this.game.awardPlayerMoney(totalHullDamage * COMBAT_BALANCE.hullRewardMultiplier);
            }

            // Spawn debris for each damage point
            if (this.target.accumulatedDamage >= 4) {
                this.game.spawnDebris(this.target.position.x, this.target.position.y, Math.max(1, Math.floor(this.target.accumulatedDamage / 4)));
                this.target.accumulatedDamage %= 4;
            }

            // NPC deploys bubble if conditions met (skip for asteroids)
            const toAttacker = this.attacker.position.sub(this.target.position);
            const toAttackerDir = toAttacker.mag() > 0 ? toAttacker.normalize() : new Vector2(0, 0);
            const targetVel = this.target.velocity.mag() > 1 ? this.target.velocity.normalize() : new Vector2(0, 0);
            const towardScore = targetVel.x * toAttackerDir.x + targetVel.y * toAttackerDir.y;
            const movingTowardAttacker = towardScore > 0.3 || dist < 60;
            // A single active bubble already covering this target is enough.
            // The deploy animation lasts 0.2s, so checking zones prevents every
            // attacker in the same tactical tick from queuing an identical bubble.
            const bubbleAlreadyQueued = this.game.getBubbleZones().some(zone =>
                Vector2.distance(zone.position, this.target.position) < zone.radius
            );

            if (!this.attacker.isPlayer &&
                this.attacker.abilities.bubble.cooldown <= 0 &&
                dist < 120 &&
                movingTowardAttacker &&
                (!this.target.isBubbled || this.target.bubbleDistance > 180) &&
                !bubbleAlreadyQueued &&
                this.attacker.threatRating > this.target.threatRating) {
                this.game.activateNpcAbility(this.attacker, 'bubble');
            }

            // Target responds if not attacking anyone (skip for asteroids)
            if (this.target.currentTarget === null && !this.target.isCloaked) {
                // Target starts attacking back immediately (no distance check)
                const counterAttack = new Attack(this.target, this.attacker, this.game);
                this.game.getAttacks().push(counterAttack);
            }
        }

        // Check if attack finished (target dead or attacker dead)
        if (!this.target.ships.some(ship => ship.alive) || !this.attacker.ships.some(ship => ship.alive)) {
            this.finished = true;
            // Reset states
            if (this.attacker.ships.some(ship => ship.alive)) {
                this.attacker.state = 'normal';
                this.attacker.currentTarget = null;
                if (this.attacker.activeBattle === this) this.attacker.activeBattle = null;
            }
            if (this.target.ships.some(ship => ship.alive)) {
                this.target.state = 'normal';
                this.target.currentTarget = null;
                if (this.target.activeBattle === this) this.target.activeBattle = null;
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
