import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NullNode, BooleanNode, TextNode, ArrayNode, ObjectNode,
} from "../src/json/JsonNode.js";
import { IntNode, LongNode, BigIntegerNode, DoubleNode } from "../src/json/NumericNode.js";
import { readTree, toJS } from "../src/json/mapper.js";

test("number formatting: int vs decimal (the parity trap)", () => {
  assert.equal(new IntNode(5).toString(), "5");
  assert.equal(new DoubleNode(5).toString(), "5.0");
  assert.equal(new DoubleNode(3.14).toString(), "3.14");
  assert.equal(new IntNode(5).isIntegralNumber(), true);
  assert.equal(new DoubleNode(5).isIntegralNumber(), false);
  assert.equal(new DoubleNode(5).isFloatingPointNumber(), true);
});

test("big integers preserved via BigInt", () => {
  const big = "9223372036854775807"; // > 2^53
  assert.equal(new LongNode(BigInt(big)).toString(), big);
  assert.equal(new BigIntegerNode(BigInt(big + "00")).toString(), big + "00");
});

test("toJS downgrades small integral BigInts to plain number (JSON.stringify can't handle BigInt)", () => {
  assert.equal(toJS(new LongNode(5n)), 5);
  assert.equal(typeof toJS(new LongNode(5n)), "number");
  assert.doesNotThrow(() => JSON.stringify(toJS(new LongNode(5n))));

  // but a genuinely huge integer stays BigInt rather than losing precision
  const huge = 9223372036854775807n;
  assert.equal(toJS(new LongNode(huge)), huge);
  assert.equal(typeof toJS(new LongNode(huge)), "bigint");
});

test("singletons compare by reference", () => {
  assert.equal(readTree(null), NullNode.instance);
  assert.equal(readTree(true), BooleanNode.TRUE);
  assert.equal(readTree(false), BooleanNode.FALSE);
  assert.notEqual(BooleanNode.TRUE, BooleanNode.FALSE);
});

test("ObjectNode preserves insertion order incl numeric-string keys", () => {
  const o = new ObjectNode();
  o.set("b", new IntNode(1));
  o.set("a", new IntNode(2));
  o.set("2", new IntNode(3));
  o.set("1", new IntNode(4));
  assert.deepEqual([...o.fieldNames()], ["b", "a", "2", "1"]);
});

test("get returns undefined for missing key/index (Java null = missing)", () => {
  const o = new ObjectNode().set("x", new IntNode(1));
  assert.equal(o.get("missing"), undefined);
  assert.equal(o.get("x").intValue(), 1);
  const a = new ArrayNode([new IntNode(7)]);
  assert.equal(a.get(5), undefined);
  assert.equal(a.get(0).intValue(), 7);
});

test("readTree builds nodes; toJS round-trips", () => {
  const node = readTree({ s: "hi", n: 3, d: 1.5, b: true, nil: null, arr: [1, 2], obj: { k: "v" } });
  assert.ok(node.isObject());
  assert.ok(node.get("s").isTextual());
  assert.ok(node.get("n").isIntegralNumber());
  assert.ok(node.get("d").isFloatingPointNumber());
  assert.ok(node.get("nil").isNull());
  assert.ok(node.get("arr").isArray());
  assert.equal(node.get("arr").size(), 2);
  assert.deepEqual(toJS(node), {
    s: "hi", n: 3, d: 1.5, b: true, nil: null, arr: [1, 2], obj: { k: "v" },
  });
});

test("deep equals", () => {
  assert.ok(readTree({ a: [1, 2], b: "x" }).equals(readTree({ a: [1, 2], b: "x" })));
  assert.ok(!readTree({ a: [1, 2] }).equals(readTree({ a: [1, 3] })));
  // Jackson-native numeric equals is strict by concrete subtype: IntNode(5) is
  // NOT DoubleNode(5). Cross-type value equality is EqualsComparison's job (Stage 2).
  assert.ok(!new IntNode(5).equals(new DoubleNode(5)));
  assert.ok(new IntNode(5).equals(new IntNode(5)));
});

test("size(): node.size only for array/object; strings handled by builtin layer", () => {
  assert.equal(new TextNode("hello").size(), 0); // Jackson scalar size == 0
  assert.equal(new ArrayNode([new IntNode(1)]).size(), 1);
  assert.equal(new ObjectNode().set("a", new IntNode(1)).size(), 1);
});
