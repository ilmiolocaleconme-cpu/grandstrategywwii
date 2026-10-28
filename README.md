Grand Strategy WWII

Mobile grand-strategy game set in the World War II era

Grand Strategy WWII is a mobile strategy game project focused on global warfare, industrial development, military organization, logistics, diplomacy and historical or alternate-history campaigns.

The project is designed around a shared simulation framework for Germany, Italy and Japan, with an architecture that can support additional nations.

Project Status

Phase: data and map prototype. Some mechanics exist as tested pure logic; the game is not playable end to end yet.

What exists today (checked on 28/10/2026 on branch "test"):
- A React + Vite app with a Canvas 2D strategy map, installable PWA configuration and a new-game flow.
- A validated data catalog: 72 nations, 190 political entities (1936), 3088 provinces in 178 files, 1200 rivers, 2484 lakes, 202 sea zones, road and rail data, terrain and resources. Most province borders are hypotheses, not verified history. Details in "docs/INVENTARIO_DATI.md" (generated).
- Game core logic (calendar, state, engine, save) and rules for production and river crossings, covered by automated tests but not yet fully connected to the interface.
- Offline behaviour was checked by hand on one phone; it is not covered by automated tests.

Not implemented yet: units and movement, combat, trade, research, diplomacy, contingent loans and AI.

The design documents describe goals. A feature counts as implemented only when its code and tests exist. See "docs/STATO_IMPLEMENTAZIONE.md" for the detailed status.

Commands (Node ^20.19 or >=22.12):

- "npm run dev" — development server.
- "npm run build" and "npm run preview" — production build and local preview.
- "npm test" — automated tests (the full suite takes several minutes).
- "npm run validate:data" — validate the files in "data/".
- "node scripts/report-inventory.js" — regenerate "docs/INVENTARIO_DATI.md".

Core Features

- Global map: Provinces, capitals, major cities, urban sectors, terrain, rivers, weather and infrastructure.
- Land warfare: Theatres, corps, divisions, NATO-style unit symbols, combat modifiers and military orders.
- Air warfare: Air theatres, interception, air superiority, ground support, bombing and reconnaissance.
- Naval warfare: Fleets, shipyards, ship modernization, maritime logistics and trade routes.
- Economy and industry: Resources, mines, refineries, synthetic fuel, factories, energy and production chains.
- Logistics: Land supply, overseas supply, air transport and infrastructure bottlenecks.
- Technology: Shared research framework with national equipment and technology progression.
- Diplomacy: Treaties, military access, trade, alliances and foreign aid.
- Historical and alternate campaigns: Major historical events alongside player-driven alternatives.
- Mobile interface: A touch-friendly global map and streamlined management screens.

Main Nations

- Germany
- Italy
- Japan

National units, equipment, production capabilities and historical events will be represented through structured game data.

Repository Structure

grandstrategywwii/
├── README.md
├── docs/
├── data/
├── public/
├── scripts/
├── src/
├── tests/
├── index.html
├── vite.config.js
└── package.json

- "docs/" — Game design, architecture, technical specifications and implementation status.
- "data/" — Structured game data (nations, provinces, rivers, lakes, sea zones, transport, terrain, resources and industry).
- "public/" — Static assets, including placeholder PWA icons.
- "scripts/" — Command-line tools, such as data validation.
- "src/" — Application code: React interface, map, game core, rules, data loaders and the data validator.
- "tests/" — Automated tests.
- "index.html", "vite.config.js" — Vite entry point and build and PWA configuration.
- "package.json" — Project configuration and scripts.

Units, technologies and events are not present yet; the map and part of the rules are.

Technical Direction

The project will use modern JavaScript with ES modules, a modular architecture, validated data and automated tests.

The simulation logic, game data and user interface should remain separate, with shared rules to prevent inconsistencies between nations and game systems.

Development Principles

1. Keep interconnected systems consistent from the beginning.
2. Separate historical data from simulation logic.
3. Validate structured data before using it in the game.
4. Design the interface for mobile devices.
5. Use automated tests for critical mechanics.
6. Document implementation status accurately.
7. Build a playable prototype before expanding the full simulation.

Documentation

Project specifications are maintained in the "docs/" directory. The architecture document defines the initial technical structure and the relationships between major systems.

License

A license has not yet been selected. All rights and licensing terms remain to be determined by the project owner.
