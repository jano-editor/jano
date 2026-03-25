import type { LanguagePlugin, PluginContext, EditResult } from '@jano/plugin-types';

const TAB_SIZE = 2;

const keywords = ['true', 'false', 'null', 'yes', 'no', 'on', 'off'];

const plugin: LanguagePlugin = {
  name: 'YAML',
  extensions: ['.yml', '.yaml'],
  highlight: {
    keywords,
    patterns: {
      comment: /#.*$/gm,
      string: /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
      number: /\b\d+\.?\d*\b/g,
      type: /^[\w.-]+(?=\s*:)/gm,
      variable: /\$\{?\w+\}?/g,
    },
  },

  onFormat(ctx: PluginContext) {
    const lines = [...ctx.lines] as string[];
    const formatted: string[] = [];
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      // empty lines pass through
      if (trimmed === '') {
        formatted.push('');
        continue;
      }

      // comment: keep at current indent
      if (trimmed.startsWith('#')) {
        formatted.push(' '.repeat(indentLevel * TAB_SIZE) + trimmed);
        continue;
      }

      // list item: indent at current level
      if (trimmed.startsWith('- ')) {
        formatted.push(' '.repeat(indentLevel * TAB_SIZE) + trimmed);
        // if list item has nested content (value after - is a key:)
        if (/^- \S+:/.test(trimmed) && trimmed.endsWith(':')) {
          indentLevel++;
        }
        continue;
      }

      // key: value or key:
      if (/^\S.*:/.test(trimmed)) {
        // check if this key is at a lower indent than current (dedent)
        const originalIndent = raw.length - raw.trimStart().length;
        const expectedIndent = indentLevel * TAB_SIZE;

        if (originalIndent < expectedIndent && indentLevel > 0) {
          // dedent to match original structure
          indentLevel = Math.round(originalIndent / TAB_SIZE);
        }

        formatted.push(' '.repeat(indentLevel * TAB_SIZE) + trimmed);

        // key with no value (just "key:") → next lines indent
        if (trimmed.endsWith(':')) {
          indentLevel++;
        }
        continue;
      }

      // everything else: keep at current indent
      formatted.push(' '.repeat(indentLevel * TAB_SIZE) + trimmed);
    }

    return {
      replaceAll: formatted,
      cursors: [{ position: ctx.cursors[0].position, anchor: null }],
    };
  },

  onNewLine(ctx: PluginContext) {
    const cursor = ctx.cursors[0];
    const curLine = cursor.position.line;
    const prevLine = curLine > 0 ? ctx.lines[curLine - 1] : '';
    const match = prevLine.match(/^(\s*)/);
    let indent = match ? match[1] : '';

    if (/:\s*$/.test(prevLine)) {
      indent += ' '.repeat(TAB_SIZE);
    } else if (/^\s*-\s/.test(prevLine)) {
      // continue list, keep indent
    } else if (prevLine.trim() === '') {
      indent = '';
    }

    if (indent.length === 0) return null;

    return {
      edits: [{
        range: { start: { line: curLine, col: 0 }, end: { line: curLine, col: 0 } },
        text: indent,
      }],
      cursors: [{ position: { line: curLine, col: indent.length }, anchor: null }],
    };
  },
};

export default plugin;
