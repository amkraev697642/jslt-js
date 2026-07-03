// Port of impl/OptimizerScope.java — a no-op scope used when constant-folding
// static objects/arrays that contain lets; setValue is swallowed.

import { Scope } from "./Scope.js";

export class OptimizerScope extends Scope {
  constructor() { super(0); }
  setValue(_slot, _value) {}
}
