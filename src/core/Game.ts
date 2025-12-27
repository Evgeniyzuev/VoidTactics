import { InputManager } from './InputManager';
import { Renderer } from '../renderer/Renderer';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { CelestialBody } from '../entities/CelestialBody';
import { Fleet } from '../entities/Fleet';
import { Entity } from '../entities/Entity';

export class Game {
    private lastTime: number = 0;
    private renderer: Renderer;
    private input: InputManager;
    private camera: Camera;

    // Entities
    private entities: Entity[] = [];
    private playerFleet!: Fleet;

    private backgroundImage: HTMLImageElement;

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);
        this.input = new InputManager(canvas);

        const { width, height } = this.renderer.getDimensions();
        this.camera = new Camera(width, height);

        this.backgroundImage = new Image();
        this.backgroundImage.src = '/space1.jpg';

        this.initWorld();

        // Start loop
        requestAnimationFrame((t) => this.loop(t));

        // Resize Listener for Camera
        window.addEventListener('resize', () => {
            const { width, height } = this.renderer.getDimensions();
            this.camera.resize(width, height);
        });
    }

    private initWorld() {
        // Create System
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

        // Player
        this.playerFleet = new Fleet(500, 500);
        this.entities.push(this.playerFleet);
    }

    private loop(timestamp: number) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    private update(dt: number) {
        // 1. Handle Input
        if (this.input.isMouseDown) {
            // Convert screen click to world coordinates
            const clickPos = new Vector2(this.input.mousePos.x, this.input.mousePos.y);
            const worldTarget = this.camera.screenToWorld(clickPos);
            this.playerFleet.setTarget(worldTarget);
        }

        // 2. Update Entities
        for (const e of this.entities) {
            e.update(dt);
        }

        // 3. Update Camera to follow player
        // Smooth follow
        const camTarget = this.playerFleet.position;
        // Simple lerp: cam = cam + (target - cam) * speed * dt
        const lerpSpeed = 5.0;
        const diff = camTarget.sub(this.camera.position);
        this.camera.position = this.camera.position.add(diff.scale(lerpSpeed * dt));
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

        if (this.backgroundImage.complete) {
            // Parallax or Fixed?
            // Let's do a simple fixed background but slightly moving with camera (Parallax factor 0.1)
            const parallax = 0.1;
            // The background image is likely repeating or large.
            // For simplicity, let's draw it covering the screen, but offset by camera

            // Calculate offset
            // We want the image to wrap or be huge.
            // Assuming the image is tileable or just large "space".

            // Just draw it fullscreen static for "Deep Space" feel relative to screen
            // ctx.drawImage(this.backgroundImage, 0, 0, width, height);

            // Better: Parallax
            // const offsetX = (this.camera.position.x * parallax) % this.backgroundImage.width;
            // const offsetY = (this.camera.position.y * parallax) % this.backgroundImage.height;

            ctx.save();
            ctx.globalAlpha = 0.4; // Darken background
            ctx.drawImage(this.backgroundImage, 0, 0, width, height);
            ctx.restore();
        }

        // Overlay Grid (fainter)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
