## [0.1.3] - 2025-12-17
### Added
- **Macro Support**: Macros can now be dragged onto the BG3 HUD hotbar and executed when clicked. Macro execution is handled in core, providing automatic support to all adapters.

### Fixed
- **GM Hotbar Macros**: Fixed error when dragging macros onto GM hotbar (missing null check for weapon sets in GM mode).

## [0.1.2] - 2025-12-16
### Added
- **Global HUD Toggle**: Added ability to show/hide the entire HUD via a keybinding (default: `H`) or by clicking the gamepad icon in the Token Controls sidebar. State persists per-client.

### Fixed
- **Tooltip Persistence**: Fixed issue where tooltips would fail to hide when the user moved the mouse while holding modifier keys (Shift, Ctrl, Alt).

## [0.1.1] - 2025-12-15
### Added
- Initial modular release of `bg3-hud-core`.
- Provides the core UI framework for the BG3 Inspired HUD system.
- Requires a system-specific adapter module to function.
