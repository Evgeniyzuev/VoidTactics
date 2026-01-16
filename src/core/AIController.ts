import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Game } from './Game';

export class AIController {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    processAI() {
        const detectionRadius = 2000;
        const giveUpRadius = 2500;
        const backupRadius = 4000;
        const celestialBodies = this.game.getEntities().filter(e => e instanceof CelestialBody) as CelestialBody[];

        for (const npc of this.game.getNpcFleets()) {

            // Ability Usage Logic
            this.handleAbilities(npc);

            // Give up chase/flee if too far or futility
            if (npc.followTarget instanceof Fleet) {
                const dist = Vector2.distance(npc.position, npc.followTarget.position);

                const isChasing = this.isHostile(npc, npc.followTarget as Fleet);
                if (isChasing) {
                    // Check if target is escaping the system
                    const targetPosMag = npc.followTarget.position.mag();
                    if (targetPosMag > this.game.getSystemRadius() * 0.8) {
                        const dirToTarget = npc.followTarget.position.normalize();
                        const targetVelDir = npc.followTarget.velocity.normalize();
                        if (dirToTarget.dot(targetVelDir) > 0.5) { // moving outward
                            npc.stopFollowing();
                            npc.setTarget(new Vector2((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000));
                            npc.decisionTimer = 2.0;
                            continue;
                        }
                    }

                    if (dist > giveUpRadius || (dist > 1200 && npc.faction === 'pirate' && npc.strength < npc.followTarget.strength)) {
                        npc.stopFollowing();
                        if (celestialBodies.length > 0) {
                            const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                            npc.setTarget(poi.position.add(new Vector2((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200)));
                        }
                        npc.decisionTimer = 1.0;
                        continue;
                    }
                }
            }

            // Reaction Time: Only rethink if timer is zero
            if (npc.decisionTimer > 0) continue;

            let bestTarget: Fleet | null = null;
            let bestTargetScore = -1;
            let closestThreat: Fleet | null = null;
            let minDistThreat = detectionRadius;

            const allFleets = [this.game.getPlayerFleet(), ...this.game.getNpcFleets()];

            // 1. Guardian Instinct / Backup Logic for Military
            if (npc.faction === 'military') {
                for (const other of allFleets) {
                    if (this.isAlly(npc, other) && (other.state === 'combat' || other.currentTarget)) {
                        const dist = Vector2.distance(npc.position, other.position);
                        if (dist < backupRadius) {
                            // Rush to help ally
                            const threat = other.currentTarget || (other.activeBattle ? other.activeBattle.participants.find((p: Fleet) => this.isHostile(npc, p)) : null);
                            if (threat) {
                                bestTarget = threat;
                                bestTargetScore = 999; // Maximum priority
                                break;
                            }
                        }
                    }
                }
            }

            if (bestTargetScore < 999) {
                for (const other of allFleets) {
                    if (npc === other || other.isCloaked) continue;

                    const dist = Vector2.distance(npc.position, other.position);
                    if (dist > detectionRadius) continue;

                    const hostileAtoB = this.isHostile(npc, other);
                    const hostileBtoA = this.isHostile(other, npc);

                    // Threat Evaluation
                    if (hostileBtoA) {
                        // Civilians and Traders are easily spooked
                        const fearFactor = (npc.faction === 'civilian' || npc.faction === 'trader') ? 0.5 : 1.2;
                        if (other.strength > npc.strength * fearFactor) {
                            if (dist < minDistThreat) {
                                minDistThreat = dist;
                                closestThreat = other;
                            }
                        }
                    }

                    if (hostileAtoB) {
                        let canTarget = false;
                        if (npc.faction === 'military' || npc.faction === 'raider' || npc.faction === 'orc') {
                            canTarget = true;
                        } else if (npc.faction === 'mercenary') {
                            // Mercenaries only target "bad guys" (pirates, orcs, raiders) or attackers
                            canTarget = ['pirate', 'orc', 'raider'].includes(other.faction) || other.hostileTo.size > 0;
                        } else if (npc.faction === 'pirate') {
                            // Pirates are opportunistic, target weak or already fighting
                            canTarget = other.strength < npc.strength * 1.2 || other.state === 'combat';
                        } else if (npc.faction === 'civilian' || npc.faction === 'trader') {
                            // Only target if very weak (self-defense)
                            canTarget = other.strength < npc.strength * 0.4;
                        }

                        if (canTarget) {
                            // Calculate scores
                            const strengthRatio = npc.strength / Math.max(0.1, other.strength);
                            const proximityFactor = 1 - (dist / detectionRadius);
                            const cargoBonus = (other.faction === 'trader') ? 2.0 : 0;
                            const combatBonus = (other.state === 'combat') ? 1.5 : 0;

                            let targetScore = proximityFactor * (strengthRatio + cargoBonus + combatBonus);

                            // Raiders ignore strength mostly
                            if ((npc.faction as string) === 'raider') targetScore += 5;

                            if (targetScore > bestTargetScore) {
                                bestTargetScore = targetScore;
                                bestTarget = other;
                            }
                        }
                    }
                }
            }

            // Decide action
            const isMilitaryWithAllies = npc.faction === 'military' && allFleets.some(f => f !== npc && this.isAlly(npc, f) && Vector2.distance(npc.position, f.position) < 1000);

            if (closestThreat && !['raider', 'orc'].includes(npc.faction) && !isMilitaryWithAllies) {
                // Flee! (Military only flees if alone and overwhelmed, Raiders/Orcs never)
                const runDir = npc.position.sub(closestThreat.position).normalize();
                npc.setTarget(npc.position.add(runDir.scale(800)));
                npc.state = 'flee';
                npc.decisionTimer = 1.0 + Math.random();
            } else if (bestTarget) {
                // Attack!
                npc.setFollowTarget(bestTarget, 'contact');
                npc.state = 'normal';
                npc.decisionTimer = 0.5 + Math.random();
            } else if (!npc.target && !npc.followTarget || npc.velocity.mag() < 5) {
                // Roaming
                npc.state = 'normal';
                if (Math.random() < 0.01 && celestialBodies.length > 0) {
                    let filteredPOIs = celestialBodies;
                    if (['civilian', 'military', 'trader'].includes(npc.faction)) {
                        filteredPOIs = celestialBodies
                            .filter(b => !b.name.includes('Asteroid') && !b.name.includes('Alpha'))
                            .sort((a, b) => a.position.mag() - b.position.mag())
                            .slice(0, 4);
                    } else if (['pirate', 'orc', 'raider'].includes(npc.faction)) {
                        filteredPOIs = celestialBodies.filter(b => b.name.includes('Asteroid') || b.name.includes('Alpha') || b.isStar);
                    }

                    if (filteredPOIs.length === 0) filteredPOIs = celestialBodies;

                    const poi = filteredPOIs[Math.floor(Math.random() * filteredPOIs.length)];
                    const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
                    npc.setTarget(poi.position.add(offset));
                    if (npc.faction === 'civilian' || npc.faction === 'trader') {
                        npc.civilianStopTimer = 2 + Math.random() * 4;
                    }
                    npc.decisionTimer = 5.0;
                }
            }
        }
    }

    private handleAbilities(npc: Fleet) {
        // Afterburner
        if (npc.state === 'flee') {
            if (npc.abilities.afterburner.cooldown <= 0) {
                npc.abilities.afterburner.active = true;
                npc.abilities.afterburner.timer = npc.abilities.afterburner.duration;
                npc.abilities.afterburner.cooldown = npc.abilities.afterburner.cdMax;
            }
        }

        // Raider Special: Cloak & Ambush
        if (npc.faction === 'raider' && npc.followTarget) {
            const dist = Vector2.distance(npc.position, npc.followTarget.position);

            // Cloak when closing in (ambush)
            if (dist < 1200 && dist > 400 && npc.abilities.cloak.cooldown <= 0) {
                npc.abilities.cloak.active = true;
                npc.abilities.cloak.timer = npc.abilities.cloak.duration;
                npc.abilities.cloak.cooldown = npc.abilities.cloak.cdMax;
                npc.isCloaked = true;
            }

            // Afterburner to catch up
            if (dist > 800 && npc.abilities.afterburner.cooldown <= 0) {
                npc.abilities.afterburner.active = true;
                npc.abilities.afterburner.timer = npc.abilities.afterburner.duration;
                npc.abilities.afterburner.cooldown = npc.abilities.afterburner.cdMax;
            }
        }

        // Military: Bubble to trap fleeing targets
        if (npc.faction === 'military' && npc.followTarget instanceof Fleet) {
            if (npc.followTarget.state === 'flee' && Vector2.distance(npc.position, npc.followTarget.position) < 600) {
                if (npc.abilities.bubble.cooldown <= 0) {
                    npc.abilities.bubble.active = true;
                    npc.abilities.bubble.timer = npc.abilities.bubble.duration;
                    npc.abilities.bubble.cooldown = npc.abilities.bubble.cdMax;
                }
            }
        }
    }

    public isHostile(a: Fleet, b: Fleet): boolean {
        if (a === b) return false;
        if (a.hostileTo.has(b)) return true;
        const f1 = a.faction;
        const f2 = b.faction;

        // Player relations
        if (f1 === 'player') {
            return ['pirate', 'orc', 'raider'].includes(f2);
        }

        // Raider is hostile to everything except other raiders
        if ((f1 as string) === 'raider') return f2 !== 'raider';
        if ((f2 as string) === 'raider') return f1 !== 'raider';

        // Orcs are chaotic
        if (f1 === 'orc') {
            if (f2 === 'orc') return Math.random() < 0.1;
            return true;
        }

        // Pirates hunt traders, civilians, and player
        if (f1 === 'pirate') {
            return ['civilian', 'trader', 'player', 'military', 'mercenary'].includes(f2);
        }

        // Military protects peace
        if (f1 === 'military') {
            if (['pirate', 'orc', 'raider'].includes(f2)) return true;
            if (b.currentTarget && this.isAlly(a, b.currentTarget)) return true;
            return false;
        }

        // Mercenaries hunt bounties
        if (f1 === 'mercenary') {
            return ['pirate', 'orc', 'raider'].includes(f2);
        }

        // Civilians and Traders only fight back if attacked
        if (f1 === 'civilian' || f1 === 'trader') {
            if (b.currentTarget && this.isAlly(a, b.currentTarget)) return true;
            return false;
        }

        return false;
    }

    public isAlly(a: Fleet, b: Fleet): boolean {
        if (a === b) return true;
        const f1 = a.faction;
        const f2 = b.faction;

        if (f1 === f2) return true;

        // The "Law-Abiding" block
        const lawAbiding = ['military', 'civilian', 'trader', 'player'];
        if (lawAbiding.includes(f1) && lawAbiding.includes(f2)) return true;

        return false;
    }
}
