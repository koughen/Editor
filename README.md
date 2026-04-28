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

---

## Download

Grab the latest installer from [Releases](https://github.com/koughen/Editor/releases).

| Platform | Format |
| --- | --- |
| **Linux** (Debian / Ubuntu) | `.deb` |
| **Linux** (Fedora / openSUSE) | `.rpm` |
| **macOS** | build from source (see below) |
| **Windows** | build from source (see below) |

> macOS and Windows builds aren't pre-bundled here yet — Tauri can't cross-compile, so each platform has to be built on its own machine. The build is one command.

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
- **Pink.** Why not.

<br />

## License

MIT — see [LICENSE](LICENSE).
Original work © OpenCut, 2025. Modifications © koughen, 2026.
