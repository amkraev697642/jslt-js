// Port of impl/UnequalsComparison.java — `!=`.

import { AbstractOperator } from "./AbstractOperator.js";
import { toJson } from "./NodeUtils.js";
import { EqualsComparison } from "./EqualsComparison.js";

export class UnequalsComparison extends AbstractOperator {
  constructor(left, right, location) {
    super(left, right, "!=", location);
  }

  perform(v1, v2) { return toJson(!EqualsComparison.equals(v1, v2)); }
}
