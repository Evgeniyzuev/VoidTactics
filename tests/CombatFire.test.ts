import { describe, expect, it, vi } from 'vitest';
import { Attack } from '../src/core/Attack';
import { Game } from '../src/core/Game';
import { Fleet } from '../src/entities/Fleet';
import { Ship } from '../src/tactical/Ship';
import { Vector2 } from '../src/utils/Vector2';

function combatGame(player: Fleet) {
    return {
        getPlayerFleet: () => player,
        getBubbleZones: () => [],
        getAttacks: () => [],
        addCombatShot: vi.fn(),
        awardPlayerMoney: vi.fn(),
        awardPlayerExperience: vi.fn(),
        getCombatDamageExperience: () => 0,
        spawnDebris: vi.fn(),
        reportCombatSilence: vi.fn(),
        reportCombatStop: vi.fn()
    } as unknown as Game;
}

describe('player fleet fire', () => {
    it('resolves a mixed multi-ship volley as one fleet-level shot', () => {
        const player = new Fleet(0, 0, '#fff', true);
        player.ships.push(new Ship({ hullId: 'lance', weaponIds: ['missile'], moduleIds: [] }));
        const target = new Fleet(50, 0, '#f55');
        target.ships = [new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] })];
        target.ships[0].shield = 0;
        target.ships[0].armor = 0;
        const game = combatGame(player);
        const hullBefore = target.ships[0].hull;

        new Attack(player, target, game).update(0.1);

        expect(game.addCombatShot).toHaveBeenCalledTimes(1);
        expect(target.ships[0].hull).toBeLessThan(hullBefore);
    });

    it('can fire after evacuation recovery', () => {
        const player = new Fleet(0, 0, '#fff', true);
        player.ships[0].state = 'disabled';
        player.ships[0].hull = 0;
        const game = Object.create(Game.prototype) as Game & Record<string, any>;
        game.playerFleet = player;
        game.npcFleets = [];
        game.worldEvents = [];
        game.attacks = [];
        game.bubbleZones = [];
        game.entities = [];
        game.expedition = {
            beginRecovery: () => ({ safeNodeId: 'safe', cargoLossFraction: 0, readinessPenalty: 0 }),
            getNode: () => null
        };
        game.camera = { position: new Vector2(0, 0) };
        game.ui = { addEvent: vi.fn(), updateFleet: vi.fn() };
        game.saveGame = vi.fn();

        game.recoverPlayerFleet();

        const target = new Fleet(player.position.x + 50, player.position.y, '#f55');
        target.ships = [new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] })];
        const battleGame = combatGame(player);
        new Attack(player, target, battleGame).update(0.1);

        expect(player.ships[0].order.type).toBe('escort');
        expect(battleGame.addCombatShot).toHaveBeenCalled();
    });

    it.each([
        { reason: 'all operational ships are ordered to retreat or repair', prepare: (fleet: Fleet) => { fleet.ships[0].order = { type: 'retreat', issuedAt: 0 }; } },
        { reason: 'insufficient Energy', prepare: (fleet: Fleet) => { fleet.ships[0].energy = 0; fleet.fuel = 0; } }
    ])('reports prolonged silence caused by $reason', ({ reason, prepare }) => {
        const player = new Fleet(0, 0, '#fff', true);
        prepare(player);
        const target = new Fleet(50, 0, '#f55');
        target.ships = [new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] })];
        const game = combatGame(player);

        new Attack(player, target, game).update(1.1);

        expect(game.addCombatShot).not.toHaveBeenCalled();
        expect(game.reportCombatSilence).toHaveBeenCalledWith(reason, expect.any(Attack));
    });

    it('records when an active attack ends because the target leaves interception range', () => {
        const player = new Fleet(0, 0, '#fff', true);
        const target = new Fleet(50, 0, '#f55');
        target.ships = [new Ship({ hullId: 'lance', weaponIds: ['pulse'], moduleIds: [] })];
        const game = combatGame(player);
        const attack = new Attack(player, target, game);
        target.position = new Vector2(250, 0);

        attack.update(0.1);

        expect(attack.finished).toBe(true);
        expect(game.reportCombatStop).toHaveBeenCalledWith('target left interception range', attack);
    });
});
