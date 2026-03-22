import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Entity } from '../entities/Entity';
import { BubbleZone } from '../entities/BubbleZone';
import { WarpGate } from '../entities/WarpGate';
import { SaveSystem } from './SaveSystem';
import { UIManager } from './UIManager';
import { ModalManager } from './ModalManager';
import { Attack } from './Attack';
import { AIController } from './AIController';
import { SystemManager } from './SystemManager';
import { formatNumber } from '../utils/NumberFormatter';
import { WarpMine } from '../entities/WarpMine';
import { Debris } from '../entities/Debris';
import { SupplyCrate } from '../entities/SupplyCrate';


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
    private mines: WarpMine[] = [];
    private debris: Debris[] = [];
    private crates: SupplyCrate[] = [];

    // Getters for AIController
    public getEntities(): Entity[] { return this.entities; }
    public getPlayerFleet(): Fleet { return this.playerFleet; }
    public getNpcFleets(): Fleet[] { return this.npcFleets; }
    public getAttacks(): Attack[] { return this.attacks; }
    public getBubbleZones(): BubbleZone[] { return this.bubbleZones; }
    public getDebris(): Debris[] { return this.debris; }
    public getCrates(): SupplyCrate[] { return this.crates; }
    public getSystemRadius(): number { return this.SYSTEM_RADIUS; }

    public spawnDebris(x: number, y: number, value: number) {
        // Check for nearby debris to combine
        for (const existing of this.debris) {
            const dist = Vector2.distance(new Vector2(x, y), existing.position);
            if (dist < 50) { // Combine if within 50 units
                existing.value += value;
                existing.radius = Math.max(2, Math.min(8, Math.sqrt(existing.value)));
                return;
            }
        }
        // No nearby debris, create new
        const newDebris = new Debris(x, y, value);
        this.debris.push(newDebris);
        this.entities.push(newDebris);
    }

    private spawnSupplyCrate(x: number, y: number, abilityId: string) {
        const crate = new SupplyCrate(x, y, abilityId);
        this.crates.push(crate);
        this.entities.push(crate);
    }

    private backgroundCanvas: HTMLCanvasElement;

    // Time Control
    private isPaused: boolean = false;
    private timeScale: number = 1 * 0.7;
    private infoTooltip: HTMLDivElement | null = null;
    private cameraFollow: boolean = true;
    private isDragging: boolean = false;
    private lastMousePos: Vector2 = new Vector2(0, 0);
    private isGameOver: boolean = false;

    // Fleet interaction
    private contactDistance: number = 100; // Distance for contact dialog
    private inspectedEntity: Entity | null = null; // Entity being inspected for tooltip

    // Debris collection animation
    private isCollectingDebris: boolean = false;
    private collectionAnimationTime: number = 0;

    // System management
    private currentSystemId: number = 1; // Current star system (1 = Sol, 2 = Alpha Centauri, etc.)
    private systemManager: SystemManager;
    private difficultyMultiplier: number = 1;
    private static readonly START_LEVEL_REQUIREMENT = 1000;
    private static readonly START_MONEY = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);
        this.input = new InputManager(canvas);

        const { width, height } = this.renderer.getDimensions();
        this.camera = new Camera(width, height);

        this.backgroundCanvas = document.createElement('canvas');
        this.generateBackground(width, height);

        // Initialize System Manager
        this.systemManager = new SystemManager();

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

        this.refreshDifficultyMultiplier();
        this.updateLevelDisplay();

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
        // Apply scaling factor to make speed 1.0 work like the current 0.7 speed
        // This shifts the entire speed curve to be slower at the base
        this.timeScale = scale * 0.7;
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
                SaveSystem.saveFleetSize(this.playerFleet.maxStrength);
                SaveSystem.saveFleetProgress(this.captureProgress());
                SaveSystem.saveFleetAbilityCharges(this.captureAbilityCharges());
                console.log('Fleet size saved:', this.playerFleet.maxStrength);
            },
            onLoadFleet: () => {
                // Load saved size and start new world with it
                const savedSize = SaveSystem.loadFleetSize();
                const savedProgress = SaveSystem.loadFleetProgress() || this.getDefaultProgress();
                const savedCharges = SaveSystem.loadFleetAbilityCharges() || this.getDefaultAbilityCharges();
                this.initWorld(savedSize || 10, undefined, undefined, savedProgress, savedCharges);
            },
            onLoadAuto: () => {
                // Load autosave size and start new world with it
                const autosaveSize = SaveSystem.loadAutosaveFleetSize();
                const autosaveProgress = SaveSystem.loadAutosaveFleetProgress() || this.getDefaultProgress();
                const autosaveCharges = SaveSystem.loadAutosaveFleetAbilityCharges() || this.getDefaultAbilityCharges();
                this.initWorld(autosaveSize || 10, undefined, undefined, autosaveProgress, autosaveCharges);
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

    private initWorld(
        forcedStrength?: number,
        systemId?: number,
        spawnNearGate?: Vector2,
        progress?: { totalMoneyEarned: number; level: number; levelThreshold: number; nextLevelThreshold: number },
        abilityCharges?: { afterburner: number; cloak: number; bubble: number; mine: number; medkit: number }
    ) {
        // Set current system
        this.currentSystemId = systemId || 1;

        // Clear existing state
        this.entities = [];
        this.npcFleets = [];
        this.attacks = [];
        this.bubbleZones = [];
        this.mines = [];
        this.debris = [];
        this.crates = [];
        this.isGameOver = false;
        this.difficultyMultiplier = 1;

        // Unpause if paused
        if (this.isPaused) {
            this.togglePause();
        }

        console.log(`Initializing System ${this.currentSystemId}...`);

        // Load system entities from SystemManager
        this.entities = this.systemManager.getSystemEntities(this.currentSystemId);

        // Player Fleet Initialization
        // Priority: forcedStrength (from menu buttons) > savedSize (from persistence) > default (10)
        const savedSize = SaveSystem.loadFleetSize();
        const startStrength = forcedStrength !== undefined ? forcedStrength : (savedSize || 10);

        console.log('Initializing player fleet...', `Strength: ${startStrength}`);

        // Determine spawn position: near gate if provided, otherwise default (500, 500)
        let spawnX = 500;
        let spawnY = 500;

        if (spawnNearGate) {
            // Spawn near the arrival gate with some offset
            const offsetDistance = 150; // Distance from gate
            const angle = Math.random() * Math.PI * 2; // Random direction
            spawnX = spawnNearGate.x + Math.cos(angle) * offsetDistance;
            spawnY = spawnNearGate.y + Math.sin(angle) * offsetDistance;
            console.log(`Spawning player near gate at (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
        }

        this.playerFleet = new Fleet(spawnX, spawnY, '#00AAFF', true);
        this.playerFleet.maxStrength = startStrength;
        this.playerFleet.strength = startStrength;
        this.playerFleet.faction = 'player';
        this.playerFleet.money = Game.START_MONEY;

        const appliedProgress = progress ?? this.getDefaultProgress();
        this.applyProgress(appliedProgress);

        // Initial ability charges (0 each for new game/load unless provided)
        if (abilityCharges) {
            this.applyAbilityCharges({
                ...this.getDefaultAbilityCharges(),
                ...abilityCharges
            });
        } else {
            for (const key in this.playerFleet.abilities) {
                (this.playerFleet.abilities as any)[key].charges = 0;
            }
        }

        this.entities.push(this.playerFleet);

        // Spawn initial fleets using system-specific rules
        const initialFleets: Fleet[] = [];
        for (let i = 0; i < 30; i++) {
            const forcedFaction = this.currentSystemId === 2 ? 'raider' : undefined;
            const fleets = this.systemManager.spawnFleetsForSystem(this.currentSystemId, startStrength, this.npcFleets, this.difficultyMultiplier, forcedFaction);
            initialFleets.push(...fleets);
        }
        this.entities.push(...initialFleets);
        this.npcFleets.push(...initialFleets);

        // Reset camera position
        this.camera.position = this.playerFleet.position.clone();
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
            this.ui.updateStrength(this.playerFleet.strength, this.playerFleet.maxStrength);
            this.updateLevelDisplay();
        }
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    private SYSTEM_RADIUS: number = 8000;

    private getDefaultProgress() {
        return {
            totalMoneyEarned: 0,
            level: 1,
            levelThreshold: 0,
            nextLevelThreshold: Game.START_LEVEL_REQUIREMENT
        };
    }

    private captureProgress() {
        return {
            totalMoneyEarned: this.playerFleet.totalMoneyEarned,
            level: this.playerFleet.level,
            levelThreshold: this.playerFleet.levelThreshold,
            nextLevelThreshold: this.playerFleet.nextLevelThreshold
        };
    }

    private applyProgress(progress: { totalMoneyEarned: number; level: number; levelThreshold: number; nextLevelThreshold: number }) {
        this.playerFleet.totalMoneyEarned = progress.totalMoneyEarned;
        this.playerFleet.level = progress.level;
        this.playerFleet.levelThreshold = progress.levelThreshold;
        this.playerFleet.nextLevelThreshold = progress.nextLevelThreshold;
        this.refreshDifficultyMultiplier();
        if (this.ui) this.updateLevelDisplay();
    }

    private captureAbilityCharges() {
        return {
            afterburner: this.playerFleet.abilities.afterburner.charges,
            cloak: this.playerFleet.abilities.cloak.charges,
            bubble: this.playerFleet.abilities.bubble.charges,
            mine: this.playerFleet.abilities.mine.charges,
            medkit: this.playerFleet.abilities.medkit.charges,
            fire: this.playerFleet.abilities.fire.charges,
            shield: this.playerFleet.abilities.shield.charges
        };
    }

    private getDefaultAbilityCharges() {
        return { afterburner: 0, cloak: 0, bubble: 0, mine: 0, medkit: 0, fire: 0, shield: 0 };
    }

    private applyAbilityCharges(charges: { afterburner: number; cloak: number; bubble: number; mine: number; medkit: number; fire: number; shield: number }) {
        this.playerFleet.abilities.afterburner.charges = Math.max(0, charges.afterburner || 0);
        this.playerFleet.abilities.cloak.charges = Math.max(0, charges.cloak || 0);
        this.playerFleet.abilities.bubble.charges = Math.max(0, charges.bubble || 0);
        this.playerFleet.abilities.mine.charges = Math.max(0, charges.mine || 0);
        this.playerFleet.abilities.medkit.charges = Math.max(0, charges.medkit || 0);
        this.playerFleet.abilities.fire.charges = Math.max(0, charges.fire || 0);
        this.playerFleet.abilities.shield.charges = Math.max(0, charges.shield || 0);
        if (this.ui) this.ui.updateAbilities(this.playerFleet);
    }

    private refreshDifficultyMultiplier() {
        if (!this.playerFleet) return;
        const extra = Math.min(5, (this.playerFleet.level - 1) * 0.25);
        this.difficultyMultiplier = 1 + extra;
    }

    private updateLevelDisplay() {
        if (!this.ui || !this.playerFleet) return;
        const progress = Math.max(0, Math.min(
            this.playerFleet.totalMoneyEarned - this.playerFleet.levelThreshold,
            this.playerFleet.nextLevelThreshold - this.playerFleet.levelThreshold
        ));
        const needed = Math.max(1, this.playerFleet.nextLevelThreshold - this.playerFleet.levelThreshold);
        this.ui.updateLevel(this.playerFleet.level, progress, needed);
    }

    private checkLevelUp() {
        if (!this.playerFleet) return;

        while (this.playerFleet.totalMoneyEarned >= this.playerFleet.nextLevelThreshold) {
            this.playerFleet.level++;
            this.playerFleet.levelThreshold = this.playerFleet.nextLevelThreshold;
            this.playerFleet.nextLevelThreshold = Math.round(this.playerFleet.nextLevelThreshold * 1.5);
            console.log(`Level ${this.playerFleet.level} reached (earned ${formatNumber(this.playerFleet.totalMoneyEarned)})`);
        }
        this.refreshDifficultyMultiplier();
        this.updateLevelDisplay();
    }

    private handleRegen(dt: number) {
        const allFleets = [this.playerFleet, ...this.npcFleets];
        for (const fleet of allFleets) {
            if (fleet.strength >= fleet.maxStrength) continue;

            const regenAmount = fleet.maxStrength * 0.01 * dt;
            if (fleet.isPlayer) {
                if (this.playerFleet.money <= 0) continue;
                let applied = regenAmount;
                let cost = applied * 50;
                if (cost > this.playerFleet.money) {
                    applied = this.playerFleet.money / 50;
                    cost = applied * 50;
                }
                if (applied <= 0) continue;
                fleet.strength = Math.min(fleet.maxStrength, fleet.strength + applied);
                this.playerFleet.money -= cost;
                this.ui.updateMoney(this.playerFleet.money);
            } else {
                fleet.strength = Math.min(fleet.maxStrength, fleet.strength + regenAmount);
            }
        }
    }

    private handleCratePickup() {
        const pickupRadius = 75;
        const player = this.playerFleet;
        if (!player) return;

        for (let i = this.crates.length - 1; i >= 0; i--) {
            const crate = this.crates[i];
            const dist = Vector2.distance(player.position, crate.position);
            if (dist > pickupRadius) continue;

            const ability = (player.abilities as any)[crate.abilityId];
            if (!ability) {
                this.crates.splice(i, 1);
                const eidx = this.entities.indexOf(crate);
                if (eidx !== -1) this.entities.splice(eidx, 1);
                continue;
            }

            if (ability.charges < 10) {
                ability.charges++;
                this.ui.updateAbilities(player);
                this.crates.splice(i, 1);
                const eidx = this.entities.indexOf(crate);
                if (eidx !== -1) this.entities.splice(eidx, 1);
            }
        }

        // NPC pickup (no effect, just clears crate)
        for (const npc of this.npcFleets) {
            if (npc.state === 'combat') continue;
            for (let i = this.crates.length - 1; i >= 0; i--) {
                const crate = this.crates[i];
                const dist = Vector2.distance(npc.position, crate.position);
                if (dist > pickupRadius) continue;
                this.crates.splice(i, 1);
                const eidx = this.entities.indexOf(crate);
                if (eidx !== -1) this.entities.splice(eidx, 1);
            }
        }
    }

    private findAlternateTarget(attacker: Fleet, allFleets: Fleet[]): Fleet | null {
        let best: Fleet | null = null;
        let bestDist = Infinity;
        for (const candidate of allFleets) {
            if (candidate === attacker) continue;
            if (candidate === this.playerFleet) continue;
            if (candidate.strength <= 0) continue;
            if (!this.aiController.isHostile(attacker, candidate)) continue;
            const dist = Vector2.distance(attacker.position, candidate.position);
            if (dist < bestDist) {
                bestDist = dist;
                best = candidate;
            }
        }
        return best;
    }

    private redirectAttacksFromPlayer(allFleets: Fleet[]) {
        if (!this.playerFleet.abilities.shield.active) return;
        for (const attacker of allFleets) {
            if (attacker === this.playerFleet) continue;
            if (attacker.currentTarget === this.playerFleet) {
                attacker.currentTarget = null;
                attacker.state = 'normal';
                const alt = this.findAlternateTarget(attacker, allFleets);
                if (alt) {
                    attacker.setFollowTarget(alt, 'approach');
                } else {
                    attacker.stopFollowing();
                }
            } else if (attacker.followTarget === this.playerFleet) {
                const alt = this.findAlternateTarget(attacker, allFleets);
                if (alt) {
                    attacker.setFollowTarget(alt, 'approach');
                } else {
                    attacker.stopFollowing();
                }
            }
        }
    }

    public awardPlayerMoney(amount: number) {
        if (!this.playerFleet || amount <= 0) return;
        this.playerFleet.money += amount;
        this.playerFleet.totalMoneyEarned += amount;
        this.checkLevelUp();
        this.ui.updateMoney(this.playerFleet.money);
    }

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

        // Update spawn timers for timed spawning systems
        this.systemManager.updateSpawnTimers(this.currentSystemId, dt);

        // Check if we should spawn more fleets
        if (this.systemManager.shouldSpawnMoreFleets(this.currentSystemId, this.npcFleets, this.difficultyMultiplier)) {
            const newFleets = this.systemManager.spawnFleetsForSystem(this.currentSystemId, this.playerFleet.strength, this.npcFleets, this.difficultyMultiplier);
            // Add new fleets to entities and npcFleets
            for (const fleet of newFleets) {
                this.entities.push(fleet);
                this.npcFleets.push(fleet);
            }
            console.log(`Spawned ${newFleets.length} new fleets in System ${this.currentSystemId}`);
        }

        // Check for system liberation (Alpha Centauri)
        if (this.currentSystemId === 2) {
            const raiderCount = this.npcFleets.filter(fleet => fleet.faction === 'raider').length;
            if (raiderCount === 0) {
                // Find Centauri Prime and liberate it
                const centauriPrime = this.entities.find(entity =>
                    entity instanceof CelestialBody && (entity as CelestialBody).name === 'Centauri Prime'
                ) as CelestialBody;
                if (centauriPrime && !centauriPrime.isLiberated) {
                    centauriPrime.isLiberated = true;
                    centauriPrime.pulsing = true;
                    console.log('Alpha Centauri system liberated! Centauri Prime is now pulsing.');
                }
            }
        }

        // 2. Regen fleets towards max size
        this.handleRegen(dt);

        // 3. Update Fleet Scaling based on Player Strength
        const playerStrength = this.playerFleet.maxStrength;
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

        // 4. AI & Combat & Abilities
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

        // Debris pickup - player and NPCs

        // Player collection (with animation)
        const playerFleet = this.playerFleet;
        let playerCollectedAny = false;
        if (playerFleet.state !== 'combat') { // Don't pick up during combat or when moving fast
            const pickupRadius = 75; // Radius for debris pickup
            const pickupRate = dt * (playerFleet.strength / 10); // Units per second
            let remainingPickup = pickupRate;

            // Sort debris by distance for closest first
            const nearbyDebris = this.debris
                .map(d => ({ debris: d, dist: Vector2.distance(playerFleet.position, d.position) }))
                .filter(d => d.dist <= pickupRadius)
                .sort((a, b) => a.dist - b.dist);

            for (const { debris } of nearbyDebris) {
                if (remainingPickup <= 0) break;
                const pickupAmount = Math.min(remainingPickup, debris.value);
                debris.value -= pickupAmount;
                remainingPickup -= pickupAmount;
                playerCollectedAny = true;

                // Award money to player
                this.awardPlayerMoney(pickupAmount * 5);

                // Remove empty debris
                if (debris.value <= 0) {
                    const idx = this.debris.indexOf(debris);
                    if (idx !== -1) this.debris.splice(idx, 1);
                    const eidx = this.entities.indexOf(debris);
                    if (eidx !== -1) this.entities.splice(eidx, 1);
                }
            }
        }

        // Update collection animation for player
        if (playerCollectedAny) {
            this.isCollectingDebris = true;
            this.collectionAnimationTime = 0.5; // 0.5 seconds animation
        } else if (this.collectionAnimationTime > 0) {
            this.collectionAnimationTime -= dt;
            if (this.collectionAnimationTime <= 0) {
                this.isCollectingDebris = false;
            }
        } else {
            // Reset animation if in combat
            this.isCollectingDebris = false;
            this.collectionAnimationTime = 0;
        }

        this.handleCratePickup();

        // NPC debris collection - all NPCs collect at any speed
        for (const npc of this.npcFleets) {
            if (npc.state !== 'combat') { // Only condition is not being in combat
                const pickupRadius = 75; // Same radius as player
                const pickupRate = dt * (npc.strength / 10); // Same collection rate as player
                let remainingPickup = pickupRate;

                // Sort debris by distance for closest first
                const nearbyDebris = this.debris
                    .map(d => ({ debris: d, dist: Vector2.distance(npc.position, d.position) }))
                    .filter(d => d.dist <= pickupRadius)
                    .sort((a, b) => a.dist - b.dist);

                for (const { debris } of nearbyDebris) {
                    if (remainingPickup <= 0) break;
                    const pickupAmount = Math.min(remainingPickup, debris.value);
                    debris.value -= pickupAmount;
                    remainingPickup -= pickupAmount;

                    // NPCs don't get money from debris (unlike player)

                    // Remove empty debris
                    if (debris.value <= 0) {
                        const idx = this.debris.indexOf(debris);
                        if (idx !== -1) this.debris.splice(idx, 1);
                        const eidx = this.entities.indexOf(debris);
                        if (eidx !== -1) this.entities.splice(eidx, 1);
                    }
                }
            }
        }

        // 4. Update Entities
        for (const e of this.entities) e.update(dt);

        // Update Mines
        const fleets = [this.playerFleet, ...this.npcFleets];
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const mine = this.mines[i];
            mine.tick(dt, fleets, (b) => this.bubbleZones.push(b));
            if (mine.isExploded) {
                this.mines.splice(i, 1);
            }
        }

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
                            } else if (body.name === 'Centauri Prime' && body.isLiberated && !body.rewardCollected) {
                                this.showLiberationRewardDialog(body);
                            } else if (body.name === 'Asteroid') {
                                // Show mining dialog for asteroids
                                this.initiateMining(body);
                            } else {
                                this.showArrivalDialog(body.name);
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


    }





    private processCombat(dt: number) {
        const allFleets = [this.playerFleet, ...this.npcFleets];

        this.redirectAttacksFromPlayer(allFleets);

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
                    if (target === this.playerFleet && this.playerFleet.abilities.shield.active) {
                        const alt = this.findAlternateTarget(attacker, allFleets);
                        if (alt) attacker.setFollowTarget(alt, 'approach');
                        continue;
                    }
                    let triggerDist = baseTriggerDist;
                    if (attacker.followTarget === target) triggerDist = baseTriggerDist * 2; // Double for following

                    if (dist < triggerDist) {
                        const attack = new Attack(attacker, target, this);
                        this.attacks.push(attack);

                        // Special case: Player attacking civilian or military triggers hostility
                        if (attacker.isPlayer && (target.faction === 'civilian' || target.faction === 'military')) {
                            const detectionRadius = 2000;
                            const player = attacker;

                            // All military in detection radius become hostile to player
                            for (const fleet of allFleets) {
                                if (fleet.faction === 'military' && Vector2.distance(fleet.position, player.position) <= detectionRadius) {
                                    fleet.hostileTo.add(player);
                                }
                            }

                            // All civilians larger than player in detection radius become hostile to player
                            for (const fleet of allFleets) {
                                if (fleet.faction === 'civilian' && fleet.sizeMultiplier > player.sizeMultiplier && Vector2.distance(fleet.position, player.position) <= detectionRadius) {
                                    fleet.hostileTo.add(player);
                                }
                            }
                        }
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

        // Spawn debris for dead fleets
        const dead: Fleet[] = [];
        if (attack.attacker.strength <= 0) dead.push(attack.attacker);
        if (attack.target.strength <= 0) dead.push(attack.target);
        for (const d of dead) {
                const debrisValue = Math.floor(d.strength / 20); // Reduced by half
                if (debrisValue > 0) {
                    this.spawnDebris(d.position.x, d.position.y, debrisValue);
                }
                const dropCount = Math.random() < 0.5 ? 1 : 0;
                if (dropCount > 0) {
                    const abilityIds = ['afterburner', 'bubble', 'cloak', 'mine', 'medkit', 'fire', 'shield'];
                    for (let i = 0; i < dropCount; i++) {
                        const abilityId = abilityIds[Math.floor(Math.random() * abilityIds.length)];
                        const angle = Math.random() * Math.PI * 2;
                        const dist = 15 + Math.random() * 25;
                        const x = d.position.x + Math.cos(angle) * dist;
                        const y = d.position.y + Math.sin(angle) * dist;
                        this.spawnSupplyCrate(x, y, abilityId);
                    }
                }
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
                } else if (e instanceof SupplyCrate) {
                    const interactionRadius = Math.max(15, 30 / this.camera.zoom);
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
        let showMine = false;

        if (entity instanceof CelestialBody) {
            const body = entity as CelestialBody;
            info = `<strong>${body.name}</strong><br/>`;
            info += body.isStar ? '⭐ Star<br/>' : '🌍 Planet<br/>';
            info += `Radius: ${body.radius.toFixed(0)}`;
            if (body.isLiberated) {
                info += '<br/>🎉 <span style="color: #00FF00;">Liberated!</span>';
                if (!body.rewardCollected) {
                    info += '<br/>💰 Reward available';
                }
            }
            showApproach = true;
            if (!body.isStar && body.name !== 'Asteroid') showDock = true;
            if (body.name === 'Asteroid') showMine = true;
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
                'raider': 'Raider',
                'trader': 'Trader',
                'mercenary': 'Mercenary'
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
                const isHostile = this.aiController.isHostile(fleet, this.playerFleet);
                const status = isHostile ? '<span style="color: red;">Hostile</span>' : '<span style="color: green;">Friendly</span>';
                info += `${status}<br/>`;
                info += `Size: ${formatNumber(fleet.strength)} / ${formatNumber(fleet.maxStrength)}<br/>`;
                info += `Speed: ${fleet.velocity.mag().toFixed(1)}<br/>`;
                info += `Pos: (${fleet.position.x.toFixed(0)}, ${fleet.position.y.toFixed(0)})`;
            }

            if (!isPlayer) {
                showApproach = true;
                showContact = true;
            }
        } else if (entity instanceof Debris) {
            const debris = entity as Debris;
            info = `<strong>Space Debris</strong><br/>`;
            info += `Value: ${formatNumber(debris.value)} units<br/>`;
            info += `Pos: (${debris.position.x.toFixed(0)}, ${debris.position.y.toFixed(0)})`;
        } else if (entity instanceof SupplyCrate) {
            const crate = entity as SupplyCrate;
            info = `<strong>Supply Crate</strong><br/>`;
            info += `Pos: (${crate.position.x.toFixed(0)}, ${crate.position.y.toFixed(0)})`;
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
            const approachBtn = createButton('🚀', 'Approach (Intercept & Follow)', '#0088FF', () => {
                console.log('Approach command issued for', entity);
                this.playerFleet.setFollowTarget(entity, 'approach');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
            });
            buttonContainer.appendChild(approachBtn);
        }

        if (showContact || showDock) {
            const contactBtn = createButton('🎯', 'Contact/Dock (Intercept & Dock)', '#00AA00', () => {
                console.log('Contact command issued for', entity);
                this.playerFleet.setFollowTarget(entity, 'contact');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
            });
            buttonContainer.appendChild(contactBtn);
        }

        if (showMine) {
            const mineBtn = createButton('⛏️', 'Mine Asteroid', '#FFA500', () => {
                console.log('Mine command issued for asteroid');
                // Use contact mode for asteroids - approach first, then dialog
                this.playerFleet.setFollowTarget(entity, 'contact');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
            });
            buttonContainer.appendChild(mineBtn);
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
                // Close contact dialog first, then open communication dialog with proper timing
                this.modal.closeModal();
                setTimeout(() => {
                    this.modal.showCommunicationDialog(() => {
                        if (this.isPaused) this.togglePause();
                    });
                }, 50); // Small delay to ensure DOM removal is complete
            },
            () => {
                console.log('Initiating attack...');
                // Use the new Attack system
                if (!this.playerFleet.currentTarget && !fleet.currentTarget) {
                    const a = new Attack(this.playerFleet, fleet, this);
                    this.attacks.push(a);
                    // Auto-follow the target
                    this.playerFleet.setFollowTarget(fleet, 'contact');

                    // Special case: Player attacking civilian or military triggers hostility
                    if (fleet.faction === 'civilian' || fleet.faction === 'military') {
                        const detectionRadius = 2000;
                        const allFleets = [this.playerFleet, ...this.npcFleets];

                        // All military in detection radius become hostile to player
                        for (const f of allFleets) {
                            if (f.faction === 'military' && Vector2.distance(f.position, this.playerFleet.position) <= detectionRadius) {
                                f.hostileTo.add(this.playerFleet);
                            }
                        }

                        // All civilians larger than player in detection radius become hostile to player
                        for (const f of allFleets) {
                            if (f.faction === 'civilian' && f.sizeMultiplier > this.playerFleet.sizeMultiplier && Vector2.distance(f.position, this.playerFleet.position) <= detectionRadius) {
                                f.hostileTo.add(this.playerFleet);
                            }
                        }
                    }
                } else {
                    console.log('Cannot initiate attack - one fleet is already attacking');
                }

                this.modal.showBattleScreen(() => { });
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

    private initiateMining(asteroid: any) {
        this.closeTooltip();

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        console.log(`Initiating mining with asteroid at ${asteroid.position.x}, ${asteroid.position.y}`);

        this.modal.showAsteroidMiningDialog(
            () => {
                // Start mining
                this.modal.closeModal();
                this.startMining(asteroid);
                if (this.isPaused) this.togglePause();
            },
            () => {
                // Cancel
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            }
        );
    }

    private startMining(asteroid: any) {
        // Set mining state
        this.playerFleet.state = 'mining';
        this.playerFleet.isMining = true;
        this.playerFleet.miningTarget = asteroid;
        asteroid.isMiningTarget = true;

        // Create mining "attack" - this will handle the money generation
        const miningAttack = new Attack(this.playerFleet, asteroid, this);
        this.attacks.push(miningAttack);
    }

    private showTerraUpgradeDialog() {
        console.log('Showing Terra upgrade dialog');

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        const levelProgress = Math.max(0, this.playerFleet.totalMoneyEarned - this.playerFleet.levelThreshold);
        const levelNeeded = Math.max(1, this.playerFleet.nextLevelThreshold - this.playerFleet.levelThreshold);
        const levelInfo = `Level ${this.playerFleet.level} (${formatNumber(levelProgress)}/${formatNumber(levelNeeded)} this level)`;

        this.modal.showTerraUpgradeDialog(
            this.playerFleet.strength,
            this.playerFleet.maxStrength,
            this.playerFleet.money,
            levelInfo,
            () => {
                // Upgrade logic
                const upgradeCost = this.playerFleet.maxStrength + 10;
                if (this.playerFleet.money >= upgradeCost) {
                    this.playerFleet.maxStrength += 1;
                    this.playerFleet.strength += 1;
                    this.playerFleet.money -= upgradeCost;
                    this.ui.updateMoney(this.playerFleet.money);
                    this.ui.updateStrength(this.playerFleet.strength, this.playerFleet.maxStrength);
                    console.log('Fleet upgraded by 1 to strength:', this.playerFleet.strength);

                    // Trigger autosave after upgrade
                    SaveSystem.saveAutosaveFleetSize(this.playerFleet.maxStrength);
                    SaveSystem.saveAutosaveFleetProgress(this.captureProgress());
                    SaveSystem.saveAutosaveFleetAbilityCharges(this.captureAbilityCharges());
                    console.log('Autosave created with fleet strength:', this.playerFleet.strength);
                    return true;
                }
                return false;
            },
            () => {
                console.log('Terra upgrade cancelled');
                // Close modal and unpause
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            },
            // Ability Purchase Logic
            (abilityId: string) => {
                const a = (this.playerFleet.abilities as any)[abilityId];
                if (a && this.playerFleet.money >= 200 && a.charges < 10) {
                    this.playerFleet.money -= 200;
                    a.charges++;
                    this.ui.updateMoney(this.playerFleet.money);
                    this.ui.updateAbilities(this.playerFleet);
                    SaveSystem.saveAutosaveFleetAbilityCharges(this.captureAbilityCharges());
                    // Refresh dialog to show new counts
                    this.showTerraUpgradeDialog();
                }
            },
        );
    }

    private showArrivalDialog(name: string) {
        console.log('Showing arrival dialog for', name);

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        this.modal.showArrivalDialog(name, () => {
            console.log('Arrival dialog cancelled');
            this.modal.closeModal();
            if (this.isPaused) this.togglePause();
        });
    }

    private showLiberationRewardDialog(body: CelestialBody) {
        console.log('Showing liberation reward dialog for', body.name);

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        this.modal.showLiberationRewardDialog(
            () => {
                // Collect reward
                this.playerFleet.maxStrength += 100;
                this.playerFleet.strength += 100;
                this.awardPlayerMoney(5000);
                body.rewardCollected = true;
                body.pulsing = false; // Stop pulsing after collection
                this.ui.updateStrength(this.playerFleet.strength, this.playerFleet.maxStrength);
                console.log('Liberation reward collected: +100 strength, +$5000');
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            },
            () => {
                console.log('Liberation reward declined');
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

        // Draw debris collection animation
        if (this.isCollectingDebris) {
            const playerPos = this.camera.worldToScreen(this.playerFleet.position);
            const pickupRadius = 75 * this.camera.zoom; // Updated radius
            const alpha = this.collectionAnimationTime / 0.5; // Fade out over 0.5 seconds
            const rotationAngle = (Date.now() * 0.005) % (Math.PI * 2); // Rotating sector

            ctx.save();
            ctx.globalAlpha = alpha * 0.8;

            // Rotating green sector
            ctx.beginPath();
            ctx.moveTo(playerPos.x, playerPos.y);
            ctx.arc(playerPos.x, playerPos.y, pickupRadius, rotationAngle, rotationAngle + Math.PI / 3); // 60-degree sector
            ctx.closePath();
            ctx.fillStyle = '#00FF00'; // Green
            ctx.fill();

            // Outer ring
            ctx.beginPath();
            ctx.arc(playerPos.x, playerPos.y, pickupRadius, 0, Math.PI * 2);
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();
        }

        // Draw BubbleZones
        for (const bubble of this.bubbleZones) {
            bubble.draw(ctx, this.camera);
        }

        // Draw Mines
        for (const mine of this.mines) {
            mine.draw(ctx, this.camera);
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
        const playerMaxStrength = this.playerFleet.maxStrength;
        const playerMoney = this.playerFleet.money;
        const playerProgress = this.captureProgress();
        const playerCharges = this.captureAbilityCharges();

        // Find the arrival gate position in the target system
        // (gates that lead back to the current system)
        const targetSystemEntities = this.systemManager.getSystemEntities(targetSystemId);
        const arrivalGate = targetSystemEntities.find(entity =>
            entity instanceof WarpGate && (entity as WarpGate).targetSystemId === this.currentSystemId
        ) as WarpGate;

        let spawnNearGate: Vector2 | undefined;
        if (arrivalGate) {
            spawnNearGate = arrivalGate.position;
            console.log(`Will spawn near arrival gate at (${spawnNearGate.x.toFixed(0)}, ${spawnNearGate.y.toFixed(0)})`);
        }

        // Initialize the new system
        this.initWorld(playerMaxStrength, targetSystemId, spawnNearGate, playerProgress, playerCharges);

        // Restore player fleet state
        this.playerFleet.maxStrength = playerMaxStrength;
        this.playerFleet.strength = playerStrength;
        this.playerFleet.money = playerMoney;

        // Update UI
        this.ui.updateMoney(this.playerFleet.money);

        console.log(`Successfully warped to System ${targetSystemId}!`);
    }

    private activateAbility(id: string) {
        const a = (this.playerFleet.abilities as any)[id];
        if (!a) return;

        // Player uses charges
        if (a.charges <= 0) {
            console.log(`No charges left for ${id}`);
            return;
        }

        // Check global cooldown (1 second between any ability use)
        if (a.cooldown > 0) {
            console.log(`${id} is still on cooldown`);
            return;
        }

        if (id === 'medkit' || id === 'fire' || id === 'shield') {
            a.active = true;
            a.timer = a.duration;
            a.cooldown = a.cdMax;
            a.charges--;
            if (id === 'medkit') {
                console.log('Medkit activated');
            } else if (id === 'fire') {
                console.log('Fire boost activated');
            } else {
                console.log('Shield activated');
            }
            return;
        }

        if (id === 'mine') {
            const mine = new WarpMine(this.playerFleet.position.x, this.playerFleet.position.y, this.playerFleet);
            this.mines.push(mine);
            a.charges--;
            a.cooldown = 1.0; // Small delay before next mine
            console.log('Warp Mine dropped');
            return;
        }

        if (id === 'bubble' || id === 'afterburner') {
            // Special handling for bubble and afterburner: activate once if not on cooldown
            a.active = true;
            a.timer = a.duration; // Start duration timer
            a.cooldown = a.cdMax; // Player uses cdMax as the reuse delay
            a.charges--;

            if (id === 'bubble') {
                const radius = 200; // Fixed radius for all bubbles
                const bubbleZone = new BubbleZone(this.playerFleet.position.x, this.playerFleet.position.y, radius);
                this.bubbleZones.push(bubbleZone);
                console.log('Bubble zone created');
            } else {
                console.log('Afterburner activated');
            }
            return;
        }

        // For other abilities (cloak): activate if not active
        if (!a.active) {
            a.active = true;
            a.timer = a.duration; // Start duration timer
            a.charges--;
            a.cooldown = a.cdMax;
            if (id === 'cloak') {
                this.playerFleet.isCloaked = true;
            }
            console.log(`Ability activated: ${id}`);
        } else {
            // Manual deactivation allowed
            a.active = false;
            a.timer = 0;
            if (id === 'cloak') {
                this.playerFleet.isCloaked = false;
            }
            console.log(`Ability deactivated: ${id}`);
        }
    }
}
