import { Vector2 } from '../utils/Vector2';
import { rand } from '../utils/Rng';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Game } from './Game';
import { assessRelativeThreat, evaluateEngagement, getFactionProfile, type EngagementAssessment } from '../tactical/Ecosystem';
import type { DecoyBeacon } from '../entities/DecoyBeacon';

export class AIController {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    /** Threat the NPC believes the target has, limited by its sensor contact. */
    private perceivedPower(npc: Fleet, target: Fleet): number {
        const contact = this.game.getSensorContact(npc, target);
        if (contact && contact.level !== 'identified' && contact.intel.threat != null) return contact.intel.threat;
        return target.threatRating;
    }

    private woundedFraction(fleet: Fleet): number {
        let current = 0;
        let maximum = 0;
        for (const ship of fleet.ships) {
            if (ship.state === 'destroyed') continue;
            current += ship.hull + ship.armor + ship.shield;
            maximum += ship.maxHull + ship.maxArmor + ship.maxShield;
        }
        return maximum > 0 ? 1 - current / maximum : 0;
    }

    private assess(npc: Fleet, target: Fleet, allyPower: number, committed: boolean): EngagementAssessment {
        return evaluateEngagement({
            faction: npc.faction,
            ownPower: npc.threatRating,
            allyPower,
            perceivedEnemyPower: this.perceivedPower(npc, target),
            enemyFaction: target.faction,
            enemyWounded: this.woundedFraction(target),
            committed
        });
    }

    /** Where a fleeing NPC runs: toward a stronger friendly escort, else straight away. */
    private retreatPoint(npc: Fleet, threat: Fleet, knownFleets: Fleet[]): Vector2 {
        let haven: Fleet | null = null;
        let best = Infinity;
        for (const f of knownFleets) {
            if (f === npc || f.isPlayer || !this.isAlly(npc, f) || f.state === 'flee') continue;
            if (f.threatRating < threat.threatRating * 0.8) continue;
            const d = Vector2.distance(npc.position, f.position);
            if (d < 3500 && d < best) { best = d; haven = f; }
        }
        if (haven) return haven.position;
        const runDir = npc.position.sub(threat.position).normalize();
        return npc.position.add(runDir.scale(900));
    }

    private pickBeacon(npc: Fleet, beacons: readonly DecoyBeacon[], committed: boolean): DecoyBeacon | null {
        if (committed) return null;
        const profile = getFactionProfile(npc.faction);
        if (!profile.opportunist && !profile.responder) return null;
        let best: DecoyBeacon | null = null;
        let bestDist = Infinity;
        for (const beacon of beacons) {
            if (beacon.expired) continue;
            const dist = Vector2.distance(npc.position, beacon.position);
            if (dist > beacon.attractionRadius || dist >= bestDist) continue;
            if (profile.opportunist) {
                // The beacon reads as a wounded, weak fleet: only tempting if the NPC thinks it can win.
                const read = evaluateEngagement({
                    faction: npc.faction, ownPower: npc.threatRating, allyPower: 0,
                    perceivedEnemyPower: beacon.apparentPower, enemyFaction: 'player', enemyWounded: 0.8
                });
                if (!read.attack) continue;
            }
            best = beacon;
            bestDist = dist;
        }
        return best;
    }

    processAI() {
        const giveUpRadius = 2500;
        const backupRadius = 4000;
        const clock = this.game.getGameClock();
        const beacons = this.game.getDecoys();
        const celestialBodies = this.game.getEntities().filter(e => e instanceof CelestialBody) as CelestialBody[];
        const player = this.game.getPlayerFleet();
        const npcs = this.game.getNpcFleets();
        const allFleets = [player, ...npcs];

        for (const npc of npcs) {
            if (!this.game.shouldRunFleetAI(npc)) continue;
            // Terra's guardian fleet is an anchored defensive actor. It is
            // still present in tactical combat, but must not roam to random
            // POIs like an ordinary civilian convoy.
            if (npc.isStation) {
                npc.stopFollowing();
                npc.decisionTimer = 1;
                continue;
            }
            const isMilitaryLike = npc.faction === 'military' || npc.faction === 'mercenary';
            const profile = getFactionProfile(npc.faction);
            let followedFleet = npc.followTarget instanceof Fleet ? npc.followTarget : null;

            // Never retain the live Entity position or threat after the sensor
            // solution is lost. The next decision pass may reacquire the contact.
            if (followedFleet && !this.game.canFleetTarget(npc, followedFleet)) {
                npc.stopFollowing();
                npc.decisionTimer = 0;
                followedFleet = null;
            }

            // Ability Usage Logic
            this.handleAbilities(npc);

            // A fleet that just reached a decoy beacon sits still, fooled.
            if (clock < npc.dazedUntil) { npc.intent = 'lured'; continue; }

            // Avoid O(N) tactical assessment on every rendered frame. Sensor loss
            // above is still handled immediately; normal decisions use reaction time.
            if (npc.decisionTimer > 0) continue;
            const committed = clock < npc.committedUntil;
            const isChasing = !!followedFleet && this.isHostile(npc, followedFleet);

            const detectionRadius = Math.max(600, this.game.getFleetSensorRange(npc) * 2);
            const knownFleets = (this.game.getNearbyFleets?.(npc, detectionRadius) || allFleets).filter(fleet =>
                fleet === npc || this.game.canFleetTarget(npc, fleet)
            );
            const nearbyAllies = knownFleets.filter(f =>
                f !== npc && !f.isPlayer && this.isAlly(npc, f) && Vector2.distance(npc.position, f.position) < 900
            );
            const hasNearbyAlly = nearbyAllies.length > 0;
            const allyPower = nearbyAllies.reduce((sum, ally) => sum + ally.threatRating, 0);

            // Give up chase/flee if too far or futile.
            if (followedFleet && isChasing) {
                if (followedFleet.inAsteroidBelt && !npc.inAsteroidBelt) {
                    npc.stopFollowing();
                    npc.intent = 'roam';
                    npc.committedUntil = 0;
                    npc.decisionTimer = 2.0;
                    continue;
                }
                const dist = Vector2.distance(npc.position, followedFleet.position);
                const chase = this.assess(npc, followedFleet, allyPower, committed);
                if (!isMilitaryLike && chase.flee) {
                    npc.stopFollowing();
                    npc.setTarget(this.retreatPoint(npc, followedFleet, knownFleets));
                    npc.state = 'flee';
                    npc.intent = 'flee';
                    npc.committedUntil = 0;
                    npc.decisionTimer = 0.8;
                    continue;
                }
                if (!chase.attack && !(isMilitaryLike && hasNearbyAlly)) {
                    npc.stopFollowing();
                    npc.intent = 'roam';
                    npc.committedUntil = 0;
                    npc.decisionTimer = 1.5;
                    continue;
                }

                const targetPosMag = followedFleet.position.mag();
                if (targetPosMag > this.game.getAsteroidBeltInnerRadius()) {
                    const dirToTarget = followedFleet.position.normalize();
                    const targetVelDir = followedFleet.velocity.normalize();
                    if (dirToTarget.dot(targetVelDir) > 0.5) {
                        npc.stopFollowing();
                        npc.setTarget(new Vector2((rand() - 0.5) * 1000, (rand() - 0.5) * 1000));
                        npc.intent = 'roam';
                        npc.committedUntil = 0;
                        npc.decisionTimer = 2.0;
                        continue;
                    }
                }

                const relativeToTarget = assessRelativeThreat(npc.threatRating, followedFleet.threatRating);
                const pursuitRange = relativeToTarget.band === 'predator' || relativeToTarget.band === 'apex'
                    ? giveUpRadius * 1.45
                    : relativeToTarget.band === 'prey' ? giveUpRadius * 0.72 : giveUpRadius;
                if (dist > pursuitRange || (dist > 1200 && npc.faction === 'pirate' &&
                    chase.winChance < 0.5 && !hasNearbyAlly)) {
                    npc.stopFollowing();
                    npc.committedUntil = 0;
                    npc.intent = 'roam';
                    if (celestialBodies.length > 0) {
                        const poi = celestialBodies[Math.floor(rand() * celestialBodies.length)];
                        npc.setTarget(poi.position.add(new Vector2((rand() - 0.5) * 200, (rand() - 0.5) * 200)));
                    }
                    npc.decisionTimer = 1.0;
                    continue;
                }
            }

            let bestTarget: Fleet | null = null;
            let bestTargetScore = -Infinity;
            let closestThreat: Fleet | null = null;
            let threatUrgency = -Infinity;
            let closestHostile: Fleet | null = null;
            let minDistHostile = detectionRadius;
            let backupCall = false;

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
                                backupCall = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (!backupCall) {
                for (const other of knownFleets) {
                    if (npc === other) continue;

                    const dist = Vector2.distance(npc.position, other.position);
                    if (dist > detectionRadius) continue;

                    const hostileAtoB = this.isHostile(npc, other);
                    const hostileBtoA = this.isHostile(other, npc);
                    if (!hostileAtoB && !hostileBtoA) continue;

                    // Judge the fight from what the NPC can perceive, not the truth.
                    const read = this.assess(npc, other, allyPower, committed);

                    // Danger: a hostile we would likely lose to. Committed hunters
                    // keep tunnel vision and only react to their own quarry or a hopeless fight.
                    if (hostileBtoA && read.flee) {
                        const ignored = committed && followedFleet !== null && other !== followedFleet && read.winChance > 0.08;
                        const urgency = (1 - read.winChance) * 1000 - dist;
                        if (!ignored && urgency > threatUrgency) {
                            threatUrgency = urgency;
                            closestThreat = other;
                        }
                    }

                    if (hostileAtoB && read.attack) {
                        if (dist < minDistHostile) {
                            minDistHostile = dist;
                            closestHostile = other;
                        }
                        const proximityFactor = Math.max(0.05, 1 - dist / detectionRadius);
                        const targetScore = read.expectedValue * (0.4 + proximityFactor)
                            + (other.state === 'combat' ? 0.3 : 0);
                        if (targetScore > bestTargetScore) {
                            bestTargetScore = targetScore;
                            bestTarget = other;
                        }
                    }
                }
            }

            if (bestTarget && closestHostile && !backupCall) {
                const bestDist = Vector2.distance(npc.position, (bestTarget as Fleet).position);
                if (bestDist > minDistHostile * 1.35) {
                    bestTarget = closestHostile;
                }
            }

            // Decide action
            const isMilitaryWithAllies = isMilitaryLike && knownFleets.some(f => f !== npc && this.isAlly(npc, f) && Vector2.distance(npc.position, f.position) < 1000);
            // A beacon wins over idling, and over a target that is farther away than the beacon.
            const lure = this.pickBeacon(npc, beacons, committed);
            const beaconBeatsTarget = lure !== null && (bestTarget === null ||
                Vector2.distance(npc.position, lure.position) < Vector2.distance(npc.position, (bestTarget as Fleet).position) * 0.9);

            if (closestThreat && !isMilitaryWithAllies) {
                // Outmatched and alone: break contact toward friends, mines behind.
                const threat = closestThreat as Fleet;
                npc.stopFollowing();
                npc.setTarget(this.retreatPoint(npc, threat, knownFleets));
                if (Vector2.distance(npc.position, threat.position) <= 800 && npc.abilities.mine.cooldown <= 0 && rand() < 0.1) {
                    this.game.dropWarpMine(npc);
                }
                npc.state = 'flee';
                npc.intent = 'flee';
                npc.committedUntil = 0;
                npc.decisionTimer = 1.0 + rand();
            } else if (lure && beaconBeatsTarget) {
                const dist = Vector2.distance(npc.position, lure.position);
                npc.stopFollowing();
                npc.state = 'normal';
                if (dist < 140) {
                    npc.dazedUntil = clock + lure.investigate();
                    npc.setTarget(npc.position);
                    npc.intent = 'lured';
                    npc.decisionTimer = 1.0;
                } else {
                    npc.setTarget(lure.position);
                    npc.intent = isMilitaryLike ? 'respond' : 'lured';
                    npc.decisionTimer = 1.0;
                }
            } else if (bestTarget) {
                // Attack!
                const target = bestTarget as Fleet;
                if (npc.followTarget !== target || !committed) {
                    npc.committedUntil = clock + profile.commitSeconds;
                }
                npc.setFollowTarget(target, 'contact');
                npc.state = 'normal';
                npc.intent = 'hunt';
                npc.decisionTimer = 0.5 + rand();
            } else if (!npc.target && !npc.followTarget || npc.velocity.mag() < 5) {
                // Roaming - check for debris first
                npc.state = 'normal';
                npc.intent = 'roam';

                // Traders always seek debris, pirates and civilians seek when safe
                let foundDebris = false;
                if (npc.faction === 'mercenary' && this.game.canFleetTarget(npc, player)) {
                    npc.setFollowTarget(player, 'approach');
                    npc.decisionTimer = 2.5;
                    foundDebris = true;
                }
                if (npc.faction === 'trader' ||
                    (['pirate', 'civilian'].includes(npc.faction) && !closestThreat)) { // Traders always, others when safe
                    const nearbyCrates = this.game.getCrates()
                        .filter((c: any) => Vector2.distance(npc.position, c.position) < (npc.faction === 'trader' ? 1500 : 1200))
                        .sort((a: any, b: any) => Vector2.distance(npc.position, a.position) - Vector2.distance(npc.position, b.position));
                    const nearbyDebris = this.game.getDebris()
                        .filter((d: any) => Vector2.distance(npc.position, d.position) < (npc.faction === 'trader' ? 1500 : 1200)) // Traders have longer range
                        .sort((a: any, b: any) => Vector2.distance(npc.position, a.position) - Vector2.distance(npc.position, b.position));

                    if (nearbyCrates.length > 0) {
                        const targetCrate = nearbyCrates[0];
                        npc.setFollowTarget(targetCrate, 'approach');
                        npc.intent = 'scavenge';
                        foundDebris = true;
                        npc.decisionTimer = npc.faction === 'trader' ? 6.0 : 4.0;
                    } else if (nearbyDebris.length > 0) {
                        const targetDebris = nearbyDebris[0];
                        npc.setFollowTarget(targetDebris, 'approach');
                        npc.intent = 'scavenge';
                        foundDebris = true;
                        npc.decisionTimer = npc.faction === 'trader' ? 6.0 : 4.0; // Traders stay longer
                    }
                }

                // If no debris found, roam normally
                if (!foundDebris && rand() < 0.01 && celestialBodies.length > 0) {
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

                    const poi = filteredPOIs[Math.floor(rand() * filteredPOIs.length)];
                    const offset = new Vector2((rand() - 0.5) * 400, (rand() - 0.5) * 400);
                    npc.setTarget(poi.position.add(offset));
                    if (npc.faction === 'civilian') {
                        npc.civilianStopTimer = 2 + rand() * 4;
                    } else if (npc.faction === 'trader') {
                        npc.civilianStopTimer = 10 + rand() * 10;
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

    /**
     * Records the first aggressor of a newly started fight. Only nearby,
     * law-abiding NPCs that have a proper sensor solution receive a one-use
     * response permission. Fleets that discover the fight later do not.
     */
    public recordCombatStart(attacker: Fleet, target: Fleet) {
        const witnesses = [this.game.getPlayerFleet(), ...this.game.getNpcFleets()];
        for (const witness of witnesses) {
            if (witness === attacker || witness === target || witness.isStation) continue;
            if (!['civilian', 'military', 'mercenary'].includes(witness.faction)) continue;
            // Lawful witnesses only intervene when the opening attack harmed
            // one of their own side. A lawful fleet engaging pirates, orcs or
            // raiders must not turn every nearby civilian into a responder.
            if (!this.isAlly(witness, target)) continue;
            if (witness.activeBattle || witness.currentTarget) continue;
            if (!this.game.canFleetTarget(witness, attacker)) continue;

            witness.witnessHostility.add(attacker);
            witness.witnessedAggressors.add(attacker);
        }
    }

    public isHostile(a: Fleet, b: Fleet): boolean {
        if (a === b) return false;
        if (a.hostileTo.has(b)) return true;
        if (a.witnessHostility.has(b)) return true;
        const f1 = a.faction;
        const f2 = b.faction;

        // The Terra guardian is technically civilian so it is shown and
        // treated as a home fleet, but it answers fire from hostile factions.
        if (a.isStation) return ['pirate', 'orc', 'raider'].includes(f2);
        if (b.isStation) return ['pirate', 'orc', 'raider'].includes(f1);

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
            return false;
        }

        // Mercenaries follow military rules above

        // Civilians and Traders only fight back if attacked
        if (f1 === 'civilian' || f1 === 'trader') {
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
