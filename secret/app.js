import { Wasi } from "./wasi.js";

const WASM_URL = "https://raw.githubusercontent.com/angt/secret/master/secret.wasm";
const STORE_URL = "https://raw.githubusercontent.com/angt/dotfiles/master/.secret";

const $ = (id) => document.getElementById(id);

let wasmModule = null;
let storeBytes = null;
let pass = "";

const enc = new TextEncoder();
const dec = new TextDecoder();

function msg(text, isError = false) {
  $("msg").textContent = text;
  $("msg").className = isError ? "msg error" : "msg";
}

async function getModule() {
  if (!wasmModule) {
    const r = await fetch(WASM_URL, { cache: "force-cache" });
    wasmModule = await WebAssembly.compile(await r.arrayBuffer());
  }
  return wasmModule;
}

async function fetchStore() {
  try {
    const r = await fetch(STORE_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    storeBytes = new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    msg("could not fetch .secret: " + e, true);
  }
}

async function run(args) {
  let out = "";
  let errOut = "";
  let reads = 0;

  const wasi = new Wasi({
    args: ["secret", ...args],
    env: ["SECRET_STORE=.secret"],
    files: { ".secret": storeBytes },
    stdin: () => {
      reads++;
      if (reads > 1 || !pass) return null;
      return enc.encode(pass + "\n");
    },
    stdout: (b) => (out += dec.decode(b)),
    stderr: (b) => (errOut += dec.decode(b)),
  });

  const instance = await WebAssembly.instantiate(await getModule(), wasi.imports());
  wasi.attach(instance);

  let exitCode = 0;
  try {
    instance.exports._start();
  } catch (e) {
    if (e && e.__wasi_exit !== undefined) exitCode = e.__wasi_exit;
    else throw e;
  }
  return { out, errOut, exitCode };
}

async function unlock() {
  if (!storeBytes) {
    await fetchStore();
    if (!storeBytes) return;
  }
  pass = $("pass").value;
  $("pass").value = "";
  msg("...");

  const r = await run(["list"]);

  const names = r.out.split("\n").filter(Boolean);
  if (!names.length) {
    pass = "";
    return msg("wrong passphrase", true);
  }

  $("pass").hidden = true;
  const list = $("secret-list");
  list.hidden = false;
  list.textContent = "";
  for (const name of names) {
    const b = document.createElement("div");
    b.className = "entry";
    b.textContent = name;
    addTap(b, {
      tap: () => copySecret(name),
      hold: () => revealSecret(name),
      release: () => hideSecret(),
    });
    list.appendChild(b);
  }
}

const HOLD_MS = 700;

function addTap(el, { tap, hold, release }) {
  let timer = null;
  let id = null;
  let held = false;

  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };

  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    clear();
    if (held) release?.();
    else tap();
    held = false;
  };

  el.addEventListener("pointerdown", (e) => {
    if (id !== null) return;
    id = e.pointerId;
    held = false;
    timer = setTimeout(() => {
      held = true;
      hold();
    }, HOLD_MS);
  });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

async function showSecret(name) {
  const r = await run(["show", name]);
  if (r.exitCode !== 0) {
    msg(r.errOut.trim() || "could not decrypt", true);
    return null;
  }
  return r.out;
}

async function copySecret(name) {
  const value = await showSecret(name);
  if (value === null) return;
  try {
    await navigator.clipboard.writeText(value);
    msg("✓ copied");
  } catch {
    msg("copy failed — hold to reveal instead", true);
  }
}

let holdToken = 0;

function hideAll() {
  document.querySelectorAll(".value").forEach((el) => el.remove());
  $("msg").hidden = true;
  $("secret-list").hidden = true;
}

async function revealSecret(name) {
  const token = ++holdToken;
  hideAll();
  const value = await showSecret(name);
  if (token !== holdToken) return;
  if (value === null) return hideSecret();
  const v = document.createElement("div");
  v.className = "value";
  v.textContent = value;
  document.body.appendChild(v);
}

function hideSecret() {
  holdToken++;
  document.querySelectorAll(".value").forEach((el) => el.remove());
  $("msg").hidden = false;
  $("secret-list").hidden = false;
}

$("pass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlock();
});

fetchStore();
