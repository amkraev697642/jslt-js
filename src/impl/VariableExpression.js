// Port of impl/VariableExpression.java — a `$var` reference.

import { AbstractNode } from "./AbstractNode.js";
import { LiteralExpression } from "./LiteralExpression.js";
import { UNFOUND } from "./ScopeManager.js";
import { JsltException } from "../JsltException.js";

export class VariableExpression extends AbstractNode {
  constructor(variable, location) {
    super(location);
    this.variable = variable;
    this.slot = UNFOUND; // overwritten by prepare()
    this.info = undefined;
  }

  getVariable() { return this.variable; }

  apply(scope, _input) {
    const value = scope.getValue(this.slot);
    if (value == null) throw new JsltException(`No such variable '${this.variable}'`, this.location);
    return value;
  }

  prepare(ctx) {
    this.info = ctx.scope.resolveVariable(this);
    this.slot = this.info.getSlot();
    this.info.incrementUsageCount();
  }

  optimize() {
    // if the variable is assigned a literal, inline it — no point keeping the variable
    const declaration = this.info.getDeclaration(); // undefined if a parameter
    if (declaration != null && declaration instanceof LiteralExpression) return declaration;
    return this;
  }

  toString() { return "$" + this.variable; }
}
