// Port of impl/MultiplyOperator.java — `*`: string repetition (string * int),
// or numeric multiplication.

import { NumericOperator } from "./NumericOperator.js";
import { TextNode } from "../json/JsonNode.js";
import { JsltException } from "../JsltException.js";

export class MultiplyOperator extends NumericOperator {
  constructor(left, right, location) {
    super(left, right, "*", location);
  }

  perform(v1, v2) {
    if (v1.isTextual() || v2.isTextual()) {
      let str; let num;
      if (v1.isTextual() && !v2.isTextual()) { str = v1.asText(); num = v2.intValue(); }
      else if (v2.isTextual()) { str = v2.asText(); num = v1.intValue(); }
      else throw new JsltException("Can't multiply two strings!");

      return new TextNode(num > 0 ? str.repeat(num) : "");
    }
    return super.perform(v1, v2);
  }

  performDouble(v1, v2) { return v1 * v2; }
  performLong(v1, v2) { return v1 * v2; }
}
