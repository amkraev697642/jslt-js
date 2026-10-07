// Length of the token at the start of `rest`: a whole string literal, a word (with - and $), or one character.
export function tokenLength(rest) {
  const m = /^"(?:\\.|[^"\\\n])*"|^[\w$-]+|^[^\n]/.exec(rest);
  return m ? m[0].length : 0;
}

// 1-based line/column -> {from, to} covering the token there, or null when the line does not exist.
export function tokenRange(text, line, col) {
  let from = 0;
  for (let i = 1; i < line; i++) {
    from = text.indexOf("\n", from) + 1;
    if (!from) return null;
  }
  from += Math.max(col - 1, 0);
  const len = tokenLength(text.slice(from));
  return len ? { from, to: from + len } : null;
}
