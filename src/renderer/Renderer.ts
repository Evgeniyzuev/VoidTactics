export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private width: number = 0;
    private height: number = 0;

    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2D context');
        this.ctx = context;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Handle High DPI
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.ctx.scale(dpr, dpr);
    }

    public clear() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    public getContext(): CanvasRenderingContext2D {
        return this.ctx;
    }

    public getDimensions() {
        return { width: this.width, height: this.height };
    }
}
