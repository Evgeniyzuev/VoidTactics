import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Entity } from '../entities/Entity';
import { SaveSystem } from './SaveSystem';
import { UIManager } from './UIManager';

export class Game {
    private lastTime: number = 0;
    private renderer: Renderer;
    private input: InputManager;
    private camera: Camera;
    private ui: UIManager;

    // Entities
    private entities: Entity[] = [];
    private playerFleet!: Fleet;
    private npcFleets: Fleet[] = [];

    private backgroundCanvas: HTMLCanvasElement;

    // Time Control
    private isPaused: boolean = false;
    private timeScale: number = 1;
    private wasMovingLastFrame: boolean = false;
    private moveMode: boolean = true; // Movement mode vs Inspect mode
    private infoTooltip: HTMLDivElement | null = null;
    private cameraFollow: boolean = true;
    private isDragging: boolean = false;
    private lastMousePos: Vector2 = new Vector2(0, 0);

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
            onMoveModeToggle: (enabled) => this.setMoveMode(enabled),
            onCameraToggle: (follow) => this.setCameraFollow(follow)
        });

        // Start loop
        requestAnimationFrame((t) => this.loop(t));

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

    private setMoveMode(enabled: boolean) {
        this.moveMode = enabled;
        if (this.infoTooltip) {
            this.infoTooltip.remove();
            this.infoTooltip = null;
        }
    }

    private setCameraFollow(follow: boolean) {
        this.cameraFollow = follow;
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
            ctx.fillRect(0, 0, width, height); // Fill whole rect to ensure overlap works? actually arc is better but rect is fine for gradient
        }
    }

    private initWorld() {
        // 1. Static World (Planets/Stars) - Always create these
        // Star
        const star = new CelestialBody(0, 0, 150, '#FFD700', 'Sol', true);
        this.entities.push(star);

        // Planets
        const terra = new CelestialBody(800, 0, 40, '#00CED1', 'Terra');
        this.entities.push(terra);

        // Moons for Terra
        this.entities.push(new CelestialBody(860, 0, 10, '#AAAAAA', 'Luna'));

        // Mars-like
        this.entities.push(new CelestialBody(-1200, 400, 60, '#FF4500', 'Marsish'));

        // Gas Giant
        this.entities.push(new CelestialBody(400, -1500, 110, '#DEB887', 'Jupit'));

        // Asteroid Belt (Random)
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2000 + Math.random() * 500;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const size = 5 + Math.random() * 15;
            this.entities.push(new CelestialBody(x, y, size, '#888888', 'Asteroid'));
        }

        // Space Station
        this.entities.push(new CelestialBody(-600, -600, 20, '#FF00FF', 'Outpost Alpha'));

        // 2. Dynamic Entities (Fleets) - Try to load from Save
        const saveData = SaveSystem.load();

        if (saveData) {
            console.log('Loading Save Game...');
            // Load Player
            const pData = saveData.player;
            this.playerFleet = new Fleet(pData.x, pData.y, pData.color, true);
            this.playerFleet.velocity = new Vector2(pData.vx, pData.vy);
            this.entities.push(this.playerFleet);

            // Load NPCs
            for (const nData of saveData.npcs) {
                const npc = new Fleet(nData.x, nData.y, nData.color, false);
                npc.velocity = new Vector2(nData.vx, nData.vy);
                this.entities.push(npc);
                this.npcFleets.push(npc);
            }
        } else {
            console.log('Starting New Game...');
            // Player
            this.playerFleet = new Fleet(500, 500, '#00AAFF', true);
            this.entities.push(this.playerFleet);

            // NPC Fleets (Civilian Traffic)
            const npcColors = ['#FFA500', '#32CD32', '#9370DB', '#FF69B4', '#FFFF00'];
            for (let i = 0; i < 20; i++) {
                const startX = (Math.random() - 0.5) * 4000;
                const startY = (Math.random() - 0.5) * 4000;
                const color = npcColors[i % npcColors.length];
                const npc = new Fleet(startX, startY, color, false);
                this.entities.push(npc);
                this.npcFleets.push(npc);
            }
        }

        // Auto-Save Interval (5 seconds)
        setInterval(() => {
            SaveSystem.save(this.playerFleet, this.npcFleets);
        }, 5000);
    }

    private loop(timestamp: number) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Handle Zoom (Wheel or Pinch)
        const wheelDelta = this.input.getWheelDelta();
        const pinchDelta = this.input.getPinchDelta();
        if (wheelDelta !== 0) {
            this.camera.adjustZoom(wheelDelta);
        }
        if (pinchDelta !== 0) {
            this.camera.adjustZoom(pinchDelta);
        }

        // Handle Input (Always, even when paused)
        if (this.input.isMouseDown) {
            const clickPos = new Vector2(this.input.mousePos.x, this.input.mousePos.y);

            if (!this.cameraFollow && !this.isDragging) {
                // Start dragging for camera pan
                this.isDragging = true;
                this.lastMousePos = clickPos;
            } else if (this.isDragging) {
                // Continue dragging
                const delta = clickPos.sub(this.lastMousePos);
                this.camera.pan(-delta.x, -delta.y);
                this.lastMousePos = clickPos;
            } else {
                // Normal click interactions
                const worldTarget = this.camera.screenToWorld(clickPos);
                const isDoubleClick = this.input.isDoubleClick();

                if (this.moveMode || isDoubleClick) {
                    // Movement Mode OR Double-click in inspect mode: Issue move command
                    this.playerFleet.setTarget(worldTarget);

                    // Resume if paused
                    if (this.isPaused) {
                        this.togglePause();
                    }
                } else {
                    // Inspect Mode (single click): Find clicked object and show info
                    this.inspectObject(worldTarget);
                }
            }
        } else {
            // Mouse released
            this.isDragging = false;
        }

        if (!this.isPaused) {
            this.update(dt);
        }
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    private update(dt: number) {
        // Apply time scale
        dt = dt * this.timeScale;

        // 1. AI Logic (Simple Patrol)
        const celestialBodies = this.entities.filter(e => e instanceof CelestialBody) as CelestialBody[];
        for (const npc of this.npcFleets) {
            // If idle (no target and stopped)
            if (!npc.target && npc.velocity.mag() < 5) {
                // Pick random destination
                // 1% chance per frame to start moving if idle, so they don't all move instantly
                if (Math.random() < 0.01 && celestialBodies.length > 0) {
                    const destBody = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                    // Fly to near the body, not inside it
                    const offset = new Vector2((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
                    const dest = destBody.position.add(offset);
                    npc.setTarget(dest);
                }
            }
        }

        // 3. Update Entities
        for (const e of this.entities) {
            e.update(dt);
        }

        // 4. Update Camera to follow player
        if (this.cameraFollow) {
            // Smooth follow
            const camTarget = this.playerFleet.position;
            // Simple lerp: cam = cam + (target - cam) * speed * dt
            const lerpSpeed = 5.0;
            const diff = camTarget.sub(this.camera.position);
            this.camera.position = this.camera.position.add(diff.scale(lerpSpeed * dt));
        }

        // 5. Auto-pause when player fleet stops
        const isMoving = this.playerFleet.velocity.mag() > 1;
        if (this.wasMovingLastFrame && !isMoving && !this.playerFleet.target) {
            // Just stopped and has no target
            if (!this.isPaused) {
                this.togglePause();
            }
        }
        this.wasMovingLastFrame = isMoving;
    }

    private inspectObject(worldPos: Vector2) {
        // Find entity near clicked position
        let closestEntity: Entity | null = null;
        let minDist = 100; // Click threshold in world units

        for (const e of this.entities) {
            const dist = Vector2.distance(e.position, worldPos);
            if (dist < minDist) {
                if (e instanceof CelestialBody) {
                    // Check if click is within radius
                    if (dist <= (e as CelestialBody).radius) {
                        closestEntity = e;
                        minDist = dist;
                    }
                } else if (e instanceof Fleet) {
                    if (dist <= 20) { // Fleet selection radius
                        closestEntity = e;
                        minDist = dist;
                    }
                }
            }
        }

        if (closestEntity) {
            this.showTooltip(closestEntity, worldPos);
        } else {
            // Clear tooltip if clicking empty space
            if (this.infoTooltip) {
                this.infoTooltip.remove();
                this.infoTooltip = null;
            }
        }
    }

    private showTooltip(entity: Entity, worldPos: Vector2) {
        // Remove old tooltip
        if (this.infoTooltip) {
            this.infoTooltip.remove();
        }

        // Create tooltip
        this.infoTooltip = document.createElement('div');
        this.infoTooltip.style.position = 'absolute';
        this.infoTooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        this.infoTooltip.style.color = 'white';
        this.infoTooltip.style.padding = '10px 15px';
        this.infoTooltip.style.borderRadius = '8px';
        this.infoTooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        this.infoTooltip.style.pointerEvents = 'none';
        this.infoTooltip.style.fontSize = '14px';
        this.infoTooltip.style.fontFamily = 'monospace';
        this.infoTooltip.style.zIndex = '1000';

        // Get screen position
        const screenPos = this.camera.worldToScreen(entity.position);
        this.infoTooltip.style.left = (screenPos.x + 20) + 'px';
        this.infoTooltip.style.top = (screenPos.y - 30) + 'px';

        // Fill content
        let content = '';
        if (entity instanceof CelestialBody) {
            const body = entity as CelestialBody;
            content = `<strong>${body.name}</strong><br/>`;
            content += body.isStar ? '⭐ Star<br/>' : '🌍 Planet<br/>';
            content += `Radius: ${body.radius.toFixed(0)}`;
        } else if (entity instanceof Fleet) {
            const fleet = entity as Fleet;
            const isPlayer = fleet === this.playerFleet;
            content = `<strong>${isPlayer ? 'Player Fleet' : 'NPC Fleet'}</strong><br/>`;
            content += `Speed: ${fleet.velocity.mag().toFixed(1)}<br/>`;
            content += `Pos: (${fleet.position.x.toFixed(0)}, ${fleet.position.y.toFixed(0)})`;
        }

        this.infoTooltip.innerHTML = content;

        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) {
            uiLayer.appendChild(this.infoTooltip);
        }
    }

    private draw() {
        this.renderer.clear();

        // Draw Background
        this.drawBackground();

        const ctx = this.renderer.getContext();

        // Draw Entities
        for (const e of this.entities) {
            e.draw(ctx, this.camera);
        }

        // Debug UI
        // ctx.fillStyle = 'white';
        // ctx.font = '14px monospace';
        // ctx.fillText(`Pos: ${Math.round(this.playerFleet.position.x)}, ${Math.round(this.playerFleet.position.y)}`, 10, 20);
    }

    private drawBackground() {
        const ctx = this.renderer.getContext();
        const { width, height } = this.renderer.getDimensions();

        // Draw the generated offscreen canvas
        // We can implement simple parallax if we generate it slightly larger, but for now fixed
        ctx.drawImage(this.backgroundCanvas, 0, 0, width, height);

        // Overlay Grid (fainter)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;

        // Grid Spacing
        const gridSize = 500;
        // Find visible range
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
}
