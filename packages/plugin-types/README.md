# @jano-editor/plugin-types

TypeScript types for writing plugins for [jano](https://janoeditor.dev), the terminal editor.

```bash
npm install -D @jano-editor/plugin-types
```

```ts
import type { LanguagePlugin } from "@jano-editor/plugin-types";

const plugin: LanguagePlugin = {
  name: "My Language",
  extensions: [".ext"],
  highlight: {
    keywords: ["if", "else", "return"],
    patterns: { comment: /\/\/.*$/gm, string: /"(?:[^"\\]|\\.)*"/g },
  },
};

export default plugin;
```

Every hook is optional: highlighting, `onKeyDown`, `onCursorAction`, `onFormat`, `onSave`, `onOpen`, `onValidate` and `onComplete`.

## Plugin API v2

`onFormat`, `onSave`, `onOpen`, `onValidate` and `onComplete` may return a Promise. Plugins that do must set `"api": 2` in their `plugin.json`, so older jano versions refuse them cleanly instead of misreading the Promise. `PLUGIN_API_VERSION` holds the version this package describes. Plugins written for API v1 keep working.

Positions (`col`, token `start` / `end`) are UTF-16 string indices, like `String.prototype.slice`, not screen columns.

## Docs

The full guide, with every hook, the manifest and how to publish: [janoeditor.dev/docs/plugins](https://janoeditor.dev/docs/plugins). A complete plugin to start from: [jano-editor/plugin-python](https://github.com/jano-editor/plugin-python).

## License

MIT
