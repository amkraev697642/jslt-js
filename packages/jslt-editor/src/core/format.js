// Re-indents lines that start inside brackets (2 spaces per level; a leading closer dedents) and trims trailing space.
// Lines outside any bracket keep their own indentation, so `def` / `let` continuation lines are left alone.
export function formatJslt(text) {
  let depth = 0;
  const out = text.split("\n").map((raw) => {
    const line = raw.replace(/\s+$/, "");
    const body = line.trimStart();
    let net = 0, lead = 0, seen = false, q = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (q) { if (c === "\\") i++; else if (c === '"') q = false; continue; }
      if (c === '"') { q = true; seen = true; continue; }
      if (c === "/" && body[i + 1] === "/") break;
      if ("{[(".includes(c)) { net++; seen = true; }
      else if ("}])".includes(c)) { net--; if (!seen) lead++; }
      else if (!/\s/.test(c)) seen = true;
    }
    const level = Math.max(depth - lead, 0);
    const res = !body ? "" : depth > 0 ? "  ".repeat(level) + body : line;
    depth = Math.max(depth + net, 0);
    return res;
  });
  return out.join("\n").replace(/\n*$/, "\n");
}
