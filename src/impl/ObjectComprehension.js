// Port of impl/ObjectComprehension.java — `{for (...) key: value}` object comprehension.

import { AbstractNode } from "./AbstractNode.js";
import { isTrue, evalLets, convertObjectToArray, mapper } from "./NodeUtils.js";
import { JsltException } from "../JsltException.js";

export class ObjectComprehension extends AbstractNode {
  constructor(loop, lets, key, value, ifExpr, location, filter) {
    super(location);
    this.loop = loop;
    this.lets = lets;
    this.key = key;
    this.value = value;
    this.ifExpr = ifExpr; // can be undefined
    this.filter = filter;
  }

  apply(scope, input) {
    let sequence = this.loop.apply(scope, input);
    if (sequence.isNull()) return sequence;
    else if (sequence.isObject()) sequence = convertObjectToArray(sequence);
    else if (!sequence.isArray()) throw new JsltException("Object comprehension can't loop over " + sequence, this.location);

    const object = mapper.createObjectNode();
    for (let ix = 0; ix < sequence.size(); ix++) {
      const context = sequence.get(ix);

      // must evaluate lets over again for each value because of context
      if (this.lets.length > 0) evalLets(scope, context, this.lets);

      if (this.ifExpr == null || isTrue(this.ifExpr.apply(scope, context))) {
        const valueNode = this.value.apply(scope, context);
        if (this.filter.filter(valueNode)) {
          // if there is no value, no need to evaluate the key
          const keyNode = this.key.apply(scope, context);
          if (!keyNode.isTextual()) throw new JsltException("Object comprehension must have string as key, not " + keyNode, this.location);
          object.set(keyNode.asText(), valueNode);
        }
      }
    }
    return object;
  }

  prepare(ctx) {
    ctx.scope.enterScope();

    for (const let_ of this.lets) let_.register(ctx.scope);

    for (const child of this.getChildren()) child.prepare(ctx);

    ctx.scope.leaveScope();
  }

  getChildren() {
    const children = [...this.lets, this.loop, this.key, this.value];
    if (this.ifExpr != null) children.push(this.ifExpr);
    return children;
  }

  optimize() {
    for (const let_ of this.lets) let_.optimize();

    this.loop = this.loop.optimize();
    this.key = this.key.optimize();
    this.value = this.value.optimize();
    if (this.ifExpr != null) this.ifExpr = this.ifExpr.optimize();
    return this;
  }

  dump(_level) {}
}
