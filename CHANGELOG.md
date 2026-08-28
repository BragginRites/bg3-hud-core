## [Unreleased]

### Changed
- **Selecting more than one token**: The HUD follows the one token you have selected. If you select two or more (a group plus a creature still counts as two), it behaves like nothing is selected: GMs see the GM Hotbar if that setting is on, players see nothing.

### Fixed
- **GM Hotbar toggle**: You can still switch to the GM Hotbar while a token is selected. Clicking a token brings that creature's HUD back instead of leaving you on the GM bar.
- **Deselecting Token lock**: With that lock on, clicking empty canvas still keeps the HUD. Selecting a second token hides it.
- **Minimalist View**: Picking a token when nothing was selected no longer flashes the floating layout before the docked HUD shows.
- **HUD flicker**: The HUD no longer flashes half-drawn when it appears.


## [0.6.0] - 2026-08-25

A bigger update after a long gap. New layout options, smoother targeting, player-friendly settings, and several reliability fixes so your existing hotbar keeps working.

### Added
- **Minimalist View**: Optional setting that hides hotbar view tabs and docks the HUD along the bottom edge. The normal floating layout is unchanged if you leave this off.
- **Rest / End Turn + dock toggle**: Clearer rest and end-turn buttons (with labels), plus a caret to tuck the HUD away and bring it back. Works in every layout, not only Minimalist View.
- **Simpler Target Selector**: Using an ability pauses until you confirm targets, then continues. It checks how many targets you need (you can nudge the count), self vs enemy when that matters, and range. Optional setting to ignore the self/enemy check.
- **Debug Logging toggle**: Client setting under BG3 Inspired HUD - Core. Off by default so normal play stays quiet; turn it on when troubleshooting. Warnings and errors always show.

### Fixed
- **Player settings menus**: Players can open the settings menus and only see options they are allowed to change. Saving no longer fails when a menu also lists GM-only options.
- **Spells already on the bar**: Older saved layouts sometimes stored spells in a way the HUD stopped recognizing. Existing spells work again when you click them. You should not need to clear and refill the hotbar.
- **Prepare / unprepare staying in sync**: Preparing or unpreparing a spell updates the bar correctly, and use counters / grayed-out slots survive that refresh.
- **Canvas pan beside the HUD**: Empty space left and right of the hotbar no longer blocks panning the map (Foundry v14).
- **Tall tooltips**: Long tooltips stay on screen and scroll instead of running off the edge.
- **Unlinked token Save Layout**: Saving a layout for an unlinked NPC writes to the right actor and remembers that auto-populate already ran.
- **pt-BR Name-only tooltips label**: Correction from Kharmans.

### Changed
- **Quieter console**: Routine chatter is hidden unless Debug Logging is on.
- **Clearer setting wording**: Hints and messages talk about actions and resources in plain language instead of leaning on "spell slot" wording everywhere.
- **Smoother HUD updates**: Spending slots, taking damage, and similar changes refresh the parts of the HUD that need it, with less full-screen flicker.
- **Character vs NPC chrome**: View tabs and related player-character UI follow each game system's idea of a player character (for example owned NPCs can still count when appropriate).
- **Extra side panels**: Optional rails (like Advantage buttons or CPR actions in D&D) register cleanly per system, so other games are not stuck with D&D-only panels.
- **Under-the-hood cleanup**: Game-specific rules live in the companion modules; core stays shared. Same HUD for you, easier to maintain going forward.


## [0.4.3] - 2026-07-13

### Changed
- **Foundry v14 ready**: Verified and working on Foundry v14, and still fully supported on v13. Updated an internal template call so it keeps working on the new version.

## [0.4.2] - 2026-06-17

### Added
- **Portrait border**: Restored HUD portrait frame options from the legacy hotbar — none, simple (theme border), or styled (round ring asset). Configure under Layout & Appearance → Container Configuration.

### Fixed
- **NPC auto-populate after compendium round-trip**: Token-creation auto-populate now runs only once per actor (`autoPopulateComplete` on `hudState`). Existing populated hotbars are recognised without re-filling.
- **Stale hotbar UUIDs after re-import**: When an actor returns from a compendium with new item IDs, saved layout slots remap to matching items by name (and type) instead of leaving ghost entries or duplicating on the next populate.

## [0.4.1] - 2026-06-17

### Added
- **Adapter-supplied cell data**: Drag-and-drop and auto-populate can now persist pre-built hotbar cells from system adapters (e.g. Crucible actions) that do not have a backing Foundry document UUID.
- **External cell drag path**: Adapters can return `cellData` from drag resolution instead of a document; core validates ownership, blocks duplicates via synthetic UUIDs, and persists the slot like any other cell.

### Changed
- **Auto-populate sorting for adapter cells**: Adapter cells (e.g. `CrucibleAction`, strikes) use adapter `sortItems()` and `enrichItemsForSort()` while UUID-only entries still use `sortUuidEntries()`.
- **Crucible action hydration**: Saved `CrucibleAction` cells refresh from live `actor.actions` on load when the adapter provides `transformActionToCellData`.
- **Tooltip handoff**: Core tooltip manager skips elements marked with `[data-crucible-tooltip]` so adapter modules can render and lock their own tooltips.
- **Foundry v14 verified**: Module manifest updated to verified Foundry v14.

## [0.4.0] - 2026-05-23

### Added
- **Hide portrait option**: You can turn off the portrait image under Layout & Appearance → Container Configuration while keeping the character info (d20) button, handy if you want a slimmer HUD but still need abilities, skills, and saves at a glance.

### Changed
- **More even HUD spacing**: Gaps between the portrait, weapons, advantage buttons, CPR actions, hotbar, and rest/end turn buttons should look more consistent left to right.
- **Action buttons are icon-only**: Rest, End Turn, and other action buttons no longer show text labels — the icon and tooltip are enough.
- **Passive features on new tokens**: Passive abilities can now auto-populate when a token is created even if you have not set up hotbar grid auto-populate, as long as passives are enabled in your auto-populate settings.

### Fixed
- **Auto-populate hitting the GM hotbar**: Dropping or creating tokens could sometimes fill the GM hotbar instead of the actor you intended when GM hotbar mode was on. Auto-populate now stays on the correct actor.
- **Auto-populate while using the GM hotbar**: The "Auto-Populate Container" right-click option is hidden on the GM hotbar so you cannot accidentally populate it.
- **Save layout to prototype**: Saving a token's hotbar layout back to the actor prototype no longer risks writing to the GM hotbar by mistake.

## [0.3.1] - 2026-05-13

### Changed
- **Snappier token switching**: Changing controlled token updates the existing HUD instead of tearing it down and rebuilding it, so it should feel quicker and flash less.
- **Faster first draw**: When you load in with a token (or pick one for the first time), the HUD skips extra wait-and-fade steps it used when nothing was on screen yet, and tries harder not to run the same refresh twice from startup hooks.
- **Loading hotbar data**: Item hydration for slots runs more work in parallel so big bars load a bit faster.

### Fixed
- **Flash after picking a token**: Follow-up refreshes from the canvas or token hooks were sometimes redoing the whole HUD right after a swap; those redundant passes are skipped when nothing actually changed.

## [0.3.0] - 2026-04-28

### Changed
- **Core/Adapter Separation**: Wired game-specific behaviour into companion system modules instead of core. Table behaviour stays the same; this is maintenance housekeeping for folks who hack or maintain the HUD.
- **Portrait Badge Placeholders**: Updated portrait badge settings with friendlier placeholder examples so one rule set is not baked into the text (Brazilian strings updated too).
- **Tooltip Overlap Handling**: Sheet tooltips are less likely to pop up oddly over HUD buttons — same HUD, fewer weird overlaps.
- **Name-only Tooltips Option**: Added support for showing simple name-only HUD tooltips as an optional display mode.

### Fixed
- **Drag + Resize Persistence**: Dragging an item and then resizing with a drag bar no longer snaps the item back to an older slot. Runtime grid state now stays in sync with queued persistence saves, so moved items stick without needing a manual HUD re-render.
- **Macro Bar Visibility Reliability**: Hardened "Hide Foundry Macro Bar" behaviour across all modes (`Always Hide`, `Never Hide`, `Hide When BG3 HUD Visible`, `Fully Hidden`) so token select/deselect and initial load state consistently apply the intended visibility. This also addresses duplicate reports around #8, #25, and #29.

## [0.2.6] - 2026-04-25

### Added
- **Português (Brasil) Translation**: Added full localization support for Brazilian Portuguese, thanks to **Kharmans**.

### Fixed
- **Manifest URLs**: Updated manifest and download URLs in `module.json` to ensure correct update path for users.

## [0.2.5] - 2026-04-24

### Changed
- **Info Panel Redesign**: Complete overhaul of the character info panel with a minimalist, at-a-glance layout.
  - Replaced ability labels with static score columns and d20 modifier overlays.
  - Simplified skills grid into a 3-column layout.
  - Proficiency indicators using color-coded d20 icons with black outlines for readability.
- **UI Localization**: Comprehensive audit and localization of all core HUD components (settings cog, context menus, and tooltips).

## [0.2.4] - 2026-04-22

### Fixed
- **Info Panel Stability**: Fixed critical bug where the info panel would disappear when interacting with its internal content (skills, abilities) due to incorrect event propagation and containment checks.
- **Info Panel Lifecycle**: Refactored `render()` to be idempotent, preventing "zombie panels" and duplicate event listeners from being created during HUD re-renders (e.g. on token selection or attribute changes).
- **Proficiency Borders**: Implemented border-based proficiency indicators (blue/gold/silver) for a cleaner UX.

## [0.2.3] - 2026-01-28

### Fixed
- **Target Selector Min Targets**: Fixed issue where adjusting the max targets down didn't update the min targets, preventing confirmation with fewer than the original minimum (Issue #23).
- **Macro Bar Visibility**: Fixed "Hide When BG3 HUD Visible" setting not working correctly - macro bar now properly shows when no token is selected (Issue #8).

### Changed
- **Discord Link Updated**: Updated community Discord invite link.

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
