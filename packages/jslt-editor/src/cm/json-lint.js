import { syntaxTree } from "@codemirror/language";

// V8's JSON.parse messages carry no position, so squiggle the parser's own error nodes instead.
// Use with @codemirror/lint: linter(jsonSyntaxErrors)
export const jsonSyntaxErrors = (view) => {
  const out = [];
  syntaxTree(view.state).iterate({
    enter: (n) => {
      if (n.type.isError) out.push({ from: n.from, to: Math.max(n.to, n.from + 1), severity: "error", message: "JSON syntax error" });
    },
  });
  return out;
};
