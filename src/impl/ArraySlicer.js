// Port of impl/ArraySlicer.java — indexing and slicing of arrays and strings.

import { AbstractNode } from "./AbstractNode.js";
import { NullNode, TextNode, ArrayNode } from "../json/JsonNode.js";
import { mapper } from "../json/mapper.js";
import { JsltException } from "../JsltException.js";

export class ArraySlicer extends AbstractNode {
  constructor(left, colon, right, parent, location) {
    super(location);
    this.left = left; // can be undefined
    this.colon = colon;
    this.right = right; // can be undefined
    this.parent = parent;
  }

  apply(scope, input) {
    const sequence = this.parent.apply(scope, input);
    if (!sequence.isArray() && !sequence.isTextual()) return NullNode.instance;

    let size = sequence.size();
    if (sequence.isTextual()) size = sequence.asText().length;

    const leftix = this.resolveIndex(scope, this.left, input, size, 0);
    if (!this.colon) {
      if (sequence.isArray()) {
        let val = sequence.get(leftix);
        if (val == null) val = NullNode.instance;
        return val;
      }
      const string = sequence.asText();
      if (leftix >= string.length) throw new JsltException("String index out of range: " + leftix, this.location);
      return new TextNode(string.charAt(leftix));
    }

    let rightix = this.resolveIndex(scope, this.right, input, size, size);
    if (rightix > size) rightix = size;

    if (sequence.isArray()) {
      const result = mapper.createArrayNode();
      for (let ix = leftix; ix < rightix; ix++) result.add(sequence.get(ix));
      return result;
    }
    const string = sequence.asText();
    return new TextNode(string.substring(leftix, rightix));
  }

  resolveIndex(scope, expr, input, size, ifnull) {
    if (expr == null) return ifnull;

    const node = expr.apply(scope, input);
    if (!node.isNumber()) throw new JsltException("Can't index array/string with " + node, this.location);

    let ix = node.intValue();
    if (ix < 0) ix = size + ix;
    return ix;
  }

  getChildren() {
    const children = [this.parent];
    if (this.left != null) children.push(this.left);
    if (this.right != null) children.push(this.right);
    return children;
  }

  optimize() {
    if (this.left != null) this.left = this.left.optimize();
    if (this.right != null) this.right = this.right.optimize();
    this.parent = this.parent.optimize();
    return this;
  }

  dump(level) {
    if (this.parent != null) this.parent.dump(level);
    // eslint-disable-next-line no-console -- mirrors Java's debug dump
    console.log(" ".repeat(level * 2) + this);
  }

  toString() { return `[${this.left} : ${this.right}]`; }
}
