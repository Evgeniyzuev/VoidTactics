import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet, type Faction, type FleetSkillId } from '../entities/Fleet';
import { Entity } from '../entities/Entity';
import { BubbleZone } from '../entities/BubbleZone';
import { WarpGate } from '../entities/WarpGate';
import { SaveSystem, type EventFleetSnapshot, type WorldEventRuntimeSnapshot, type SaveSlot } from './SaveSystem';
import { UIManager } from './UIManager';
import { ModalManager } from './ModalManager';
import { Attack } from './Attack';
import { AIController } from './AIController';
import { SystemManager } from './SystemManager';
import { formatNumber } from '../utils/NumberFormatter';
import { WarpMine } from '../entities/WarpMine';
import { Debris } from '../entities/Debris';
import { AbilityCrate } from '../entities/AbilityCrate';
import { ResourceCrate } from '../entities/ResourceCrate';
import { MilitaryStation } from '../entities/MilitaryStation';
import { Ship } from '../tactical/Ship';
import { RepairService, type StationServiceMode } from '../tactical/RepairService';
import { WorldEvent } from '../entities/WorldEvent';
import { FleetGenerator, getShopMultiplier, getShopRequirements, SHOP_SHIPS } from '../tactical/FleetGenerator';
import { CombatEffects } from '../renderer/CombatEffects';
import { COMBAT_BALANCE, TACTICAL_BALANCE, type DamageType } from '../tactical/ShipDefinitions';
import { bindButtonAction } from '../utils/TouchButton';
import { assessRelativeThreat } from '../tactical/Ecosystem';
import { SensorService, type SensorContact } from '../tactical/SensorService';
import { ABILITY_DEFINITIONS, ABILITY_EQUIPMENT_MARKET, AbilityService, type FleetAbilityId } from '../tactical/AbilityService';
import { rollFleetLoot } from '../tactical/LootBalance';
import { SIGNAL_DEFINITIONS, SIGNAL_EVENT_BALANCE, SignalDirector, toWorldEventConstructorArgs, type SignalDirectorSnapshot, type SignalEventKind, type SignalSpawnDescriptor } from './SignalDirector';
import { ARTIFACT_DEFINITIONS, ExpeditionManager, type ProgressionState } from './Expedition';


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
    private crates: (AbilityCrate | ResourceCrate)[] = [];
    private worldEvents: WorldEvent[] = [];
    private signalEntities = new Map<string, WorldEvent>();
    private signalDirector!: SignalDirector;
    private expedition!: ExpeditionManager;
    private sensors = new SensorService();
    private sensorAccumulator = 0;
    private aiAccumulator = 0;
    private gameClock = 0;
    private combatEffects = new CombatEffects();

    // Getters for AIController
    public getEntities(): Entity[] { return this.entities; }
    public getPlayerFleet(): Fleet { return this.playerFleet; }
    public getNpcFleets(): Fleet[] { return this.npcFleets; }
    public getAttacks(): Attack[] { return this.attacks; }
    public getBubbleZones(): BubbleZone[] { return this.bubbleZones; }
    public getDebris(): Debris[] { return this.debris; }
    public getCrates(): (AbilityCrate | ResourceCrate)[] { return this.crates; }
    public getSystemRadius(): number { return this.SYSTEM_RADIUS; }

    public addCombatShot(attacker: Fleet, target: Fleet, type: DamageType, hit: boolean) {
        const isVisible = (fleet: Fleet) => {
            if (fleet === this.playerFleet) return true;
            const contact = this.sensors.getContact(this.playerFleet, fleet);
            return !!contact && !contact.stale;
        };
        if (!isVisible(attacker) || !isVisible(target)) return;
        this.combatEffects.addShot(attacker.position, target.position, type, hit);
    }

    public spawnDebris(x: number, y: number, value: number, kind: 'combat' | 'salvage' = 'combat') {
        // Check for nearby debris to combine
        for (const existing of this.debris) {
            const dist = Vector2.distance(new Vector2(x, y), existing.position);
            if (dist < 50 && existing.kind === kind) { // Combine if within 50 units
                existing.value += value;
                existing.radius = Debris.markerRadius(existing.value);
                return;
            }
        }
        // No nearby debris, create new
        const newDebris = new Debris(x, y, value, kind);
        this.debris.push(newDebris);
        this.entities.push(newDebris);
    }

    public spawnSalvage(x: number, y: number, value: number) {
        this.spawnDebris(x, y, value, 'salvage');
    }

    private spawnAbilityCrate(x: number, y: number, abilityId: string) {
        const crate = new AbilityCrate(x, y, abilityId);
        this.crates.push(crate);
        this.entities.push(crate);
    }

    private spawnResourceCrate(x: number, y: number, fuel: number, supplies: number) {
        if (fuel <= 0 && supplies <= 0) return;
        const crate = new ResourceCrate(x, y, fuel, supplies);
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

        this.expedition = ExpeditionManager.create((Date.now() ^ 0x564f4944) >>> 0);

        this.initWorld();

        // Initialize AI Controller
        this.aiController = new AIController(this);

        // Setup UI
        this.ui = new UIManager('ui-layer', {
            onPlayPause: () => this.togglePause(),
            onSpeedChange: (speed) => this.setTimeScale(speed),
            onCameraToggle: (follow) => this.setCameraFollow(follow),
            onAbility: (id) => this.activateAbility(id),
            onMenu: () => this.showMenu(),
            onOrder: (order) => this.playerFleet.issueOrder(order, this.playerFleet.selectedShipId || undefined),
            onDoctrine: (priority) => { this.playerFleet.doctrine.targetPriority = priority; },
            onFaq: () => this.showFAQ(),
            onSignalAction: (action, event) => this.handleSignalTrackerAction(action, event),
            onExpeditionMap: () => this.showExpeditionMap()
        });

        this.refreshDifficultyMultiplier();
        this.updateLevelDisplay();
        this.updateExpeditionHud();

        // Setup Modal Manager
        this.modal = new ModalManager();

        // Start loop
        requestAnimationFrame((t) => this.loop(t));

        // Auto-Save Interval (5 seconds)
        setInterval(() => {
            this.saveGame('autosave');
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
                this.saveGame();
                SaveSystem.saveFleetSize(this.playerFleet.commandCapacity);
                SaveSystem.saveFleetProgress(this.captureProgress());
                SaveSystem.saveFleetAbilityCharges(this.captureAbilityCharges());
                console.log('Fleet command capacity saved:', this.playerFleet.commandCapacity);
            },
            onLoadFleet: () => {
                const tacticalSave = SaveSystem.load();
                const savedSize = SaveSystem.loadFleetSize();
                const savedProgress = tacticalSave?.progress || SaveSystem.loadFleetProgress() || this.getDefaultProgress();
                const savedCharges = tacticalSave?.abilityCharges || SaveSystem.loadFleetAbilityCharges() || this.getDefaultAbilityCharges();
                const savedCommandCapacity = tacticalSave?.commandCapacity || savedSize || 4;
                const systemId = tacticalSave ? Number(tacticalSave.systemId || tacticalSave.currentSystemId) || 1 : undefined;
                this.initWorld(savedCommandCapacity, systemId, undefined, savedProgress, savedCharges, tacticalSave && 'expedition' in tacticalSave ? tacticalSave.expedition : undefined, false);
                if (tacticalSave) {
                    SaveSystem.restoreFleet(this.playerFleet, tacticalSave);
                    this.applyExpeditionEffects();
                    this.applyProgress(this.captureProgress());
                    this.playerFleet.clampAbilityChargesToCapacity();
                    this.ui.updateAbilities(this.playerFleet);
                    this.restoreSignalDirector(tacticalSave.signalDirector, tacticalSave.worldEvents);
                }
            },
            onLoadAuto: () => {
                const tacticalSave = SaveSystem.loadAutosave();
                const autosaveSize = SaveSystem.loadAutosaveFleetSize();
                const autosaveProgress = tacticalSave?.progress || SaveSystem.loadAutosaveFleetProgress() || this.getDefaultProgress();
                const autosaveCharges = tacticalSave?.abilityCharges || SaveSystem.loadAutosaveFleetAbilityCharges() || this.getDefaultAbilityCharges();
                const savedCommandCapacity = tacticalSave?.commandCapacity || autosaveSize || 4;
                const systemId = tacticalSave ? Number(tacticalSave.systemId || tacticalSave.currentSystemId) || 1 : undefined;
                this.initWorld(savedCommandCapacity, systemId, undefined, autosaveProgress, autosaveCharges, tacticalSave && 'expedition' in tacticalSave ? tacticalSave.expedition : undefined, false);
                if (tacticalSave) {
                    SaveSystem.restoreFleet(this.playerFleet, tacticalSave);
                    this.applyExpeditionEffects();
                    this.applyProgress(this.captureProgress());
                    this.playerFleet.clampAbilityChargesToCapacity();
                    this.ui.updateAbilities(this.playerFleet);
                    this.restoreSignalDirector(tacticalSave.signalDirector, tacticalSave.worldEvents);
                }
            }
        }, this.isGameOver);
    }

    private generateBackground(width: number, height: number) {
        this.backgroundCanvas.width = width;
        this.backgroundCanvas.height = height;
        const ctx = this.backgroundCanvas.getContext('2d');
        if (!ctx) return;

        // Keep the atmosphere deterministic for a system, so a resize does not
        // make the nebula jump. The game still gets a distinct visual identity
        // per sector without loading a large bitmap texture.
        const palette = this.getSectorVisualPalette();
        let state = (0x9e3779b9 ^ Math.imul(this.currentSystemId, 0x45d9f3b)) >>> 0;
        const random = () => {
            state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6D2B79F5) >>> 0;
            return state / 0x100000000;
        };
        const rgba = (rgb: readonly [number, number, number], alpha: number) =>
            `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

        const base = ctx.createLinearGradient(0, 0, width, height);
        base.addColorStop(0, palette.baseTop);
        base.addColorStop(0.52, palette.baseMid);
        base.addColorStop(1, palette.baseBottom);
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);

        // Broad nebulas establish depth. Screen-space rendering is intentional:
        // the background should feel like a distant skybox while ships move.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 9; i++) {
            const x = (0.04 + random() * 0.92) * width;
            const y = (0.02 + random() * 0.96) * height;
            const radius = Math.max(width, height) * (0.2 + random() * 0.34);
            const color = i % 3 === 0 ? palette.nebulaWarm : i % 2 === 0 ? palette.nebulaSecondary : palette.nebulaPrimary;
            const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
            cloud.addColorStop(0, rgba(color, 0.18 + random() * 0.1));
            cloud.addColorStop(0.35, rgba(color, 0.08));
            cloud.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = cloud;
            ctx.fillRect(0, 0, width, height);
        }

        // Long blurred wisps give the background the photographed, cinematic
        // quality of the reference without a particle simulation.
        ctx.filter = 'blur(18px)';
        ctx.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
            const startX = -width * 0.15 + random() * width * 0.35;
            const startY = random() * height;
            const endX = width * (0.7 + random() * 0.45);
            const endY = startY + (random() - 0.5) * height * 0.9;
            const bendX = width * (0.25 + random() * 0.45);
            const bendY = startY + (random() - 0.5) * height;
            ctx.strokeStyle = rgba(i % 2 ? palette.nebulaPrimary : palette.nebulaSecondary, 0.12);
            ctx.lineWidth = height * (0.035 + random() * 0.045);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(bendX, bendY, endX, endY);
            ctx.stroke();
        }
        ctx.filter = 'none';
        ctx.lineWidth = 1;
        ctx.filter = 'blur(3px)';
        for (let i = 0; i < 18; i++) {
            const startX = -width * 0.1 + random() * width * 0.15;
            const startY = random() * height;
            const endX = width * (0.82 + random() * 0.3);
            const endY = startY + (random() - 0.5) * height * 0.65;
            const bendX = width * (0.2 + random() * 0.55);
            const bendY = startY + (random() - 0.5) * height * 0.7;
            ctx.strokeStyle = rgba(i % 3 === 0 ? palette.nebulaWarm : palette.nebulaPrimary, 0.055 + random() * 0.035);
            ctx.lineWidth = 2 + random() * 7;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(bendX, bendY, endX, endY);
            ctx.stroke();
        }
        ctx.filter = 'none';
        ctx.restore();

        // Dark dust lanes break up the smooth gradients and make bright ships
        // read clearly, especially on mobile screens.
        ctx.save();
        for (let i = 0; i < 5; i++) {
            const x = random() * width;
            const y = random() * height;
            const radius = Math.max(width, height) * (0.12 + random() * 0.18);
            const dust = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
            dust.addColorStop(0, 'rgba(0, 5, 12, 0.28)');
            dust.addColorStop(0.7, 'rgba(0, 5, 12, 0.1)');
            dust.addColorStop(1, 'rgba(0, 5, 12, 0)');
            ctx.fillStyle = dust;
            ctx.fillRect(0, 0, width, height);
        }
        ctx.restore();

        // Lower the nebula contrast while keeping the star field crisp. The
        // stars are drawn after this veil so they remain visible as points.
        ctx.fillStyle = 'rgba(0, 5, 12, 0.16)';
        ctx.fillRect(0, 0, width, height);

        // Two star fields: small quiet stars and a few soft, readable beacons.
        const starCount = Math.min(360, Math.max(150, Math.floor((width * height) / 4500)));
        for (let i = 0; i < starCount; i++) {
            const x = random() * width;
            const y = random() * height;
            const size = 0.45 + random() * 1.2;
            const alpha = 0.22 + random() * 0.58;
            ctx.fillStyle = i % 9 === 0 ? rgba(palette.starTint, alpha) : `rgba(205, 232, 245, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < 13; i++) {
            const x = random() * width;
            const y = random() * height;
            const radius = 1.2 + random() * 2.4;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 8);
            glow.addColorStop(0, 'rgba(255,255,255,.95)');
            glow.addColorStop(0.15, rgba(palette.starTint, 0.65));
            glow.addColorStop(1, rgba(palette.starTint, 0));
            ctx.fillStyle = glow;
            ctx.fillRect(x - radius * 8, y - radius * 8, radius * 16, radius * 16);
        }
    }

    private getSectorVisualPalette() {
        const palettes = {
            1: { baseTop: '#06131d', baseMid: '#071b29', baseBottom: '#02080f', nebulaPrimary: [52, 151, 190] as [number, number, number], nebulaSecondary: [33, 92, 142] as [number, number, number], nebulaWarm: [46, 117, 130] as [number, number, number], starTint: [173, 229, 255] as [number, number, number] },
            2: { baseTop: '#081620', baseMid: '#0a2630', baseBottom: '#030a11', nebulaPrimary: [42, 174, 193] as [number, number, number], nebulaSecondary: [34, 105, 158] as [number, number, number], nebulaWarm: [190, 136, 76] as [number, number, number], starTint: [196, 241, 255] as [number, number, number] },
            3: { baseTop: '#07151b', baseMid: '#082934', baseBottom: '#02090f', nebulaPrimary: [30, 159, 170] as [number, number, number], nebulaSecondary: [28, 91, 126] as [number, number, number], nebulaWarm: [60, 139, 124] as [number, number, number], starTint: [157, 244, 239] as [number, number, number] },
            4: { baseTop: '#071421', baseMid: '#102a43', baseBottom: '#030913', nebulaPrimary: [49, 121, 208] as [number, number, number], nebulaSecondary: [91, 103, 196] as [number, number, number], nebulaWarm: [75, 177, 205] as [number, number, number], starTint: [183, 222, 255] as [number, number, number] },
            5: { baseTop: '#0c1024', baseMid: '#1c1640', baseBottom: '#050714', nebulaPrimary: [126, 83, 220] as [number, number, number], nebulaSecondary: [45, 123, 205] as [number, number, number], nebulaWarm: [194, 82, 183] as [number, number, number], starTint: [225, 201, 255] as [number, number, number] },
            6: { baseTop: '#1a0d15', baseMid: '#32121c', baseBottom: '#08070c', nebulaPrimary: [170, 47, 75] as [number, number, number], nebulaSecondary: [78, 54, 145] as [number, number, number], nebulaWarm: [210, 108, 45] as [number, number, number], starTint: [255, 207, 180] as [number, number, number] },
            7: { baseTop: '#091124', baseMid: '#111d4a', baseBottom: '#030711', nebulaPrimary: [72, 92, 210] as [number, number, number], nebulaSecondary: [53, 159, 208] as [number, number, number], nebulaWarm: [121, 73, 198] as [number, number, number], starTint: [196, 211, 255] as [number, number, number] },
            8: { baseTop: '#090d17', baseMid: '#18223a', baseBottom: '#02050b', nebulaPrimary: [73, 103, 151] as [number, number, number], nebulaSecondary: [45, 65, 111] as [number, number, number], nebulaWarm: [137, 160, 183] as [number, number, number], starTint: [218, 236, 255] as [number, number, number] }
        } as const;
        return palettes[this.currentSystemId as keyof typeof palettes] || palettes[1];
    }

    private initWorld(
        forcedStrength?: number,
        systemId?: number,
        spawnNearGate?: Vector2,
        progress?: { totalMoneyEarned: number; level: number; levelThreshold: number; nextLevelThreshold: number },
        abilityCharges?: { afterburner: number; cloak: number; bubble: number; mine: number; medkit: number; fire: number; shield: number; net?: number },
        expeditionSnapshot?: ProgressionState,
        spawnProtection = true
    ) {
        // Set current system
        this.currentSystemId = systemId || 1;
        this.expedition = new ExpeditionManager(expeditionSnapshot, expeditionSnapshot?.seed ?? ((Date.now() ^ this.currentSystemId ^ 0x564f4944) >>> 0));
        this.expedition.setCurrentBySystemId(this.currentSystemId);
        const dimensions = this.renderer.getDimensions();
        this.generateBackground(dimensions.width, dimensions.height);

        // Clear existing state
        this.entities = [];
        this.npcFleets = [];
        this.attacks = [];
        this.bubbleZones = [];
        this.mines = [];
        this.debris = [];
        this.crates = [];
        this.worldEvents = [];
        this.signalEntities.clear();
        this.sensors = new SensorService();
        this.sensorAccumulator = 0;
        this.aiAccumulator = 0;
        this.gameClock = 0;
        this.combatEffects.clear();
        this.isGameOver = false;
        this.difficultyMultiplier = 1;

        // Unpause if paused
        if (this.isPaused) {
            this.togglePause();
        }

        console.log(`Initializing System ${this.currentSystemId}...`);

        // Load system entities from SystemManager
        this.entities = this.systemManager.getSystemEntities(this.currentSystemId);
        const anchoredFleets = this.entities.filter(entity => entity instanceof MilitaryStation) as MilitaryStation[];
        for (const station of anchoredFleets) {
            station.state = 'normal';
            station.currentTarget = null;
            station.activeBattle = null;
            station.lastTarget = null;
            station.beamTimer = 0;
            station.cooldown = 0;
        }
        this.npcFleets.push(...anchoredFleets);

        // Player Fleet Initialization
        // Priority: forcedStrength (from menu buttons) > savedSize (from persistence) > default (10)
        const savedSize = SaveSystem.loadFleetSize();
        const startStrength = forcedStrength !== undefined ? forcedStrength : (savedSize || 10);

        console.log('Initializing player fleet...', `Strength: ${startStrength}`);

        // New runs and recovery in Sol begin above Terra instead of inside the
        // normal NPC spawn field. Gate arrivals retain their route position.
        let spawnX = 500;
        let spawnY = 500;

        if (spawnNearGate) {
            // Spawn near the arrival gate with some offset
            const offsetDistance = 150; // Distance from gate
            const angle = Math.random() * Math.PI * 2; // Random direction
            spawnX = spawnNearGate.x + Math.cos(angle) * offsetDistance;
            spawnY = spawnNearGate.y + Math.sin(angle) * offsetDistance;
            console.log(`Spawning player near gate at (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
        } else if (spawnProtection && this.currentSystemId === 1) {
            const terra = this.entities.find(entity => entity instanceof CelestialBody && entity.name === 'Terra') as CelestialBody | undefined;
            if (terra) {
                spawnX = terra.position.x;
                spawnY = terra.position.y - 300;
                console.log(`Spawning player above Terra at (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
            }
        }

        this.playerFleet = new Fleet(spawnX, spawnY, '#00AAFF', true);
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

        if (spawnProtection) this.activateRespawnCloak();

        this.entities.push(this.playerFleet);
        this.initializeWorldEvents();
        this.onSectorEntered();

        // Spawn initial fleets using system-specific rules
        const initialFleets: Fleet[] = [];
        for (let i = 0; i < 30; i++) {
            const forcedFaction = this.currentSystemId === 2 ? 'raider' : undefined;
            const fleets = this.systemManager.spawnFleetsForSystem(this.currentSystemId, this.playerFleet.threatRating, this.npcFleets, this.difficultyMultiplier, forcedFaction, this.playerFleet.level, this.signalDirector.systemDanger);
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
            const scanPulse = this.sensors.getScanPulseState(this.playerFleet);
            this.ui.updateScanPulse(Math.max(0, (scanPulse?.rangeUntil || 0) - this.gameClock));
            this.ui.updateMoney(this.playerFleet.money);
            this.ui.updateStrength(this.playerFleet.threatRating);
            this.ui.updateFleet(this.playerFleet);
            this.ui.updateSignals(
                this.worldEvents,
                this.playerFleet,
                event => this.sensors.getContact(this.playerFleet, event)
            );
            this.updateLevelDisplay();
            this.updateExpeditionHud();
        }
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    // A broad system gives the camera room to move between tactical and
    // strategic views. Local encounters still happen in the inner region.
    private SYSTEM_RADIUS: number = 18000;
    private ASTEROID_BELT_WIDTH: number = 1600;

    public getAsteroidBeltInnerRadius() {
        return this.SYSTEM_RADIUS - this.ASTEROID_BELT_WIDTH;
    }

    private updateAsteroidBeltState() {
        const fleets = [this.playerFleet, ...this.npcFleets];
        for (const fleet of fleets) {
            fleet.inAsteroidBelt = fleet.position.mag() >= this.getAsteroidBeltInnerRadius();
        }
    }

    private keepFleetInsideSystem(fleet: Fleet) {
        const distance = fleet.position.mag();
        if (distance <= this.SYSTEM_RADIUS) return;

        const outward = fleet.position.normalize();
        const inwardTarget = outward.scale(Math.max(0, this.getAsteroidBeltInnerRadius() - 150));
        fleet.position = outward.scale(this.SYSTEM_RADIUS - 5);
        fleet.stopFollowing();
        if (fleet.isPlayer) fleet.manualSteerTarget = null;
        fleet.setTarget(inwardTarget);
        fleet.velocity = outward.scale(-Math.max(50, Math.min(fleet.velocity.mag(), fleet.maxSpeed * 0.5)));
    }

    private getDefaultProgress() {
        return {
            totalMoneyEarned: 0,
            level: 1,
            levelThreshold: 0,
            nextLevelThreshold: Game.START_LEVEL_REQUIREMENT
        };
    }

    private getLevelThresholds(level: number) {
        const safeLevel = Math.max(1, Math.floor(level));
        let levelThreshold = 0;
        let levelCost = Game.START_LEVEL_REQUIREMENT;
        for (let completedLevel = 1; completedLevel < safeLevel; completedLevel++) {
            levelThreshold += levelCost;
            levelCost = Math.max(1, Math.round(levelCost * 1.5));
        }
        return {
            levelThreshold,
            nextLevelThreshold: levelThreshold + levelCost
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
        this.playerFleet.totalMoneyEarned = Math.max(0, progress.totalMoneyEarned);
        this.playerFleet.level = Math.max(1, Math.floor(progress.level));
        const thresholds = this.getLevelThresholds(this.playerFleet.level);
        this.playerFleet.levelThreshold = thresholds.levelThreshold;
        this.playerFleet.nextLevelThreshold = thresholds.nextLevelThreshold;
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
            shield: this.playerFleet.abilities.shield.charges,
            net: this.playerFleet.abilities.net.charges
        };
    }

    private getDefaultAbilityCharges() {
        return { afterburner: 0, cloak: 0, bubble: 0, mine: 0, medkit: 0, fire: 0, shield: 0, net: 0 };
    }

    private applyAbilityCharges(charges: { afterburner: number; cloak: number; bubble: number; mine: number; medkit: number; fire: number; shield: number; net?: number }) {
        this.playerFleet.abilities.afterburner.charges = Math.max(0, charges.afterburner || 0);
        this.playerFleet.abilities.cloak.charges = Math.max(0, charges.cloak || 0);
        this.playerFleet.abilities.bubble.charges = Math.max(0, charges.bubble || 0);
        this.playerFleet.abilities.mine.charges = Math.max(0, charges.mine || 0);
        this.playerFleet.abilities.medkit.charges = Math.max(0, charges.medkit || 0);
        this.playerFleet.abilities.fire.charges = Math.max(0, charges.fire || 0);
        this.playerFleet.abilities.shield.charges = Math.max(0, charges.shield || 0);
        this.playerFleet.abilities.net.charges = Math.max(0, charges.net || 0);
        this.playerFleet.clampAbilityChargesToCapacity();
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

    private onSectorEntered() {
        if (!this.expedition || !this.playerFleet) return;
        const node = this.expedition.currentNode;
        this.currentSystemId = node.systemId;
        for (const neighborId of node.connections) {
            const neighbor = this.expedition.getNode(neighborId);
            if (neighbor && (!neighbor.requiredArtifact || this.expedition.hasArtifact(neighbor.requiredArtifact))) {
                this.expedition.discover(neighbor.id);
            }
        }

        const artifact = ARTIFACT_DEFINITIONS.find(candidate => candidate.foundIn === node.id);
        const newlyFound = artifact ? this.expedition.grantArtifact(artifact.id) : false;
        this.applyExpeditionEffects();
        if (newlyFound && this.ui) this.ui.addEvent(`Exploration breakthrough: ${artifact!.name}. ${artifact!.description}`);
        this.updateExpeditionHud();
    }

    private applyExpeditionEffects() {
        if (!this.playerFleet || !this.expedition) return;
        const baselineCapacity = 4 + this.playerFleet.skills.leadership * 3;
        const artifactCapacity = this.expedition.hasArtifact('artifact-command-relay') ? 3 : 0;
        this.playerFleet.commandCapacity = Math.max(this.playerFleet.commandCapacity, baselineCapacity + artifactCapacity);
    }

    private updateExpeditionHud() {
        if (!this.ui || !this.playerFleet || !this.expedition) return;
        const current = this.expedition.currentState;
        const activeSignals = this.worldEvents.filter(event => event.active).length;
        this.ui.updateExpedition({
            sectorName: this.expedition.currentNode.name,
            sectorType: this.expedition.currentNode.type,
            dangerTier: this.expedition.currentNode.dangerTier,
            danger: current.danger,
            discovered: this.expedition.snapshot.discoveredSectors.length,
            totalSectors: this.expedition.nodes.length,
            artifacts: this.expedition.artifacts.length,
            totalArtifacts: ARTIFACT_DEFINITIONS.length,
            nextDecision: activeSignals > 0 ? `${activeSignals} signal${activeSignals === 1 ? '' : 's'} active` : 'MAP: choose next route',
            recovery: this.expedition.isRecovering
        });
    }

    private showExpeditionMap() {
        if (!this.expedition || !this.playerFleet) return;
        const existing = document.getElementById('expedition-overlay');
        if (existing) {
            existing.remove();
            return;
        }
        const wasPaused = this.isPaused;
        if (!wasPaused) this.togglePause();

        const overlay = document.createElement('div');
        overlay.id = 'expedition-overlay';
        overlay.addEventListener('pointerdown', event => event.stopPropagation());
        const card = document.createElement('section');
        card.className = 'expedition-card';
        const title = document.createElement('h2');
        title.textContent = 'EXPEDITION MAP';
        const description = document.createElement('p');
        description.textContent = 'Select a discovered sector. Travel uses a known route and fuel; new systems reveal nearby routes and artifacts.';
        const grid = document.createElement('div');
        grid.className = 'expedition-grid';

        for (const node of this.expedition.nodes) {
            const button = document.createElement('button');
            button.className = 'expedition-node';
            const state = this.expedition.getState(node.id);
            const discovered = this.expedition.isDiscovered(node.id);
            const access = this.expedition.hasAccess(node);
            const estimate = discovered && access ? this.expedition.estimateTravel(node.id) : null;
            if (node.id === this.expedition.currentNode.id) button.classList.add('current');
            if (!discovered || !access) button.classList.add('locked');
            const heading = document.createElement('b');
            heading.textContent = discovered && access ? node.name : 'UNKNOWN SECTOR';
            const details = document.createElement('small');
            details.textContent = !discovered
                ? 'Undiscovered · explore connected space first'
                : !access
                    ? `Locked · requires ${ARTIFACT_DEFINITIONS.find(artifact => artifact.id === node.requiredArtifact)?.name || 'artifact'}`
                    : `${node.type.toUpperCase()} · danger ${state ? Math.round(state.danger) : node.dangerTier * 5}% · ${estimate?.fuelCost || 0} fuel${node.id === this.expedition.currentNode.id ? ' · CURRENT' : ''}`;
            button.append(heading, details);
            button.disabled = !discovered || !access || node.id === this.expedition.currentNode.id || !estimate?.ok;
            bindButtonAction(button, () => {
                overlay.remove();
                if (!wasPaused && this.isPaused) this.togglePause();
                this.travelToSector(node.id);
            });
            grid.appendChild(button);
        }

        const close = document.createElement('button');
        close.className = 'expedition-close';
        close.textContent = 'CLOSE MAP';
        bindButtonAction(close, () => {
            overlay.remove();
            if (!wasPaused && this.isPaused) this.togglePause();
        });
        card.append(title, description, grid, close);
        overlay.appendChild(card);
        document.getElementById('ui-layer')?.appendChild(overlay);
    }

    private travelToSector(targetId: string) {
        const estimate = this.expedition.travelTo(targetId, this.playerFleet.fuel);
        if (!estimate.ok) {
            this.ui.addEvent(estimate.reason || 'No expedition route available.');
            return;
        }
        const target = this.expedition.getNode(targetId);
        if (!target) return;
        this.playerFleet.addFuel(-estimate.fuelCost);
        this.ui.addEvent(`Expedition route: ${estimate.route.map(id => this.expedition.getNode(id)?.name || id).join(' → ')} · −${estimate.fuelCost} fuel.`);
        this.warpToSystem(target.systemId, this.expedition.snapshot);
    }

    private checkLevelUp() {
        if (!this.playerFleet) return;

        while (this.playerFleet.totalMoneyEarned >= this.playerFleet.nextLevelThreshold) {
            const previousLevelCost = Math.max(1, this.playerFleet.nextLevelThreshold - this.playerFleet.levelThreshold);
            this.playerFleet.level++;
            this.playerFleet.levelThreshold = this.playerFleet.nextLevelThreshold;
            const nextLevelCost = Math.max(1, Math.round(previousLevelCost * 1.5));
            this.playerFleet.nextLevelThreshold = this.playerFleet.levelThreshold + nextLevelCost;
            this.playerFleet.skillPoints += 3;
            console.log(`Level ${this.playerFleet.level} reached (earned ${formatNumber(this.playerFleet.totalMoneyEarned)})`);
        }
        this.refreshDifficultyMultiplier();
        this.updateLevelDisplay();
    }

    private handleCratePickup() {
        const pickupRadius = 75;
        const player = this.playerFleet;
        if (!player) return;

        for (let i = this.crates.length - 1; i >= 0; i--) {
            const crate = this.crates[i];
            const dist = Vector2.distance(player.position, crate.position);
            if (dist > pickupRadius) continue;

            if (crate instanceof ResourceCrate) {
                const fuel = player.addFuel(crate.fuel);
                const supplies = Math.min(crate.supplies, player.maxSupplies - player.supplies);
                player.supplies += Math.max(0, supplies);
                this.ui.addEvent(`Resources recovered: +${Math.round(fuel)} fuel, +${Math.round(supplies)} supplies.`);
                this.crates.splice(i, 1);
                const eidx = this.entities.indexOf(crate);
                if (eidx !== -1) this.entities.splice(eidx, 1);
                continue;
            }

            const added = player.addAbilityCharge(crate.abilityId as FleetAbilityId);
            if (added > 0) {
                const definition = ABILITY_DEFINITIONS[crate.abilityId as FleetAbilityId];
                this.ui.addEvent(`Unknown cache recovered: ${definition?.name || 'system charge'}.`);
                this.ui.updateAbilities(player);
                this.crates.splice(i, 1);
                const eidx = this.entities.indexOf(crate);
                if (eidx !== -1) this.entities.splice(eidx, 1);
            }
        }

        // NPC fleets use recovered resources instead of deleting crates silently.
        for (const npc of this.npcFleets) {
            if (npc.state === 'combat') continue;
            for (let i = this.crates.length - 1; i >= 0; i--) {
                const crate = this.crates[i];
                const dist = Vector2.distance(npc.position, crate.position);
                if (dist > pickupRadius) continue;
                if (crate instanceof ResourceCrate) {
                    npc.addFuel(crate.fuel);
                    npc.supplies = Math.min(npc.maxSupplies, npc.supplies + crate.supplies);
                } else {
                    if (npc.addAbilityCharge(crate.abilityId as FleetAbilityId) <= 0) continue;
                }
                this.crates.splice(i, 1);
                const eidx = this.entities.indexOf(crate);
                if (eidx !== -1) this.entities.splice(eidx, 1);
            }
        }
    }

    public awardPlayerExperience(amount: number) {
        if (!this.playerFleet || amount <= 0) return;
        this.playerFleet.totalMoneyEarned += amount;
        this.checkLevelUp();
    }

    public awardPlayerMoney(amount: number, experience = amount) {
        if (!this.playerFleet || amount <= 0) return;
        this.playerFleet.money += amount;
        this.awardPlayerExperience(experience);
        this.ui.updateMoney(this.playerFleet.money);
    }

    /** One XP is awarded for every actual point removed from shield, armor or hull. */
    public getCombatDamageExperience(_target: Fleet, damage: number) {
        return Math.max(0, damage);
    }

    public getFleetKillExperience(target: Fleet) {
        return target.maximumThreatRating * TACTICAL_BALANCE.killExperienceThreatMultiplier;
    }
    private saveGame(slot: SaveSlot = 'manual') {
        SaveSystem.save(this.playerFleet, this.npcFleets, {
            currentSystemId: String(this.currentSystemId),
            signalDirector: this.signalDirector?.snapshot(),
            worldEvents: this.captureWorldEventRuntime(),
            expedition: this.expedition?.snapshot
        }, slot);
    }

    private captureEventFleet(fleet: Fleet): EventFleetSnapshot {
        return {
            faction: fleet.faction,
            color: fleet.color,
            role: fleet.worldEventRole || 'raider',
            position: { x: fleet.position.x, y: fleet.position.y },
            velocity: { x: fleet.velocity.x, y: fleet.velocity.y },
            ships: fleet.ships.map(ship => ship.snapshot()),
            fuel: fleet.fuel,
            supplies: fleet.supplies,
            maxSupplies: fleet.maxSupplies,
            readiness: fleet.operationalReadiness,
            commandCapacity: fleet.commandCapacity,
            abilityCharges: {
                afterburner: fleet.abilities.afterburner.charges,
                cloak: fleet.abilities.cloak.charges,
                bubble: fleet.abilities.bubble.charges,
                mine: fleet.abilities.mine.charges,
                medkit: fleet.abilities.medkit.charges,
                fire: fleet.abilities.fire.charges,
                shield: fleet.abilities.shield.charges,
                net: fleet.abilities.net.charges
            }
        };
    }

    private captureWorldEventRuntime(): WorldEventRuntimeSnapshot[] {
        return this.worldEvents
            .filter(event => event.active && !!event.directorId)
            .map(event => ({
                directorId: event.directorId!,
                phase: event.phase,
                phaseAge: event.phaseAge,
                scenarioSpawned: event.scenarioSpawned,
                reinforcementsSpawned: event.reinforcementsSpawned,
                playerInvolved: event.playerInvolved,
                pendingChoice: event.pendingChoice ? { ...event.pendingChoice } : null,
                transport: event.transport ? this.captureEventFleet(event.transport) : null,
                raiders: event.raiders.map(fleet => this.captureEventFleet(fleet)),
                responders: event.responders.map(fleet => this.captureEventFleet(fleet))
            }));
    }

    private initializeWorldEvents() {
        const seed = ((this.expedition?.snapshot.seed || 0x564f4944) ^ Math.imul(this.currentSystemId, 0x9e3779b1)) >>> 0;
        this.signalDirector = new SignalDirector({ seed });
    }

    private restoreSignalDirector(snapshot?: SignalDirectorSnapshot, runtimeSnapshots: WorldEventRuntimeSnapshot[] = []) {
        this.worldEvents.forEach(event => {
            const index = this.entities.indexOf(event);
            if (index >= 0) this.entities.splice(index, 1);
        });
        this.worldEvents = [];
        this.signalEntities.clear();
        if (snapshot) this.signalDirector = SignalDirector.fromSnapshot(snapshot);
        const runtimeById = new Map(runtimeSnapshots.map(runtime => [runtime.directorId, runtime]));
        for (const saved of this.signalDirector.getActiveEvents()) {
            const event = this.spawnSignalEntity({
                id: saved.id,
                definitionId: saved.definitionId,
                worldEventKind: saved.worldEventKind,
                title: saved.title,
                position: { ...saved.position },
                timeLeft: saved.timeLeft,
                threatBudget: saved.threatBudget
            }, saved.phase);
            const runtime = runtimeById.get(saved.id);
            event.playerInvolved = runtime?.playerInvolved ?? saved.playerInvolved;
            event.setPendingChoice(runtime?.pendingChoice ?? saved.pendingChoice);
            if (runtime) {
                event.setPhase(runtime.phase);
                event.scenarioSpawned = runtime.scenarioSpawned;
                event.reinforcementsSpawned = runtime.reinforcementsSpawned;
                event.transport = runtime.transport ? this.restoreEventFleet(event, runtime.transport) : null;
                event.raiders = runtime.raiders.map(fleet => this.restoreEventFleet(event, fleet));
                event.responders = runtime.responders.map(fleet => this.restoreEventFleet(event, fleet));
                event.phaseAge = Math.max(0, runtime.phaseAge);
                this.reconnectEventFleets(event);
            } else {
                if (saved.phase === 'engaged' && saved.definitionId === 'distress-convoy') {
                    this.startTransportEvent(event);
                } else if (saved.pendingChoice) {
                    this.restorePendingSignalCombat(event, saved.pendingChoice.choiceId);
                }
                event.phaseAge = saved.engagedAt === null || !snapshot
                    ? 0
                    : Math.max(0, snapshot.elapsedTime - saved.engagedAt);
            }
        }
    }

    private spawnSignalEntity(descriptor: SignalSpawnDescriptor, phase: 'hidden' | 'discovered' | 'engaged' | 'resolved' | 'expired' = 'hidden') {
        if (this.signalEntities.has(descriptor.id)) return this.signalEntities.get(descriptor.id)!;
        const event = new WorldEvent(...toWorldEventConstructorArgs(descriptor));
        event.directorId = descriptor.id;
        event.definitionId = descriptor.definitionId;
        event.threatBudget = descriptor.threatBudget;
        event.externallyManaged = true;
        if (phase !== 'hidden') event.setPhase(phase === 'engaged' ? 'engaged' : 'discovered');
        this.signalEntities.set(descriptor.id, event);
        this.worldEvents.push(event);
        this.entities.push(event);
        return event;
    }

    private createEventFleet(event: WorldEvent, faction: Faction, role: 'transport' | 'raider' | 'responder', targetThreat: number, offset: Vector2) {
        const colors: Record<Faction, string> = {
            player: '#00AAFF', civilian: '#32CD32', pirate: '#FF4444', orc: '#9370DB',
            military: '#FFFF00', raider: '#888888', trader: '#DAA520', mercenary: '#FF8C00'
        };
        const fleet = new Fleet(event.position.x + offset.x, event.position.y + offset.y, colors[faction], false);
        fleet.faction = faction;
        fleet.ships = FleetGenerator.generate(Math.max(SIGNAL_EVENT_BALANCE.minimumThreatBudget, targetThreat), faction);
        fleet.supplies = fleet.maxSupplies;
        fleet.fuel = fleet.maxFuel;
        fleet.commandCapacity = Math.max(12, fleet.commandUsed);
        fleet.selectedShipId = fleet.ships[0]?.id || null;
        fleet.abilities.net.charges = Math.floor(Math.random() * 4);
        fleet.clampAbilityChargesToCapacity();
        fleet.worldEventId = event.id;
        fleet.worldEventRole = role;
        if (faction === 'pirate') fleet.doctrine.targetPriority = 'damaged';
        if (faction === 'military') fleet.doctrine.targetPriority = 'artillery';
        this.entities.push(fleet);
        this.npcFleets.push(fleet);
        return fleet;
    }

    private restoreEventFleet(event: WorldEvent, snapshot: EventFleetSnapshot) {
        const fleet = new Fleet(snapshot.position.x, snapshot.position.y, snapshot.color, false);
        fleet.faction = snapshot.faction;
        fleet.ships = snapshot.ships.map(ship => Ship.fromSnapshot(ship));
        fleet.velocity = new Vector2(snapshot.velocity.x, snapshot.velocity.y);
        fleet.commandCapacity = Math.max(snapshot.commandCapacity, fleet.commandUsed);
        fleet.maxSupplies = Math.max(1, snapshot.maxSupplies);
        fleet.supplies = Math.max(0, Math.min(fleet.maxSupplies, snapshot.supplies));
        fleet.fuel = Math.max(0, Math.min(fleet.maxFuel, snapshot.fuel));
        fleet.setReadiness(snapshot.readiness);
        fleet.selectedShipId = fleet.ships.find(ship => ship.role === 'flagship' && ship.alive)?.id
            || fleet.ships.find(ship => ship.alive)?.id
            || fleet.ships[0]?.id
            || null;
        fleet.worldEventId = event.id;
        fleet.worldEventRole = snapshot.role;
        fleet.abilities.afterburner.charges = snapshot.abilityCharges.afterburner;
        fleet.abilities.cloak.charges = snapshot.abilityCharges.cloak;
        fleet.abilities.bubble.charges = snapshot.abilityCharges.bubble;
        fleet.abilities.mine.charges = snapshot.abilityCharges.mine;
        fleet.abilities.medkit.charges = snapshot.abilityCharges.medkit;
        fleet.abilities.fire.charges = snapshot.abilityCharges.fire;
        fleet.abilities.shield.charges = snapshot.abilityCharges.shield;
        fleet.abilities.net.charges = snapshot.abilityCharges.net || 0;
        fleet.clampAbilityChargesToCapacity();
        if (fleet.faction === 'pirate') fleet.doctrine.targetPriority = 'damaged';
        if (fleet.faction === 'military') fleet.doctrine.targetPriority = 'artillery';
        this.entities.push(fleet);
        this.npcFleets.push(fleet);
        return fleet;
    }

    private reconnectEventFleets(event: WorldEvent) {
        if (event.transport) {
            event.transport.setTarget(event.position.add(new Vector2(-1500, 500)));
        }
        for (const raider of event.raiders) {
            if (event.pendingChoice) {
                raider.hostileTo.add(this.playerFleet);
                raider.setFollowTarget(this.playerFleet, 'contact');
            } else if (event.transport) {
                raider.setFollowTarget(event.transport, 'contact');
            }
        }
        const activeRaider = event.raiders.find(fleet => fleet.ships.some(ship => ship.alive));
        for (const responder of event.responders) {
            if (activeRaider) responder.setFollowTarget(activeRaider, 'contact');
            else if (event.definitionId === 'salvage-race') responder.setTarget(event.position.clone());
        }
    }

    private startSalvageRace(event: WorldEvent) {
        if (event.scenarioSpawned) return;
        const angle = this.eventRoll(event, 21) * Math.PI * 2;
        const competitor = this.createEventFleet(
            event,
            'trader',
            'responder',
            event.threatBudget * SIGNAL_EVENT_BALANCE.salvage.competitorThreatMultiplier,
            new Vector2(Math.cos(angle) * 360, Math.sin(angle) * 360)
        );
        competitor.setTarget(event.position.clone());
        event.responders.push(competitor);
        event.scenarioSpawned = true;
        this.ui.addEvent('A rival salvage crew is moving toward a classified wreck field.');
    }

    private engageSalvageCompetitor(event: WorldEvent) {
        const competitor = event.responders.find(fleet => this.isEventFleetOperational(fleet));
        if (!competitor) {
            this.spawnSignalOpponent(event, 'raider', SIGNAL_EVENT_BALANCE.salvage.rivalThreatMultiplier);
            return;
        }
        event.responders = event.responders.filter(fleet => fleet !== competitor);
        event.raiders.push(competitor);
        competitor.hostileTo.add(this.playerFleet);
        competitor.setFollowTarget(this.playerFleet, 'contact');
    }

    private startTransportEvent(event: WorldEvent) {
        if (event.scenarioSpawned) return;
        event.scenarioSpawned = true;
        event.setPhase('engaged');
        const reference = Math.max(SIGNAL_EVENT_BALANCE.distress.minimumReferenceThreat, event.threatBudget);
        const transport = this.createEventFleet(event, 'trader', 'transport', reference * SIGNAL_EVENT_BALANCE.distress.transportThreatMultiplier, new Vector2(-120, 0));
        const hunter = this.createEventFleet(event, 'pirate', 'raider', reference * SIGNAL_EVENT_BALANCE.distress.hunterThreatMultiplier, new Vector2(170, 30));
        event.transport = transport;
        event.raiders.push(hunter);
        transport.setTarget(event.position.add(new Vector2(-1500, 500)));
        hunter.setFollowTarget(transport, 'contact');
        this.ui.addEvent('Damaged transport detected: a pirate hunter is closing in.');
    }

    private reinforceTransportEvent(event: WorldEvent) {
        if (event.reinforcementsSpawned || !event.transport) return;
        event.reinforcementsSpawned = true;
        event.setPhase('reinforcements');
        const reference = Math.max(SIGNAL_EVENT_BALANCE.distress.minimumReferenceThreat, event.threatBudget);
        const responder = this.createEventFleet(event, 'military', 'responder', reference * SIGNAL_EVENT_BALANCE.distress.responderThreatMultiplier, new Vector2(-420, -180));
        const predator = this.createEventFleet(event, 'pirate', 'raider', reference * SIGNAL_EVENT_BALANCE.distress.predatorThreatMultiplier, new Vector2(520, 180));
        event.responders.push(responder);
        event.raiders.push(predator);
        const firstRaider = event.raiders.find(fleet => fleet.ships.some(ship => ship.alive));
        if (firstRaider) responder.setFollowTarget(firstRaider, 'contact');
        predator.setFollowTarget(event.transport, 'contact');
        this.ui.addEvent('Signal escalation: military response and heavy pirate reinforcements arrived.');
    }

    private isEventFleetOperational(fleet: Fleet | null) {
        return !!fleet && this.npcFleets.includes(fleet) && fleet.ships.some(ship => ship.alive);
    }

    private grantWorldEventOutcome(event: WorldEvent) {
        if (event.rewardGranted) return;
        if (event.directorId && event.outcome !== 'missed' && !this.signalDirector.claimReward(event.directorId)) return;
        event.rewardGranted = true;
        const salvagePosition = event.transport?.position || event.position;
        if (event.outcome === 'transport-saved') {
            this.spawnSalvage(salvagePosition.x, salvagePosition.y, event.playerInvolved ? SIGNAL_EVENT_BALANCE.distress.assistSalvage : SIGNAL_EVENT_BALANCE.distress.simulatedSalvage);
            if (event.playerInvolved) {
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.distress.assistCredits);
                this.playerFleet.supplies = Math.min(this.playerFleet.maxSupplies, this.playerFleet.supplies + SIGNAL_EVENT_BALANCE.distress.assistSupplies);
                this.ui.addEvent(`Rescue contract paid: +${SIGNAL_EVENT_BALANCE.distress.assistCredits} credits, +${SIGNAL_EVENT_BALANCE.distress.assistSupplies} supplies; pirate salvage remains.`);
            }
        } else if (event.outcome === 'transport-lost') {
            this.spawnSalvage(salvagePosition.x, salvagePosition.y, event.playerInvolved ? SIGNAL_EVENT_BALANCE.distress.lostSalvageInvolved : SIGNAL_EVENT_BALANCE.distress.lostSalvageSimulated);
            this.ui.addEvent('The transport cargo broke apart into valuable salvage.');
        } else if (event.outcome === 'missed' && event.scenarioSpawned) {
            this.spawnSalvage(event.position.x, event.position.y, SIGNAL_EVENT_BALANCE.distress.missedSalvage);
        }
    }

    private eventRoll(event: WorldEvent, salt = 0) {
        const source = `${event.directorId || event.id}:${salt}`;
        let hash = 2166136261 >>> 0;
        for (let index = 0; index < source.length; index++) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return hash / 4294967296;
    }

    private spawnSignalOpponent(event: WorldEvent, faction: Faction, threatMultiplier: number) {
        const angle = this.eventRoll(event, 31) * Math.PI * 2;
        const offset = new Vector2(Math.cos(angle) * 170, Math.sin(angle) * 170);
        const opponent = this.createEventFleet(
            event,
            faction,
            'raider',
            Math.max(SIGNAL_EVENT_BALANCE.minimumThreatBudget, event.threatBudget * threatMultiplier),
            offset
        );
        opponent.hostileTo.add(this.playerFleet);
        opponent.setFollowTarget(this.playerFleet, 'contact');
        event.raiders.push(opponent);
        event.scenarioSpawned = true;
        return opponent;
    }

    private restorePendingSignalCombat(event: WorldEvent, choiceId: string) {
        if (event.scenarioSpawned) return;
        if (choiceId === 'board') this.spawnSignalOpponent(event, 'pirate', SIGNAL_EVENT_BALANCE.derelict.ambushThreatMultiplier);
        else if (choiceId === 'seize') this.spawnSignalOpponent(event, 'military', SIGNAL_EVENT_BALANCE.tanker.patrolThreatMultiplier);
        else if (choiceId === 'claim') this.spawnSignalOpponent(event, 'raider', SIGNAL_EVENT_BALANCE.salvage.rivalThreatMultiplier);
    }

    private beginPendingSignalCombat(
        event: WorldEvent,
        choiceId: string,
        victoryOutcome: string,
        defeatOutcome: string,
        victoryDangerDelta: number,
        defeatDangerDelta: number,
        message: string
    ) {
        this.engageSignalEvent(event);
        const pending = {
            kind: 'combat' as const,
            choiceId,
            victoryOutcome,
            defeatOutcome,
            victoryDangerDelta,
            defeatDangerDelta
        };
        event.setPendingChoice(pending);
        if (event.directorId) this.signalDirector.setPendingChoice(event.directorId, pending);
        this.ui.addEvent(message);
        this.saveGame();
        this.closeTooltip();
        if (this.isPaused) this.togglePause();
    }

    private completePendingSignalCombat(event: WorldEvent, victory: boolean) {
        const pending = event.pendingChoice;
        if (!pending) return;
        const outcome = victory ? pending.victoryOutcome : pending.defeatOutcome;
        const dangerDelta = victory ? pending.victoryDangerDelta : pending.defeatDangerDelta;
        const reward = victory ? () => {
            if (pending.choiceId === 'board') {
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.derelict.recoveryCredits);
                const abilityIds: FleetAbilityId[] = ['medkit', 'shield', 'fire', 'afterburner'];
                this.spawnAbilityCrate(
                    event.position.x + 15,
                    event.position.y,
                    abilityIds[Math.floor(this.eventRoll(event, 9) * abilityIds.length)]!
                );
                this.ui.addEvent(`Ambush defeated: +${SIGNAL_EVENT_BALANCE.derelict.recoveryCredits} credits and a recovered system charge.`);
            } else if (pending.choiceId === 'seize') {
                this.playerFleet.addFuel(this.playerFleet.maxFuel * SIGNAL_EVENT_BALANCE.tanker.seizureFuelFraction);
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.tanker.seizureCredits);
                this.ui.addEvent(`Security patrol defeated: seized fuel and +${SIGNAL_EVENT_BALANCE.tanker.seizureCredits} credits.`);
            } else if (pending.choiceId === 'claim') {
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.salvage.claimedCredits);
                this.spawnResourceCrate(event.position.x + 25, event.position.y, SIGNAL_EVENT_BALANCE.salvage.claimedCrateFuel, SIGNAL_EVENT_BALANCE.salvage.claimedCrateSupplies);
                this.ui.addEvent(`Rival defeated: +${SIGNAL_EVENT_BALANCE.salvage.claimedCredits} credits and the wreck-field resources are yours.`);
            } else if (pending.choiceId === 'challenge') {
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.patrol.challengeCredits);
                this.ui.addEvent(`Patrol defeated: +${SIGNAL_EVENT_BALANCE.patrol.challengeCredits} credits and the route is open.`);
            } else if (pending.choiceId === 'counterattack') {
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.hunter.counterattackCredits);
                this.playerFleet.supplies = Math.min(this.playerFleet.maxSupplies, this.playerFleet.supplies + SIGNAL_EVENT_BALANCE.hunter.counterattackSupplies);
                this.ui.addEvent(`Hunter defeated: +${SIGNAL_EVENT_BALANCE.hunter.counterattackCredits} credits and recovered supplies.`);
            }
        } : () => this.ui.addEvent('The opposing fleet secured the event objective.');
        this.finishSignalChoice(event, outcome, dangerDelta, reward);
    }

    private finishSignalChoice(event: WorldEvent, outcome: string, dangerDelta: number, reward?: () => void) {
        this.engageSignalEvent(event);
        this.resolveWorldEvent(event, outcome, dangerDelta);
        this.expedition.recordOutcome(dangerDelta, dangerDelta < 0 ? 2 : dangerDelta > 0 ? -2 : 0);
        const canGrant = !event.directorId || this.signalDirector.claimReward(event.directorId);
        if (canGrant) {
            reward?.();
            event.rewardGranted = true;
        }
        event.resolutionReported = true;
        this.ui.updateMoney(this.playerFleet.money);
        this.ui.updateAbilities(this.playerFleet);
        this.ui.updateFleet(this.playerFleet);
        this.saveGame();
        this.closeTooltip();
        if (this.isPaused) this.togglePause();
    }

    private engageSignalEvent(event: WorldEvent) {
        event.playerInvolved = true;
        event.setPhase('engaged');
        if (event.directorId) this.signalDirector.markEngaged(event.directorId, true);
    }

    private resolveSignalChoice(event: WorldEvent, choiceId: string) {
        if (!event.active || !event.directorId) return;
        const sensorContact = this.sensors.getContact(this.playerFleet, event);
        if (!sensorContact || sensorContact.stale || sensorContact.level !== 'identified') {
            this.ui.addEvent('Identify the signal before choosing an outcome.');
            return;
        }
        if (Vector2.distance(event.position, this.playerFleet.position) > event.interactionRadius + SIGNAL_EVENT_BALANCE.interactionPadding) {
            this.ui.addEvent('Move closer before interacting with the signal.');
            return;
        }
        const definition = SIGNAL_DEFINITIONS.find(candidate => candidate.id === event.definitionId);
        const choice = definition?.choices.find(candidate => candidate.id === choiceId);
        if (!definition || !choice) return;

        const eventKind: SignalEventKind = definition.id;
        const fail = (message: string) => {
            this.ui.addEvent(message);
            this.showTooltip(event);
        };
        const finish = (outcome: string, rewardMessage: string, reward?: () => void) => {
            this.finishSignalChoice(event, outcome, choice.dangerDelta, () => {
                reward?.();
                if (rewardMessage) this.ui.addEvent(rewardMessage);
            });
        };

        if (eventKind === 'distress-convoy') {
            if (choiceId === 'assist') {
                this.engageSignalEvent(event);
                this.startTransportEvent(event);
                this.ui.addEvent('Rescue accepted. Protect the convoy until it escapes.');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
                return;
            }
            if (choiceId === 'raid') {
                finish('convoy-raided', `Survivor cargo seized: +${SIGNAL_EVENT_BALANCE.distress.raidCredits} credits; resources are drifting nearby.`, () => {
                    this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.distress.raidCredits);
                    this.spawnResourceCrate(event.position.x + 25, event.position.y, SIGNAL_EVENT_BALANCE.distress.raidCrateFuel, SIGNAL_EVENT_BALANCE.distress.raidCrateSupplies);
                });
                return;
            }
            finish('ignored', 'The distress signal was left to resolve on its own.');
            return;
        }

        if (eventKind === 'derelict-trap') {
            if (choiceId === 'scan') {
                if (!this.playerFleet.consumePooledEnergyFraction(SIGNAL_EVENT_BALANCE.derelict.remoteScanEnergyFraction)) return fail(`Remote scan needs ${Math.round(SIGNAL_EVENT_BALANCE.derelict.remoteScanEnergyFraction * 100)}% of fleet Energy capacity.`);
                finish('remote-scan', `Remote scan recovered navigation data and a small cache: +${SIGNAL_EVENT_BALANCE.derelict.remoteScanCredits} credits.`, () => {
                    this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.derelict.remoteScanCredits);
                    this.spawnResourceCrate(event.position.x + 20, event.position.y, SIGNAL_EVENT_BALANCE.derelict.remoteCrateFuel, SIGNAL_EVENT_BALANCE.derelict.remoteCrateSupplies);
                });
                return;
            }
            if (choiceId === 'board') {
                const ambush = this.eventRoll(event, 7) < SIGNAL_EVENT_BALANCE.derelict.ambushChance;
                if (ambush) {
                    this.spawnSignalOpponent(event, 'pirate', SIGNAL_EVENT_BALANCE.derelict.ambushThreatMultiplier);
                    this.beginPendingSignalCombat(
                        event, 'board', 'derelict-recovered', 'boarding-repelled',
                        choice.dangerDelta, SIGNAL_EVENT_BALANCE.derelict.defeatDangerDelta,
                        'Boarding triggered an ambush. Defeat the pirate contact to recover the derelict.'
                    );
                    return;
                }
                finish('derelict-recovered', `The derelict was genuine: +${SIGNAL_EVENT_BALANCE.derelict.recoveryCredits} credits and a system charge.`, () => {
                    this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.derelict.recoveryCredits);
                    const abilityIds: FleetAbilityId[] = ['medkit', 'shield', 'fire', 'afterburner'];
                    this.spawnAbilityCrate(event.position.x + 15, event.position.y, abilityIds[Math.floor(this.eventRoll(event, 9) * abilityIds.length)]!);
                });
                return;
            }
            finish('withdrawn', 'The derelict was marked and left untouched.');
            return;
        }

        if (eventKind === 'unstable-anomaly') {
            if (choiceId === 'analyze') {
                if (!this.playerFleet.consumePooledEnergyFraction(SIGNAL_EVENT_BALANCE.anomaly.analysisEnergyFraction)) return fail(`Spectral analysis needs ${Math.round(SIGNAL_EVENT_BALANCE.anomaly.analysisEnergyFraction * 100)}% of fleet Energy capacity.`);
                finish('analyzed', `Anomaly mapped: +${SIGNAL_EVENT_BALANCE.anomaly.analysisCredits} credits and one experimental system charge.`, () => {
                    this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.anomaly.analysisCredits);
                    const abilityIds: FleetAbilityId[] = ['medkit', 'shield', 'fire'];
                    const abilityId = abilityIds[Math.floor(this.eventRoll(event, 12) * abilityIds.length)]!;
                    this.playerFleet.addAbilityCharge(abilityId);
                });
                return;
            }
            if (choiceId === 'stabilize') {
                if (this.playerFleet.supplies < SIGNAL_EVENT_BALANCE.anomaly.stabilizationSupplyCost) return fail(`Stabilization requires ${SIGNAL_EVENT_BALANCE.anomaly.stabilizationSupplyCost} supplies.`);
                this.playerFleet.supplies -= SIGNAL_EVENT_BALANCE.anomaly.stabilizationSupplyCost;
                finish('stabilized', `Anomaly stabilized safely: +${SIGNAL_EVENT_BALANCE.anomaly.stabilizationCredits} credits.`, () => this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.anomaly.stabilizationCredits));
                return;
            }
            finish('left-unstable', 'The unstable anomaly was left behind.');
            return;
        }

        if (eventKind === 'stranded-tanker') {
            if (choiceId === 'supply') {
                if (this.playerFleet.supplies < SIGNAL_EVENT_BALANCE.tanker.assistanceSupplyCost) return fail(`The tanker asks for ${SIGNAL_EVENT_BALANCE.tanker.assistanceSupplyCost} supplies.`);
                this.playerFleet.supplies -= SIGNAL_EVENT_BALANCE.tanker.assistanceSupplyCost;
                finish('tanker-assisted', `Tanker rescued: fuel transferred and +${SIGNAL_EVENT_BALANCE.tanker.assistanceCredits} credits.`, () => {
                    this.playerFleet.addFuel(this.playerFleet.maxFuel * SIGNAL_EVENT_BALANCE.tanker.assistanceFuelFraction);
                    this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.tanker.assistanceCredits);
                });
                return;
            }
            if (choiceId === 'seize') {
                this.spawnSignalOpponent(event, 'military', SIGNAL_EVENT_BALANCE.tanker.patrolThreatMultiplier);
                this.beginPendingSignalCombat(
                    event, 'seize', 'fuel-seized', 'seizure-stopped',
                    choice.dangerDelta, SIGNAL_EVENT_BALANCE.tanker.defeatDangerDelta,
                    'A security patrol intervened. Defeat it before the tanker can be seized.'
                );
                return;
            }
            finish('tanker-ignored', 'The tanker was left without assistance.');
            return;
        }

        if (eventKind === 'border-patrol') {
            if (choiceId === 'pass') {
                finish('patrol-passed', `The patrol verified your transponder: +${SIGNAL_EVENT_BALANCE.patrol.passCredits} credits.`, () => this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.patrol.passCredits));
                return;
            }
            if (choiceId === 'evade') {
                if (this.playerFleet.fuel < SIGNAL_EVENT_BALANCE.patrol.evadeFuel) return fail(`Evading the patrol needs ${SIGNAL_EVENT_BALANCE.patrol.evadeFuel} fuel.`);
                this.playerFleet.addFuel(-SIGNAL_EVENT_BALANCE.patrol.evadeFuel);
                finish('patrol-evaded', 'The patrol lost your trail, but the route is less safe now.');
                return;
            }
            this.spawnSignalOpponent(event, 'military', SIGNAL_EVENT_BALANCE.patrol.challengeThreatMultiplier);
            this.beginPendingSignalCombat(
                event, 'challenge', 'patrol-defeated', 'patrol-repelled',
                choice.dangerDelta, SIGNAL_EVENT_BALANCE.patrol.defeatDangerDelta,
                'The patrol refuses passage. Defeat it to claim the route.'
            );
            return;
        }

        if (eventKind === 'wandering-trader') {
            if (choiceId === 'trade') {
                if (this.playerFleet.supplies < SIGNAL_EVENT_BALANCE.trader.supplyCost) return fail(`The trader asks for ${SIGNAL_EVENT_BALANCE.trader.supplyCost} supplies.`);
                this.playerFleet.supplies -= SIGNAL_EVENT_BALANCE.trader.supplyCost;
                finish('traded', `Trade complete: +${Math.round(this.playerFleet.maxFuel * SIGNAL_EVENT_BALANCE.trader.fuelFraction)} fuel.`, () => this.playerFleet.addFuel(this.playerFleet.maxFuel * SIGNAL_EVENT_BALANCE.trader.fuelFraction));
                return;
            }
            if (choiceId === 'buy-intel') {
                if (this.playerFleet.fuel < SIGNAL_EVENT_BALANCE.trader.intelFuelCost) return fail(`Route intelligence costs ${SIGNAL_EVENT_BALANCE.trader.intelFuelCost} fuel.`);
                this.playerFleet.addFuel(-SIGNAL_EVENT_BALANCE.trader.intelFuelCost);
                finish('route-intelligence', 'The trader reveals safer approaches to nearby sectors.', () => {
                    this.expedition.recordOutcome(0, SIGNAL_EVENT_BALANCE.trader.intelRouteSafety);
                    for (const neighborId of this.expedition.currentNode.connections) {
                        const neighbor = this.expedition.getNode(neighborId);
                        if (neighbor && this.expedition.hasAccess(neighbor)) this.expedition.discover(neighbor.id);
                    }
                });
                return;
            }
            finish('trader-passed', 'The trader disappears into the sensor noise.');
            return;
        }

        if (eventKind === 'hunter-ambush') {
            if (choiceId === 'break-contact') {
                if (this.playerFleet.fuel < SIGNAL_EVENT_BALANCE.hunter.breakContactFuel) return fail(`Breaking contact needs ${SIGNAL_EVENT_BALANCE.hunter.breakContactFuel} fuel.`);
                this.playerFleet.addFuel(-SIGNAL_EVENT_BALANCE.hunter.breakContactFuel);
                finish('hunter-evaded', 'Afterburners broke the hunter lock.');
                return;
            }
            if (choiceId === 'hide') {
                if (this.playerFleet.supplies < SIGNAL_EVENT_BALANCE.hunter.hideSupplyCost) return fail(`Hiding needs ${SIGNAL_EVENT_BALANCE.hunter.hideSupplyCost} supplies.`);
                this.playerFleet.supplies -= SIGNAL_EVENT_BALANCE.hunter.hideSupplyCost;
                finish('hunter-avoided', 'The fleet went dark until the hunter passed.');
                return;
            }
            this.spawnSignalOpponent(event, 'raider', SIGNAL_EVENT_BALANCE.hunter.counterattackThreatMultiplier);
            this.beginPendingSignalCombat(
                event, 'counterattack', 'hunter-defeated', 'hunter-repelled',
                choice.dangerDelta, SIGNAL_EVENT_BALANCE.hunter.defeatDangerDelta,
                'The hunter has committed to the intercept. Defeat it for the salvage.'
            );
            return;
        }

        if (choiceId === 'share') {
            finish('salvage-shared', `Salvage shared peacefully: +${SIGNAL_EVENT_BALANCE.salvage.sharedCredits} credits, +${SIGNAL_EVENT_BALANCE.salvage.sharedSupplies} supplies.`, () => {
                this.awardPlayerMoney(SIGNAL_EVENT_BALANCE.salvage.sharedCredits);
                this.playerFleet.supplies = Math.min(this.playerFleet.maxSupplies, this.playerFleet.supplies + SIGNAL_EVENT_BALANCE.salvage.sharedSupplies);
            });
        } else if (choiceId === 'claim') {
            this.engageSalvageCompetitor(event);
            this.beginPendingSignalCombat(
                event, 'claim', 'salvage-claimed', 'salvage-lost',
                choice.dangerDelta, SIGNAL_EVENT_BALANCE.salvage.defeatDangerDelta,
                'The rival contests your claim. Defeat it before recovering the wreck field.'
            );
        } else {
            finish('salvage-withdrawn', 'The rival recovered the wreck field.');
        }
    }

    private handleSignalTrackerAction(action: 'track' | 'inspect', event: WorldEvent) {
        const contact = this.sensors.getContact(this.playerFleet, event);
        if (!event.active || !contact || contact.stale) return;
        if (action === 'track') {
            this.closeTooltip();
            this.playerFleet.setFollowTarget(event, 'contact');
            if (this.isPaused) this.togglePause();
            this.ui.addEvent(`Tracking ${contact.intel.signalTitle || 'classified signal'}.`);
            return;
        }
        this.inspectedEntity = event;
        if (!this.isPaused) this.togglePause();
        this.showTooltip(event);
    }

    private updateSensors(dt: number) {
        this.sensorAccumulator += dt;
        if (this.sensorAccumulator < 0.1) return;
        const elapsed = this.sensorAccumulator;
        this.sensorAccumulator = 0;
        const playerTargets = [...this.npcFleets, ...this.worldEvents.filter(event => event.active)];
        this.sensors.update(this.playerFleet, playerTargets, elapsed, this.gameClock);
        const allFleets = [this.playerFleet, ...this.npcFleets];
        for (const npc of this.npcFleets) {
            this.sensors.update(npc, allFleets, elapsed, this.gameClock);
        }
        for (const event of this.worldEvents) {
            const contact = this.sensors.getContact(this.playerFleet, event);
            if (!event.discovered && contact && !contact.stale && contact.level !== 'blip') {
                event.setPhase('discovered');
                if (event.directorId) this.signalDirector.markDiscovered(event.directorId);
                this.ui.addEvent(`Signal classified · ${Math.ceil(event.timeLeft)}s remaining. Continue scanning for exact data.`);
            }
        }
        if ((this.inspectedEntity instanceof Fleet && this.inspectedEntity !== this.playerFleet) ||
            this.inspectedEntity instanceof WorldEvent) {
            const contact = this.sensors.getContact(this.playerFleet, this.inspectedEntity);
            if (!contact || contact.stale) this.closeTooltip();
        }
        if (this.playerFleet.followTarget instanceof Fleet || this.playerFleet.followTarget instanceof WorldEvent) {
            const target = this.playerFleet.followTarget;
            const contact = this.sensors.getContact(this.playerFleet, target);
            if (!contact || contact.stale) {
                this.playerFleet.stopFollowing();
                this.ui.addEvent('Tracked contact faded from the live sensor picture.');
            }
        }
    }

    public canFleetDetect(observer: Fleet, target: Fleet) {
        return this.sensors.canRender(observer, target);
    }

    public canFleetTarget(observer: Fleet, target: Fleet) {
        return this.sensors.canAttack(observer, target);
    }

    public getFleetSensorRange(fleet: Fleet) {
        const base = this.sensors.getFleetProfile(fleet, this.gameClock).sensorRange;
        return fleet.isPlayer && this.expedition?.hasArtifact('artifact-long-range-array') ? base * 1.2 : base;
    }

    private updateWorldEvents(dt: number) {
        const dimensions = this.renderer.getDimensions();
        const sector = this.expedition.currentState;
        const sectorReferenceThreat = Math.max(
            10,
            this.expedition.currentNode.dangerTier * 18 + sector.danger * 0.35,
            this.playerFleet.threatRating * 0.35
        );
        const update = this.signalDirector.update(dt, {
            playerPosition: this.playerFleet.position,
            playerSensorRange: Math.max(100, this.getFleetSensorRange(this.playerFleet)),
            playerThreat: sectorReferenceThreat,
            systemBounds: { center: { x: 0, y: 0 }, radius: this.SYSTEM_RADIUS, margin: 300 },
            avoid: position => {
                const screen = this.camera.worldToScreen(new Vector2(position.x, position.y));
                if (screen.x >= -80 && screen.x <= dimensions.width + 80 && screen.y >= -80 && screen.y <= dimensions.height + 80) return true;
                return this.entities.some(entity => !(entity instanceof WorldEvent) &&
                    Vector2.distance(entity.position, new Vector2(position.x, position.y)) < Math.max(180, entity.radius + 80));
            }
        });
        for (const descriptor of update.spawned) {
            this.spawnSignalEntity(descriptor);
        }
        for (const snapshot of this.signalDirector.getActiveEvents()) {
            const event = this.signalEntities.get(snapshot.id);
            if (!event) continue;
            event.timeLeft = snapshot.timeLeft;
            event.phaseAge += dt;
        }
        for (const expired of update.expired) {
            const event = this.signalEntities.get(expired.id);
            if (event?.active) event.resolve('missed');
        }

        const completedEvents: WorldEvent[] = [];
        for (const event of this.worldEvents) {
            if (!event.active) {
                if (!event.resolutionReported) {
                    this.grantWorldEventOutcome(event);
                    event.resolutionReported = true;
                    if (event.outcome === 'transport-saved') this.ui.addEvent('Transport escaped the ambush.');
                    else if (event.outcome === 'transport-lost') this.ui.addEvent('The transport was destroyed; only wreckage remains.');
                    else this.ui.addEvent(`${event.title} expired; the world moved on without you.`);
                }
                if (event.resolutionReported) completedEvents.push(event);
                continue;
            }
            const playerDistance = Vector2.distance(event.position, this.playerFleet.position);
            if (event.definitionId === 'salvage-race' && event.discovered && !event.scenarioSpawned) {
                this.startSalvageRace(event);
            }
            if (event.pendingChoice?.kind === 'combat') {
                const playerOperational = this.playerFleet.ships.some(ship => ship.state === 'active');
                const opponentsOperational = event.raiders.some(fleet => this.isEventFleetOperational(fleet));
                if (!playerOperational) this.completePendingSignalCombat(event, false);
                else if (!opponentsOperational) this.completePendingSignalCombat(event, true);
                continue;
            }
            if (event.definitionId === 'distress-convoy') {
                if (!event.scenarioSpawned && (playerDistance <= SIGNAL_EVENT_BALANCE.distress.autoStartDistance || event.timeLeft <= SIGNAL_EVENT_BALANCE.distress.autoStartTimeLeft)) {
                    this.startTransportEvent(event);
                    if (event.directorId) this.signalDirector.markEngaged(event.directorId, playerDistance <= SIGNAL_EVENT_BALANCE.distress.involvementDistance);
                }
                if (!event.scenarioSpawned) continue;
                if (playerDistance <= SIGNAL_EVENT_BALANCE.distress.involvementDistance || this.playerFleet.currentTarget?.worldEventId === event.id) {
                    if (!event.playerInvolved && event.directorId) this.signalDirector.markEngaged(event.directorId, true);
                    event.playerInvolved = true;
                }
                if (!this.isEventFleetOperational(event.transport)) {
                    this.resolveWorldEvent(event, 'transport-lost', SIGNAL_EVENT_BALANCE.distress.lostDangerDelta);
                    continue;
                }
                const activeRaiders = event.raiders.filter(fleet => this.isEventFleetOperational(fleet));
                if (activeRaiders.length === 0) {
                    this.resolveWorldEvent(event, 'transport-saved', SIGNAL_EVENT_BALANCE.distress.savedDangerDelta);
                    continue;
                }
                if (!event.reinforcementsSpawned && event.phaseAge >= SIGNAL_EVENT_BALANCE.distress.reinforcementDelay) {
                    this.reinforceTransportEvent(event);
                }
                continue;
            }
        }
        for (const event of completedEvents) {
            const entityIndex = this.entities.indexOf(event);
            if (entityIndex >= 0) this.entities.splice(entityIndex, 1);
            this.signalEntities.delete(event.directorId || '');
        }
        if (completedEvents.length) {
            const completed = new Set(completedEvents);
            this.worldEvents = this.worldEvents.filter(event => !completed.has(event));
            if (this.inspectedEntity instanceof WorldEvent && completed.has(this.inspectedEntity)) this.closeTooltip();
        }
    }

    private resolveWorldEvent(event: WorldEvent, outcome: string, dangerDelta = 0) {
        if (!event.active) return;
        event.resolve(outcome);
        if (event.directorId) this.signalDirector.resolveEvent(event.directorId, outcome, dangerDelta);
    }

    private update(dt: number) {
        if (this.isPaused) return;

        // loop() already applies timeScale before calling update().
        this.gameClock += dt;
        this.expedition.tick(dt);
        this.updateWorldEvents(dt);

        // 1. Maintain Population & Bounds Check
        const toRemoveBounds: Fleet[] = [];
        for (const f of this.npcFleets) {
            if (!f.ships.some(ship => ship.alive)) {
                toRemoveBounds.push(f);
            } else {
                this.keepFleetInsideSystem(f);
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
            const newFleets = this.systemManager.spawnFleetsForSystem(this.currentSystemId, this.playerFleet.threatRating, this.npcFleets, this.difficultyMultiplier, undefined, this.playerFleet.level, this.signalDirector.systemDanger);
            // Add new fleets to entities and npcFleets
            for (const fleet of newFleets) {
                this.entities.push(fleet);
                this.npcFleets.push(fleet);
            }
            console.log(`Spawned ${newFleets.length} new fleets in System ${this.currentSystemId}`);
        }

        this.keepFleetInsideSystem(this.playerFleet);
        this.updateAsteroidBeltState();
        this.updateSensors(dt);

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

        // Shields and field repairs update on individual ships; fleet HP and visual size no longer regenerate or scale.

        // Boundary warning for player
        if (this.playerFleet.position.mag() > this.SYSTEM_RADIUS * 0.9) {
            // Very simple warning for now (no UI yet)
            // console.warn("Approaching system boundary!");
        }
        // Fleets may enter the belt, but cannot leave the system entirely.

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

        this.aiAccumulator += dt;
        if (this.aiAccumulator >= 0.1) {
            this.aiController.processAI();
            this.aiAccumulator %= 0.1;
        }
        this.processCombat(dt);
        this.combatEffects.update(dt);

        // Debris pickup - player and NPCs

        // Player collection (with animation)
        const playerFleet = this.playerFleet;
        let playerCollectedAny = false;
        if (playerFleet.state !== 'combat') { // Don't pick up during combat or when moving fast
            const pickupRadius = 75; // Radius for debris pickup
            const pickupRate = dt * Math.max(1, playerFleet.ships.filter(ship => ship.alive).length);
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
                // Salvage remains profitable, but is only a small source of XP.
                this.awardPlayerMoney(
                    pickupAmount * 5 * (this.expedition.hasArtifact('artifact-salvage-matrix') ? 1.25 : 1),
                    pickupAmount * TACTICAL_BALANCE.salvageExperienceMultiplier
                );

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
                const pickupRate = dt * Math.max(1, npc.ships.filter(ship => ship.alive).length);
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
            if (mine.owner === this.playerFleet && mine.damageDealt > 0) {
                this.awardPlayerExperience(mine.damageDealt);
            }
            if (mine.isExploded) {
                this.mines.splice(i, 1);
            }
        }

        if (this.cameraFollow) {
            const camTarget = this.playerFleet.position;
            const lerpSpeed = 5.0;
            const diff = camTarget.sub(this.camera.position);
            const followResponse = 1 - Math.exp(-lerpSpeed * Math.max(0, dt));
            this.camera.position = this.camera.position.add(diff.scale(followResponse));
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
                            this.playerFleet.followTarget instanceof WorldEvent ?
                                (this.playerFleet.followTarget as WorldEvent).interactionRadius :
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
                            const target = this.expedition.getNodeBySystemId(gate.targetSystemId);
                            const route = target ? this.expedition.travelTo(target.id, this.playerFleet.fuel) : null;
                            if (route?.ok && target) {
                                this.playerFleet.addFuel(-route.fuelCost);
                                this.warpToSystem(gate.targetSystemId, this.expedition.snapshot);
                            } else {
                                this.ui.addEvent(route?.reason || 'This warp gate is not part of the known expedition route.');
                            }
                            this.playerFleet.stopFollowing();
                        } else if (this.playerFleet.followTarget instanceof Fleet) {
                            this.initiateContact(this.playerFleet.followTarget);
                            // Change to approach mode after contact
                            this.playerFleet.followMode = 'approach';
                        } else if (this.playerFleet.followTarget instanceof WorldEvent) {
                            const event = this.playerFleet.followTarget;
                            this.playerFleet.stopFollowing();
                            if (!this.isPaused) this.togglePause();
                            this.showTooltip(event);
                        }
                    }
                }
            }
        }


    }





    private spawnFleetLoot(fleet: Fleet) {
        if (fleet.lootDropped) return false;
        fleet.lootDropped = true;

        const debrisValue = Math.max(1, Math.floor(
            fleet.ships.reduce((sum, ship) => sum + ship.definition.tacticalValue, 0) / TACTICAL_BALANCE.salvageFleetValueDivisor
        ));
        this.spawnDebris(fleet.position.x, fleet.position.y, debrisValue);

        if (!fleet.isPlayer) {
            const loot = rollFleetLoot({
                shipCount: fleet.ships.length,
                commandCost: fleet.ships.reduce((sum, ship) => sum + ship.commandCost, 0),
                fuelCapacity: fleet.ships.reduce((sum, ship) => sum + ship.maxFuelCapacity, 0),
                cargoCapacity: fleet.ships.reduce((sum, ship) => sum + ship.definition.cargo * ship.statScale, 0)
            });
            if (loot.fuel > 0) {
                this.spawnResourceCrate(fleet.position.x + 18, fleet.position.y, loot.fuel, 0);
            }
            if (loot.supplies > 0) {
                this.spawnResourceCrate(fleet.position.x - 18, fleet.position.y, 0, loot.supplies);
            }
        }

        // Ability caches are rare: one unidentified cache on roughly half of
        // destroyed fleets, never a visible list of guaranteed abilities.
        if (Math.random() < 0.5) {
            const abilityIds: FleetAbilityId[] = ['afterburner', 'bubble', 'cloak', 'mine', 'medkit', 'fire', 'shield', 'net'];
            const abilityId = abilityIds[Math.floor(Math.random() * abilityIds.length)];
            this.spawnAbilityCrate(
                fleet.position.x - 18,
                fleet.position.y,
                abilityId
            );
        }
        return true;
    }


    private processCombat(dt: number) {
        const allFleets = [this.playerFleet, ...this.npcFleets];
        const combatTargets = allFleets;

        // 1. Tick and Check for Resolution
        const toRemove: Fleet[] = [];
        for (let i = this.attacks.length - 1; i >= 0; i--) {
            const a = this.attacks[i];

            a.update(dt);
            if (a.finished) {
                if (a.target instanceof CelestialBody) {
                    this.resolveMiningAttack(a);
                } else {
                    this.resolveAttack(a, toRemove);
                }
                this.attacks.splice(i, 1);
            }
        }

        // 2. Interaction check for new attacks
        for (let i = 0; i < allFleets.length; i++) {
            const attacker = allFleets[i];
            if (toRemove.includes(attacker)) continue;

            for (let j = 0; j < combatTargets.length; j++) {
                const target = combatTargets[j];
                if (toRemove.includes(target) || attacker === target) continue;

                // Skip if attacker is already attacking someone
                if (attacker.currentTarget) continue;

                const baseTriggerDist = attacker.attackRadius;

                const dist = Vector2.distance(attacker.position, target.position);

                // Start NEW attack if hostile and not attacking
                if (target.isCloaked) continue;
                if (this.aiController.isHostile(attacker, target)) {
                    const hasSensorSolution = this.sensors.canAttack(attacker, target) || target.currentTarget === attacker;
                    if (!hasSensorSolution) continue;
                    let triggerDist = baseTriggerDist;
                    if (attacker.followTarget === target) triggerDist = baseTriggerDist * 2; // Double for following

                    if (dist < triggerDist) {
                        const attack = new Attack(attacker, target, this);
                        this.attacks.push(attack);

                        // Special case: Player attacking civilian or military triggers hostility
                        if (attacker.isPlayer && (target.faction === 'civilian' || target.faction === 'military' || target.faction === 'mercenary')) {
                            const detectionRadius = 2000;
                            const player = attacker;

                            // All military in detection radius become hostile to player
                            for (const fleet of allFleets) {
                                if ((fleet.faction === 'military' || fleet.faction === 'mercenary') && Vector2.distance(fleet.position, player.position) <= detectionRadius) {
                                    fleet.hostileTo.add(player);
                                }
                            }

                            // All civilians larger than player in detection radius become hostile to player
                            for (const fleet of allFleets) {
                            if (fleet.faction === 'civilian' && fleet.threatRating > player.threatRating && Vector2.distance(fleet.position, player.position) <= detectionRadius) {
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
            if (dead === this.playerFleet) {
                this.recoverPlayerFleet();
                return;
            }
            const idx = this.npcFleets.indexOf(dead);
            if (idx !== -1) this.npcFleets.splice(idx, 1);
            const eidx = this.entities.indexOf(dead);
            if (eidx !== -1) this.entities.splice(eidx, 1);

        }
    }

    private recoverPlayerFleet() {
        if (this.isGameOver || !this.playerFleet || !this.expedition) return;
        const recovery = this.expedition.beginRecovery(this.gameClock);
        for (const event of this.worldEvents) {
            if (event.active && event.pendingChoice?.kind === 'combat') {
                this.completePendingSignalCombat(event, false);
            }
        }
        for (const ship of this.playerFleet.ships) {
            if (ship.state === 'destroyed') ship.state = 'disabled';
            ship.disabledDamage = 0;
            ship.hull = Math.max(1, Math.min(ship.maxHull * 0.08, ship.hull));
            ship.armor = Math.max(0, ship.armor * 0.25);
            ship.shield = 0;
            ship.energy = Math.max(0, ship.maxEnergy * 0.15);
            ship.targetShipId = null;
            ship.order = { type: 'retreat', issuedAt: this.gameClock };
        }
        const flagship = this.playerFleet.ships.find(ship => ship.role === 'flagship') || this.playerFleet.ships[0];
        if (flagship) {
            flagship.state = 'active';
            flagship.hull = Math.max(1, flagship.maxHull * 0.08);
        }
        this.playerFleet.supplies = Math.max(0, Math.floor(this.playerFleet.supplies * (1 - recovery.cargoLossFraction)));
        this.playerFleet.fuel = Math.max(10, this.playerFleet.fuel * 0.5);
        this.playerFleet.setReadiness(Math.max(15, this.playerFleet.operationalReadiness - recovery.readinessPenalty));
        this.playerFleet.state = 'flee';
        this.playerFleet.currentTarget = null;
        this.playerFleet.activeBattle = null;
        this.playerFleet.stopFollowing();
        this.playerFleet.manualSteerTarget = null;
        this.attacks = this.attacks.filter(attack => attack.attacker !== this.playerFleet && attack.target !== this.playerFleet);
        this.bubbleZones = this.bubbleZones.filter(bubble => bubble.owner !== this.playerFleet);

        const safeNode = this.expedition.getNode(recovery.safeNodeId);
        if (safeNode && safeNode.systemId !== this.currentSystemId) {
            this.warpToSystem(safeNode.systemId, this.expedition.snapshot, true);
        } else {
            const terra = this.currentSystemId === 1
                ? this.entities.find(entity => entity instanceof CelestialBody && entity.name === 'Terra') as CelestialBody | undefined
                : undefined;
            this.playerFleet.position = terra
                ? terra.position.add(new Vector2(0, -300))
                : new Vector2(500, 500);
            this.playerFleet.velocity = new Vector2(0, 0);
            this.playerFleet.state = 'normal';
            this.activateRespawnCloak();
            this.camera.position = this.playerFleet.position.clone();
        }
        this.isGameOver = false;
        this.ui.addEvent(`Fleet recovered at ${safeNode?.name || 'safe harbor'}: supplies and readiness lost, ships preserved.`);
        this.ui.updateFleet(this.playerFleet);
        this.saveGame('autosave');
    }

    /** Grants a short, free arrival cloak without consuming a player charge. */
    private activateRespawnCloak() {
        const cloak = this.playerFleet.abilities.cloak;
        cloak.active = true;
        cloak.timer = Math.max(cloak.timer, ABILITY_DEFINITIONS.cloak.duration);
        cloak.cooldown = Math.max(cloak.cooldown, ABILITY_DEFINITIONS.cloak.cooldown);
        this.playerFleet.isCloaked = true;
    }


    private resolveAttack(attack: Attack, toRemove: Fleet[]) {
        if (attack.target instanceof CelestialBody) {
            this.resolveMiningAttack(attack);
            return;
        }

        const winners: Fleet[] = [];
        if (attack.attacker.ships.some(ship => ship.alive)) winners.push(attack.attacker);
        if (attack.target.ships.some(ship => ship.alive)) winners.push(attack.target);

        // Reset winner states
        for (const winner of winners) {
            winner.state = 'normal';
            winner.currentTarget = null;
            winner.activeBattle = null;
        }

        // Spawn the same salvage for every destroyed fleet, regardless of
        // whether the final hit came from a moving fleet or a station.
        const dead: Fleet[] = [];
        if (!attack.attacker.ships.some(ship => ship.alive)) dead.push(attack.attacker);
        if (!attack.target.ships.some(ship => ship.alive)) dead.push(attack.target);
        for (const fleet of dead) {
            const firstLootResolution = this.spawnFleetLoot(fleet);
            if (firstLootResolution && attack.attacker === this.playerFleet && fleet === attack.target) {
                this.awardPlayerExperience(this.getFleetKillExperience(fleet));
            }
            toRemove.push(fleet);
        }
        // Money is now awarded per damage in real-time
        if (winners.includes(this.playerFleet)) {
            console.log(`Attack resolved. Player won.`);
        }

        console.log(`Attack Resolved: Winners: ${winners.length}, Losers: ${dead.length}.`);
    }

    private resolveMiningAttack(attack: Attack) {
        attack.attacker.state = 'normal';
        attack.attacker.currentTarget = null;
        attack.attacker.isMining = false;
        attack.attacker.miningTarget = null;

        if (attack.target instanceof CelestialBody) {
            attack.target.isMiningTarget = false;
            if (attack.target.miningProgress >= attack.target.miningYield) {
                this.ui.addEvent(`Mining complete: ${attack.target.name}`);
            }
        }
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
                    if (e !== this.playerFleet && !this.sensors.canRender(this.playerFleet, e)) continue;
                    // Interaction radius: at least 40 pixels on screen or 20 world units
                    const interactionRadius = Math.max(20, 40 / this.camera.zoom);
                    if (dist <= interactionRadius) {
                        closestEntity = e;
                        minDist = dist;
                    }
                } else if (e instanceof WorldEvent) {
                    if (!this.sensors.canRender(this.playerFleet, e)) continue;
                    const interactionRadius = Math.max(20, 44 / this.camera.zoom);
                    if (dist <= interactionRadius) {
                        closestEntity = e;
                        minDist = dist;
                    }
                } else if (e instanceof AbilityCrate || e instanceof ResourceCrate) {
                    if (!this.isInsidePlayerRadar(e.position)) continue;
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
        this.inspectedEntity = entity;

        this.infoTooltip = document.createElement('div');
        this.infoTooltip.className = 'entity-tooltip';
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

        const header = document.createElement('div');
        header.style.marginBottom = '8px';

        let info = '';
        let showApproach = false;
        let showContact = false;
        let showDock = false;
        let showMine = false;
        let eventContact: SensorContact | null = null;

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

            const contact = isPlayer ? null : this.sensors.getContact(this.playerFleet, fleet);
            if (!isPlayer && (!contact || contact.stale || contact.level === 'blip')) {
                info = `<strong>${contact?.stale ? 'LAST KNOWN CONTACT' : 'UNKNOWN CONTACT'}</strong><br/>`;
                info += 'Hold inside the green radar ring to classify.<br/>';
                info += contact ? `Scan: ${Math.round(contact.scanProgress * 100)}%` : 'No sensor solution';
            } else if (!isPlayer && contact?.level === 'classified') {
                const threat = contact.intel.threat || 1;
                const assessment = assessRelativeThreat(threat, this.playerFleet.threatRating);
                info = `<strong>${factionNames[contact.intel.faction || ''] || 'Classified contact'}</strong><br/>`;
                info += `Threat estimate: ≈${formatNumber(threat)} (±25%)<br/>`;
                info += `Ships estimate: ≈${contact.intel.shipCount}<br/>`;
                info += `Relative risk: ${assessment.ratio.toFixed(2)}× · ${assessment.label}<br/>`;
                info += `Scan: ${Math.round(contact.scanProgress * 100)}%`;
            } else {
                info = `<strong>${factionNames[fleet.faction] || 'Unknown'}</strong><br/>`;
                const isHostile = this.aiController.isHostile(fleet, this.playerFleet);
                const status = isHostile ? '<span style="color: red;">Hostile</span>' : '<span style="color: green;">Friendly</span>';
                info += `${status}<br/>`;
                const assessment = assessRelativeThreat(fleet.threatRating, this.playerFleet.threatRating);
                info += `Relative threat: <b>${assessment.ratio.toFixed(2)}× · ${assessment.label}</b><br/>`;
                info += `<span style="color:#9fb5c7">${assessment.risk}</span><br/>`;
                const activeShips = fleet.ships.filter(ship => ship.state === 'active').length;
                const disabledShips = fleet.ships.filter(ship => ship.state === 'disabled').length;
                info += `Threat: ${formatNumber(fleet.threatRating)}<br/>`;
                info += `Ships: ${activeShips} active / ${disabledShips} disabled<br/>`;
                info += `Readiness: ${Math.round(fleet.operationalReadiness)}% · Command: ${fleet.commandUsed}/${fleet.commandCapacity}<br/>`;
                fleet.ensureComposition();
                const defenses = fleet.ships.filter(ship => ship.alive).reduce((total, ship) => ({
                    shield: total.shield + ship.shield, maxShield: total.maxShield + ship.maxShield,
                    armor: total.armor + ship.armor, maxArmor: total.maxArmor + ship.maxArmor,
                    hull: total.hull + ship.hull, maxHull: total.maxHull + ship.maxHull
                }), { shield: 0, maxShield: 0, armor: 0, maxArmor: 0, hull: 0, maxHull: 0 });
                const damage = fleet.ships
                    .filter(ship => ship.alive && ship.order.type !== 'repair')
                    .reduce((sum, ship) => sum + ship.weaponDps * (ship.overchargeTimer > 0 ? TACTICAL_BALANCE.overchargeDamageMultiplier : 1), 0) * fleet.readinessEfficiency * fleet.energyEfficiency * COMBAT_BALANCE.damageScale;
                info += `<span style="color:#ffb86b">Damage: ${formatNumber(Math.round(damage))} DPS</span><br/>`;
                info += `<span style="color:#66ccff">Shield: ${formatNumber(Math.ceil(defenses.shield))} / ${formatNumber(Math.ceil(defenses.maxShield))}</span><br/>`;
                info += `<span style="color:#d6b26e">Armor: ${formatNumber(Math.ceil(defenses.armor))} / ${formatNumber(Math.ceil(defenses.maxArmor))}</span><br/>`;
                info += `<span style="color:#8de6bd">Hull: ${formatNumber(Math.ceil(defenses.hull))} / ${formatNumber(Math.ceil(defenses.maxHull))}</span><br/>`;
                info += `Energy: ${formatNumber(Math.ceil(fleet.totalEnergy))} / ${formatNumber(Math.ceil(fleet.maxEnergy))}<br/>`;
                info += `Fuel: ${formatNumber(Math.floor(fleet.fuel))} / ${formatNumber(Math.ceil(fleet.maxFuel))} · Supplies: ${Math.floor(fleet.supplies)}/${fleet.maxSupplies}<br/>`;
                info += `Speed: ${fleet.velocity.mag().toFixed(1)}<br/>`;
                info += `Pos: (${fleet.position.x.toFixed(0)}, ${fleet.position.y.toFixed(0)})`;
            }

            if (!isPlayer) {
                showApproach = true;
                showContact = !!contact && this.sensors.canAttack(this.playerFleet, contact);
            }
        } else if (entity instanceof WorldEvent) {
            const contact = this.sensors.getContact(this.playerFleet, entity);
            eventContact = contact;
            const definition = SIGNAL_DEFINITIONS.find(candidate => candidate.id === entity.definitionId);
            const liveContact = !!contact && !contact.stale;
            const classified = liveContact && contact.level !== 'blip';
            const identified = liveContact && contact.level === 'identified';
            if (identified) {
                info = `<strong>${contact.intel.signalTitle || entity.title}</strong><br/>`;
                info += `${(contact.intel.signalKind || entity.kind).toUpperCase()} · ${Math.ceil(entity.timeLeft)}s remaining<br/>`;
                info += `Threat: ${formatNumber(contact.intel.threat || entity.threatBudget)}<br/>`;
                if (definition) info += `Phases: ${definition.phases.join(' → ')}`;
            } else if (classified) {
                const estimate = contact.intel.threat || 1;
                info = '<strong>CLASSIFIED SIGNAL</strong><br/>';
                info += `${Math.ceil(entity.timeLeft)}s remaining<br/>`;
                info += `Risk estimate: ≈${formatNumber(estimate)} (±25%)<br/>`;
                info += `Scan: ${Math.round(contact.scanProgress * 100)}% · continue scanning for exact data`;
            } else {
                info = `<strong>${contact?.stale ? 'LAST KNOWN SIGNAL' : 'UNCLASSIFIED SIGNAL'}</strong><br/>`;
                info += 'Hold inside the green radar ring to classify.<br/>';
                info += `Scan: ${Math.round((contact?.scanProgress || 0) * 100)}%`;
            }
            const inRange = Vector2.distance(entity.position, this.playerFleet.position) <= entity.interactionRadius;
            showApproach = false;
            showContact = entity.active && liveContact && !inRange;
        } else if (entity instanceof Debris) {
            const debris = entity as Debris;
            info = `<strong>${debris.kind === 'salvage' ? 'Salvage Cache' : 'Space Debris'}</strong><br/>`;
            info += `Value: ${formatNumber(debris.value)} units<br/>`;
            info += `Pos: (${debris.position.x.toFixed(0)}, ${debris.position.y.toFixed(0)})`;
        } else if (entity instanceof AbilityCrate) {
            info = '<strong>Unknown Cache</strong><br/>Unidentified system payload. Recover it to reveal the charge.<br/>';
            info += `Pos: (${entity.position.x.toFixed(0)}, ${entity.position.y.toFixed(0)})`;
        } else if (entity instanceof ResourceCrate) {
            const title = entity.fuel > 0 && entity.supplies <= 0
                ? 'Fuel Cache'
                : entity.supplies > 0 && entity.fuel <= 0
                    ? 'Supply Cache'
                    : 'Resource Cache';
            info = `<strong>${title}</strong><br/>Fuel: ${Math.round(entity.fuel)} · Supplies: ${Math.round(entity.supplies)}<br/>`;
            info += `Pos: (${entity.position.x.toFixed(0)}, ${entity.position.y.toFixed(0)})`;
        }

        header.innerHTML = info;
        this.infoTooltip.appendChild(header);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.flexWrap = 'wrap';

        const createButton = (text: string, title: string, color: string, callback: () => void) => {
            const btn = document.createElement('button');
            btn.className = 'entity-action-btn';
            btn.textContent = text;
            btn.title = title;
            btn.style.padding = '6px 12px';
            btn.style.border = 'none';
            btn.style.borderRadius = '4px';
            btn.style.background = color;
            btn.style.color = 'white';
            btn.style.fontSize = '18px';
            btn.style.minWidth = '44px';
            btn.style.minHeight = '44px';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.style.fontFamily = 'monospace';
            bindButtonAction(btn, () => {
                callback();
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
            const eventTarget = entity instanceof WorldEvent;
            const contactBtn = createButton(eventTarget ? 'TRACK' : '🎯', eventTarget ? 'Track and inspect signal' : 'Contact/Dock (Intercept & Dock)', '#00AA00', () => {
                console.log('Contact command issued for', entity);
                this.playerFleet.setFollowTarget(entity, 'contact');
                this.closeTooltip();
                if (this.isPaused) this.togglePause();
            });
            buttonContainer.appendChild(contactBtn);
        }

        if (entity instanceof WorldEvent && entity.active && eventContact && !eventContact.stale &&
            eventContact.level === 'identified' &&
            Vector2.distance(entity.position, this.playerFleet.position) <= entity.interactionRadius) {
            const definition = SIGNAL_DEFINITIONS.find(candidate => candidate.id === entity.definitionId);
            for (const choice of definition?.choices || []) {
                const neutral = /ignore|withdraw|leave/.test(choice.id);
                const choiceBtn = createButton(choice.label, choice.label, neutral ? '#596273' : choice.dangerDelta > 0 ? '#9b443e' : '#16745d', () => {
                    this.resolveSignalChoice(entity, choice.id);
                });
                choiceBtn.style.fontSize = '13px';
                buttonContainer.appendChild(choiceBtn);
            }
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
        if (uiLayer) {
            uiLayer.appendChild(this.infoTooltip);
            this.positionTooltip(entity);
        }
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

        if (!this.sensors.canAttack(this.playerFleet, fleet)) {
            this.playerFleet.stopFollowing();
            this.ui.addEvent('Contact quality is too low. Keep the target inside radar range to classify it.');
            return;
        }

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
                    if (fleet.faction === 'civilian' || fleet.faction === 'military' || fleet.faction === 'mercenary') {
                        const detectionRadius = 2000;
                        const allFleets = [this.playerFleet, ...this.npcFleets];

                        // All military in detection radius become hostile to player
                        for (const f of allFleets) {
                            if ((f.faction === 'military' || f.faction === 'mercenary') && Vector2.distance(f.position, this.playerFleet.position) <= detectionRadius) {
                                f.hostileTo.add(this.playerFleet);
                            }
                        }

                        // All civilians larger than player in detection radius become hostile to player
                        for (const f of allFleets) {
                            if (f.faction === 'civilian' && f.threatRating > this.playerFleet.threatRating && Vector2.distance(f.position, this.playerFleet.position) <= detectionRadius) {
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

    private showFAQ() {
        if (!this.isPaused) this.togglePause();
        this.modal.showFAQDialog(() => {
            this.modal.closeModal();
            if (this.isPaused) this.togglePause();
        });
    }

    private showFleetManagement() {
        if (!this.isPaused) this.togglePause();
        this.modal.showFleetManagementDialog(
            () => ({
                money: this.playerFleet.money,
                commandUsed: this.playerFleet.commandUsed,
                commandCapacity: this.playerFleet.commandCapacity,
                level: this.playerFleet.level,
                skillPoints: this.playerFleet.skillPoints,
                skills: { ...this.playerFleet.skills },
                ships: this.playerFleet.ships.map(ship => ({
                    id: ship.id,
                    name: ship.displayName,
                    role: ship.role,
                    state: ship.state,
                    commandCost: ship.commandCost,
                    refund: Math.floor(ship.purchasePrice * 0.5),
                    threat: ship.combatRating,
                    dps: ship.weaponDps,
                    shield: ship.shield,
                    armor: ship.armor,
                    hull: ship.hull
                }))
            }),
            (id) => {
                const offer = SHOP_SHIPS.find(ship => ship.id === id);
                if (!offer) return false;
                const requirements = getShopRequirements(offer);
                if (Object.entries(requirements).some(([skill, level]) => this.playerFleet.getSkillLevel(skill as FleetSkillId) < (level || 0))) return false;
                const ship = new Ship({ ...offer.loadout, weaponIds: [...offer.loadout.weaponIds], moduleIds: [...offer.loadout.moduleIds] });
                ship.setStatScale(getShopMultiplier(offer));
                ship.variantName = offer.name;
                ship.purchasePrice = offer.price;
                if (this.playerFleet.money < offer.price || this.playerFleet.commandUsed + ship.commandCost > this.playerFleet.commandCapacity) return false;
                const previousFuelCapacity = this.playerFleet.maxFuel;
                this.playerFleet.money -= offer.price;
                this.playerFleet.ships.push(ship);
                this.playerFleet.addFuel(Math.max(0, this.playerFleet.maxFuel - previousFuelCapacity));
                this.ui.updateMoney(this.playerFleet.money);
                this.ui.updateFleet(this.playerFleet);
                this.saveGame();
                return true;
            },
            (skill: FleetSkillId) => {
                const learned = this.playerFleet.learnSkill(skill);
                if (learned) {
                    this.ui.updateFleet(this.playerFleet);
                    this.saveGame();
                }
                return learned;
            },
            (id: string) => {
                if (this.playerFleet.ships.length <= 1) return false;
                const index = this.playerFleet.ships.findIndex(ship => ship.id === id);
                if (index < 0) return false;
                const ship = this.playerFleet.ships[index];
                const refund = Math.floor(ship.purchasePrice * 0.5);
                this.playerFleet.ships.splice(index, 1);
                this.playerFleet.fuel = Math.min(this.playerFleet.fuel, this.playerFleet.maxFuel);
                if (this.playerFleet.selectedShipId === ship.id) {
                    this.playerFleet.selectedShipId = this.playerFleet.ships.find(candidate => candidate.role === 'flagship' && candidate.alive)?.id || this.playerFleet.ships[0]?.id || null;
                }
                this.playerFleet.money += refund;
                this.ui.updateMoney(this.playerFleet.money);
                this.ui.updateFleet(this.playerFleet);
                this.saveGame();
                return true;
            },
            () => {
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            }
        );
    }

    private showTerraUpgradeDialog() {
        console.log('Showing Terra upgrade dialog');
        // Docking freely recharges non-consumable layers; structural work and
        // expedition resources remain behind the explicit quoted service.
        RepairService.restoreAtStation(this.playerFleet);

        // Ensure game is paused while dialog is open
        if (!this.isPaused) {
            this.togglePause();
        }

        this.modal.showTerraUpgradeDialog(
            () => {
                const levelProgress = Math.max(0, this.playerFleet.totalMoneyEarned - this.playerFleet.levelThreshold);
                const levelNeeded = Math.max(1, this.playerFleet.nextLevelThreshold - this.playerFleet.levelThreshold);
                return {
                    currentStrength: this.playerFleet.threatRating,
                    currentMaxStrength: this.playerFleet.threatRating,
                    currentMoney: this.playerFleet.money,
                    commandUsed: this.playerFleet.commandUsed,
                    commandCapacity: this.playerFleet.commandCapacity,
                    shipCost: 600 + this.playerFleet.ships.length * 150,
                    levelInfo: `Level ${this.playerFleet.level} (${formatNumber(levelProgress)}/${formatNumber(levelNeeded)} this level)`,
                    mercenaryCount: this.npcFleets.filter(f => f.faction === 'mercenary').length,
                    mercenaryMax: this.playerFleet.level + 5,
                    mercenaryCost: Math.max(100, this.playerFleet.threatRating * 10),
                    abilityCharges: this.captureAbilityCharges(),
                    abilityChargeTotal: this.playerFleet.abilityChargesUsed,
                    abilityChargeCapacity: this.playerFleet.abilityChargeCapacity,
                    serviceQuote: RepairService.quoteStationService(this.playerFleet)
                };
            },
            () => {
                // Terra opens the full shipyard instead of buying a random hull.
                this.showFleetManagement();
                return true;
            },
            () => {
                console.log('Terra upgrade cancelled');
                // Close modal and unpause
                this.modal.closeModal();
                if (this.isPaused) this.togglePause();
            },
            // Ability Purchase Logic
            (abilityId: string) => {
                const id = abilityId as FleetAbilityId;
                if (this.playerFleet.abilities[id]
                    && this.playerFleet.money >= ABILITY_EQUIPMENT_MARKET.buyPrice
                    && this.playerFleet.abilityChargesUsed < this.playerFleet.abilityChargeCapacity
                    && this.playerFleet.addAbilityCharge(id) > 0) {
                    this.playerFleet.money -= ABILITY_EQUIPMENT_MARKET.buyPrice;
                    this.ui.updateMoney(this.playerFleet.money);
                    this.ui.updateAbilities(this.playerFleet);
                    SaveSystem.saveAutosaveFleetAbilityCharges(this.captureAbilityCharges());
                    this.saveGame();
                    return true;
                }
                return false;
            },
            (abilityId: string) => {
                const id = abilityId as FleetAbilityId;
                if (this.playerFleet.removeAbilityCharge(id) > 0) {
                    this.playerFleet.money += ABILITY_EQUIPMENT_MARKET.sellPrice;
                    this.ui.updateMoney(this.playerFleet.money);
                    this.ui.updateAbilities(this.playerFleet);
                    SaveSystem.saveAutosaveFleetAbilityCharges(this.captureAbilityCharges());
                    this.saveGame();
                    return true;
                }
                return false;
            },
            () => {
                const currentCount = this.npcFleets.filter(f => f.faction === 'mercenary').length;
                const maxCount = this.playerFleet.level + 5;
                const cost = Math.max(100, this.playerFleet.threatRating * 10);
                if (currentCount >= maxCount || this.playerFleet.money < cost) return false;

                const fleets = this.systemManager.spawnFleetsForSystem(
                    this.currentSystemId,
                    this.playerFleet.threatRating,
                    this.npcFleets,
                    this.difficultyMultiplier,
                    'mercenary',
                    this.playerFleet.level,
                    this.signalDirector.systemDanger
                );

                if (fleets.length === 0) return false;

                this.playerFleet.money -= cost;
                this.ui.updateMoney(this.playerFleet.money);
                this.entities.push(...fleets);
                this.npcFleets.push(...fleets);
                return true;
            },
            (mode: StationServiceMode) => {
                const result = RepairService.purchaseStationService(this.playerFleet, mode);
                if (result.ok) {
                    this.ui.updateMoney(this.playerFleet.money);
                    this.ui.updateFleet(this.playerFleet);
                    this.ui.addEvent(result.cost > 0
                        ? `Terra ${mode} service: ${formatNumber(result.cost)} credits${result.partial ? ' (partial budget)' : ''}.`
                        : 'Terra recharged shields and Energy for free.');
                    this.saveGame();
                }
                return result;
            }
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
                this.playerFleet.commandCapacity += 3;
                this.playerFleet.maxSupplies += 10;
                this.playerFleet.supplies = this.playerFleet.maxSupplies;
                this.awardPlayerMoney(5000);
                body.rewardCollected = true;
                body.pulsing = false; // Stop pulsing after collection
                this.ui.updateStrength(this.playerFleet.threatRating);
                console.log('Liberation reward collected: command and supply capacity, +$5000');
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



    private positionTooltip(entity: Entity) {
        if (!this.infoTooltip) return;
        const screenPos = this.camera.worldToScreen(entity.position);
        const rect = this.infoTooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const maxLeft = Math.max(8, viewportWidth - rect.width - 8);
        const maxTop = Math.max(8, viewportHeight - rect.height - 8);
        const left = Math.max(8, Math.min(screenPos.x + 20, maxLeft));
        const top = Math.max(8, Math.min(screenPos.y - 30, maxTop));
        this.infoTooltip.style.left = `${left}px`;
        this.infoTooltip.style.top = `${top}px`;
    }

    private draw() {
        this.renderer.clear();
        this.drawBackground();

        const ctx = this.renderer.getContext();
        this.drawRadarOverlay(ctx);
        for (const e of this.entities) {
            // Loot has no fleet signature, so it is not tracked as a normal
            // SensorService contact. It still obeys the player's nominal
            // radar envelope and must not be visible through unexplored space.
            if ((e instanceof Debris || e instanceof AbilityCrate || e instanceof ResourceCrate)
                && !this.isInsidePlayerRadar(e.position)) continue;
            if (e instanceof Fleet && e !== this.playerFleet) {
                const contact = this.sensors.getContact(this.playerFleet, e);
                if (!contact) continue;
                if (contact.stale && !this.sensors.canRender(this.playerFleet, contact)) continue;
                if (contact.stale || contact.level === 'blip') {
                    this.drawSensorBlip(ctx, contact);
                    continue;
                }
            }
            if (e instanceof WorldEvent) {
                const contact = this.sensors.getContact(this.playerFleet, e);
                if (!contact) continue;
                if (contact.stale || contact.level === 'blip') {
                    this.drawSensorBlip(ctx, contact);
                    continue;
                }
                if (contact.level === 'classified') {
                    this.drawClassifiedSignal(ctx, contact);
                    continue;
                }
            }
            e.draw(ctx, this.camera);
        }
        this.combatEffects.draw(ctx, this.camera);
        this.drawTacticalRadar(ctx);
        this.drawPlayerReticle(ctx);

        // Threat rings are deliberately separate from the ship silhouette:
        // hull shape communicates role, ring color communicates danger.
        const threatReference = Math.max(1, this.playerFleet.threatRating);
        for (const fleet of [this.playerFleet, ...this.npcFleets]) {
            if (fleet !== this.playerFleet) {
                const contact = this.sensors.getContact(this.playerFleet, fleet);
                if (!contact || contact.stale || contact.level !== 'identified') continue;
            }
            fleet.drawThreatIndicator(ctx, this.camera, threatReference);
        }

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
        const playerSensorRange = this.getFleetSensorRange(this.playerFleet);
        for (const bubble of this.bubbleZones) {
            if (bubble.owner && bubble.owner !== this.playerFleet) {
                const contact = this.sensors.getContact(this.playerFleet, bubble.owner);
                const distanceToBubble = Vector2.distance(this.playerFleet.position, bubble.position);
                const playerInside = bubble.isDeployed && distanceToBubble <= bubble.radius;
                const bubbleTouchesRadar = distanceToBubble <= playerSensorRange + bubble.radius;
                // A hidden or out-of-range owner must not make an active hazard
                // invisible. Render it when the zone affects the player or
                // touches the current radar envelope; otherwise keep distant
                // enemy bubbles hidden.
                if ((!contact || contact.stale) && !playerInside && !bubbleTouchesRadar) continue;
            }
            bubble.draw(ctx, this.camera);
        }

        // Draw Mines
        for (const mine of this.mines) {
            if (mine.owner !== this.playerFleet) {
                const contact = this.sensors.getContact(this.playerFleet, mine.owner);
                if (!contact || contact.stale) continue;
            }
            mine.draw(ctx, this.camera);
        }

        const allFleets = [this.playerFleet, ...this.npcFleets];
        for (const fleet of allFleets) {
            if (fleet !== this.playerFleet && !this.sensors.canRender(this.playerFleet, fleet)) continue;
            if (fleet.followTarget instanceof Fleet && fleet.followTarget !== this.playerFleet &&
                !this.sensors.canRender(this.playerFleet, fleet.followTarget)) continue;
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
                const r = 8;
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

        if (this.inspectedEntity) this.positionTooltip(this.inspectedEntity);
    }

    private isInsidePlayerRadar(position: Vector2): boolean {
        if (!this.playerFleet) return false;
        return Vector2.distance(this.playerFleet.position, position)
            <= this.getFleetSensorRange(this.playerFleet);
    }

    private drawRadarOverlay(ctx: CanvasRenderingContext2D) {
        const profile = this.sensors.getFleetProfile(this.playerFleet, this.gameClock);
        const radarRange = this.getFleetSensorRange(this.playerFleet);
        if (radarRange <= 0) return;
        const center = this.camera.worldToScreen(this.playerFleet.position);
        const radius = radarRange * this.camera.zoom;
        ctx.save();
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = profile.scanPulseActive ? 'rgba(80,255,145,.07)' : 'rgba(80,255,145,.025)';
        ctx.strokeStyle = profile.scanPulseActive ? 'rgba(100,255,160,.65)' : 'rgba(100,255,160,.28)';
        ctx.lineWidth = profile.scanPulseActive ? 2 : 1;
        ctx.setLineDash(profile.scanPulseActive ? [] : [7, 9]);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(125,255,175,.72)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`RADAR ${Math.round(radarRange)}${profile.scanPulseActive ? ' · PULSE' : ''}`, center.x + 12, center.y - radius + 16);
        ctx.restore();
    }

    private drawSensorBlip(ctx: CanvasRenderingContext2D, contact: SensorContact) {
        // Sensor updates run at 10 Hz. Extrapolate the last known signal for a
        // fraction of a second so blips glide between sensor ticks instead of
        // teleporting every update.
        const prediction = Math.min(0.35, Math.max(0, this.gameClock - contact.lastSeenAt));
        const smoothPosition = new Vector2(
            contact.lastKnownPosition.x + contact.lastKnownVelocity.x * prediction,
            contact.lastKnownPosition.y + contact.lastKnownVelocity.y * prediction
        );
        const screen = this.camera.worldToScreen(smoothPosition);
        const alpha = contact.stale ? 0.28 : 0.75;
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = `rgba(180,205,215,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.fillStyle = `rgba(190,215,225,${alpha})`;
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(contact.stale ? 'LAST CONTACT' : 'UNKNOWN', 0, 22);
        ctx.restore();
    }

    private drawClassifiedSignal(ctx: CanvasRenderingContext2D, contact: SensorContact) {
        const screen = this.camera.worldToScreen(new Vector2(contact.lastKnownPosition.x, contact.lastKnownPosition.y));
        const pulse = 11 + Math.sin(this.gameClock * 3) * 2;
        const estimate = contact.intel.threat || 1;
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.strokeStyle = 'rgba(116,214,190,.8)';
        ctx.fillStyle = 'rgba(70,190,160,.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, pulse + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(150,235,215,.9)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CLASSIFIED SIGNAL', 0, -pulse - 12);
        ctx.fillText(`RISK ≈${formatNumber(estimate)} ±25%`, 0, pulse + 18);
        ctx.restore();
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

    /** Compact tactical scope inspired by cockpit HUDs; the simulation still
     * uses the full sensor service and this is only a visual projection. */
    private drawTacticalRadar(ctx: CanvasRenderingContext2D) {
        const { width } = this.renderer.getDimensions();
        const profile = this.sensors.getFleetProfile(this.playerFleet, this.gameClock);
        const radius = Math.min(92, Math.max(66, width * 0.075));
        const cx = width - radius - 24;
        const cy = 86 + radius;
        const range = Math.max(900, profile.sensorRange * 2.5);

        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = 'rgba(3, 13, 22, .52)';
        ctx.beginPath(); ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(157, 232, 255, .55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(110, 194, 221, .18)';
        ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();

        const sweep = this.gameClock * 0.65;
        const sweepGradient = ctx.createConicGradient(sweep, cx, cy);
        sweepGradient.addColorStop(0, 'rgba(115, 235, 255, .22)');
        sweepGradient.addColorStop(0.08, 'rgba(115, 235, 255, 0)');
        sweepGradient.addColorStop(1, 'rgba(115, 235, 255, 0)');
        ctx.fillStyle = sweepGradient;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, sweep, sweep + Math.PI * 0.8); ctx.closePath(); ctx.fill();

        for (const fleet of this.npcFleets) {
            const contact = this.sensors.getContact(this.playerFleet, fleet);
            if (!contact || contact.stale || !this.sensors.canRender(this.playerFleet, fleet)) continue;
            const dx = fleet.position.x - this.playerFleet.position.x;
            const dy = fleet.position.y - this.playerFleet.position.y;
            const distance = Math.hypot(dx, dy);
            if (distance > range) continue;
            const px = cx + (dx / range) * radius;
            const py = cy + (dy / range) * radius;
            const blipColor = fleet.isPlayer ? '#7ff4ff' : fleet.color;
            ctx.fillStyle = blipColor;
            ctx.shadowColor = blipColor;
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(px, py, contact.level === 'identified' ? 2.4 : 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.fillStyle = '#7ff4ff';
        ctx.shadowColor = '#7ff4ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(183, 239, 255, .85)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`SCOPE ${Math.round(profile.sensorRange)}`, cx + radius, cy + radius + 17);
        ctx.restore();
    }

    private drawPlayerReticle(ctx: CanvasRenderingContext2D) {
        const screen = this.camera.worldToScreen(this.playerFleet.position);
        const { width, height } = this.renderer.getDimensions();
        if (screen.x < -40 || screen.x > width + 40 || screen.y < -40 || screen.y > height + 40) return;
        const pulse = 0.5 + Math.sin(this.gameClock * 2.4) * 0.15;
        const radius = 18 + Math.sin(this.gameClock * 1.7) * 2;
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.strokeStyle = `rgba(151, 240, 255, ${pulse})`;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'square';
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(-radius, -radius * 0.45); ctx.lineTo(-radius, -radius); ctx.lineTo(-radius * 0.45, -radius);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(216, 250, 255, .95)';
        ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    private drawBackground() {
        const ctx = this.renderer.getContext();
        const { width, height } = this.renderer.getDimensions();
        ctx.drawImage(this.backgroundCanvas, 0, 0, width, height);

        ctx.strokeStyle = 'rgba(155, 219, 235, 0.008)';
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

            const beltInnerRadius = this.getAsteroidBeltInnerRadius() * this.camera.zoom;
            const beltWidth = Math.max(1, radius - beltInnerRadius);

            // The outer belt is a visible, navigable boundary rather than a
            // hard despawn ring. Its particles are deterministic so the map
            // does not shimmer between frames.
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius - beltWidth * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(191, 145, 82, 0.08)';
            ctx.lineWidth = Math.max(8, beltWidth);
            ctx.stroke();

            ctx.setLineDash([10 * this.camera.zoom, 18 * this.camera.zoom]);
            ctx.beginPath();
            ctx.arc(center.x, center.y, beltInnerRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(220, 180, 110, 0.18)';
            ctx.lineWidth = Math.max(1, 1.5 * this.camera.zoom);
            ctx.stroke();

            for (let i = 0; i < 96; i++) {
                const seed = i * 12.9898;
                const angle = (i / 96) * Math.PI * 2 + (Math.sin(seed) * 0.08);
                const radial = beltInnerRadius + beltWidth * (0.12 + (Math.sin(seed * 1.73) * 0.5 + 0.5) * 0.76);
                const asteroidX = center.x + Math.cos(angle) * radial;
                const asteroidY = center.y + Math.sin(angle) * radial;
                const asteroidSize = Math.max(0.8, (1.5 + (Math.sin(seed * 2.41) * 0.5 + 0.5) * 4) * this.camera.zoom);
                ctx.beginPath();
                ctx.arc(asteroidX, asteroidY, asteroidSize, 0, Math.PI * 2);
                ctx.fillStyle = i % 3 === 0 ? 'rgba(230, 190, 125, 0.42)' : 'rgba(145, 115, 80, 0.28)';
                ctx.fill();
            }
            ctx.setLineDash([]);

            // Outer glow / "Danger Zone"
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.05)';
            ctx.lineWidth = 20 * this.camera.zoom;
            ctx.stroke();

            // Main boundary line
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.setLineDash([20 * this.camera.zoom, 20 * this.camera.zoom]);
            ctx.strokeStyle = 'rgba(185, 231, 244, 0.08)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Internal markers/ticks
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.025)';
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

        // A soft cockpit vignette keeps attention on the fleet and gives the
        // scene a rendered, rather than editor-grid, finish.
        const palette = this.getSectorVisualPalette();
        const vignette = ctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.14, width * 0.5, height * 0.48, Math.max(width, height) * 0.78);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(0.72, 'rgba(0, 4, 10, .08)');
        vignette.addColorStop(1, 'rgba(0, 3, 9, .58)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = `rgba(${palette.starTint[0]}, ${palette.starTint[1]}, ${palette.starTint[2]}, .07)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, width - 20, height - 20);
    }

    private warpToSystem(targetSystemId: number, expeditionSnapshot?: ProgressionState, spawnProtection = false) {
        console.log(`Warping from System ${this.currentSystemId} to System ${targetSystemId}...`);

        // Store player fleet state before transition
        const playerShips = this.playerFleet.ships.map(ship => ship.snapshot());
        const commandCapacity = this.playerFleet.commandCapacity;
        const fuel = this.playerFleet.fuel;
        const supplies = this.playerFleet.supplies;
        const maxSupplies = this.playerFleet.maxSupplies;
        const readiness = this.playerFleet.operationalReadiness;
        const doctrine = { ...this.playerFleet.doctrine };
        const skillPoints = this.playerFleet.skillPoints;
        const skills = { ...this.playerFleet.skills };
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
        const protectedHomeArrival = spawnProtection && targetSystemId === 1;
        this.initWorld(
            this.playerFleet.threatRating,
            targetSystemId,
            protectedHomeArrival ? undefined : spawnNearGate,
            playerProgress,
            playerCharges,
            expeditionSnapshot || this.expedition.snapshot,
            spawnProtection
        );

        // Restore player fleet state
        this.playerFleet.ships = playerShips.map(snapshot => Ship.fromSnapshot(snapshot));
        this.playerFleet.selectedShipId = this.playerFleet.ships.find(ship => ship.role === 'flagship')?.id || this.playerFleet.ships[0]?.id || null;
        this.playerFleet.commandCapacity = commandCapacity;
        this.playerFleet.fuel = Math.min(fuel, this.playerFleet.maxFuel);
        this.playerFleet.supplies = supplies;
        this.playerFleet.maxSupplies = maxSupplies;
        this.playerFleet.setReadiness(readiness);
        this.playerFleet.doctrine = doctrine;
        this.playerFleet.skillPoints = skillPoints;
        this.playerFleet.skills = skills;
        this.playerFleet.money = playerMoney;
        this.applyExpeditionEffects();

        // Update UI
        this.ui.updateMoney(this.playerFleet.money);
        this.saveGame();

        console.log(`Successfully warped to System ${targetSystemId}!`);
    }

    private activateAbility(id: string) {
        if (id === 'scan') {
            const result = AbilityService.activateScanPulse(this.playerFleet, this.sensors, this.gameClock);
            this.ui.addEvent(result.ok ? 'Active scan pulse: radar range doubled; our signature is exposed.' : result.reason || 'Scan failed.');
            return;
        }
        if (!(id in this.playerFleet.abilities)) return;
        const abilityId = id as FleetAbilityId;
        const result = AbilityService.activate(this.playerFleet, abilityId);
        if (!result.ok) {
            this.ui.addEvent(result.reason || `${id} cannot be activated.`);
            return;
        }
        if (abilityId === 'mine') {
            this.mines.push(new WarpMine(this.playerFleet.position.x, this.playerFleet.position.y, this.playerFleet));
        } else if (abilityId === 'bubble') {
            this.bubbleZones.push(new BubbleZone(this.playerFleet.position.x, this.playerFleet.position.y, 200, 8, 0.2, this.playerFleet));
        }
        this.ui.updateAbilities(this.playerFleet);
        this.ui.updateFleet(this.playerFleet);
    }

    public dropWarpMine(owner: Fleet): boolean {
        const result = AbilityService.activate(owner, 'mine');
        if (!result.ok) return false;
        const mine = new WarpMine(owner.position.x, owner.position.y, owner);
        this.mines.push(mine);
        return true;
    }

    public activateNpcAbility(owner: Fleet, id: 'afterburner' | 'cloak' | 'bubble' | 'net'): boolean {
        const result = AbilityService.activate(owner, id);
        if (!result.ok) return false;
        if (id === 'bubble') this.bubbleZones.push(new BubbleZone(owner.position.x, owner.position.y, 200, 8, 0.2, owner));
        return true;
    }
}
