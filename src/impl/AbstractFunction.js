// Port of impl/AbstractFunction.java — base for all builtin functions.

import { AbstractCallable } from "./AbstractCallable.js";

export class AbstractFunction extends AbstractCallable {
  // call(input, arguments) -> JsonNode, implemented by each builtin (Stage 3)
}
