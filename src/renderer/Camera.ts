import { Vector2 } from '../utils/Vector2';

export class Camera {
    public position: Vector2 = new Vector2(0, 0);
    public zoom: number = 1.0;

    private width: number;
    private height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    public worldToScreen(worldPos: Vector2): Vector2 {
        // (World - Cam) * Zoom + CenterOffset
        const rx = (worldPos.x - this.position.x) * this.zoom + this.width / 2;
        const ry = (worldPos.y - this.position.y) * this.zoom + this.height / 2;
        return new Vector2(rx, ry);
    }

    public screenToWorld(screenPos: Vector2): Vector2 {
        // (Screen - CenterOffset) / Zoom + Cam
        const wx = (screenPos.x - this.width / 2) / this.zoom + this.position.x;
        const wy = (screenPos.y - this.height / 2) / this.zoom + this.position.y;
        return new Vector2(wx, wy);
    }
}
