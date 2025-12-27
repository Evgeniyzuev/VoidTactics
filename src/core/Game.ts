import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet, type Faction } from '../entities/Fleet';
import { Entity } from '../entities/Entity';
import { SaveSystem } from './SaveSystem';
import { UIManager } from './UIManager';
import { ModalManager } from './ModalManager';
import { Battle } from './Battle';


export class Game {
    private lastTime: number = 0;
    private renderer: Renderer;
    private input: InputManager;
    private camera: Camera;
    private ui: UIManager;
    private modal: ModalManager;

    // Entities
    private entities: Entity[] = [];
    private playerFleet!: Fleet;
    private npcFleets: Fleet[] = [];
    private battles: Battle[] = [];

    private backgroundCanvas: HTMLCanvasElement;

    // Time Control
    private isPaused: boolean = false;
    private timeScale: number = 1;
    private wasMovingLastFrame: boolean = false;
    private infoTooltip: HTMLDivElement | null = null;
    private cameraFollow: boolean = true;
    private isDragging: boolean = false;
    private lastMousePos: Vector2 = new Vector2(0, 0);

    // Fleet interaction
    private contactDistance: number = 50; // Distance for contact dialog
    private inspectedEntity: Entity | null = null; // Entity being inspected for tooltip

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);
        this.input = new InputManager(canvas);

        const { width, height } = this.renderer.getDimensions();
        this.camera = new Camera(width, height);

        this.backgroundCanvas = document.createElement('canvas');
        this.generateBackground(width, height);

        this.initWorld();

        // Setup UI
        this.ui = new UIManager('ui-layer', {
            onPlayPause: () => this.togglePause(),
            onSpeedChange: (speed) => this.setTimeScale(speed),
            onCameraToggle: (follow) => this.setCameraFollow(follow),
            onAbility: (id) => this.activateAbility(id)
        });

        // Setup Modal Manager
        this.modal = new ModalManager();

        // Start loop
        requestAnimationFrame((t) => this.loop(t));

        // Auto-Save Interval (5 seconds)
        setInterval(() => {
            SaveSystem.save(this.playerFleet, this.npcFleets);
        }, 5000);

        // Resize Listener for Camera & Background
        window.addEventListener('resize', () => {
            const { width, height } = this.renderer.getDimensions();
            this.camera.resize(width, height);
            this.generateBackground(width, height);
        });
    }

    private togglePause() {
        this.isPaused = !this.isPaused;
        this.ui.updatePlayIcon(this.isPaused);
    }

    private setTimeScale(scale: number) {
        this.timeScale = scale;
    }

    private setCameraFollow(follow: boolean) {
        this.cameraFollow = follow;
        this.ui.setCameraFollowState(this.cameraFollow);

        // If enabling, immediately snap to player
        if (this.cameraFollow) {
            this.camera.position = this.playerFleet.position.clone();
        }
    }

    private generateBackground(width: number, height: number) {
        this.backgroundCanvas.width = width;
        this.backgroundCanvas.height = height;
        const ctx = this.backgroundCanvas.getContext('2d');
        if (!ctx) return;

        // 1. Deep Space Base
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#020205'); // Deepest black-blue
        gradient.addColorStop(1, '#050510'); // Slightly lighter
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 2. Stars
        const starCount = Math.floor((width * height) / 2000);
        for (let i = 0; i < starCount; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 1.5;
            const alpha = Math.random();
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(x, y, size, size);
        }

        // 3. Subtle Nebula / Dust (Noise-like clouds)
        const cloudCount = 5;
        for (let i = 0; i < cloudCount; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const radius = 200 + Math.random() * 400;

            const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            const r = Math.floor(Math.random() * 50);
            const g = Math.floor(Math.random() * 20);
            const b = Math.floor(50 + Math.random() * 100); // Blue-ish
            cloudGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.04)`);
            cloudGrad.addColorStop(1, 'transparent');

            ctx.fillStyle = cloudGrad;
            ctx.fillRect(0, 0, width, height);
        }
    }

    private initWorld() {
        // Star
        const star = new CelestialBody(0, 0, 150, '#FFD700', 'Sol', true);
        this.entities.push(star);

        // Planets
        this.entities.push(new CelestialBody(800, 0, 40, '#00CED1', 'Terra'));
        this.entities.push(new CelestialBody(860, 0, 10, '#AAAAAA', 'Luna'));
        this.entities.push(new CelestialBody(-1200, 400, 60, '#FF4500', 'Marsish'));
        this.entities.push(new CelestialBody(400, -1500, 110, '#DEB887', 'Jupit'));

        // Asteroid Belt
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2000 + Math.random() * 500;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 5 + Math.random() * 15;
            this.entities.push(new CelestialBody(x, y, size, '#888888', 'Asteroid'));
        }

        this.entities.push(new CelestialBody(-600, -600, 20, '#FF00FF', 'Outpost Alpha'));

        const saveData = SaveSystem.load();

        if (saveData) {
            console.log('Loading Save Game...');
            const pData = saveData.player;
            this.playerFleet = new Fleet(pData.x, pData.y, pData.color, true);
            this.playerFleet.velocity = new Vector2(pData.vx, pData.vy);
            this.playerFleet.strength = pData.strength || 10;
            this.playerFleet.faction = 'player';
            this.entities.push(this.playerFleet);

            if (saveData.npcs && saveData.npcs.length > 0) {
                for (const nData of saveData.npcs) {
                    const npc = new Fleet(nData.x, nData.y, nData.color, false);
                    npc.velocity = new Vector2(nData.vx, nData.vy);
                    npc.strength = nData.strength || 10;
                    npc.faction = nData.faction as any || 'civilian';
                    this.entities.push(npc);
                    this.npcFleets.push(npc);
                }
            } else {
                this.spawnNPCs(30);
            }
        } else {
            console.log('Starting New Game...');
            this.playerFleet = new Fleet(500, 500, '#00AAFF', true);
            this.playerFleet.strength = 10;
            this.playerFleet.faction = 'player';
            this.entities.push(this.playerFleet);
            this.spawnNPCs(30);
        }
    }

    private spawnNPCs(count: number, specificFaction?: Faction) {
        const factions: { type: Faction, color: string, weight: number }[] = [
            { type: 'civilian', color: '#32CD32', weight: 0.5 }, // Green
            { type: 'pirate', color: '#FF4444', weight: 0.2 },   // Red
            { type: 'orc', color: '#9370DB', weight: 0.15 },    // Purple
            { type: 'military', color: '#FFFF00', weight: 0.15 } // Yellow
        ];

        for (let i = 0; i < count; i++) {
            // Pick faction
            let factionDef = factions[0];
            if (specificFaction) {
                factionDef = factions.find(f => f.type === specificFaction) || factions[0];
            } else {
                let rand = Math.random();
                for (const f of factions) {
                    if (rand < f.weight) {
                        factionDef = f;
                        break;
                    }
                    rand -= f.weight;
                }
            }

            const angle = Math.random() * Math.PI * 2;
            const distance = 1000 + Math.random() * 3000;
            const startX = Math.cos(angle) * distance;
            const startY = Math.sin(angle) * distance;

            const npc = new Fleet(startX, startY, factionDef.color, false);
            npc.faction = factionDef.type;

            // Strength Distribution Logic: Equal weight for (Same, Multiplied, Divided)
            // Coefficients: 2, 4, 8 (Equal weight)
            const playerStrength = this.playerFleet.strength;
            const coefficients = [2, 4, 8];
            const coeff = coefficients[Math.floor(Math.random() * coefficients.length)];

            let baseS = playerStrength;
            const randType = Math.random();
            if (randType < 0.33) {
                baseS = playerStrength;
            } else if (randType < 0.66) {
                baseS = playerStrength * coeff;
            } else {
                baseS = playerStrength / coeff;
            }

            // Apply +-30% variance
            const variance = 0.7 + Math.random() * 0.6;
            npc.strength = Math.max(1, Math.round(baseS * variance));

            this.entities.push(npc);
            this.npcFleets.push(npc);
        }
    }

    private loop(timestamp: number) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        const wheelDelta = this.input.getWheelDelta();
        const pinchDelta = this.input.getPinchDelta();
        if (wheelDelta !== 0) this.camera.adjustZoom(wheelDelta);
        if (pinchDelta !== 0) this.camera.adjustZoom(pinchDelta);

        if (this.input.isMouseDown) {
            const clickPos = new Vector2(this.input.mousePos.x, this.input.mousePos.y);

            if (!this.isDragging) {
                this.isDragging = true;
                this.lastMousePos = clickPos;
            } else {
                const worldPos = this.camera.screenToWorld(this.input.mousePos);

                // If following someone, use Mouse Down to direct thrust
                if (this.playerFleet.followTarget) {
                    this.playerFleet.manualSteerTarget = worldPos;
                    // While steering, we might prefer NOT to pan unless deliberate
                }

                const delta = clickPos.sub(this.lastMousePos);
                // Only pan if we are NOT manually steering OR if we drag quite a bit
                const panThreshold = this.playerFleet.followTarget ? 20 : 2;
                if (delta.mag() > panThreshold) {
                    this.camera.pan(-delta.x, -delta.y);
                    this.lastMousePos = clickPos;

                    if (this.cameraFollow) {
                        this.cameraFollow = false;
                        this.ui.setCameraFollowState(false);
                    }
                    // If panned, clear steering to avoid conflict
                    this.playerFleet.manualSteerTarget = null;
                }
            }
        } else {
            const wasSteering = this.playerFleet.manualSteerTarget !== null;
            this.playerFleet.manualSteerTarget = null;

            if (this.isDragging) {
                // Was dragging, now released. Check for click
                const worldTarget = this.camera.screenToWorld(this.input.mousePos);
                const isDoubleClick = this.input.isDoubleClick();

                if (isDoubleClick) {
                    this.playerFleet.setTarget(worldTarget);
                    if (this.isPaused) this.togglePause();
                    this.closeTooltip();
                } else if (!wasSteering) {
                    // Inspect only if we weren't manually guiding the ship
                    this.inspectObject(worldTarget);
                }
            }
            this.isDragging = false;
        }

        if (!this.isPaused) {
            this.update(dt * this.timeScale);
            this.ui.updateAbilities(this.playerFleet);
        }
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    private SYSTEM_RADIUS: number = 8000;

    private update(dt: number) {
        if (this.isPaused) return;

        dt = dt * this.timeScale;

        // 1. Maintain Population & Bounds Check
        const toRemoveBounds: Fleet[] = [];
        for (const f of this.npcFleets) {
            if (f.position.mag() > this.SYSTEM_RADIUS) {
                toRemoveBounds.push(f);
            }
        }
        for (const f of toRemoveBounds) {
            const idx = this.npcFleets.indexOf(f);
            if (idx !== -1) this.npcFleets.splice(idx, 1);
            const eidx = this.entities.indexOf(f);
            if (eidx !== -1) this.entities.splice(eidx, 1);
        }

        if (this.npcFleets.length < 29) {
            // Count current factions
            const counts: Record<string, number> = {
                civilian: 0,
                pirate: 0,
                orc: 0,
                military: 0
            };
            for (const f of this.npcFleets) {
                if (counts[f.faction] !== undefined) counts[f.faction]++;
            }

            // Target counts based on weights (Total 30 NPCs: Civ 15, Pirate 6, Orc 4, Military 4)
            if (counts.civilian < 15) this.spawnNPCs(1, 'civilian');
            else if (counts.pirate < 6) this.spawnNPCs(1, 'pirate');
            else if (counts.orc < 4) this.spawnNPCs(1, 'orc');
            else if (counts.military < 4) this.spawnNPCs(1, 'military');
            else this.spawnNPCs(1); // Normal weighted spawn
        }

        // 2. Update Fleet Scaling based on Player Strength
        const playerStrength = this.playerFleet.strength;
        for (const entity of this.entities) {
            if (entity instanceof Fleet) {
                const ratio = entity.strength / playerStrength;
                // Clamp sizeMultiplier to at least 0.4 to prevent negative radius crashes
                entity.sizeMultiplier = Math.max(0.4, 1 + Math.log2(ratio) * 0.2);
            }
        }

        // Boundary warning for player
        if (this.playerFleet.position.mag() > this.SYSTEM_RADIUS * 0.9) {
            // Very simple warning for now (no UI yet)
            // console.warn("Approaching system boundary!");
        }
        if (this.playerFleet.position.mag() > this.SYSTEM_RADIUS) {
            // Push player back
            const dir = this.playerFleet.position.normalize();
            this.playerFleet.position = dir.scale(this.SYSTEM_RADIUS);
            this.playerFleet.velocity = this.playerFleet.velocity.scale(-0.5);
        }

        // 3. AI & Combat & Abilities
        const allFleets = [this.playerFleet, ...this.npcFleets];

        // Bubble Field Effect
        for (const f of allFleets) {
            if (f.abilities.bubble.active) {
                const bubbleRadius = 8 * f.sizeMultiplier * 25; // Match visual radius
                for (const other of allFleets) {
                    if (f === other) continue;
                    if (Vector2.distance(f.position, other.position) < bubbleRadius) {
                        other.isBubbled = true;
                    }
                }
            }
        }

        this.processAI();
        this.processCombat(dt);

        // 4. Update Entities
        for (const e of this.entities) e.update(dt);

        if (this.cameraFollow) {
            const camTarget = this.playerFleet.position;
            const lerpSpeed = 5.0;
            const diff = camTarget.sub(this.camera.position);
            this.camera.position = this.camera.position.add(diff.scale(lerpSpeed * dt));
        }

        // Handle proximity triggers for follow modes
        if (this.playerFleet.followTarget) {
            const dist = Vector2.distance(this.playerFleet.position, this.playerFleet.followTarget.position);

            if (this.playerFleet.followMode === 'contact') {
                const triggerDist = this.playerFleet.followTarget instanceof CelestialBody ?
                    (this.playerFleet.followTarget as CelestialBody).radius + 10 :
                    this.contactDistance;

                if (dist <= triggerDist) {
                    if (this.playerFleet.followTarget instanceof Fleet) {
                        this.initiateContact(this.playerFleet.followTarget);
                    } else if (this.playerFleet.followTarget instanceof CelestialBody) {
                        alert(`Прибытие к ${(this.playerFleet.followTarget as CelestialBody).name}`);
                    }
                    this.playerFleet.stopFollowing();
                }
            }
        }

        const isMoving = this.playerFleet.velocity.mag() > 1;
        const inCombat = this.playerFleet.state === 'combat';

        if (this.wasMovingLastFrame && !isMoving && !this.playerFleet.target && !inCombat) {
            if (!this.isPaused) this.togglePause();
        }
        this.wasMovingLastFrame = isMoving;
    }

    private isHostile(a: Fleet, b: Fleet): boolean {
        if (a === b) return false;
        const f1 = a.faction;
        const f2 = b.faction;

        if (f1 === 'player') {
            return f2 === 'pirate' || f2 === 'orc';
        }
        if (f1 === 'civilian') return false;
        if (f1 === 'pirate') return f2 === 'civilian' || f2 === 'player' || f2 === 'military';
        if (f1 === 'orc') {
            if (f2 === 'orc') return Math.random() < 0.1; // Seldom fight own kind
            return true;
        }
        if (f1 === 'military') return f2 === 'pirate' || f2 === 'orc';

        return false;
    }

    private processAI() {
        const detectionRadius = 1000;
        const giveUpRadius = 2500;
        const celestialBodies = this.entities.filter(e => e instanceof CelestialBody) as CelestialBody[];

        for (const npc of this.npcFleets) {
            if (npc.state === 'combat') continue;

            // Give up chase/flee if too far or futility
            if (npc.followTarget instanceof Fleet) {
                const dist = Vector2.distance(npc.position, npc.followTarget.position);

                // If it's a chase: Check if target is much faster or too far
                const isChasing = this.isHostile(npc, npc.followTarget as Fleet);
                if (isChasing) {
                    const targetSpeed = (npc.followTarget as Fleet).velocity.mag();
                    const myMaxSpeed = npc.maxSpeed * Math.pow(npc.sizeMultiplier, -0.2);

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
            let closestThreat: Fleet | null = null;
            let minDistThreat = detectionRadius;
            let minDistTarget = detectionRadius;

            // Scan all fleets (including player)
            const allFleets = [this.playerFleet, ...this.npcFleets];
            for (const other of allFleets) {
                if (npc === other || other.state === 'combat' || other.isCloaked) continue;

                const dist = Vector2.distance(npc.position, other.position);
                if (dist > detectionRadius) continue;

                const hostileAtoB = this.isHostile(npc, other);
                const hostileBtoA = this.isHostile(other, npc);

                if (hostileBtoA && other.strength > npc.strength * 1.2) {
                    // Threat: He wants to kill me and is stronger
                    if (dist < minDistThreat) {
                        minDistThreat = dist;
                        closestThreat = other;
                    }
                } else if (hostileAtoB && other.strength < npc.strength * 0.8) {
                    // Target: I want to kill him and am stronger
                    if (dist < minDistTarget) {
                        minDistTarget = dist;
                        bestTarget = other;
                    }
                }
            }

            // Decide action
            if (closestThreat) {
                // Flee!
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
                        filteredPOIs = celestialBodies.filter(b => !b.name.includes('Asteroid') && !b.name.includes('Alpha'));
                    } else if (npc.faction === 'pirate' || npc.faction === 'orc') {
                        filteredPOIs = celestialBodies.filter(b => b.name.includes('Asteroid') || b.name.includes('Alpha') || b.isStar);
                    }
                    if (filteredPOIs.length === 0) filteredPOIs = celestialBodies;

                    const poi = filteredPOIs[Math.floor(Math.random() * filteredPOIs.length)];
                    const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
                    npc.setTarget(poi.position.add(offset));
                    npc.decisionTimer = 5.0; // Long roams
                }
            }
        }
    }

    private processCombat(dt: number) {
        const allFleets = [this.playerFleet, ...this.npcFleets];

        // 1. Tick and Check for Resolution
        const toRemove: Fleet[] = [];
        for (let i = this.battles.length - 1; i >= 0; i--) {
            const b = this.battles[i];
            b.update(dt);
            if (b.timer <= 0) {
                this.resolveBattleGroup(b, toRemove);
                this.battles.splice(i, 1);
            }
        }

        // 2. Interaction check for new combats or joining
        for (let i = 0; i < allFleets.length; i++) {
            for (let j = i + 1; j < allFleets.length; j++) {
                const f1 = allFleets[i];
                const f2 = allFleets[j];

                if (!this.isHostile(f1, f2) && !this.isHostile(f2, f1)) continue;

                // Support joining already existing battles
                // If both are in the same battle, ignore
                if (f1.activeBattle && f1.activeBattle === f2.activeBattle) continue;

                const r1 = 8 * f1.sizeMultiplier;
                const r2 = 8 * f2.sizeMultiplier;

                let triggerDist = 4 * Math.max(r1, r2); // Default

                // If one is specifically chasing/fleeing, use Chaser's 4x radius
                if (f1.followTarget === f2) triggerDist = 4 * r1;
                else if (f2.followTarget === f1) triggerDist = 4 * r2;

                if (Vector2.distance(f1.position, f2.position) < triggerDist) {
                    if (!f1.activeBattle && !f2.activeBattle) {
                        // Start NEW Battle
                        const b = new Battle(f1, f2);
                        this.battles.push(b);
                    } else if (f1.activeBattle && !f2.activeBattle) {
                        // f2 joins f1's battle against f1
                        f1.activeBattle.addFleet(f2, f1);
                    } else if (!f1.activeBattle && f2.activeBattle) {
                        // f1 joins f2's battle against f2
                        f2.activeBattle.addFleet(f1, f2);
                    }
                    // If both already in DIFFERENT battles, we ignore for now to avoid merging complex battles
                }
            }
        }

        // Handle dead fleets
        for (const dead of toRemove) {
            const idx = this.npcFleets.indexOf(dead);
            if (idx !== -1) this.npcFleets.splice(idx, 1);
            const eidx = this.entities.indexOf(dead);
            if (eidx !== -1) this.entities.splice(eidx, 1);

            if (dead === this.playerFleet) {
                alert('ВАШ ФЛОТ УНИЧТОЖЕН!');
                SaveSystem.clear();
                location.reload();
            }
        }
    }


    private resolveBattleGroup(battle: Battle, toRemove: Fleet[]) {
        const sA = battle.totalSizeA * (0.8 + Math.random() * 0.4);
        const sB = battle.totalSizeB * (0.8 + Math.random() * 0.4);

        const winnerSide = sA > sB ? battle.sideA : battle.sideB;
        const loserSide = sA > sB ? battle.sideB : battle.sideA;
        const winS = sA > sB ? sA : sB;
        const loseS = sA > sB ? sB : sA;

        const totalWinBase = winnerSide.reduce((sum, f) => sum + f.strength, 0);

        // Damage/Gain calculations based on total side strengths
        const totalDamage = (loseS / winS) * (loseS * 0.3);
        const totalGain = loseS * 0.6;

        // Distribute proportionally to each winner's size
        for (const winner of winnerSide) {
            const share = winner.strength / totalWinBase;
            const damage = totalDamage * share;
            const gain = totalGain * share;

            winner.strength = Math.max(1, Math.round(winner.strength - damage + gain));
            winner.state = 'normal';
            winner.activeBattle = null;
        }

        // Losers are removed
        for (const loser of loserSide) {
            toRemove.push(loser);
            loser.activeBattle = null;
        }

        // Pause if player was involved
        const playerInvolved = winnerSide.includes(this.playerFleet) || loserSide.includes(this.playerFleet);
        if (playerInvolved) {
            if (!this.isPaused) this.togglePause();
            const playerWon = winnerSide.includes(this.playerFleet);
            console.log(`Battle group resolved. Player ${playerWon ? 'won' : 'lost'}.`);
        }

        console.log(`Battle Resolved: ${sA.toFixed(0)} vs ${sB.toFixed(0)}. ${sA > sB ? 'Side A' : 'Side B'} wins.`);
    }


    private inspectObject(worldPos: Vector2) {
        let closestEntity: Entity | null = null;
        let minDist = 100;

        for (const e of this.entities) {
            const dist = Vector2.distance(e.position, worldPos);
            if (dist < minDist) {
                if (e instanceof CelestialBody) {
                    if (dist <= (e as CelestialBody).radius) {
                        closestEntity = e;
                        minDist = dist;
                    }
                } else if (e instanceof Fleet) {
                    if (dist <= 20) {
                        closestEntity = e;
                        minDist = dist;
                    }
                }
            }
        }

        if (closestEntity) {
            this.inspectedEntity = closestEntity;
            this.showTooltip(closestEntity);
        } else {
            this.closeTooltip();
        }
    }

    private showTooltip(entity: Entity) {
        this.closeTooltip();

        this.infoTooltip = document.createElement('div');
        this.infoTooltip.style.position = 'absolute';
        this.infoTooltip.style.background = 'rgba(0, 0, 0, 0.9)';
        this.infoTooltip.style.color = 'white';
        this.infoTooltip.style.padding = '12px 16px';
        this.infoTooltip.style.borderRadius = '8px';
        this.infoTooltip.style.border = '1px solid rgba(255, 255, 255, 0.3)';
        this.infoTooltip.style.pointerEvents = 'auto';
        this.infoTooltip.style.fontSize = '14px';
        this.infoTooltip.style.fontFamily = 'monospace';
        this.infoTooltip.style.zIndex = '1000';
        this.infoTooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';

        // Prevent clicks on tooltip from affecting game
        this.infoTooltip.addEventListener('click', (e) => e.stopPropagation());
        this.infoTooltip.addEventListener('pointerdown', (e) => e.stopPropagation());

        const screenPos = this.camera.worldToScreen(entity.position);
        this.infoTooltip.style.left = (screenPos.x + 20) + 'px';
        this.infoTooltip.style.top = (screenPos.y - 30) + 'px';

        const header = document.createElement('div');
        header.style.marginBottom = '8px';

        let info = '';
        let showApproach = false;
        let showContact = false;
        let showDock = false;

        if (entity instanceof CelestialBody) {
            const body = entity as CelestialBody;
            info = `<strong>${body.name}</strong><br/>`;
            info += body.isStar ? '⭐ Star<br/>' : '🌍 Planet<br/>';
            info += `Radius: ${body.radius.toFixed(0)}`;
            showApproach = true;
            if (!body.isStar && body.name !== 'Asteroid') showDock = true;
        } else if (entity instanceof Fleet) {
            const fleet = entity as Fleet;
            const isPlayer = fleet === this.playerFleet;
            const factionNames: any = {
                'player': 'Player Fleet',
                'civilian': 'Civilian',
                'pirate': 'Pirate',
                'orc': 'Orc',
                'military': 'Military'
            };
            info = `<strong>${factionNames[fleet.faction] || 'Unknown'}</strong><br/>`;
            info += `Size: ${fleet.strength}<br/>`;
            info += `Speed: ${fleet.velocity.mag().toFixed(1)}<br/>`;
            info += `Pos: (${fleet.position.x.toFixed(0)}, ${fleet.position.y.toFixed(0)})`;

            if (!isPlayer) {
                showApproach = true;
                showContact = true;
            }
        }

        header.innerHTML = info;
        this.infoTooltip.appendChild(header);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.flexWrap = 'wrap';

        const createButton = (text: string, title: string, color: string, callback: () => void) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.title = title;
            btn.style.padding = '6px 12px';
            btn.style.border = 'none';
            btn.style.borderRadius = '4px';
            btn.style.background = color;
            btn.style.color = 'white';
            btn.style.fontSize = '18px';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.style.fontFamily = 'monospace';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                callback();
            });
            btn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            });
            return btn;
        };

        if (showApproach) {
            const approachBtn = createButton('🚀', 'Приближение (Intercept & Follow)', '#0088FF', () => {
                console.log('Approach command issued for', entity);
                this.playerFleet.setFollowTarget(entity, 'approach');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
            });
            buttonContainer.appendChild(approachBtn);
        }

        if (showContact || showDock) {
            const contactBtn = createButton('🎯', 'Контакт/Стыковка (Intercept & Dock)', '#00AA00', () => {
                console.log('Contact command issued for', entity);
                this.playerFleet.setFollowTarget(entity, 'contact');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
            });
            buttonContainer.appendChild(contactBtn);
        }

        if (buttonContainer.children.length > 0) {
            this.infoTooltip.appendChild(buttonContainer);
        }

        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.infoTooltip);
    }

    private closeTooltip() {
        if (this.infoTooltip) {
            this.infoTooltip.remove();
            this.infoTooltip = null;
            this.inspectedEntity = null;
        }
    }

    private initiateContact(fleet: Fleet) {
        this.closeTooltip();
        if (!this.isPaused) this.togglePause();

        console.log(`Initiating contact with fleet at ${fleet.position.x}, ${fleet.position.y}`);

        this.modal.showContactDialog(
            () => {
                console.log('Establishing communication with fleet...');
                alert('Связь установлена! (Функция в разработке)');
                if (this.isPaused) this.togglePause();
            },
            () => {
                console.log('Initiating battle...');
                // Use the new Battle system
                if (!this.playerFleet.activeBattle && !fleet.activeBattle) {
                    const b = new Battle(this.playerFleet, fleet);
                    this.battles.push(b);
                } else if (this.playerFleet.activeBattle && !fleet.activeBattle) {
                    this.playerFleet.activeBattle.addFleet(fleet, this.playerFleet);
                } else if (!this.playerFleet.activeBattle && fleet.activeBattle) {
                    fleet.activeBattle.addFleet(this.playerFleet, fleet);
                }

                if (this.isPaused) this.togglePause();

                this.modal.showBattleScreen(() => {
                    console.log('Battle animation ended');
                });
            },
            () => {
                console.log('Contact cancelled');
                if (this.isPaused) this.togglePause();
            }
        );
    }

    private updateTooltipPosition() {
        if (this.infoTooltip && this.inspectedEntity) {
            const screenPos = this.camera.worldToScreen(this.inspectedEntity.position);
            this.infoTooltip.style.left = (screenPos.x + 20) + 'px';
            this.infoTooltip.style.top = (screenPos.y - 30) + 'px';
        }
    }

    private draw() {
        this.renderer.clear();
        this.drawBackground();

        const ctx = this.renderer.getContext();
        for (const e of this.entities) e.draw(ctx, this.camera);

        const allFleets = [this.playerFleet, ...this.npcFleets];
        for (const fleet of allFleets) {
            if (fleet.followTarget && (fleet === this.playerFleet || fleet.followTarget === this.playerFleet ||
                (fleet.followTarget instanceof Fleet && this.isHostile(fleet, fleet.followTarget)))) {

                const fleetPos = this.camera.worldToScreen(fleet.position);
                const targetPos = this.camera.worldToScreen(fleet.followTarget.position);

                ctx.save();
                // Intercept Line (mostly for player or important chases)
                if (fleet === this.playerFleet || fleet.followTarget === this.playerFleet) {
                    ctx.strokeStyle = fleet.color + '66'; // 40% alpha
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(fleetPos.x, fleetPos.y);
                    ctx.lineTo(targetPos.x, targetPos.y);
                    ctx.stroke();
                }

                // Interception Radius around the CHASER
                const r = 8 * fleet.sizeMultiplier;
                const combatTriggerDist = 4 * r;
                const screenRadius = combatTriggerDist * this.camera.zoom;

                ctx.beginPath();
                ctx.arc(fleetPos.x, fleetPos.y, screenRadius, 0, Math.PI * 2);
                ctx.setLineDash([2, 4]);
                ctx.strokeStyle = fleet.color + '99'; // 60% alpha
                ctx.lineWidth = 1;
                ctx.stroke();

                // If player is chasing, show intercept point
                if (fleet === this.playerFleet && fleet.target) {
                    const interceptPos = this.camera.worldToScreen(fleet.target);
                    ctx.beginPath();
                    ctx.arc(interceptPos.x, interceptPos.y, 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#00FFFF';
                    ctx.fill();

                    ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                    ctx.font = '10px monospace';
                    ctx.fillText('INTERCEPT', interceptPos.x + 8, interceptPos.y - 8);
                }
                ctx.restore();
            }
        }

        // Draw off-screen indicators
        const star = this.entities.find(e => e instanceof CelestialBody && (e as CelestialBody).isStar);
        if (star) {
            this.drawEntityIndicator(star.position, '#FFD700', 8); // Star indicator
        }
        this.drawEntityIndicator(this.playerFleet.position, this.playerFleet.color, 6); // Player indicator (smaller)

        this.updateTooltipPosition();
    }

    private drawEntityIndicator(worldPos: Vector2, color: string, size: number) {
        const screenPos = this.camera.worldToScreen(worldPos);
        const { width, height } = this.renderer.getDimensions();
        const padding = 20;

        const isOffscreen = screenPos.x < 0 || screenPos.x > width || screenPos.y < 0 || screenPos.y > height;

        if (isOffscreen) {
            const ctx = this.renderer.getContext();

            // Center of screen
            const cx = width / 2;
            const cy = height / 2;

            // Direction from center to target
            const dx = screenPos.x - cx;
            const dy = screenPos.y - cy;

            // Find intersection with screen edges
            let scale = 1;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (absDx / (width / 2 - padding) > absDy / (height / 2 - padding)) {
                scale = (width / 2 - padding) / absDx;
            } else {
                scale = (height / 2 - padding) / absDy;
            }

            const ix = cx + dx * scale;
            const iy = cy + dy * scale;

            // Draw indicator
            const angle = Math.atan2(dy, dx);

            ctx.save();
            ctx.translate(ix, iy);
            ctx.rotate(angle);

            // Arrow shape (scaled by size)
            ctx.beginPath();
            ctx.moveTo(size, 0);
            ctx.lineTo(-size, -size * 0.8);
            ctx.lineTo(-size * 0.5, 0);
            ctx.lineTo(-size, size * 0.8);
            ctx.closePath();

            ctx.fillStyle = color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = color;
            ctx.fill();

            ctx.restore();
        }
    }

    private drawBackground() {
        const ctx = this.renderer.getContext();
        const { width, height } = this.renderer.getDimensions();
        ctx.drawImage(this.backgroundCanvas, 0, 0, width, height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;

        const gridSize = 500;
        const topLeft = this.camera.screenToWorld(new Vector2(0, 0));
        const botRight = this.camera.screenToWorld(new Vector2(width, height));

        const startX = Math.floor(topLeft.x / gridSize) * gridSize;
        const endX = Math.ceil(botRight.x / gridSize) * gridSize;
        const startY = Math.floor(topLeft.y / gridSize) * gridSize;
        const endY = Math.ceil(botRight.y / gridSize) * gridSize;

        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            const p1 = this.camera.worldToScreen(new Vector2(x, startY));
            const p2 = this.camera.worldToScreen(new Vector2(x, endY));
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            const p1 = this.camera.worldToScreen(new Vector2(startX, y));
            const p2 = this.camera.worldToScreen(new Vector2(endX, y));
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
    }

    private activateAbility(id: string) {
        const a = (this.playerFleet.abilities as any)[id];
        if (!a || a.cooldown > 0 || a.active) return;

        a.active = true;
        a.timer = a.duration;
        a.cooldown = a.cdMax;

        if (id === 'cloak') this.playerFleet.isCloaked = true;
        if (id === 'bubble') {
            const bubbleRadius = 8 * this.playerFleet.sizeMultiplier * 25;
            const allFleets = [this.playerFleet, ...this.npcFleets];
            for (const other of allFleets) {
                if (other === this.playerFleet) continue;
                if (Vector2.distance(this.playerFleet.position, other.position) < bubbleRadius) {
                    other.stunTimer = 1.0;
                }
            }
        }

        console.log(`Ability activated: ${id}`);
    }
}
