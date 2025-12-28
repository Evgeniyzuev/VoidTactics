# Factions and Their Structure

This document describes the faction system in VoidTactics.

## Faction Overview

| Faction | Color | Behavior | Stealth/Visibility |
|---------|-------|----------|--------------------|
| **Player** | Blue (#00AAFF) | Player-controlled | Always visible to self |
| **Civilian** | Green (#32CD32) | **Peaceful Travelers**: Fly between planets with 2-6 second stops at each | Always visible |
| **Military** | Yellow (#FFFF00) | **Defensive Guardians**: Coordinate group attacks on threats, join allies in combat, prioritize center defense | Always visible |
| **Pirate** | Red (#FF4444) | Aggressive roaming, hunts weak targets | Always visible |
| **Orc** | Purple (#9370DB) | Highly aggressive, fights almost everyone | Always visible |
| **Raider** | Grey (#888888) | **Elite Aggressor**: Never flees, attacks larger fleets | **Hidden**: Info is `???` until contact distance |

## Faction Relationships (`isHostile` / `isAlly`)

Relationships are defined in `src/core/Game.ts`:

- **Hostility**:
    - **Raiders** are hostile to ALL other factions (except themselves).
    - **Orcs** are hostile to everyone except other Orcs (they fight each other 10% of the time).
    - **Pirates** are hostile to Civilians, Military, and Player.
    - **Military** is hostile to Pirates, Orcs, Raiders, and anyone attacking Civilians.
    - **Civilians** are neutral unless attacked or seeing an ally attacked.
    - **Player** is hostile to Pirates, Orcs, and Raiders.

- **Alliances**:
    - **Military** and **Civilians** are always allies.
    - Factions of the same type (except Orcs/Raiders occasionally) are allies.

## AI Implementation (`AIController`)

The AI behavior is implemented in `src/core/AIController.ts` (separated from Game.ts for better maintainability):

- **Fleeing**: NPCs evaluate "closestThreat" (hostile and stronger). Most factions flee, but **Raiders** skip this check and never retreat.
- **Targeting**: NPCs look for "bestTarget" (hostile and weaker).
    - Normal factions only target fleets where `other.strength < npc.strength * 0.8`.
    - **Raiders** can target fleets up to `1.5x` their strength and have a `20%` chance to ignore strength entirely and attack anyway.
    - **Opportunistic Targeting**: **Pirates**, **Orcs**, **Military**, and **Raiders** will target weakened enemies in ongoing battles if `other.strength < npc.strength * 0.6`.
- **Chase Management**: NPCs give up pursuit if the target is escaping the system (position magnitude > 0.8 * system radius and moving outward), redirecting toward the system center instead of continuing futile chases.
- **Roaming**: Factions have preferred POIs.
    - Civilians/Military stay near planets.
    - Pirates/Orcs hang around Asteroids and Outpost Alpha.

## Technical Structure in Code

1.  **Type Definition**:
    - `src/entities/Fleet.ts`: Contains the `Faction` union type.
2.  **State Management**:
    - `Fleet.faction`: A property in the `Fleet` class.
3.  **Core Logic (`src/core/Game.ts`)**:
    - `isHostile(a, b)`: Logic for determining enemies.
    - `isAlly(a, b)`: Logic for determining friends.
    - `processAI()`: The main decision loop.
    - `showTooltip()`: Handles the visibility rule (specifically for Raiders).
    - `spawnNPCs()`: Assigns faction types and colors when creating new fleets.
