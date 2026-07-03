#!/usr/bin/env node
// Compare jslt-js against optional peer jslt-node (Rust N-API addon).
// Conformance: upstream Schibsted fixtures in test/resources.
// Throughput: repeated apply on a fixed query/input.

import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "js-yaml";
import { compile, readTree, fromJS } from "../src/index.js";
import { NullNode } from "../src/json/JsonNode.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const RESOURCES = join(here, "..", "test", "resources");

const THROUGHPUT_ITERATIONS = 3000;
const THROUGHPUT_QUERY = `{ "count": size(.items), "names": [for (.items) .name] }`;
const THROUGHPUT_INPUT = {
  items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `n${i}` })),
};

function fixture(name) {
  return JSON.parse(readFileSync(join(RESOURCES, name), "utf8"));
}

function loadSuites() {
  const suites = [
    ["query", fixture("query-tests.json").tests, false, {}],
    ["fn", fixture("function-tests.json").tests, false, {}],
    ["experimental", fixture("experimental-tests.json").tests, false, {}],
    ["query-error", fixture("query-error-tests.json").tests, true, {}],
    ["fn-error", fixture("function-error-tests.json").tests, true, {}],
  ];
  suites.push([
    "yaml-query",
    yamlLoad(readFileSync(join(RESOURCES, "query-tests.yaml"), "utf8")).tests,
    false,
    {},
  ]);
  return suites;
}

function inputStr(t) {
  if (t.input == null || t.input === "") return "";
  return typeof t.input === "string" ? t.input : JSON.stringify(t.input);
}

function outputStr(t) {
  return typeof t.output === "string" ? t.output : JSON.stringify(t.output);
}

function parseExpectedJslt(output) {
  return compile(output, "<expected>").applyInput(NullNode.instance);
}

const jsltJs = {
  name: "jslt-js",
  runSuccess(query, input, variables, opts = {}) {
    const nodeInput = (input == null || input.trim() === "")
      ? NullNode.instance
      : readTree(input);
    const expr = compile(query, "<conformance>", opts);
    if (variables && Object.keys(variables).length > 0) {
      const vars = {};
      for (const [k, v] of Object.entries(variables)) vars[k] = fromJS(v);
      return expr.applyVariables(vars, nodeInput);
    }
    return expr.applyInput(nodeInput);
  },
  runError(query, input, variables, opts = {}) {
    jsltJs.runSuccess(query, input, variables, opts);
  },
  compare(actual, expectedOutput) {
    const expected = parseExpectedJslt(expectedOutput);
    return actual.equals(expected);
  },
};

function loadJsltNode() {
  try {
    const native = require("jslt-node");
    const impl = {
      name: "jslt-node",
      runSuccess(query, input, variables) {
        if (variables && Object.keys(variables).length > 0) {
          throw new Error("variables not supported");
        }
        const parsed = (input == null || input.trim() === "")
          ? null
          : JSON.parse(input);
        return native.transform(query, parsed);
      },
      runError(query, input, variables) {
        impl.runSuccess(query, input, variables);
      },
      compare(actual, expectedOutput) {
        const expectedExpr = native.compile(expectedOutput);
        const expected = native.transform(expectedExpr, null);
        return stableJson(actual) === stableJson(expected);
      },
    };
    return impl;
  } catch {
    return null;
  }
}

const jsltNodeImpl = loadJsltNode();

function stableJson(value) {
  return JSON.stringify(value, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
}

function runConformance(runner) {
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const [label, tests, isError, opts] of loadSuites()) {
    for (const t of tests) {
      const query = (t.query ?? "").trim();
      const title = `${label}: ${query.slice(0, 70)}`;
      try {
        if (isError) {
          try {
            runner.runError(query, inputStr(t), t.variables, opts);
            fail++;
            if (failures.length < 5) failures.push({ title, reason: "expected throw" });
          } catch (err) {
            const msg = String(err?.message ?? err);
            if (msg.includes(t.error)) {
              pass++;
            } else {
              fail++;
              if (failures.length < 5) {
                failures.push({ title, reason: `wrong error: ${msg.slice(0, 120)}` });
              }
            }
          }
        } else {
          const actual = runner.runSuccess(query, inputStr(t), t.variables, opts);
          if (runner.compare(actual, outputStr(t))) {
            pass++;
          } else {
            fail++;
            if (failures.length < 5) {
              failures.push({ title, reason: "output mismatch" });
            }
          }
        }
      } catch (err) {
        fail++;
        if (failures.length < 5) {
          failures.push({ title, reason: String(err?.message ?? err).slice(0, 120) });
        }
      }
    }
  }

  return { pass, fail, total: pass + fail, failures };
}

function benchJsltJs() {
  const inputStrJson = JSON.stringify(THROUGHPUT_INPUT);
  const expr = compile(THROUGHPUT_QUERY, "benchmark");
  const start = performance.now();
  for (let i = 0; i < THROUGHPUT_ITERATIONS; i++) {
    expr.applyInput(readTree(inputStrJson));
  }
  return performance.now() - start;
}

function benchJsltNode() {
  const native = require("jslt-node");
  const schema = native.compile(THROUGHPUT_QUERY);
  const start = performance.now();
  for (let i = 0; i < THROUGHPUT_ITERATIONS; i++) {
    native.transform(schema, THROUGHPUT_INPUT);
  }
  return performance.now() - start;
}

function printResult(label, result) {
  const pct = result.total ? ((result.pass / result.total) * 100).toFixed(1) : "0.0";
  console.log(`${label}: ${result.pass}/${result.total} pass (${pct}%)`);
  if (result.failures.length) {
    console.log("  sample failures:");
    for (const f of result.failures) {
      console.log(`    - ${f.title}`);
      console.log(`      ${f.reason}`);
    }
  }
}

console.log("JSLT benchmark\n");

console.log("=== Conformance (upstream Schibsted fixtures) ===");
printResult("jslt-js", runConformance(jsltJs));

if (jsltNodeImpl) {
  printResult("jslt-node", runConformance(jsltNodeImpl));
} else {
  console.log("jslt-node: skipped (install with: npm install --save-dev jslt-node)");
}

console.log("\n=== Throughput ===");
console.log(`query: ${THROUGHPUT_QUERY}`);
console.log(`iterations: ${THROUGHPUT_ITERATIONS}, input: 200-item array`);

const jsMs = benchJsltJs();
console.log(`jslt-js:    ${jsMs.toFixed(1)} ms`);

if (jsltNodeImpl) {
  const nodeMs = benchJsltNode();
  const ratio = jsMs / nodeMs;
  console.log(`jslt-node:  ${nodeMs.toFixed(1)} ms`);
  console.log(`ratio:      ${ratio.toFixed(2)}x (jslt-js / jslt-node)`);
} else {
  console.log("jslt-node:  skipped");
}

console.log("\nNote: full test suite (698 tests) also covers lexer/parser/unit tests — run: npm test");
