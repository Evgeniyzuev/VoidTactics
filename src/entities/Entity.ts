import { Vector2 } from '../utils/Vector2';
import { Camera } from '../renderer/Camera';

export abstract class Entity {
    public position: Vector2;

    constructor(x: number, y: number) {
        this.position = new Vector2(x, y);
    }

    abstract update(dt: number): void;
    abstract draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}
