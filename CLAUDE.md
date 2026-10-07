# jano - Terminal Editor

## Tech Stack

- TypeScript 7 (native), Node.js 22
- Bun for tests and standalone binaries, version pinned in `.bun-version` (CI reads it)
- pnpm workspace (monorepo)
- Vite+ (vp) for build, lint, format
- Custom terminal UI lib (@jano-editor/ui)
- Plugin system with external plugins (~/.local/share/jano/plugins/)

## Packages

- `packages/ui` - Terminal drawing lib (screen, draw, color, dialog, alert, popup, list, toggle, search)
- `packages/editor` - The editor itself
- `packages/plugin-types` - Shared plugin interface (@jano-editor/plugin-types)

Plugins live in separate repos (`~/projects/jano-plugins/`): plugin-javascript, plugin-python, plugin-toml, plugin-yaml, plugin-json, plugin-markdown, plugin-shell, plugin-dockerfile.

## Commands

- `pnpm dev <file>` - Run in dev via cli.ts (adds `-- --debug` to enable debug logs)
- `JANO_DEBUG=1 pnpm dev <file>` - Run with debug logs (alternative to `-- --debug`)
- `vp build` - Production build (ESM, about 85 KB gzipped)
- `vp check` - Lint + format + typecheck
- `bun test` - Run unit tests (uses `bun:test`)

## TODO

### Critical (must have)

- [x] Search (Ctrl+F) with live results + list component
- [x] Search & Replace (Ctrl+F, Tab to replace field)
- [x] Go to line (Ctrl+G) with start/end/line number
- [x] New file (jano without argument, Save As dialog, overwrite warning, error handling)

### Important

- [ ] Own cursor rendering (all cursors blink)
- [x] Mouse support (click, double/triple-click, drag-to-select, scroll, auto-scroll)
- [ ] Soft-wrapping long lines
- [ ] Read-only mode

### Nice to have

- [ ] Multiple files / buffers
- [ ] Split view
- [ ] Regex search
- [ ] Macros
- [ ] Plugin manager dialog (enable/disable with checkboxes)
- [x] `jano plugin install <name>` (via janoeditor.dev registry)
- [x] Plugin update check (startup banner via npm registry)

### Done

- [x] File open, edit, save (Ctrl+S)
- [x] Cursor navigation (arrows, Home/End, Page Up/Down)
- [x] Syntax highlighting (plugin-based)
- [x] Auto-formatting (F3, plugin-based)
- [x] Auto-indent on Enter (plugin-based)
- [x] Selection (Shift+Arrow, Shift+Ctrl+Arrow for words)
- [x] Cut/Copy/Paste (Ctrl+X/C/V)
- [x] Multi-cursor (Ctrl+Shift+Up/Down)
- [x] Multi-cursor next occurrence (Ctrl+D)
- [x] Multi-cursor aware cut/copy/paste + autocomplete
- [x] Undo/Redo with cursor state restore (Ctrl+Z/Y)
- [x] History browser (F2)
- [x] Word navigation (Ctrl+Left/Right)
- [x] Word delete (Ctrl+Backspace/Delete)
- [x] Move lines (Alt+Up/Down)
- [x] Exit dialog with unsaved changes
- [x] Plugin system (external, XDG paths, API versioning, runs under sudo)
- [x] Scrollbar (vertical + horizontal)
- [x] Terminal resize handling
- [x] 60k+ lines performance
- [x] Vite+ build
- [x] F1 Help dialog, F9 Settings dialog
- [x] Autocomplete popup with plugin + buffer-word completions
- [x] Inline diagnostics (F4) + validator with debounce
- [x] Debug logger (evlog + file drain, red DEBUG badge)
- [x] Update banner on startup (npm registry check, 6h cache)
- [x] Standalone Bun-compiled binary (~95 MB, `jano update` detects install method)
- [x] Crash recovery (background backups, banner + Ctrl+R restore dialog)

## Architecture Details

### Entry Points

- **CLI:** `packages/editor/src/cli.ts` - Handles `jano plugin install/remove/search/list`, `--version`, `--help`
- **Editor:** `packages/editor/src/index.ts` - Terminal UI event loop, plugin init, editor rendering

### Build

- Vite + Rollup, target Node 22 (ES2022), ESM only
- Output: `cli.js` plus chunks (logger, ui), ES modules
- Externals in vite.config.ts: `adm-zip`, `clipboardy`, all `node:*` modules
- Bundle size: about 314 KB raw, 85 KB gzipped

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

- Highlighting: `highlight` (regex patterns), `highlightLine` (custom tokenizer with multiline access)
- Edit hooks: `onCursorAction`, `onKeyDown` (sync, run per keystroke), `onFormat` (F3), `onSave` (before writing, edits are saved and undoable), `onOpen` (on start and after a restore, not after saves)
- Validation: `onValidate` (debounced, returns `Diagnostic[]`)
- Autocomplete: `onComplete` (returns `CompletionItem[]`)
- API v2: `onFormat`, `onSave`, `onOpen`, `onValidate`, `onComplete` may return a Promise. Late results are dropped if the document or cursor changed meanwhile. Plugins returning Promises must declare `"api": 2`, so older jano versions reject them cleanly. `MIN_API_VERSION` / `CURRENT_API_VERSION` live in `plugins/manifest.ts`.
- Sync hooks go through `callPluginHook()`, async-capable ones through `callPluginHookAsync()` (timeout, rejections). Both isolate crashes and log failures with stack traces in debug mode
- Positions (`col`, token `start`/`end`) are UTF-16 string indices, not screen columns
- Load errors are explained with `why` / `fix` / `link` (`loader.ts`), shown in `jano plugin list` and as an alert on startup

**Installation:** ZIP download from `https://janoeditor.dev/api/plugins/`, extracted via `adm-zip`

**API versioning:** `CURRENT_API_VERSION` in `packages/editor/src/plugins/manifest.ts`

### Runtime Dependencies

- `clipboardy` - Clipboard access (delegates to system commands: xclip/xsel on Linux, pbcopy on macOS, PowerShell on Windows). Optional, gracefully fails on headless.
- `adm-zip` - ZIP extraction for plugin installation. Pure JS, no native bindings.
- **No native/C++ addons in runtime.** All native deps (oxfmt bindings etc.) are dev-only.

### Standalone Binary Distribution

`bun build --compile` is in use. Final binary is ~95 MB (includes the Bun runtime) and has zero external requirements, no Node, no npm.

Release pipeline (`.github/workflows/release.yml`):

- Targets: `linux-x64`, `linux-arm64`, `windows-x64` (built on Linux), `darwin-arm64`, `darwin-x64` (built and ad-hoc signed on a `macos-15` runner, unsigned binaries get killed on Apple Silicon).
- Every editor release ships `SHA256SUMS`. `install.sh` and `jano update` verify it.
- Only editor releases are marked "latest". ui/plugin-types releases use `--latest=false`, and install/update look up the newest `editor-v*` tag anyway.
- Distribution is Homebrew + `install.sh` only, no notarization (direct browser downloads are not a supported install path).
- Dry run: PRs touching the workflow, lockfile or package.json files (and manual "Run workflow") run the full pipeline without publishing.

Dynamic plugin loading via `await import(pathToFileURL(...).href)` works from the compiled binary. `jano update` detects the install method (`npm` / `brew` / `standalone` / `dev`) and upgrades accordingly — npm via `npm install -g`, standalone via download + atomic rename of `process.execPath`.

### Rendering Pipeline

The render cycle has three steps that MUST happen in order:

1. `render()` in `render.ts` — draws editor content, title bar, status bar, help bar, flushes
2. Overlays — `renderCompletionPopup()`, then `drawAlert()`, each flushes
3. `positionCursor()` — exported from `render.ts`, called as the LAST step of `renderView()` in `index.ts`. Re-positions the terminal cursor on the primary editor cursor so preceding flushes don't leave the blink at the end of the last written cell.

Never call `screen.moveTo` / `screen.showCursor` from inside `render()` or an overlay — the subsequent overlay flush will overwrite it.

### Text Layout

- Cursor `x` and all edits use **string indices** (UTF-16). `cm.scrollX`, mouse columns and the terminal cursor use **screen columns**.
- Convert only through `text-layout.ts` (`colAt`, `idxAtCol`, `layoutLine`, `lineWidth`). Never use `line[x]` or `x - scrollX` for drawing.
- Tabs expand to tab stops, emoji/CJK take 2 columns, control chars render as control pictures (`␍`). Cursor moves and deletes step by grapheme (`nextBoundary`/`prevBoundary`), word chars are `WORD_CHAR` (unicode-aware, `\w` misses umlauts).
- Long non-ASCII lines get a cached grapheme index, so render cost stays bound to the viewport.
- Plugins keep seeing string indices (`col` in the plugin API is a UTF-16 index).

### Settings and .editorconfig

- `getEditorSettings()` (`settings.ts`) returns the user's settings merged with `.editorconfig` overrides for the open file. Always read settings through it.
- `editorconfig.ts` parses `.editorconfig` (own small parser and glob matcher, no dependency), walks up until `root = true`. `applyEditorConfig()` in `index.ts` runs on open, Save As and restore (via `reloadPlugin`).
- `end_of_line` and `charset` only apply to new files, existing files keep what they have. `trim_trailing_whitespace` / `insert_final_newline` run on save as one undo step, after the plugin's `onSave`.

### Crash Safety

- `utils/crash-guard.ts` restores the terminal on uncaught errors, SIGTERM and SIGHUP, and writes a final backup first.
- `backup.ts` keeps one backup per jano process in the `backups` path (`~/.local/state/jano/backups/` on Linux), named `<pid>-<startTime>.json`. Written async and debounced while the buffer is dirty, deleted when it is clean again or on a clean exit.
- A backup whose pid is no longer alive is an orphan from a crashed session. On startup a banner offers the restore dialog (`dialogs/recover.ts`, Ctrl+R). Backups are never deleted on load, only after save, discard or an explicit restore/delete.

### Debug Logging

When `JANO_DEBUG=1` (or `--debug` flag), events are written to `~/.cache/jano/logs/YYYY-MM-DD.jsonl` via `evlog` + a batched drain pipeline (preserves ordering). No output in non-debug mode. See `utils/logger.ts`. Plugin hook calls go through `callPluginHook()` which logs:

- `plugin_hook_result` — plugin returned an edit
- `plugin_hook_slow` — plugin took ≥5ms without a result
- `plugin_hook_failed` — plugin crashed (with stack trace)

Silent when plugins return null/undefined and complete quickly — no per-keystroke spam.

## Code Conventions

- Comments in English
- Communication in German
- All imports use .ts extensions
- No external UI libs - custom terminal rendering
- Plugins must not know about editor internals
- Editor must not know about formatting rules

## Writing Style for Issues, PRs, Commits

- Keep it human and simple. No corporate speak, no walls of bullet points, no "## Test Plan" sections for small features.
- Short PRs get a 1-2 sentence description, not a template.
- Issues read like a real person wrote them: what's wrong, what should happen, maybe a quick example. Skip the "Acceptance Criteria" scaffolding.
- Commit messages: short, lowercase, no "Co-Authored-By" footers.

## Keeping Docs in Sync

Whenever a feature ships, user-facing docs MUST be updated in the same change:

- **`README.md`** (repo root) — the longer read. Feature list, full shortcut table, plugin list, install instructions. Can be more verbose, allowed to be reading material.
- **`packages/editor/README.md`** — **this is the npm page**. Must hit hard with the wow features right at the top (multi-cursor, autocomplete, plugins, zero bloat, 100% JS). No dry checklists — frame it as "Why jano?" with punchy one-liners. But must not miss any user-facing capability.
- **`~/projects/janoeditor.dev/app/pages/index.vue`** — landing page: shortcut list, roadmap, stats line. The hero demo scenes are in `app/utils/scenes.ts` (replayed jano sessions, no videos)
- **`~/projects/janoeditor.dev/content/{en,de}/docs/*.md`** — the docs (Nuxt Content): getting started, shortcuts, settings, CLI, writing plugins (every hook), troubleshooting
- **`~/projects/janoeditor.dev/i18n/locales/{en,de}.json`** — all translated strings of the site (landing, store, search)
- **This `CLAUDE.md`** — if architecture, packages, commands, or conventions changed

Rule: if someone lands on janoeditor.dev or npmjs.com five minutes after a release, they should see the new feature. Stale docs are treated as a release bug.

## Debug Logging Convention

**Goal:** In debug mode, jano writes structured logs to a file. 99% of bugs should be diagnosable from those logs alone — without reproducing locally.

- Debug mode is enabled via `--debug` flag or `JANO_DEBUG=1` env var.
- Logs go to `~/.cache/jano/logs/YYYY-MM-DD.jsonl` (rotated daily, max 7 days kept). When debug is off, nothing is logged.
- A red `DEBUG` badge is shown in the top title bar so the user knows debug mode is active.
- Every new feature ships with debug logs. When adding code, log the relevant state transitions, inputs, errors. Default to "more logs" — they're behind the debug flag anyway.
- Log events are structured (`{ action, ...fields }`, not prose). Use `<subsystem>_<verb>` for action names (e.g. `file_save_done`, `plugin_hook_failed`).
- Plugin errors use the structured-error pattern: `why` / `fix` / `link`.
- Hot paths (keystrokes, renders) are NEVER logged per-event. Plugin hooks are silent when they return null and run fast — see `callPluginHook` in `plugins/call.ts`.
