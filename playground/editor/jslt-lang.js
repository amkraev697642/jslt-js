import { StreamLanguage } from "@codemirror/language";

export const BUILTINS = new Set(
  `contains size error min max is-number is-integer is-decimal number round floor ceiling random sum mod
hash-int is-string string test capture split join lowercase uppercase sha256-hex starts-with ends-with
from-json to-json replace trim uuid not boolean is-boolean is-object get-key array is-array flatten all any
zip zip-with-index index-of now parse-time format-time parse-url fallback`.split(/\s+/),
);
const KEYWORDS = new Set(["let", "def", "if", "else", "for", "import", "as", "and", "or"]);
const ATOMS = new Set(["true", "false", "null"]);

export const jsltLanguage = StreamLanguage.define({
  token(s) {
    if (s.eatSpace()) return null;
    if (s.match("//")) { s.skipToEnd(); return "comment"; }
    if (s.eat('"')) {
      for (let c; (c = s.next()) != null; ) {
        if (c === "\\") s.next();
        else if (c === '"') break;
      }
      return s.match(/^\s*:/, false) ? "propertyName" : "string";
    }
    if (s.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)) return "number";
    if (s.match(/^\$[A-Za-z_][\w-]*/)) return "variableName.special";
    if (s.match(/^[A-Za-z_][\w-]*/)) {
      const w = s.current();
      if (KEYWORDS.has(w)) return "keyword";
      if (ATOMS.has(w)) return "atom";
      if (s.match(/^\s*\(/, false)) return BUILTINS.has(w) ? "variableName.standard" : "variableName.function";
      return "variableName";
    }
    if (s.match(/^[{}[\]()]/)) return "bracket";
    s.next();
    return "operator";
  },
  languageData: { commentTokens: { line: "//" }, closeBrackets: { brackets: ["(", "[", "{", '"'] } },
});
