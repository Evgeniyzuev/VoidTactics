import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Entity } from '../entities/Entity';
import { SaveSystem } from './SaveSystem';
import { UIManager } from './UIManager';
import { ModalManager } from './ModalManager';

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
            onCameraToggle: (follow) => this.setCameraFollow(follow)
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
            this.entities.push(this.playerFleet);

            if (saveData.npcs && saveData.npcs.length > 0) {
                for (const nData of saveData.npcs) {
                    const npc = new Fleet(nData.x, nData.y, nData.color, false);
                    npc.velocity = new Vector2(nData.vx, nData.vy);
                    this.entities.push(npc);
                    this.npcFleets.push(npc);
                }
            } else {
                this.spawnNPCs();
            }
        } else {
            console.log('Starting New Game...');
            this.playerFleet = new Fleet(500, 500, '#00AAFF', true);
            this.entities.push(this.playerFleet);
            this.spawnNPCs();
        }
    }

    private spawnNPCs() {
        const npcColors = ['#FFA500', '#32CD32', '#9370DB', '#FF69B4', '#FFFF00'];
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const distance = 800 + Math.random() * 700;
            const startX = 500 + Math.cos(angle) * distance;
            const startY = 500 + Math.sin(angle) * distance;
            const color = npcColors[i % npcColors.length];
            const npc = new Fleet(startX, startY, color, false);
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

            if (!this.cameraFollow && !this.isDragging) {
                this.isDragging = true;
                this.lastMousePos = clickPos;
            } else if (this.isDragging) {
                const delta = clickPos.sub(this.lastMousePos);
                this.camera.pan(-delta.x, -delta.y);
                this.lastMousePos = clickPos;
            } else {
                const worldTarget = this.camera.screenToWorld(clickPos);
                const isDoubleClick = this.input.isDoubleClick();

                if (isDoubleClick) {
                    this.playerFleet.setTarget(worldTarget);
                    if (this.isPaused) this.togglePause();
                    this.closeTooltip();
                } else {
                    this.inspectObject(worldTarget);
                }
            }
        } else {
            this.isDragging = false;
        }

        if (!this.isPaused) {
            this.update(dt);
        }
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    private update(dt: number) {
        dt = dt * this.timeScale;

        const celestialBodies = this.entities.filter(e => e instanceof CelestialBody) as CelestialBody[];
        for (const npc of this.npcFleets) {
            if (!npc.target && npc.velocity.mag() < 5) {
                if (Math.random() < 0.01 && celestialBodies.length > 0) {
                    const destBody = celestialBodies[Math.floor(Math.random() * celestialBodies.length)];
                    const offset = new Vector2((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
                    const dest = destBody.position.add(offset);
                    npc.setTarget(dest);
                }
            }
        }

        for (const e of this.entities) {
            e.update(dt);
        }

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
        if (this.wasMovingLastFrame && !isMoving && !this.playerFleet.target) {
            if (!this.isPaused) this.togglePause();
        }
        this.wasMovingLastFrame = isMoving;
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
            info = `<strong>${isPlayer ? 'Player Fleet' : 'NPC Fleet'}</strong><br/>`;
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
        console.log(`Initiating contact with fleet at ${fleet.position.x}, ${fleet.position.y}`);

        this.modal.showContactDialog(
            () => {
                console.log('Establishing communication with fleet...');
                alert('Связь установлена! (Функция в разработке)');
            },
            () => {
                console.log('Initiating battle...');
                this.modal.showBattleScreen(() => {
                    console.log('Battle ended');
                });
            },
            () => {
                console.log('Contact cancelled');
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

        if (this.playerFleet.followTarget) {
            const playerPos = this.camera.worldToScreen(this.playerFleet.position);
            const targetPos = this.camera.worldToScreen(this.playerFleet.followTarget.position);

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(playerPos.x, playerPos.y);
            ctx.lineTo(targetPos.x, targetPos.y);
            ctx.stroke();
            ctx.restore();
        }

        this.updateTooltipPosition();
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
}
