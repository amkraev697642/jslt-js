// Conformance suite: runs the upstream JSLT test fixtures from
// core/src/test/resources against the JS port.
// Mirrors what QueryTest.java does: compile query, apply to input,
// compare actual JsonNode against expected JsonNode using equals().

import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "js-yaml";
import { compile } from "../src/index.js";
import { readTree, fromJS, toJS } from "../src/index.js";
import { NullNode } from "../src/json/JsonNode.js";

// Parse expected output through JSLT's own parser so numeric types are
// preserved correctly ("4.0" → DoubleNode, "40" → IntNode, etc.),
// mirroring what Jackson's readTree does in the Java test runner.
function parseExpected(output) {
  return compile(output, "<expected>").applyInput(NullNode.instance);
}

// Vendored from upstream schibsted/jslt — see test/resources/SOURCE.md for
// provenance (commit, why these are the primary correctness contract for
// this port).
const RESOURCES = fileURLToPath(new URL("./resources", import.meta.url));
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_FS = join(RESOURCES, "import-from-fs");

// Mirrors FileSystemResourceResolver: new File(rootPath, importPath).
// Maps upstream src/test/resources/ paths to this repo's test/resources/.
function fileSystemResolver(rootDir = null) {
  return {
    resolve(name) {
      let path = join(rootDir ?? REPO_ROOT, name);
      if (!existsSync(path)) {
        const mapped = path.replace(
          /[/\\]src[/\\]test[/\\]resources[/\\]/,
          "/test/resources/"
        );
        if (mapped !== path && existsSync(mapped)) path = mapped;
      }
      return readFileSync(path, "utf8");
    },
  };
}

function fixture(name) {
  return JSON.parse(readFileSync(`${RESOURCES}/${name}`, "utf8"));
}

function shouldSkip(_query) {
  return false; // all features implemented
}

// ── helpers ──────────────────────────────────────────────────────────────────

function applyQuery(query, inputStr, variables, opts = {}) {
  // Jackson returns null for empty/whitespace-only input
  const input = (inputStr == null || inputStr.trim() === "") ? NullNode.instance : readTree(inputStr);
  const expr = compile(query, "<conformance>", opts);
  if (variables && Object.keys(variables).length > 0) {
    // Scope.makeScope expects a plain object (Object.keys iterates it)
    const vars = {};
    for (const [k, v] of Object.entries(variables)) vars[k] = fromJS(v);
    return expr.applyVariables(vars, input);
  }
  return expr.applyInput(input);
}

function registerSuite(label, tests, isError, opts = {}) {
  const toExpected = opts.toExpected ?? parseExpected;
  for (const t of tests) {
    const query = t.query ?? "";
    const title = `${label}: ${query.trim().slice(0, 70)}`;

    if (shouldSkip(query)) {
      skip(title);
      continue;
    }

    if (isError) {
      test(title, () => {
        assert.throws(
          () => applyQuery(query, t.input, t.variables),
          (err) => {
            assert.ok(
              err.message?.includes(t.error),
              `expected error to include "${t.error}", got: ${err.message}`
            );
            return true;
          }
        );
      });
    } else {
      test(title, () => {
        const actual = applyQuery(query, t.input, t.variables);
        const expected = toExpected(t.output);
        assert.ok(
          actual.equals(expected),
          `expected ${expected} got ${actual}`
        );
      });
    }
  }
}

// ── query-tests.json ─────────────────────────────────────────────────────────
registerSuite("query", fixture("query-tests.json").tests, false);

// ── function-tests.json ──────────────────────────────────────────────────────
registerSuite("fn", fixture("function-tests.json").tests, false);

// ── experimental-tests.json ──────────────────────────────────────────────────
// Upstream QueryTest uses Jackson readTree for expected output (pure JSON fixtures).
registerSuite("experimental", fixture("experimental-tests.json").tests, false, {
  toExpected: (output) => readTree(output),
});

// ── query-error-tests.json ───────────────────────────────────────────────────
registerSuite("query-error", fixture("query-error-tests.json").tests, true);

// ── function-error-tests.json ────────────────────────────────────────────────
registerSuite("fn-error", fixture("function-error-tests.json").tests, true);

// ── json-parse-tests.json ────────────────────────────────────────────────────
// Verifies our JSON parser round-trips to the same value as JSON.parse.
{
  const cases = JSON.parse(
    readFileSync(`${RESOURCES}/json-parse-tests.json`, "utf8")
  ).tests;
  for (const s of cases) {
    test(`json-parse: ${s.slice(0, 60)}`, () => {
      const actual = toJS(readTree(s));
      const expected = JSON.parse(s);
      assert.deepEqual(actual, expected);
    });
  }
}

// ── json-parse-error-tests.json ──────────────────────────────────────────────
{
  const cases = JSON.parse(
    readFileSync(`${RESOURCES}/json-parse-error-tests.json`, "utf8")
  ).tests;
  for (const s of cases) {
    test(`json-parse-error: ${s.slice(0, 60)}`, () => {
      assert.throws(() => readTree(s));
    });
  }
}

// ── YAML fixtures ─────────────────────────────────────────────────────────────
// js-yaml parses input/output to plain JS values; normalize back to JSON strings
// so the same applyQuery/parseExpected helpers work unchanged.
function registerYamlSuite(label, tests, opts = {}) {
  for (const t of tests) {
    const query = (t.query ?? "").trim();
    const title = `${label}: ${query.slice(0, 70)}`;
    if (shouldSkip(query)) { skip(title); continue; }

    const inputStr = t.input == null || t.input === ""
      ? ""
      : typeof t.input === "string" ? t.input : JSON.stringify(t.input);

    if ("error" in t) {
      test(title, () => {
        assert.throws(
          () => applyQuery(query, inputStr, undefined, opts),
          (err) => {
            assert.ok(err.message?.includes(t.error),
              `expected error "${t.error}", got: ${err.message}`);
            return true;
          }
        );
      });
    } else {
      const outputStr = typeof t.output === "string"
        ? t.output
        : JSON.stringify(t.output);
      test(title, () => {
        const actual = applyQuery(query, inputStr, undefined, opts);
        const expected = parseExpected(outputStr);
        assert.ok(actual.equals(expected), `expected ${expected} got ${actual}`);
      });
    }
  }
}

registerYamlSuite("yaml-query", yamlLoad(
  readFileSync(`${RESOURCES}/query-tests.yaml`, "utf8")
).tests);

// fn-decl tests import modules from the RESOURCES dir by relative name
const fsOpts = { resolver: { resolve: (name) => readFileSync(`${RESOURCES}/${name}`, "utf8") } };
registerYamlSuite("yaml-fn-decl", yamlLoad(
  readFileSync(`${RESOURCES}/function-declaration-tests.yaml`, "utf8")
).tests, fsOpts);

// ── import-from-fs/ ─────────────────────────────────────────────────────────
// Mirrors FileSystemResourceResolverTest.java.
test("import-from-fs: working1 resolves imports from filesystem", () => {
  const source = readFileSync(join(IMPORT_FS, "working1.jslt"), "utf8");
  const expr = compile(source, join(IMPORT_FS, "working1.jslt"), {
    resolver: fileSystemResolver(),
  });
  const actual = expr.applyInput(NullNode.instance);
  const expected = readTree(
    readFileSync(join(IMPORT_FS, "working1_expected_result.json"), "utf8")
  );
  assert.ok(actual.equals(expected), `expected ${expected} got ${actual}`);
});

test("import-from-fs: working2 resolves with explicit root path", () => {
  const source = readFileSync(join(IMPORT_FS, "working2.jslt"), "utf8");
  const expr = compile(source, join(IMPORT_FS, "working2.jslt"), {
    resolver: fileSystemResolver(IMPORT_FS),
  });
  const actual = expr.applyInput(NullNode.instance);
  const expected = readTree(
    readFileSync(join(IMPORT_FS, "working1_expected_result.json"), "utf8")
  );
  assert.ok(actual.equals(expected), `expected ${expected} got ${actual}`);
});

test("import-from-fs: wrong relative import path throws", () => {
  const source = readFileSync(join(IMPORT_FS, "wrong_relative_path.jslt"), "utf8");
  assert.throws(
    () => compile(source, join(IMPORT_FS, "wrong_relative_path.jslt"), {
      resolver: fileSystemResolver(),
    }),
    (err) => {
      assert.match(String(err.message ?? err), /ENOENT|no such file|Could not resolve/i);
      return true;
    }
  );
});

test("import-from-fs: character-encoding resolves non-ASCII module text", () => {
  const source = readFileSync(join(RESOURCES, "character-encoding-master.jslt"), "utf8");
  const expr = compile(source, join(RESOURCES, "character-encoding-master.jslt"), {
    resolver: fileSystemResolver(RESOURCES),
  });
  const actual = expr.applyInput(NullNode.instance);
  assert.ok(actual.isTextual(), `expected string, got ${actual}`);
  assert.equal(actual.asText(), "Hei på deg");
});
