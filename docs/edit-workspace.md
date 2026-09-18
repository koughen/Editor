# Edit workspace

The Project panel’s sidebar contains only Media, Sounds, Stickers, and Settings. Titles, captions, effects, and transitions have one home each in their dedicated dock panels. Color and Audio are accessed from the main workspace header.

The Edit page now has eight movable panels: Project, Viewer, Inspector, Timeline, Titles, Captions, Effects, and Transitions. Drag a panel tab onto another panel's center to group it as a tab, or onto an edge to split that area. Drag splitters to resize. Double-click a tab (or use its maximize button) to maximize and restore. Escape restores a maximized panel.

The panel's ••• menu also provides a Move panel selector, Float panel, and Close panel. Floating panels stay inside the editor window and have their own move and resize handles; they are not separate operating-system windows. Closed panels can be reopened through Panels. Editing, Captions, Effects, and Timeline presets are available under Workspaces. Save layout stores a named workspace on this device; Reset layout restores the standard arrangement. Up to 12 named layouts and the current arrangement persist between launches.

## Titles and captions

Titles provides eight editable styles: Essential title, Editorial, Lower third, Clean subtitles, Yellow punch, Boxed captions, Electric, and End credits. Enter text and duration, then choose a style to insert it at the playhead. Style selected applies appearance to selected text elements while preserving their content, position, and timing. Inspector provides the existing font, color, weight, alignment, spacing, background, transform, and keyframe controls, plus outline color/width and shadow color/blur/offsets. Appearance sizes scale from a 1080p reference and render in exported video.

Captions has Edit cues and Generate / import views. Generate uses the existing local transcription engine with language and words-per-caption controls. Import supports SRT, VTT, and ASS. Edit cues selects any text track, searches its cues, edits text and start/end times, adds or deletes cues, seeks/selects a cue, splits at the playhead, and merges with the next cue. Split requires at least two words and divides words proportionally at the chosen time; it is not word-aligned speech recognition. Merge retains the first cue's appearance. Batch styling and split/merge participate in timeline undo/redo.

Export SRT and Export VTT save the selected track as plain subtitle sidecars. These formats do not carry the editor's appearance styling; rendered video includes styling. VTT import preserves cue text and timing, removes markup, and ignores placement/region metadata and invalid cues. Select a cue to customize its appearance in Inspector. Overlapping cue times are allowed, so multiple captions can appear simultaneously when their intervals overlap.

## Effects and transitions

Effects has search, categories, and a choice between Selected clips and Adjustment layer. Use a card's + button to apply to selected visual clips, or create a layer at the playhead. Dragging an effect onto a clip also remains available. Inspector → Effects is available for titles as well as media clips and provides parameters, stack ordering (including earlier/later buttons), bypass, removal, and supported keyframes.

Alongside Gaussian blur and Color grade, the library adds Vignette, Film grain, Pixelate, Chromatic aberration, Sharpen, Sepia, Posterize, and Midnight / gold duotone. Each includes a Mix control. Film grain uses a fixed spatial pattern. Effects are implemented by the shared Rust GPU renderer used by preview and export.

Transitions applies entrance or exit behavior to selected visual clips: cross dissolve, dip to black, dip to white, wipes in both directions, iris, and zoom dissolve. Pick the edge and duration, then click a card. None removes the selected edge, and Remove both transitions clears both. Yellow timeline strips show applied transitions and open their panel when clicked.

At adjacent video/image cuts on the same track, an entrance dissolve or reveal retains the previous shot beneath the incoming shot. It uses source handles and holds the last source frame if handles run out. Timeline clip timing is unchanged. Other entrance/exit transitions reveal the underlying layers/background. Transitions are processed after the clip's other effects and limited to half the clip duration. These are visual transitions; audio has its own fade controls in the Audio workspace.

## Validation

- TypeScript and production web build.
- Rust editing and effects tests, including actual GPU shader checks for alpha-preserving looks, mix bypass, fades, dip-to-white, and reveal endpoints.
- Real WASM subtitle import/export, split/merge, and adjacent-cut handle tests.
- Canvas text rendering checks for outlines, shadows, and expanded bounds.
- Docking tree tests for edge docking, tabs, floating, closing/reopening, and invalid persistence recovery.

The wider test suite has three pre-existing failures in text-mask snapping, custom-mask point insertion, and fractional placement time fixtures. They are unrelated to this workspace change.

Native desktop checks confirmed styled-title insertion, caption cue discovery, drag-to-dock below the viewer, floating panel controls, and removal of duplicate sidebar tools. Panel dragging uses pointer events to support the native webview.
