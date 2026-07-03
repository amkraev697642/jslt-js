// Port of impl/JstlFile.java — a separately-loaded JSLT source file, usable
// both as a Module (`c:fn(...)`) and as a Function (`c(.)`, calling the
// imported file's top-level body as a template). `body` is an ExpressionImpl
// (Stage 5) — referenced here only by duck-typed method calls, not imported,
// since JS doesn't need the type and Java's ExpressionImpl<->JstlFile field
// reference would otherwise be a circular import.

import { JsltException } from "../JsltException.js";

export class JstlFile {
  constructor(prefix, source, body) {
    this.prefix = prefix;
    this.source = source;
    this.body = body;
  }

  // Module
  getCallable(name) { return this.body.getFunction(name); }

  // Function
  getName() { return this.prefix; }
  getMinArguments() { return 1; }
  getMaxArguments() { return 1; }

  call(_input, arguments_) {
    if (!this.body.hasBody()) {
      throw new JsltException(`Module '${this.prefix}' has no body, so cannot be called as a function`);
    }
    return this.body.applyInput(arguments_[0]);
  }

  evaluateLetsOnly(scope, input) { this.body.evaluateLetsOnly(scope, input); }
}
