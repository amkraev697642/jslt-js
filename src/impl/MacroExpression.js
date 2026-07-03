// Port of impl/MacroExpression.java — a macro call (controls its own argument
// evaluation; receives unevaluated ExpressionNode args).

import { AbstractInvocationExpression } from "./AbstractInvocationExpression.js";

export class MacroExpression extends AbstractInvocationExpression {
  kind = "Macro"; // used by AbstractInvocationExpression's arity-error message

  constructor(macro, arguments_, location) {
    super(arguments_, location);
    this.resolve(macro);
    this.macro = macro;
  }

  apply(scope, input) {
    return this.macro.call(scope, input, this.arguments);
  }
}
