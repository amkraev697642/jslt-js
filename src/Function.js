// Port of Function.java — public extension interface for JSLT functions.

import { Callable } from "./Callable.js";

export class Function extends Callable {
  // (input, arguments) -> JsonNode
  call(_input, _arguments) { throw new Error("abstract"); }
}
