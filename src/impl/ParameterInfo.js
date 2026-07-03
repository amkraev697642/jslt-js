// Port of impl/ParameterInfo.java

import { VariableInfo } from "./VariableInfo.js";

export class ParameterInfo extends VariableInfo {
  constructor(name, location) {
    super(location);
    this.name = name;
  }

  getName() { return this.name; }
}
