<p align="center">
  <img src="https://janoeditor.dev/images/logo_180-180.png" width="80" height="80" alt="jano" />
</p>

<h1 align="center">jano</h1>

<p align="center">
  A modern terminal editor with plugin support.<br>
  nano simplicity. VS Code power. Zero bloat.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@jano-editor/editor"><img src="https://img.shields.io/npm/v/@jano-editor/editor.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@jano-editor/editor"><img src="https://img.shields.io/npm/dm/@jano-editor/editor.svg" alt="npm downloads" /></a>
  <a href="https://github.com/jano-editor/jano/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jano-editor/jano.svg" alt="license" /></a>
</p>

---

## Install

**Linux / macOS**

```bash
curl -fsSL https://janoeditor.dev/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://janoeditor.dev/install.ps1 | iex
```

**npm**

```bash
npm install -g @jano-editor/editor
```

## Features

- **Familiar shortcuts** - Ctrl+S, Ctrl+Z, Ctrl+C/V, Ctrl+A - no learning curve
- **Syntax highlighting** - via plugins for YAML, JSON, Markdown, Shell, Dockerfile and more
- **Auto-formatting** - press F3 to format the entire document
- **Autocomplete** - plugin-driven completions plus buffer words, works with multi-cursor
- **Inline validation** - errors and warnings shown directly in the editor (F4 for details)
- **Multi-cursor editing** - Ctrl+Shift+Up/Down to stack cursors, Ctrl+D for next occurrence
- **Mouse support** - click, double/triple-click to select, drag, scroll, auto-scroll at edges
- **Search & Replace** - Ctrl+F with live results
- **Respects your files** - keeps LF or CRLF line endings and a UTF-8 BOM (mixed line endings are normalized). Tabs, emoji and CJK are drawn at their real width
- **Crash recovery** - unsaved changes are backed up in the background (`~/.local/state/jano/backups/`). After a crash or a killed terminal, a banner offers to restore them (Ctrl+R)
- **.editorconfig** - indentation, line endings, BOM, trailing whitespace and final newline follow the project's `.editorconfig` (F9 shows which values come from it)
- **Settings dialog** - F9 for tab size, line numbers, autocomplete and the startup animation
- **Structured debug logs** - `--debug` writes JSON events to `~/.cache/jano/logs/` for easy bug diagnosis
- **Plugin system** - install plugins from the [Plugin Store](https://janoeditor.dev/plugins). On first start a welcome dialog offers the recommended plugins and installs them without a restart (turn it off in F9)
- **60,000+ lines** - no lag, ~59KB JS bundle, starts instantly
- **Cross-platform** - Linux, macOS, Windows, WSL

## Usage

```bash
# open a file
jano config.yaml

# new file
jano

# manage plugins
jano plugin install yaml
jano plugin list
jano plugin remove yaml
jano plugin search

# update jano
jano update
```

## Shortcuts

| Shortcut                 | Action                   |
| ------------------------ | ------------------------ |
| Ctrl+S                   | Save                     |
| Ctrl+Q                   | Exit                     |
| Ctrl+Z / Ctrl+Y          | Undo / Redo              |
| Ctrl+X / Ctrl+C / Ctrl+V | Cut / Copy / Paste       |
| Ctrl+A                   | Select All               |
| Ctrl+F                   | Search & Replace         |
| Ctrl+G                   | Go to Line               |
| Ctrl+R                   | Recover Unsaved Files    |
| Ctrl+D                   | Select Next Occurrence   |
| Ctrl+Shift+Up/Down       | Add Cursor Above / Below |
| Ctrl+Space               | Trigger Autocomplete     |
| Alt+Up/Down              | Move Line                |
| F1                       | Help                     |
| F2                       | History Browser          |
| F3                       | Format (plugin)          |
| F4                       | Diagnostics              |
| F9                       | Settings                 |

## Plugins

Plugins add syntax highlighting, formatting, validation and more for any file format.

```bash
jano plugin install yaml
jano plugin install json
jano plugin install markdown
jano plugin install shell
jano plugin install dockerfile
```

Browse all available plugins at [janoeditor.dev/plugins](https://janoeditor.dev/plugins).

### Build your own

A plugin is a single TypeScript file. See the [docs](https://janoeditor.dev/docs) or check out [plugin-yaml](https://github.com/jano-editor/plugin-yaml) as a reference.

## Packages

This is a monorepo with the following packages:

| Package                                              | Description              |
| ---------------------------------------------------- | ------------------------ |
| [`@jano-editor/editor`](packages/editor)             | The editor               |
| [`@jano-editor/ui`](packages/ui)                     | Terminal drawing library |
| [`@jano-editor/plugin-types`](packages/plugin-types) | Plugin interface types   |

## 100% JavaScript

jano is built entirely in JavaScript/TypeScript on Node.js. No native binaries, no compilation. If you can read JS, you can understand and extend jano.

## License

[MIT](LICENSE)
