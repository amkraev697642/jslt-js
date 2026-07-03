// Stage 2 self-check: builds tiny ASTs by hand (no parser yet — that's Stage 4)
// and runs them through prepare()/apply() to exercise scope binding, the
// expression-node tree, and the operators. FunctionExpression/MacroExpression/
// FunctionDeclaration are intentionally not exercised here: FunctionExpression
// forward-references BuiltinFunctions.js, which is Stage 3.

import { test } from "node:test";
import assert from "node:assert/strict";

import { readTree, fromJS, toJS } from "../src/json/mapper.js";
import { NullNode } from "../src/json/JsonNode.js";
import { IntNode, LongNode, DoubleNode } from "../src/json/NumericNode.js";

import { Location } from "../src/impl/Location.js";
import { PreparationContext } from "../src/impl/PreparationContext.js";
import { Scope } from "../src/impl/Scope.js";
import { evalLets } from "../src/impl/NodeUtils.js";

import { LiteralExpression } from "../src/impl/LiteralExpression.js";
import { VariableExpression } from "../src/impl/VariableExpression.js";
import { LetExpression } from "../src/impl/LetExpression.js";
import { DotExpression } from "../src/impl/DotExpression.js";
import { ArraySlicer } from "../src/impl/ArraySlicer.js";
import { ArrayExpression } from "../src/impl/ArrayExpression.js";
import { PairExpression } from "../src/impl/PairExpression.js";
import { MatcherExpression } from "../src/impl/MatcherExpression.js";
import { ObjectExpression } from "../src/impl/ObjectExpression.js";
import { IfExpression } from "../src/impl/IfExpression.js";
import { ForExpression } from "../src/impl/ForExpression.js";

import { PlusOperator } from "../src/impl/PlusOperator.js";
import { MinusOperator } from "../src/impl/MinusOperator.js";
import { MultiplyOperator } from "../src/impl/MultiplyOperator.js";
import { DivideOperator } from "../src/impl/DivideOperator.js";
import { EqualsComparison } from "../src/impl/EqualsComparison.js";
import { UnequalsComparison } from "../src/impl/UnequalsComparison.js";
import { BiggerComparison } from "../src/impl/BiggerComparison.js";
import { SmallerComparison } from "../src/impl/SmallerComparison.js";
import { AndOperator } from "../src/impl/AndOperator.js";
import { OrOperator } from "../src/impl/OrOperator.js";
import { PipeOperator } from "../src/impl/PipeOperator.js";

import { DefaultJsonFilter } from "../src/filters/DefaultJsonFilter.js";

const loc = new Location(null, 1, 1);
// fromJS, not readTree: these are JS values to wrap directly, not JSON source text
// (readTree treats a string argument as JSON to parse, which is the wrong tool here).
const lit = (v) => new LiteralExpression(fromJS(v), loc);

// Mirrors ExpressionImpl.prepare()/apply() (ported in Stage 5): a ScopeManager
// has no ScopeFrame until enterScope() is called, so top-level lets need that
// call first too — not just lets nested inside an Object/If/For.
function runTopLevel(lets, body, input) {
  const ctx = new PreparationContext();
  ctx.scope.enterScope();
  for (const l of lets) l.register(ctx.scope);
  for (const child of [...lets, body]) child.prepare(ctx);
  ctx.scope.leaveScope();

  const scope = Scope.getRoot(ctx.scope.getStackFrameSize());
  evalLets(scope, input, lets);
  return body.apply(scope, input);
}

test("let + variable: slot binding round-trips", () => {
  const letX = new LetExpression("x", lit(5), loc);
  const varX = new VariableExpression("x", loc);
  const result = runTopLevel([letX], varX, NullNode.instance);
  assert.equal(toJS(result), 5);
});

test("variable shadowing gets distinct slots", () => {
  // let x = 1; if (true) let x = 2; x else x  -> then-branch sees inner x
  const outer = new LetExpression("x", lit(1), loc);
  const varOuter = new VariableExpression("x", loc);

  const inner = new LetExpression("x", lit(2), loc);
  const varInner = new VariableExpression("x", loc);

  const ifExpr = new IfExpression(lit(true), [inner], varInner, [], varOuter, loc);
  const result = runTopLevel([outer], ifExpr, NullNode.instance);
  assert.equal(toJS(result), 2);
});

test("DotExpression chains and defaults missing keys to null", () => {
  const root = new DotExpression(loc);
  const a = new DotExpression("a", root, loc);
  const b = new DotExpression("b", a, loc);
  const input = readTree({ a: { b: 5 } });
  assert.equal(toJS(b.apply(undefined, input)), 5);

  const missing = new DotExpression("missing", a, loc);
  assert.ok(missing.apply(undefined, input).isNull());
});

test("ArraySlicer: index, negative index, slice, string slice", () => {
  const root = new DotExpression(loc);
  const input = readTree([10, 20, 30, 40]);

  const idx0 = new ArraySlicer(lit(0), false, undefined, root, loc);
  assert.equal(toJS(idx0.apply(undefined, input)), 10);

  const idxNeg1 = new ArraySlicer(lit(-1), false, undefined, root, loc);
  assert.equal(toJS(idxNeg1.apply(undefined, input)), 40);

  const slice1 = new ArraySlicer(lit(1), true, undefined, root, loc);
  assert.deepEqual(toJS(slice1.apply(undefined, input)), [20, 30, 40]);

  const strRoot = new DotExpression(loc);
  const strSlice = new ArraySlicer(lit(0), true, lit(3), strRoot, loc);
  assert.equal(toJS(strSlice.apply(undefined, fromJS("hello"))), "hel");
});

test("ArrayExpression optimizes an all-literal array into a single LiteralExpression", () => {
  const arr = new ArrayExpression([lit(1), lit(2), lit(3)], loc);
  const optimized = arr.optimize();
  assert.ok(optimized instanceof LiteralExpression);
  assert.deepEqual(toJS(optimized.apply(undefined, undefined)), [1, 2, 3]);
});

test("ObjectExpression: default filter drops null/{}/[] (common `else null` pattern)", () => {
  const pairs = [
    new PairExpression(lit("keep"), lit(1), loc),
    new PairExpression(lit("dropped"), lit(null), loc),
    new PairExpression(lit("emptyObj"), new ArrayExpression([], loc).optimize(), loc),
  ];
  const obj = new ObjectExpression([], pairs, undefined, loc, new DefaultJsonFilter());
  const result = obj.apply(undefined, NullNode.instance);
  assert.deepEqual(toJS(result), { keep: 1 });
});

test("ObjectExpression: object matcher copies through unmatched keys", () => {
  const root = new DotExpression(loc); // identity "."
  const matcherValue = new DotExpression(loc); // matcher body: "." (pass through)
  const matcher = new MatcherExpression(matcherValue, [], loc);
  const pairA = new PairExpression(lit("a"), lit(99), loc);
  const obj = new ObjectExpression([], [pairA], matcher, loc, new DefaultJsonFilter());

  obj.computeMatchContexts(root); // wires contextQuery = root, like the real compile pipeline
  const input = readTree({ a: 1, b: 2, c: 3 });
  const result = obj.apply(undefined, input);
  assert.deepEqual(toJS(result), { a: 99, b: 2, c: 3 });
});

test("ForExpression: comprehension with let and if-filter ([for (...) ... if (...)])", () => {
  const root = new DotExpression(loc);
  const doubled = new LetExpression("d", new MultiplyOperator(new DotExpression(loc), lit(2), loc), loc);
  const varD = new VariableExpression("d", loc);
  const isEven = new EqualsComparison(new MultiplyOperator(varD, lit(0), loc), lit(0), loc); // d*0==0 always true; real filter below
  const ctx = new PreparationContext();
  const forExpr = new ForExpression(root, [doubled], varD, isEven, loc);
  forExpr.prepare(ctx);
  const scope = Scope.getRoot(ctx.scope.getStackFrameSize());

  const result = forExpr.apply(scope, readTree([1, 2, 3]));
  assert.deepEqual(toJS(result), [2, 4, 6]);
});

test("operators: Plus does string/array/object/numeric per the type-dispatch table", () => {
  assert.equal(toJS(new PlusOperator(lit("a"), lit(1), loc).apply(undefined, undefined)), "a1");
  assert.deepEqual(toJS(new PlusOperator(lit([1]), lit([2]), loc).apply(undefined, undefined)), [1, 2]);
  assert.deepEqual(toJS(new PlusOperator(lit({ a: 1 }), lit({ b: 2 }), loc).apply(undefined, undefined)), { b: 2, a: 1 });
  assert.equal(toJS(new PlusOperator(lit({ a: 1 }), lit(null), loc).apply(undefined, undefined)).a, 1); // {} + null => {}
  assert.equal(toJS(new PlusOperator(lit(1), lit(2), loc).apply(undefined, undefined)), 3);
});

test("operators: integral Plus/Minus/Multiply produce LongNode (int+int path)", () => {
  const result = new PlusOperator(lit(2), lit(3), loc).apply(undefined, undefined);
  assert.ok(result instanceof LongNode);
  assert.equal(toJS(result), 5);
});

test("operators: Divide does integer division when it divides evenly, else float", () => {
  assert.equal(toJS(new DivideOperator(lit(6), lit(3), loc).apply(undefined, undefined)), 2);
  assert.ok(new DivideOperator(lit(6), lit(3), loc).apply(undefined, undefined) instanceof LongNode);
  assert.equal(toJS(new DivideOperator(lit(5), lit(2), loc).apply(undefined, undefined)), 2.5);
});

test("operators: Multiply repeats strings", () => {
  assert.equal(toJS(new MultiplyOperator(lit("ab"), lit(3), loc).apply(undefined, undefined)), "ababab");
});

test("operators: equality is cross-type-numeric-aware (5 == 5.0)", () => {
  const eq = new EqualsComparison(lit(5), new LiteralExpression(new DoubleNode(5), loc), loc);
  assert.equal(toJS(eq.apply(undefined, undefined)), true);
  const neq = new UnequalsComparison(lit(5), lit(6), loc);
  assert.equal(toJS(neq.apply(undefined, undefined)), true);
});

test("operators: ordering — null sorts smallest, numbers/strings compare by value", () => {
  assert.equal(toJS(new BiggerComparison(lit(5), lit(null), loc).apply(undefined, undefined)), true);
  assert.equal(toJS(new SmallerComparison(lit("a"), lit("b"), loc).apply(undefined, undefined)), true);
});

test("operators: And/Or short-circuit and Pipe threads input through", () => {
  assert.equal(toJS(new AndOperator(lit(false), lit(true), loc).apply(undefined, undefined)), false);
  assert.equal(toJS(new OrOperator(lit(true), lit(false), loc).apply(undefined, undefined)), true);

  const root = new DotExpression(loc);
  const getA = new DotExpression("a", root, loc);
  const pipe = new PipeOperator(getA, new MultiplyOperator(new DotExpression(loc), lit(10), loc), loc);
  assert.equal(toJS(pipe.apply(undefined, readTree({ a: 4 }))), 40);
});

test("scope slot bit-packing: IntNode(5) prints '5', DoubleNode(5) prints '5.0' through real eval", () => {
  // regression guard for the parity trap this whole port hinges on
  assert.equal(new LiteralExpression(new IntNode(5), loc).apply(undefined, undefined).toString(), "5");
  assert.equal(new LiteralExpression(new DoubleNode(5), loc).apply(undefined, undefined).toString(), "5.0");
});
