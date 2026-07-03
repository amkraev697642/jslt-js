// Port of impl/EqualsComparison.java — `==`. Note it extends AbstractOperator
// directly (not ComparisonOperator), since equality differs from ordering.

import { AbstractOperator } from "./AbstractOperator.js";
import { toJson } from "./NodeUtils.js";

export class EqualsComparison extends AbstractOperator {
  constructor(left, right, location) {
    super(left, right, "==", location);
  }

  perform(v1, v2) { return toJson(EqualsComparison.equals(v1, v2)); }

  static equals(v1, v2) {
    if (v1.isNumber() && v2.isNumber()) {
      // Jackson numeric-node equality is deliberately less helpful than what
      // we need here (https://github.com/FasterXML/jackson-databind/issues/1758),
      // so this implements its own.
      if (v1.isIntegralNumber() && v2.isIntegralNumber()) {
        return BigInt(v1.value) === BigInt(v2.value);
      }
      return v1.doubleValue() === v2.doubleValue();
    }
    return v1.equals(v2);
  }
}
