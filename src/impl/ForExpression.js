// Port of impl/ForExpression.java — `[for (...) ...]` array comprehension.

import { AbstractNode } from "./AbstractNode.js";
import { isTrue, evalLets, convertObjectToArray, mapper, indent } from "./NodeUtils.js";
import { NullNode } from "../json/JsonNode.js";
import { DotExpression } from "./DotExpression.js";
import { JsltException } from "../JsltException.js";

export class ForExpression extends AbstractNode {
  constructor(valueExpr, lets, loopExpr, ifExpr, location) {
    super(location);
    this.valueExpr = valueExpr;
    this.lets = lets;
    this.loopExpr = loopExpr;
    this.ifExpr = ifExpr; // can be undefined
  }

  apply(scope, input) {
    let array = this.valueExpr.apply(scope, input);
    if (array.isNull()) return NullNode.instance;
    else if (array.isObject()) array = convertObjectToArray(array);
    else if (!array.isArray()) throw new JsltException("For loop can't iterate over " + array, this.location);

    const result = mapper.createArrayNode();
    for (let ix = 0; ix < array.size(); ix++) {
      const value = array.get(ix);

      // must evaluate lets over again for each value because of context
      if (this.lets.length > 0) evalLets(scope, value, this.lets);

      if (this.ifExpr == null || isTrue(this.ifExpr.apply(scope, value))) {
        result.add(this.loopExpr.apply(scope, value));
      }
    }
    return result;
  }

  computeMatchContexts(_parent) {
    // matching inside a 'for' targets the current object being traversed, so
    // we forget the parent and start over
    this.loopExpr.computeMatchContexts(new DotExpression(this.location));
  }

  optimize() {
    for (const let_ of this.lets) let_.optimize();

    this.valueExpr = this.valueExpr.optimize();
    this.loopExpr = this.loopExpr.optimize();
    if (this.ifExpr != null) this.ifExpr = this.ifExpr.optimize();
    return this;
  }

  prepare(ctx) {
    ctx.scope.enterScope();

    for (const let_ of this.lets) let_.register(ctx.scope);

    for (const child of this.getChildren()) child.prepare(ctx);

    ctx.scope.leaveScope();
  }

  getChildren() {
    const children = [...this.lets, this.valueExpr, this.loopExpr];
    if (this.ifExpr != null) children.push(this.ifExpr);
    return children;
  }

  dump(level) {
    /* eslint-disable no-console -- mirrors Java's debug dump */
    console.log(indent(level) + "for (");
    this.valueExpr.dump(level + 1);
    console.log(indent(level) + ")");
    this.loopExpr.dump(level + 1);
    /* eslint-enable no-console */
  }

  toString() {
    return `[for (${this.valueExpr}) ${this.loopExpr}` +
      (this.ifExpr != null ? ` if(${this.ifExpr})` : "") + "]";
  }
}
