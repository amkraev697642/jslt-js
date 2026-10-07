# jslt-js

JavaScript port of [JSLT](https://github.com/schibsted/jslt) — the JSON query and transformation language. 
Faithful translation of the Java engine: same grammar, same builtins, same semantics. 
Isomorphic (browser + Node.js), zero runtime dependencies.

**[Try it in the playground](https://amkraev697642.github.io/jslt-playground/)** — live JSLT editor with syntax highlighting, error markers and shareable links.

## For Java developers

If you know the Java JSLT library this maps directly:

| Java | JS |
|------|----|
| `Parser.compileString(source)` | `compile(source, name)` |
| `expression.apply(input)` | `expr.applyInput(fromJS(input))` |
| `expression.apply(variables, input)` | `expr.applyVariables(vars, fromJS(input))` |
| `new ObjectMapper().readTree(json)` | `readTree(json)` |
| Jackson `JsonNode` tree | `JsonNode` tree (same API shape) |
| `toJson()` | `toJS()` |

## Quick start

```js
import { compile, fromJS, toJS } from "jslt-js";

const expr = compile(`.name + " wins"`, "example.jslt");
const result = toJS(expr.applyInput(fromJS({ name: "Alice" })));
// → "Alice wins"
```

## Install

```sh
npm install jslt-js          # ESM (Node 18+, browsers)
```

**Browser (classic script / `file://` / no bundler):** use the prebuilt IIFE — it sets
`globalThis.JSLT` (same shape as the ESM API, including `extensions`):

```html
<script src="https://cdn.jsdelivr.net/npm/jslt-js@0.1.8/dist/jslt-bundle.js"></script>
<script>
  const expr = JSLT.compile('{"hi": .name}');
  console.log(JSLT.toJS(expr.applyInput(JSLT.fromJS({ name: "Ada" }))));
</script>
```

Do **not** rely on `https://esm.sh/jslt-js@…?bundle` for browsers — older publishes pulled
`node:crypto` into the graph. Prefer `dist/jslt-bundle.js` (or ESM from `jslt-js@0.1.8+`).

CJS consumers (`require()`):

```js
const { compile, fromJS, toJS } = require("jslt-js");
```

The CJS build is at `dist/jslt.cjs` and is selected automatically via the `exports` field.

## API

### `compile(source, sourceName, options?)`

Parses and compiles a JSLT template. Returns an `ExpressionImpl`.

```js
const expr = compile(source, "my-transform.jslt", {
  resolver: { resolve: (name) => fs.readFileSync(name, "utf8") },
  functions: myCustomFunctions,   // array of Function objects
});
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `resolver` | `{ resolve(name): string }` | Loads imported modules by name |
| `functions` | `Function[]` | Custom/extension functions to register |

### `expr.applyInput(inputNode)`

Apply the compiled expression to a `JsonNode` input.

### `expr.applyVariables(vars, inputNode)`

Apply with external variables. `vars` is a plain JS object mapping variable names to `JsonNode` values:

```js
expr.applyVariables({ foo: fromJS(42) }, fromJS(null));
```

### `fromJS(value)` / `toJS(node)`

Convert between plain JS values and the internal `JsonNode` tree. `toJS` is safe for `JSON.stringify`
 large integers are downgraded from `BigInt` when they fit in a JS number.

### `readTree(jsonString)`

Parse a JSON string to a `JsonNode`. Equivalent to Jackson's `ObjectMapper.readTree` for most purposes.
**Note:** uses `JSON.parse` internally, so whole-valued floats (`"42.0"`) come back as `IntNode(42)` — the same type-erasure limitation 
as any JS JSON parser. JSLT expressions and templates are not affected since the engine uses its own type-aware lexer for literals.

## Imports

JSLT `import` statements are resolved via the `resolver` option:

```js
// File-system resolver (Node only)
import { readFileSync } from "fs";
import { resolve, dirname } from "path";

const jsltDir = dirname(jsltFilePath);
const opts = {
  resolver: { resolve: (name) => readFileSync(resolve(jsltDir, name), "utf8") },
};
const expr = compile(source, jsltFilePath, opts);
```

## Extension functions

Register custom functions the same way as Java's `Parser.withFunctions`:

```js
const myFn = {
  getName: () => "greet",
  getMinArguments: () => 1,
  getMaxArguments: () => 1,
  call: (_input, [nameNode]) => fromJS("Hello " + nameNode.asText()),
};

const expr = compile(`. | greet(.name)`, "t.jslt", { functions: [myFn] });
```

A built-in extension pack (`money`, `fullName`, `enumerate`) ships with the library:

```js
import { extensions } from "jslt-js/extensions";

const expr = compile(source, name, { functions: extensions });
```

## CLI

```sh
npx jslt [--extensions] <transform.jslt> [input.json|-]
```

Reads JSON from `input.json` or stdin. `--extensions` loads the built-in extension pack. Imports resolve relative to `<transform.jslt>`'s directory.

```sh
echo '{"name":"Alice"}' | jslt greet.jslt -
cat booking.json | jslt --extensions ext.jslt -
```

## Build

```sh
npm run build     # → dist/jslt-bundle.js (browser global) + dist/jslt.cjs (Node CJS)
```

The browser bundle exposes `globalThis.JSLT` with the full API including extensions.

## Tests

```sh
npm test
```

Runs unit tests plus the upstream conformance fixtures (`query-tests.json`, `function-tests.json`, `function-declaration-tests.yaml`, etc.), 
vendored from [schibsted/jslt](https://github.com/schibsted/jslt) — see `test/resources/SOURCE.md` for the exact upstream commit.

**The conformance suite is the primary correctness contract for this port, not an incidental test.** Every file under `src/` is a line-for-line
`// Port of X.java` translation; "does it pass the upstream fixtures unchanged" is what defines parity with the Java engine, and
that's re-verifiable against future upstream releases by re-syncing `test/resources/`.

All upstream conformance fixtures pass with 0 skips. The YAML fixtures require `js-yaml` (devDependency).

## Parity notes

- **Numeric types**: matches Jackson exactly — `IntNode`/`LongNode`/`BigIntegerNode`/`DoubleNode` with cross-type `equals` (Jackson 2.6+ semantics).
- **`parse-time`/`format-time`**: implemented via `Intl.DateTimeFormat`. Supports Java SimpleDateFormat tokens (`yyyy MM dd HH mm ss S/SS/SSS z Z X`).
   Returns/accepts seconds since Unix epoch (double), same as Java.
- **Experimental module**: `import "http://jslt.schibsted.com/2018/experimental"` works out of the box — provides `group-by`.
- **`FunctionWrapper`**: not ported — in Java it wraps a static `Method` via reflection. In JS, any object with `{getName, getMinArguments,
  getMaxArguments, call}` is already a JSLT function, no wrapper needed.
- **`parse-url`**: implemented via WHATWG URL. Omits `path` when the original URL has no explicit path (matches `java.net.URL.getPath()` returning `""`).
- Deferred from the Java API: `ClasspathResourceResolver`, `FileSystemResourceResolver` (use the `resolver` option instead), and the REPL/playground.

## Ecosystem

JSLT has a small but varied ecosystem, made by several authors, including this port's. Statuses are as of October 2026, so see each project for its current state.

### Implementations

| Project | Language | Notes |
|---|---|---|
| [schibsted/jslt](https://github.com/schibsted/jslt) | Java | The reference implementation and language definition. This port tracks its conformance fixtures. |
| **jslt-js** (this repo) | JavaScript | Pure JavaScript for browsers and Node, no native code; passes the upstream conformance suite. |
| [jslt2](https://github.com/tonysparks/jslt2) | Java | A VM-based implementation, mentioned in the upstream README. |
| [jslt-node](https://www.npmjs.com/package/jslt-node) | Rust, Node bindings | A native N-API addon over a Rust implementation; its README calls it a proof of concept. |

### Tooling and IDE plugins


- **[JSLT demo](http://www.garshol.priv.no/jslt-demo)** ([source](https://github.com/schibsted/jslt/tree/master/playground)): the upstream project's playground, which runs the Java engine on a server
- **[jslt-editor](https://github.com/amkraev697642/jslt-editor)**: an embeddable CodeMirror 6 editor with highlighting, completion, hover docs, formatting and error markers.
- **[jslt-intellij-plugin](https://github.com/fuchsst/jslt-intellij-plugin)**: IntelliJ IDEs; highlighting, navigation, rename, validations and an execution dialog.
- **[jslt-lang](https://marketplace.visualstudio.com/items?itemName=jarno-rajala.jslt-lang)**: syntax highlighting for Visual Studio Code, on the Visual Studio Marketplace.
- **[jslt-language-server](https://github.com/amkraev697642/jslt-language-server)**: LSP server (diagnostics, completion, hover, formatting) for any editor that uses LSP.
- **[jslt-playground](https://github.com/amkraev697642/jslt-playground)** ([open it](https://amkraev697642.github.io/jslt-playground/)): Pure JS implementation, runs in your browser, with tabs for imports, JSON or XML input and output, and shareable links.
- **[jslt.tmbundle](https://github.com/amkraev697642/jslt.tmbundle)**: TextMate; highlighting, symbol list, snippets, "Check Syntax" and "Apply to JSON" actions.
- **[Pygments](https://pygments.org/)**: ships a JSLT lexer for `.jslt` files, for Python and documentation tools.
- **[vscode-jslt](https://github.com/amkraev697642/vscode-jslt)**: Visual Studio Code and forks (Cursor, VSCodium); highlighting, live error checking, completion, hover docs, formatting, snippets and "JSLT: Apply to JSON File…".

### Used with the Java library

Listed in the [upstream README](https://github.com/schibsted/jslt#more-information): the [Apache Camel JSLT component](https://camel.apache.org/components/latest/jslt-component.html), [Apache NiFi](https://nifi.apache.org/) as a processor, [Kafka Connect transforms at Willhaben.at](https://tech.willhaben.at/kafka-connect-custom-single-message-transform-using-jslt-2fc57ae98395), [IBM Cloud Pak for Business Automation](https://www.ibm.com/docs/en/cloud-paks/cp-biz-automation/21.0.x?topic=specification-event-selectors-transformers) and the [Pincette event sourcing framework](https://github.com/json-event-sourcing/pincette-jes).

### Learn more

[A talk on the language design](https://vimeo.com/289470470) ([slides](https://www.slideshare.net/larsga/jslt-json-querying-and-transformation)) and [a paper](https://arxiv.org/abs/1908.10754) describing, among other things, how Schibsted uses JSLT.
