// Port of impl/NodeUtils.java — shared eval-time helpers used across the engine.

import {
  NullNode, BooleanNode, TextNode, ArrayNode, ObjectNode,
} from "../json/JsonNode.js";
import { IntNode, LongNode, BigIntegerNode, DoubleNode } from "../json/NumericNode.js";
import { mapper } from "../json/mapper.js";
import { JsltException } from "../JsltException.js";

export { mapper };

export function evalLets(scope, input, lets) {
  if (lets == null) return;
  for (const let_ of lets) {
    const val = let_.apply(scope, input);
    scope.setValue(let_.getSlot(), val);
  }
}

export function isTrue(value) {
  return value !== BooleanNode.FALSE
    && !(value.isObject() && value.size() === 0)
    && !(value.isTextual() && value.asText().length === 0)
    && !(value.isArray() && value.size() === 0)
    && !(value.isNumber() && value.doubleValue() === 0.0)
    && !value.isNull();
}

export function isValue(value) {
  return !value.isNull()
    && !(value.isObject() && value.size() === 0)
    && !(value.isArray() && value.size() === 0);
}

export function toJson(value) {
  if (typeof value === "boolean") return value ? BooleanNode.TRUE : BooleanNode.FALSE;
  if (typeof value === "number") return new DoubleNode(value);
  throw new Error("toJson: unsupported value " + value);
}

export function toJsonArray(array) {
  const node = mapper.createArrayNode();
  for (const s of array) node.add(new TextNode(s));
  return node;
}

// nullok => return JS undefined for JSON null (mirrors Java null)
export function toStringValue(value, nullok) {
  if (value.isTextual()) return value.asText();
  if (value.isNull() && nullok) return undefined;
  // not sure how well this works in practice, but let's try (matches Java comment)
  return value.toString();
}

export function toArray(value, nullok) {
  if (value.isArray()) return value;
  if (value.isNull() && nullok) return undefined;
  throw new JsltException("Cannot convert " + value + " to array");
}

// Two call shapes from the Java overloads: number(value, loc) and
// number(value, strict, loc[, fallback]).
export function number(value, strictOrLoc, loc, fallback) {
  let strict;
  if (typeof strictOrLoc === "boolean") strict = strictOrLoc;
  else { strict = false; loc = strictOrLoc; }

  if (value.isNumber()) return value;
  if (value.isNull()) return fallback === undefined ? value : fallback;
  if (!value.isTextual()) {
    if (strict) throw new JsltException("Can't convert " + value + " to number", loc);
    return fallback === undefined ? NullNode.instance : fallback;
  }

  const text = value.asText();
  const numberNode = parseNumber(text);
  if (numberNode == null || !numberNode.isNumber()) {
    if (fallback === undefined) {
      throw new JsltException(`number(${text}) failed: not a number`, loc);
    }
    return fallback;
  }
  return numberNode;
}

// returns null on failure (caller handles fallback) — ported verbatim from
// NodeUtils.parseNumber, including its hand-rolled int/long/bigint/double tiering.
export function parseNumber(number_) {
  if (number_.length === 0) return null;

  let sign = 1;
  let pos = 0;
  if (number_.charAt(0) === "-") { pos = 1; sign = -1; }
  const intStart = pos;

  const endInteger = scanDigits(number_, pos);
  if (endInteger === number_.length) {
    if (number_.length < 10) return new IntNode(parseInt(number_, 10));
    if (number_.length < 19) return new LongNode(BigInt(number_));
    return new BigIntegerNode(BigInt(number_));
  }

  // since there's stuff after the initial integer it must be either
  // the decimal part or the exponent
  let intPart;
  if (endInteger === pos) intPart = 0; // no digit before the period
  else intPart = parseInt(number_.substring(intStart, endInteger), 10);

  pos = endInteger;
  let value = intPart * sign;

  if (number_.charAt(pos) === ".") {
    pos += 1;
    const endDecimal = scanDigits(number_, pos);
    if (endDecimal === pos) return null;

    const decimalPart = parseInt(number_.substring(endInteger + 1, endDecimal), 10);
    const digits = endDecimal - endInteger - 1;

    value = (intPart + decimalPart / Math.pow(10, digits)) * sign;
    pos = endDecimal;

    if (pos === number_.length) return new DoubleNode(value);
  }

  // there is more: next character MUST be 'e' or 'E'
  let ch = number_.charAt(pos);
  if (ch !== "e" && ch !== "E") return null;

  pos++;
  if (pos === number_.length) return null;
  ch = number_.charAt(pos);
  let signExp = 1;
  if (ch === "+") pos++;
  else if (ch === "-") { signExp = -1; pos++; }

  const endExponent = scanDigits(number_, pos);
  if (endExponent !== number_.length || endExponent === pos) return null;

  const exponent = parseInt(number_.substring(pos), 10) * signExp;
  return new DoubleNode(value * Math.pow(10, exponent));
}

function scanDigits(s, pos) {
  while (pos < s.length && isDigit(s.charAt(pos))) pos++;
  return pos;
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

export function convertObjectToArray(object) {
  const array = mapper.createArrayNode();
  for (const [key, value] of object.fields()) {
    const element = mapper.createObjectNode();
    element.set("key", new TextNode(key));
    element.set("value", value);
    array.add(element);
  }
  return array;
}

export function indent(level) {
  return " ".repeat(level * 2);
}

// JS Maps/Sets hash by reference, not value, so anywhere Java relies on
// HashMap<JsonNode,_>/HashSet<JsonNode> value semantics (OptimizedStaticContains
// Function, ExperimentalModule.GroupBy) needs an explicit canonical key instead.
// Same strictness as Jackson's native equals: no cross-type numeric coercion
// (that's EqualsComparison's job, used for JSLT's own == operator).
export function canonicalKey(node) {
  if (node.isTextual()) return "s:" + node.asText();
  if (node.isBoolean()) return "b:" + node.booleanValue();
  if (node.isNull()) return "z";
  if (node.isNumber()) return node.constructor.name + ":" + node.value;
  return "j:" + node.toString(); // arrays/objects: structural fallback
}
