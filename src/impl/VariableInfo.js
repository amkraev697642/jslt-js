// Port of impl/VariableInfo.java — what we know about a declared variable
// (stack-frame slot, location, usage count), mostly for optimization.

export class VariableInfo {
  constructor(location) {
    this.location = location;
    this.slot = undefined;
    this.usages = 0;
  }

  getName() { throw new Error("abstract"); }

  setSlot(slot) { this.slot = slot; }
  getSlot() { return this.slot; }

  getLocation() { return this.location; }

  incrementUsageCount() { this.usages++; }
  getUsageCount() { return this.usages; }

  isLet() { return false; }

  // The expression that computes this variable's value. undefined for
  // parameters, because we don't know the expression in that case.
  getDeclaration() { return undefined; }
}
