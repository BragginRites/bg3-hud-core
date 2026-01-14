## [0.2.2] - 2026-01-14

### Changed
- **Show/Hide Portrait HP Controls**: Removed setting from Layout & Appearance → Container Configuration. Now handled by system adapters.

### Fixed
- **Portrait Data Colors Reset**: Fixed portrait data badge colors resetting to white when HP changes. The `updatePortraitData()` method now correctly uses the layered config hierarchy and applies separate icon/text colors (#22).
- **Aura Effect Icon Duplication**: Fixed aura effects (e.g., Paladin Aura of Protection) creating duplicate icons when tokens enter/exit the aura. Active effects are now deduplicated by origin + name to handle modules that recreate effect IDs on each aura entry.

## [0.2.1] - 2026-01-10

### Added
- **Show/Hide Filter Icons**: New setting in Layout & Appearance → Container Configuration to toggle visibility of the spell slot and action type filter icons.
- **GM Portrait Data Override**: GMs can configure portrait data badges once and sync them to all players via "Sync to World" button. Uses layered config hierarchy: players can toggle "Use my own config instead" to opt-out of the world config and use their own settings.
- **Improved Portrait Data Styling**: Added separate color controls for icons and text in the Portrait Data configuration, allowing for more flexible styling (e.g., gold icon with white text).

### Fixed
- **Script Macro Error**: Fixed `DataModelValidationError` when clicking script macros in the hotbar after switching tokens. Macros are now correctly skipped during state hydration.
- **Spell Slot Filter Updates**: Fixed spell slot counters not updating immediately after casting. The filter update logic now correctly traverses grouped filter children.
- **Portrait Alignment**: Fixed portrait container alignment to properly anchor to the bottom of the hotbar region.

## [0.2.0] - 2026-01-05

### Added
- **Target Selector Hover Highlighting**: Hovering a target in the selection list now highlights the token on canvas.
- **Target Selector Click to Ping**: Clicking a target in the list pings its location on the canvas.
- **Target Selector Right-Click Remove**: Right-click a target in the list to remove it (alternative to X button).
- **Real-time Target Sync**: Target selector now listens to `targetToken` hook for immediate UI updates when targets change externally.
- **Video Portrait Thumbnails**: Animated token portraits (WEBM/MP4) now display as static thumbnails in the target list.

### Fixed
- **Target Selector Range**: Fixed touch range returning feet instead of grid squares in DnD5e adapter.
- **Mouse Tooltip Z-Index**: Fixed crosshair tooltip appearing behind target list dialog.

## [0.1.12] - 2026-01-05
### Fixed
- **HUD Page Load**: Fixed bug where HUD would not render automatically when reloading the page with a token already selected (#17).
- **Scene Switching**: Improved responsiveness and reliability of HUD detection when switching scenes with selected tokens.
- **Info Panel Z-Index**: Completely resolved z-index stacking issues by moving the Info Panel to `document.body` when opened. It now correctly renders above all character sheets and windows (#16).
- **Macro Bar Visibility**: Fixed "Hide When BG3 HUD Visible" option not working correctly - macro bar would stay hidden even when no token was selected (#8).

## [0.1.11] - 2026-01-04

### Added
- **Portrait Click Handler**: Clicking the portrait now opens the actor's character sheet (#15).
- **Portrait Scaling Support**: New `getPortraitScale()` method allows adapters to scale portrait based on token size. Container resizes and expands upward/leftward when scaled.
- **Settings Submenu Buttons**: `createSettingsSubmenu()` now supports action buttons within sections, enabling nested menus (e.g., CPR Actions selector inside Third Party submenu).
- **Animated Portrait Support**: Portraits now support WEBM, MP4, OGG, OGV video formats for animated tokens (#14). Videos autoplay, loop, and are muted.

### Changed
- **Tooltip Isolation**: Tooltip class filtering now uses adapter-provided `tooltipClassBlacklist` instead of hardcoded system classes, keeping core system-agnostic.
- **Target Selector Fallbacks Removed**: Removed system-specific fallback methods (`_fallbackNeedsTargeting`, `_fallbackGetRequirements`). Adapters must provide targeting rules; core returns safe defaults otherwise.

### Fixed
- **Info Container Z-Index**: Raised z-index of `.bg3-info-container-wrapper` from 300 to 9999 to ensure it appears above Foundry application windows (#16).

## [0.1.10] - 2025-12-25

> 🎄 **Merry Christmas and Happy Holidays!** 🎄

### Changed
- **Discord Link Updated**: Updated community Discord invite link.

### Added
- **Filter Popout Groups**: New expandable filter groups to prevent filter bar overflow. Group filters show child filters in a popout panel below the filter bar. Group buttons show an active indicator when any child filter is active.
  - New `FilterGroupButton` component with expand/collapse behavior
  - Filters can now specify `type: 'group'` with `children` array
  - New CSS styles for popout panels with animations

## [0.1.9] - 2025-12-21
### Changed
- **Dialog Synchronization**: All dialogs are now synchronized to use consistent `DialogV2` styling and behavior (Issue #11).
- **Manifest Updates**: Updated manifest URL to point to `latest` release for easier updates (Issue #10).

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

## [0.1.1] - 2025-12-15
### Added
- Initial modular release of `bg3-hud-core`.
- Provides the core UI framework for the BG3 Inspired HUD system.
- Requires a system-specific adapter module to function.
