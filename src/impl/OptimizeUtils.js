// Port of impl/OptimizeUtils.java — drops top-level lets whose value is a
// literal: VariableExpression already inlines those and removes itself, so
// there's nothing left to evaluate the let for.

import { LiteralExpression } from "./LiteralExpression.js";

export function optimizeLets(lets) {
  let count = 0;
  for (const let_ of lets) {
    let_.optimize();
    if (!(let_.getDeclaration() instanceof LiteralExpression)) count++;
  }

  if (count === lets.length) return lets;

  const filtered = new Array(count);
  let pos = 0;
  for (const let_ of lets) {
    if (!(let_.getDeclaration() instanceof LiteralExpression)) filtered[pos++] = let_;
  }
  return filtered;
}
