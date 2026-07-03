// Hand-written lexer transcribed from core/src/main/jjtree/jslt.jjt's TOKEN
// block. JavaCC tokenizes by maximal munch: at each position, every token
// pattern is tried and whichever consumes the most characters wins; ties go
// to whichever pattern is declared first in the .jjt file. That tie-breaking
// is not cosmetic — it's why `is-string`/`starts-with` are single identifiers
// (IDENT_CHARS includes "-"), why `-foo` lexes as ONE identifier token rather
// than MINUS + foo, and why `5e3` lexes as a DECIMAL rather than an identifier
// (replicated below via explicit length comparisons, not a fixed try-order).

import { JsltException } from "../JsltException.js";
import { Location } from "../impl/Location.js";

const KEYWORDS = new Map([
  ["null", "NULL"], ["true", "TRUE"], ["false", "FALSE"],
  ["or", "OR"], ["and", "AND"], ["if", "IF"], ["else", "ELSE"],
  ["let", "LET"], ["for", "FOR"], ["def", "DEF"], ["import", "IMPORT"], ["as", "AS"],
]);

// IDENT_CHARS: ["A"-"Z","a"-"z","0"-"9","_","-",""-"￿"]
function isIdentChar(ch) {
  if (ch === undefined) return false;
  const c = ch.charCodeAt(0);
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")
    || ch === "_" || ch === "-" || c >= 0x80;
}

function isDigit(ch) { return ch >= "0" && ch <= "9"; }

const PUNCTUATION = [
  // longest-first within equal starting char, so maximal munch falls out of
  // simple linear scan (==, != etc. must be tried before their 1-char prefixes)
  ["==", "EQUALS"], ["!=", "UNEQUALS"], [">=", "BIGOREQ"], ["<=", "SMALLOREQ"],
  ["[", "LBRACKET"], ["]", "RBRACKET"], [",", "COMMA"], [":", "COLON"],
  ["{", "LCURLY"], ["}", "RCURLY"], ["(", "LPAREN"], [")", "RPAREN"],
  ["=", "ASSIGN"], [">", "BIGGER"], ["<", "SMALLER"],
  ["+", "PLUS"], ["*", "STAR"], ["/", "SLASH"], ["|", "PIPE"],
];

export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
  }

  error(message) {
    throw new JsltException(`Parse error: ${message}`, new Location(null, this.line, this.column));
  }

  // advance past `count` characters, tracking line/column
  advance(count) {
    for (let i = 0; i < count; i++) {
      if (this.source[this.pos] === "\n") { this.line++; this.column = 1; } else { this.column++; }
      this.pos++;
    }
  }

  skipWhitespaceAndComments() {
    for (;;) {
      const ch = this.source[this.pos];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f") {
        this.advance(1);
      } else if (ch === "/" && this.source[this.pos + 1] === "/") {
        while (this.pos < this.source.length && this.source[this.pos] !== "\n") this.advance(1);
      } else {
        return;
      }
    }
  }

  // Maximal-munch length of a NUMBER token (INTEGER or DECIMAL) starting at
  // `pos`. Returns { length, kind } or null if no number matches here.
  matchNumber(pos) {
    const s = this.source;
    let p = pos;
    if (s[p] === "-") p++;
    const intStart = p;
    if (s[p] === "0") { p++; } else if (isDigit(s[p])) { while (isDigit(s[p])) p++; } else { return null; }
    if (p === intStart) return null;

    let kind = "INTEGER";
    let end = p;

    // optional ".digits"
    let fracEnd = -1;
    if (s[p] === "." && isDigit(s[p + 1])) {
      let q = p + 1;
      while (isDigit(s[q])) q++;
      fracEnd = q;
    }

    // optional exponent, which may follow either the int part or the frac part
    const tryExponent = (from) => {
      if ((s[from] === "e" || s[from] === "E")) {
        let q = from + 1;
        if (s[q] === "+" || s[q] === "-") q++;
        const expDigitsStart = q;
        while (isDigit(s[q])) q++;
        if (q > expDigitsStart) return q;
      }
      return -1;
    };

    if (fracEnd !== -1) {
      const expEnd = tryExponent(fracEnd);
      end = expEnd !== -1 ? expEnd : fracEnd;
      kind = "DECIMAL";
    } else {
      const expEnd = tryExponent(p);
      if (expEnd !== -1) { end = expEnd; kind = "DECIMAL"; }
    }

    return { length: end - pos, kind };
  }

  matchIdentRun(pos) {
    let p = pos;
    while (isIdentChar(this.source[p])) p++;
    return p - pos;
  }

  nextToken() {
    this.skipWhitespaceAndComments();
    const startLine = this.line;
    const startColumn = this.column;
    const pos = this.pos;
    const s = this.source;

    if (pos >= s.length) return this.make("EOF", "", startLine, startColumn);

    const ch = s[pos];

    if (ch === '"') return this.readString(startLine, startColumn);

    if (ch === "$") {
      const nameLen = this.matchIdentRun(pos + 1);
      if (nameLen === 0) this.error("'$' must be followed by an identifier");
      this.advance(1 + nameLen);
      return this.make("VARIABLE", s.slice(pos, pos + 1 + nameLen), startLine, startColumn);
    }

    // '-' is both its own MINUS token AND a valid IDENT_CHAR, and digits are
    // valid IDENT_CHARs too — so at a '-' or digit, three patterns can all
    // match here: NUMBER, MINUS (only when ch is '-'), IDENT. Maximal munch:
    // longest match wins; ties go to whichever is declared first in the .jjt
    // (NUMBER, then MINUS, then IDENT) — that declaration order is exactly
    // why "-5" is one INTEGER token, "- foo" is MINUS+IDENT (both length-1
    // candidates tie, MINUS declared first), and "-foo" is one IDENT token
    // (length 4 beats MINUS's length 1 outright).
    if (ch === "-" || isDigit(ch)) {
      const num = this.matchNumber(pos);
      const identLen = this.matchIdentRun(pos);
      const candidates = [{ length: identLen, rank: 2 }];
      if (num != null) candidates.push({ length: num.length, rank: 0 });
      if (ch === "-") candidates.push({ length: 1, rank: 1 });
      candidates.sort((a, b) => (b.length - a.length) || (a.rank - b.rank));
      const winner = candidates[0];

      if (winner.rank === 0) {
        this.advance(num.length);
        return this.make(num.kind, s.slice(pos, pos + num.length), startLine, startColumn);
      }
      if (winner.rank === 1) {
        this.advance(1);
        return this.make("MINUS", "-", startLine, startColumn);
      }
      return this.identOrPident(pos, identLen, startLine, startColumn);
    }

    if (isIdentChar(ch)) {
      return this.identOrPident(pos, this.matchIdentRun(pos), startLine, startColumn);
    }

    if (ch === ".") {
      this.advance(1);
      return this.make("DOT", ".", startLine, startColumn);
    }

    for (const [text, kind] of PUNCTUATION) {
      if (s.startsWith(text, pos)) {
        this.advance(text.length);
        return this.make(kind, text, startLine, startColumn);
      }
    }

    this.error(`Lexical error at line ${startLine}, column ${startColumn}. Unexpected character: '${ch}'`);
    return undefined; // unreachable, error() throws
  }

  // PIDENT: IDENT_CHARS+ ":" IDENT_CHARS+, immediately adjacent (no space) —
  // strictly longer than IDENT alone whenever the shape is present, so it
  // always wins maximal munch in that case; otherwise just IDENT (keyword-
  // checked, since e.g. "null"/"true" lex this way too).
  identOrPident(pos, identLen, startLine, startColumn) {
    const s = this.source;
    if (s[pos + identLen] === ":" && isIdentChar(s[pos + identLen + 1])) {
      const secondLen = this.matchIdentRun(pos + identLen + 1);
      const total = identLen + 1 + secondLen;
      this.advance(total);
      return this.make("PIDENT", s.slice(pos, pos + total), startLine, startColumn);
    }
    this.advance(identLen);
    const image = s.slice(pos, pos + identLen);
    const keyword = KEYWORDS.get(image);
    return this.make(keyword ?? "IDENT", image, startLine, startColumn);
  }

  make(kind, image, line, column) {
    return { kind, image, line, column };
  }

  readString(startLine, startColumn) {
    const s = this.source;
    let p = this.pos + 1; // skip opening quote
    for (;;) {
      if (p >= s.length) this.error("Unterminated string literal");
      const ch = s[p];
      if (ch === '"') { p++; break; }
      if (ch === "\\") {
        if (p + 1 >= s.length) this.error("Unterminated string literal");
        p += 2; // backslash + escaped char, whatever it is — matches the jjt
        // grammar's `"\\" ~[]` (any single character may follow a backslash)
        continue;
      }
      p++;
    }
    const length = p - this.pos;
    const image = s.slice(this.pos, p);
    this.advance(length);
    return this.make("STRING", image, startLine, startColumn);
  }

  // Tokenizes the whole source up front (JSLT sources are small) and returns
  // an array of tokens including the trailing EOF.
  tokenize() {
    const tokens = [];
    for (;;) {
      const tok = this.nextToken();
      tokens.push(tok);
      if (tok.kind === "EOF") break;
    }
    return tokens;
  }
}
