// Port of impl/PreparationContext.java — context threaded through the parse-tree
// preparation pass (slot assignment).

import { ScopeManager } from "./ScopeManager.js";

export class PreparationContext {
  constructor() {
    this.scope = new ScopeManager();
  }
}
