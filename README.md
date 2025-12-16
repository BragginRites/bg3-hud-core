# BG3 Inspired HUD - Core

The core UI framework for the BG3 Inspired HUD system. This module provides the foundational components and infrastructure that system-specific adapter modules build upon to deliver a Baldur's Gate 3-inspired interface for Foundry VTT.

**This is a library module and requires a system-specific adapter module (bg3-hud-dnd5e, bg3-hud-pf2e, etc.) to function.**

## BG3 HUD Modules

- [BG3 Inspired HUD - D&D5e](https://github.com/BragginRites/bg3-hud-dnd5e)
- [BG3 Inspired HUD - PF2e](https://github.com/BragginRites/bg3-hud-pf2e)
- [BG3 Inspired HUD - DC20 RPG](https://github.com/BragginRites/bg3-hud-dc20rpg)

Coffee helps me stay up to 2am to write these modules. Thank you for the lack of sleep in advance!

I'm currently building my own TTRPG system, **Chantry**, which you can follow at [patreon.com/ChantryVTTRPG](https://www.patreon.com/ChantryVTTRPG). Don't worry, I'm not giving up on my other modules!

Support my work:
- [Patreon](https://www.patreon.com/ChantryVTTRPG)
- [Ko-fi](https://ko-fi.com/bragginrites)

## Other Modules

Check out my other module(s):

- [Token Loot](https://github.com/BragginRites/token-loot)
- [Surge Dice - A Narrative Dice Pool](https://github.com/BragginRites/surge-dice)
- [Inspect Statblock](https://github.com/BragginRites/inspect-statblock)

## Quick Usage

- **Installation**:
  1. Open Foundry VTT and navigate to **Add-on Modules**.
  2. Click **Install Module**.
  3. Select **BG3 Inspired HUD - Core** from the list of modules.
  4. Click **Install** and enable the module in your world settings.
  5. Install and enable a compatible system-specific adapter module (bg3-hud-dnd5e, bg3-hud-pf2e, etc.).
- **Core Functionality**:
  - Provides the base UI framework and component system.
  - Handles core interactions, tooltips, and container management.
  - Manages persistence, updates, and socket communication.

## Requirements

- **Foundry VTT**: Version 13 or higher
- **Required Module**: socketlib
- **System Adapter**: A compatible system-specific module (bg3-hud-dnd5e, bg3-hud-pf2e, etc.)

## Acknowledgments

This module is an independent fan creation, drawing inspiration from the excellent UI/UX design of Baldur's Gate 3. Special thanks to:

- Larian Studios for creating such an intuitive interface in BG3.

*This module is not affiliated with, endorsed by, or connected to Larian Studios, Wizards of the Coast, or Baldur's Gate 3.*

## Support

For issues, bugs, or feature requests, please submit them via [GitHub Issues](https://github.com/BragginRites/bg3-hud-core/issues).