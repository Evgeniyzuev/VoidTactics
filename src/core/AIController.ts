import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Game } from './Game';
import { assessRelativeThreat, requiredAttackAdvantage } from '../tactical/Ecosystem';

export class AIController {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    processAI() {
        const giveUpRadius = 2500;
        const backupRadius = 4000;
        const celestialBodies = this.game.getEntities().filter(e => e instanceof CelestialBody) as CelestialBody[];
        const player = this.game.getPlayerFleet();
        const npcs = this.game.getNpcFleets();
        const allFleets = [player, ...npcs];
        const stations = this.game.getMilitaryStations?.() || [];

        for (const npc of npcs) {
            const isMilitaryLike = npc.faction === 'military' || npc.faction === 'mercenary';
            const orcAttackWhenOutmatched = npc.faction === 'orc' && Math.random() < 0.5;
            let followedFleet = npc.followTarget instanceof Fleet ? npc.followTarget : null;

            // Terra's fixed platforms are military territory. Hostile NPCs
            // turn away before entering the doubled interception radius,
            // while cloaked raiders can still slip past the warning.
           if (['pirate', 'orc', 'raider'].includes(npc.faction) && !npc.isCloaked) {
                const station = (this.game.getMilitaryStations?.() || [])
                   .filter(candidate => Vector2.distance(npc.position, candidate.position) < candidate.attackRadius * 2)
                    .sort((a, b) => Vector2.distance(npc.position, a.position) - Vector2.distance(npc.position, b.position))[0];
                if (station && !orcAttackWhenOutmatched) {
                    const escape = npc.position.sub(station.position).normalize();
                    npc.stopFollowing();
                    npc.setTarget(npc.position.add(escape.scale(900)));
                    npc.state = 'flee';
                    npc.decisionTimer = 1;
                    continue;
                }
            }

            // Never retain the live Entity position or threat after the sensor
            // solution is lost. The next decision pass may reacquire the contact.
            if (followedFleet && !this.game.canFleetTarget(npc, followedFleet)) {
                npc.stopFollowing();
                npc.decisionTimer = 0;
                followedFleet = null;
            }

            // Ability Usage Logic
            this.handleAbilities(npc);

            // Avoid O(N) tactical assessment on every rendered frame. Sensor loss
            // above is still handled immediately; normal decisions use reaction time.
            if (npc.decisionTimer > 0) continue;
            const isChasing = !!followedFleet && this.isHostile(npc, followedFleet);

            const detectionRadius = Math.max(600, this.game.getFleetSensorRange(npc) * 2);
            const knownFleets = [...allFleets, ...(npc.faction === 'orc' ? stations : [])].filter(fleet =>
                fleet === npc || this.game.canFleetTarget(npc, fleet)
            );
            const hasNearbyAlly = knownFleets.some(f =>
                f !== npc &&
                this.isAlly(npc, f) &&
                Vector2.distance(npc.position, f.position) < 800
            );
            const localPower = npc.threatRating + knownFleets
                .filter(f => f !== npc && !f.isPlayer && this.isAlly(npc, f) && Vector2.distance(npc.position, f.position) < 900)
                .reduce((sum, ally) => sum + ally.threatRating * 0.55, 0);

            // Give up chase/flee if too far or futile.
            if (followedFleet && isChasing) {
                const dist = Vector2.distance(npc.position, followedFleet.position);
                if (!isMilitaryLike && followedFleet.threatRating > localPower * 1.15) {
                    const runDir = npc.position.sub(followedFleet.position).normalize();
                    npc.stopFollowing();
                    npc.setTarget(npc.position.add(runDir.scale(900)));
                    npc.state = 'flee';
                    npc.decisionTimer = 0.8;
                    continue;
                }

                const targetPosMag = followedFleet.position.mag();
                if (targetPosMag > this.game.getSystemRadius() * 0.8) {
                    const dirToTarget = followedFleet.position.normalize();
                    const targetVelDir = followedFleet.velocity.normalize();
                    if (dirToTarget.dot(targetVelDir) > 0.5) {
                        npc.stopFollowing();
                        npc.setTarget(new Vector2((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000));
                        npc.decisionTimer = 2.0;
                        continue;
                    }
                }

                const relativeToTarget = assessRelativeThreat(npc.threatRating, followedFleet.threatRating);
                const pursuitRange = relativeToTarget.band === 'predator' || relativeToTarget.band === 'apex'
                    ? giveUpRadius * 1.45
                    : relativeToTarget.band === 'prey' ? giveUpRadius * 0.72 : giveUpRadius;
                if (dist > pursuitRange || (dist > 1200 && npc.faction === 'pirate' &&
                    localPower < followedFleet.threatRating && !hasNearbyAlly)) {
                    npc.stopFollowing();
                    if (celestialBodies.length > 0) {
                        const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                        npc.setTarget(poi.position.add(new Vector2((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200)));
                    }
                    npc.decisionTimer = 1.0;
                    continue;
                }
            }

            let bestTarget: Fleet | null = null;
            let bestTargetScore = -1;
            let closestThreat: Fleet | null = null;
            let minDistThreat = detectionRadius;
            let closestHostile: Fleet | null = null;
            let minDistHostile = detectionRadius;

            // 1. Guardian Instinct / Backup Logic for Military
            if (isMilitaryLike) {
                for (const other of knownFleets) {
                    if (this.isAlly(npc, other) && (other.state === 'combat' || other.currentTarget)) {
                        const dist = Vector2.distance(npc.position, other.position);
                        if (dist < backupRadius) {
                            // Rush to help ally
                            const battle = other.activeBattle as { participants?: Fleet[]; attacker?: Fleet; target?: Fleet } | null;
                            const battleFleets = battle
                                ? (Array.isArray(battle.participants)
                                    ? battle.participants
                                    : [battle.attacker, battle.target].filter((fleet): fleet is Fleet => fleet instanceof Fleet))
                                : [];
                            const threat = other.currentTarget || battleFleets.find(fleet => this.isHostile(npc, fleet)) || null;
                            if (threat && threat !== npc && this.isHostile(npc, threat) &&
                                this.game.canFleetTarget(npc, threat)) {
                                bestTarget = threat;
                                bestTargetScore = 999; // Maximum priority
                                break;
                            }
                        }
                    }
                }
            }

            if (bestTargetScore < 999) {
                for (const other of knownFleets) {
                    if (npc === other) continue;

                    const dist = Vector2.distance(npc.position, other.position);
                    if (dist > detectionRadius) continue;

                    const hostileAtoB = this.isHostile(npc, other);
                    const hostileBtoA = this.isHostile(other, npc);

                    // Threat Evaluation
                    if (hostileBtoA) {
                        // Civilians are easily spooked, Traders only flee from stronger opponents
                        const fearFactor = ['pirate', 'orc', 'raider'].includes(npc.faction) ? 1.15 : npc.faction === 'civilian' ? 0.5 : (npc.faction === 'trader' ? 1.0 : 1.2);
                        if (other.threatRating > localPower * fearFactor) {
                            if (dist < minDistThreat) {
                                minDistThreat = dist;
                                closestThreat = other;
                            }
                        }
                    }

                    if (hostileAtoB) {
                        let canTarget = false;
                        if (isMilitaryLike) {
                            canTarget = true;
                        } else {
                            const isOutmatched = other.threatRating > localPower * requiredAttackAdvantage(npc.faction);
                            canTarget = localPower >= other.threatRating * requiredAttackAdvantage(npc.faction)
                                || (npc.faction === 'orc' && orcAttackWhenOutmatched && isOutmatched);
                        }

                        if (canTarget) {
                            if (dist < minDistHostile) {
                                minDistHostile = dist;
                                closestHostile = other;
                            }
                            // Calculate scores
                            let strengthRatio = localPower / Math.max(0.1, other.threatRating);
                            if (isMilitaryLike || npc.faction === 'pirate') {
                                strengthRatio = 0.5 + strengthRatio * 0.25;
                            }
                            strengthRatio = Math.min(2.5, strengthRatio);
                            const proximityFactor = 1 - (dist / detectionRadius);
                            const proximityWeight = npc.faction === 'pirate' ? Math.pow(proximityFactor, 2) : proximityFactor;
                            const cargoBonus = (other.faction === 'trader') ? 2.0 : 0;
                            const combatBonus = (other.state === 'combat') ? 0.65 : 0;
                            const preyBonus = Math.min(2, Math.max(0, strengthRatio - 1));

                            let targetScore = proximityWeight * (strengthRatio + preyBonus + cargoBonus + combatBonus);

                            // Raiders ignore strength mostly
                            if ((npc.faction as string) === 'raider') targetScore += 5;
                            if (isMilitaryLike) {
                                targetScore = 10000 - dist; // Always prioritize the closest hostile
                            }

                            if (targetScore > bestTargetScore) {
                                bestTargetScore = targetScore;
                                bestTarget = other;
                            }
                        }
                    }
                }
            }

            if (bestTarget && closestHostile) {
                const bestDist = Vector2.distance(npc.position, bestTarget.position);
                if (bestDist > minDistHostile * 1.35) {
                    bestTarget = closestHostile;
                }
            }

            // Decide action
            const isMilitaryWithAllies = isMilitaryLike && knownFleets.some(f => f !== npc && this.isAlly(npc, f) && Vector2.distance(npc.position, f.position) < 1000);

            if (closestThreat && !isMilitaryLike && !isMilitaryWithAllies && !orcAttackWhenOutmatched) {
                // Aggressive factions still disengage when they are outmatched and alone.
                const runDir = npc.position.sub(closestThreat.position).normalize();
                npc.setTarget(npc.position.add(runDir.scale(800)));
                if (closestThreat && minDistThreat <= 800 && npc.abilities.mine.cooldown <= 0 && Math.random() < 0.1) {
                    this.game.dropWarpMine(npc);
                }
                npc.state = 'flee';
                npc.decisionTimer = 1.0 + Math.random();
            } else if (bestTarget) {
                // Attack!
                npc.setFollowTarget(bestTarget, 'contact');
                npc.state = 'normal';
                npc.decisionTimer = 0.5 + Math.random();
            } else if (!npc.target && !npc.followTarget || npc.velocity.mag() < 5) {
                // Roaming - check for debris first
                npc.state = 'normal';

                // Traders always seek debris, pirates and civilians seek when safe
                let foundDebris = false;
                if (npc.faction === 'mercenary' && this.game.canFleetTarget(npc, player)) {
                    npc.setFollowTarget(player, 'approach');
                    npc.decisionTimer = 2.5;
                    foundDebris = true;
                }
                if (npc.faction === 'trader' ||
                    (['pirate', 'civilian'].includes(npc.faction) && minDistThreat > 1000)) { // Traders always, others when safe
                    const nearbyCrates = this.game.getCrates()
                        .filter((c: any) => Vector2.distance(npc.position, c.position) < (npc.faction === 'trader' ? 1500 : 1200))
                        .sort((a: any, b: any) => Vector2.distance(npc.position, a.position) - Vector2.distance(npc.position, b.position));
                    const nearbyDebris = this.game.getDebris()
                        .filter((d: any) => Vector2.distance(npc.position, d.position) < (npc.faction === 'trader' ? 1500 : 1200)) // Traders have longer range
                        .sort((a: any, b: any) => Vector2.distance(npc.position, a.position) - Vector2.distance(npc.position, b.position));

                    if (nearbyCrates.length > 0) {
                        const targetCrate = nearbyCrates[0];
                        npc.setFollowTarget(targetCrate, 'approach');
                        foundDebris = true;
                        npc.decisionTimer = npc.faction === 'trader' ? 6.0 : 4.0;
                    } else if (nearbyDebris.length > 0) {
                        const targetDebris = nearbyDebris[0];
                        npc.setFollowTarget(targetDebris, 'approach');
                        foundDebris = true;
                        npc.decisionTimer = npc.faction === 'trader' ? 6.0 : 4.0; // Traders stay longer
                    }
                }

                // If no debris found, roam normally
                if (!foundDebris && Math.random() < 0.01 && celestialBodies.length > 0) {
                    let filteredPOIs = celestialBodies;
                    if (['civilian', 'military', 'mercenary'].includes(npc.faction)) {
                        filteredPOIs = celestialBodies
                            .filter(b => !b.name.includes('Asteroid') && !b.name.includes('Alpha'))
                            .sort((a, b) => a.position.mag() - b.position.mag())
                            .slice(0, 4);
                    } else if (npc.faction === 'trader') {
                        // Traders prioritize debris over planets now, but still roam if no debris
                        filteredPOIs = celestialBodies
                            .filter(b => !b.name.includes('Asteroid') && !b.name.includes('Alpha') && !b.name.includes('Outpost'))
                            .sort((a, b) => a.position.mag() - b.position.mag())
                            .slice(0, 2);
                    } else if (['pirate', 'orc', 'raider'].includes(npc.faction)) {
                        filteredPOIs = celestialBodies.filter(b => b.name.includes('Asteroid') || b.name.includes('Alpha') || b.isStar);
                    }

                    if (filteredPOIs.length === 0) filteredPOIs = celestialBodies;

                    const poi = filteredPOIs[Math.floor(Math.random() * filteredPOIs.length)];
                    const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
                    npc.setTarget(poi.position.add(offset));
                    if (npc.faction === 'civilian') {
                        npc.civilianStopTimer = 2 + Math.random() * 4;
                    } else if (npc.faction === 'trader') {
                        npc.civilianStopTimer = 10 + Math.random() * 10;
                    }
                    npc.decisionTimer = 5.0;
                }
            }
        }
    }

    private handleAbilities(npc: Fleet) {
        // Afterburner
        if (npc.state === 'flee') {
            this.game.activateNpcAbility(npc, 'afterburner');
        }

        // Raider Special: Cloak & Ambush
        if (npc.faction === 'raider' && npc.followTarget instanceof Fleet &&
            this.game.canFleetTarget(npc, npc.followTarget)) {
            const dist = Vector2.distance(npc.position, npc.followTarget.position);

            // Cloak when closing in (ambush)
            if (dist < 1200 && dist > 400 && npc.abilities.cloak.cooldown <= 0) {
                this.game.activateNpcAbility(npc, 'cloak');
            }

            // Afterburner to catch up
            if (dist > 800 && npc.abilities.afterburner.cooldown <= 0) {
                this.game.activateNpcAbility(npc, 'afterburner');
            }
        }

        // Military/Mercenary: Bubble to trap fleeing targets
        if ((npc.faction === 'military' || npc.faction === 'mercenary') && npc.followTarget instanceof Fleet) {
            const target = npc.followTarget;
            const bubbleAlreadyQueued = this.game.getBubbleZones().some(zone =>
                Vector2.distance(zone.position, target.position) < zone.radius
            );
            if (this.game.canFleetTarget(npc, target) && target.state === 'flee' &&
                Vector2.distance(npc.position, target.position) < 600) {
                if (npc.abilities.bubble.cooldown <= 0 && !bubbleAlreadyQueued) {
                    this.game.activateNpcAbility(npc, 'bubble');
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

        // Orc hostility is deterministic; tactical decisions must not flicker frame-to-frame.
        if (f1 === 'orc') {
            if (f2 === 'orc') return false;
            return true;
        }

        // Pirates hunt traders, civilians, and player
        if (f1 === 'pirate') {
            return ['civilian', 'trader', 'player', 'military', 'mercenary'].includes(f2);
        }

        // Military/Mercenary protect peace
        if (f1 === 'military' || f1 === 'mercenary') {
            if (['pirate', 'orc', 'raider'].includes(f2)) return true;
            if (b.currentTarget && this.isAlly(a, b.currentTarget)) return true;
            return false;
        }

        // Mercenaries follow military rules above

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
        const lawAbiding = ['military', 'mercenary', 'civilian', 'trader', 'player'];
        if (lawAbiding.includes(f1) && lawAbiding.includes(f2)) return true;

        return false;
    }
}
