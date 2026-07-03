// Port of impl/Macro.java — a Callable that controls evaluation of its own
// arguments (receives unevaluated ExpressionNodes, not values).

import { Callable } from "../Callable.js";

export class Macro extends Callable {
  // call(scope, input, parameters: ExpressionNode[]) -> JsonNode
  call(_scope, _input, _parameters) { throw new Error("abstract"); }
}
