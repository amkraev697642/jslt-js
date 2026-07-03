// Port of impl/ExpressionNode.java — the internal interface every compiled
// JSLT node implements. JS has no interfaces, so this is a base class documenting
// the contract; AbstractNode (and OptimizerScope-free leaves) extend it.

export class ExpressionNode {
  // (Scope, JsonNode) -> JsonNode
  apply(_scope, _input) { throw new Error("abstract"); }

  dump(_level) {}

  // fills in the contextQuery in ObjectExpression matchers
  computeMatchContexts(_parent) {}

  prepare(_ctx) {}

  // return self, or an optimized replacement
  optimize() { return this; }

  // direct child nodes, to reduce tree-traversal boilerplate
  getChildren() { return []; }
}
