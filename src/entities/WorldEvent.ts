import { Entity } from './Entity';
import type { Camera } from '../renderer/Camera';
import type { Fleet } from './Fleet';

export type WorldEventKind = 'anomaly' | 'distress' | 'salvage';
export type WorldEventPhase = 'hidden' | 'discovered' | 'engaged' | 'reinforcements' | 'resolved' | 'expired';
export type WorldEventOutcome = 'transport-saved' | 'transport-lost' | 'salvaged' | 'decoded' | 'missed' | null;

let nextWorldEventId = 1;

export class WorldEvent extends Entity {
    public readonly id = `event-${nextWorldEventId++}`;
    public active = true;
    public discovered = false;
    public resolutionReported = false;
    public rewardGranted = false;
    public phase: WorldEventPhase = 'hidden';
    public phaseAge = 0;
    public outcome: WorldEventOutcome = null;
    public discoveryRadius = 900;
    public interactionRadius = 110;
    public scenarioSpawned = false;
    public reinforcementsSpawned = false;
    public playerInvolved = false;
    public transport: Fleet | null = null;
    public raiders: Fleet[] = [];
    public responders: Fleet[] = [];
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

    setPhase(phase: WorldEventPhase) {
        if (this.phase === phase) return;
        this.phase = phase;
        this.phaseAge = 0;
        if (phase !== 'hidden') this.discovered = true;
        if (phase === 'resolved' || phase === 'expired') this.active = false;
    }

    resolve(outcome: Exclude<WorldEventOutcome, null>) {
        this.outcome = outcome;
        this.setPhase(outcome === 'missed' ? 'expired' : 'resolved');
    }

    update(dt: number) {
        if (!this.active) return;
        this.phaseAge += dt;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) this.resolve('missed');
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        if (!this.active || !this.discovered) return;
        const pos = camera.worldToScreen(this.position);
        const color = this.kind === 'anomaly' ? '#ba7cff' : this.kind === 'distress' ? '#ff615b' : '#6de2b2';
        const pulse = 14 + Math.sin(this.timeLeft * 2) * 3;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.strokeStyle = color; ctx.fillStyle = `${color}22`; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(0, 0, pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(0, 0, pulse + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText(this.title, 0, -pulse - 14);
        ctx.fillText(`${this.phase.toUpperCase()} · ${Math.ceil(this.timeLeft)}s`, 0, pulse + 20);
        ctx.restore();
    }
}
