// Port of impl/Scope.java — runtime variable storage: a global stack frame plus
// a stack of per-function-call local stack frames, addressed by integer slot.
// Bit-packing preserved verbatim: top bit set => global frame, unset => local frame.

const BITMASK = 0x10000000;
const INVERSE = 0xEFFFFFFF;

export class Scope {
  static getRoot(stackFrameSize) {
    return new Scope(stackFrameSize);
  }

  // Creates an initialized scope with values for variables supplied by client
  // code into the JSLT expression.
  static makeScope(variables, stackFrameSize, parameterSlots) {
    const scope = new Scope(stackFrameSize);
    for (const variable of Object.keys(variables)) {
      if (parameterSlots.has(variable)) { // check that variable exists
        scope.setValue(parameterSlots.get(variable), variables[variable]);
      }
    }
    return scope;
  }

  constructor(stackFrameSize) {
    this.globalStackFrame = new Array(stackFrameSize);
    this.localStackFrames = []; // used as a stack: push/pop at the end
  }

  enterFunction(stackFrameSize) {
    this.localStackFrames.push(new Array(stackFrameSize));
  }

  leaveFunction() {
    this.localStackFrames.pop();
  }

  getValue(slot) {
    if ((slot & BITMASK) !== 0) return this.globalStackFrame[slot & INVERSE];
    return this.localStackFrames[this.localStackFrames.length - 1][slot];
  }

  setValue(slot, value) {
    if ((slot & BITMASK) !== 0) this.globalStackFrame[slot & INVERSE] = value;
    else this.localStackFrames[this.localStackFrames.length - 1][slot] = value;
  }
}

export { BITMASK, INVERSE };
