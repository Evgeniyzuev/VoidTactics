import { Fleet } from '../entities/Fleet';

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
}
