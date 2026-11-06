const WASM_URL = "https://raw.githubusercontent.com/angt/secret/master/secret.wasm";
const STORE_URL = "https://raw.githubusercontent.com/angt/dotfiles/master/.secret";
const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8 = new TextDecoder("utf-8", {fatal: true});

let wasm, store, storeLen, passPtr, outPtr, secretPtr;
let entries = [], selected = -1, unlocked = false, modulePromise;

function msg(text, error = false) {
  $("msg").textContent = text;
  $("msg").className = error ? "error" : "";
}

function bytes(ptr, len) {
  return new Uint8Array(wasm.memory.buffer, ptr, len);
}

function readEntry(off) {
  const ptr = wasm.secret_decrypt(store + off);
  if (!ptr) return null;

  const len = new DataView(wasm.memory.buffer).getUint16(ptr, true);
  const data = bytes(ptr + 2, 474);
  const nlen = data.indexOf(0);
  if (nlen <= 0 || len > 474 - nlen - 1)
    throw new Error("Invalid entry");

  return {
    name: dec.decode(data.subarray(0, nlen)),
    namePtr: ptr + 2,
    valuePtr: ptr + 2 + nlen + 1,
    len,
  };
}

function period() {
  return Math.floor(Date.now() / 30000);
}

function updateTotp(entry) {
  const current = period();
  if (entry.period === current) return;

  const raw = readEntry(entry.off);
  if (!raw) throw new Error("Cannot decrypt entry");
  const view = new DataView(wasm.memory.buffer);
  view.setUint32(secretPtr, raw.namePtr, true);
  view.setUint32(secretPtr + 4, raw.valuePtr, true);
  view.setUint32(secretPtr + 8, raw.len, true);
  bytes(outPtr, 7).fill(0);

  if (raw.name.includes("totp32"))
    wasm.secret_totp32(outPtr, secretPtr, BigInt(current));
  else
    wasm.secret_totp(outPtr, secretPtr, BigInt(current));
  if (!bytes(outPtr, 1)[0]) throw new Error("Invalid TOTP secret");

  entry.code = dec.decode(bytes(outPtr, 6));
  entry.period = current;
  entry.preview.firstChild.nodeValue = entry.code;
  if (selected === entry.index) showTotp(entry);
}

function tick() {
  if (!unlocked || document.hidden) return;
  try {
    for (const entry of entries) {
      if (entry.totp) updateTotp(entry);
      entry.preview.lastChild.textContent = entry.totp
        ? `${30 - Math.floor(Date.now() / 1000) % 30}s` : "raw";
    }
    if (selected >= 0 && entries[selected].totp)
      showTotp(entries[selected]);
  } catch (error) {
    lock();
    msg(error, true);
  }
}

function hex(data) {
  const lines = [];
  for (let off = 0; off < data.length; off += 16) {
    const row = data.subarray(off, off + 16);
    let left = "", right = "", ascii = "";
    for (let i = 0; i < row.length; i++) {
      const h = row[i].toString(16).padStart(2, "0");
      if (i < 8) left += (i ? " " : "") + h;
      else right += (i > 8 ? " " : "") + h;
      ascii += row[i] >= 32 && row[i] <= 126 ? String.fromCharCode(row[i]) : ".";
    }
    lines.push(off.toString(16).padStart(8, "0") + "  " +
      left.padEnd(23) + "  " + right.padEnd(23) + "  |" + ascii + "|");
  }
  return lines.join("\n");
}

function rawValue(entry) {
  const raw = readEntry(entry.off);
  if (!raw) throw new Error("Cannot decrypt entry");
  const data = bytes(raw.valuePtr, raw.len);
  try {
    const text = utf8.decode(data);
    return {text, copy: text, totp: false};
  } catch {
    return {text: hex(data) || "(empty)", copy: [...data]
      .map(x => x.toString(16).padStart(2, "0")).join(""), totp: false};
  }
}

function showTotp(entry) {
  $("value").className = "totp";
  $("value").textContent = entry.code.slice(0, 3) + " " + entry.code.slice(3);
  $("remaining").hidden = false;
  $("remaining").textContent = `${30 - Math.floor(Date.now() / 1000) % 30} seconds`;
}

function reveal(index) {
  if (!unlocked) return;
  if (selected === index) {
    $("viewer").hidden = true;
    entries[index].row.className = "entry";
    selected = -1;
    return;
  }
  if (selected >= 0) entries[selected].row.className = "entry";
  selected = index;
  const entry = entries[index];
  entry.row.className = "entry selected";
  $("selected-name").textContent = entry.name;
  $("remaining").hidden = true;
  try {
    if (entry.totp) {
      updateTotp(entry);
      showTotp(entry);
    } else {
      const raw = rawValue(entry);
      $("value").className = "";
      $("value").textContent = raw.text || "(empty)";
    }
    $("viewer").hidden = false;
  } catch (error) {
    entry.row.className = "entry";
    selected = -1;
    msg(error, true);
  }
}

async function copy(entry) {
  try {
    let value;
    if (entry.totp) {
      updateTotp(entry);
      value = entry.code;
    } else {
      value = rawValue(entry).copy;
    }
    await navigator.clipboard.writeText(value);
    msg(`copied ${entry.name}`);
  } catch (error) {
    msg("Copy failed — reveal the secret and select it", true);
  }
}

function render() {
  $("list").replaceChildren(...entries.map((entry, index) => {
    entry.index = index;
    const row = document.createElement("div");
    row.className = "entry";
    entry.row = row;

    const name = document.createElement("button");
    name.className = "name";
    name.textContent = entry.name;
    name.setAttribute("aria-label", `Reveal ${entry.name}`);
    name.onclick = () => reveal(index);

    const preview = document.createElement("code");
    preview.className = "preview";
    preview.append(document.createTextNode(entry.totp ? "······" : "•••"));
    const time = document.createElement("small");
    preview.append(time);
    entry.preview = preview;

    const copyButton = document.createElement("button");
    copyButton.className = "copy";
    copyButton.textContent = "copy";
    copyButton.setAttribute("aria-label", `Copy ${entry.name}`);
    copyButton.onclick = () => copy(entry);

    row.append(name, preview, copyButton);
    return row;
  }));
}

function lock() {
  unlocked = false;
  selected = -1;
  entries = [];
  wasm?.secret_lock();
  if (wasm && passPtr) {
    bytes(passPtr, 128).fill(0);
    bytes(outPtr, 20).fill(0);
  }
  $("list").replaceChildren();
  $("list").hidden = true;
  $("viewer").hidden = true;
  $("value").textContent = "";
  $("lock").hidden = true;
  $("unlock-form").hidden = false;
}

function unlock(event) {
  event.preventDefault();
  if (!wasm || $("unlock").disabled) return;
  lock();
  const pass = enc.encode($("pass").value);
  $("pass").value = "";
  if (pass.length > 127) {
    pass.fill(0);
    return msg("Passphrase too long", true);
  }

  bytes(passPtr, pass.length).set(pass);
  let error = wasm.secret_header(store);
  if (!error) error = wasm.secret_unlock(passPtr, pass.length);
  pass.fill(0);
  bytes(passPtr, 128).fill(0);
  if (error) return msg("Invalid store", true);

  try {
    for (let off = 512; off < storeLen; off += 512) {
      const raw = readEntry(off);
      if (raw) entries.push({off, name: raw.name, totp: raw.name.includes("totp")});
    }
    if (!entries.length) {
      wasm.secret_lock();
      return msg("No secrets for this passphrase", true);
    }
    unlocked = true;
    render();
    tick();
    $("list").hidden = false;
    $("lock").hidden = false;
    $("unlock-form").hidden = true;
    msg(`${entries.length} secrets`);
  } catch (error) {
    lock();
    msg(error, true);
  }
}

async function start() {
  try {
    const [module, response] = await Promise.all([
      modulePromise ||= (async () => {
        const r = await fetch(WASM_URL, {cache: "force-cache"});
        if (!r.ok) throw new Error(`WASM HTTP ${r.status}`);
        return WebAssembly.compile(await r.arrayBuffer());
      })(),
      fetch(STORE_URL, {cache: "no-store"}),
    ]);
    if (!response.ok) throw new Error(`Store HTTP ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length < 512 || data.length % 512)
      throw new Error("Invalid store size");

    const instance = await WebAssembly.instantiate(module);
    wasm = instance.exports;
    wasm._initialize?.();
    store = wasm.memory.buffer.byteLength;
    storeLen = data.length;
    passPtr = store + storeLen;
    outPtr = passPtr + 128;
    secretPtr = outPtr + 8;
    wasm.memory.grow(Math.ceil((storeLen + 148) / 65536));
    bytes(store, storeLen).set(data);
    data.fill(0);

    $("pass").disabled = $("unlock").disabled = false;
    $("pass").focus();
    msg("Store ready");
  } catch (error) {
    msg(error, true);
  }
}

$("unlock-form").onsubmit = unlock;
$("lock").onclick = () => {
  lock();
  msg("Locked");
};
document.addEventListener("visibilitychange", tick);
setInterval(tick, 1000);
start();
