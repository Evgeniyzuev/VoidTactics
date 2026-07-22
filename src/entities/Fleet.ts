import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { Ship, createStarterShips } from '../tactical/Ship';
import { DEFAULT_FORMATION, TACTICAL_BALANCE, type DamageType, type FleetDoctrine, type FleetOrderType } from '../tactical/ShipDefinitions';
import { FleetGenerator } from '../tactical/FleetGenerator';
import { RepairService } from '../tactical/RepairService';
import { ABILITY_CHARGE_BALANCE, ABILITY_DEFINITIONS, type FleetAbilityId } from '../tactical/AbilityService';

export type Faction = 'civilian' | 'pirate' | 'orc' | 'military' | 'player' | 'raider' | 'trader' | 'mercenary';
export interface FleetResources { fuel: number; maxFuel: number; supplies: number; maxSupplies: number; readiness: number }
export type FleetSkillId = 'leadership' | 'logistics' | 'engineering' | 'sensors' | 'navigation' | 'tactics' | 'size' | 'tech';
export const FLEET_SKILLS: Record<FleetSkillId, { name: string; description: string }> = {
    leadership: { name: 'Leadership', description: '+3 command capacity per level' },
    logistics: { name: 'Logistics', description: '+10 supply capacity and better readiness' },
    engineering: { name: 'Engineering', description: 'Faster field repairs' },
    sensors: { name: 'Sensors', description: 'Longer sensor range and lower fleet signature' },
    navigation: { name: 'Navigation', description: 'Higher strategic speed' },
    tactics: { name: 'Tactics', description: 'More defender intercept charges' },
    size: { name: 'Size', description: 'Unlocks medium and large hulls' },
    tech: { name: 'Tech', description: 'Unlocks higher ship tiers' }
};

export class Fleet extends Entity {
    public ships: Ship[] = [];
    public selectedShipId: string | null = null;
    public formation = DEFAULT_FORMATION;
    private tacticalClock = 0;
    private legacyBudget = 10;
    public commandCapacity = 4;
    /** Shared consumables pool. Capacity is derived from the fleet cargo. */
    public supplies = 5;
    private supplyCapacityBonus = 0;
    public fuel = 0;
    public operationalReadiness = 100;
    public skillPoints = 3;
    public skills: Record<FleetSkillId, number> = { leadership: 0, logistics: 0, engineering: 0, sensors: 0, navigation: 0, tactics: 0, size: 0, tech: 0 };
    public stabilizationProgress = 0;
    public doctrine: FleetDoctrine = { targetPriority: 'nearest', preferredRange: 'balanced', aggression: 'balanced' };
    public interceptCharges = 0;
    public target: Vector2 | null = null;
    public followTarget: Entity | null = null; // Entity to follow
    public followDistance: number = 100; // Distance to maintain when following
    public followMode: 'approach' | 'contact' | null = null;
    public manualSteerTarget: Vector2 | null = null; // Manual override for interception

    public maxSpeed: number = 500;
    /** Distance at which a fleet can initiate a tactical interception. */
    public attackRadius: number = 100;
    public isStation = false;
    /** True while the fleet is inside the outer asteroid belt. */
    public inAsteroidBelt = false;
    private stopThreshold: number = 5;

    private rotation: number = 0;
    public color: string;
    public isPlayer: boolean = false;
    public accumulatedDamage: number = 0;
    /** Actual shield + armor + hull damage from the most recent salvo. */
    public lastTacticalDamage = 0;
    public faction: Faction = 'civilian';
    public state: 'normal' | 'combat' | 'flee' | 'mining' = 'normal';
    public combatTimer: number = 0;
    public activeBattle: any = null; // Reference to ongoing Battle
    public decisionTimer: number = 0;
    public civilianStopTimer: number = 0;
    public lastAcceleration: Vector2 = new Vector2(0, 0);
    public currentTarget: Fleet | null = null; // Current attack target
    public hostileTo: Set<Fleet> = new Set(); // Persistent hostility to other fleets
    public lootDropped: boolean = false;
    public worldEventId: string | null = null;
    public worldEventRole: 'transport' | 'raider' | 'responder' | null = null;

    // Money-based progression
    public totalMoneyEarned: number = 0;
    public level: number = 1;
    public levelThreshold: number = 0;
    public nextLevelThreshold: number = 1000;

    // Abilities State (Player uses charges, others use cooldowns)
    public abilities = {
        afterburner: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.afterburner.duration, cdMax: ABILITY_DEFINITIONS.afterburner.cooldown, charges: 0 },
        cloak: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.cloak.duration, cdMax: ABILITY_DEFINITIONS.cloak.cooldown, charges: 0 },
        bubble: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.bubble.duration, cdMax: ABILITY_DEFINITIONS.bubble.cooldown, charges: 0 },
        mine: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.mine.duration, cdMax: ABILITY_DEFINITIONS.mine.cooldown, charges: 0 },
        medkit: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.medkit.duration, cdMax: ABILITY_DEFINITIONS.medkit.cooldown, charges: 0 },
        fire: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.fire.duration, cdMax: ABILITY_DEFINITIONS.fire.cooldown, charges: 0 },
        shield: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.shield.duration, cdMax: ABILITY_DEFINITIONS.shield.cooldown, charges: 0 },
        net: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.net.duration, cdMax: ABILITY_DEFINITIONS.net.cooldown, charges: 0 }
    };
    public isCloaked: boolean = false;
    public isBubbled: boolean = false; // Set by external bubbles
    public bubbleDistance: number = 0; // Distance to bubble center
    public netSlowTimer = 0;
    public shieldCellRemaining = 0;
    public shieldCellRate = 0;
    public stunTimer: number = 0;
    public money: number = 0; // Only for player

    // Mining properties
    public isMining: boolean = false;
    public miningTarget: any = null; // Reference to asteroid being mined

    constructor(x: number, y: number, color: string = '#55CCFF', isPlayer: boolean = false) {
        super(x, y);
        this.color = color;
        this.isPlayer = isPlayer;
        if (isPlayer) this.faction = 'player';
        this.radius = 8;
        this.ships = isPlayer ? createStarterShips() : [];
        if (!isPlayer) {
            this.skillPoints = 0;
            this.abilities.afterburner.charges = 1;
            this.abilities.mine.charges = 1;
            this.abilities.bubble.charges = 1;
            this.abilities.cloak.charges = 1;
        }
        this.selectedShipId = this.ships[0]?.id || null;
        this.fuel = this.maxFuel;
        this.supplies = this.maxSupplies;
        if (isPlayer) this.refreshFleetState();
    }

    public get baseThreatRating() { return this.ships.reduce((sum, ship) => sum + ship.combatRating, 0); }
    /** Threat at full hull and full readiness; used for combat XP rewards. */
    public get maximumThreatRating() { return this.ships.reduce((sum, ship) => sum + ship.maxCombatRating, 0); }
    public get threatRating() { return this.baseThreatRating * this.readinessEfficiency; }
    public get commandUsed() { return this.ships.filter(ship => ship.state !== 'destroyed').reduce((sum, ship) => sum + ship.commandCost, 0); }
    /** One shared pool for afterburner, bubble, cloak, mine and all other systems. */
    public get abilityChargeCapacity() {
        return ABILITY_CHARGE_BALANCE.baseCapacity
            + Math.max(0, this.commandUsed - 1) * ABILITY_CHARGE_BALANCE.perCommandUnit;
    }
    public get abilityChargesUsed() {
        return Object.values(this.abilities).reduce((sum, ability) => sum + Math.max(0, Math.floor(ability.charges || 0)), 0);
    }
    public addAbilityCharge(id: FleetAbilityId, amount = 1) {
        const ability = this.abilities[id];
        if (!ability) return 0;
        const requested = Math.max(0, Math.floor(amount));
        const added = Math.min(requested, Math.max(0, this.abilityChargeCapacity - this.abilityChargesUsed));
        ability.charges = Math.max(0, Math.floor(ability.charges || 0)) + added;
        return added;
    }
    public removeAbilityCharge(id: FleetAbilityId, amount = 1) {
        const ability = this.abilities[id];
        if (!ability) return 0;
        const removed = Math.min(Math.max(0, Math.floor(amount)), Math.max(0, Math.floor(ability.charges || 0)));
        ability.charges -= removed;
        return removed;
    }
    /** Drops excess charges from legacy or externally restored per-ability data. */
    public clampAbilityChargesToCapacity() {
        let remaining = this.abilityChargeCapacity;
        for (const ability of Object.values(this.abilities)) {
            const charges = Math.max(0, Math.floor(ability.charges || 0));
            ability.charges = Math.min(charges, remaining);
            remaining -= ability.charges;
        }
        return this.abilityChargesUsed;
    }
    public get readiness() {
        if (!this.ships.some(ship => ship.state !== 'destroyed')) return 0;
        return Math.max(0, Math.min(1, this.operationalReadiness / 100));
    }
    public get readinessEfficiency() {
        if (this.operationalReadiness >= TACTICAL_BALANCE.lowReadinessThreshold) return 1;
        const normalized = Math.max(0, this.operationalReadiness) / TACTICAL_BALANCE.lowReadinessThreshold;
        return TACTICAL_BALANCE.minimumReadinessEfficiency + (1 - TACTICAL_BALANCE.minimumReadinessEfficiency) * normalized;
    }
    public get energyEfficiency() {
        const maximum = this.maxEnergy;
        if (maximum <= 0) return 0;
        const ratio = Math.max(0, Math.min(1, this.totalEnergy / maximum));
        return TACTICAL_BALANCE.minimumEnergyEfficiency
            + (1 - TACTICAL_BALANCE.minimumEnergyEfficiency) * ratio;
    }
    private get baseSupplyCapacity() {
        const cargo = this.ships
            .filter(ship => ship.state !== 'destroyed')
            .reduce((sum, ship) => sum + ship.definition.cargo * ship.statScale, 0);
        // Ten units of ship cargo form one shared supply unit. A new fleet
        // always starts with at least five supplies and scales with cargo.
        return Math.max(5, Math.ceil(cargo / 10) + this.skills.logistics * 10);
    }
    /** One shared supplies pool, growing with every surviving ship's cargo. */
    public get maxSupplies() {
        return this.baseSupplyCapacity + this.supplyCapacityBonus;
    }
    /** Legacy saves may assign a capacity; preserve the excess as a bonus. */
    public set maxSupplies(value: number) {
        this.supplyCapacityBonus = Math.max(0, Math.floor(value) - this.baseSupplyCapacity);
    }
    public get maxFuel() {
        return this.ships.filter(ship => ship.state !== 'destroyed').reduce((sum, ship) => sum + ship.maxFuelCapacity, 0);
    }
    public get totalEnergy() { return this.ships.filter(ship => ship.alive).reduce((sum, ship) => sum + ship.energy, 0); }
    public get maxEnergy() { return this.ships.filter(ship => ship.alive).reduce((sum, ship) => sum + ship.maxEnergy, 0); }
    public get maxShield() { return this.ships.filter(ship => ship.alive).reduce((sum, ship) => sum + ship.maxShield, 0); }
    public get fuelBurnPerDistance() {
        return TACTICAL_BALANCE.fuelPerDistance * this.ships.filter(ship => ship.alive)
            .reduce((sum, ship) => sum + Math.sqrt(Math.max(0.02, ship.statScale)), 0);
    }
    public get estimatedFuelRange() {
        const burn = this.fuelBurnPerDistance;
        return burn > 0 ? this.fuel / burn : 0;
    }
    public get signature() {
        let signature = this.ships.filter(ship => ship.alive)
            .reduce((sum, ship) => sum + ship.definition.signature * Math.sqrt(Math.max(0.02, ship.statScale)), 0);
        signature *= Math.max(0.6, 1 - this.skills.sensors * 0.08);
        if (this.isCloaked) signature *= 0.25;
        if (this.abilities.afterburner.active) signature *= TACTICAL_BALANCE.afterburnerSignatureMultiplier;
        if (this.fuel <= 0) signature *= TACTICAL_BALANCE.emptyFuelSignatureMultiplier;
        return Math.max(0.01, signature);
    }
    public getSkillLevel(skill: FleetSkillId) { return this.skills[skill] || 0; }
    public canLearnSkill(skill: FleetSkillId) { return this.skillPoints > 0 && !!FLEET_SKILLS[skill] && this.skills[skill] < this.level; }
    public learnSkill(skill: FleetSkillId) {
        if (!this.canLearnSkill(skill)) return false;
        this.skillPoints--;
        this.skills[skill]++;
        if (skill === 'leadership') this.commandCapacity += 3;
        if (skill === 'logistics') { this.supplies += 10; }
        return true;
    }
    /** Compatibility adapter while old economy and AI callers are migrated. */
    public get strength() { return this.ships.length ? this.threatRating : this.legacyBudget; }
    public set strength(value: number) { if (!this.ships.length) this.legacyBudget = Math.max(1, value); }
    public get maxStrength() { return this.ships.length ? this.threatRating : this.legacyBudget; }
    public set maxStrength(value: number) { if (!this.ships.length) this.legacyBudget = Math.max(1, value); }

    public ensureComposition() {
        if (this.ships.length > 0) return;
        this.ships = FleetGenerator.generate(this.legacyBudget, this.faction);
        this.selectedShipId = this.ships[0]?.id || null;
        this.fuel = this.maxFuel;
        this.supplies = this.maxSupplies;
        if (!this.isPlayer) {
            this.abilities.afterburner.charges = 1;
           this.abilities.mine.charges = 1;
            this.abilities.net.charges = Math.floor(Math.random() * 4);
           if (this.faction === 'military' || this.faction === 'mercenary') this.abilities.bubble.charges = 1;
            if (this.faction === 'raider') this.abilities.cloak.charges = 1;
        }
        this.clampAbilityChargesToCapacity();
    }

    public consumeFleetEnergyFraction(fraction: number) {
        const active = this.ships.filter(ship => ship.alive);
        const safeFraction = Math.max(0, fraction);
        if (!active.length || active.some(ship => ship.energy + 1e-6 < ship.maxEnergy * safeFraction)) return false;
        for (const ship of active) ship.spendEnergy(ship.maxEnergy * safeFraction);
        return true;
    }

    /** Consume a concrete pooled Energy amount, distributing it by current reserve. */
    public consumePooledEnergy(amount: number) {
        const active = this.ships.filter(ship => ship.alive);
        const requested = Math.max(0, amount);
        const available = active.reduce((sum, ship) => sum + ship.energy, 0);
        const consumed = Math.min(requested, available);
        if (consumed <= 0 || available <= 0) return 0;
        for (const ship of active) {
            ship.spendEnergy(consumed * ship.energy / available);
        }
        return consumed;
    }

    /** Spends a fraction of total maximum Energy, shared by current Energy reserves. */
    public consumePooledEnergyFraction(fraction: number) {
        const active = this.ships.filter(ship => ship.alive);
        const safeFraction = Math.max(0, fraction);
        if (!active.length) return false;
        const totalAvailable = active.reduce((sum, ship) => sum + ship.energy, 0);
        const cost = active.reduce((sum, ship) => sum + ship.maxEnergy, 0) * safeFraction;
        if (totalAvailable + 1e-6 < cost) return false;
        if (cost <= 0) return true;
        return this.consumePooledEnergy(cost) + 1e-6 >= cost;
    }

    public clampSuppliesToCapacity() {
        this.supplies = Math.max(0, Math.min(this.maxSupplies, this.supplies));
        return this.supplies;
    }

    public clampFuelToCapacity() {
        this.fuel = Math.max(0, Math.min(this.maxFuel, this.fuel));
        return this.fuel;
    }

    public addFuel(amount: number) {
        const previous = this.fuel;
        this.fuel = Math.min(this.maxFuel, Math.max(0, this.fuel + amount));
        return this.fuel - previous;
    }

    public setReadiness(value: number) {
        this.operationalReadiness = Math.max(0, Math.min(100, value));
    }

    public issueOrder(type: FleetOrderType, shipId?: string) {
        let targets = shipId ? this.ships.filter(ship => ship.id === shipId) : this.ships.filter(ship => ship.role !== 'flagship');
        if (type === 'repair') targets = this.ships.filter(ship => ship.role === 'support');
        if (type === 'protect') targets = this.ships.filter(ship => ship.role === 'defender');
        for (const ship of targets) ship.order = { type, issuedAt: this.tacticalClock };
    }

    public receiveTacticalDamage(amount: number, type: DamageType = 'energy', targetShipId?: string): number {
        this.ensureComposition();
        const alive = this.ships.filter(ship => ship.alive);
        this.lastTacticalDamage = 0;
        if (!alive.length) return 0;
        let target = alive.find(ship => ship.id === targetShipId) || alive[0];
        const defender = alive.find(ship => ship.role === 'defender' && ship.order.type === 'protect');
        if (defender && defender !== target && this.interceptCharges >= 1) {
            target = defender;
            this.interceptCharges -= 1;
        }
        const before = target.shield + target.armor + target.hull;
        const hullDamage = target.applyDamage(amount, type);
        const after = target.shield + target.armor + target.hull;
        this.lastTacticalDamage = Math.max(0, before - after);
        return hullDamage;
    }

    public get flagship() { return this.ships.find(ship => ship.role === 'flagship' && ship.alive) || this.ships.find(ship => ship.alive); }

    private refreshFleetState(dt = 0) {
        const defenders = this.ships.filter(ship => ship.alive && ship.role === 'defender' && ship.order.type === 'protect').length;
        const cap = defenders * (3 + this.skills.tactics);
        this.interceptCharges = Math.min(cap, this.interceptCharges + defenders * (0.75 + this.skills.tactics * 0.15) * dt);
    }

    setTarget(pos: Vector2) {
        this.target = pos;
        this.followTarget = null; // Clear follow mode when setting direct target
        this.followMode = null;
    }

    setFollowTarget(entity: Entity, mode: 'approach' | 'contact' = 'approach') {
        this.followTarget = entity;
        this.followMode = mode;
        this.target = null; // Will be set in update
    }

    stopFollowing() {
        this.followTarget = null;
        this.followMode = null;
        this.target = null;
    }

    private updateShieldCell(dt: number) {
        if (this.shieldCellRemaining <= 0 || this.shieldCellRate <= 0) return;
        const wanted = Math.min(this.shieldCellRemaining, this.shieldCellRate * Math.max(0, dt));
        let remaining = wanted;
       const targets = this.ships
           .filter(ship => ship.alive && ship.shield < ship.maxShield)
           .sort((a, b) => a.shield / Math.max(1, a.maxShield) - b.shield / Math.max(1, b.maxShield));
        if (targets.length === 0) {
            this.shieldCellRemaining = 0;
            this.shieldCellRate = 0;
            return;
        }
       for (const ship of targets) {
            if (remaining <= 0) break;
            const restored = ship.restoreShield(remaining);
            remaining -= restored;
        }
        this.shieldCellRemaining = Math.max(0, this.shieldCellRemaining - (wanted - remaining));
        if (this.shieldCellRemaining <= 1e-6) {
            this.shieldCellRemaining = 0;
            this.shieldCellRate = 0;
        }
    }

    update(dt: number) {
        this.tacticalClock += dt; this.ensureComposition();
        this.clampAbilityChargesToCapacity();
        this.clampSuppliesToCapacity();
        this.clampFuelToCapacity();
        this.netSlowTimer = Math.max(0, this.netSlowTimer - Math.max(0, dt));
        const activeShips = this.ships.filter(ship => ship.alive);
        const potentialEnergy = activeShips.reduce((sum, ship) => sum + Math.min(
            Math.max(0, ship.maxEnergy - ship.energy),
            ship.energyRecharge * this.readinessEfficiency * Math.max(0, dt)
        ), 0);
        const energyFuel = potentialEnergy * TACTICAL_BALANCE.energyFuelPerPoint;
        const energyRechargeMultiplier = energyFuel > 0 ? Math.min(1, this.fuel / energyFuel) : 0;
        let energyRestored = 0;
        for (const ship of this.ships) {
            energyRestored += ship.update(dt, this.readinessEfficiency, energyRechargeMultiplier);
        }
        this.fuel = Math.max(0, this.fuel - energyRestored * TACTICAL_BALANCE.energyFuelPerPoint);
        this.updateShieldCell(dt);
        if (this.velocity.mag() > 5) {
            const afterburnerMultiplier = this.abilities.afterburner.active ? TACTICAL_BALANCE.afterburnerFuelMultiplier : 1;
            const fuelUse = this.velocity.mag() * dt * this.fuelBurnPerDistance * afterburnerMultiplier;
            this.fuel = Math.max(0, this.fuel - fuelUse);
        }
        const inCombat = this.state === 'combat' || this.currentTarget !== null;
        if (inCombat) this.setReadiness(this.operationalReadiness - TACTICAL_BALANCE.combatReadinessPerSecond * dt);
        if (this.abilities.afterburner.active) {
            this.setReadiness(this.operationalReadiness - TACTICAL_BALANCE.afterburnerReadinessPerSecond * dt);
        } else if (!inCombat && this.operationalReadiness < 100 && this.supplies > 0) {
            const recovery = Math.min(TACTICAL_BALANCE.readinessRecoveryPerSecond * dt, 100 - this.operationalReadiness, this.supplies * TACTICAL_BALANCE.readinessPerSupply);
            this.setReadiness(this.operationalReadiness + recovery);
            this.supplies = Math.max(0, this.supplies - recovery / TACTICAL_BALANCE.readinessPerSupply);
        }
        RepairService.update(this, dt, inCombat);
        this.refreshFleetState(dt);
        // Sanitize position and velocity to prevent NaN errors
        if (!isFinite(this.position.x) || !isFinite(this.position.y)) this.position = new Vector2(0, 0);
        if (!isFinite(this.velocity.x) || !isFinite(this.velocity.y)) this.velocity = new Vector2(0, 0);

        if (this.decisionTimer > 0) this.decisionTimer -= dt;
        if (this.civilianStopTimer > 0) this.civilianStopTimer -= dt;

        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.velocity = this.velocity.scale(0.5); // Rapidly bleed velocity
            if (this.velocity.mag() < 1) this.velocity = new Vector2(0, 0);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Civilian stop at planets
        if (this.faction === 'civilian' && this.civilianStopTimer > 0) {
            this.velocity = new Vector2(0, 0);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Tick abilities
        for (const key in this.abilities) {
            const a = (this.abilities as any)[key];
            if (a.cooldown > 0) a.cooldown -= dt;
            if (a.active) {
                a.timer -= dt;
                if (a.timer <= 0) {
                    a.active = false;
                    if (key === 'cloak') this.isCloaked = false;
                    const definition = ABILITY_DEFINITIONS[key as keyof typeof ABILITY_DEFINITIONS];
                    if (definition.readinessCost > 0) {
                        this.setReadiness(this.operationalReadiness - definition.readinessCost);
                    }
                }
            }
        }

        if (this.state === 'combat') {
            // Safety fallback: if battle is missing or finished, reset state
            if (!this.activeBattle) {
                this.state = 'normal';
                return;
            }
            this.combatTimer -= dt;
            // NPCs keep their tactical engagement orbit, while the player may
            // still steer the flagship/flotilla in real time during combat.
            // The normal movement code below applies the combat speed cap and
            // still honours direct targets and manual steering.
            if (!this.isPlayer) {
                this.velocity = this.velocity.scale(0.9);
                this.position = this.position.add(this.velocity.scale(dt));
                return;
            }
        }

        let currentMaxSpeed = this.maxSpeed * (this.isPlayer ? 1 + this.skills.navigation * 0.04 : 1);

        // Dense debris makes navigation slower inside the outer belt.
        if (this.inAsteroidBelt) currentMaxSpeed *= 0.5;

        // Ability modifiers
        if (this.abilities.afterburner.active) {
            currentMaxSpeed *= TACTICAL_BALANCE.afterburnerSpeedMultiplier;
        }
        if (this.fuel <= 0) currentMaxSpeed *= TACTICAL_BALANCE.emergencySpeedMultiplier;
        currentMaxSpeed *= this.readinessEfficiency;
        currentMaxSpeed *= this.energyEfficiency;
        if (this.netSlowTimer > 0) currentMaxSpeed *= TACTICAL_BALANCE.netSpeedMultiplier;
        if (this.abilities.bubble.active) {
            currentMaxSpeed *= 0.5;
        }

        // External bubble effect
        if (this.isBubbled) {
            currentMaxSpeed *= 0.1;
            // Instantly slow down velocity if it's faster than new max speed
            const maxVel = currentMaxSpeed;
            if (this.velocity.mag() > maxVel) {
                this.velocity = this.velocity.normalize().scale(maxVel);
            }
        }

        // Trader speed penalty (Heavy Cargo)
        if (this.faction === 'trader') {
            currentMaxSpeed *= 0.3;
        }

        // Combat speed limit: if under attack, speed cannot exceed 90% of base max
        if (this.currentTarget) {
            const baseMaxSpeed = this.maxSpeed;
            const combatSpeedCap = baseMaxSpeed * 0.9;
            currentMaxSpeed = Math.min(currentMaxSpeed, combatSpeedCap);
            // Instantly slow down velocity if it's faster than combat speed cap
            if (this.velocity.mag() > combatSpeedCap) {
                this.velocity = this.velocity.normalize().scale(combatSpeedCap);
            }
        }
        this.isBubbled = false; // Reset for next frame

        // Stationary fleets still use the normal Fleet update path. Avoid
        // intercept calculations such as distance / maxSpeed when their
        // configured speed is zero, and keep them fully immobile.
        if (currentMaxSpeed <= 0) {
            this.velocity = new Vector2(0, 0);
            this.target = null;
            this.lastAcceleration = new Vector2(0, 0);
            return;
        }

        // If following another entity, update target to an intercept point
        if (this.followTarget) {
            const targetPos = this.followTarget.position;
            const targetVel = this.followTarget.velocity;
            const targetAcc = (this.followTarget instanceof Fleet) ? this.followTarget.lastAcceleration : new Vector2(0, 0);
            const myPos = this.position;
            const maxSpeed = currentMaxSpeed;

            // Iterative Intercept (Accounts for Acceleration)
            // We do a few passes to find a stable time 't'
            let t = 0;
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
                // Future position: P + V*t + 0.5*A*t^2
                // We clamp the acceleration time lookahead to 2s to avoid extreme overshooting
                const tAcc = Math.min(t, 2);
                const futurePos = targetPos
                    .add(targetVel.scale(t))
                    .add(targetAcc.scale(0.5 * tAcc * tAcc));

                const dist = futurePos.sub(myPos).mag();
                t = dist / maxSpeed;

                // Clamp lookahead to 10s to avoid crazy predictions
                if (t > 10) {
                    t = 10;
                    break;
                }
            }

            // Calculate final intercept point
            const tAccFinal = Math.min(t, 2);
            let interceptPoint = targetPos
                .add(targetVel.scale(t))
                .add(targetAcc.scale(0.5 * tAccFinal * tAccFinal));

            // Hybrid Pursuit/Intercept:
            // At long distances, steer more towards the actual current position 
            // to avoid flying "too parallel" and actually close the distance faster.
            const directDist = targetPos.sub(myPos).mag();
            const interceptWeight = Math.max(0, Math.min(1, 1 - (directDist - 500) / 2000));
            // 1.0 (full intercept) at 500 units, 0.0 (full pursuit) at 2500 units.

            const finalAimedPoint = targetPos.scale(1 - interceptWeight).add(interceptPoint.scale(interceptWeight));

            // Calculate effective follow distance
            const effectiveFollowDist = this.followDistance + this.followTarget.radius;

            if (this.manualSteerTarget) {
                // Manual nudge: prioritize player input over calculated intercept
                this.target = this.manualSteerTarget;
            } else if (this.followMode === 'approach') {
                const toTarget = finalAimedPoint.sub(myPos);
                const dist = toTarget.mag();
                if (dist > effectiveFollowDist) {
                    const dir = toTarget.normalize();
                    this.target = finalAimedPoint.sub(dir.scale(effectiveFollowDist));
                } else {
                    this.target = null;
                }
            } else {
                // Contact mode: Directly to aimed point
                this.target = finalAimedPoint;
            }
        }

        if (this.target) {
            const toTarget = this.target.sub(this.position);
            const dist = toTarget.mag();

            if (dist < this.stopThreshold) {
                this.target = null;
                this.velocity = new Vector2(0, 0); // Snap stop
            } else {
                const dir = toTarget.normalize();

                const desired = dir.scale(currentMaxSpeed);
                // Arrive logic (skip if manually steering for "thrust" feeling)
                const slowRadius = 200;
                if (dist < slowRadius && !this.manualSteerTarget) {
                    desired.x *= (dist / slowRadius);
                    desired.y *= (dist / slowRadius);
                }

                const steering = desired.sub(this.velocity);

                // Acceleration depends on size (larger is slower to accelerate)
                // Snappier responsiveness: 1.2 base
                let responsiveness = 1.2;
                if (this.abilities.afterburner.active) responsiveness *= 1.5;

                let steerForce = steering.scale(responsiveness * dt);
                if (!isFinite(steerForce.x) || !isFinite(steerForce.y)) steerForce = new Vector2(0, 0);
                this.velocity = this.velocity.add(steerForce);
                this.lastAcceleration = steerForce.scale(1 / dt);
            }
        } else {
            // Friction/Drag when no target
            this.velocity = this.velocity.scale(0.95); // simple drag
            this.lastAcceleration = new Vector2(0, 0);
        }

        // Apply Velocity
        this.position = this.position.add(this.velocity.scale(dt));

        // Final sanitization to prevent NaN errors
        if (!isFinite(this.position.x) || !isFinite(this.position.y)) this.position = new Vector2(0, 0);
        if (!isFinite(this.velocity.x) || !isFinite(this.velocity.y)) this.velocity = new Vector2(0, 0);

        // Update Rotation (Smooth turn towards velocity)
        if (this.velocity.mag() > 1) {
            const desiredAngle = Math.atan2(this.velocity.y, this.velocity.x);
            // Simple approach: Set rotation directly for now.
            // Better: Lerp rotation. But instant is fine for this style.
            this.rotation = desiredAngle;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        if (this.isCloaked) {
            ctx.globalAlpha = 0.1;
        }

        if (this.ships.length) { this.drawTacticalFleet(ctx, camera); ctx.restore(); return; }

        ctx.rotate(this.rotation + Math.PI / 2); // +90deg because drawing points up

        // Draw Ship (Perfect Warp Bubble)
        ctx.beginPath();
        const baseRadius = 8;
        const shipRadius = baseRadius;
        ctx.arc(0, 0, shipRadius, 0, Math.PI * 2);

        // Calculate highlight relative to the sun (0,0)
        const toSun = new Vector2(-this.position.x, -this.position.y);
        const angleToSun = Math.atan2(toSun.y, toSun.x);
        // Ship is already rotated by (this.rotation + Math.PI / 2)
        const currentRotation = this.rotation + Math.PI / 2;
        const relAngle = angleToSun - currentRotation;

        const hOffset = shipRadius * 0.4;
        const hX = Math.cos(relAngle) * hOffset;
        const hY = Math.sin(relAngle) * hOffset;

        // Fill with Gradient for "Bubble" effect
        const grad = ctx.createRadialGradient(hX, hY, shipRadius * 0.1, 0, 0, shipRadius);
        grad.addColorStop(0, '#FFFFFF'); // Highlight
        grad.addColorStop(0.5, this.color);
        grad.addColorStop(1, '#000033'); // Darker edge
        ctx.fillStyle = grad;
        ctx.fill();

        // Combat Flashes
        if (this.state === 'combat' && Math.sin(this.tacticalClock * 13 + this.position.x * 0.01) > 0.45) {
            ctx.fillStyle = 'white';
            ctx.fill();
        }

        // High contrast stroke with glow
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = this.state === 'combat' ? 20 : 8;
        ctx.shadowColor = this.state === 'combat' ? '#FFFFFF' : this.color;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset after stroke

        // Directional Indicator (Centered Arrow)
        ctx.beginPath();
        const arrowSize = 4;
        ctx.moveTo(0, -arrowSize * 1.25); // Front
        ctx.lineTo(arrowSize * 0.75, arrowSize * 0.75);
        ctx.lineTo(-arrowSize * 0.75, arrowSize * 0.75);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();

        // Engine Glow/Trail (Behind)
        if (this.velocity.mag() > 10 && this.state !== 'combat') {
            ctx.beginPath();
            ctx.moveTo(-arrowSize, arrowSize * 1.75);
            ctx.quadraticCurveTo(0, arrowSize * 3, arrowSize, arrowSize * 1.75);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.restore();

        // Draw Attack Line - If attacking
        if (this.currentTarget && !this.currentTarget.isCloaked) {
            const targetScreenPos = camera.worldToScreen(this.currentTarget.position);
            const myScreenPos = camera.worldToScreen(this.position);

            // Pulsing attack line with particles
            const time = this.tacticalClock * 5;
            const pulse = 0.5 + 0.5 * Math.sin(time);
            const alpha = 0.8 + 0.2 * Math.sin(time * 2);

            // Main attack line
            ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
            ctx.lineWidth = 3 + pulse * 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';

            ctx.beginPath();
            ctx.moveTo(myScreenPos.x, myScreenPos.y);
            ctx.lineTo(targetScreenPos.x, targetScreenPos.y);
            ctx.stroke();

            // Energy particles along the line
            const dist = Math.sqrt((targetScreenPos.x - myScreenPos.x) ** 2 + (targetScreenPos.y - myScreenPos.y) ** 2);
            const numParticles = Math.floor(dist / 20);
            for (let i = 0; i < numParticles; i++) {
                const t = i / numParticles;
                const wave = Math.sin(i * 12.9898 + this.tacticalClock * 7.1);
                const crossWave = Math.cos(i * 8.233 + this.tacticalClock * 5.7);
                const x = myScreenPos.x + (targetScreenPos.x - myScreenPos.x) * t + wave * 5;
                const y = myScreenPos.y + (targetScreenPos.y - myScreenPos.y) * t + crossWave * 5;
                const size = 1 + (wave * 0.5 + 0.5) * 2;
                ctx.fillStyle = `rgba(255, 150, 0, ${0.15 + (crossWave * 0.5 + 0.5) * 0.35})`;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0; // Reset shadow
        }

        // Draw Target Marker (Bubble) - Only for Player
        if (this.isPlayer && this.target) {
            const tPos = camera.worldToScreen(this.target);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.arc(tPos.x, tPos.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner dot (softer)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(tPos.x, tPos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private drawTacticalFleet(ctx: CanvasRenderingContext2D, camera: Camera) {
        const alive = this.ships.filter(ship => ship.alive);
        const velocityAngle = this.velocity.mag() > 1 ? Math.atan2(this.velocity.y, this.velocity.x) + Math.PI / 2 : this.rotation + Math.PI / 2;
        const iconShip = this.flagship || alive[0];
        if (!iconShip) return;
        ctx.save(); ctx.rotate(velocityAngle);
        this.drawShipSilhouette(ctx, iconShip.role, this.isPlayer, iconShip.hitFlash);
        if (iconShip.shieldFlash > 0) {
                ctx.strokeStyle = `rgba(80, 210, 255, ${iconShip.shieldFlash * 0.85})`; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.ellipse(0, 0, 13, 18, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (this.velocity.mag() > 20) {
                const flicker = 4 + 2 * Math.sin(this.tacticalClock * 17);
                ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.beginPath();
                ctx.moveTo(-4, 10); ctx.lineTo(-3, 10 + flicker); ctx.moveTo(4, 10); ctx.lineTo(3, 10 + flicker); ctx.stroke();
        }
        ctx.restore();
        if (this.currentTarget && !this.currentTarget.isCloaked) {
            const targetScreen = camera.worldToScreen(this.currentTarget.position);
            const originScreen = camera.worldToScreen(this.position);
            const tx = targetScreen.x - originScreen.x, ty = targetScreen.y - originScreen.y;
            const phase = (this.tacticalClock * 1.7) % 1;
            ctx.strokeStyle = 'rgba(255,100,60,.28)'; ctx.setLineDash([3, 10]);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#ffe0a8'; ctx.shadowColor = '#ff5a2a'; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(tx * phase, ty * phase, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        }
    }

    public drawThreatIndicator(ctx: CanvasRenderingContext2D, camera: Camera, referenceThreat: number) {
        if (!this.ships.some(ship => ship.state !== 'destroyed')) return;
        const screen = camera.worldToScreen(this.position);
        const ratio = this.isPlayer ? 1 : this.threatRating / Math.max(1, referenceThreat);
        const level = this.isPlayer ? 0 : ratio < 0.55 ? 1 : ratio < 1.5 ? 2 : ratio < 6 ? 3 : 4;
        const color = this.isPlayer ? '#55d8ff' : level === 1 ? '#67dc88' : level === 2 ? '#ffe06b' : level === 3 ? '#ffad5c' : '#ff5f63';
        const progress = this.isPlayer ? 1 : level === 1 ? 0.25 : level === 2 ? 0.5 : level === 3 ? 0.75 : 1;
        const radius = 10 * Math.max(0.85, Math.min(1.15, camera.zoom));

        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(4, 10, 18, .82)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(screen.x, screen.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    private drawShipSilhouette(ctx: CanvasRenderingContext2D, role: Ship['role'], selected: boolean, hitFlash: number) {
        ctx.beginPath();
        if (role === 'defender') { ctx.moveTo(0, -13); ctx.lineTo(11, -4); ctx.lineTo(9, 10); ctx.lineTo(0, 7); ctx.lineTo(-9, 10); ctx.lineTo(-11, -4); }
        else if (role === 'artillery') { ctx.moveTo(0, -18); ctx.lineTo(5, -6); ctx.lineTo(7, 12); ctx.lineTo(0, 8); ctx.lineTo(-7, 12); ctx.lineTo(-5, -6); }
        else if (role === 'scout') { ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 5); ctx.lineTo(-7, 8); }
        else if (role === 'support') { ctx.moveTo(0, -10); ctx.lineTo(9, -1); ctx.lineTo(7, 11); ctx.lineTo(-7, 11); ctx.lineTo(-9, -1); }
        else if (role === 'striker') { ctx.moveTo(0, -15); ctx.lineTo(8, 10); ctx.lineTo(0, 6); ctx.lineTo(-8, 10); }
        else { ctx.moveTo(0, -16); ctx.lineTo(10, 7); ctx.lineTo(5, 11); ctx.lineTo(0, 7); ctx.lineTo(-5, 11); ctx.lineTo(-10, 7); }
        ctx.closePath(); ctx.fillStyle = hitFlash > 0 ? '#fff' : '#182434'; ctx.strokeStyle = selected ? '#fff' : this.color;
        ctx.lineWidth = selected ? 2.4 : 1.5; ctx.shadowColor = this.color; ctx.shadowBlur = selected ? 12 : 5;
        ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = this.color; ctx.fillRect(-2, -3, 4, 7);
    }
}
