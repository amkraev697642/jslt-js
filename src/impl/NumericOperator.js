// Port of impl/NumericOperator.java — shared base for + - * /'s numeric path.
// Long port note: Java's long arithmetic -> JS BigInt; double -> JS number.

import { AbstractOperator } from "./AbstractOperator.js";
import { number as toNumber } from "./NodeUtils.js";
import { NullNode } from "../json/JsonNode.js";
import { LongNode, DoubleNode } from "../json/NumericNode.js";

export class NumericOperator extends AbstractOperator {
  perform(v1, v2) {
    if (v1.isNull() || v2.isNull()) return NullNode.instance;

    v1 = toNumber(v1, true, this.location);
    v2 = toNumber(v2, true, this.location);

    if (v1.isIntegralNumber() && v2.isIntegralNumber()) {
      return new LongNode(this.performLong(BigInt(v1.value), BigInt(v2.value)));
    }
    return new DoubleNode(this.performDouble(v1.doubleValue(), v2.doubleValue()));
  }

  // overridden by concrete operators
  performDouble(_v1, _v2) { throw new Error("abstract"); }
  performLong(_v1, _v2) { throw new Error("abstract"); }
}
