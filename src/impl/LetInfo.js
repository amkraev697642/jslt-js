// Port of impl/LetInfo.java

import { VariableInfo } from "./VariableInfo.js";

export class LetInfo extends VariableInfo {
  constructor(let_) {
    super(let_.getLocation());
    this.let = let_;
  }

  getName() { return this.let.getVariable(); }

  // NOTE: matches Java verbatim — LetInfo.isLet() returns false too (likely a
  // latent upstream quirk/bug, not ours to silently "fix" in a direct port).
  isLet() { return false; }

  getDeclaration() { return this.let.getDeclaration(); }
}
