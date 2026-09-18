<div align="center">

<img src="assets/icon.png" alt="Editor" width="140" />

# Editor

**A simple, powerful video editor for your desktop.**
Trim, layer, and export — fast.

<br />

![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-pink)

[**Download**](https://github.com/koughen/Editor/releases) · [Build from source](#build-from-source) · [Tech](#stack)

</div>

<br />

<div align="center">
  <img src="docs/screenshots/edit-workspace.png" alt="Editor — Edit workspace with titles and dockable panels" width="100%" />
</div>

<br />

---

## Install

### One-liners

<table>
<tr>
  <th>macOS</th>
  <td>

```sh
brew install --cask koughen/editor/editor
```

  </td>
</tr>
<tr>
  <th>Windows</th>
  <td>

```powershell
scoop bucket add koughen https://github.com/koughen/scoop-editor
scoop install koughen/editor
```

  </td>
</tr>
<tr>
  <th>Linux (Arch / AUR)</th>
  <td>

Manual install via the `.AppImage` from [Releases](https://github.com/koughen/Editor/releases) — `chmod +x Editor*.AppImage && ./Editor*.AppImage`.

  </td>
</tr>
<tr>
  <th>Linux (Debian / Ubuntu)</th>
  <td>

```sh
curl -L -o editor.deb $(gh release view --repo koughen/Editor --json assets --jq '.assets[] | select(.name | endswith(".deb")) | .url' | head -1)
sudo apt install ./editor.deb
```

Or grab the `.deb` from [Releases](https://github.com/koughen/Editor/releases) and double-click.

  </td>
</tr>
<tr>
  <th>Linux (Fedora / openSUSE)</th>
  <td>

`.rpm` from [Releases](https://github.com/koughen/Editor/releases) — `sudo dnf install ./Editor-*.rpm`.

  </td>
</tr>
</table>

### Manual download

All installers — `.dmg`, `.msi`, `.AppImage`, `.deb`, `.rpm` — live on the [Releases page](https://github.com/koughen/Editor/releases).

#### "Editor cannot be opened because it's from an unidentified developer" (macOS)

The `.dmg` isn't code-signed (signing certs cost $99/yr). One-time fix after dragging `Editor.app` to `/Applications`:

```sh
xattr -d com.apple.quarantine /Applications/Editor.app
```

Or right-click the app the first time you open it → **Open** → confirm. The Homebrew install above bypasses this automatically.

#### "Windows protected your PC" (Windows)

Click **More info → Run anyway**. Same reason — no Authenticode signing cert.

<br />

## Build from source

You need **Rust**, **Bun**, and the WebKit2GTK dev libraries (Linux only).

```sh
# Linux deps (Arch)
sudo pacman -S webkit2gtk-4.1 libsoup3 base-devel

# macOS deps
xcode-select --install
```

Then:

```sh
git clone https://github.com/koughen/Editor.git
cd Editor
cargo install wasm-pack --locked
rustup target add wasm32-unknown-unknown
bash script/build-audio-worklet
wasm-pack build rust/wasm --target bundler --out-dir pkg
bun install

# Static frontend
bun --cwd apps/web run build

# Desktop bundle
cd apps/tauri/src-tauri
bunx @tauri-apps/cli@^2 build
```

Artifacts land in `apps/tauri/src-tauri/target/release/bundle/`:
- Linux: `deb/`, `rpm/`, `appimage/`
- macOS: `macos/Editor.app`, `dmg/Editor_*.dmg`
- Windows: `msi/`, `nsis/`

## Run in dev

```sh
# Web dev server (port 3001)
bun --cwd apps/web run dev -- -p 3001

# In another terminal — Tauri shell with hot reload
cd apps/tauri/src-tauri
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
WEBKIT_DISABLE_COMPOSITING_MODE=1 \
bunx @tauri-apps/cli@^2 dev
```

The two env vars are a Wayland + WebKit2GTK workaround — drop them on macOS / Windows / X11.

<br />

## Stack

<table>
<tr>
  <td><b>Shell</b></td>
  <td>Tauri 2 (Rust)</td>
</tr>
<tr>
  <td><b>Frontend</b></td>
  <td>Next.js 16 + React 19, statically exported</td>
</tr>
<tr>
  <td><b>Editor core</b></td>
  <td>WebGPU/Canvas renderer, Mediabunny for codecs, custom Rust WASM time math</td>
</tr>
<tr>
  <td><b>Storage</b></td>
  <td>IndexedDB — projects live entirely on your machine</td>
</tr>
<tr>
  <td><b>Styling</b></td>
  <td>Tailwind v4, custom design tokens</td>
</tr>
</table>

<br />

## What's in this fork

This is a personal-use fork of [OpenCut](https://github.com/OpenCut-app/OpenCut) — repurposed as a local desktop app instead of a hosted SaaS. The web shell, marketing pages, auth, and server APIs are stripped out; what's left is the editor.

Differences from upstream:
- **Desktop-first.** Tauri shell, no web server in the loop.
- **Local everything.** No accounts, no telemetry, no remote calls.
- **Trimmed UI.** Direct boot into the projects screen.
- **Flexible workspaces.** Edit, Color, and Audio pages with a black-and-yellow theme.

<br />

## License

MIT — see [LICENSE](LICENSE).
Original work © OpenCut, 2025. Modifications © koughen, 2026.

## Edit workspace

The **Edit** workspace brings titles, captions, effects, and transitions into dedicated panels. Drag tabs to regroup or split panels, resize tiles, float panels within the app, and save named layouts. Eight title styles include outline and shadow controls; the caption editor supports cue timing, split/merge, import, and SRT/VTT export. Search the effects library and apply visual entrance/exit transitions directly to selected clips. Each tool has one home, without duplicate sidebar entries. See [Edit workspace](docs/edit-workspace.md) for controls and behavior.

## Color correction

The **Color** workspace includes serial grading nodes, primary and log wheels, RGB bars, custom and secondary curves, RGB mixing, qualifiers, windows, 3D LUTs, numeric keyframes, Gallery stills, reference wipe, preview bypass/matte highlight, and five viewer scopes. See [Color workspace](docs/color-workspace.md) for controls, the Resolve comparison and remaining differences, build steps, and validation.

![Color workspace with grading wheels, nodes, and scopes](docs/screenshots/color-workspace.png)

## Audio mixing

The **Audio** workspace adds track and bus mixing, EQ, compression, reverb, delay, cleanup tools, routing, automation, fades, LUFS/true-peak measurement, and WAV/stem delivery. The macOS app also hosts installed effect Audio Units through rendered previews and exports. See [Audio workspace](docs/audio-workspace.md) for controls, supported workflows, and validation.

![Audio workspace with mixer and channel processing](docs/screenshots/audio-workspace.png)

## Export and app handoffs

The **Export** workspace adds detailed video and audio encoding controls plus timeline handoffs to CapCut, After Effects, Premiere Pro, and DaVinci Resolve. Choose editable clips or a rendered appearance transfer. See [Export workspace](docs/export-workspace.md) for format support, import steps, fidelity limits, and validation.

![Export workspace with video settings and application handoffs](docs/screenshots/export-workspace.png)
