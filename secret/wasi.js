const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOENT = 44;
const ERRNO_INVAL = 28;

const FILETYPE_CHARACTER_DEVICE = 2;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;

export class Wasi {
  constructor({ args, env, files, stdin, stdout, stderr }) {
    this.args = args ?? ["secret"];
    this.env = env ?? [];
    this.files = files ?? {}; // name -> Uint8Array (virtual preopen "/")
    this.stdinFn = stdin ?? (() => null);
    this.stdoutFn = stdout ?? (() => {});
    this.stderrFn = stderr ?? (() => {});
    this.memory = null;
    this.nextFd = 4;
    this.fds = {
      0: { type: "stdio" },
      1: { type: "stdio" },
      2: { type: "stdio" },
      3: { type: "preopen" },
    };
  }

  attach(instance) {
    this.memory = instance.exports.memory;
  }

  // --- memory helpers ---

  u8(ptr, len) {
    return new Uint8Array(this.memory.buffer, ptr, len);
  }

  u32(ptr) {
    return new DataView(this.memory.buffer).getUint32(ptr, true);
  }

  setU32(ptr, val) {
    new DataView(this.memory.buffer).setUint32(ptr, val >>> 0, true);
  }

  setU64(ptr, val) {
    new DataView(this.memory.buffer).setBigUint64(ptr, BigInt(val), true);
  }

  getIovecs(ptr, len) {
    const out = [];
    for (let i = 0; i < len; i++) {
      const buf = this.u32(ptr + i * 8);
      const size = this.u32(ptr + i * 8 + 4);
      out.push([buf, size]);
    }
    return out;
  }

  readCstr(ptr, max = 4096) {
    let s = "";
    for (let i = 0; i < max; i++) {
      const c = this.u8(ptr + i, 1)[0];
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  // --- wasi imports ---

  proc_exit(code) {
    throw { __wasi_exit: code };
  }

  args_sizes_get(ptr, bufSizePtr) {
    let size = 0;
    for (const a of this.args) size += a.length + 1;
    this.setU32(ptr, this.args.length);
    this.setU32(bufSizePtr, size);
    return ERRNO_SUCCESS;
  }

  args_get(ptr, bufPtr) {
    for (let i = 0; i < this.args.length; i++) {
      const a = this.args[i];
      this.setU32(ptr + i * 4, bufPtr);
      for (let j = 0; j < a.length; j++) this.u8(bufPtr + j, 1)[0] = a.charCodeAt(j);
      this.u8(bufPtr + a.length, 1)[0] = 0;
      bufPtr += a.length + 1;
    }
    return ERRNO_SUCCESS;
  }

  environ_sizes_get(ptr, bufSizePtr) {
    let size = 0;
    for (const e of this.env) size += e.length + 1;
    this.setU32(ptr, this.env.length);
    this.setU32(bufSizePtr, size);
    return ERRNO_SUCCESS;
  }

  environ_get(ptr, bufPtr) {
    for (let i = 0; i < this.env.length; i++) {
      const e = this.env[i];
      this.setU32(ptr + i * 4, bufPtr);
      for (let j = 0; j < e.length; j++) this.u8(bufPtr + j, 1)[0] = e.charCodeAt(j);
      this.u8(bufPtr + e.length, 1)[0] = 0;
      bufPtr += e.length + 1;
    }
    return ERRNO_SUCCESS;
  }

  clock_time_get(id, precision, timePtr) {
    const ms = id === 0 ? Date.now() : performance.now();
    this.setU64(timePtr, BigInt(Math.round(ms)) * 1000000n);
    return ERRNO_SUCCESS;
  }

  random_get(ptr, len) {
    crypto.getRandomValues(this.u8(ptr, len));
    return ERRNO_SUCCESS;
  }

  fd_fdstat_get(fd, statPtr) {
    const f = this.fds[fd];
    if (!f) return ERRNO_BADF;
    const view = new DataView(this.memory.buffer);
    const type = f.type === "file"
      ? FILETYPE_REGULAR_FILE
      : fd === 3 ? FILETYPE_DIRECTORY : FILETYPE_CHARACTER_DEVICE;
    view.setUint8(statPtr, type);
    view.setUint8(statPtr + 1, 0); // flags
    view.setBigUint64(statPtr + 8, 0xffffffffffffffffn, true); // rights base
    view.setBigUint64(statPtr + 16, 0xffffffffffffffffn, true); // rights inheriting
    return ERRNO_SUCCESS;
  }

  fd_prestat_get(fd, ptr) {
    if (fd !== 3) return ERRNO_BADF;
    // __wasi_prestat_t: tag (u8, 0 = DIR), padding, pr_name_len (u32)
    const view = new DataView(this.memory.buffer);
    view.setUint8(ptr, 0);
    view.setUint32(ptr + 4, 1, true); // preopen dir name: "/"
    return ERRNO_SUCCESS;
  }

  fd_prestat_dir_name(fd, ptr, len) {
    if (fd !== 3) return ERRNO_BADF;
    if (len < 1) return ERRNO_INVAL;
    this.u8(ptr, len)[0] = 47; // "/"
    return ERRNO_SUCCESS;
  }

  path_open(dirFd, dirFlags, pathPtr, pathLen, oflags, rightsBase, rightsInher, fdFlags, fdPtr) {
    if (dirFd !== 3) return ERRNO_BADF;
    const name = this.readCstr(pathPtr, pathLen);
    const data = this.files[name];
    if (!data) return ERRNO_NOENT;
    const fd = this.nextFd++;
    this.fds[fd] = {
      type: "file",
      data: new Uint8Array(data),
      pos: 0,
      write: !!(oflags & 1), // O_CREAT bit ignored; allow write in memory
    };
    this.setU32(fdPtr, fd);
    return ERRNO_SUCCESS;
  }

  fd_read(fd, iovecPtr, iovecLen, nreadPtr) {
    const f = this.fds[fd];
    if (!f) return ERRNO_BADF;
    const iovecs = this.getIovecs(iovecPtr, iovecLen);
    let total = 0;
    let data;
    if (fd === 0) {
      data = this.stdinFn();
      if (!data) {
        this.setU32(nreadPtr, 0);
        return ERRNO_SUCCESS;
      }
      for (const [buf, size] of iovecs) {
        const n = Math.min(size, data.length - total);
        this.u8(buf, size).set(data.subarray(total, total + n));
        total += n;
        if (total >= data.length) break;
      }
      this.setU32(nreadPtr, total);
      return ERRNO_SUCCESS;
    }
    if (f.type !== "file") return ERRNO_BADF;
    for (const [buf, size] of iovecs) {
      const n = Math.min(size, f.data.length - f.pos);
      this.u8(buf, size).set(f.data.subarray(f.pos, f.pos + n));
      f.pos += n;
      total += n;
    }
    this.setU32(nreadPtr, total);
    return ERRNO_SUCCESS;
  }

  fd_write(fd, iovecPtr, iovecLen, nwrittenPtr) {
    const f = this.fds[fd];
    if (!f) return ERRNO_BADF;
    const iovecs = this.getIovecs(iovecPtr, iovecLen);
    let total = 0;
    if (fd === 1 || fd === 2) {
      const chunks = [];
      for (const [buf, size] of iovecs) {
        chunks.push(this.u8(buf, size).slice());
        total += size;
      }
      const bytes = concat(chunks);
      const fn = fd === 1 ? this.stdoutFn : this.stderrFn;
      fn(bytes);
      this.setU32(nwrittenPtr, total);
      return ERRNO_SUCCESS;
    }
    if (f.type !== "file") return ERRNO_BADF;
    for (const [buf, size] of iovecs) {
      const chunk = this.u8(buf, size);
      if (f.pos + size > f.data.length) {
        const grown = new Uint8Array(f.pos + size);
        grown.set(f.data);
        f.data = grown;
      }
      f.data.set(chunk, f.pos);
      f.pos += size;
      total += size;
    }
    this.setU32(nwrittenPtr, total);
    return ERRNO_SUCCESS;
  }

  fd_seek(fd, offset, whence, newoffsetPtr) {
    const f = this.fds[fd];
    if (!f || f.type !== "file") return ERRNO_BADF;
    const off = BigInt(offset);
    let base = whence === 0 ? 0n : whence === 1 ? BigInt(f.pos) : BigInt(f.data.length);
    let np = base + off;
    if (np < 0n) return ERRNO_INVAL;
    f.pos = Number(np);
    this.setU64(newoffsetPtr, np);
    return ERRNO_SUCCESS;
  }

  fd_tell(fd, offsetPtr) {
    const f = this.fds[fd];
    if (!f || f.type !== "file") return ERRNO_BADF;
    this.setU64(offsetPtr, BigInt(f.pos));
    return ERRNO_SUCCESS;
  }

  fd_close(fd) {
    if (!this.fds[fd]) return ERRNO_BADF;
    delete this.fds[fd];
    return ERRNO_SUCCESS;
  }

  poll_oneoff(inPtr, outPtr, nsubscriptions, neventsPtr) {
    // All our fds are always ready; report readiness immediately.
    const view = new DataView(this.memory.buffer);
    for (let i = 0; i < nsubscriptions; i++) {
      const userdata = view.getBigUint64(inPtr + i * 48, true);
      view.setBigUint64(outPtr + i * 32, userdata, true);
      view.setUint8(outPtr + i * 32 + 8, 0); // readiness event type: FD
      view.setUint16(outPtr + i * 32 + 10, 1, true); // fd_read/write ready
    }
    this.setU32(neventsPtr, nsubscriptions);
    return ERRNO_SUCCESS;
  }

  imports() {
    const wrap = (fn) => (...a) => fn.apply(this, a);
    return {
      wasi_snapshot_preview1: {
        args_get: wrap(this.args_get),
        args_sizes_get: wrap(this.args_sizes_get),
        environ_get: wrap(this.environ_get),
        environ_sizes_get: wrap(this.environ_sizes_get),
        clock_time_get: wrap(this.clock_time_get),
        fd_close: wrap(this.fd_close),
        fd_fdstat_get: wrap(this.fd_fdstat_get),
        fd_prestat_get: wrap(this.fd_prestat_get),
        fd_prestat_dir_name: wrap(this.fd_prestat_dir_name),
        fd_read: wrap(this.fd_read),
        fd_seek: wrap(this.fd_seek),
        fd_tell: wrap(this.fd_tell),
        fd_write: wrap(this.fd_write),
        path_open: wrap(this.path_open),
        poll_oneoff: wrap(this.poll_oneoff),
        proc_exit: wrap(this.proc_exit),
        random_get: wrap(this.random_get),
      },
    };
  }
}

function concat(chunks) {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
