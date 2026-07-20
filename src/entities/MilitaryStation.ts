import { Entity } from './Entity';
import { Fleet } from './Fleet';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';

/**
 * A fixed military defense platform around Terra.
 *
 * Stations are deliberately not fleets: they do not consume command points,
 * move, or enter the normal fleet-vs-fleet combat graph. They are a local
 * piece of infrastructure that makes Terra safer and visually readable.
 */
export class MilitaryStation extends Entity {
    public readonly name: string;
    public readonly defenseRadius: number;
    public readonly damagePerShot: number;
    public readonly fireInterval: number;
    public cooldown = 0;
    public beamTimer = 0;
    public lastTarget: Fleet | null = null;

    constructor(
        x: number,
        y: number,
        name: string,
        options: {
            radius?: number;
            defenseRadius?: number;
            damagePerShot?: number;
            fireInterval?: number;
        } = {}
    ) {
        super(x, y);
        this.name = name;
        this.radius = options.radius ?? 48;
        this.defenseRadius = options.defenseRadius ?? 720;
        this.damagePerShot = options.damagePerShot ?? 34;
        this.fireInterval = options.fireInterval ?? 1;
    }

    update(dt: number) {
        this.cooldown = Math.max(0, this.cooldown - Math.max(0, dt));
        this.beamTimer = Math.max(0, this.beamTimer - Math.max(0, dt));
    }

    /**
     * Fire one defense salvo at the nearest hostile raider inside the shield
     * perimeter. Returns the target when a shot was fired.
     */
    engage(fleets: readonly Fleet[]): Fleet | null {
        const target = fleets
            .filter(fleet => fleet.ships.some(ship => ship.alive))
            .filter(fleet => fleet.faction === 'pirate' || fleet.faction === 'orc' || fleet.faction === 'raider')
            .filter(fleet => Vector2.distance(this.position, fleet.position) <= this.defenseRadius)
            .sort((a, b) => Vector2.distance(this.position, a.position) - Vector2.distance(this.position, b.position))[0] ?? null;

        this.lastTarget = target;
        if (!target || this.cooldown > 0) return null;

        target.receiveTacticalDamage(this.damagePerShot, 'energy');
        this.cooldown = this.fireInterval;
        this.beamTimer = 0.18;
        return target;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screen = camera.worldToScreen(this.position);
        const scale = Math.max(0.65, camera.zoom);
        const r = Math.max(16, this.radius * scale);

        ctx.save();
        ctx.translate(screen.x, screen.y);

        // Defensive perimeter and rotating sensor ring.
        ctx.beginPath();
        ctx.arc(0, 0, this.defenseRadius * scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 160, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 12]);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002 + this.position.x * 0.01);
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.22 + pulse * 0.08), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(80, 150, 255, ' + (0.28 + pulse * 0.16) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Six radial armored ribs and gun emplacements give the station a
        // circular warship silhouette at every zoom level.
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const inner = r * 0.38;
            const outer = r * 0.92;
            ctx.strokeStyle = '#8099c9';
            ctx.lineWidth = Math.max(2, r * 0.08);
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            ctx.stroke();

            ctx.fillStyle = '#ffc857';
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * r * 0.93, Math.sin(angle) * r * 0.93, Math.max(2, r * 0.08), 0, Math.PI * 2);
            ctx.fill();
        }

        const core = ctx.createRadialGradient(-r * 0.22, -r * 0.24, r * 0.08, 0, 0, r * 0.62);
        core.addColorStop(0, '#e7f2ff');
        core.addColorStop(0.35, '#6888c6');
        core.addColorStop(1, '#1c2d52');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b8d2ff';
        ctx.lineWidth = Math.max(1.5, r * 0.06);
        ctx.stroke();

        ctx.fillStyle = '#ffdc73';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3, r * (0.14 + pulse * 0.025)), 0, Math.PI * 2);
        ctx.fill();

        if (this.beamTimer > 0 && this.lastTarget) {
            const target = camera.worldToScreen(this.lastTarget.position);
            const dx = target.x - screen.x;
            const dy = target.y - screen.y;
            ctx.strokeStyle = 'rgba(255, 220, 120, ' + Math.min(1, this.beamTimer / 0.18) + ')';
            ctx.shadowColor = '#ffd86b';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dx, dy);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();

        // Keep the name compact; it is useful when the player zooms in on Terra.
        if (camera.zoom > 0.55) {
            ctx.fillStyle = 'rgba(200, 220, 255, 0.85)';
            ctx.font = Math.max(9, 11 * scale) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.name, screen.x, screen.y + r + 16);
        }
    }
}
