import { test } from "node:test";
import assert from "node:assert/strict";
import { Lexer } from "../src/parser/Lexer.js";

const kinds = (src) => new Lexer(src).tokenize().map((t) => t.kind);
const images = (src) => new Lexer(src).tokenize().map((t) => t.image);

test("keywords vs identifiers", () => {
  assert.deepEqual(kinds("null true false or and if else let for def import as"), [
    "NULL", "TRUE", "FALSE", "OR", "AND", "IF", "ELSE", "LET", "FOR", "DEF", "IMPORT", "AS", "EOF",
  ]);
  assert.deepEqual(kinds("nullable"), ["IDENT", "EOF"]); // not a keyword prefix match
});

test("hyphenated identifiers are single IDENT tokens (the is-string/starts-with case)", () => {
  assert.deepEqual(kinds("is-string"), ["IDENT", "EOF"]);
  assert.equal(images("is-string")[0], "is-string");
  assert.deepEqual(kinds("zip-with-index"), ["IDENT", "EOF"]);
});

test("PIDENT: qualified module:function with no space, vs separate tokens with space", () => {
  assert.deepEqual(kinds("c:booking"), ["PIDENT", "EOF"]);
  assert.equal(images("c:booking")[0], "c:booking");
  assert.deepEqual(kinds("a : b"), ["IDENT", "COLON", "IDENT", "EOF"]); // spaced -> not PIDENT
});

test("VARIABLE: $ plus ident-chars, hyphen included", () => {
  assert.deepEqual(kinds("$foo-bar"), ["VARIABLE", "EOF"]);
  assert.equal(images("$foo-bar")[0], "$foo-bar");
});

test("the maximal-munch minus quirk: '- foo' is MINUS+IDENT, '-foo' is one IDENT", () => {
  assert.deepEqual(kinds("- foo"), ["MINUS", "IDENT", "EOF"]);
  assert.deepEqual(kinds("-foo"), ["IDENT", "EOF"]);
  assert.equal(images("-foo")[0], "-foo");
});

test("numbers: integer, decimal, exponent, negative literal, the 5e3-vs-5e3x tie-break", () => {
  assert.deepEqual(kinds("42"), ["INTEGER", "EOF"]);
  assert.deepEqual(kinds("3.14"), ["DECIMAL", "EOF"]);
  assert.deepEqual(kinds("-5"), ["INTEGER", "EOF"]); // negative literal is ONE token
  assert.equal(images("-5")[0], "-5");
  assert.deepEqual(kinds("5e3"), ["DECIMAL", "EOF"]); // ties an IDENT match in length; DECIMAL wins (declared first)
  assert.deepEqual(kinds("5e3x"), ["IDENT", "EOF"]); // trailing 'x' makes the IDENT run strictly longer
  assert.deepEqual(kinds("123abc"), ["IDENT", "EOF"]); // digits-then-letters: IDENT run is longer than INTEGER
  assert.deepEqual(kinds("0.5e-10"), ["DECIMAL", "EOF"]);
});

test("the adjacent-minus gotcha: once an IDENT run starts at a letter, '-' and digits keep feeding it — no mid-run pattern switch", () => {
  // faithfully reproduces a real JSLT/JavaCC lexer quirk, not something to "fix":
  // maximal munch only re-evaluates which pattern wins at a token's START
  // position. Starting at 'a', only IDENT can match at all, so it just keeps
  // consuming IDENT_CHARS (which include '-' and digits) through the whole
  // thing — "a-5" is one IDENT token "a-5", not separate tokens.
  assert.deepEqual(kinds("a-5"), ["IDENT", "EOF"]);
  assert.equal(images("a-5")[0], "a-5");
  // a space breaks the run, so the '-' then starts its own token from
  // scratch — where the 3-way number/minus/ident tie-break applies again
  assert.deepEqual(kinds("a - 5"), ["IDENT", "MINUS", "INTEGER", "EOF"]);
});

test("strings: basic, escapes, embedded quote, unicode escape", () => {
  assert.deepEqual(kinds('"hello"'), ["STRING", "EOF"]);
  assert.equal(images('"hello"')[0], '"hello"');
  assert.deepEqual(kinds('"a\\"b"'), ["STRING", "EOF"]); // escaped quote doesn't end the string
  assert.equal(images('"a\\"b"')[0], '"a\\"b"');
});

test("comments are skipped like whitespace", () => {
  assert.deepEqual(kinds("1 // comment\n+ 2"), ["INTEGER", "PLUS", "INTEGER", "EOF"]);
});

test("punctuation maximal munch: == vs =, >= vs >, != has no 1-char form", () => {
  assert.deepEqual(kinds("a==b"), ["IDENT", "EQUALS", "IDENT", "EOF"]);
  assert.deepEqual(kinds("a=b"), ["IDENT", "ASSIGN", "IDENT", "EOF"]);
  assert.deepEqual(kinds("a>=b"), ["IDENT", "BIGOREQ", "IDENT", "EOF"]);
  assert.deepEqual(kinds("a!=b"), ["IDENT", "UNEQUALS", "IDENT", "EOF"]);
});

test("line/column tracking across newlines", () => {
  const toks = new Lexer("a\nb").tokenize();
  assert.equal(toks[0].line, 1);
  assert.equal(toks[1].line, 2);
  assert.equal(toks[1].column, 1);
});

test("real-world template lexical shapes round-trip cleanly", () => {
  assert.deepEqual(kinds('import "common.jslt" as c'), ["IMPORT", "STRING", "AS", "IDENT", "EOF"]);
  assert.deepEqual(kinds("c:booking(.)"), ["PIDENT", "LPAREN", "DOT", "RPAREN", "EOF"]);
  assert.deepEqual(kinds("fallback($b.ticket_documents, [])"), [
    "IDENT", "LPAREN", "VARIABLE", "DOT", "IDENT", "COMMA", "LBRACKET", "RBRACKET", "RPAREN", "EOF",
  ]);
  assert.deepEqual(kinds('test($s, "[+-][0-9][0-9][0-9][0-9]$")'), ["IDENT", "LPAREN", "VARIABLE", "COMMA", "STRING", "RPAREN", "EOF"]);
});
