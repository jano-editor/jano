# @jano-editor/editor

The core package of [jano](https://janoeditor.dev) - a modern terminal editor with plugin support.

## Install

```bash
npm install -g @jano-editor/editor
```

Or use the install scripts from [janoeditor.dev](https://janoeditor.dev).

## Usage

```bash
# open a file
jano myfile.yaml

# new file
jano

# manage plugins
jano plugin install yaml
jano plugin list
jano plugin remove yaml
jano plugin search

# check for updates
jano update

# debug mode
jano myfile.yaml --debug
```

## What's inside

- File editing with undo/redo, clipboard, selections
- Multi-cursor editing (Ctrl+Shift+Up/Down)
- Search & Replace (Ctrl+F)
- Go to Line (Ctrl+G)
- Plugin loader with XDG-compliant paths
- Syntax highlighting, formatting, validation (via plugins)
- Inline diagnostics display
- Help dialog (F1), History browser (F2)
- Cross-platform: Linux, macOS, Windows, WSL
- 59KB built, zero lag with 60k+ lines

## Plugin System

Plugins are loaded from `~/.local/share/jano/plugins/` (Linux/macOS) or `%LOCALAPPDATA%/jano/plugins/` (Windows).

Each plugin is a directory with a `plugin.json` manifest and an `index.js` entry file.

Install plugins from the [Plugin Store](https://janoeditor.dev/plugins):

```bash
jano plugin install yaml
```

Or build your own - see the [docs](https://janoeditor.dev/docs).

## License

[MIT](../../LICENSE)
