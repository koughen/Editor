# Studio UI theme

Editor uses a square, monochrome interface with yellow accents, inspired by the
[Sony FX5 menu](https://helpguide.sony.net/ilc/2630/v1/en/contents/quick_menu.html)
and the existing editor workspace layout.

- Use the shared tokens in `apps/web/src/app/globals.css` for interface colors.
  Recessed surfaces are `#0b0b0b`, panels `#171717`, raised controls `#222222`,
  and hover surfaces `#2c2c2c`. Primary text is `#f2f2f2`, muted text `#a3a3a3`,
  borders `#363636`, and the accent is `#ffd600`.
- Buttons, panels, inputs, menus, and setting tiles have square corners. Reserve
  circular shapes for functional controls such as color wheels and point handles.
- Primary actions and active workspace tabs use solid yellow with black text.
  Secondary selections use solid yellow borders on neutral surfaces. Keyboard
  focus uses a visible yellow outline. Avoid pastel fills and selection glows.
- Group related settings into bordered tiles with a small label and a clear value.
  Use monospace for timecode and numeric readouts. Keep descriptive text readable.
- Timeline clips and mixer channels use neutral grays; selection, the playhead,
  enabled indicators, and important meter levels use yellow.
- Media content, color wheels, RGB channels, hue scales, and color-analysis scopes
  retain their functional colors. Do not apply grayscale to the preview canvas.
- Edit, Color, Audio, project browsing, and portaled dialogs share this palette.
  Color and Audio CSS aliases must reference the global tokens. The app and its
  desktop window use dark mode regardless of the system theme.
