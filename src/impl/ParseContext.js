// Port of impl/ParseContext.java — compile-time context: available functions,
// module/import bookkeeping, delayed function-name resolution.
//
// The actual "go compile that imported file" orchestration stays in Parser.js
// (mirroring ParserImpl.compileImport/compileModule) — this class is pure
// bookkeeping, same split as the Java source, which keeps Parser.js the only
// thing that needs to import both.

import { JsltException } from "../JsltException.js";
import { BuiltinFunctions } from "./BuiltinFunctions.js";
import { ExperimentalModule, EXPERIMENTAL_MODULE_URI } from "./ExperimentalModule.js";
import { PreparationContext } from "./PreparationContext.js";
import { DefaultJsonFilter } from "../filters/DefaultJsonFilter.js";

export class ParseContext {
  constructor(extensions, source, resolver, namedModules, files, preparationContext, objectFilter) {
    this.extensions = extensions; // Function[]
    this.functions = new Map();
    for (const func of extensions) this.functions.set(func.getName(), func);

    this.source = source;
    this.files = files; // JstlFile[], shared across all contexts in a compile
    this.funcalls = []; // FunctionExpression[], for delayed name resolution
    this.modules = new Map(); // prefix -> Module, scoped to this source file
    this.resolver = resolver;
    this.namedModules = namedModules; // shared across all contexts
    this.preparationContext = preparationContext;
    this.objectFilter = objectFilter;
    this.parent = undefined;
  }

  // Convenience matching Java's single-arg ParseContext(String source)
  // constructor, minus the classpath resolver (Node-only, deferred — see plan
  // §10). A resolver is only needed if the source actually contains imports.
  static root(source, { resolver, functions = [], objectFilter = new DefaultJsonFilter() } = {}) {
    const namedModules = new Map();
    namedModules.set(EXPERIMENTAL_MODULE_URI, new ExperimentalModule());
    return new ParseContext(functions, source, resolver, namedModules, [], new PreparationContext(), objectFilter);
  }

  setParent(parent) { this.parent = parent; }

  getPreparationContext() { return this.preparationContext; }

  getFunction(name) {
    return this.functions.get(name) ?? BuiltinFunctions.functions.get(name);
  }

  getMacro(name) { return BuiltinFunctions.macros.get(name); }

  getSource() { return this.source; }
  getExtensions() { return this.extensions; }

  addDeclaredFunction(name, function_) { this.functions.set(name, function_); }

  rememberFunctionCall(fun) { this.funcalls.push(fun); }

  // called at the end of compiling a file to resolve all function calls by name
  resolveFunctions() {
    for (const fun of this.funcalls) {
      const name = fun.getFunctionName();
      const f = this.getFunction(name);
      if (f == null) throw new JsltException(`No such function: '${name}'`, fun.getLocation());
      fun.resolve(f);
    }
  }

  getDeclaredFunctions() { return this.functions; }

  registerModule(prefix, module) { this.modules.set(prefix, module); }

  getNamedModule(identifier) { return this.namedModules.get(identifier); }
  getNamedModules() { return this.namedModules; }

  isAlreadyImported(module) {
    if (this.source != null && module === this.source) return true;
    if (this.parent != null) return this.parent.isAlreadyImported(module);
    return false;
  }

  getImportedCallable(prefix, name, loc) {
    const m = this.modules.get(prefix);
    if (m == null) throw new JsltException(`No such module '${prefix}'`, loc);

    const f = m.getCallable(name);
    if (f == null) throw new JsltException(`No such function '${name}' in module '${prefix}'`, loc);

    return f;
  }

  getResolver() { return this.resolver; }
  getFiles() { return this.files; }
  registerJsltFile(file) { this.files.push(file); }
  getObjectFilter() { return this.objectFilter; }
}
