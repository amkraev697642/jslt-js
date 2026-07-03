// Conversion at the API boundary: plain JS / JSON text <-> JsonNode tree.
// Mirrors the role of Jackson's ObjectMapper (NodeUtils.mapper) in the Java engine.

import {
  JsonNode, NullNode, BooleanNode, TextNode, ArrayNode, ObjectNode,
} from "./JsonNode.js";
import { IntNode, DoubleNode, BigIntegerNode } from "./NumericNode.js";

// Node factories — the role of Jackson's ObjectMapper.createArrayNode/createObjectNode.
export const mapper = {
  createArrayNode: () => new ArrayNode(),
  createObjectNode: () => new ObjectNode(),
};

// Build a node tree from a JSON string or an already-parsed JS value.
export function readTree(input) {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  return fromJS(value);
}

export function fromJS(v) {
  if (v === null || v === undefined) return NullNode.instance;
  if (v instanceof JsonNode) return v;
  switch (typeof v) {
    case "boolean": return v ? BooleanNode.TRUE : BooleanNode.FALSE;
    case "string": return new TextNode(v);
    case "bigint": return new BigIntegerNode(v);
    case "number":
      return Number.isInteger(v) ? new IntNode(v) : new DoubleNode(v);
    case "object": {
      if (Array.isArray(v)) {
        const a = new ArrayNode();
        for (const e of v) a.add(fromJS(e));
        return a;
      }
      const o = new ObjectNode();
      for (const k of Object.keys(v)) o.set(k, fromJS(v[k]));
      return o;
    }
    default:
      throw new Error("Cannot convert to JsonNode: " + String(v));
  }
}

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

// Node tree back to plain JS (for Expression.apply's return value).
export function toJS(node) {
  if (node == null || node.isNull()) return null;
  if (node.isBoolean()) return node.booleanValue();
  if (node.isTextual()) return node.asText();
  if (node.isNumber()) {
    // LongNode/BigIntegerNode store BigInt for fidelity beyond 2^53, but most
    // JSLT integers are ordinary small ones — and BigInt isn't accepted by
    // JSON.stringify, so callers would hit a hard TypeError on every integer
    // result. Downgrade to a plain number whenever it's safe to do so; keep
    // BigInt only for the genuinely-large case the plan promises to preserve.
    if (typeof node.value === "bigint" && node.value >= MIN_SAFE_BIGINT && node.value <= MAX_SAFE_BIGINT) {
      return Number(node.value);
    }
    return node.value; // JS number, or a BigInt too large to convert safely
  }
  if (node.isArray()) {
    const out = [];
    for (const e of node.elements()) out.push(toJS(e));
    return out;
  }
  if (node.isObject()) {
    const out = {};
    for (const [k, v] of node.fields()) out[k] = toJS(v);
    return out;
  }
  throw new Error("Cannot convert node to JS: " + node);
}

// NOTE: JSON.parse cannot distinguish "1" from "1.0" (both -> 1), so readTree of
// a *string* loses the int/decimal tag for whole-valued decimals. This is a JS-wide
// limitation and matches what any JS host's JSON.parse does at the API boundary.
// The from-json builtin / json-parse-tests (Stage 6) will need a number-aware
// tokenizer if byte-parity on that path is required — tracked in the deferred backlog.
