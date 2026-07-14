import { Entity } from './Entity';
import type { Camera } from '../renderer/Camera';

export type WorldEventKind = 'anomaly' | 'distress' | 'salvage';

export class WorldEvent extends Entity {
    public active = true;
    public discovered = false;
    public resolutionReported = false;
    public kind: WorldEventKind;
    public title: string;
    public timeLeft: number;
    constructor(x: number, y: number, kind: WorldEventKind, title: string, timeLeft: number) {
        super(x, y);
        this.kind = kind;
        this.title = title;
        this.timeLeft = timeLeft;
        this.radius = 24;
    }

    update(dt: number) {
        if (!this.active) return;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) this.active = false;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        if (!this.active) return;
        const pos = camera.worldToScreen(this.position);
        const color = this.kind === 'anomaly' ? '#ba7cff' : this.kind === 'distress' ? '#ff615b' : '#6de2b2';
        const pulse = 14 + Math.sin(this.timeLeft * 2) * 3;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.strokeStyle = color; ctx.fillStyle = `${color}22`; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(0, 0, pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(0, 0, pulse + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText(this.title, 0, -pulse - 14); ctx.fillText(`${Math.ceil(this.timeLeft)}s`, 0, pulse + 20);
        ctx.restore();
    }
}
