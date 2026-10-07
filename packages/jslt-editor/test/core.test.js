import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, candidates, wordInfo } from "../src/core/scan.js";
import { formatJslt } from "../src/core/format.js";

test("scan finds lets, defs with params and imports; ignores strings and comments", () => {
  const s = scan('import "lib.jslt" as lib\nlet a = 1\n// let hidden = 2\ndef f(x, y) $x\n"let nope = 3"');
  assert.deepEqual([...s.vars].sort(), ["a", "x", "y"]);
  assert.deepEqual(s.funcs.get("f"), ["x", "y"]);
  assert.equal(s.imports.get("lib"), "lib.jslt");
});

test("candidates: builtins, variables, import aliases, none inside strings", () => {
  const text = 'import "lib.jslt" as lib\nlet total = 1\ndef f(x) $x';
  const files = new Map([["lib.jslt", "def fmt-name(p) $p\ndef other() 1"]]);
  const names = (r) => r.options.map((o) => o.label);
  assert.ok(names(candidates("  upp", text, files)).includes("uppercase"));
  assert.deepEqual(names(candidates("x: $to", text, files)).sort(), ["total", "x"]);
  const lib = candidates("  lib:fm", text, files);
  assert.deepEqual(names(lib), ["fmt-name", "other"]);
  assert.equal(lib.from, "  lib:".length);
  assert.equal(candidates('"upp', text, files), null);
  assert.equal(candidates("// upp", text, files), null);
  assert.equal(candidates("  now", text, files).options.find((o) => o.label === "now").apply, "now()");
});

test("wordInfo: builtin and local def hover, not plain words", () => {
  assert.equal(wordInfo("  uppercase(.a)", 4, "").sig, "uppercase(string)");
  assert.equal(wordInfo("  f(.a)", 2, "def f(x) $x").sig, "def f(x)");
  assert.equal(wordInfo("  .uppercase", 5, ""), null);
  assert.equal(wordInfo("  money(1)", 4, ""), null);
});

test("formatJslt re-indents inside brackets, keeps top-level continuations, is idempotent", () => {
  const src = 'def f(x)\n    if ($x)  "a"\n    else "b"\n\n{\n"a": 1,   \n      "b": [\n1,\n2\n  ],\n    "c": {\n"d": 1\n}\n}';
  const out = formatJslt(src);
  assert.equal(out, 'def f(x)\n    if ($x)  "a"\n    else "b"\n\n{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ],\n  "c": {\n    "d": 1\n  }\n}\n');
  assert.equal(formatJslt(out), out);
  assert.equal(formatJslt('{"a": "}"}'), '{"a": "}"}\n');
});


import { tokenRange, tokenLength } from "../src/core/errors.js";

test("tokenRange covers a whole string, a word or one char, and rejects missing lines", () => {
  const t = '{\n  "key": value-1 }';
  assert.deepEqual(tokenRange(t, 2, 3), { from: 4, to: 9 });
  assert.equal(t.slice(...Object.values(tokenRange(t, 2, 10))), "value-1");
  assert.equal(t.slice(...Object.values(tokenRange(t, 2, 18))), "}");
  assert.equal(tokenRange(t, 5, 1), null);
  assert.equal(tokenLength(""), 0);
});
