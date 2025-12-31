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
        const celestialBodies = this.game.getEntities().filter(e => e instanceof CelestialBody) as CelestialBody[];

        for (const npc of this.game.getNpcFleets()) {

            // Give up chase/flee if too far or futility
            if (npc.followTarget instanceof Fleet) {
                const dist = Vector2.distance(npc.position, npc.followTarget.position);

                // If it's a chase: Check if target is much faster or too far
                const isChasing = this.isHostile(npc, npc.followTarget as Fleet);
                if (isChasing) {


                    // Check if target is escaping the system
                    const targetPosMag = npc.followTarget.position.mag();
                    if (targetPosMag > this.game.getSystemRadius() * 0.8) {
                        const dirToTarget = npc.followTarget.position.normalize();
                        const targetVelDir = npc.followTarget.velocity.normalize();
                        if (dirToTarget.dot(targetVelDir) > 0.5) { // moving outward
                            npc.stopFollowing();
                            // Head toward system center
                            npc.setTarget(new Vector2((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000));
                            npc.decisionTimer = 2.0;
                            continue;
                        }
                    }

                    if (dist > giveUpRadius || ( dist > 800)) {
                        npc.stopFollowing();
                        // Head to random planet
                        if (celestialBodies.length > 0) {
                            const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                            npc.setTarget(poi.position.add(new Vector2((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200)));
                        }
                        npc.decisionTimer = 1.0; // Don't re-target immediately
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

            // Scan all fleets (including player)
            const allFleets = [this.game.getPlayerFleet(), ...this.game.getNpcFleets()];

            // Count nearby civilians for civilian behavior
            let nearbyCivilians = 0;
            if (npc.faction === 'civilian') {
                for (const other of allFleets) {
                    if (other !== npc && other.faction === 'civilian' && Vector2.distance(npc.position, other.position) < 300) {
                        nearbyCivilians++;
                    }
                }
            }
            for (const other of allFleets) {
                if (npc === other || other.isCloaked) continue;

                const dist = Vector2.distance(npc.position, other.position);
                if (dist > detectionRadius) continue;

                const hostileAtoB = this.isHostile(npc, other);
                const hostileBtoA = this.isHostile(other, npc);

                if (npc.faction === 'raider' && hostileAtoB) {
                    // Raiders are aggressive: 20% chance to attack regardless of strength,
                    // otherwise attack if up to 1.5x their strength (including weakened in combat)
                    const forceAttack = Math.random() < 0.2;
                    if (forceAttack || other.strength < npc.strength * 1.5) {
                        if (dist < detectionRadius) {
                            bestTarget = other;
                            break; // Raiders take first valid target
                        }
                    }
                    continue; // Skip threat evaluation for raiders
                }

                if (hostileBtoA && other.strength > npc.strength * 1.2) {
                    // Threat: He wants to kill me and is stronger
                    if (dist < minDistThreat) {
                        minDistThreat = dist;
                        closestThreat = other;
                    }
                } else if (hostileAtoB) {
                    // Target: I want to kill him
                    let canTarget = false;
                    if (npc.faction === 'military') {
                        canTarget = other.strength < npc.strength * 1.2;
                    } else if (npc.faction === 'civilian') {
                        canTarget = other.strength < npc.strength * 0.8;
                        if (nearbyCivilians > 2) {
                            canTarget = other.strength < npc.strength * 1.0; // Attack if not much stronger when in group
                        }
                    } else {
                        canTarget = other.strength < npc.strength * 0.8;
                    }
                    if (other.currentTarget) {
                        // Opportunistic: attack weakened enemies in attack
                        if (['pirate', 'orc', 'military'].includes(npc.faction) && other.strength < npc.strength * 0.6) {
                            canTarget = true;
                        }
                    }

                    if (canTarget) {
                    // Calculate size score: optimal 0.5x own size, falls off for larger/smaller
                    const sizeRatio = other.sizeMultiplier / npc.sizeMultiplier;
                    let sizeScore = 0;
                    if (sizeRatio >= 0.1 && sizeRatio <= 0.9) {
                        // Optimal at 0.5, falls off outside
                        sizeScore = 1 / (1 + Math.abs(sizeRatio - 0.5) * 2);
                    } else {
                        // Too small or too large: very low priority, only for raiders/military
                        sizeScore = (npc.faction === 'military' || npc.faction === 'raider') ? 0.1 : 0.01;
                    }

                    // Mining vulnerability bonus: mining fleets are high-priority targets
                    const miningBonus = other.state === 'mining' ? 3.0 : 0;

                        // Combat bonus: big plus if target is already in attack
                        const combatBonus = other.currentTarget ? 2.0 : 0;

                        // Movement score: approaching/stationary is plus, fleeing is minus
                        let movementScore = 0;
                        const velMag = other.velocity.mag();
                        if (velMag < 5) {
                            // Stationary: plus
                            movementScore = 1.0;
                        } else {
                            // Direction towards NPC
                            const toNpc = npc.position.sub(other.position).normalize();
                            const dotProduct = toNpc.dot(other.velocity.normalize());
                            if (dotProduct > 0) {
                                // Approaching: plus, better if faster
                                movementScore = 0.5 + dotProduct * 0.5;
                            } else {
                                // Fleeing: minus
                                movementScore = -0.5 + dotProduct * 0.5; // dotProduct negative, so this is negative
                            }
                        }

                        // Proximity coefficient: 1 at close, 0 at max range
                        const proximityCoefficient = 1 - (dist / detectionRadius);

                        // Strength score: weaker is better
                        const strengthRatio = Math.min(other.strength / npc.strength, 2.0);
                        const strengthScore = 1 / strengthRatio;

                        // Current target bonus: big plus if this is already my target
                        const currentTargetBonus = (other === npc.currentTarget) ? 1.0 : 0;

                        // Proximity bonus for military: prioritize closest
                        const proximityBonus = (npc.faction === 'military') ? proximityCoefficient * 2.0 : 0;

                        // Total score
                        let targetScore = proximityCoefficient * (combatBonus + sizeScore + movementScore + strengthScore + currentTargetBonus + miningBonus) + proximityBonus;

                        // Center bonus for military
                        if (npc.faction === 'military') {
                            const centerDist = npc.position.mag();
                            const centerBonus = centerDist < 2000 ? 0.3 : 0;
                            targetScore += centerBonus;
                        }

                        if (targetScore > bestTargetScore) {
                            bestTargetScore = targetScore;
                            bestTarget = other;
                        }
                    }
                }
            }



            // Decide action
            if (closestThreat && npc.faction !== 'raider' && npc.faction !== 'military') {
                // Flee! (Raiders and military never flee)
                const runDir = npc.position.sub(closestThreat.position).normalize();
                npc.setTarget(npc.position.add(runDir.scale(800)));
                npc.state = 'flee';
                npc.decisionTimer = 1.0 + Math.random(); // Reaction delay
            } else if (bestTarget) {
                // Attack!
                npc.setFollowTarget(bestTarget, 'contact');
                npc.state = 'normal';
                npc.decisionTimer = 0.5 + Math.random();
            } else if (!npc.target && !npc.followTarget || npc.velocity.mag() < 5) {
                // Idle roaming: Head to POIs more often
                npc.state = 'normal';
                if (Math.random() < 0.01 && celestialBodies.length > 0) {
                    // Faction based weighting for POIs
                    let filteredPOIs = celestialBodies;
                    if (npc.faction === 'civilian' || npc.faction === 'military') {
                        // Military prefer central planets
                        filteredPOIs = celestialBodies
                            .filter(b => !b.name.includes('Asteroid') && !b.name.includes('Alpha'))
                            .sort((a, b) => a.position.mag() - b.position.mag()) // Sort by distance from center
                            .slice(0, 3); // Take closest 3
                    } else if (npc.faction === 'pirate' || npc.faction === 'orc') {
                        filteredPOIs = celestialBodies.filter(b => b.name.includes('Asteroid') || b.name.includes('Alpha') || b.isStar);
                    }
                    if (filteredPOIs.length === 0) filteredPOIs = celestialBodies;

                    const poi = filteredPOIs[Math.floor(Math.random() * filteredPOIs.length)];
                    const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
                    npc.setTarget(poi.position.add(offset));
                    if (npc.faction === 'civilian') {
                        npc.civilianStopTimer = 2 + Math.random() * 4; // 2-6 seconds stop
                    }
                    npc.decisionTimer = 5.0; // Long roams
                }
            }
        }
    }

    public isHostile(a: Fleet, b: Fleet): boolean {
        if (a === b) return false;
        // Check persistent hostility
        if (a.hostileTo.has(b)) return true;
        const f1 = a.faction;
        const f2 = b.faction;

        // Player and military are not hostile to each other
        if ((f1 === 'player' && f2 === 'military') || (f1 === 'military' && f2 === 'player')) return false;

        if ((f1 as string) === 'raider') return f2 !== 'raider';
        if ((f2 as string) === 'raider') return f1 !== 'raider';

        if (f1 === 'player') {
            return f2 === 'pirate' || f2 === 'orc';
        }
        if (f1 === 'civilian') {
            // Hostile to anyone who is attacking them or their allies
            if (b.currentTarget) {
                return this.isAlly(a, b.currentTarget);
            }
            return false;
        }
        if (f1 === 'pirate') return f2 === 'civilian' || f2 === 'player' || f2 === 'military';
        if (f1 === 'orc') {
            if (f2 === 'orc') return Math.random() < 0.1; // Seldom fight own kind
            return true;
        }
        if (f1 === 'military') {
            if (f2 === 'pirate' || f2 === 'orc') return true;
            // Hostile to anyone attacking allies
            if (b.currentTarget) {
                return this.isAlly(a, b.currentTarget);
            }
            return false;
        }

        return false;
    }

    public isAlly(a: Fleet, b: Fleet): boolean {
        if (a === b) return true;
        const f1 = a.faction;
        const f2 = b.faction;

        // Same faction are always allies
        if (f1 === f2) return true;

        // Military always helps civilians
        if (f1 === 'military' && f2 === 'civilian') return true;
        if (f1 === 'civilian' && f2 === 'military') return true;

        return false;
    }


}
