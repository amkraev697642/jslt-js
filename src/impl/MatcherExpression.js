// Port of impl/MatcherExpression.java — the `* : .` / `* - foo : .` object matcher.

import { AbstractNode } from "./AbstractNode.js";

export class MatcherExpression extends AbstractNode {
  constructor(expr, minuses, location) {
    super(location);
    this.minuses = minuses; // string[]
    this.expr = expr;
  }

  getMinuses() { return this.minuses; }

  apply(scope, input) { return this.expr.apply(scope, input); }

  computeMatchContexts(_parent) {
    // FIXME (kept from Java): uhhh, the rules here?
  }

  getChildren() { return [this.expr]; }

  dump(_level) {}

  optimize() {
    this.expr = this.expr.optimize();
    return this;
  }
}
