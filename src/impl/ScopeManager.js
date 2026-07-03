// Port of impl/ScopeManager.java — compile-time tracking of declared variables
// and their stack-frame slots. See the Java doc comment for the slot-packing
// rationale; preserved verbatim here including the 0x10000000 bit convention.

import { JsltException } from "../JsltException.js";
import { LetInfo } from "./LetInfo.js";
import { ParameterInfo } from "./ParameterInfo.js";

export const UNFOUND = 0xFFFFFFFF;

class StackFrame {
  constructor() { this.nextSlot = 0; }
}

// A scope frame is smaller than a stack frame: each object, object
// comprehension, for expression, and if expression gets its own scope frame,
// to handle variable shadowing. (Lexically nested scopes are flattened into a
// single stack frame by giving shadowed variables distinct slots.)
class ScopeFrame {
  constructor(inFunction, parent) {
    this.inFunction = inFunction;
    this.parent = parent;
    this.variables = new Map();
  }

  registerVariable(variable) {
    const name = variable.getName();
    if (this.variables.has(name)) {
      throw new JsltException("Duplicate variable declaration " + name, variable.getLocation());
    }

    const level = this.inFunction ? 0 : 0x10000000;
    const slot = level | this.parent.nextSlot++; // first free position
    variable.setSlot(slot);
    this.variables.set(name, variable);
    return slot;
  }

  resolveVariable(name) {
    return this.variables.get(name);
  }
}

export class ScopeManager {
  constructor() {
    this.globalFrame = new StackFrame();
    this.scopes = []; // stack: push/pop at the end (Java ArrayDeque.push = front;
    // here we push/pop at the end and iterate end->start to match "top to bottom")
    this.functionFrame = undefined;
    this.functionScopes = undefined; // undefined when not in a function

    this.current = this.scopes;
    this.currentFrame = this.globalFrame;

    // tracks slots for parameters that must be supplied from outside
    this.parameterSlots = new Map();
  }

  getStackFrameSize() {
    return this.currentFrame.nextSlot;
  }

  getParameterSlots() {
    return this.parameterSlots;
  }

  // Called when entering a new function: it needs its own stack frame, not
  // just a new scope.
  enterFunction() {
    this.functionFrame = new StackFrame();
    this.functionScopes = [];
    this.current = this.functionScopes;
    this.currentFrame = this.functionFrame;
    this.enterScope();
  }

  leaveFunction() {
    this.functionScopes = undefined;
    this.current = this.scopes;
    this.currentFrame = this.globalFrame;
  }

  enterScope() {
    this.current.push(new ScopeFrame(this.functionScopes !== undefined, this.currentFrame));
  }

  leaveScope() {
    // we don't need this frame anymore (the variables remember their own slot)
    this.current.pop();
  }

  registerVariable(let_) {
    const info = new LetInfo(let_);
    this.current[this.current.length - 1].registerVariable(info);
    return info;
  }

  registerParameter(parameter, loc) {
    return this.current[this.current.length - 1].registerVariable(new ParameterInfo(parameter, loc));
  }

  resolveVariable(variable) {
    const name = variable.getVariable();

    // traverse the current scopes top (innermost) to bottom
    for (let i = this.current.length - 1; i >= 0; i--) {
      const v = this.current[i].resolveVariable(name);
      if (v != null) return v;
    }

    // might have to traverse the global scope too, if we're inside a function
    if (this.functionScopes !== undefined) {
      for (let i = this.scopes.length - 1; i >= 0; i--) {
        const v = this.scopes[i].resolveVariable(name);
        if (v != null) return v;
      }
    }

    // not found inside the JSLT expression: must be a parameter supplied
    // from outside during evaluation
    const v = new ParameterInfo(name, variable.getLocation());
    const slot = this.scopes[this.scopes.length - 1].registerVariable(v);
    this.parameterSlots.set(name, slot);
    return v;
  }
}
