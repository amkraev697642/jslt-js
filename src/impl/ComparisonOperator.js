// Port of impl/ComparisonOperator.java — shared ordering logic for > >= < <=.

import { AbstractOperator } from "./AbstractOperator.js";
import { number as toNumber } from "./NodeUtils.js";
import { JsltException } from "../JsltException.js";

export class ComparisonOperator extends AbstractOperator {
  compare(v1, v2) { return ComparisonOperator.compareStatic(v1, v2, this.location); }

  static compareStatic(v1, v2, location) {
    if (v1.isNumber() && v2.isNumber()) {
      const n1 = toNumber(v1, location).doubleValue();
      const n2 = toNumber(v2, location).doubleValue();
      return n1 - n2;
    } else if (v1.isTextual() && v2.isTextual()) {
      const s1 = v1.asText();
      const s2 = v2.asText();
      return s1 < s2 ? -1 : s1 > s2 ? 1 : 0; // Java's String.compareTo sign, not magnitude
    } else if (v1.isNull() || v2.isNull()) {
      // null equals itself, and is considered the smallest of all
      if (v1.isNull() && v2.isNull()) return 0;
      return v1.isNull() ? -1 : 1;
    }

    throw new JsltException(`Can't compare ${v1} and ${v2}`, location);
  }
}
