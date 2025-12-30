import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet, type Faction } from '../entities/Fleet';
import { Entity } from '../entities/Entity';
import { BubbleZone } from '../entities/BubbleZone';
import { WarpGate } from '../entities/WarpGate';
import { SaveSystem } from './SaveSystem';
import { UIManager } from './UIManager';
import { ModalManager } from './ModalManager';
import { Attack } from './Attack';
import { AIController } from './AIController';


export class Game {
    private lastTime: number = 0;
    private renderer: Renderer;
    private input: InputManager;
    private camera: Camera;
    private ui: UIManager;
    private modal: ModalManager;
    private aiController: AIController;

    // Entities
    private entities: Entity[] = [];
    private playerFleet!: Fleet;
    private npcFleets: Fleet[] = [];
    private attacks: Attack[] = [];
    private bubbleZones: BubbleZone[] = [];

    // Getters for AIController
    public getEntities(): Entity[] { return this.entities; }
    public getPlayerFleet(): Fleet { return this.playerFleet; }
    public getNpcFleets(): Fleet[] { return this.npcFleets; }
    public getAttacks(): Attack[] { return this.attacks; }
    public getSystemRadius(): number { return this.SYSTEM_RADIUS; }

    private backgroundCanvas: HTMLCanvasElement;

    // Time Control
    private isPaused: boolean = false;
    private timeScale: number = 1;
    private wasMovingLastFrame: boolean = false;
    private infoTooltip: HTMLDivElement | null = null;
    private cameraFollow: boolean = true;
    private isDragging: boolean = false;
    private lastMousePos: Vector2 = new Vector2(0, 0);
    private isGameOver: boolean = false;

    // Fleet interaction
    private contactDistance: number = 100; // Distance for contact dialog
    private inspectedEntity: Entity | null = null; // Entity being inspected for tooltip

    // System management
    private currentSystemId: number = 1; // Current star system (1 = Sol, 2 = Alpha Centauri, etc.)

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);
        this.input = new InputManager(canvas);

        const { width, height } = this.renderer.getDimensions();
        this.camera = new Camera(width, height);

        this.backgroundCanvas = document.createElement('canvas');
        this.generateBackground(width, height);

        this.initWorld();

        // Initialize AI Controller
        this.aiController = new AIController(this);

        // Setup UI
        this.ui = new UIManager('ui-layer', {
            onPlayPause: () => this.togglePause(),
            onSpeedChange: (speed) => this.setTimeScale(speed),
            onCameraToggle: (follow) => this.setCameraFollow(follow),
            onAbility: (id) => this.activateAbility(id),
            onMenu: () => this.showMenu()
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

    private showMenu() {
        if (!this.isPaused) this.togglePause();
        this.modal.showMainMenu({
            onResume: () => {
                if (this.isPaused && !this.isGameOver) this.togglePause();
            },
            onNewGame: () => {
                // Starting a completely fresh game (strength 10)
                // Persistence in localStorage stays until manually overwritten or cleared if explicitly desired
                this.initWorld(10);
            },
            onSaveFleet: () => {
                if (this.isGameOver) return;
                SaveSystem.saveFleetSize(this.playerFleet.strength);
                console.log('Fleet size saved:', this.playerFleet.strength);
            },
            onLoadFleet: () => {
                // Load saved size and start new world with it
                const savedSize = SaveSystem.loadFleetSize();
                this.initWorld(savedSize || 10);
            }
        }, this.isGameOver);
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

    private initWorld(forcedStrength?: number, systemId?: number) {
        // Set current system
        this.currentSystemId = systemId || 1;

        // Clear existing state
        this.entities = [];
        this.npcFleets = [];
        this.attacks = [];
        this.bubbleZones = [];
        this.isGameOver = false;

        // Unpause if paused
        if (this.isPaused) {
            this.togglePause();
        }

        console.log(`Initializing System ${this.currentSystemId}...`);

        if (this.currentSystemId === 1) {
            this.initSolSystem();
        } else if (this.currentSystemId === 2) {
            this.initAlphaCentauriSystem();
        } else {
            // Default to Sol system for unknown systems
            this.currentSystemId = 1;
            this.initSolSystem();
        }

        // Player Fleet Initialization
        // Priority: forcedStrength (from menu buttons) > savedSize (from persistence) > default (10)
        const savedSize = SaveSystem.loadFleetSize();
        const startStrength = forcedStrength !== undefined ? forcedStrength : (savedSize || 10);

        console.log('Initializing player fleet...', `Strength: ${startStrength}`);

        this.playerFleet = new Fleet(500, 500, '#00AAFF', true);
        this.playerFleet.strength = startStrength;
        this.playerFleet.faction = 'player';
        this.entities.push(this.playerFleet);

        this.spawnNPCs(30);

        // Reset camera position
        this.camera.position = this.playerFleet.position.clone();
    }

    private initSolSystem() {
        // Star
        const star = new CelestialBody(0, 0, 150, '#FFD700', 'Sol', true);
        this.entities.push(star);

        // Planets
        const terra = new CelestialBody(800, 0, 40, '#00CED1', 'Terra');
        this.entities.push(terra);

        const luna = new CelestialBody(860, 0, 10, '#AAAAAA', 'Luna');
        luna.orbitParent = terra;
        luna.orbitRadius = 60;
        luna.orbitSpeed = 0.125;
        this.entities.push(luna);

        this.entities.push(new CelestialBody(-1200, 400, 60, '#FF4500', 'Marsish'));

        const jupiter = new CelestialBody(400, -1500, 110, '#DEB887', 'Jupiter');
        this.entities.push(jupiter);

        // Jupiter satellites
        const moons = [
            { name: 'Io', radius: 8, color: '#F0E68C', orbitRadius: 160, orbitSpeed: 0.2 },
            { name: 'Europa', radius: 7, color: '#E0FFFF', orbitRadius: 220, orbitSpeed: 0.15 },
            { name: 'Ganymede', radius: 12, color: '#D2B48C', orbitRadius: 300, orbitSpeed: 0.1 }
        ];

        moons.forEach(m => {
            const moon = new CelestialBody(0, 0, m.radius, m.color, m.name);
            moon.orbitParent = jupiter;
            moon.orbitRadius = m.orbitRadius;
            moon.orbitSpeed = m.orbitSpeed;
            moon.orbitAngle = Math.random() * Math.PI * 2;
            this.entities.push(moon);
        });

        // Saturn
        const saturn = new CelestialBody(-3000, -2000, 95, '#F4A460', 'Saturn');
        saturn.rings = {
            bands: [
                { innerRadius: 110, outerRadius: 130, color: 'rgba(210, 180, 140, 0.4)' },
                { innerRadius: 132, outerRadius: 155, color: 'rgba(245, 222, 179, 0.7)' },
                { innerRadius: 157, outerRadius: 165, color: 'rgba(210, 180, 140, 0.3)' },
                { innerRadius: 167, outerRadius: 185, color: 'rgba(245, 222, 179, 0.5)' }
            ],
            angle: Math.PI / 6
        };
        this.entities.push(saturn);

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

        // Warp Gate to Alpha Centauri
        const warpGate = new WarpGate(3500, 2500, 2, 'Gate to Alpha Centauri');
        this.entities.push(warpGate);
    }

    private initAlphaCentauriSystem() {
        // Star (binary system - Alpha Centauri A)
        const starA = new CelestialBody(0, 0, 140, '#FFA500', 'Alpha Centauri A', true);
        this.entities.push(starA);

        // Companion star (Alpha Centauri B)
        const starB = new CelestialBody(300, 200, 120, '#FF8C00', 'Alpha Centauri B', true);
        this.entities.push(starB);

        // Planets
        const proximaB = new CelestialBody(600, 100, 35, '#8B4513', 'Proxima b');
        this.entities.push(proximaB);

        const centauriPrime = new CelestialBody(-800, -300, 45, '#4169E1', 'Centauri Prime');
        this.entities.push(centauriPrime);

        // Moons for Centauri Prime
        const lunaPrime = new CelestialBody(-820, -280, 12, '#C0C0C0', 'Luna Prime');
        lunaPrime.orbitParent = centauriPrime;
        lunaPrime.orbitRadius = 40;
        lunaPrime.orbitSpeed = 0.15;
        this.entities.push(lunaPrime);

        // Gas giant
        const centauriGas = new CelestialBody(1200, -800, 100, '#9370DB', 'Centauri Gas');
        this.entities.push(centauriGas);

        // Asteroid field
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 1800 + Math.random() * 600;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 4 + Math.random() * 12;
            this.entities.push(new CelestialBody(x, y, size, '#696969', 'Asteroid'));
        }

        // Mining outposts
        this.entities.push(new CelestialBody(-400, 800, 18, '#FF1493', 'Mining Outpost Zeta'));
        this.entities.push(new CelestialBody(1500, 600, 22, '#32CD32', 'Research Station Beta'));

        // Warp Gate back to Sol
        const warpGate = new WarpGate(-3500, -2500, 1, 'Gate to Sol System');
        this.entities.push(warpGate);
    }

    private spawnNPCs(count: number, specificFaction?: Faction) {

        const factions: { type: Faction, color: string, weight: number }[] = [
            { type: 'civilian', color: '#32CD32', weight: 0.45 }, // Green
            { type: 'pirate', color: '#FF4444', weight: 0.2 },   // Red
            { type: 'orc', color: '#9370DB', weight: 0.15 },    // Purple
            { type: 'military', color: '#FFFF00', weight: 0.15 }, // Yellow
            { type: 'raider', color: '#888888', weight: 0.05 }  // Grey
        ];

        for (let i = 0; i < count; i++) {
            // Pick faction
            let factionDef = factions[0];
            if (specificFaction) {
            factionDef = factions.find((f: { type: Faction, color: string, weight: number }) => f.type === specificFaction) || factions[0];
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

            // Give initial target to roam
            const celestialBodies = this.entities.filter(e => e instanceof CelestialBody) as CelestialBody[];
            if (celestialBodies.length > 0) {
                const poi = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                const offset = new Vector2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
                npc.setTarget(poi.position.add(offset));
            } else {
                npc.setTarget(new Vector2((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000));
            }

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
            this.playerFleet.manualSteerTarget = null;

            if (this.isDragging) {
                // Was dragging, now released. Check for click
                const worldTarget = this.camera.screenToWorld(this.input.mousePos);
                const isDoubleClick = this.input.isDoubleClick();

                if (isDoubleClick) {
                    this.playerFleet.setTarget(worldTarget);
                    if (this.isPaused && !this.modal.isModalOpen()) this.togglePause();
                    this.closeTooltip();
                } else {
                    // Inspect even if we were manually guiding the ship
                    this.inspectObject(worldTarget);
                }
            }
            this.isDragging = false;
        }

        if (!this.isPaused) {
            this.update(dt * this.timeScale);
            this.ui.updateAbilities(this.playerFleet);
            this.ui.updateMoney(this.playerFleet.money);
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
            if (f.position.mag() > this.SYSTEM_RADIUS || f.strength <= 0) {
                toRemoveBounds.push(f);
            }
        }
        for (const f of toRemoveBounds) {
            const idx = this.npcFleets.indexOf(f);
            if (idx !== -1) this.npcFleets.splice(idx, 1);
            const eidx = this.entities.indexOf(f);
            if (eidx !== -1) this.entities.splice(eidx, 1);
        }

        if (this.npcFleets.length < 35) {
            // Count current factions
            const counts: Record<string, number> = {
                civilian: 0,
                pirate: 0,
                orc: 0,
                military: 0,
                raider: 0
            };
            for (const f of this.npcFleets) {
                if (counts[f.faction] !== undefined) counts[f.faction]++;
            }

            // Target counts based on weights (Total 30 NPCs: Civ 15, Pirate 6, Orc 4, Military 4)
            if (counts.raider < 4) this.spawnNPCs(1, 'raider');
            else if (counts.civilian < 15) this.spawnNPCs(1, 'civilian');
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

        // Update BubbleZones
        for (let i = this.bubbleZones.length - 1; i >= 0; i--) {
            const bubble = this.bubbleZones[i];
            if (bubble.update(dt)) {
                // Bubble expired, remove it
                this.bubbleZones.splice(i, 1);
            } else {
                // Apply bubble effect to fleets
                for (const fleet of allFleets) {
                    bubble.applyEffect(fleet);
                }
            }
        }

        this.aiController.processAI();
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
            // Check if follow target still exists
            if (!this.entities.includes(this.playerFleet.followTarget)) {
                console.log('Follow target no longer exists, stopping follow');
                this.playerFleet.stopFollowing();
            } else {
                const dist = Vector2.distance(this.playerFleet.position, this.playerFleet.followTarget.position);

                if (this.playerFleet.followMode === 'contact') {
                    const triggerDist = this.playerFleet.followTarget instanceof CelestialBody ?
                        (this.playerFleet.followTarget as CelestialBody).radius + 10 :
                        this.playerFleet.followTarget instanceof WarpGate ?
                            (this.playerFleet.followTarget as WarpGate).radius + 10 :
                            this.contactDistance;

                    if (dist <= triggerDist) {
                        if (this.playerFleet.followTarget instanceof CelestialBody) {
                            const body = this.playerFleet.followTarget as CelestialBody;
                            if (body.name === 'Terra') {
                                this.showTerraUpgradeDialog();
                            } else {
                                alert(`Прибытие к ${body.name}`);
                            }
                            this.playerFleet.stopFollowing();
                        } else if (this.playerFleet.followTarget instanceof WarpGate) {
                            const gate = this.playerFleet.followTarget as WarpGate;
                            this.warpToSystem(gate.targetSystemId);
                            this.playerFleet.stopFollowing();
                        } else if (this.playerFleet.followTarget instanceof Fleet) {
                            this.initiateContact(this.playerFleet.followTarget);
                            // Change to approach mode after contact
                            this.playerFleet.followMode = 'approach';
                        }
                    }
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





    private processCombat(dt: number) {
        const allFleets = [this.playerFleet, ...this.npcFleets];

        // 1. Tick and Check for Resolution
        const toRemove: Fleet[] = [];
        for (let i = this.attacks.length - 1; i >= 0; i--) {
            const a = this.attacks[i];

            a.update(dt);
            if (a.finished) {
                this.resolveAttack(a, toRemove);
                this.attacks.splice(i, 1);
            }
        }

        // 2. Interaction check for new attacks
        for (let i = 0; i < allFleets.length; i++) {
            const attacker = allFleets[i];
            if (toRemove.includes(attacker)) continue;

            for (let j = 0; j < allFleets.length; j++) {
                const target = allFleets[j];
                if (toRemove.includes(target) || attacker === target) continue;

                // Skip if attacker is already attacking someone
                if (attacker.currentTarget) continue;

                const baseTriggerDist = 100; // Fixed interception radius

                const dist = Vector2.distance(attacker.position, target.position);

                // Start NEW attack if hostile and not attacking
                if (this.aiController.isHostile(attacker, target)) {
                    let triggerDist = baseTriggerDist;
                    if (attacker.followTarget === target) triggerDist = baseTriggerDist * 2; // Double for following

                    if (dist < triggerDist) {
                        const attack = new Attack(attacker, target, this);
                        this.attacks.push(attack);
                    }
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
                if (!this.isGameOver) {
                    this.isGameOver = true;
                    this.showMenu();
                }
                return; // Stop further processing after death
            }
        }
    }


    private resolveAttack(attack: Attack, toRemove: Fleet[]) {
        const winners: Fleet[] = [];
        if (attack.attacker.strength > 0) winners.push(attack.attacker);
        if (attack.target.strength > 0) winners.push(attack.target);

        // Reset winner states
        for (const winner of winners) {
            winner.state = 'normal';
            winner.currentTarget = null;
        }

        // Remove dead fleets
        const dead: Fleet[] = [];
        if (attack.attacker.strength <= 0) dead.push(attack.attacker);
        if (attack.target.strength <= 0) dead.push(attack.target);
        for (const d of dead) {
            toRemove.push(d);
        }

        // Money is now awarded per damage in real-time
        if (winners.includes(this.playerFleet)) {
            console.log(`Attack resolved. Player won.`);
        }

        console.log(`Attack Resolved: Winners: ${winners.length}, Losers: ${dead.length}.`);
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
                    // Interaction radius: at least 40 pixels on screen or 20 world units
                    const interactionRadius = Math.max(20, 40 / this.camera.zoom);
                    if (dist <= interactionRadius) {
                        closestEntity = e;
                        minDist = dist;
                    }
                } else if (e instanceof WarpGate) {
                    // Warp gates have larger interaction radius
                    const interactionRadius = Math.max(30, 60 / this.camera.zoom);
                    if (dist <= interactionRadius) {
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
        } else if (entity instanceof WarpGate) {
            const gate = entity as WarpGate;
            info = `<strong>${gate.name}</strong><br/>`;
            info += '🌀 Warp Gate<br/>';
            info += `Destination: System ${gate.targetSystemId}`;
            showApproach = true;
            showContact = true; // Warp gates use contact for warping
        } else if (entity instanceof Fleet) {
            const fleet = entity as Fleet;
            const isPlayer = fleet === this.playerFleet;
            const factionNames: any = {
                'player': 'Player Fleet',
                'civilian': 'Civilian',
                'pirate': 'Pirate',
                'orc': 'Orc',
                'military': 'Military',
                'raider': 'Raider'
            };

            const dist = Vector2.distance(fleet.position, this.playerFleet.position);
            const isUnknownRaider = fleet.faction === 'raider' && dist > this.contactDistance;

            if (isUnknownRaider) {
                info = `<strong>???</strong><br/>`;
                info += `Size: ???<br/>`;
                info += `Speed: ???<br/>`;
                info += `Pos: ???`;
            } else {
                info = `<strong>${factionNames[fleet.faction] || 'Unknown'}</strong><br/>`;
                info += `Size: ${fleet.strength}<br/>`;
                info += `Speed: ${fleet.velocity.mag().toFixed(1)}<br/>`;
                info += `Pos: (${fleet.position.x.toFixed(0)}, ${fleet.position.y.toFixed(0)})`;
            }

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

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        console.log(`Initiating contact with fleet at ${fleet.position.x}, ${fleet.position.y}`);

        this.modal.showContactDialog(
            () => {
                console.log('Establishing communication with fleet...');
                console.log('Связь установлена! (Функция в разработке)');
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            },
            () => {
                console.log('Initiating attack...');
                // Use the new Attack system
                if (!this.playerFleet.currentTarget && !fleet.currentTarget) {
                    const a = new Attack(this.playerFleet, fleet, this);
                    this.attacks.push(a);
                    // Auto-follow the target
                    this.playerFleet.setFollowTarget(fleet, 'contact');
                } else {
                    console.log('Cannot initiate attack - one fleet is already attacking');
                }

                this.modal.showBattleScreen(() => {});
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            },
            () => {
                console.log('Contact cancelled');
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            }
        );
    }

    private showTerraUpgradeDialog() {
        console.log('Showing Terra upgrade dialog');

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        this.modal.showTerraUpgradeDialog(
            this.playerFleet.strength,
            this.playerFleet.money,
            () => {
                // Upgrade logic
                const upgradeAmount = Math.floor(this.playerFleet.money / 100);
                if (upgradeAmount > 0) {
                    this.playerFleet.strength += upgradeAmount;
                    this.playerFleet.money -= upgradeAmount * 100;
                    this.ui.updateMoney(this.playerFleet.money);
                    console.log('Fleet upgraded by', upgradeAmount, 'to strength:', this.playerFleet.strength);
                    // Update dialog with new values
                    this.showTerraUpgradeDialog();
                }
            },
            () => {
                console.log('Terra upgrade cancelled');
                // Close modal and unpause
                this.modal.closeModal();
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

        // Draw BubbleZones
        for (const bubble of this.bubbleZones) {
            bubble.draw(ctx, this.camera);
        }

        const allFleets = [this.playerFleet, ...this.npcFleets];
        for (const fleet of allFleets) {
            if (fleet.followTarget && (fleet === this.playerFleet || fleet.followTarget === this.playerFleet ||
                (fleet.followTarget instanceof Fleet && this.aiController.isHostile(fleet, fleet.followTarget)))) {

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

        // Draw System Boundary
        const center = this.camera.worldToScreen(new Vector2(0, 0));
        const radius = this.SYSTEM_RADIUS * this.camera.zoom;

        // Optimization: Only draw if the boundary could be visible
        const { width: w, height: h } = this.renderer.getDimensions();
        const distFromCenter = Math.sqrt(Math.pow(center.x - w / 2, 2) + Math.pow(center.y - h / 2, 2));
        if (distFromCenter < radius + Math.sqrt(w * w + h * h)) {
            ctx.save();

            // Outer glow / "Danger Zone"
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.1)';
            ctx.lineWidth = 20 * this.camera.zoom;
            ctx.stroke();

            // Main boundary line
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.setLineDash([20 * this.camera.zoom, 20 * this.camera.zoom]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Internal markers/ticks
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            const segments = 64;
            const tickSize = 100 * this.camera.zoom;
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x1 = center.x + Math.cos(angle) * (radius - tickSize);
                const y1 = center.y + Math.sin(angle) * (radius - tickSize);
                const x2 = center.x + Math.cos(angle) * radius;
                const y2 = center.y + Math.sin(angle) * radius;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    private warpToSystem(targetSystemId: number) {
        console.log(`Warping from System ${this.currentSystemId} to System ${targetSystemId}...`);

        // Store player fleet state before transition
        const playerStrength = this.playerFleet.strength;
        const playerMoney = this.playerFleet.money;

        // Initialize the new system
        this.initWorld(playerStrength, targetSystemId);

        // Restore player fleet state
        this.playerFleet.strength = playerStrength;
        this.playerFleet.money = playerMoney;

        // Update UI
        this.ui.updateMoney(this.playerFleet.money);

        console.log(`Successfully warped to System ${targetSystemId}!`);
    }

    private activateAbility(id: string) {
        const a = (this.playerFleet.abilities as any)[id];
        if (!a) return;

        if (id === 'bubble') {
            // Special handling for bubble: create zone if not on cooldown
            if (a.cooldown <= 0) {
                const radius = 8 * this.playerFleet.sizeMultiplier * 25; // Match visual radius from old code
                const bubbleZone = new BubbleZone(this.playerFleet.position.x, this.playerFleet.position.y, radius);
                this.bubbleZones.push(bubbleZone);
                a.cooldown = a.cdMax; // Start cooldown
                console.log('Bubble zone created');
            } else {
                console.log('Bubble on cooldown');
            }
            return;
        }

        // For other abilities: activate if not on cooldown and not active
        if (a.cooldown <= 0 && !a.active) {
            a.active = true;
            a.timer = a.duration; // Start duration timer
            if (id === 'cloak') {
                this.playerFleet.isCloaked = true;
            }
            console.log(`Ability activated: ${id}`);
        } else if (a.active) {
            // Allow manual deactivation
            a.active = false;
            a.timer = 0;
            if (id === 'cloak') {
                this.playerFleet.isCloaked = false;
            }
            console.log(`Ability deactivated: ${id}`);
        }
    }
}
