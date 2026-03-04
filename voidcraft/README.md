# VOIDCRAFT

## Overview

VoidCraft is a space survival tower defense game. Build and expand your
spaceship while defending against waves of alien invaders. Collect
atomic resources from destroyed enemies to construct modules. Protect
your Command Core at all costs. Deploy the Singularity Pulse to
annihilate hordes when overwhelmed.

## Objective

Survive as long as possible. The game ends when your Command Core is
destroyed.

---

## Resource System

Twelve atomic elements are collected from destroyed aliens and cosmic
debris, categorized by their natural space abundance:

    H  (Hydrogen)  — Primary fusion fuel, water base, and raw thermal reaction mass
    O  (Oxygen)    — Life support, chemical oxidizers, and ceramic processing
    C  (Carbon)    — Graphene hull plating, carbon-nanotube structures, and organics
    Fe (Iron)      — Primary heavy infrastructure, kinetic armor, and ballistic ammunition
    Si (Silicon)   — Photovoltaic solar arrays, microprocessors, and heat-resistant ceramics
    Al (Aluminum)  — Lightweight structural frames, kinetic mirrors, and primary electrical wiring
    N  (Nitrogen)  — Habitable atmosphere buffering, agriculture, and cold-gas attitude thrusters
    Li (Lithium)   — High-density energy storage arrays and life-support CO2 scrubbers
    Ar (Argon)     — Highly efficient, inert propellant for ion/plasma drives
    Ti (Titanium)  — Ultra-high-temperature engine nozzles and premium aerospace armor
    Nd (Neodymium) — Superconducting electromagnets required for railguns and fusion containment
    Au (Gold)      — Critical radiation shielding for crew/computers and non-corrosive quantum electronics

Each module requires specific amounts of different atoms. Each atom can
be identified by its color.

The heavier the atom, the rarer it is.

---

## Storage System

Resources are stored in:

* **Command Core** — Limited starting capacity (enough to build initial modules)
* **Cargo Bay** — Expands storage capacity, different limits per atom type

Storage pools together. When building, atoms are drawn from any
available storage (Core or Cargo Bays).

**Important:**

* If all storage is full, Drones cannot drop off or collect more resources
* If a Cargo Bay is destroyed, all resources stored inside are also dropped in space

---

## Power System

Most modules require power to operate. Energy is measured in **joules
(J)**. Specific generation rates and consumption values are defined
during implementation.

**Power Sources:**

* **Command Core** — Generates initial power
* **Reactor** — Generates power for expansion

**Power Indicators:**

* Powered modules show an energy line connecting them with light moving
  from the power module.
* Unpowered modules appear darker and cannot function; there is no light
  moving in the link.

---

## Linkage System

Every module in the game must be linked to the ship's network. The
placement and connection of modules are governed by strict structural
rules:

* **Universal Linkage:** All modules must be linked to the ship
  structure. You cannot place floating, disconnected modules.
* **Energy Consumers:** Any module that requires energy must be attached
  directly to a module that provides energy (or to an energy proxy like
  a Hull Section).
* **Energy Providers:** Any module that provides energy (like a Reactor)
  must be attached to a module that requires energy.
* **Sensor Array (Radar):** The Sensor Array does not require energy. It
  can **only** be attached to a weapon module.
* **Hull Sections (Energy Proxies):** Hull Sections are solely used to
  extend link distance. They act as energy proxies and can **only** be
  attached to another Hull Section or to an energy-providing module.

---

## Modules

### Command Core

*Starting Module — Unique*

* Central hub that must be protected
* Has a basic auto-cannon (survives approximately one horde without help)
* Provides initial power to the ship's network
* Has limited storage, full at game start
* **Game over if destroyed**

### Reactor

* Generates power for the ship's network
* Essential for powering weapons and collectors far from the Core

### Cargo Bay

* Stores collected atoms
* Different capacity per atom type
* Required to expand economy beyond Core storage
* Resources lost if destroyed
* Requires power

### Drone Bay

* Provides drones and controls them to collect atoms from
  destroyed aliens. Drones are independent entities once deployed
* The Drone Bay itself does not offer storage
* Requires power
* **Vulnerability:** Drones can be killed by aliens on contact
* **Drone logic:** Drones evaluate the following logic in priority order
  every frame. Their range of action is defined by their owner:
  1. If carrying atoms, find the nearest storage module with available
     space.
  2. If there is room for atoms and there it's owned, find the nearest
     storable atom in the allowed range.
  3. Target the nearest destination found in step 1 and step 2.
  4. Without target from 1 and 2, target the nearest module to orbit
     until something change.

### Plasma Cannon

* Heavy projectile weapon
* Best against large, slow targets
* High damage, high cooldown
* Requires power

### Laser Array

* Continuous beam weapon
* Best against fast, small targets
* Low damage, low cooldown
* Requires power

### Sensor Array

* Extends targeting range for the weapon it is attached to
* Does not require power

### Hull Section

* Structural connector / Energy Proxy
* Cheapest way to extend ship size and bridge power to distant consumers
* Passes power through
* Does not require power to function

### Singularity Pulse

* Creates a localized black hole that annihilates all matter in range
* Fires automatically when enough aliens are within attack range
* Long cooldown after discharge
* Requires significant resources and power

**Effect:**

* All aliens in range are killed
* No atoms spawn from killed aliens
* All existing atoms in range are also destroyed

---

## Aliens

Aliens attack the ship in waves. They have random sizes, with smaller
aliens more probable than larger ones. Aliens crash into modules to deal
damage.

Aliens spawn far off-screen and move toward any module of the ship.

Spawn pressure increases over time, creating emergent behavior only
using the leviathan pressure formula:

* Frequent small attacks
* Occasional medium attacks
* Rare massive hordes if pressure builds long enough

---

## Building Mechanics

* Drag modules from the sidebar onto the play area
* Modules must be placed in valid locations according to the **Linkage
  System** rules.
* A visual bridge connects new modules to the required attachment point.
* Atoms are drawn from any available storage
* Unaffordable modules appear faded

Destroyed modules can be rebuilt. The atoms used to build the destroyed
module are dropped for collection.

---

## Controls

**Desktop:** Click and drag modules from sidebar
**Mobile:** Touch and drag modules from sidebar

---

## Survival Tips

* Build Reactors early to power expanding defense perimeters
* Build Cargo Bays to expand storage (Core storage is limited)
* Position Drone Bays carefully; keeping them near combat zones speeds
  up collection but risks drones getting killed by aliens
* Use Hull Sections to extend power to distant areas
* Sensor Arrays extend weapon range
* Balance offense with economy
* Protect the Core from all directions
* Save the Singularity Pulse for horde emergencies
* Singularity destroys matter — do not rely on it for resources
* Keep your Drone Bays powered and protected, otherwise your deployed
  drones will become lost!
