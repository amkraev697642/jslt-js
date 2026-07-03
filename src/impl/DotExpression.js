// Port of impl/DotExpression.java — `.key` accessor and bare `.` (identity);
// chains via `parent` to its preceding expression.

import { AbstractNode } from "./AbstractNode.js";
import { NullNode } from "../json/JsonNode.js";

export class DotExpression extends AbstractNode {
  constructor(keyOrLocation, parent, location) {
    // Java has two constructors: DotExpression(Location) and
    // DotExpression(key, parent, Location). Mirror both via arg count.
    if (parent === undefined && location === undefined) {
      super(keyOrLocation);
      this.key = undefined;
      this.parent = undefined;
    } else {
      super(location);
      this.key = keyOrLocation;
      this.parent = parent;
    }
  }

  apply(scope, input) {
    // if there is no key we just return the input
    if (this.key == null) return input;

    // if we have a parent, get the input from the parent (preceding expr)
    if (this.parent != null) input = this.parent.apply(scope, input);

    // okay, do the keying
    let value = input.get(this.key);
    if (value == null) value = NullNode.instance;
    return value;
  }

  getChildren() {
    return this.parent == null ? [] : [this.parent];
  }

  toString() {
    const me = "." + (this.key == null ? "" : this.key);
    return this.parent != null ? `${this.parent}${me}` : me;
  }

  // verify we've built a correct DotExpression chain for our object matcher
  // (only used for that)
  checkOk(matcher) {
    // this node is OK, but might be a FailDotExpression higher up
    if (this.parent != null) this.parent.checkOk(matcher);
  }

  optimize() {
    if (this.parent != null) this.parent = this.parent.optimize();
    return this;
  }
}
