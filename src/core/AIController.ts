import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet, type Faction } from '../entities/Fleet';
import { Game } from './Game';

export class AIController {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    processAI() {
        const detectionRadius = 1000;
        const giveUpRadius = 2500;
        const celestialBodies = this.game.getEntities().filter(e => e instanceof CelestialBody) as CelestialBody[];

        for (const npc of this.game.getNpcFleets()) {
            if (npc.state === 'combat') continue;

            // Give up chase/flee if too far or futility
            if (npc.followTarget instanceof Fleet) {
                const dist = Vector2.distance(npc.position, npc.followTarget.position);

                // If it's a chase: Check if target is much faster or too far
                const isChasing = this.isHostile(npc, npc.followTarget as Fleet);
                if (isChasing) {
                    const targetSpeed = (npc.followTarget as Fleet).velocity.mag();
                    const myMaxSpeed = npc.maxSpeed * Math.pow(npc.sizeMultiplier, -0.2);

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

                    if (dist > giveUpRadius || (targetSpeed > myMaxSpeed * 1.1 && dist > 800)) {
                        npc.stopFollowing();
                        // Head to random planet
                        if (celestialBodies.length > 0) {
                            const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                            npc.setTarget(poi.position.add(new Vector2((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200)));
                        }
                        npc.decisionTimer = 2.0; // Don't re-target immediately
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
                    let canTarget = other.strength < npc.strength * 0.8;
                    if (other.state === 'combat') {
                        // Opportunistic: attack weakened enemies in battle
                        if (['pirate', 'orc', 'military'].includes(npc.faction) && other.strength < npc.strength * 0.6) {
                            canTarget = true;
                        } else {
                            canTarget = false;
                        }
                    }

                    if (canTarget) {
                        // Military prioritization: distance + strength scoring
                        let targetScore = 0;
                        if (npc.faction === 'military') {
                            // Distance score: closer is better (0-1)
                            const distanceScore = 1 - (dist / detectionRadius);
                            // Strength score: weaker is better, but allow stronger with support
                            const strengthRatio = Math.min(other.strength / npc.strength, 2.0); // Cap at 2x
                            const strengthScore = 1 / strengthRatio;
                            // Center bonus: threats in center get priority
                            const centerDist = npc.position.mag();
                            const centerBonus = centerDist < 2000 ? 0.3 : 0;

                            targetScore = distanceScore + strengthScore + centerBonus;
                        } else {
                            // Other factions: simple distance priority
                            targetScore = 1 - (dist / detectionRadius);
                        }

                        if (targetScore > bestTargetScore) {
                            bestTargetScore = targetScore;
                            bestTarget = other;
                        }
                    }
                }
            }

            // Military battle detection: scan for nearby battles and approach/join allies
            if (npc.faction === 'military' && !npc.activeBattle) {
                const nearbyBattles = this.game.getBattles().filter(battle => {
                    const distanceToBattle = Vector2.distance(npc.position, battle.position);
                    return distanceToBattle < detectionRadius * 2.0; // Extended detection for battles
                });

                for (const battle of nearbyBattles) {
                    // Check if allies are in this battle
                    const alliesInBattle = [...battle.sideA, ...battle.sideB].filter(fleet =>
                        this.isAlly(npc, fleet)
                    );

                    if (alliesInBattle.length > 0) {
                        const distanceToBattle = Vector2.distance(npc.position, battle.position);

                        if (distanceToBattle <= battle.radius) {
                            // Within battle radius - join immediately
                            const allySide = battle.sideA.includes(alliesInBattle[0]) ? 'A' : 'B';
                            battle.joinSide(npc, allySide);
                            npc.decisionTimer = 1.0 + Math.random();
                            break;
                        } else {
                            // Outside battle radius - move toward battle center
                            const formationOffset = new Vector2(
                                (Math.random() - 0.5) * 100,
                                (Math.random() - 0.5) * 100
                            );
                            npc.setTarget(battle.position.add(formationOffset));
                            npc.decisionTimer = 2.0 + Math.random();
                            break;
                        }
                    }
                }
            }

            // Military coordination: check if allies are already attacking nearby threats
            if (npc.faction === 'military' && (!npc.target && !npc.followTarget)) {
                // Look for military allies who are actively pursuing hostile targets
                const attackingAllies = allFleets.filter(f =>
                    f !== npc &&
                    f.faction === 'military' &&
                    Vector2.distance(npc.position, f.position) < 1000 &&
                    f.followTarget instanceof Fleet &&
                    this.isHostile(f, f.followTarget as Fleet)
                );

                if (attackingAllies.length > 0) {
                    // Join the attack - coordinate with allies
                    const ally = attackingAllies[Math.floor(Math.random() * attackingAllies.length)];
                    if (ally.followTarget) {
                        // Follow the same target with formation offset
                        const formationOffset = new Vector2(
                            (Math.random() - 0.5) * 200,
                            (Math.random() - 0.5) * 200
                        );
                        npc.setFollowTarget(ally.followTarget, 'contact');
                        // Override the target to add formation spacing
                        if (npc.followTarget) {
                            npc.target = ally.followTarget.position.clone().add(formationOffset);
                        }
                        npc.decisionTimer = 2.0 + Math.random();
                        continue;
                    }
                }
            }

            // Decide action
            if (closestThreat && npc.faction !== 'raider') {
                // Flee! (Raiders never flee)
                const runDir = npc.position.sub(closestThreat.position).normalize();
                npc.setTarget(npc.position.add(runDir.scale(800)));
                npc.state = 'flee';
                npc.decisionTimer = 1.0 + Math.random(); // Reaction delay
            } else if (bestTarget) {
                // Military coordination: check for support before attacking stronger enemies
                let shouldAttack = true;
                if (npc.faction === 'military' && bestTarget.strength > npc.strength) {
                    const supportCount = allFleets.filter(f =>
                        f !== npc &&
                        (f.faction === 'military' || f.faction === 'civilian') &&
                        Vector2.distance(npc.position, f.position) < 800
                    ).length;
                    shouldAttack = supportCount * 0.5 + npc.strength > bestTarget.strength;
                }

                if (shouldAttack) {
                    // Attack!
                    npc.setFollowTarget(bestTarget, 'contact');
                    npc.state = 'normal';
                    npc.decisionTimer = 0.5 + Math.random();
                } else {
                    // Not enough support, patrol instead
                    npc.state = 'normal';
                    npc.decisionTimer = 2.0;
                }
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
        const f1 = a.faction;
        const f2 = b.faction;

        if ((f1 as string) === 'raider') return f2 !== 'raider';
        if ((f2 as string) === 'raider') return f1 !== 'raider';

        if (f1 === 'player') {
            return f2 === 'pirate' || f2 === 'orc';
        }
        if (f1 === 'civilian') {
            // Hostile to anyone who is attacking them or their allies
            if (b.activeBattle) {
                const bat = b.activeBattle;
                const otherSide = bat.sideA.includes(b) ? bat.sideB : bat.sideA;
                return otherSide.some((ally: Fleet) => this.isAlly(a, ally));
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
            if (b.activeBattle) {
                const bat = b.activeBattle;
                const otherSide = bat.sideA.includes(b) ? bat.sideB : bat.sideA;
                return otherSide.some((ally: Fleet) => this.isAlly(a, ally));
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
