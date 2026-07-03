// Port of impl/OptimizedStaticContainsFunction.java — swaps a linear-scan
// contains(a, b) for a Set-backed lookup when b is a large literal array
// (see FunctionExpression.optimize()).
//
// Java gets O(1) for free from HashSet<JsonNode> (Jackson's per-subtype
// hashCode/equals). JS Sets hash by reference, not value, so we key by a
// canonical "type:value" string instead (NodeUtils.canonicalKey) — same
// strictness as Jackson's native equals (no cross-type numeric coercion;
// that's EqualsComparison's job).

import { AbstractFunction } from "./AbstractFunction.js";
import { BooleanNode } from "../json/JsonNode.js";
import { canonicalKey } from "./NodeUtils.js";

export class OptimizedStaticContainsFunction extends AbstractFunction {
  constructor(array) {
    super("optimized-static-contains", 2, 2);
    this.keys = new Set();
    for (let ix = 0; ix < array.size(); ix++) this.keys.add(canonicalKey(array.get(ix)));
  }

  call(_input, arguments_) {
    return this.keys.has(canonicalKey(arguments_[0])) ? BooleanNode.TRUE : BooleanNode.FALSE;
  }
}
