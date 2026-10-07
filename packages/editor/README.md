# @jano-editor/editor

A modern terminal editor with plugin support. nano simplicity, VS Code power, zero bloat.

Website: [janoeditor.dev](https://janoeditor.dev) · Repo: [jano-editor/jano](https://github.com/jano-editor/jano)

---

## Why jano?

- **Shortcuts you already know** — Ctrl+S, Ctrl+Z, Ctrl+C/V, Ctrl+A. No modes, no `.vimrc`.
- **Multi-cursor that actually works** — Ctrl+Shift+Up/Down to stack, Ctrl+D for next occurrence, autocomplete inserts at every cursor.
- **Full mouse support** — click, double/triple-click, drag-select, scroll, auto-scroll at edges.
- **Autocomplete with popup** — plugin-driven completions + buffer words.
- **Inline validation** — errors and warnings from plugins appear right next to the line, F4 for details.
- **Speaks .editorconfig** - per-project indentation, line endings and save rules, like every serious editor.
- **Respects your files** - keeps LF/CRLF and BOM (mixed files are normalized), emoji and tabs line up exactly.
- **Never lose work** - unsaved changes are backed up in the background. After a crash, jano offers to restore them.
- **Auto-formatting** — F3 runs the active plugin's formatter on the whole document.
- **Plugin store** — `jano plugin install yaml`, browse at [janoeditor.dev/plugins](https://janoeditor.dev/plugins). On first start jano offers the recommended plugins and installs them in one go.
- **Zero bloat** — ~59KB JS bundle, starts instantly, smooth scrolling at 60,000+ lines.
- **100% JavaScript** — no native addons, no compile steps. If you can read JS, you can extend jano.

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

## Usage

```bash
jano myfile.yaml          # open a file
jano                      # new file
jano --debug myfile.yaml  # debug mode (logs to ~/.cache/jano/logs/)

jano plugin install yaml  # install a plugin
jano plugin list          # list installed plugins
jano plugin search        # browse the store
jano update               # check for updates
```

## Shortcuts (most useful)

| Shortcut                 | Action                   |
| ------------------------ | ------------------------ |
| Ctrl+S                   | Save                     |
| Ctrl+Z / Ctrl+Y          | Undo / Redo              |
| Ctrl+X / Ctrl+C / Ctrl+V | Cut / Copy / Paste       |
| Ctrl+F                   | Search & Replace         |
| Ctrl+G                   | Go to Line               |
| Ctrl+R                   | Recover Unsaved Files    |
| Ctrl+D                   | Select Next Occurrence   |
| Ctrl+Shift+Up/Down       | Add Cursor Above / Below |
| Ctrl+Space               | Trigger Autocomplete     |
| F1                       | Help                     |
| F3                       | Format (plugin)          |
| F4                       | Diagnostics              |
| F9                       | Settings                 |

Press F1 inside the editor for the full list.

## Plugins

Plugins add syntax highlighting, formatting, validation, and completions for any file format. A plugin is a single TypeScript file — if you can write a regex, you can build one.

Ready-made plugins: **YAML, JSON, Markdown, Shell, Dockerfile**.

Build your own: see the [docs](https://janoeditor.dev/docs) or check out [plugin-yaml](https://github.com/jano-editor/plugin-yaml) as a reference.

## License

[MIT](https://github.com/jano-editor/jano/blob/main/LICENSE)
