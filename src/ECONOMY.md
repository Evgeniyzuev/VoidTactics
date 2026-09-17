# VoidTactics: economy loop

## Three resources, three decisions

- **Fuel** is the expedition resource. It pays for strategic jumps, local
  movement, Energy recovery and the 2.5x afterburner burn. At zero fuel the
  fleet remains mobile, but only at emergency speed; afterburner and Energy
  recovery are unavailable.
- **Supplies** are the maintenance resource. They pay for disabled-ship
  stabilization, field hull/armor repair, ammunition and readiness recovery.
  A support ship converts supplies and Energy into repairs, so a large fleet
  needs both cargo and a support role.
- **Energy** is the tactical reserve of the ships themselves. Weapons, shield
  regeneration, scan pulse and active systems consume it. Energy is restored
  by the ships over time and that restoration consumes fuel; Terra can refill
  shield and Energy for free.

This makes the resources complementary: fuel gets the fleet to the next
decision, Energy determines whether it can win that decision, and supplies
determine whether it can continue after taking damage.

## Wreck drops

Destroyed NPC fleets roll fuel and supplies independently. A wreck may contain
neither, one, or both caches. The chance and amount use the destroyed fleet's
ship count, command cost, total fuel capacity and cargo capacity:

- fuel chance is bounded between 32% and 75%;
- supplies chance is bounded between 18% and 62%;
- fuel amount is approximately 6–16% of the wreck's total tank capacity;
- supplies amount is approximately 3.5–11% of the wreck's cargo capacity.

The amount is an integer random roll inside the fleet-size range. This keeps a
small scout from printing resources while making a convoy or war fleet worth
the risk. Fuel caches are yellow, supply caches are green, and mixed event
caches keep the gold colour.

## Money sinks and progression

Terra remains the reliable reset point, but returning there has an opportunity
cost. Current service prices are:

| Service | Price |
|---|---:|
| Fuel | $0.4 / unit |
| Supplies | $5 / unit |
| Ammunition | $0.2 / unit |
| Hull | $0.6 / unit |
| Armor | $0.4 / unit |
| Shield and Energy | free |

Logistics increases supply capacity, Engineering improves field repair speed,
Navigation increases travel speed, and new hulls increase fuel tanks, cargo and
combat capacity. The useful choice is therefore not to hoard one resource: it
is to decide whether the next cache is spent on a safer route, a tactical
ability, repairs, or another ship.
