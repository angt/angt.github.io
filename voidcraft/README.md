# VOIDCRAFT

## 1. Overview & Objective

**VoidCraft** is a modular space survival tower defense game. Players
must expand a spaceship, manage an atomic resource economy, and defend
against endless waves of alien invaders. The ultimate objective is to
survive as long as possible. The game immediately ends if the player's
**Command Core** is destroyed.

## 2. Resource Economy

Resources consist of 12 atomic elements harvested from destroyed aliens
and cosmic debris. Elements are categorized by natural space abundance
(heavier atoms are rarer). Each atom type is visually identified by a
unique color.

**Atomic Elements:**

* **H (Hydrogen):** Primary fusion fuel, water base, thermal reaction
  mass
* **O (Oxygen):** Life support, chemical oxidizers, ceramic processing
* **C (Carbon):** Graphene hull plating, carbon-nanotube structures,
  organics
* **Fe (Iron):** Heavy infrastructure, kinetic armor, ballistic
  ammunition
* **Si (Silicon):** Photovoltaic solar arrays, microprocessors,
  heat-resistant ceramics
* **Al (Aluminum):** Lightweight frames, kinetic mirrors, primary
  electrical wiring
* **N (Nitrogen):** Habitable atmosphere buffering, agriculture,
  cold-gas thrusters
* **Li (Lithium):** High-density energy storage arrays, life-support CO2
  scrubbers
* **Ar (Argon):** Highly efficient, inert propellant for ion/plasma
  drives
* **Ti (Titanium):** Ultra-high-temperature engine nozzles, premium
  aerospace armor
* **Nd (Neodymium):** Superconducting electromagnets for railguns and
  fusion containment
* **Au (Gold):** Critical radiation shielding, non-corrosive quantum
  electronics

**Atom Decay Mechanism:**

* Floating atoms are unstable and gradually dissipate.
* Decay follows an exponential model with a base half-life of
  approximately 60 seconds.
* Every floating atom evaluates a probability of disappearing each
  second.
* This enforces strategic Drone Bay placement to minimize resource loss.

## 3. Storage System

Resources are pooled across all available storage modules. When
constructing new modules, atoms are drawn automatically from this global
pool.

**Storage Rules:**

* **Command Core:** Provides limited starting capacity to bootstrap
  initial expansion. The capacity is full at the beginning.
* **Cargo Bays:** Expand global storage limits. Capacities vary per atom
  type.
* **Full Capacity:** If the global pool is full, Drones cannot collect
  or deposit additional atoms.
* **Destruction Penalty:** If a Cargo Bay is destroyed, all atoms stored
  within it are ejected into space and become subject to standard atom
  decay.

## 4. Power & Grid Linkage

Every module must be structurally and logically integrated into the
ship's network. Energy is measured in Joules (J).

**Power Mechanics:**

* **Generation:** Initial power is supplied by the Command Core.
  Expansion requires dedicated Reactors.
* **Visual Indicators:** A lit, moving energy line connects powered
  modules to their energy source. Unpowered modules appear dark and lack
  moving light indicators. Unpowered modules are non-functional.

**Strict Linkage Rules:**

* **No Floating Modules:** Every module must connect to the ship's
  contiguous structure.
* **Energy Consumers:** Modules requiring power must attach directly to
  a power provider OR an energy proxy (Hull Section).
* **Energy Providers:** Modules generating power must attach directly to
  an energy consumer.
* **Hull Sections (Proxies):** Passively bridge power over distances.
  They can only attach to other Hull Sections or energy-providing
  modules.
* **Sensor Arrays:** Require no power. Must attach exclusively to Weapon
  modules.

## 5. Construction Mechanics

* **Placement:** Players drag and drop modules from the UI sidebar (via
  mouse on desktop or touch on mobile).
* **Validation:** Modules only snap to valid locations dictated by the
  Linkage Rules. Visual bridges confirm valid attachment points.
* **Cost:** Atoms are deducted from the global storage pool.
  Unaffordable modules appear faded in the UI.
* **Salvage:** When a module is destroyed by aliens, 100% of its atom
  cost is dropped into space as harvestable debris.

## 6. Module Specifications

**Command Core**

* **Role:** Central Hub (Unique, Game Over if destroyed).
* **Features:** Provides starting power, limited storage, and an
  integrated auto-cannon capable of surviving early waves unassisted.

**Reactor**

* **Role:** Power Generator.
* **Features:** Sustains expanding defense and collection networks.

**Cargo Bay**

* **Role:** Resource Storage.
* **Features:** Requires power. Expands global atom capacity. Drops
  contents if destroyed.

**Hull Section**

* **Role:** Structural Proxy.
* **Features:** Zero power requirement. Cost-effective method for
  bridging power to distant consumer modules.

**Drone Bay**

* **Role:** Resource Harvester.
* **Features:** Requires power. Deploys autonomous drones. Defines the
  maximum collection radius. Does not store resources. Drones die
  instantly upon alien contact.

**Drone Logic Loop**

1. **If cargo is not empty:** Find the nearest valid storage module.
2. **If cargo is not full:** Find the nearest atom within the Drone Bay's radius.
3. Move toward the nearest target found above.
4. **If no target was found:** Orbit any ship module.

**Plasma Cannon**

* **Role:** Heavy Defense.
* **Features:** Requires power. Fires heavy projectiles. High damage,
  high cooldown. Optimal against massive, slow aliens.

**Laser Array**

* **Role:** Light Defense.
* **Features:** Requires power. Continuous beam. Low damage, low
  cooldown. Optimal against small, fast aliens.

**Sensor Array**

* **Role:** Utility Upgrade.
* **Features:** Zero power requirement. Extends the targeting range of its host.

**Singularity Pulse**

* **Role:** Ultimate Emergency Weapon.
* **Features:** Massive power and resource cost. Long cooldown.
  Auto-triggers when overrun.
* **Effect:** Generates a localized black hole. Instantly annihilates
  all aliens and floating atoms in range (yields zero resource drops).

## 7. Alien Behavior

* **Spawning:** Aliens spawn off-screen in waves. Smaller variants are
  statistically more common than large ones.
* **Combat:** Aliens deal damage by physically crashing into ship
  modules.
* **Targeting Priority:** Aliens strictly path toward *operational*
  modules (powered, active, and connected).
* **Dynamic Retargeting:** If a targeted module becomes non-operational,
  the alien instantly seeks a new operational target.
* **Fallback Targeting:** If zero operational modules remain on the
  ship, all aliens drift directly toward the Command Core.

## 8. Strategic Survival Principles

* Prioritize early Reactor construction to support grid expansion.
* Scale Cargo Bays quickly; Core storage bottlenecks economy.
* Balance Drone Bay placement: closer to the frontline increases
  collection speed but exposes fragile drones to lethal alien
  collisions.
* Use Hull Sections generously to keep vital systems safely behind the
  frontline.
* Rely on the Singularity Pulse only for survival, as it vaporizes
  potential resource gains.
* Ensure Drone Bays remain powered; unpowered bays result in lost,
  inactive drones.
