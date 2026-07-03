// Port of impl/SmallerOrEqualsComparison.java — `<=`.
// NOTE: matches the Java source verbatim, including its operator label bug —
// the Java ctor passes ">=" instead of "<=" to super(); see SmallerComparison.js.

import { ComparisonOperator } from "./ComparisonOperator.js";
import { toJson } from "./NodeUtils.js";

export class SmallerOrEqualsComparison extends ComparisonOperator {
  constructor(left, right, location) {
    super(left, right, ">=", location);
  }

  perform(v1, v2) { return toJson(this.compare(v1, v2) <= 0); }
}
