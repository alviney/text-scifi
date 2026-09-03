## UI

The UI is a cli type interface with minimal non text elements.
There will be simple cli style loading bars, icons etc.

Some interfaces will have multiple window panes.

## Game Loop

You are the AI managing a seedship.
The crew is in cryo chambers. However, there is a skeleton crew that is needed to perform duties to keep the ship functioniong.
The crew will have stats like, hunger, sleep, happiness. These mean, keep the food production line opperational (that could be hydroponic lab, some sci fi extraction of asteroids or something).

Everything is about scheduling tasks. Every task takes time. Humans and equipment can have tasks queued.

### The loop

1. Look through all the various interfaces to get an idea of the current status of equipment and consumables.
2. Equipment degrades over times. Schedule tasks for humans to repair and replace equipment.
3. Schedule manufactoring of new parts and equipment to keep up with these requirements
4. Schedule drones to harvest asteroid materials to extract raw materials (Delta v book is good at this) water, metals, etc
5. To keep truly on top of this, you'll need to set up automations. (See events and triggers)
6. Some humans will die, lack of nutrition, medication, acident repairing neglected danger item.
7. Keep performing all this to achieve a few goals.
8. If everything is automated enough, you can frame jack to a point where time passes really quickly and you reach your destination.

## Data modelling

Hierarchy like asset managment industry. Each of these has "IOT" like common interface.

### Types

- Facility/Room

- System
  Life support (ship wide)

- Asset/Equipment
  LifeSupportNode (per room)
- Haven't been maintained in over (n) days places in "at risk" zone.
- Equipment has danger rating, low, medium, high.
- Leaving a high danger item not maintained for a while puts human repairer ar risk. The longer the wait the higher the risk.

- Component/Part

- Consumable

### CLI interface

The idea of events/listeners, and triggers, is that you can get statuses and preform actions in response the those statuses.
e.g. FireAlarm (Component) triggers alarm "fire" (event), LifeSupportNode (asset) has a (listener) that vents-the-air (trigger) fromt the room automatically.

Food or coffee dispenser in the galley might get low in consumables.

#### Events

##### Shared

[Toggleable]

- on
- off

[Countable]

- added
- removed

##### Device Unique

##### Event Adapters (Listeners)

<!-- Limits on countables -->

- limitUnder
- limitOver

#### Triggers

##### Shared

[Toggleable]

- turnOn
- turnOff

#### Requests

[Countable]

- amount
