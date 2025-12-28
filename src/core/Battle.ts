import { Fleet } from '../entities/Fleet';
import { Vector2 } from '../utils/Vector2';

export class Battle {
    public sideA: Fleet[] = [];
    public sideB: Fleet[] = [];
    public timer: number = 3.0;
    public finished: boolean = false;

    constructor(f1: Fleet, f2: Fleet) {
        this.sideA.push(f1);
        this.sideB.push(f2);
        f1.activeBattle = this;
        f2.activeBattle = this;
        f1.state = 'combat';
        f2.state = 'combat';
        f1.combatTimer = this.timer;
        f2.combatTimer = this.timer;
    }

    joinSide(fleet: Fleet, side: 'A' | 'B') {
        const targetSide = side === 'A' ? this.sideA : this.sideB;
        if (!targetSide.includes(fleet)) {
            targetSide.push(fleet);
            fleet.activeBattle = this;
            fleet.state = 'combat';
            fleet.combatTimer = this.timer;
            this.timer = Math.max(this.timer, 2.0);
        }
    }

    addFleet(fleet: Fleet, against: Fleet) {
        if (this.sideA.includes(against)) {
            if (!this.sideB.includes(fleet)) {
                this.sideB.push(fleet);
                fleet.activeBattle = this;
                fleet.state = 'combat';
                fleet.combatTimer = this.timer;
            }
        } else if (this.sideB.includes(against)) {
            if (!this.sideA.includes(fleet)) {
                this.sideA.push(fleet);
                fleet.activeBattle = this;
                fleet.state = 'combat';
                fleet.combatTimer = this.timer;
            }
        }
        this.timer = Math.max(this.timer, 2.0); // Reset/Extend timer
    }

    update(dt: number) {
        this.timer -= dt;
        // The individual fleet update also ticks timers, but we sync here
        for (const f of this.sideA) f.combatTimer = this.timer;
        for (const f of this.sideB) f.combatTimer = this.timer;
    }

    get totalSizeA(): number {
        return this.sideA.reduce((sum, f) => sum + f.strength, 0);
    }

    get totalSizeB(): number {
        return this.sideB.reduce((sum, f) => sum + f.strength, 0);
    }

    contains(f: Fleet): boolean {
        return this.sideA.includes(f) || this.sideB.includes(f);
    }

    get position(): Vector2 {
        const allFleets = [...this.sideA, ...this.sideB];
        if (allFleets.length === 0) return new Vector2(0, 0);

        let totalX = 0;
        let totalY = 0;
        for (const fleet of allFleets) {
            totalX += fleet.position.x;
            totalY += fleet.position.y;
        }

        return new Vector2(totalX / allFleets.length, totalY / allFleets.length);
    }

    get radius(): number {
        const center = this.position;
        const allFleets = [...this.sideA, ...this.sideB];
        if (allFleets.length === 0) return 50;

        let maxDist = 0;
        for (const fleet of allFleets) {
            const dist = Vector2.distance(center, fleet.position);
            maxDist = Math.max(maxDist, dist);
        }

        // Add buffer for joining
        return maxDist + 100;
    }
}
