# Document: Phased Development of New Combat System

## Introduction
The current combat system is turn-based and symmetrical (two sides), which limits dynamics. The new system introduces:
- **Real Time**: Damage and money are calculated continuously, with high precision (using fixed timestep for determinism).
- **Individual Attacks**: Each fleet chooses targets independently, without dividing into sides. Attacks are visualized with red flickering lines.
- **Bubbles**: Attacking fleet creates a static bubble that slows movement inside. The attacked responds without a bubble. Fleet can try to escape the bubble if attacker's bubble is on cooldown.
- **Optimization**: Use spatial indexes (quadtree) for target search, damage calculation batching, limit active combat count.

## Phase 1: Transition to Individual Attacks Without Sides
1. **Modify Battle.ts**: Remove sideA and sideB. Make combat individual: each fleet in combat attacks its nearest target, without dividing into sides.
2. **Update Fleet.ts**: Add `currentTarget: Fleet | null` field for current attack target. Modify target selection logic in update().
3. **Attack Lines Visualization**: In draw() add drawing of red flickering lines from attacking fleet to target. Use alpha animation for flickering.
4. **Integration in AIController.ts**: Adapt AI for individual target selection, without joining sides.

## Phase 2: Real-Time Damage Calculation Implementation
1. **Damage Model**: Transition from strength to detailed: HP, shields, armor. Damage is calculated per-frame (e.g. 60 FPS), but with accumulation for precision (like accumulatedDamage currently, but more detailed).
2. **Money**: Add looting system. On damage, attacker receives money proportional to damage (e.g. 10% of target's ship value). Money updates in real time, without delays.
3. **Optimization**: Use fixed timestep (e.g. 1/60 sec) for damage calculations to avoid FPS dependency. Batching: calculate damage for fleet groups together, using SIMD if possible.

## Phase 3: Combat Logic and Targets Rework
1. **Target Selection**: Remove sides. Each fleet scans nearby enemies (radius 1000 units) and chooses nearest target by priority (distance, faction, strength).
2. **Attack Logic**: When attack starts, fleet creates CombatZone around target. Attacked automatically responds, but without its bubble. Fleet in zone can stop attacking and leave zone (if bubble on cooldown).
3. **Target Switching**: After destroying target, fleet automatically seeks next nearest. Add timers to prevent switching spam.
4. **AI Adaptation**: Modify AIController.ts for new logic: instead of joining sides, individual target selection and bubble reaction.

## Phase 4: Bubble and Slow Effects Implementation
1. **Bubble Creation**: On attack, fleet creates CombatZone with radius (e.g. 500 units), inside which all fleets speed * 0.1. Bubble is static, doesn't follow fleet.
2. **Effects**: In CombatZone.update() apply slowdown to fleets inside. Attacked responds without bubble, but can use abilities (bubble for counter-slowdown).
3. **Escape from Bubble**: Add logic: if attacker's bubble is on cooldown (e.g. 5 sec after creation), fleet can leave zone by moving outward.
4. **Visuals**: Bubble as semi-transparent circle with particle effects, attack lines red, flickering (alpha animation).

## Phase 5: Testing and Performance Optimization
1. **Testing**: Create test scenarios (1v1, 5v5, mass battles) to check balance, performance (goal: <10ms/frame at 100+ fleets).
2. **Optimization**: Implement quadtree for target search (O(log n) instead of O(n^2)). Limit active zones (e.g. 50 simultaneously). Profiling with Chrome DevTools.
3. **Balance**: Tune damage, bubbles, money through config files, not hardcoded.

## Phase 6: UI and Economy Integration
1. **UI Updates**: In UIManager.ts add bubble indicators, attack lines. Show money in real time.
2. **Economy**: Integrate with inventory (Phase 3 Roadmap). Money from battles affects fuel/supply purchases.
3. **Saving**: Update SaveSystem.ts to store bubbles and active combats.

## Risks and Mitigation
- **Performance**: Early profiling, limits on zones/fleets.
- **Balance**: Iterative testing, metrics (average battle duration, economy).
- **Regressions**: Gradual migration, flags for old/new system.
