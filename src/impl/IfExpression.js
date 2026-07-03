// Port of impl/IfExpression.java — if/else with own then-lets and else-lets.

import { AbstractNode } from "./AbstractNode.js";
import { isTrue, evalLets, indent } from "./NodeUtils.js";
import { NullNode } from "../json/JsonNode.js";

export class IfExpression extends AbstractNode {
  constructor(test, thenlets, then, elselets, orelse, location) {
    super(location);
    this.test = test;
    this.thenlets = thenlets;
    this.then = then;
    this.elselets = elselets; // can be undefined
    this.orelse = orelse; // can be undefined
  }

  apply(scope, input) {
    if (isTrue(this.test.apply(scope, input))) {
      evalLets(scope, input, this.thenlets);
      return this.then.apply(scope, input);
    }

    // test was false: return null, or evaluate else
    if (this.orelse != null) {
      evalLets(scope, input, this.elselets);
      return this.orelse.apply(scope, input);
    }
    return NullNode.instance;
  }

  computeMatchContexts(parent) {
    for (const let_ of this.thenlets) let_.computeMatchContexts(parent);
    this.then.computeMatchContexts(parent);
    if (this.orelse != null) {
      this.orelse.computeMatchContexts(parent);
      for (const let_ of this.elselets) let_.computeMatchContexts(parent);
    }
  }

  optimize() {
    for (const let_ of this.thenlets) let_.optimize();
    if (this.elselets != null) for (const let_ of this.elselets) let_.optimize();

    this.test = this.test.optimize();
    this.then = this.then.optimize();
    if (this.orelse != null) this.orelse = this.orelse.optimize();
    return this;
  }

  prepare(ctx) {
    this.test.prepare(ctx);

    // then
    ctx.scope.enterScope();
    for (const let_ of this.thenlets) { let_.prepare(ctx); let_.register(ctx.scope); }
    this.then.prepare(ctx);
    ctx.scope.leaveScope();

    // else
    if (this.orelse != null) {
      ctx.scope.enterScope();
      for (const let_ of this.elselets) { let_.prepare(ctx); let_.register(ctx.scope); }
      this.orelse.prepare(ctx);
      ctx.scope.leaveScope();
    }
  }

  getChildren() {
    const children = [this.test, ...this.thenlets, this.then];
    if (this.elselets != null) children.push(...this.elselets);
    if (this.orelse != null) children.push(this.orelse);
    return children;
  }

  dump(level) {
    /* eslint-disable no-console -- mirrors Java's debug dump */
    console.log(indent(level) + "if (");
    this.test.dump(level + 1);
    console.log(indent(level) + ")");

    for (const let_ of this.thenlets) let_.dump(level + 1);
    this.then.dump(level + 1);

    if (this.orelse != null) {
      console.log(indent(level) + "else");
      for (const let_ of this.elselets) let_.dump(level + 1);
      this.orelse.dump(level + 1);
    }
    /* eslint-enable no-console */
  }
}
