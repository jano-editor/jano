# @jano-editor/ui

The terminal UI library behind [jano](https://janoeditor.dev). Plain TypeScript, no dependencies, no native addons.

```bash
npm install @jano-editor/ui
```

What's inside:

- **Screen and drawing**: a cell buffer flushed as one synchronized frame (no flicker on terminals that support it), RGB colors, text styles
- **Width-correct text**: emoji, CJK and combining marks take their real number of columns, from a table generated from the Unicode Character Database
- **Input**: key and mouse parsing, an input manager with layers, so the newest dialog gets the keys first
- **Widgets**: dialogs, alerts and banners, lists, popups, toggles, progress bars, a search and replace bar, the startup reveal animation

It is built for jano first. Have a look at [jano's editor package](https://github.com/jano-editor/jano/tree/main/packages/editor) to see it in use.

## License

MIT
