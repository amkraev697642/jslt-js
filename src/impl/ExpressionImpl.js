// Port of impl/ExpressionImpl.java — wraps the compiled top-level lets +
// declared functions + body expression as the internal Expression. The
// public-facing Expression/Parser wrapper (Stage 5) delegates straight to this.

import { evalLets } from "./NodeUtils.js";
import { Scope } from "./Scope.js";
import { DotExpression } from "./DotExpression.js";
import { FunctionDeclaration } from "./FunctionDeclaration.js";
import { optimizeLets } from "./OptimizeUtils.js";
import { NullNode } from "../json/JsonNode.js";

export class ExpressionImpl {
  constructor(lets, functions, actual) {
    this.lets = lets;
    this.functions = functions; // Map<string, Function>
    this.actual = actual; // ExpressionNode, can be undefined (module with no body)
    this.stackFrameSize = undefined;
    this.fileModules = undefined; // JstlFile[]
    this.parameterSlots = undefined;

    // traverse tree and set up object-matcher context queries
    const root = new DotExpression(undefined);
    if (this.actual != null) this.actual.computeMatchContexts(root);
    for (const let_ of lets) let_.computeMatchContexts(root);
  }

  getFunction(name) { return this.functions.get(name); }

  hasBody() { return this.actual != null; }

  // Java overloads apply() on argument types (Map vs JsonNode vs Scope); JS
  // can't, so these are 3 distinctly-named methods matching the 3 Java ones.
  applyVariables(variables, input) {
    const scope = Scope.makeScope(variables, this.stackFrameSize, this.parameterSlots);
    return this.apply(scope, input ?? NullNode.instance);
  }

  applyInput(input) {
    return this.apply(Scope.getRoot(this.stackFrameSize), input ?? NullNode.instance);
  }

  apply(scope, input) {
    // evaluate lets in imported file modules first
    if (this.fileModules != null) {
      for (const file of this.fileModules) file.evaluateLetsOnly(scope, input);
    }

    evalLets(scope, input, this.lets);

    return this.actual.apply(scope, input);
  }

  prepare(ctx) {
    ctx.scope.enterScope();
    for (const let_ of this.lets) let_.register(ctx.scope);

    for (const child of this.getChildren()) child.prepare(ctx);

    this.stackFrameSize = ctx.scope.getStackFrameSize();
    this.parameterSlots = ctx.scope.getParameterSlots();
    ctx.scope.leaveScope();
  }

  // Called once during compilation to initialize a module's global variables;
  // the values are then remembered forever (held in the shared root Scope).
  evaluateLetsOnly(scope, input) {
    evalLets(scope, input, this.lets);
  }

  optimize() {
    this.lets = optimizeLets(this.lets);

    for (const f of this.functions.values()) {
      if (f instanceof FunctionDeclaration) f.optimize();
    }

    if (this.actual != null) this.actual = this.actual.optimize();
  }

  getChildren() {
    const children = [...this.lets];
    for (const f of this.functions.values()) {
      if (f instanceof FunctionDeclaration) children.push(f);
    }
    if (this.actual != null) children.push(this.actual);
    return children;
  }

  toString() { return this.actual.toString(); }

  getStackFrameSize() { return this.stackFrameSize; }

  setGlobalModules(fileModules) { this.fileModules = fileModules; }
}
