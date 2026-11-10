const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

function boot(seedLS, opts) {
  opts = opts || {};
  const store = new Map(Object.entries(seedLS || {}));
  const els = { "#nav": { innerHTML: "" }, "#app": { innerHTML: "", insertAdjacentHTML(_, h) { this.innerHTML = h + this.innerHTML; } }, "#ov": { innerHTML: "", hidden: true }, "#toast": { textContent: "", classList: { add() {}, remove() {} } } };
  const FORM = {}, listeners = {}, intervals = [], toasts = [];
  const field = (id) => ({ get value() { return FORM[id] ?? ""; }, set value(v) { FORM[id] = v; }, focus() {}, click() {}, scrollIntoView() {} });
  const document = {
    documentElement: { setAttribute() {}, removeAttribute() {} },
    querySelector(sel) { if (els[sel]) return els[sel]; if (sel.startsWith("#")) return field(sel.slice(1)); return null; },
    getElementById(id) { return field(id); },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    createElement() { return { click() {} }; },
  };
  const ctx = vm.createContext({ document, window: undefined, navigator: {}, location: { protocol: "file:" }, console, confirm: opts.confirm || (() => true), prompt: opts.prompt || (() => null), window: undefined,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    setInterval: (f) => intervals.push(f), setTimeout: () => 0, clearTimeout() {}, fetch: opts.fetch || (async () => ({ ok: false, json: async () => ({}) })), FileReader: class {}, URL: { createObjectURL: () => "" }, Blob: class {}, addEventListener() {} });
  ctx.window = ctx; ctx.globalThis = ctx;
  const run = (code, name) => vm.runInContext(code, ctx, { filename: name });
  run(fs.readFileSync(path.join(root, "study-core.js"), "utf8"), "study-core.js");
  run(fs.readFileSync(path.join(root, "study.js"), "utf8"), "study.js");
  run(fs.readFileSync(path.join(root, "sync-core.js"), "utf8"), "sync-core.js");
  run(fs.readFileSync(path.join(root, "cloud.js"), "utf8"), "cloud.js");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = html.split(/^<script>$/m)[1].split("</script>")[0];
  run(main, "index-main.js");
  const fire = (type, ev) => (listeners[type] || []).forEach((fn) => fn(ev));
  const click = (key, i, d, attr = "s") => fire("click", { target: { closest: (sel) => (sel === `[data-${attr}]` ? { dataset: { [attr]: key, i, d }, disabled: false } : null) } });
  const api = {
    ctx, FORM, toasts, click, run, fire, els, toastText: () => els["#toast"].textContent,
    go: (view, i) => click("v", i || view, undefined, "a"),
    app: () => els["#app"].innerHTML, nav: () => els["#nav"].innerHTML, ov: () => els["#ov"].innerHTML,
    study: () => JSON.parse(JSON.stringify(run("SS.exportData()"))), tick: () => intervals.forEach((f) => f()), store,
    view: (v) => { api.run(`view=${JSON.stringify(v)};render()`); return els["#app"].innerHTML; },
  };
  return api;
}
module.exports = { boot };
