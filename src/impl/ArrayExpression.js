// Port of impl/ArrayExpression.java — `[...]` array literal.

import { AbstractNode } from "./AbstractNode.js";
import { mapper } from "./NodeUtils.js";
import { LiteralExpression } from "./LiteralExpression.js";
import { FailDotExpression } from "./FailDotExpression.js";

export class ArrayExpression extends AbstractNode {
  constructor(children, location) {
    super(location);
    this.children = children;
  }

  apply(scope, input) {
    const array = mapper.createArrayNode();
    for (const child of this.children) array.add(child.apply(scope, input));
    return array;
  }

  computeMatchContexts(_parent) {
    const fail = new FailDotExpression(this.location, "array");
    for (const child of this.children) child.computeMatchContexts(fail);
  }

  getChildren() { return this.children; }

  optimize() {
    let allLiterals = true;
    for (let ix = 0; ix < this.children.length; ix++) {
      this.children[ix] = this.children[ix].optimize();
      allLiterals = allLiterals && this.children[ix] instanceof LiteralExpression;
    }
    if (!allLiterals) return this;

    // static array: build it once and turn it into a literal
    const array = this.apply(undefined, undefined); // literals don't use scope/input
    return new LiteralExpression(array, this.location);
  }

  dump(level) {
    /* eslint-disable no-console -- mirrors Java's debug dump */
    console.log(" ".repeat(level * 2) + "[");
    for (const child of this.children) child.dump(level + 1);
    console.log(" ".repeat(level * 2) + "]");
    /* eslint-enable no-console */
  }
}
