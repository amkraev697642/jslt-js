import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { FUNCTION_DOCS, KEYWORDS as KEYWORD_LIST, CONSTANTS } from "../core/docs.js";

// Function names, keywords and constants come from core/docs.js: one list for highlighting, completion and hover.
export const BUILTINS = new Set(Object.keys(FUNCTION_DOCS));
const KEYWORDS = new Set(KEYWORD_LIST);
const ATOMS = new Set(CONSTANTS);

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

// Token colours come from CSS variables (--hl-*, set per theme in app.css), so light and dark both work.
export const jsltHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.comment, class: "tok-c" },
  { tag: t.string, class: "tok-s" },
  { tag: t.propertyName, class: "tok-key" },
  { tag: t.number, class: "tok-n" },
  { tag: t.keyword, class: "tok-kw" },
  { tag: t.atom, class: "tok-a" },
  { tag: t.special(t.variableName), class: "tok-v" },
  { tag: t.function(t.variableName), class: "tok-f" },
  { tag: t.standard(t.variableName), class: "tok-b" },
]));
