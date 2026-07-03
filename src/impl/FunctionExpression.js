// Port of impl/FunctionExpression.java — a function call.

import { AbstractInvocationExpression } from "./AbstractInvocationExpression.js";
import { NullNode } from "../json/JsonNode.js";
import { toStringValue } from "./NodeUtils.js";
import { LiteralExpression } from "./LiteralExpression.js";
import { JsltException } from "../JsltException.js";
import { OptimizedStaticContainsFunction } from "./OptimizedStaticContainsFunction.js";
// Forward reference: BuiltinFunctions is written in Stage 3. Safe because
// BuiltinFunctions never imports back from here (no import cycle) — it's only
// touched lazily inside optimize(), at which point Stage 3 will exist.
import { BuiltinFunctions, getRegexp } from "./BuiltinFunctions.js";

const OPTIMIZE_ARRAY_CONTAINS_MIN = 10;

export class FunctionExpression extends AbstractInvocationExpression {
  kind = "Function"; // used by AbstractInvocationExpression's arity-error message

  constructor(name, arguments_, location) {
    super(arguments_, location);
    this.function = undefined; // undefined before resolution
    this.declared = undefined; // set if this resolves to a user FunctionDeclaration
    this.name = name;
  }

  getFunctionName() { return this.name; }

  resolve(function_) {
    super.resolve(function_);
    this.function = function_;
    // FunctionDeclaration.js (Stage 2) checks via a "isFunctionDeclaration" flag
    // rather than instanceof, to avoid a circular import with FunctionDeclaration.
    if (function_.isFunctionDeclaration) this.declared = function_;
  }

  apply(scope, input) {
    const params = new Array(this.arguments.length);
    for (let ix = 0; ix < params.length; ix++) params[ix] = this.arguments[ix].apply(scope, input);

    if (this.declared != null) return this.declared.call(scope, input, params);

    let value = this.function.call(input, params);

    // if a user-implemented function returns JS undefined/null, silently
    // turn it into a JSON null (the alternative is to throw an exception)
    if (value == null) value = NullNode.instance;

    return value;
  }

  optimize() {
    super.optimize();

    // if the 2nd argument to contains() is a large literal array, don't do a
    // linear search — use a Set-backed version of the function instead
    if (this.function === BuiltinFunctions.functions.get("contains")
        && this.arguments.length === 2
        && this.arguments[1] instanceof LiteralExpression) {
      const v = this.arguments[1].apply(undefined, undefined);
      if (v.isArray() && v.size() > OPTIMIZE_ARRAY_CONTAINS_MIN) {
        // resolve() again so all references are updated
        this.resolve(new OptimizedStaticContainsFunction(v));
      }
    }

    // ensure compile-time validation of static regular expressions. Java
    // marks these via `implements RegexpFunction` alongside `extends
    // AbstractFunction` — JS classes can't multiple-inherit, so detect the
    // contract by shape instead of by base class.
    if (typeof this.function.regexpArgumentNumber === "function") {
      const ix = this.function.regexpArgumentNumber();
      if (this.arguments[ix] instanceof LiteralExpression) {
        const r = toStringValue(this.arguments[ix].apply(undefined, undefined), true);
        if (r == null) throw new JsltException("Regexp cannot be null");

        // fills the pattern cache, and throws the right exception if invalid
        getRegexp(r);
      }
    }

    return this;
  }
}
