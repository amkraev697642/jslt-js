// Port of impl/OrOperator.java — `or`, short-circuiting.

import { AbstractOperator } from "./AbstractOperator.js";
import { isTrue, toJson } from "./NodeUtils.js";
import { BooleanNode } from "../json/JsonNode.js";
import { JsltException } from "../JsltException.js";

export class OrOperator extends AbstractOperator {
  constructor(left, right, location) {
    super(left, right, "or", location);
  }

  apply(scope, input) {
    const v1 = isTrue(this.left.apply(scope, input));
    if (v1) return BooleanNode.TRUE;

    const v2 = isTrue(this.right.apply(scope, input));
    return toJson(v1 || v2);
  }

  perform(_v1, _v2) { throw new JsltException("Not implemented"); }
}
