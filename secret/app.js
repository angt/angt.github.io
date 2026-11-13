const WASM_URL = "https://raw.githubusercontent.com/angt/secret/master/secret.wasm";
const STORE_URL = "https://raw.githubusercontent.com/angt/dotfiles/master/.secret";
const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8 = new TextDecoder("utf-8", {fatal: true});

let wasm, store, storeLen, passPtr, outPtr, secretPtr;
let entries = [];
let unlocked = false;
let modulePromise;
let keyboardOpen = false;
let keyboardPage = 1;
let glitchTimer;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const shuffleWord = new Uint32Array(1);

const randomBetween = (min, max) => min + Math.random() * (max - min);
const bytes = (ptr, len) => new Uint8Array(wasm.memory.buffer, ptr, len);
const setEnabled = (disabled, ...ids) => ids.forEach(id => ($(id).disabled = disabled));

/* ---------------------------------------------------------------- logo */

function stopLogoGlitch() {
  clearTimeout(glitchTimer);
  glitchTimer = undefined;
  $("welcome-logo").classList.remove("glitching");
}

function glitchable() {
  return !unlocked && !$("welcome-logo").hidden && !document.hidden && !reducedMotion.matches;
}

function glitchLogo() {
  const logo = $("welcome-logo");
  if (!glitchable()) return;

  const top = randomBetween(5, 80);
  const height = randomBetween(3, 13);
  logo.style.setProperty("--slice-a", `inset(${top}% 0 ${97 - top - height}% 0)`);
  logo.style.setProperty("--slice-a-x", `${randomBetween(-22, 22).toFixed(1)}px`);
  for (const [name, position] of [["b", 31], ["c", 45], ["d", 61]]) {
    const sliceTop = Math.min(88, Math.max(3, position + randomBetween(-16, 16)));
    const sliceHeight = randomBetween(3, 15);
    logo.style.setProperty(`--slice-${name}`,
      `inset(${sliceTop.toFixed(1)}% 0 ${(97 - sliceTop - sliceHeight).toFixed(1)}% 0)`);
    logo.style.setProperty(`--slice-${name}-x`, `${randomBetween(-22, 22).toFixed(1)}px`);
  }

  const direction = Math.random() < .5 ? -1 : 1;
  const jolt = randomBetween(4, 10);
  const lift = randomBetween(-4, 4);
  logo.style.setProperty("--jolt-x", `${direction * jolt}px`);
  logo.style.setProperty("--jolt-y", `${lift.toFixed(1)}px`);
  logo.style.setProperty("--jolt-return-x", `${(-direction * jolt * .7).toFixed(1)}px`);
  logo.style.setProperty("--jolt-return-y", `${(-lift).toFixed(1)}px`);
  logo.style.setProperty("--jolt-skew", `${(direction * randomBetween(.5, 1.8)).toFixed(2)}deg`);
  logo.style.setProperty("--echo-cyan", `${(-direction * randomBetween(9, 18)).toFixed(1)}px`);
  logo.style.setProperty("--echo-red", `${(direction * randomBetween(9, 18)).toFixed(1)}px`);

  const duration = Math.round(randomBetween(480, 760));
  logo.style.setProperty("--glitch-duration", `${duration}ms`);
  logo.classList.add("glitching");
  glitchTimer = setTimeout(() => {
    logo.classList.remove("glitching");
    scheduleLogoGlitch();
  }, duration);
}

function scheduleLogoGlitch() {
  stopLogoGlitch();
  if (glitchable()) glitchTimer = setTimeout(glitchLogo, randomBetween(8000, 22000));
}

/* ------------------------------------------------------------ keyboard */

function msg(text, error = false) {
  $("msg").textContent = text;
  $("msg").className = error ? "error" : "";
}

function syncKeyboardPage(page) {
  keyboardPage = page;
  [...$("keyboard-pages").children].forEach((panel, index) => {
    panel.inert = panel.toggleAttribute("aria-hidden", index !== page);
  });
}

function keyboardPress(code) {
  const input = $("pass");
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const from = code === 127 && start === end && start > 0
    ? start - [...input.value.slice(0, start)].pop().length : start;
  input.setRangeText(code === 127 ? "" : String.fromCharCode(code), from, end, "end");
}

for (let start = 32; start < 128; start += 32) {
  const panel = document.createElement("div");
  panel.className = "keyboard-panel";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", `Keyboard page ${start / 32}`);
  panel.innerHTML = Array.from({length: 32}, (_, i) => {
    const code = start + i;
    const label = code === 127 ? "delete" : code === 32 ? "space" : `&#${code};`;
    const text = code === 127 ? "del" : code === 32 ? "" : `&#${code};`;
    return `<button type="button" class="key" data-code="${code}" aria-label="${label}">${text}</button>`;
  }).join("");
  $("keyboard-pages").append(panel);
}

function secureRandomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  let n;
  do {
    crypto.getRandomValues(shuffleWord);
    n = shuffleWord[0];
  } while (n >= limit);
  return n % max;
}

function shuffleKeys() {
  const panel = $("keyboard-pages").children[keyboardPage];
  if (!panel) return;
  const keys = [...panel.children];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  panel.append(...keys);
}

function setKeyboard(enabled) {
  keyboardOpen = enabled;
  document.body.classList.toggle("using-keyboard", enabled);
  $("keyboard").hidden = !enabled;
  $("keyboard-bar").hidden = !enabled;
  $("keyboard-toggle").setAttribute("aria-pressed", String(enabled));
  const label = enabled ? "Use native keyboard" : "Use on-screen keyboard";
  $("keyboard-toggle").setAttribute("aria-label", label);
  $("keyboard-toggle").title = label;
  $("pass").readOnly = enabled;
  if (enabled) {
    $("pass").blur();
    $("keyboard-pages").scrollLeft = $("keyboard-pages").clientWidth;
    syncKeyboardPage(1);
  } else if (!$("pass").disabled) {
    $("pass").focus();
  }
}

$("keyboard-toggle").onclick = () => setKeyboard(!keyboardOpen);
$("keyboard-shuffle").onclick = shuffleKeys;
$("keyboard").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (button?.dataset.code !== undefined) keyboardPress(Number(button.dataset.code));
});
$("keyboard-pages").addEventListener("scroll", event => {
  const pages = event.currentTarget;
  if (pages.clientWidth) syncKeyboardPage(Math.round(pages.scrollLeft / pages.clientWidth));
});

/* -------------------------------------------------------------- crypto */

function readEntry(off) {
  const ptr = wasm.secret_decrypt(store + off);
  if (!ptr) return null;

  const len = new DataView(wasm.memory.buffer).getUint16(ptr, true);
  const data = bytes(ptr + 2, 474);
  const nlen = data.indexOf(0);
  if (nlen <= 0 || len > 474 - nlen - 1) throw new Error("Invalid entry");

  return {
    name: dec.decode(data.subarray(0, nlen)),
    namePtr: ptr + 2,
    valuePtr: ptr + 2 + nlen + 1,
    len,
  };
}

function updateTotp(entry) {
  const slot = Math.floor(Date.now() / 30000);
  if (entry.slot === slot) return;

  const raw = readEntry(entry.off);
  if (!raw) throw new Error("Cannot decrypt entry");
  const view = new DataView(wasm.memory.buffer);
  view.setUint32(secretPtr, raw.namePtr, true);
  view.setUint32(secretPtr + 4, raw.valuePtr, true);
  view.setUint32(secretPtr + 8, raw.len, true);
  bytes(outPtr, 7).fill(0);

  if (raw.name.includes("totp32")) wasm.secret_totp32(outPtr, secretPtr, BigInt(slot));
  else wasm.secret_totp(outPtr, secretPtr, BigInt(slot));
  if (!bytes(outPtr, 1)[0]) throw new Error("Invalid TOTP secret");

  entry.code = dec.decode(bytes(outPtr, 6));
  entry.slot = slot;
}

function rawValue(entry) {
  const raw = readEntry(entry.off);
  if (!raw) throw new Error("Cannot decrypt entry");
  const data = bytes(raw.valuePtr, raw.len);
  try {
    return utf8.decode(data);
  } catch {
    return btoa(String.fromCharCode(...data));
  }
}

/* --------------------------------------------------------------- rows */

function hide(entry) {
  entry.revealed = false;
  entry.code = "";
  entry.slot = -1;
  entry.button.setAttribute("aria-expanded", "false");
  entry.button.setAttribute("aria-label", entry.label);
  entry.value.hidden = true;
  entry.value.textContent = "";
  entry.remaining.hidden = true;
  entry.remaining.textContent = "";
}

function copied(entry) {
  clearTimeout(entry.copyTimer);
  entry.feedback.hidden = false;
  entry.feedback.textContent = "copied";
  entry.copyTimer = setTimeout(() => (entry.feedback.hidden = true), 1500);
}

function showTotp(entry) {
  updateTotp(entry);
  entry.value.className = "value totp";
  const code = entry.code.slice(0, 3) + " " + entry.code.slice(3);
  if (entry.value.textContent !== code) entry.value.textContent = code;
  entry.remaining.hidden = false;
  entry.remaining.textContent = `${30 - Math.floor(Date.now() / 1000) % 30} seconds`;
}

function reveal(entry) {
  if (!unlocked) return;
  if (entry.revealed) {
    hide(entry);
    return;
  }
  for (const other of entries) if (other.revealed) hide(other);
  entry.button.setAttribute("aria-expanded", "true");
  entry.button.setAttribute("aria-label", `${entry.name} revealed; click to hide`);
  try {
    if (entry.totp) {
      showTotp(entry);
    } else {
      entry.value.className = "value";
      entry.value.textContent = rawValue(entry) || "(empty)";
    }
    entry.value.hidden = false;
    entry.revealed = true;
  } catch (error) {
    hide(entry);
    msg(error, true);
  }
}

async function copy(entry) {
  let value;
  try {
    if (entry.totp) {
      updateTotp(entry);
      value = entry.code;
    } else {
      value = rawValue(entry);
    }
  } catch (error) {
    return msg(error, true);
  }
  try {
    await navigator.clipboard.writeText(value);
    if (unlocked && entries.includes(entry)) copied(entry);
  } catch {
    if (unlocked && entries.includes(entry))
      msg("Clipboard blocked — hold to reveal, then copy manually", true);
  }
}

function tick() {
  if (!unlocked || document.hidden) return;
  for (const entry of entries) {
    if (!entry.revealed || !entry.totp) continue;
    try {
      showTotp(entry);
    } catch (error) {
      lock();
      msg(error, true);
      return;
    }
  }
}

function bindPress(entry) {
  const button = entry.button;
  let timer, pointer = null, startX = 0, startY = 0, held = false, suppressClick = false;

  function cancel() {
    clearTimeout(timer);
    timer = null;
    if (held) suppressClick = true;
    pointer = null;
    held = false;
  }

  button.onpointerdown = event => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancel();
    suppressClick = false;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    button.setPointerCapture(pointer);
    timer = setTimeout(() => {
      timer = null;
      held = true;
      reveal(entry);
    }, 550);
  };
  button.onpointermove = event => {
    if (event.pointerId === pointer && Math.hypot(event.clientX - startX, event.clientY - startY) > 10)
      cancel();
  };
  button.onpointerup = event => {
    if (event.pointerId === pointer) cancel();
  };
  button.onpointercancel = cancel;
  button.onlostpointercapture = cancel;
  button.oncontextmenu = event => {
    if (event.pointerType !== "mouse") event.preventDefault();
  };
  button.onclick = () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (entry.revealed) hide(entry);
    else copy(entry);
  };
}

function filterEntries() {
  const query = $("search").value.trim().toLowerCase();
  let matches = 0;
  for (const entry of entries) {
    const match = !query || entry.name.toLowerCase().includes(query);
    entry.row.hidden = !match;
    if (match) matches++;
    else if (entry.revealed) hide(entry);
  }
  $("secret-count").textContent = query
    ? `${matches} / ${entries.length} secrets`
    : `${entries.length} secrets`;
  msg("");
}

function render() {
  $("list").replaceChildren(...entries.map((entry, index) => {
    entry.revealed = false;
    entry.slot = -1;
    entry.label = `Copy ${entry.name}; hold to reveal`;

    const button = document.createElement("button");
    button.className = "name";
    button.textContent = entry.name;
    button.setAttribute("aria-label", entry.label);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", `secret-${index}`);
    entry.button = button;

    const value = document.createElement("pre");
    value.id = `secret-${index}`;
    value.className = "value";
    value.hidden = true;
    entry.value = value;

    const remaining = document.createElement("div");
    remaining.className = "remaining";
    remaining.hidden = true;
    entry.remaining = remaining;

    const feedback = document.createElement("span");
    feedback.className = "copy-status";
    feedback.hidden = true;
    feedback.setAttribute("role", "status");
    entry.feedback = feedback;

    const heading = document.createElement("div");
    heading.className = "entry-heading";
    heading.append(button, feedback);

    bindPress(entry);
    const row = document.createElement("div");
    row.className = "entry";
    row.append(heading, value, remaining);
    entry.row = row;
    return row;
  }));
}

/* ------------------------------------------------------- lock / unlock */

function lock() {
  document.body.classList.add("locked");
  $("gate").scrollTop = 0;
  unlocked = false;
  entries = [];
  wasm?.secret_lock();
  if (wasm && passPtr) {
    bytes(passPtr, 128).fill(0);
    bytes(outPtr, 20).fill(0);
  }
  window.getSelection()?.removeAllRanges();
  $("list").replaceChildren();
  $("list").hidden = true;
  $("search").value = "";
  $("search-bar").hidden = true;
  $("brand").hidden = true;
  $("secret-count").textContent = "";
  $("welcome-logo").hidden = false;
  $("lock").hidden = true;
  $("unlock-form").hidden = false;
  msg("");
  scheduleLogoGlitch();
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
  const error = wasm.secret_header(store) || wasm.secret_unlock(passPtr, pass.length);
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
  } catch (error) {
    wasm.secret_lock();
    return msg(error, true);
  }

  unlocked = true;
  document.body.classList.remove("locked");
  $("gate").scrollTop = 0;
  render();
  $("list").hidden = false;
  $("search-bar").hidden = false;
  $("lock").hidden = false;
  $("brand").hidden = false;
  stopLogoGlitch();
  $("welcome-logo").hidden = true;
  $("unlock-form").hidden = true;
  filterEntries();
}

async function start() {
  $("retry").hidden = true;
  setEnabled(true, "retry", "pass", "unlock", "keyboard-toggle");
  msg("Loading store…");
  try {
    const [module, response] = await Promise.all([
      modulePromise ||= (async () => {
        const r = await fetch(WASM_URL, {cache: "no-cache"});
        if (!r.ok) throw new Error(`WASM HTTP ${r.status}`);
        return WebAssembly.compile(await r.arrayBuffer());
      })(),
      fetch(STORE_URL, {cache: "no-store"}),
    ]);
    if (!response.ok) throw new Error(`Store HTTP ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length < 512 || data.length % 512) throw new Error("Invalid store size");

    wasm = (await WebAssembly.instantiate(module)).exports;
    wasm._initialize?.();
    store = wasm.memory.buffer.byteLength;
    storeLen = data.length;
    passPtr = store + storeLen;
    outPtr = passPtr + 128;
    secretPtr = outPtr + 8;
    wasm.memory.grow(Math.ceil((storeLen + 148) / 65536));
    bytes(store, storeLen).set(data);
    data.fill(0);

    setEnabled(false, "pass", "unlock", "keyboard-toggle");
    if (!keyboardOpen) {
      $("pass").focus();
      $("pass").select();
    }
    msg("");
  } catch (error) {
    modulePromise = null;
    msg(`Unable to load: ${error?.message || error}`, true);
    $("retry").hidden = false;
    $("retry").disabled = false;
  }
}

$("retry").onclick = start;
$("unlock-form").onsubmit = unlock;
$("lock").onclick = lock;
$("search").addEventListener("input", filterEntries);
document.addEventListener("visibilitychange", () => {
  tick();
  scheduleLogoGlitch();
});
reducedMotion.addEventListener("change", scheduleLogoGlitch);
setInterval(tick, 1000);
scheduleLogoGlitch();
start();
