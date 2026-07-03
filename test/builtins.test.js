import { test } from "node:test";
import assert from "node:assert/strict";

import { fromJS, toJS } from "../src/json/mapper.js";
import { DoubleNode } from "../src/json/NumericNode.js";
import { JsltException } from "../src/JsltException.js";
import { BuiltinFunctions, getRegexp } from "../src/impl/BuiltinFunctions.js";
import { Location } from "../src/impl/Location.js";
import { LiteralExpression } from "../src/impl/LiteralExpression.js";
import { FunctionExpression } from "../src/impl/FunctionExpression.js";
import { MacroExpression } from "../src/impl/MacroExpression.js";

const loc = new Location(null, 1, 1);
const fn = (name) => BuiltinFunctions.functions.get(name);
const call = (name, ...jsArgs) => toJS(fn(name).call(fromJS(null), jsArgs.map(fromJS)));
const callRaw = (name, ...nodes) => fn(name).call(fromJS(null), nodes);

// ---- a core set of builtins exercised together, as real-world templates do ----

test("fallback (macro): short-circuits on first value that isn't null/{}/[] (isValue, not isTrue — \"\" and 0 count)", () => {
  const macro = BuiltinFunctions.macros.get("fallback");
  const args = [fromJS(null), fromJS({}), fromJS([]), fromJS("hit"), fromJS("never")].map(
    (n) => new LiteralExpression(n, loc),
  );
  assert.equal(toJS(macro.call(undefined, undefined, args)), "hit");

  const emptyStringCounts = [fromJS(null), fromJS("")].map((n) => new LiteralExpression(n, loc));
  assert.equal(toJS(macro.call(undefined, undefined, emptyStringCounts)), ""); // "" is a value, unlike isTrue

  const allEmpty = [fromJS(null), fromJS({})].map((n) => new LiteralExpression(n, loc));
  assert.equal(toJS(macro.call(undefined, undefined, allEmpty)), null);
});

test("flatten", () => {
  assert.deepEqual(call("flatten", [1, [2, 3], [[4]]]), [1, 2, 3, 4]);
  assert.equal(call("flatten", null), null);
});

test("size: array/object/string/null", () => {
  assert.equal(call("size", [1, 2, 3]), 3);
  assert.equal(call("size", { a: 1, b: 2 }), 2);
  assert.equal(call("size", "hello"), 5);
  assert.equal(call("size", null), null);
  assert.throws(() => call("size", 5), JsltException);
});

test("string: textual passthrough, else toString()", () => {
  assert.equal(call("string", "hi"), "hi");
  assert.equal(call("string", 5), "5");
  // fromJS(5.0) can't preserve the decimal tag — 5.0 and 5 are the same JS
  // number — so exercise the DoubleNode path by constructing the node directly.
  assert.equal(callRaw("string", new DoubleNode(5)).toString(), '"5.0"');
});

test("number: 1-arg strict, 2-arg fallback", () => {
  assert.equal(call("number", "42"), 42);
  assert.throws(() => call("number", "abc"), JsltException);
  assert.equal(call("number", "abc", -1), -1);
  assert.equal(call("number", null), null);
});

test("test/split/replace/lowercase against representative real-world patterns", () => {
  assert.equal(call("test", "+0400", "[+-][0-9][0-9][0-9][0-9]$"), true);
  assert.deepEqual(call("split", "0:RDA|181|NE RE", "[|]"), ["0:RDA", "181", "NE RE"]);
  assert.equal(call("replace", "ABC-123-xyz", "[^0-9]", ""), "123");
  assert.equal(call("lowercase", "VOUCHER"), "voucher");
});

// ---- broader coverage of the rest of the builtin set ----

test("round/floor/ceiling", () => {
  assert.equal(call("round", 2.5), 3);
  assert.equal(call("floor", 2.9), 2);
  assert.equal(call("ceiling", 2.1), 3);
  assert.equal(call("round", null), null);
  assert.throws(() => call("floor", "x"), JsltException);
});

test("sum: integral vs decimal result type", () => {
  assert.equal(call("sum", [1, 2, 3]), 6);
  assert.equal(callRaw("sum", fromJS([1, 2, 3])).toString(), "6"); // LongNode, not "6.0"
  assert.equal(callRaw("sum", fromJS([1, 2.5])).toString(), "3.5");
});

test("mod: negative remainder gets shifted into range by the divisor's sign (only that case is adjusted)", () => {
  // ported verbatim from Java's asymmetric fixup: only a NEGATIVE remainder
  // gets shifted; a positive remainder against a negative divisor is left as
  //-is, so this is not full Python-style floor-mod for every sign combination.
  assert.equal(call("mod", -7, 3), 2);
  assert.equal(call("mod", 7, -3), 1); // remainder was already non-negative: untouched
  assert.equal(call("mod", -7, -3), 2);
  assert.equal(call("mod", 7, 3), 1);
  assert.throws(() => call("mod", 1, 0), JsltException);
});

test("hash-int: deterministic and key-order independent (canonical sort)", () => {
  const h1 = call("hash-int", { a: 1, b: 2 });
  const h2 = call("hash-int", { b: 2, a: 1 });
  assert.equal(h1, h2);
  assert.equal(typeof h1, "number");
  assert.notEqual(call("hash-int", 5), call("hash-int", "5")); // number vs string must differ
  assert.equal(call("hash-int", null), null);
});

test("capture: named groups, unmatched groups omitted", () => {
  assert.deepEqual(call("capture", "2024-01-15", "(?<year>[0-9]+)-(?<month>[0-9]+)-(?<day>[0-9]+)"), {
    year: "2024", month: "01", day: "15",
  });
  assert.deepEqual(call("capture", "no match here", "(?<x>[0-9]+)"), {});
});

test("uppercase / sha256-hex / trim", () => {
  assert.equal(call("uppercase", "abc"), "ABC");
  assert.equal(call("sha256-hex", "").length, 64);
  assert.equal(call("sha256-hex", ""), call("sha256-hex", "")); // deterministic
  assert.equal(call("sha256-hex", "abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // NIST test vector
  assert.equal(call("sha256-hex", "abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(call("trim", "  hi  "), "hi");
});

test("not / boolean / is-boolean", () => {
  assert.equal(call("not", false), true);
  assert.equal(call("boolean", 0), false);
  assert.equal(call("is-boolean", true), true);
  assert.equal(call("is-boolean", 1), false);
});

test("is-object / get-key", () => {
  assert.equal(call("is-object", {}), true);
  assert.equal(call("get-key", { a: 1 }, "a"), 1);
  assert.equal(call("get-key", { a: 1 }, "missing"), null);
  assert.equal(call("get-key", { a: 1 }, "missing", "fallback"), "fallback");
  assert.throws(() => call("get-key", 5, "a"), JsltException);
});

test("array / is-array / all / any / zip / zip-with-index / index-of", () => {
  assert.deepEqual(call("array", { a: 1, b: 2 }), [{ key: "a", value: 1 }, { key: "b", value: 2 }]);
  assert.equal(call("is-array", []), true);
  assert.equal(call("all", [true, true]), true);
  assert.equal(call("all", [true, false]), false);
  assert.equal(call("any", [false, true]), true);
  assert.deepEqual(call("zip", [1, 2], ["a", "b"]), [[1, "a"], [2, "b"]]);
  assert.deepEqual(call("zip-with-index", ["a", "b"]), [{ index: 0, value: "a" }, { index: 1, value: "b" }]);
  assert.equal(call("index-of", [1, 2, 3], 2), 1);
  assert.equal(call("index-of", [1, 2, 3], 9), -1);
  // index-of uses EqualsComparison semantics (cross-type numeric), unlike contains()
  assert.equal(callRaw("index-of", fromJS([1, 2, 3]), fromJS(2.0)).intValue(), 1);
});

test("starts-with / ends-with / from-json / to-json / join", () => {
  assert.equal(call("starts-with", "hello", "he"), true);
  assert.equal(call("ends-with", "hello", "lo"), true);
  assert.deepEqual(call("from-json", '{"a":1}'), { a: 1 });
  assert.equal(call("from-json", "   "), null); // whitespace-only -> null, not an error
  assert.equal(call("from-json", "not json", "fallback"), "fallback");
  assert.equal(call("to-json", { a: 1 }), '{"a":1}');
  assert.equal(call("join", ["a", "b", "c"], "-"), "a-b-c");
});

test("contains: type-strict equals (not EqualsComparison) — matches Jackson native semantics", () => {
  assert.equal(call("contains", 5, [5]), true);
  const arrayWithDouble = fromJS([]); arrayWithDouble.add(new DoubleNode(5));
  assert.equal(callRaw("contains", fromJS(5), arrayWithDouble).booleanValue(), false); // IntNode(5) vs DoubleNode(5.0): not equal
  assert.equal(call("contains", "a", { a: 1 }), true);
  assert.equal(call("contains", "lo", "hello"), true);
  assert.equal(call("contains", "x", null), false);
});

test("error throws with the error: prefix", () => {
  assert.throws(() => call("error", "boom"), /error: boom/);
});

test("is-string / is-number / is-integer / is-decimal", () => {
  assert.equal(call("is-string", "x"), true);
  assert.equal(call("is-number", 5), true);
  assert.equal(call("is-integer", 5), true);
  assert.equal(call("is-integer", 5.5), false);
  assert.equal(call("is-decimal", 5.5), true);
});

test("now returns seconds-since-epoch as a float close to Date.now()", () => {
  const result = call("now");
  assert.ok(Math.abs(result - Date.now() / 1000) < 2);
});

test("parse-time / format-time round-trip", () => {
  // parse-time returns seconds since epoch (double)
  assert.equal(call("parse-time", "2018-01-01", "yyyy-MM-dd"), 1514764800);
  // format-time round-trips back
  assert.equal(call("format-time", 1514764800, "yyyy-MM-dd"), "2018-01-01");
  // null inputs → null
  assert.equal(call("parse-time", null, "yyyy-MM-dd"), null);
  assert.equal(call("format-time", null, "yyyy-MM-dd"), null);
});

test("min / max use null-is-smallest ordering", () => {
  assert.equal(call("min", 5, null), null);
  assert.equal(call("max", 5, null), null); // max returns null if EITHER side is null
  assert.equal(call("min", 3, 5), 3);
  assert.equal(call("max", 3, 5), 5);
});

test("parse-url", () => {
  const result = call("parse-url", "https://user:pass@example.com:8080/path?a=1&a=2&b=x#frag");
  assert.deepEqual(result, {
    host: "example.com",
    port: 8080,
    path: "/path",
    scheme: "https",
    query: "a=1&a=2&b=x",
    parameters: { a: ["1", "2"], b: ["x"] },
    fragment: "frag",
    userinfo: "user:pass",
  });
  assert.equal(call("parse-url", null), null);
  assert.throws(() => call("parse-url", "not a url"), JsltException);
});

test("uuid: 0-arg is random+valid, 2-arg is deterministic, NIL special case", () => {
  const u1 = call("uuid");
  const u2 = call("uuid");
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(u1, uuidRe);
  assert.notEqual(u1, u2);

  const det1 = call("uuid", 123456789, 987654321);
  const det2 = call("uuid", 123456789, 987654321);
  assert.equal(det1, det2);
  assert.match(det1, uuidRe);

  assert.equal(call("uuid", null, null), "00000000-0000-0000-0000-000000000000");
});

test("getRegexp caches and throws JsltException on invalid syntax", () => {
  assert.throws(() => getRegexp("[unterminated"), JsltException);
  assert.equal(getRegexp("abc"), getRegexp("abc")); // same cached instance
});

// ---- closes the Stage 2/3 seam: FunctionExpression/MacroExpression against real builtins ----

test("FunctionExpression resolves to a builtin and applies it end-to-end", () => {
  const sizeExpr = new FunctionExpression("size", [new LiteralExpression(fromJS([1, 2, 3]), loc)], loc);
  sizeExpr.resolve(BuiltinFunctions.functions.get("size"));
  assert.equal(toJS(sizeExpr.apply(undefined, undefined)), 3);
});

test("FunctionExpression.optimize() swaps contains() for the Set-backed version on a large literal array", () => {
  const bigArray = Array.from({ length: 20 }, (_, i) => i);
  const callExpr = new FunctionExpression("contains", [
    new LiteralExpression(fromJS(5), loc),
    new LiteralExpression(fromJS(bigArray), loc),
  ], loc);
  callExpr.resolve(BuiltinFunctions.functions.get("contains"));
  const optimized = callExpr.optimize();
  assert.equal(optimized.function.getName(), "optimized-static-contains");
  assert.equal(toJS(optimized.apply(undefined, undefined)), true);
});

test("FunctionExpression.optimize() validates a literal regexp argument at compile time", () => {
  const badRegexp = new FunctionExpression("test", [
    new LiteralExpression(fromJS("x"), loc),
    new LiteralExpression(fromJS("[unterminated"), loc),
  ], loc);
  badRegexp.resolve(BuiltinFunctions.functions.get("test"));
  assert.throws(() => badRegexp.optimize(), JsltException);
});

test("MacroExpression calls fallback as a real macro (unevaluated args)", () => {
  const macroExpr = new MacroExpression(BuiltinFunctions.macros.get("fallback"), [
    new LiteralExpression(fromJS(null), loc),
    new LiteralExpression(fromJS("found"), loc),
  ], loc);
  assert.equal(toJS(macroExpr.apply(undefined, undefined)), "found");
});
