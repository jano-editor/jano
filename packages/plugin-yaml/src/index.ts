const TAB_SIZE = 2;

const keywords = ['true', 'false', 'null', 'yes', 'no', 'on', 'off'];

const plugin = {
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

  onNewLine(ctx: any) {
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
