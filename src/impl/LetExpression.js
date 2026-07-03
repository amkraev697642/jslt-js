// Port of impl/LetExpression.java — `let x = ...`.

import { AbstractNode } from "./AbstractNode.js";
import { UNFOUND } from "./ScopeManager.js";
import { indent } from "./NodeUtils.js";

export class LetExpression extends AbstractNode {
  constructor(variable, value, location) {
    super(location);
    this.variable = variable;
    this.value = value;
    this.slot = UNFOUND; // this variable's position in the stack frame
    this.info = undefined;
  }

  getVariable() { return this.variable; }
  getSlot() { return this.slot; }

  apply(scope, input) { return this.value.apply(scope, input); }

  computeMatchContexts(parent) { this.value.computeMatchContexts(parent); }

  dump(level) {
    // eslint-disable-next-line no-console -- mirrors Java's debug dump
    console.log(indent(level) + "let " + this.variable + " =");
    this.value.dump(level + 1);
  }

  getChildren() { return [this.value]; }

  optimize() {
    this.value = this.value.optimize();
    return this;
  }

  register(scope) {
    this.info = scope.registerVariable(this);
    this.slot = this.info.getSlot();
  }

  getDeclaration() { return this.value; }
}
