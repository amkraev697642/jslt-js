// Port of impl/AbstractInvocationExpression.java — shared base for function
// and macro calls: argument-count validation and dump/toString plumbing.

import { AbstractNode } from "./AbstractNode.js";
import { JsltException } from "../JsltException.js";
import { indent } from "./NodeUtils.js";

export class AbstractInvocationExpression extends AbstractNode {
  constructor(arguments_, location) {
    super(location);
    this.callable = undefined; // set by resolve()
    this.arguments = arguments_;
  }

  // invoked when we know which callable this is going to be
  resolve(callable) {
    this.callable = callable;
    if (this.arguments.length < callable.getMinArguments()
        || this.arguments.length > callable.getMaxArguments()) {
      throw new JsltException(
        `${this.kind} '${callable.getName()}' needs ${callable.getMinArguments()}-` +
        `${callable.getMaxArguments()} arguments, got ${this.arguments.length}`,
        this.location,
      );
    }
  }

  computeMatchContexts(parent) {
    for (const arg of this.arguments) arg.computeMatchContexts(parent);
  }

  optimize() {
    for (let ix = 0; ix < this.arguments.length; ix++) this.arguments[ix] = this.arguments[ix].optimize();
    return this;
  }

  dump(level) {
    /* eslint-disable no-console -- mirrors Java's debug dump */
    console.log(indent(level) + this.callable.getName() + "(");
    for (const arg of this.arguments) arg.dump(level + 1);
    console.log(indent(level) + ")");
    /* eslint-enable no-console */
  }

  getChildren() { return [...this.arguments]; }

  toString() {
    return `${this.callable.getName()}(${this.arguments.map((a) => a.toString()).join(", ")})`;
  }
}
