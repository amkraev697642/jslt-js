// Port of impl/FailDotExpression.java — marks that an object matcher (`* : .`)
// is being used somewhere it's not allowed (e.g. inside an array or function
// declaration). ArrayExpression/FunctionDeclaration inject this in place of the
// real parent during computeMatchContexts; checkOk() then throws if it's reached.

import { DotExpression } from "./DotExpression.js";
import { JsltException } from "../JsltException.js";

export class FailDotExpression extends DotExpression {
  constructor(location, where) {
    super(location);
    this.where = where;
  }

  checkOk(matcher) {
    // we're actually being used. this is illegal!
    throw new JsltException("Object matcher used inside " + this.where, matcher);
  }
}
