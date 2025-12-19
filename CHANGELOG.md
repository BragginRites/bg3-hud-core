## [0.1.8] - 2025-12-20
### Changed
- **DialogV2 Migration**: Migrated all selection dialogs to use Foundry V13's `DialogV2` API for consistent styling:
  - Replaced `SelectionDialog`, `AutoPopulateDialog`, `AutoPopulateConfigDialog`, and `CreateViewDialog` components with utility functions in `dialogs.js`.
  - New `showSelectionDialog()`, `showPillSelectionDialog()`, `showAutoPopulateConfigDialog()`, `showViewDialog()` utilities provide consistent, reusable dialog patterns.
  - All dialogs now integrate visually with Foundry V13's native dialog styling.

### Removed
- **Socketlib Dependency**: Removed `socketlib` as a dependency. The previous socket implementation was over-engineered. Foundry's native actor flag sync (via `updateActor` hook) handles multi-user synchronization perfectly well. This significantly improves performance during rapid hotbar operations.

### Fixed
- **Grid Synchronization**: Fixed a race condition where adding/removing rows would cause grid desynchronization between clients (some grids having different row counts). Row updates are now batched into a single atomic transaction.

## [0.1.7] - 2025-12-19
### Added
- **Passive Effects Visibility**: Added new setting "Show Passive Active Effects" (under Container Configuration) to toggle display of permanent/passive effects in the Active Effects container. Default is off (only shows temporary/combat effects).

### Fixed
- **Item-Transferred Effects**: Fixed issue where effects granted by items (e.g., racial traits, feats) were not appearing in the Active Effects container. Now uses `allApplicableEffects()` API to correctly retrieve all relevant effects.

## [0.1.6] - 2025-12-19
### Added
- **Adapter Hook (onTokenCreationComplete)**: New adapter lifecycle hook called after all auto-populate grids are completed. Enables adapters to perform post-population work without race conditions.

### Fixed
- **Auto-Populate Race Condition**: Fixed issue where spells would not appear in Grid 1 after token creation. The CPR auto-populate was running concurrently and overwriting the spell grid state. Now all auto-populate operations are sequenced correctly.

## [0.1.5] - 2025-12-18
### Added
- **Filter Visibility**: Filter buttons now only appear if there are matching items on the hotbar. Filters with `alwaysShow: true` bypass this check.
- **Centered Filter Labels**: Added `centerLabel` property to FilterButton for displaying text centered in the button (used by PF2e spell ranks).
- **Range Indicator Settings**: Added customizable range indicator options (shape, animation, line width, color) for the target selector.
- **GM Hotbar Keybinding**: Added configurable keybinding (default: `;`) to silently toggle between Token Hotbar and GM Hotbar.

### Fixed
- **Layout Settings Dialog**: Fixed scrollbar missing on "Layout & Appearance Settings" dialog, preventing access to all settings and the save button on smaller screens. Dialog is now resizable with scrollable content.
- **Large Slot Counts**: Added CSS for 5-6 and 7-9 slot pips to use smaller sizes and prevent overflow.
- **Range Calculation**: Fixed range indicator and range checking to use grid squares instead of scene units, ensuring correct display regardless of scene grid configuration.
- **Foundry V13 Deprecation**: Fixed `SceneControls#activeControl` deprecation warning.
- **PF2e Strike Drag-and-Drop**: Core now handles PF2e's `type: 'Action'` drag data format, enabling strikes from the PF2e character sheet Actions tab to be dropped onto the hotbar.


## [0.1.4] - 2025-12-17
### Added
- **Activity Drag Support**: Extended drag-and-drop coordinator to support `Activity` type data, enabling adapters to handle improved activity dragging (e.g. D&D 5e v5+).
- **Auto-Populate Options**: Added support for option toggles in the Auto-Populate configuration dialog.

## [0.1.3] - 2025-12-17
### Added
- **Macro Support**: Macros can now be dragged onto the BG3 HUD hotbar and executed when clicked. Macro execution is handled in core, providing automatic support to all adapters.
- **Foundry Macro Bar Visibility**: New option "Hide When BG3 HUD Visible" - shows Foundry's native macro bar only when the BG3 HUD is hidden, and hides it when BG3 HUD is visible. (Closes #5)

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
