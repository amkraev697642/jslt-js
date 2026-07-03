// Port of impl/PlusOperator.java — `+`: string concat, array concat, object
// union, numeric add, and null-as-identity for objects/arrays.

import { NumericOperator } from "./NumericOperator.js";
import { toStringValue } from "./NodeUtils.js";
import { TextNode } from "../json/JsonNode.js";
import { mapper } from "../json/mapper.js";

export class PlusOperator extends NumericOperator {
  constructor(left, right, location) {
    super(left, right, "+", location);
  }

  perform(v1, v2) {
    if (v1.isTextual() || v2.isTextual()) {
      // if one operand is a string: string concatenation
      return new TextNode(toStringValue(v1, false) + toStringValue(v2, false));
    } else if (v1.isArray() && v2.isArray()) {
      return this.concatenateArrays(v1, v2);
    } else if (v1.isObject() && v2.isObject()) {
      return this.unionObjects(v1, v2);
    } else if ((v1.isObject() || v1.isArray()) && v2.isNull()) {
      // {} + null => {} (also arrays)
      return v1;
    } else if (v1.isNull() && (v2.isObject() || v2.isArray())) {
      // null + {} => {} (also arrays)
      return v2;
    }
    // do numeric operation
    return super.perform(v1, v2);
  }

  performDouble(v1, v2) { return v1 + v2; }
  performLong(v1, v2) { return v1 + v2; }

  concatenateArrays(v1, v2) {
    const result = mapper.createArrayNode();
    for (const e of v1.elements()) result.add(e);
    for (const e of v2.elements()) result.add(e);
    return result;
  }

  unionObjects(v1, v2) {
    const result = mapper.createObjectNode();
    for (const [k, v] of v2.fields()) result.set(k, v);
    for (const [k, v] of v1.fields()) result.set(k, v); // v1 overwrites v2
    return result;
  }
}
