import { FUNCTION_DOCS, KEYWORDS, CONSTANTS } from "./docs.js";

const blank = (s) => s.replace(/\/\/[^\n]*|"(?:\\.|[^"\\\n])*"/g, (m) => m.replace(/[^\n]/g, " "));

// Names declared in a source text. ponytail: no scoping, every let/def/param in the file is offered everywhere.
export function scan(text) {
  const code = blank(text);
  const vars = new Set(), funcs = new Map(), imports = new Map();
  for (const m of code.matchAll(/\blet\s+([A-Za-z_][\w-]*)\s*=/g)) vars.add(m[1]);
  for (const m of code.matchAll(/\bdef\s+([A-Za-z_][\w-]*)\s*\(([^)]*)\)/g)) {
    const params = m[2].split(",").map((p) => p.trim()).filter(Boolean);
    funcs.set(m[1], params);
    params.forEach((p) => vars.add(p));
  }
  for (const m of text.matchAll(/\bimport\s+"([^"]+)"\s+as\s+([A-Za-z_][\w-]*)/g)) imports.set(m[2], m[1]);
  return { vars, funcs, imports };
}

const inStringOrComment = (line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === "\\") i++; else if (c === '"') q = false; }
    else if (c === '"') q = true;
    else if (c === "/" && line[i + 1] === "/") return true;
  }
  return q;
};

const fnOption = (name, sig, doc, type = "function") => ({
  label: name, type, detail: sig.slice(name.length), info: doc, apply: sig.endsWith("()") ? name + "()" : name + "(",
});

// before = text of the cursor line up to the cursor; files = Map(name -> text).
// Returns {from, options} with `from` an offset into `before`, or null.
export function candidates(before, text, files) {
  if (inStringOrComment(before)) return null;
  const here = scan(text);
  let m = /\$([\w-]*)$/.exec(before);
  if (m) return { from: m.index + 1, options: [...here.vars].map((v) => ({ label: v, type: "variable" })) };
  m = /([A-Za-z_][\w-]*):([\w-]*)$/.exec(before);
  if (m && here.imports.has(m[1])) {
    const lib = scan(files.get(here.imports.get(m[1])) || "");
    return { from: m.index + m[1].length + 1, options: [...lib.funcs].map(([n, ps]) => fnOption(n, `${n}(${ps.join(", ")})`, "from " + here.imports.get(m[1]))) };
  }
  m = /[A-Za-z_][\w-]*$/.exec(before);
  if (!m) return null;
  const options = [
    ...Object.entries(FUNCTION_DOCS).map(([n, [sig, doc]]) => fnOption(n, sig, doc)),
    ...[...here.funcs].map(([n, ps]) => fnOption(n, `${n}(${ps.join(", ")})`, "defined in this file")),
    ...[...here.imports.keys()].map((a) => ({ label: a, type: "namespace", detail: " " + here.imports.get(a), apply: a + ":" })),
    ...KEYWORDS.map((k) => ({ label: k, type: "keyword" })),
    ...CONSTANTS.map((k) => ({ label: k, type: "constant" })),
  ];
  return { from: m.index, options };
}

// Hover text for the word at `col` of `line`: {from, to, sig, doc} or null.
export function wordInfo(line, col, text) {
  let a = col, b = col;
  while (a > 0 && /[\w-]/.test(line[a - 1])) a--;
  while (b < line.length && /[\w-]/.test(line[b])) b++;
  const w = line.slice(a, b);
  if (!w || line[a - 1] === "$") return null;
  const d = FUNCTION_DOCS[w];
  if (d && /^\s*\(/.test(line.slice(b))) return { from: a, to: b, sig: d[0], doc: d[1] };
  const ps = scan(text).funcs.get(w);
  return ps && /^\s*\(/.test(line.slice(b)) ? { from: a, to: b, sig: `def ${w}(${ps.join(", ")})`, doc: "defined in this file" } : null;
}
