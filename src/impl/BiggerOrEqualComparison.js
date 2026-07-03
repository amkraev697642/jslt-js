// Port of impl/BiggerOrEqualComparison.java — `>=`.

import { ComparisonOperator } from "./ComparisonOperator.js";
import { toJson } from "./NodeUtils.js";

export class BiggerOrEqualComparison extends ComparisonOperator {
  constructor(left, right, location) {
    super(left, right, ">=", location);
  }

  perform(v1, v2) { return toJson(this.compare(v1, v2) >= 0); }
}
