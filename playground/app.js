import { basicSetup, EditorView } from "codemirror";
import { Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { linter, setDiagnostics } from "@codemirror/lint";
import { compile, fromJS, toJS } from "jslt-js";
import { jsltLanguage, jsltHighlight, jsltAssist, toDiagnostic, jsonSyntaxErrors } from "jslt-editor/codemirror";
import { formatJslt } from "jslt-editor/core";
import { examples } from "./examples.js";

const $ = (id) => document.getElementById(id);
const pretty = (v) => JSON.stringify(v, null, 2);
const setText = (view, text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });

const b64 = {
  async enc(obj) {
    const gz = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  async dec(str) {
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const gz = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(gz).text());
  },
};

const theme = new Compartment();
const root = document.documentElement;
const isDark = () => root.dataset.theme === "dark";
const themeExt = () => theme.of(isDark() ? oneDark : []);

// files[0] is the main program; the others are importable by name. files[active] is what the JSLT editor shows.
let files = [{ name: "main.jslt", text: "" }], active = 0, errFile = null;
const ctx = () => ({ files: new Map(files.map((f) => [f.name, f.text])) });

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
const editable = [basicSetup, themeExt(), EditorView.updateListener.of((u) => {
  if (!u.docChanged) return;
  if (u.view === jslt) files[active].text = u.state.doc.toString();
  schedule(); save();
})];

const format = () => {
  const text = jslt.state.doc.toString(), out = formatJslt(text);
  if (out !== text) setText(jslt, out);
  return true;
};

const input = new EditorView({ parent: $("input"), extensions: [editable, json(), linter(jsonSyntaxErrors)] });
const jslt = new EditorView({ parent: $("jslt"), extensions: [editable, jsltLanguage, jsltHighlight, jsltAssist(ctx), keymap.of([{ key: "Shift-Alt-f", run: format }])] });
const output = new EditorView({ parent: $("output"), extensions: [basicSetup, themeExt(), json(), EditorView.editable.of(false)] });

$("theme").onclick = () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("jslt-theme", root.dataset.theme); } catch {}
  [input, jslt, output].forEach((v) => v.dispatch({ effects: theme.reconfigure(isDark() ? oneDark : []) }));
};

function status(msg, ok) { $("status").textContent = msg; $("status").className = ok ? "ok" : ""; }

function renderTabs() {
  const bar = $("tabs");
  bar.replaceChildren(...files.map((f, i) => {
    const t = document.createElement("button");
    t.className = "tab" + (i === active ? " active" : "") + (f.name === errFile ? " err" : "");
    t.textContent = f.name;
    t.title = i ? `import "${f.name}" as name` : "main program";
    t.onclick = () => switchTo(i);
    if (i) {
      const x = document.createElement("span");
      x.className = "x"; x.textContent = "×"; x.title = "Remove file";
      x.onclick = (e) => { e.stopPropagation(); files.splice(i, 1); switchTo(Math.min(active, files.length - 1), true); };
      t.append(x);
    }
    return t;
  }), Object.assign(document.createElement("button"), { className: "tab add", textContent: "+", title: "Add a file to import", onclick: addFile }));
}

function switchTo(i, force) {
  if (i !== active || force) { active = i; setText(jslt, files[i].text); }
  renderTabs(); run();
}

function addFile() {
  const name = (prompt('File name, imported as: import "name" as alias', "lib.jslt") || "").trim();
  if (!name || files.some((f) => f.name === name)) return;
  files.push({ name, text: "// def helper(x) $x\n" });
  switchTo(files.length - 1);
}

function run() {
  jslt.dispatch(setDiagnostics(jslt.state, []));
  errFile = null;
  let data;
  try { data = fromJS(JSON.parse(input.state.doc.toString())); }
  catch (e) { renderTabs(); return fail("Input JSON: " + e.message); }
  const byName = ctx().files;
  const resolver = { resolve(name) {
    if (!byName.has(name)) throw new Error(`no such file: ${name} (add a tab with that name)`);
    return byName.get(name);
  } };
  const t0 = performance.now();
  try {
    const result = compile(files[0].text, files[0].name, { resolver }).applyInput(data);
    setText(output, pretty(toJS(result)));
    status(`ok · ${(performance.now() - t0).toFixed(1)} ms`, true);
  } catch (e) {
    const src = e.getSource ? e.getSource() : null;
    errFile = files.some((f) => f.name === src) ? src : files[0].name;
    if (e.getLine && files[active].name === errFile) jslt.dispatch(setDiagnostics(jslt.state, [toDiagnostic(e, jslt.state.doc)]));
    fail(e.message);
  }
  renderTabs();
}
function fail(msg) { setText(output, ""); status(msg); }

const snapshot = () => ({ i: input.state.doc.toString(), f: files.map((f) => ({ n: f.name, t: f.text })) });
function save() {
  try { localStorage.setItem("jslt-playground", JSON.stringify(snapshot())); } catch {}
}
// st: {i: input text, f: [{n, t}]}; the first version stored {i, j} (one program, no files).
function load(st) {
  files = (st.f || [{ n: "main.jslt", t: st.j }]).map((f) => ({ name: f.n, text: f.t }));
  active = 0;
  setText(input, st.i);
  setText(jslt, files[0].text);
  renderTabs();
  run();
}
const fromExample = (x) => ({ i: pretty(x.input), f: [{ n: "main.jslt", t: x.jslt }, ...(x.files || []).map((f) => ({ n: f.name, t: f.text }))] });

$("examples").append(...examples.map((e, n) => new Option(e.name, n)));
$("examples").onchange = (e) => load(fromExample(examples[e.target.value]));
$("format").onclick = format;

$("share").onclick = async () => {
  const s = await b64.enc(snapshot());
  history.replaceState(null, "", "#s=" + s);
  try { await navigator.clipboard.writeText(location.href); status("link copied", true); } catch { status("link is in the address bar", true); }
};

document.querySelectorAll(".gutter").forEach((g) => {
  g.onpointerdown = (down) => {
    const [a, b] = [g.previousElementSibling, g.nextElementSibling];
    const [wa, wb] = [a.offsetWidth, b.offsetWidth];
    g.setPointerCapture(down.pointerId);
    g.onpointermove = (m) => {
      const d = Math.max(-wa + 120, Math.min(wb - 120, m.clientX - down.clientX));
      a.style.flex = `0 0 ${wa + d}px`; b.style.flex = `0 0 ${wb - d}px`;
    };
    g.onpointerup = () => { g.onpointermove = null; };
  };
});

(async () => {
  let st;
  try { if (location.hash.startsWith("#s=")) st = await b64.dec(location.hash.slice(3)); } catch {}
  try { st ??= JSON.parse(localStorage.getItem("jslt-playground")); } catch {}
  load(st || fromExample(examples[0]));
})();
