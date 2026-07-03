import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/parser/Parser.js";
import { toJS, fromJS } from "../src/json/mapper.js";

const run = (src, input = null, options) => toJS(compile(src, null, options).applyInput(fromJS(input)));

test("literals", () => {
  assert.equal(run("null"), null);
  assert.equal(run("true"), true);
  assert.equal(run("42"), 42);
  assert.equal(run("3.14"), 3.14);
  assert.equal(run('"hello"'), "hello");
  assert.equal(run('"with \\"quote\\""'), 'with "quote"');
});

test("dot chains, indexing, slicing", () => {
  assert.equal(run(".", "x"), "x");
  assert.equal(run(".a.b", { a: { b: 5 } }), 5);
  assert.equal(run(".a", { b: 1 }), null); // missing key -> null
  // array/object literals aren't Chainable in the grammar, so they can't be
  // indexed directly ([1,2,3][1] is not valid JSLT) — go through a variable.
  assert.equal(run("let a = [1,2,3] $a[1]"), 2);
  assert.equal(run("let a = [1,2,3] $a[-1]"), 3);
  assert.deepEqual(run("let a = [1,2,3,4] $a[1:3]"), [2, 3]);
  assert.equal(run('let s = "hello" $s[0:3]'), "hel");
});

test("variables and let", () => {
  assert.equal(run("let x = 5 $x + 1"), 6);
  // two lets with the SAME name at the SAME (flat, top-level) scope is a
  // compile error, not shadowing — shadowing only happens across nested
  // scopes (if/for/object each get their own ScopeFrame).
  assert.equal(run("if (true) let x = 2 $x else 0"), 2);
  assert.throws(() => run("let x = 1 let x = 2 $x"), /Duplicate variable declaration/);
});

test("if/else", () => {
  assert.equal(run("if (true) 1 else 2"), 1);
  assert.equal(run("if (false) 1 else 2"), 2);
  assert.equal(run("if (false) 1"), null); // no else -> null
  assert.equal(run("if (.x > 5) let y = 1 .x + $y else 0", { x: 10 }), 11);
});

test("operators and precedence", () => {
  assert.equal(run("1 + 2 * 3"), 7);
  assert.equal(run("(1 + 2) * 3"), 9);
  assert.equal(run("1 + 2 == 3"), true);
  assert.equal(run("true and false or true"), true);
  assert.equal(run('"a" + "b"'), "ab");
  assert.equal(run("1 | (. + 10)"), 11); // pipe threads value as new input
});

test("arrays and objects", () => {
  assert.deepEqual(run("[1, 2, 1+2]"), [1, 2, 3]);
  assert.deepEqual(run('{"a": 1, "b": 2}'), { a: 1, b: 2 });
  assert.deepEqual(run('{"a": null, "b": 1}'), { b: 1 }); // default filter drops null
});

test("array comprehension with if filter ([for (...) ... if (...)] pattern)", () => {
  assert.deepEqual(run("[for (.) . * 2 if (. > 2)]", [1, 2, 3, 4]), [6, 8]);
});

test("object comprehension", () => {
  assert.deepEqual(run('{for (.) .key: .value}', [{ key: "a", value: 1 }, { key: "b", value: 2 }]), { a: 1, b: 2 });
});

test("object matcher copies through unmatched keys", () => {
  assert.deepEqual(run('{"a": 99, * : .}', { a: 1, b: 2, c: 3 }), { a: 99, b: 2, c: 3 });
  assert.deepEqual(run('{* - a : .}', { a: 1, b: 2, c: 3 }), { b: 2, c: 3 });
});

test("function declarations: recursion and mutual/forward reference", () => {
  assert.equal(run("def fact(n) if ($n <= 1) 1 else $n * fact($n - 1) fact(5)"), 120);
  assert.equal(run("def a(x) b($x) + 1 def b(x) $x * 2 a(5)"), 11); // a calls b, declared after
});

test("builtin function calls resolve without explicit registration", () => {
  assert.equal(run("size([1,2,3])"), 3);
  assert.equal(run('let upper = uppercase("hi") $upper'), "HI");
  assert.equal(run('fallback(null, "", "x")'), ""); // "" is a value per isValue, so it wins over "x"
  assert.equal(run('fallback(null, "x")'), "x");
});

test("representative real-world expression shapes parse and evaluate correctly", () => {
  assert.equal(run('test("+0400", "[+-][0-9][0-9][0-9][0-9]$")'), true);
  assert.deepEqual(run('split("0:RDA|181|X", "[|]")'), ["0:RDA", "181", "X"]);
  assert.equal(run('replace("ABC-123", "[^0-9]", "")'), "123");
  assert.deepEqual(run("[for ([1,2,3]) let d = . * 2 $d]"), [2, 4, 6]);
});

test("imports via a custom in-memory resolver, qualified c:fn() calls", () => {
  const common = `
    def helper(x) $x + 1
    def greet(name) "hi " + $name
  `;
  const main = `
    import "common.jslt" as c
    c:greet(.name) + " (" + string(c:helper(.n)) + ")"
  `;
  const resolver = { resolve: (name) => (name === "common.jslt" ? common : null) };
  assert.equal(run(main, { name: "Bob", n: 5 }, { resolver }), "hi Bob (6)");
});

test("import a module that ITSELF has a top-level body, callable as a function", () => {
  const common = `let factor = 10 . * $factor`;
  const main = `
    import "common.jslt" as c
    c(.value)
  `;
  const resolver = { resolve: () => common };
  assert.equal(run(main, { value: 4 }, { resolver }), 40);
});

test("circular import is rejected", () => {
  const resolver = { resolve: () => 'import "a.jslt" as a\n1' };
  assert.throws(() => run('import "a.jslt" as a\n1', null, { resolver }), /already imported/);
});

test("custom JS functions register via the extensions/functions option", () => {
  class DoubleIt {
    getName() { return "double-it"; }
    getMinArguments() { return 1; }
    getMaxArguments() { return 1; }
    call(_input, args) { return fromJS(toJS(args[0]) * 2); }
  }
  assert.equal(run("double-it(21)", null, { functions: [new DoubleIt()] }), 42);
});

test("parse errors surface as JsltException with location info", () => {
  assert.throws(() => compile("let x =", null), /Parse error/);
  assert.throws(() => compile("1 +", null), /Parse error/);
});
