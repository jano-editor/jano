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
- **Inline validation** - errors and warnings shown directly in the editor (F4 for details)
- **Multi-cursor editing** - Ctrl+Shift+Up/Down to add cursors, edit multiple lines at once
- **Search & Replace** - Ctrl+F with live results
- **Plugin system** - install plugins from the [Plugin Store](https://janoeditor.dev/plugins)
- **60,000+ lines** - no lag, 59KB binary, starts instantly
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

| Shortcut                 | Action             |
| ------------------------ | ------------------ |
| Ctrl+S                   | Save               |
| Ctrl+Q                   | Exit               |
| Ctrl+Z / Ctrl+Y          | Undo / Redo        |
| Ctrl+X / Ctrl+C / Ctrl+V | Cut / Copy / Paste |
| Ctrl+A                   | Select All         |
| Ctrl+F                   | Search & Replace   |
| Ctrl+G                   | Go to Line         |
| Ctrl+Shift+Up/Down       | Multi-Cursor       |
| Alt+Up/Down              | Move Line          |
| F1                       | Help               |
| F2                       | History Browser    |
| F3                       | Format (plugin)    |
| F4                       | Diagnostics        |

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
