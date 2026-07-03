// Port of impl/ModuleImpl.java — an in-memory module: a name -> Function map.

export class ModuleImpl {
  constructor(functions) { this.functions = functions; } // Map<string, Function>
  getCallable(name) { return this.functions.get(name); }
}
