import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { Fleet } from './Fleet';
import { FleetGenerator } from '../tactical/FleetGenerator';
import { COMBAT_BALANCE } from '../tactical/ShipDefinitions';
import { RepairService } from '../tactical/RepairService';
import { AbilityService } from '../tactical/AbilityService';

/**
 * A stationary fleet-shaped defense platform.
 *
 * The station deliberately reuses Fleet so threat, DPS, defensive layers and
 * the normal inspection window stay consistent with moving fleets. Only the
 * movement and icon are specialized: it has zero speed and a circular hull.
 */
export class MilitaryStation extends Fleet {
    public readonly name: string;
    public readonly damagePerShot: number;
    public readonly fireInterval: number;
    public cooldown = 0;
    public beamTimer = 0;
    public lastTarget: Fleet | null = null;

    /** Compatibility alias for older station callers. */
    public get defenseRadius() {
        return this.attackRadius;
    }

    constructor(
        x: number,
        y: number,
        name: string,
        options: {
            attackRadius?: number;
            damagePerShot?: number;
            fireInterval?: number;
            threatBudget?: number;
        } = {}
    ) {
        super(x, y, '#5f86d6', false);
        this.name = name;
        this.isStation = true;
        this.faction = 'military';
        this.maxSpeed = 0;
        this.velocity = new Vector2(0, 0);
        this.attackRadius = options.attackRadius ?? 200;
        this.fireInterval = options.fireInterval ?? 1;

        // These are real ships for inspection and threat calculation, not a
        // giant visual marker. A platform is powerful but still readable.
        this.ships = FleetGenerator.generate(options.threatBudget ?? 1800, 'military');
        this.supplies = this.maxSupplies;
        this.selectedShipId = this.ships[0]?.id || null;
        const stationDps = this.ships.reduce((sum, ship) => sum + ship.weaponDps, 0) * COMBAT_BALANCE.damageScale;
        this.damagePerShot = options.damagePerShot ?? Math.max(55, stationDps * 0.35);
        this.commandCapacity = Math.max(12, this.commandUsed);
        this.maxSupplies = 120;
        this.supplies = this.maxSupplies;
        this.fuel = this.maxFuel;
        this.operationalReadiness = 100;
    }

    override update(dt: number) {
        // Stations continuously replenish their logistics reserves and repair
        // structural damage at the accelerated station rate.
        this.fuel = this.maxFuel;
        this.supplies = this.maxSupplies;
        RepairService.update(this, dt, false);
        this.fuel = this.maxFuel;
        this.supplies = this.maxSupplies;
        this.cooldown = Math.max(0, this.cooldown - Math.max(0, dt));
        this.beamTimer = Math.max(0, this.beamTimer - Math.max(0, dt));
        const net = this.abilities.net;
        net.cooldown = Math.max(0, net.cooldown - Math.max(0, dt));
        if (net.active) {
            net.timer -= Math.max(0, dt);
            if (net.timer <= 0) net.active = false;
        }
        this.velocity = new Vector2(0, 0);
        this.isBubbled = false;
    }

    /**
     * Fire one defense salvo at the nearest hostile fleet in the two-times
     * ship interception radius. Cloaked fleets are not auto-targeted.
     */
    engage(fleets: readonly Fleet[]): Fleet | null {
        const target = fleets
            .filter(fleet => fleet !== this && fleet.ships.some(ship => ship.alive))
            .filter(fleet => !fleet.isCloaked)
            .filter(fleet => fleet.faction === 'pirate' || fleet.faction === 'orc' || fleet.faction === 'raider')
            .filter(fleet => Vector2.distance(this.position, fleet.position) <= this.attackRadius)
            .sort((a, b) => Vector2.distance(this.position, a.position) - Vector2.distance(this.position, b.position))[0] ?? null;

        this.lastTarget = target;
        if (!target || this.cooldown > 0) return null;

        this.currentTarget = target;
        AbilityService.activate(this, 'net');
        this.currentTarget = null;
        target.receiveTacticalDamage(this.damagePerShot, 'energy');
        this.cooldown = this.fireInterval;
        this.beamTimer = 0.18;
        return target;
    }

    override draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screen = camera.worldToScreen(this.position);
        const scale = Math.max(0.75, camera.zoom);
        const r = Math.max(7, 8 * scale);

        ctx.save();
        ctx.translate(screen.x, screen.y);

        // Circular fleet icon: compact at a distance and detailed near Terra.
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002 + this.position.x * 0.01);
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.18 + pulse * 0.04), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(110, 170, 255, ' + (0.35 + pulse * 0.18) + ')';
        ctx.lineWidth = Math.max(1, 1.4 * scale);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#172844';
        ctx.fill();
        ctx.strokeStyle = '#9dbdff';
        ctx.lineWidth = Math.max(1.5, 1.8 * scale);
        ctx.stroke();

        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            ctx.fillStyle = '#ffd166';
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * r * 0.72, Math.sin(angle) * r * 0.72, Math.max(1.2, 1.5 * scale), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(-r * 0.18, -r * 0.2, r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#dbeaff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.8, r * (0.18 + pulse * 0.03)), 0, Math.PI * 2);
        ctx.fillStyle = '#ffd166';
        ctx.fill();

        if (this.beamTimer > 0 && this.lastTarget) {
            const target = camera.worldToScreen(this.lastTarget.position);
            ctx.strokeStyle = 'rgba(255, 220, 120, ' + Math.min(1, this.beamTimer / 0.18) + ')';
            ctx.shadowColor = '#ffd86b';
            ctx.shadowBlur = 8;
            ctx.lineWidth = Math.max(1.5, 2 * scale);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(target.x - screen.x, target.y - screen.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }
}
