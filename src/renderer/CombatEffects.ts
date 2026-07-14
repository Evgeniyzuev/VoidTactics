import { Camera } from './Camera';
import { Vector2 } from '../utils/Vector2';
import type { DamageType } from '../tactical/ShipDefinitions';

interface CombatEffect {
    kind: 'beam' | 'impact';
    from: Vector2;
    to: Vector2;
    color: string;
    age: number;
    duration: number;
    radius: number;
}

const DAMAGE_COLORS: Record<DamageType, { beam: string; impact: string }> = {
    energy: { beam: '#8ce8ff', impact: '#d9fbff' },
    kinetic: { beam: '#ffd36e', impact: '#fff0b0' },
    explosive: { beam: '#ff8b55', impact: '#ffd0a6' }
};

/** Lightweight visual-only combat feedback. It never participates in simulation or saves. */
export class CombatEffects {
    private effects: CombatEffect[] = [];

    clear() { this.effects = []; }

    addShot(from: Vector2, to: Vector2, type: DamageType, hit: boolean) {
        const palette = DAMAGE_COLORS[type];
        this.effects.push({ kind: 'beam', from: from.clone(), to: to.clone(), color: palette.beam, age: 0, duration: 0.09, radius: 0 });
        this.effects.push({ kind: 'impact', from: to.clone(), to: to.clone(), color: hit ? palette.impact : palette.beam, age: 0, duration: hit ? 0.18 : 0.1, radius: hit ? 4 : 2.5 });
        if (this.effects.length > 240) this.effects.splice(0, this.effects.length - 240);
    }

    update(dt: number) {
        for (const effect of this.effects) effect.age += dt;
        this.effects = this.effects.filter(effect => effect.age < effect.duration);
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        for (const effect of this.effects) {
            const progress = Math.min(1, effect.age / effect.duration);
            const alpha = 1 - progress;
            const from = camera.worldToScreen(effect.from);
            const to = camera.worldToScreen(effect.to);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (effect.kind === 'beam') {
                ctx.lineCap = 'round';
                ctx.strokeStyle = effect.color;
                ctx.shadowColor = effect.color;
                ctx.shadowBlur = 5;
                ctx.lineWidth = Math.max(0.7, 1.15 * camera.zoom);
                ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.globalAlpha = alpha * 0.9;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = Math.max(0.35, 0.45 * camera.zoom);
                ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
            } else {
                const radius = Math.max(1.2, effect.radius * camera.zoom * (0.55 + progress * 0.7));
                ctx.fillStyle = effect.color;
                ctx.shadowColor = effect.color;
                ctx.shadowBlur = 8;
                ctx.beginPath(); ctx.arc(to.x, to.y, radius * 0.45, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = effect.color;
                ctx.lineWidth = Math.max(0.6, camera.zoom);
                ctx.beginPath(); ctx.arc(to.x, to.y, radius, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();
        }
    }
}
