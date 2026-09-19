import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/Game';
import { Fleet } from '../src/entities/Fleet';
import { ResourceCrate } from '../src/entities/ResourceCrate';
import { Ship } from '../src/tactical/Ship';
import { getFleetLootProfile } from '../src/tactical/LootBalance';

function lootGame() {
    const game = Object.create(Game.prototype) as Game & Record<string, any>;
    game.crates = [];
    game.debris = [];
    game.entities = [];
    return game;
}

function wreck() {
    const fleet = new Fleet(100, 200, '#f55');
    fleet.ships = [new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] })];
    return fleet;
}

describe('wreck containers', () => {
    it('gives a small wreck an independent supply-only container drop', () => {
        const fleet = wreck();
        const profile = getFleetLootProfile({
            shipCount: fleet.ships.length,
            commandCost: fleet.commandUsed,
            fuelCapacity: fleet.maxFuel,
            cargoCapacity: fleet.ships[0].cargoCapacity
        });
        expect(profile.suppliesChance).toBeGreaterThan(0.35);

        const game = lootGame();
        const random = vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0.99) // no fuel
            .mockReturnValueOnce(0) // supplies drop
            .mockReturnValueOnce(0) // minimum quantity
            .mockReturnValueOnce(0.99); // no ability cache
        try {
            game.spawnFleetLoot(fleet);
        } finally {
            random.mockRestore();
        }

        expect(game.crates).toHaveLength(1);
        expect(game.crates[0]).toBeInstanceOf(ResourceCrate);
        expect(game.crates[0].fuel).toBe(0);
        expect(game.crates[0].supplies).toBeGreaterThan(0);
        expect(game.crates[0].position.x).toBe(fleet.position.x - 24);
    });

    it('places fuel, supplies, and ability caches at distinct points', () => {
        const game = lootGame();
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            game.spawnFleetLoot(wreck());
        } finally {
            random.mockRestore();
        }

        expect(game.crates).toHaveLength(3);
        expect(new Set(game.crates.map((crate: ResourceCrate) =>
            `${crate.position.x},${crate.position.y}`
        )).size).toBe(3);
    });
});
