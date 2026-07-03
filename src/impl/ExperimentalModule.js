// Port of impl/ExperimentalModule.java — functions/macros that may become
// official JSLT later. Unconditionally registered by ParseContext under a
// fixed URI, so `import "<URI>" as x` works without an external resolver.

import { AbstractCallable } from "./AbstractCallable.js";
import { canonicalKey, convertObjectToArray, mapper } from "./NodeUtils.js";
import { JsltException } from "../JsltException.js";
import { NullNode } from "../json/JsonNode.js";

export const EXPERIMENTAL_MODULE_URI = "http://jslt.schibsted.com/2018/experimental";

class GroupBy extends AbstractCallable {
  constructor() { super("group-by", 3, 3); }

  // macro: the 2nd/3rd args are unevaluated ExpressionNodes, evaluated once
  // per array element against that element as input
  call(scope, input, parameters) {
    let array = parameters[0].apply(scope, input);
    if (array.isNull()) return NullNode.instance;
    if (array.isObject()) array = convertObjectToArray(array);
    else if (!array.isArray()) throw new JsltException("Can't group-by on " + array);

    // groups: canonicalKey -> { key: JsonNode, values: ArrayNode }
    const groups = new Map();
    for (const groupInput of array.elements()) {
      const key = parameters[1].apply(scope, groupInput);
      const value = parameters[2].apply(scope, groupInput);

      const k = canonicalKey(key);
      let group = groups.get(k);
      if (group == null) {
        group = { key, values: mapper.createArrayNode() };
        groups.set(k, group);
      }
      group.values.add(value);
    }

    const result = mapper.createArrayNode();
    for (const group of groups.values()) {
      const node = mapper.createObjectNode();
      node.set("key", group.key);
      node.set("values", group.values);
      result.add(node);
    }
    return result;
  }
}

export class ExperimentalModule {
  constructor() {
    this.callables = new Map();
    this.register(new GroupBy());
  }

  getCallable(name) { return this.callables.get(name); }
  register(callable) { this.callables.set(callable.getName(), callable); }
}
