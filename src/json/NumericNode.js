// Numeric node family mirroring Jackson's IntNode/LongNode/BigIntegerNode/DoubleNode.
// The type distinction is load-bearing: it drives output formatting (1 vs 1.0) and
// is-integer/is-decimal. int/double hold a JS number; long/bigint hold a JS BigInt
// (Java long and BigInteger exceed JS's safe-integer range, 2^53).

import { JsonNode } from "./JsonNode.js";

class NumericNode extends JsonNode {
  isNumber() { return true; }
  equals(other) {
    if (other == null) return false;
    if (other.constructor === this.constructor) return other.value === this.value;
    // Jackson 2.6+ cross-type integral comparison: IntNode/LongNode/BigIntegerNode
    // are equal when they represent the same integer value. DoubleNode stays separate
    // (IntNode(5) != DoubleNode(5.0) — type distinction drives formatting).
    if (this.isIntegralNumber() && other.isIntegralNumber()) {
      return BigInt(this.value) === BigInt(other.value);
    }
    return false;
  }
}

export class IntNode extends NumericNode {
  constructor(value) { super(); this.value = value; } // JS number, integral
  isIntegralNumber() { return true; }
  intValue() { return this.value; }
  doubleValue() { return this.value; }
  asText() { return String(this.value); }
  toString() { return String(this.value); }
}

export class LongNode extends NumericNode {
  constructor(value) { super(); this.value = BigInt(value); } // BigInt
  isIntegralNumber() { return true; }
  intValue() { return Number(this.value); }
  doubleValue() { return Number(this.value); }
  asText() { return this.value.toString(); }
  toString() { return this.value.toString(); }
}

export class BigIntegerNode extends NumericNode {
  constructor(value) { super(); this.value = BigInt(value); } // BigInt
  isIntegralNumber() { return true; }
  intValue() { return Number(this.value); }
  doubleValue() { return Number(this.value); }
  asText() { return this.value.toString(); }
  toString() { return this.value.toString(); }
}

export class DoubleNode extends NumericNode {
  constructor(value) { super(); this.value = value; } // JS number
  isFloatingPointNumber() { return true; }
  doubleValue() { return this.value; }
  intValue() { return Math.trunc(this.value); }
  asText() { return formatDouble(this.value); }
  toString() { return formatDouble(this.value); }
}

// Jackson prints DoubleNode via Double.toString: integer-valued doubles get a
// trailing ".0" (5 -> "5.0"), others print normally.
// ponytail: covers the common decimal cases; Java's exact exponent spelling
// (e.g. "1.0E10") differs — upgrade here if a conformance fixture needs it.
function formatDouble(value) {
  if (Number.isInteger(value) && Number.isFinite(value)) return value.toFixed(1);
  return String(value);
}

export { NumericNode };
