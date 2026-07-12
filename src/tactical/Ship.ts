import { HULLS, MODULES, WEAPONS, type DamageType, type FleetOrder, type ShipLoadout } from './ShipDefinitions';

export interface ShipSnapshot {
    id: string;
    loadout: ShipLoadout;
    hull: number;
    armor: number;
    shield: number;
    energy: number;
    order: FleetOrder;
}

let nextShipId = 1;

export class Ship {
    public readonly id: string;
    public readonly loadout: ShipLoadout;
    public hull: number;
    public armor: number;
    public shield: number;
    public energy: number;
    public order: FleetOrder = { type: 'escort', issuedAt: 0 };
    public weaponCooldowns: number[];
    public shieldFlash = 0;
    public hitFlash = 0;

    constructor(loadout: ShipLoadout, id = `ship-${nextShipId++}`) {
        this.id = id;
        this.loadout = loadout;
        const hull = this.definition;
        this.hull = hull.hull;
        this.armor = hull.armor;
        this.shield = hull.shield;
        this.energy = hull.energy + this.modules.reduce((sum, module) => sum + (module.energyModifier || 0), 0);
        this.weaponCooldowns = loadout.weaponIds.map(() => 0);
    }

    get definition() { return HULLS[this.loadout.hullId] || HULLS.command; }
    get role() { return this.definition.role; }
    get weapons() { return this.loadout.weaponIds.map(id => WEAPONS[id]).filter(Boolean); }
    get modules() { return this.loadout.moduleIds.map(id => MODULES[id]).filter(Boolean); }
    get alive() { return this.hull > 0; }
    get maxEnergy() { return this.definition.energy + this.modules.reduce((sum, module) => sum + (module.energyModifier || 0), 0); }
    get integrity() { return this.hull / this.definition.hull; }
    get combatRating() { return this.alive ? this.definition.tacticalValue * (0.35 + this.integrity * 0.65) : 0; }

    update(dt: number) {
        this.energy = Math.min(this.maxEnergy, this.energy + dt * 8);
        this.shield = Math.min(this.definition.shield, this.shield + dt * 1.5);
        this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3);
        this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
        this.weaponCooldowns = this.weaponCooldowns.map(value => Math.max(0, value - dt));
    }

    applyDamage(amount: number, type: DamageType): number {
        let remaining = amount;
        if (this.shield > 0) {
            const modifier = type === 'energy' ? 1.15 : type === 'kinetic' ? 0.8 : 1;
            const absorbed = Math.min(this.shield, remaining * modifier);
            this.shield -= absorbed;
            remaining -= absorbed / modifier;
            this.shieldFlash = 1;
        }
        if (remaining > 0 && this.armor > 0) {
            const modifier = type === 'kinetic' ? 1.2 : type === 'explosive' ? 0.75 : 0.9;
            const absorbed = Math.min(this.armor, remaining * modifier);
            this.armor -= absorbed;
            remaining -= absorbed / modifier;
        }
        if (remaining > 0) {
            const dealt = Math.min(this.hull, remaining);
            this.hull -= dealt;
            this.hitFlash = 1;
            return dealt;
        }
        return 0;
    }

    restore(amount: number) { this.hull = Math.min(this.definition.hull, this.hull + amount); }

    snapshot(): ShipSnapshot {
        return { id: this.id, loadout: this.loadout, hull: this.hull, armor: this.armor, shield: this.shield, energy: this.energy, order: this.order };
    }

    static fromSnapshot(data: ShipSnapshot) {
        const ship = new Ship(data.loadout, data.id);
        ship.hull = data.hull;
        ship.armor = data.armor;
        ship.shield = data.shield;
        ship.energy = data.energy;
        ship.order = data.order;
        return ship;
    }
}

export function createStarterShips(): Ship[] {
    return [
        new Ship({ hullId: 'command', weaponIds: ['pulse', 'autocannon'], moduleIds: ['commandLink'] }),
        new Ship({ hullId: 'bulwark', weaponIds: ['autocannon', 'autocannon'], moduleIds: [] }),
        new Ship({ hullId: 'lance', weaponIds: ['pulse', 'missile'], moduleIds: [] }),
        new Ship({ hullId: 'siege', weaponIds: ['railgun'], moduleIds: [] }),
        new Ship({ hullId: 'specter', weaponIds: ['jammer'], moduleIds: ['electronicSuite'] })
    ];
}
