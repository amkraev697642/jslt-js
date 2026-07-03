// Port of Callable.java — common base of Function and Macro.
// JS has no interfaces; this documents the contract (getName/getMinArguments/getMaxArguments).

export class Callable {
  getName() { throw new Error("abstract"); }
  getMinArguments() { throw new Error("abstract"); }
  getMaxArguments() { throw new Error("abstract"); }
}
