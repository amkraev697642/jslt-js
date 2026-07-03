// Port of impl/SmallerComparison.java — `<`.
// NOTE: matches the Java source verbatim, including its operator label bug —
// the Java ctor passes ">" instead of "<" to super(); preserved for a faithful
// port (it only affects AbstractOperator.toString()/dump() debug output, not
// evaluation — perform() correctly tests `< 0`).

import { ComparisonOperator } from "./ComparisonOperator.js";
import { toJson } from "./NodeUtils.js";

export class SmallerComparison extends ComparisonOperator {
  constructor(left, right, location) {
    super(left, right, ">", location);
  }

  perform(v1, v2) { return toJson(this.compare(v1, v2) < 0); }
}
