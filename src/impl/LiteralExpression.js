// Port of impl/LiteralExpression.java — wraps a constant JsonNode.

import { AbstractNode } from "./AbstractNode.js";

export class LiteralExpression extends AbstractNode {
  constructor(value, location) {
    super(location);
    this.value = value;
  }

  apply(_scope, _input) { return this.value; }

  dump(level) {
    // eslint-disable-next-line no-console -- mirrors Java's debug dump
    console.log(" ".repeat(level * 2) + this.value);
  }

  toString() { return this.value.toString(); }
}
