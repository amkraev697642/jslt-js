// Port of impl/PairExpression.java — a `"key": expr` pair inside an object literal.

import { AbstractNode } from "./AbstractNode.js";
import { JsltException } from "../JsltException.js";
import { LiteralExpression } from "./LiteralExpression.js";
import { DotExpression } from "./DotExpression.js";
import { FailDotExpression } from "./FailDotExpression.js";
import { indent } from "./NodeUtils.js";

export class PairExpression extends AbstractNode {
  constructor(key, value, location) {
    super(location);
    this.key = key;
    this.value = value;
  }

  applyKey(scope, input) {
    const v = this.key.apply(scope, input);
    if (!v.isTextual()) throw new JsltException("Object key must be string", this.location);
    return v.asText();
  }

  getStaticKey() {
    if (!this.isKeyLiteral()) throw new JsltException("INTERNAL ERROR: Attempted to get non-static key");
    return this.key.apply(undefined, undefined).asText();
  }

  apply(scope, input) { return this.value.apply(scope, input); }

  computeMatchContexts(parent) {
    // a pair with a dynamic key cannot use matching in the value
    const expr = this.isKeyLiteral()
      ? new DotExpression(this.getStaticKey(), parent, this.location)
      : new FailDotExpression(this.location, "dynamic object");
    this.value.computeMatchContexts(expr);
  }

  isLiteral() {
    return this.value instanceof LiteralExpression && this.key instanceof LiteralExpression;
  }

  isKeyLiteral() { return this.key instanceof LiteralExpression; }

  optimize() {
    this.key = this.key.optimize();
    this.value = this.value.optimize();
    return this;
  }

  getChildren() { return [this.key, this.value]; }

  dump(level) {
    /* eslint-disable no-console -- mirrors Java's debug dump */
    console.log(indent(level) + '"' + this.key + '"' + " :");
    this.value.dump(level + 1);
    /* eslint-enable no-console */
  }
}
