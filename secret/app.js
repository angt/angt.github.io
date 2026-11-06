const WASM_URL = "https://raw.githubusercontent.com/angt/secret/master/secret.wasm";
const STORE_URL = "https://raw.githubusercontent.com/angt/dotfiles/master/.secret";
const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8 = new TextDecoder("utf-8", {fatal: true});

let wasm, store, storeLen, passPtr, outPtr, secretPtr;
let entries = [], unlocked = false, modulePromise;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let glitchTimer;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function stopLogoGlitch() {
  clearTimeout(glitchTimer);
  glitchTimer = undefined;
  $("welcome-logo").classList.remove("glitching");
}

function glitchLogo() {
  const logo = $("welcome-logo");
  if (unlocked || logo.hidden || document.hidden || reducedMotion.matches) return;

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
  if (unlocked || $("welcome-logo").hidden || document.hidden || reducedMotion.matches) return;
  glitchTimer = setTimeout(glitchLogo, randomBetween(8000, 22000));
}

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

function updateTotp(entry) {
  const current = Math.floor(Date.now() / 30000);
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

function hide(entry) {
  entry.revealed = false;
  entry.code = "";
  entry.period = -1;
  entry.row.className = "entry";
  entry.button.setAttribute("aria-expanded", "false");
  entry.button.setAttribute("aria-label", `Copy ${entry.name}; hold to reveal`);
  entry.value.hidden = true;
  entry.value.textContent = "";
  entry.remaining.hidden = true;
  entry.remaining.textContent = "";
}

function copied(entry) {
  clearTimeout(entry.copyTimer);
  entry.feedback.hidden = false;
  entry.feedback.textContent = "copied";
  entry.copyTimer = setTimeout(() => {
    entry.feedback.hidden = true;
  }, 1500);
}

function showTotp(entry) {
  updateTotp(entry);
  entry.value.className = "value totp";
  const code = entry.code.slice(0, 3) + " " + entry.code.slice(3);
  if (entry.value.textContent !== code) entry.value.textContent = code;
  entry.remaining.hidden = false;
  entry.remaining.textContent = `${30 - Math.floor(Date.now() / 1000) % 30} seconds`;
}

function reveal(index) {
  if (!unlocked) return;
  const entry = entries[index];
  if (entry.revealed) {
    hide(entry);
    return;
  }
  for (const other of entries) {
    if (other.revealed) hide(other);
  }
  entry.row.className = "entry selected";
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
    copied(entry);
  } catch (error) {
    if (unlocked && entries.includes(entry))
      msg("Clipboard blocked — hold to reveal, then copy manually", true);
  }
}

function bindPress(entry) {
  const button = entry.button;
  let timer, pointer = null, startX = 0, startY = 0;
  let held = false, suppressClick = false;

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
      reveal(entry.index);
    }, 550);
  };
  button.onpointermove = event => {
    if (event.pointerId !== pointer) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
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

function render() {
  $("list").replaceChildren(...entries.map((entry, index) => {
    entry.index = index;
    entry.revealed = false;
    entry.period = -1;
    const row = document.createElement("div");
    row.className = "entry";
    entry.row = row;

    const name = document.createElement("button");
    name.className = "name";
    name.textContent = entry.name;
    name.setAttribute("aria-label", `Copy ${entry.name}; hold to reveal`);
    name.setAttribute("aria-expanded", "false");
    const valueId = `secret-${index}`;
    name.setAttribute("aria-controls", valueId);
    entry.button = name;

    const value = document.createElement("pre");
    value.id = valueId;
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
    heading.append(name, feedback);

    bindPress(entry);
    row.append(heading, value, remaining);
    return row;
  }));
}

function lock() {
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
  $("brand-logo").hidden = true;
  $("welcome-logo").hidden = false;
  $("lock").hidden = true;
  $("unlock-form").hidden = false;
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
    $("list").hidden = false;
    $("lock").hidden = false;
    $("brand-logo").hidden = false;
    stopLogoGlitch();
    $("welcome-logo").hidden = true;
    $("unlock-form").hidden = true;
    msg(`${entries.length} secrets · tap to copy · hold to reveal`);
  } catch (error) {
    lock();
    msg(error, true);
  }
}

async function start() {
  $("retry").hidden = true;
  $("retry").disabled = true;
  $("pass").disabled = $("unlock").disabled = true;
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
    $("pass").select();
    msg("Store ready");
  } catch (error) {
    modulePromise = null;
    msg(`Unable to load: ${error?.message || error}`, true);
    $("retry").hidden = false;
    $("retry").disabled = false;
  }
}

$("retry").onclick = start;
$("unlock-form").onsubmit = unlock;
$("lock").onclick = () => {
  lock();
  msg("Locked");
};
document.addEventListener("visibilitychange", () => {
  tick();
  scheduleLogoGlitch();
});
reducedMotion.addEventListener("change", scheduleLogoGlitch);
setInterval(tick, 1000);
scheduleLogoGlitch();
start();
