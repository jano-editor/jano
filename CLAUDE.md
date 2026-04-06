# jano - Terminal Editor

## Tech Stack

- TypeScript, Node.js
- pnpm workspace (monorepo)
- Vite+ (vp) for build, lint, format
- Custom terminal UI lib (@jano-editor/ui)
- Plugin system with external plugins (~/.local/share/jano/plugins/)

## Packages

- `packages/ui` - Terminal drawing lib (screen, draw, color, dialog)
- `packages/editor` - The editor itself
- `packages/plugin-types` - Shared plugin interface (@jano-editor/plugin-types)
- `packages/plugin-yaml` - YAML plugin (highlight + format)

## Commands

- `pnpm tsx packages/editor/src/index.ts <file>` - Run in dev
- `vp build && node dist/index.js <file>` - Run production build
- `vp check` - Lint + format + typecheck
- `pnpm --filter @jano-editor/plugin-yaml install-plugin` - Build + install YAML plugin

## TODO v0.1

### Critical (must have)

- [x] Search (Ctrl+F) with live results + list component
- [x] Search & Replace (Ctrl+F, Tab to replace field)
- [x] Go to line (Ctrl+G) with start/end/line number
- [x] New file (jano without argument, Save As dialog, overwrite warning, error handling)

### Important

- [ ] Own cursor rendering (all cursors blink)
- [ ] Mouse support (click = set cursor)
- [ ] Soft-wrapping long lines
- [ ] Read-only mode

### Nice to have

- [ ] Multiple files / buffers
- [ ] Split view
- [ ] Regex search
- [ ] Macros
- [ ] Plugin manager dialog (enable/disable with checkboxes)
- [ ] `jano plugin install <name>` (needs registry server)
- [ ] Plugin update check (needs endpoint)

### Done

- [x] File open, edit, save (Ctrl+S)
- [x] Cursor navigation (arrows, Home/End, Page Up/Down)
- [x] Syntax highlighting (plugin-based)
- [x] Auto-formatting (F3, plugin-based)
- [x] Auto-indent on Enter (plugin-based)
- [x] Selection (Shift+Arrow, Shift+Ctrl+Arrow for words)
- [x] Cut/Copy/Paste (Ctrl+X/C/V)
- [x] Multi-cursor (Ctrl+Shift+Up/Down)
- [x] Multi-cursor aware cut/copy/paste
- [x] Undo/Redo with cursor state restore (Ctrl+Z/Y)
- [x] History browser (F2)
- [x] Word navigation (Ctrl+Left/Right)
- [x] Word delete (Ctrl+Backspace/Delete)
- [x] Move lines (Alt+Up/Down)
- [x] Exit dialog with unsaved changes
- [x] Plugin system (external, XDG paths, API versioning)
- [x] Scrollbar (vertical + horizontal)
- [x] Terminal resize handling
- [x] 60k+ lines performance
- [x] Vite+ build (21ms, 59KB)

## Architecture Details

### Entry Points

- **CLI:** `packages/editor/src/cli.ts` - Handles `jano plugin install/remove/search/list`, `--version`, `--help`
- **Editor:** `packages/editor/src/index.ts` - Terminal UI event loop, plugin init, editor rendering

### Build

- Vite + Rollup, target Node 22 (ES2022), ESM only
- Output: single `cli.js` ES module
- Externals in vite.config.ts: `adm-zip`, `clipboardy`, all `node:*` modules
- Final binary: ~59KB

### Plugin System (critical architecture)

**Loading:** `packages/editor/src/plugins/loader.ts`

- Plugins are dynamically imported at runtime: `await import(pathToFileURL(entryPath).href)`
- A global `require` is made available for plugins that bundle CJS deps (loader.ts line 10-14)
- Incompatible API versions are skipped at load time

**Storage (XDG-compliant):**

- Linux: `~/.local/share/jano/plugins/`
- macOS: `~/Library/Application Support/jano/plugins/`
- Windows: `%LOCALAPPDATA%\jano\plugins\`
- Override via `JANO_HOME` env var

**Plugin structure:** Each plugin is a directory with:

- `plugin.json` - Metadata (name, version, API version, extensions, entry point)
- Entry file (ES module)

**Plugin interface** (`@jano-editor/plugin-types` → `LanguagePlugin`):

- `highlight()`, `onKeyDown()`, `onCursorAction()`, `onFormat()`, `onSave()`, `onValidate()`, `onOpen()`

**Installation:** ZIP download from `https://janoeditor.dev/api/plugins/`, extracted via `adm-zip`

**API versioning:** `CURRENT_API_VERSION` in `packages/editor/src/plugins/manifest.ts`

### Runtime Dependencies

- `clipboardy` - Clipboard access (delegates to system commands: xclip/xsel on Linux, pbcopy on macOS, PowerShell on Windows). Optional, gracefully fails on headless.
- `adm-zip` - ZIP extraction for plugin installation. Pure JS, no native bindings.
- **No native/C++ addons in runtime.** All native deps (oxfmt bindings etc.) are dev-only.

### Standalone Binary Distribution (planned)

**Goal:** `curl | bash` installer that downloads a single binary instead of requiring npm/Node.

**Bun compile is the most promising approach:**

- `bun build --compile` supports runtime `import()` from external files → plugin system should work
- Cross-compile built-in: `--target=bun-linux-x64`, `--target=bun-darwin-arm64`
- No native addons to worry about

**Test with:** `bun build ./packages/editor/dist/cli.js --compile --outfile jano && ./jano plugin list`

**Key concern:** Dynamic plugin loading (`import(pathToFileURL(...))`) must work from compiled binary. Bun supports this, Node SEA does not (would need `createRequire` workaround).

**Node SEA alternative:** More restrictive with dynamic imports, harder to make plugin loading work. Only consider if Bun proves incompatible.

## Code Conventions

- Comments in English
- Communication in German
- All imports use .ts extensions
- No external UI libs - custom terminal rendering
- Plugins must not know about editor internals
- Editor must not know about formatting rules
