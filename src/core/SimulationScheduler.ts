import type { Fleet } from '../entities/Fleet';

/**
 * Simulation cadence for a fleet based on its distance from the player.
 * A zero interval means every render update; larger intervals accumulate dt
 * and are passed to the fleet as one coherent simulation step.
 */
export const FLEET_SIMULATION_RADIUS = {
    tactical: 2500,
    local: 6500,
    remote: 12000,
} as const;

export type FleetSimulationTier = 'tactical' | 'local' | 'remote' | 'background';

export function getFleetSimulationTier(distanceSquared: number): FleetSimulationTier {
    if (distanceSquared <= FLEET_SIMULATION_RADIUS.tactical ** 2) return 'tactical';
    if (distanceSquared <= FLEET_SIMULATION_RADIUS.local ** 2) return 'local';
    if (distanceSquared <= FLEET_SIMULATION_RADIUS.remote ** 2) return 'remote';
    return 'background';
}

export function getFleetSimulationInterval(distanceSquared: number, activeBattle = false): number {
    if (activeBattle) return 0.1;
    switch (getFleetSimulationTier(distanceSquared)) {
        case 'tactical': return 0;
        case 'local': return 0.1;
        case 'remote': return 0.5;
        case 'background': return 1;
    }
}

/** Accumulates time independently for each subject without allocating ticks. */
export class CadenceScheduler<T extends object> {
    private elapsed = new Map<T, number>();

    consume(subject: T, dt: number, interval: number): number {
        const safeDt = Math.max(0, dt);
        if (interval <= 0) return safeDt;
        const accumulated = (this.elapsed.get(subject) || 0) + safeDt;
        if (accumulated < interval) {
            this.elapsed.set(subject, accumulated);
            return 0;
        }
        this.elapsed.set(subject, accumulated % interval);
        return accumulated;
    }

    clear(subject?: T) {
        if (subject) this.elapsed.delete(subject);
        else this.elapsed.clear();
    }
}

export function distanceSquaredBetweenFleets(a: Fleet, b: Fleet): number {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    return dx * dx + dy * dy;
}
