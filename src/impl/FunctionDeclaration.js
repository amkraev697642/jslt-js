// Port of impl/FunctionDeclaration.java — a user `def name(params) ... body`.
// Implements both Function (so it can be called like a builtin) and
// ExpressionNode (so prepare/optimize tree-walks reach it).

import { AbstractNode } from "./AbstractNode.js";
import { evalLets } from "./NodeUtils.js";
import { FailDotExpression } from "./FailDotExpression.js";
import { JsltException } from "../JsltException.js";

export class FunctionDeclaration extends AbstractNode {
  constructor(name, parameters, lets, body) {
    super(undefined);
    this.name = name;
    this.parameters = parameters; // string[]
    this.parameterSlots = new Array(parameters.length);
    this.lets = lets;
    this.body = body;
    this.stackFrameSize = undefined;
    // Lets FunctionExpression.resolve() detect "this is a declared function"
    // without an instanceof check, which would otherwise create a circular
    // import between FunctionExpression.js and FunctionDeclaration.js.
    this.isFunctionDeclaration = true;
  }

  getName() { return this.name; }
  getMinArguments() { return this.parameters.length; }
  getMaxArguments() { return this.parameters.length; }

  // Java implements two overloads here: call(input, args) — required by the
  // Function interface but unusable (a declared function needs the global
  // Scope, so it just throws INTERNAL ERROR) — and call(scope, input, args),
  // the one actually used. JS can't overload by arity; FunctionExpression
  // dispatches to declared functions via the isFunctionDeclaration flag
  // instead of the Function interface, so the throwing overload is dead code
  // here and is omitted. This is the real one:
  call(scope, input, arguments_) {
    scope.enterFunction(this.stackFrameSize);

    // bind the arguments into the function scope
    for (let ix = 0; ix < arguments_.length; ix++) scope.setValue(this.parameterSlots[ix], arguments_[ix]);

    // then bind the lets
    evalLets(scope, input, this.lets);

    // evaluate body
    const value = this.body.apply(scope, input);
    scope.leaveFunction();
    return value;
  }

  optimize() {
    for (const let_ of this.lets) let_.optimize();
    this.body = this.body.optimize();
    return this;
  }

  // the ExpressionNode API requires this, but it doesn't make sense for a Function
  apply(_scope, _context) { throw new JsltException("INTERNAL ERROR"); }

  computeMatchContexts(_parent) {
    // not allowed to use the object matcher inside declared functions
    const fail = new FailDotExpression(undefined, "function declaration");
    for (const let_ of this.lets) let_.computeMatchContexts(fail);
    this.body.computeMatchContexts(fail);
  }

  prepare(ctx) {
    ctx.scope.enterFunction();

    for (let ix = 0; ix < this.parameters.length; ix++) {
      this.parameterSlots[ix] = ctx.scope.registerParameter(this.parameters[ix], this.location);
    }

    for (const let_ of this.lets) { let_.register(ctx.scope); let_.prepare(ctx); }

    this.body.prepare(ctx);

    this.stackFrameSize = ctx.scope.getStackFrameSize();
    ctx.scope.leaveFunction();
  }
}
