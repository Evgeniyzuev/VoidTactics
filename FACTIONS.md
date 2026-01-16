# Factions and Their Life Simulation Structure

This document describes the advanced faction system in VoidTactics, designed to create a living, breathing universe similar to *Space Rangers* or *Starsector*.

## Faction Roles & Behaviors

| Faction | Color | Role | Aggression | Special Behavior |
|---------|-------|------|------------|------------------|
| **Player** | Blue | Freelancer | N/A | Can choose to be a hero, pirate, or trader. |
| **Civilian** | Green | Transporter | Very Low | Moves between planets. Flees easily. Often travels in pairs. |
| **Trader** | Cyan | Economy Hub | Low | Heavily armored, carries large amounts of credits. Usually has an escort. |
| **Military** | Yellow | Peacekeeper | High (vs Threats) | **Call for Backup**: Allies converge to help. Never flees if allies are fighting. |
| **Mercenary** | Orange | Bounty Hunter | Medium | Hunts Pirates and Orcs. Neutral to others unless paid/provoked. |
| **Pirate** | Red | Scavenger | High | Attacks traders and weak civilians. Hits and runs. |
| **Orc** | Purple | Warlord | Extreme | Attacks everyone. Occasionally fights own kind for dominance. |
| **Raider** | Grey | Elite Hunter | Lethal | **Hidden Presence**. Attacks larger fleets. Uses Cloak/Afterburner. |

## Life Simulation Mechanics

### 1. Risk Assessment (The "Predator-Prey" Logic)
AI fleets evaluate their targets and threats with high precision:
- **Calculation**: Score = `(Own Strength / Target Strength) * Distance_Factor * Faction_Multiplier`.
- **Engagement**: Most AI will only engage if they have a >20% strength advantage.
- **Panic**: Civilians and Traders flee if a hostile is within 1500 units, even if they are technically "stronger" (due to lack of combat training).

### 2. The Hero's Journey (Player Income)
- **Bounties**: Destroying Pirates, Orcs, or Raiders earns the player credits from the Military.
- **Rescue**: Helping a Civilian or Trader fleet being attacked by Pirates grants a "Gratitude Reward" (credits or faction standing).
- **Protection**: Moving near a Trader might trigger them to follow you for temporary protection, paying for the service.

### 3. Faction Logic (Deep Simulation)

#### **Military: The Thin Yellow Line**
- **Guardian Instinct**: If any Military/Civilian/Trader fleet is in combat, all Military fleets within 4000 units abandon their roaming and rush to the coordinate.
- **Stand Your Ground**: Military units do not have a "flee" state if an ally is within 1000 units. They fight to the death to protect the convoy.

#### **Pirates: Cowardly Aggressors**
- **Scavenging**: Pirates prefer targets that are already weakened by other battles.
- **Hit and Run**: If a Pirate's strength drops below 40%, they immediately use **Afterburner** to flee, abandoning their target.

#### **Raiders: The True Terror**
- **Ambush**: Use **Cloak** to approach targets. They appear on radar only when it's too late.
- **No Surrender**: Completely lack the "flee" code. They are programmed for destruction.

## Strategic Relationships

| Faction | Favors | Hostile To |
|---------|--------|------------|
| **Military** | Civilians, Traders, Player* | Pirates, Orcs, Raiders |
| **Civilians** | Military, Player* | Pirates, Orcs, Raiders |
| **Mercenaries**| (Whoever pays) | Pirates, Orcs (Bounty targets) |
| **Pirates** | Orcs (Neutral) | Civilians, Traders, Military, Player |
| **Orcs** | None | Everyone (including Orcs 10% of the time) |

*\*Relationship with Player depends on player actions (implied standing).*

## AI Abilities Usage

- **Afterburner**: Used by fleeing fleets to escape or by Raiders to close the gap.
- **Cloak**: Primary tool for Raider ambushes.
- **Bubble**: Used by Military to trap fleeing criminals.

## Future Roadmap (AI Evolution)
1. **Dynamic Economies**: Traders moving goods between planets affects planet-side prices.
2. **System Distress Signals**: Visual alerts on the UI when a civilian is under attack.
3. **Escort Formations**: AI fleets grouping up and moving in formation.
