// Port of impl/MinusOperator.java — `-`: numeric subtraction only.

import { NumericOperator } from "./NumericOperator.js";

export class MinusOperator extends NumericOperator {
  constructor(left, right, location) {
    super(left, right, "-", location);
  }

  performDouble(v1, v2) { return v1 - v2; }
  performLong(v1, v2) { return v1 - v2; }
}
