import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';
import { Game } from './Game';
import { CelestialBody } from '../entities/CelestialBody';
import { COMBAT_BALANCE, TACTICAL_BALANCE, type DamageType } from '../tactical/ShipDefinitions';
import type { Ship } from '../tactical/Ship';
import { AbilityService } from '../tactical/AbilityService';

export class Attack {
    public attacker: Fleet;
    public target: Fleet;
    public finished: boolean = false;
    private game: Game;
    private simulationAccumulator = 0;
    private noFireSeconds = 0;
    private reportedNoFireReason: string | null = null;
    constructor(attacker: Fleet, target: Fleet, game: Game) {
        this.attacker = attacker;
        this.target = target;
        this.game = game;
        if (target instanceof CelestialBody) {
            attacker.state = 'mining';
            return;
        }
        const witnessResponse = attacker.witnessedAggressors.has(target);
        const startsNewIncident = !witnessResponse && !attacker.activeBattle && !target.activeBattle &&
            attacker.currentTarget === null && target.currentTarget === null;
        if (startsNewIncident) {
            this.game.registerCombatStart?.(attacker, target);
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
        // Cloak breaks an incoming lock before the next tactical salvo.
        // New attacks are also blocked by Game.processCombat and SensorService.
        if (this.target.isCloaked) {
            this.finished = true;
            if (this.attacker.isPlayer) this.game.reportCombatStop?.('target cloaked', this);
            return;
        }

        // Check if attack should be interrupted (distance > 2 * interception radius)
        const dist = Vector2.distance(this.attacker.position, this.target.position);
        const maxDist = 200; // 2 * 100 (interception radius)
        if (dist > maxDist) {
            this.finished = true;
            if (this.attacker.isPlayer) this.game.reportCombatStop?.('target left interception range', this);
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

        // Tactical damage is resolved at fleet level. Ships still retain their
        // own hull, shields, armor, energy and repair state, but a volley no
        // longer loops over every weapon and sorts targets for every ship.
        this.attacker.ensureComposition();
        this.target.ensureComposition();
        if (!this.attacker.isPlayer &&
            this.attacker.abilities.net.charges > 0 &&
            this.attacker.abilities.net.cooldown <= 0) {
            AbilityService.activate(this.attacker, 'net');
        }
        const profile = this.attacker.getCombatProfile();
        const targetShip = this.selectTargetShip();
        let totalDamage = 0;
        let totalHullDamage = 0;
        let totalAppliedDamage = 0;
        let shots = 0;
        let energyBlocked = 0;
        let ammoBlocked = 0;
        const requiredEnergy = profile.energyPerSecond * dt;
        const availableEnergy = this.attacker.totalEnergy;
        const energyRatio = requiredEnergy > 0
            ? Math.min(1, availableEnergy / requiredEnergy)
            : 1;
        if (requiredEnergy > 0) {
            this.attacker.consumePooledEnergy(requiredEnergy * energyRatio);
            if (energyRatio < 1) energyBlocked = 1;
        }

        const requiredAmmo = profile.ammunitionPerSecond * dt;
        const availableAmmo = this.attacker.totalAmmunition;
        const ammoRatio = requiredAmmo > 0
            ? Math.min(1, availableAmmo / requiredAmmo)
            : 1;
        if (requiredAmmo > 0) {
            this.attacker.consumePooledAmmunition(requiredAmmo * ammoRatio);
            if (ammoRatio < 1) ammoBlocked = 1;
        } else if (profile.ammunitionWeaponSlots > 0 && profile.usableWeaponSlots < profile.weaponSlots) {
            ammoBlocked = 1;
        }

        const damageTypes: DamageType[] = ['kinetic', 'energy', 'explosive'];
        let visualDamageType: DamageType = 'energy';
        let visualDamage = 0;
        if (targetShip) {
            for (const damageType of damageTypes) {
                const ammunitionDamage = profile.ammunitionDamageByType[damageType];
                const energyDamage = profile.damageByType[damageType] - ammunitionDamage;
                const damage = (energyDamage + ammunitionDamage * ammoRatio) * energyRatio * dt;
                if (damage <= 0) continue;
                shots = 1;
                totalDamage += damage;
                if (damage > visualDamage) {
                    visualDamage = damage;
                    visualDamageType = damageType;
                }
                const hullDamage = this.target.receiveTacticalDamage(damage, damageType, targetShip.id);
                totalHullDamage += hullDamage;
                totalAppliedDamage += this.target.lastTacticalDamage;
            }
            if (shots > 0) {
                this.game.addCombatShot(this.attacker, this.target, visualDamageType, totalAppliedDamage > 0);
            }
        }
        if (this.attacker.isPlayer && this.target.ships.some(ship => ship.alive)) {
            this.noFireSeconds = shots > 0 ? 0 : this.noFireSeconds + dt;
            if (this.noFireSeconds >= 1 && shots === 0) {
                const reason = profile.firingShips === 0
                    ? 'all operational ships are ordered to retreat or repair'
                    : profile.weaponSlots === 0 || !targetShip
                        ? 'no usable weapons or target ships'
                        : energyBlocked > 0 && ammoBlocked > 0
                            ? 'insufficient Energy and ammunition'
                            : energyBlocked > 0
                                ? 'insufficient Energy'
                                : ammoBlocked > 0
                                    ? 'no ammunition'
                                    : 'no valid firing solution';
                if (reason !== this.reportedNoFireReason) {
                    this.reportedNoFireReason = reason;
                    this.game.reportCombatSilence?.(reason, this);
                }
            }
        }
        this.target.accumulatedDamage += totalHullDamage;

        if (totalDamage > 0) {
            // Bounties are paid only for actual hull damage. Shield and armor
            // pressure matters tactically but does not reduce the target threat.
            if (this.attacker.isPlayer) {
                if (totalHullDamage > 0) {
                    this.game.awardPlayerMoney(totalHullDamage * COMBAT_BALANCE.hullRewardMultiplier, 0);
                }
                this.game.awardPlayerExperience(this.game.getCombatDamageExperience(this.target, totalAppliedDamage));
            }

            // Leave fewer, more readable salvage markers instead of a dense
            // trail of tiny debris during a prolonged exchange.
            if (this.target.accumulatedDamage >= TACTICAL_BALANCE.salvageDamageChunk) {
                this.game.spawnDebris(
                    this.target.position.x,
                    this.target.position.y,
                    Math.max(1, Math.ceil(this.target.accumulatedDamage / TACTICAL_BALANCE.salvageDamageValueDivisor))
                );
                this.target.accumulatedDamage %= TACTICAL_BALANCE.salvageDamageChunk;
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

    /** Select one fleet target in a single pass; no per-ship sort or focus map. */
    private selectTargetShip(): Ship | null {
        let selected: Ship | null = null;
        let selectedScore = -Infinity;
        for (const ship of this.target.ships) {
            if (!ship.alive) continue;
            let score = (1 - ship.integrity) * 2;
            if (this.attacker.doctrine.targetPriority === 'damaged') score += (1 - ship.integrity) * 8;
            if (this.attacker.doctrine.targetPriority === ship.role) score += 8;
            if (!selected || score > selectedScore || (score === selectedScore && ship.id < selected.id)) {
                selected = ship;
                selectedScore = score;
            }
        }
        return selected;
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
