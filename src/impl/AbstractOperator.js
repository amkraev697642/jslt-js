// Port of impl/AbstractOperator.java — shared base for binary operators.

import { AbstractNode } from "./AbstractNode.js";
import { LiteralExpression } from "./LiteralExpression.js";
import { indent } from "./NodeUtils.js";

export class AbstractOperator extends AbstractNode {
  constructor(left, right, operator, location) {
    super(location);
    this.left = left;
    this.right = right;
    this.operator = operator;
  }

  apply(scope, input) {
    const v1 = this.left.apply(scope, input);
    const v2 = this.right.apply(scope, input);
    return this.perform(v1, v2);
  }

  dump(level) {
    this.left.dump(level + 1);
    // eslint-disable-next-line no-console -- mirrors Java's debug dump
    console.log(indent(level) + this.operator);
    this.right.dump(level + 1);
  }

  optimize() {
    this.left = this.left.optimize();
    this.right = this.right.optimize();

    // if both operands are literals, evaluate now and be done with it
    if (this.left instanceof LiteralExpression && this.right instanceof LiteralExpression) {
      return new LiteralExpression(this.apply(undefined, undefined), this.location);
    }
    return this;
  }

  computeMatchContexts(parent) {
    // operators are transparent to the object matcher
    this.left.computeMatchContexts(parent);
    this.right.computeMatchContexts(parent);
  }

  getChildren() { return [this.left, this.right]; }

  perform(_v1, _v2) { throw new Error("abstract"); }

  toString() {
    const first = this.left instanceof AbstractOperator ? `(${this.left})` : this.left.toString();
    const second = this.right instanceof AbstractOperator ? `(${this.right})` : this.right.toString();
    return `${first} ${this.operator} ${second}`;
  }
}
