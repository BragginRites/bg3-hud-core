# BG3 Inspired HUD - Core

![Foundry Version](https://img.shields.io/badge/Foundry-v13-orange)
[![Patreon](https://img.shields.io/badge/Patreon-Support-red?logo=patreon)](https://www.patreon.com/BragginRites)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20Coffee-blue?logo=ko-fi)](https://ko-fi.com/bragginrites)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-7289da?logo=discord)](https://discord.gg/bnVCtQuyMr)

The core UI framework for the BG3 Inspired HUD system. This module provides the foundational components and infrastructure that system-specific adapter modules build upon to deliver a Baldur's Gate 3-inspired interface for Foundry VTT.

<img width="1247" height="282" alt="image" src="https://github.com/user-attachments/assets/a684e66d-f540-460f-9e04-e35915c8feba" />

> [!IMPORTANT]
> **This is a library module and requires a system-specific adapter module (bg3-hud-dnd5e, bg3-hud-pf2e, etc.) to function.**

## Support Development & Vote on Features

Maintaining these modules takes time and caffeine. If you enjoy using this HUD, there are two ways to support the project:

### 1. Join the Dev Circle (Patreon)
Join me on [Patreon](https://www.patreon.com/BragginRites) to support the maintenance of my Foundry mods and my project TTRPG, **Chantry**.
* **Vote:** Help decide which modules and features get prioritized next.
* **Preview:** See early builds of the modules and Chantry.
* **Access:** Get the supporting roles in Discord.

### 2. The Tip Jar (Ko-fi)
Not into subscriptions? You can toss a coin in the jar over on [Ko-fi](https://ko-fi.com/bragginrites). It keeps the coffee flowing during those 2 AM coding sessions.

---

## BG3 HUD Ecosystem

This module is part of a larger suite. Ensure you have the compatible adapter for your system:

- **[BG3 Inspired HUD - Core](https://github.com/BragginRites/bg3-hud-core)** (You are here)
- [BG3 Inspired HUD - D&D5e](https://github.com/BragginRites/bg3-hud-dnd5e)
- [BG3 Inspired HUD - PF2e](https://github.com/BragginRites/bg3-hud-pf2e)
- [BG3 Inspired HUD - DC20 RPG](https://github.com/BragginRites/bg3-hud-dc20rpg)

## Installation & Usage

1.  Open Foundry VTT and navigate to **Add-on Modules**.
2.  Click **Install Module**.
3.  Search for **BG3 Inspired HUD - Core**.
4.  Click **Install** and enable the module in your world settings.
5.  **Install and enable a compatible system-specific adapter module (bg3-hud-dnd5e, bg3-hud-pf2e, etc.).**

**Core Functionality:**
* Provides the base UI framework and component system.
* Handles core interactions, tooltips, and container management.
* Manages persistence, updates, and socket communication.

## Other Modules by BragginRites

- [Token Loot](https://github.com/BragginRites/token-loot) - Loot Distribution for tokens.
- [Surge Dice](https://github.com/BragginRites/surge-dice) - A Narrative Dice Pool system.
- [Inspect Statblock](https://github.com/BragginRites/inspect-statblock) - Statblock viewing with hidden stats that auto reveals for the players with triggers (hitting fire immune with fire damage).

## Acknowledgments

This module is an independent fan creation, drawing inspiration from the excellent UI/UX design of Baldur's Gate 3. Special thanks to:

- **Larian Studios** for creating such an intuitive interface in BG3.

*This module is not affiliated with, endorsed by, or connected to Larian Studios, Wizards of the Coast, or Baldur's Gate 3.*

## Support

Found a bug? Have a feature request?
* Submit issues via [GitHub Issues](https://github.com/BragginRites/bg3-hud-core/issues).
* Join the discussion on [Discord](https://discord.gg/bnVCtQuyMr).
