// Port of impl/PipeOperator.java — `a | b`.

import { AbstractOperator } from "./AbstractOperator.js";
import { DotExpression } from "./DotExpression.js";
import { Location } from "./Location.js";
import { JsltException } from "../JsltException.js";

export class PipeOperator extends AbstractOperator {
  constructor(left, right, location) {
    super(left, right, "|", location);
  }

  apply(scope, input) {
    return this.right.apply(scope, this.left.apply(scope, input));
  }

  computeMatchContexts(parent) {
    this.left.computeMatchContexts(parent);
    this.right.computeMatchContexts(new DotExpression(new Location(null, 0, 0)));
  }

  perform(_v1, _v2) { throw new JsltException("this should NOT be reachable"); }
}
