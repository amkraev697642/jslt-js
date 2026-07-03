// Port of impl/AbstractCallable.java

import { Callable } from "../Callable.js";

export class AbstractCallable extends Callable {
  constructor(name, min, max) {
    super();
    this.name = name;
    this.min = min;
    this.max = max;
  }

  getName() { return this.name; }
  getMinArguments() { return this.min; }
  getMaxArguments() { return this.max; }
}
