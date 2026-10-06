// JsltException (1-based line/column, point only) → CodeMirror diagnostic spanning the token at that point.
export function toDiagnostic(err, doc) {
  const line = typeof err.getLine === "function" ? err.getLine() : -1;
  const msg = typeof err.getMessageWithoutLocation === "function" ? err.getMessageWithoutLocation() : err.message;
  if (line < 1 || line > doc.lines) return { from: 0, to: Math.min(1, doc.length), severity: "error", message: msg };
  const l = doc.line(line);
  const from = Math.min(l.from + Math.max(err.getColumn() - 1, 0), l.to);
  const m = /^[\w$-]+|^./.exec(doc.sliceString(from, l.to));
  return { from, to: Math.max(from + (m ? m[0].length : 1), from), severity: "error", message: msg };
}
