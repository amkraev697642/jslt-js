// Port of impl/AbstractNode.java — shared base for concrete node types.

import { ExpressionNode } from "./ExpressionNode.js";
import { indent } from "./NodeUtils.js";

export class AbstractNode extends ExpressionNode {
  constructor(location) {
    super();
    this.location = location;
  }

  getLocation() { return this.location; }

  dump(level) {
    // eslint-disable-next-line no-console -- mirrors Java's System.out.println debug dump
    console.log(indent(level) + this);
  }

  computeMatchContexts(_parent) {}

  prepare(ctx) {
    for (const child of this.getChildren()) child.prepare(ctx);
  }

  optimize() { return this; }

  getChildren() { return []; }
}
