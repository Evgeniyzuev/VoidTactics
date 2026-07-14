export type ShipRole = 'flagship' | 'defender' | 'striker' | 'artillery' | 'scout' | 'support';
export type DamageType = 'kinetic' | 'energy' | 'explosive';
export type FleetOrderType = 'attack' | 'escort' | 'hold' | 'retreat' | 'protect' | 'suppress' | 'repair';
export type TargetPriority = 'nearest' | 'artillery' | 'support' | 'scout' | 'damaged';
export type ShipState = 'active' | 'disabled' | 'destroyed';

export const COMBAT_BALANCE = {
    damageScale: 0.55,
    hullRewardMultiplier: 3,
    hullThreatWeight: 0.24,
    offenseThreatWeight: 0.35,
    disabledThreatFactor: 0
} as const;

export interface FleetDoctrine {
    targetPriority: TargetPriority;
    preferredRange: 'close' | 'balanced' | 'long';
    aggression: 'cautious' | 'balanced' | 'aggressive';
}

export interface HullDefinition {
    id: string;
    name: string;
    role: ShipRole;
    hull: number;
    armor: number;
    shield: number;
    energy: number;
    maxSpeed: number;
    acceleration: number;
    mass: number;
    turnRate: number;
    sensorRange: number;
    signature: number;
    crew: number;
    fuel: number;
    ammunition: number;
    cargo: number;
    weaponSlots: number;
    systemSlots: number;
    tacticalValue: number;
    commandCost: number;
}

export interface WeaponDefinition {
    id: string;
    name: string;
    damageType: DamageType;
    damage: number;
    range: number;
    cooldown: number;
    energyCost: number;
    projectileSpeed: number;
}

export interface ModuleDefinition {
    id: string;
    name: string;
    description: string;
    energyModifier?: number;
    sensorModifier?: number;
    repairPerSecond?: number;
}

export interface ShipLoadout {
    hullId: string;
    weaponIds: string[];
    moduleIds: string[];
}

export interface FleetOrder {
    type: FleetOrderType;
    targetShipId?: string;
    issuedAt: number;
}

export interface FormationDefinition {
    id: string;
    name: string;
    spacing: number;
    slots: { x: number; y: number; preferredRole?: ShipRole }[];
}

export const HULLS: Record<string, HullDefinition> = {
    command: { id: 'command', name: 'Aegis Command', role: 'flagship', hull: 140, armor: 80, shield: 100, energy: 120, maxSpeed: 480, acceleration: 1.2, mass: 18, turnRate: 2.2, sensorRange: 1300, signature: 1, crew: 35, fuel: 100, ammunition: 80, cargo: 30, weaponSlots: 3, systemSlots: 2, tacticalValue: 36, commandCost: 4 },
    bulwark: { id: 'bulwark', name: 'Bulwark', role: 'defender', hull: 180, armor: 140, shield: 70, energy: 75, maxSpeed: 390, acceleration: 0.85, mass: 28, turnRate: 1.5, sensorRange: 900, signature: 1.35, crew: 42, fuel: 85, ammunition: 100, cargo: 15, weaponSlots: 3, systemSlots: 1, tacticalValue: 34, commandCost: 4 },
    lance: { id: 'lance', name: 'Lance', role: 'striker', hull: 90, armor: 45, shield: 55, energy: 90, maxSpeed: 570, acceleration: 1.65, mass: 12, turnRate: 2.8, sensorRange: 1000, signature: 0.9, crew: 22, fuel: 90, ammunition: 120, cargo: 10, weaponSlots: 3, systemSlots: 1, tacticalValue: 29, commandCost: 3 },
    siege: { id: 'siege', name: 'Longbow', role: 'artillery', hull: 75, armor: 35, shield: 35, energy: 110, maxSpeed: 340, acceleration: 0.7, mass: 20, turnRate: 1.25, sensorRange: 1150, signature: 1.2, crew: 28, fuel: 80, ammunition: 160, cargo: 12, weaponSlots: 2, systemSlots: 1, tacticalValue: 31, commandCost: 4 },
    specter: { id: 'specter', name: 'Specter EW', role: 'scout', hull: 60, armor: 20, shield: 45, energy: 125, maxSpeed: 650, acceleration: 2, mass: 8, turnRate: 3.5, sensorRange: 1750, signature: 0.45, crew: 12, fuel: 120, ammunition: 40, cargo: 8, weaponSlots: 1, systemSlots: 2, tacticalValue: 25, commandCost: 2 },
    tender: { id: 'tender', name: 'Tender', role: 'support', hull: 105, armor: 55, shield: 60, energy: 130, maxSpeed: 370, acceleration: 0.8, mass: 24, turnRate: 1.4, sensorRange: 1050, signature: 1.1, crew: 30, fuel: 180, ammunition: 180, cargo: 90, weaponSlots: 1, systemSlots: 3, tacticalValue: 28, commandCost: 3 }
};

export const WEAPONS: Record<string, WeaponDefinition> = {
    pulse: { id: 'pulse', name: 'Pulse Cannon', damageType: 'energy', damage: 12, range: 520, cooldown: 0.8, energyCost: 8, projectileSpeed: 900 },
    autocannon: { id: 'autocannon', name: 'Autocannon', damageType: 'kinetic', damage: 9, range: 430, cooldown: 0.45, energyCost: 2, projectileSpeed: 760 },
    railgun: { id: 'railgun', name: 'Rail Artillery', damageType: 'kinetic', damage: 28, range: 1150, cooldown: 2.6, energyCost: 12, projectileSpeed: 1500 },
    missile: { id: 'missile', name: 'Strike Missile', damageType: 'explosive', damage: 34, range: 800, cooldown: 3.5, energyCost: 4, projectileSpeed: 520 },
    jammer: { id: 'jammer', name: 'Disruptor', damageType: 'energy', damage: 5, range: 720, cooldown: 1.2, energyCost: 10, projectileSpeed: 1100 }
};

export const MODULES: Record<string, ModuleDefinition> = {
    commandLink: { id: 'commandLink', name: 'Command Link', description: 'Extends coordinated command range.', sensorModifier: 150 },
    repairDrones: { id: 'repairDrones', name: 'Repair Drones', description: 'Repairs nearby allied hulls.', repairPerSecond: 3 },
    electronicSuite: { id: 'electronicSuite', name: 'Electronic Warfare Suite', description: 'Improves detection and targeting.', sensorModifier: 350, energyModifier: 20 }
};

export const DEFAULT_FORMATION: FormationDefinition = {
    id: 'wedge', name: 'Wedge', spacing: 34,
    slots: [
        { x: 0, y: 0, preferredRole: 'flagship' },
        { x: -1.1, y: 1, preferredRole: 'defender' },
        { x: 1.1, y: 1, preferredRole: 'striker' },
        { x: 0, y: 2.1, preferredRole: 'artillery' },
        { x: -2, y: 2, preferredRole: 'scout' },
        { x: 2, y: 2, preferredRole: 'support' }
    ]
};
