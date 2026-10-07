import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, fromJS, toJS } from "../src/index.js";
import { examples } from "../playground/examples.js";
import { toDiagnostic } from "../packages/jslt-editor/src/cm/lint.js";

for (const e of examples) {
  test(`playground example: ${e.name}`, () => {
    const byName = new Map((e.files || []).map((f) => [f.name, f.text]));
    const resolver = { resolve: (n) => byName.get(n) };
    const out = toJS(compile(e.jslt, "x.jslt", { resolver }).applyInput(fromJS(e.input)));
    assert.notEqual(out, undefined);
  });
}

test("toDiagnostic points at the offending token (1-based line/col)", () => {
  const src = '{"a": }';
  let err;
  try { compile(src, "x.jslt"); } catch (e) { err = e; }
  const doc = { lines: 1, length: src.length, line: () => ({ from: 0, to: src.length }), sliceString: (f, t) => src.slice(f, t) };
  const d = toDiagnostic(err, doc);
  assert.equal(src.slice(d.from, d.to), "}");
});

test("imports example resolves lib.jslt and an error inside it names that file", () => {
  const ex = examples.find((e) => e.files);
  const byName = new Map(ex.files.map((f) => [f.name, f.text]));
  const out = toJS(compile(ex.jslt, "main.jslt", { resolver: { resolve: (n) => byName.get(n) } }).applyInput(fromJS(ex.input)));
  assert.deepEqual(out, { customer: "Ada Lovelace", total: "24.98 EUR" });
  byName.set("lib.jslt", "def money(n\n");
  let err;
  try { compile(ex.jslt, "main.jslt", { resolver: { resolve: (n) => byName.get(n) } }); } catch (e) { err = e; }
  assert.equal(err.getSource(), "lib.jslt");
});
