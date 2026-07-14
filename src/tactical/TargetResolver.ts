import type { Ship } from './Ship';
import type { FleetDoctrine } from './ShipDefinitions';

export class TargetResolver {
    static resolve(attacker: Ship, candidates: Ship[], doctrine: FleetDoctrine, alliedAttackers: Ship[] = []): Ship | null {
        const active = candidates.filter(ship => ship.state === 'active');
        if (!active.length) return null;

        const locked = active.find(ship => ship.id === attacker.targetShipId);
        if (locked && attacker.targetLockTimer > 0) return locked;

        const focusCounts = new Map<string, number>();
        for (const ship of alliedAttackers) {
            if (ship.targetShipId) focusCounts.set(ship.targetShipId, (focusCounts.get(ship.targetShipId) || 0) + 1);
        }
        const roleScore = (ship: Ship) => {
            if (doctrine.targetPriority === 'damaged') return (1 - ship.integrity) * 8;
            if (ship.role === doctrine.targetPriority) return 8;
            if (doctrine.targetPriority === 'nearest') return 0;
            return 0;
        };
        active.sort((a, b) => {
            const scoreA = roleScore(a) + (1 - a.integrity) * 2 - (focusCounts.get(a.id) || 0) * 1.5;
            const scoreB = roleScore(b) + (1 - b.integrity) * 2 - (focusCounts.get(b.id) || 0) * 1.5;
            return scoreB - scoreA || a.id.localeCompare(b.id);
        });
        attacker.targetShipId = active[0].id;
        attacker.targetLockTimer = 2 + ((attacker.id.length + active[0].id.length) % 3);
        return active[0];
    }
}
