export interface FleetLootInput {
    shipCount: number;
    commandCost: number;
    fuelCapacity: number;
    cargoCapacity: number;
}

export interface FleetLootProfile {
    fuelChance: number;
    suppliesChance: number;
    fuelMin: number;
    fuelMax: number;
    suppliesMin: number;
    suppliesMax: number;
}

export interface FleetLootRoll {
    fuel: number;
    supplies: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Returns the recoverable part of a destroyed fleet's logistics stock.
 *
 * The quantities scale from the ships' actual tanks and cargo rather than
 * from combat power. This keeps a large convoy worth salvaging without
 * making a high-damage glass cannon drop an excessive amount of resources.
 */
export function getFleetLootProfile(input: FleetLootInput): FleetLootProfile {
    const shipCount = Math.max(1, Math.floor(input.shipCount));
    const commandCost = Math.max(shipCount, input.commandCost);
    const fuelCapacity = Math.max(0, input.fuelCapacity);
    const cargoCapacity = Math.max(0, input.cargoCapacity);
    const sizeScore = Math.max(
        1,
        commandCost,
        shipCount * 2,
        fuelCapacity / 90,
        cargoCapacity / 30
    );

    const fuelChance = clamp(0.32 + sizeScore * 0.035, 0.32, 0.75);
    const suppliesChance = clamp(
        0.18 + sizeScore * 0.025 + Math.min(0.12, cargoCapacity / 1200),
        0.18,
        0.62
    );

    const fuelMin = Math.max(6, Math.round(fuelCapacity * 0.06));
    const fuelMax = Math.max(
        fuelMin,
        Math.round(fuelCapacity * (0.12 + 0.01 * Math.min(4, sizeScore / 4)))
    );
    const suppliesMin = Math.max(1, Math.round(cargoCapacity * 0.035));
    const suppliesMax = Math.max(
        suppliesMin,
        Math.round(cargoCapacity * (0.07 + 0.01 * Math.min(4, sizeScore / 4)))
    );

    return { fuelChance, suppliesChance, fuelMin, fuelMax, suppliesMin, suppliesMax };
}

function randomInteger(min: number, max: number, random: () => number): number {
    const roll = clamp(random(), 0, 0.999999);
    return min + Math.floor(roll * (max - min + 1));
}

/** Roll fuel and supplies independently so a wreck can contain either, both, or neither. */
export function rollFleetLoot(
    input: FleetLootInput,
    random: () => number = Math.random
): FleetLootRoll {
    const profile = getFleetLootProfile(input);
    const fuel = random() < profile.fuelChance
        ? randomInteger(profile.fuelMin, profile.fuelMax, random)
        : 0;
    const supplies = random() < profile.suppliesChance
        ? randomInteger(profile.suppliesMin, profile.suppliesMax, random)
        : 0;
    return { fuel, supplies };
}
