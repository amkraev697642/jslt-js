// Port of impl/DivideOperator.java — `/`: integer division when both operands
// are integral and evenly divide, else floating-point division.

import { NumericOperator } from "./NumericOperator.js";
import { number as toNumber } from "./NodeUtils.js";
import { NullNode } from "../json/JsonNode.js";
import { LongNode, DoubleNode } from "../json/NumericNode.js";

export class DivideOperator extends NumericOperator {
  constructor(left, right, location) {
    super(left, right, "/", location);
  }

  perform(v1, v2) {
    if (v1.isNull() || v2.isNull()) return NullNode.instance;

    v1 = toNumber(v1, true, this.location);
    v2 = toNumber(v2, true, this.location);

    if (v1.isIntegralNumber() && v2.isIntegralNumber()) {
      const l1 = BigInt(v1.value);
      const l2 = BigInt(v2.value);
      if (l1 % l2 === 0n) return new LongNode(l1 / l2);
      return new DoubleNode(Number(l1) / Number(l2));
    }
    return new DoubleNode(this.performDouble(v1.doubleValue(), v2.doubleValue()));
  }

  performDouble(v1, v2) { return v1 / v2; }
  // integers aren't closed under division; unused but kept for parity with NumericOperator's shape
  performLong(v1, v2) { return v1 / v2; }
}
