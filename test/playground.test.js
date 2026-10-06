import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, fromJS, toJS } from "../src/index.js";
import { examples } from "../playground/examples.js";
import { toDiagnostic } from "../playground/editor/jslt-lint.js";

for (const e of examples) {
  test(`playground example: ${e.name}`, () => {
    const out = toJS(compile(e.jslt, "x.jslt").applyInput(fromJS(e.input)));
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
