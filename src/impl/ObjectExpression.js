// Port of impl/ObjectExpression.java — `{...}` object literal, with optional
// `let`s and an optional trailing object matcher (`* : .`).

import { AbstractNode } from "./AbstractNode.js";
import { mapper, indent } from "./NodeUtils.js";
import { JsltException } from "../JsltException.js";
import { LiteralExpression } from "./LiteralExpression.js";
import { OptimizerScope } from "./OptimizerScope.js";
import { NullNode } from "../json/JsonNode.js";

export class ObjectExpression extends AbstractNode {
  constructor(lets, children, matcher, location, filter) {
    super(location);
    this.lets = lets;
    this.children = children;
    this.matcher = matcher; // can be undefined
    this.filter = filter;
    this.contextQuery = undefined; // DotExpression; filled by computeMatchContexts

    this.keys = new Set();
    this.containsDynamicKeys = false;
    for (const child of children) {
      if (child.isKeyLiteral()) {
        this.keys.add(child.getStaticKey());
      } else {
        this.containsDynamicKeys = true;
        if (matcher != null) throw new JsltException("Object matcher not allowed in objects which have dynamic keys");
      }
    }
    if (matcher != null) for (const minus of matcher.getMinuses()) this.keys.add(minus);

    if (!this.containsDynamicKeys) this.checkForDuplicates();
  }

  checkForDuplicates() {
    const seen = new Set();
    for (const child of this.children) {
      const key = child.getStaticKey();
      if (seen.has(key)) throw new JsltException(`Invalid object declaration, duplicate key '${key}'`, child.getLocation());
      seen.add(key);
    }
  }

  apply(scope, input) {
    for (const let_ of this.lets) scope.setValue(let_.getSlot(), let_.apply(scope, input));

    const object = mapper.createObjectNode();
    for (const child of this.children) {
      const value = child.apply(scope, input);
      if (this.filter.filter(value)) {
        const key = child.applyKey(scope, input);

        if (this.containsDynamicKeys && object.has(key)) {
          throw new JsltException(`Duplicate key '${key}' in object`, child.getLocation());
        }

        object.set(key, value);
      }
    }

    if (this.matcher != null) this.evaluateMatcher(scope, input, object);

    return object;
  }

  evaluateMatcher(scope, input, object) {
    // find the object to match against
    const context = this.contextQuery.apply(scope, input);
    if (context.isNull() && !context.isObject()) return; // no keys to match against

    for (const [key, val] of context.fields()) {
      if (this.keys.has(key)) continue; // the template already defined this key

      const value = this.matcher.apply(scope, val);
      object.set(key, value);
    }
  }

  computeMatchContexts(parent) {
    if (this.matcher != null) {
      this.contextQuery = parent;
      this.contextQuery.checkOk(this.location); // verify expression is legal
    }

    for (const let_ of this.lets) let_.computeMatchContexts(parent);
    for (const child of this.children) child.computeMatchContexts(parent);
  }

  optimize() {
    for (const let_ of this.lets) let_.optimize();

    if (this.matcher != null) this.matcher.optimize();

    let allLiterals = this.matcher == null; // not static otherwise
    for (let ix = 0; ix < this.children.length; ix++) {
      this.children[ix] = this.children[ix].optimize();
      allLiterals = allLiterals && this.children[ix].isLiteral();
    }
    if (!allLiterals) return this;

    // static object: build it once (literals don't use scope/input) and
    // turn it into a literal
    const object = this.apply(new OptimizerScope(), NullNode.instance);
    return new LiteralExpression(object, this.location);
  }

  prepare(ctx) {
    ctx.scope.enterScope();

    for (const let_ of this.lets) let_.register(ctx.scope);

    for (const child of this.getChildren()) child.prepare(ctx);

    ctx.scope.leaveScope();
  }

  getChildren() {
    const children = [...this.lets, ...this.children];
    if (this.matcher != null) children.push(this.matcher);
    return children;
  }

  dump(level) {
    /* eslint-disable no-console -- mirrors Java's debug dump */
    console.log(indent(level) + "{");
    for (const let_ of this.lets) let_.dump(level + 1);
    for (const child of this.children) child.dump(level + 1);
    console.log(indent(level) + "}");
    /* eslint-enable no-console */
  }
}
