# jslt-editor

An embeddable editor for [JSLT](https://github.com/schibsted/jslt), the JSON query and transformation language:

- syntax highlighting
- completion for the built-in functions and your own `let` / `def` / imported functions
- hover docs
- formatting
- error markers for [`jslt-js`](https://www.npmjs.com/package/jslt-js) exceptions

It is built on [CodeMirror 6](https://codemirror.net/), which is included, so there is nothing else to install. Try it in the
[playground](https://amkraev697642.github.io/jslt-js/playground/).

## Use it

```js
import { createEditor } from "jslt-editor";

const editor = createEditor({
  parent: document.getElementById("editor"),
  language: "jslt",            // "jslt" | "json" | "xml" | "text"
  doc: '{ "name": uppercase(.name) }',
  onChange: (text) => console.log(text),
});

editor.setErrors(someJsltException);   // underlines the token at its line/column
editor.format();
```

Without a bundler, one script tag (pin the version and add an `integrity` hash when loading from a CDN):

```html
<script src="https://cdn.jsdelivr.net/npm/jslt-editor@0.1.0/dist/jslt-editor.standalone.js"></script>
<script>
  JsltEditor.createEditor({ parent: document.body, language: "jslt", doc: ".a" });
</script>
```

`createEditor` returns `{ view, getText, setText, setLanguage, setReadOnly, setDark, setErrors, setMarks, format, reveal,
scrollTo, rangeAt, getSelection, newState / setState (one editor, many documents) , focus, destroy }`.
`getFiles: () => Map(name -> text)` lets completion see `import "name" as alias` files.

## Entry points

| Import | What it is |
|---|---|
| `jslt-editor` | The ready-made editor above (ESM, CodeMirror bundled in). |
| `jslt-editor/standalone` | The same editor as one script that sets `JsltEditor`. |
| `jslt-editor/codemirror` | Only the CodeMirror extensions (`jsltLanguage`, `jsltHighlight`, `jsltAssist`, `toDiagnostic`, `jsonSyntaxErrors`) for apps that already use CodeMirror; `@codemirror/language`, `@codemirror/view` and `@lezer/highlight` are peer dependencies. |
| `jslt-editor/core` | Framework-free logic (function docs, `scan`, `candidates`, `wordInfo`, `formatJslt`, `tokenRange`), usable in Node. |

```js
import { EditorView, basicSetup } from "codemirror";
import { jsltLanguage, jsltHighlight, jsltAssist } from "jslt-editor/codemirror";

new EditorView({
  parent: document.body,
  extensions: [basicSetup, jsltLanguage, jsltHighlight, jsltAssist(() => ({ files: new Map() }))],
});
```

Token colours are CSS classes (`tok-c tok-s tok-key tok-n tok-kw tok-v tok-f tok-b tok-a`); style them with your own variables.

## License

Apache-2.0
