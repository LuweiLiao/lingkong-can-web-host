// SLCAN 串口驱动：用 Web Serial 和 SLCAN 适配器通信（文本协议，以 CR 结尾）
(function (LK) {
  'use strict';
  const CR = String.fromCharCode(13);
  const BEL = String.fromCharCode(7);
  const BITRATE = { 10: 'S0', 20: 'S1', 50: 'S2', 100: 'S3', 125: 'S4', 250: 'S5', 500: 'S6', 800: 'S7', 1000: 'S8' };
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class Slcan {
    constructor() {
      this.port = null; this.writer = null; this.reader = null; this.loop = null;
      this.connected = false; this.buf = '';
      this.rxCount = 0; this.txCount = 0;
      this.waiters = []; this.chain = Promise.resolve();
      this.onFrame = null;  // 收到帧：(frame) => void
      this.onTx = null;     // 发出帧：(frame) => void
      this.onClose = null;  // 链路意外断开：(err) => void
    }

    static supported() { return 'serial' in navigator; }

    // o: { baud, canKbps, listenOnly }
    async connect(o) {
      if (!BITRATE[o.canKbps]) throw new Error('不支持的 CAN 速率');
      this.port = o.port || await navigator.serial.requestPort();
      await this.port.open({ baudRate: o.baud, bufferSize: 65536 });
      this.writer = this.port.writable.getWriter();
      this.connected = true; this.buf = '';
      this.rxCount = 0; this.txCount = 0;
      this.loop = this._readLoop();
      await this._raw('C' + CR); await sleep(30);
      await this._raw(BITRATE[o.canKbps] + CR); await sleep(30);
      await this._raw((o.listenOnly ? 'L' : 'O') + CR); await sleep(30);
    }

    async disconnect() {
      const wasOpen = this.connected;
      this.connected = false;
      this._failAll(new Error('已断开'));
      try { if (wasOpen) await this._raw('C' + CR); } catch (e) { /* 忽略 */ }
      try { if (this.reader) await this.reader.cancel(); } catch (e) { /* 忽略 */ }
      try { await this.loop; } catch (e) { /* 忽略 */ }
      try { if (this.writer) this.writer.releaseLock(); } catch (e) { /* 忽略 */ }
      try { if (this.port) await this.port.close(); } catch (e) { /* 忽略 */ }
      this.port = null; this.writer = null; this.reader = null;
    }

    async _raw(s) { await this.writer.write(new TextEncoder().encode(s)); }

    async _readLoop() {
      const dec = new TextDecoder();
      let err = null;
      try {
        while (this.port && this.port.readable && this.connected) {
          this.reader = this.port.readable.getReader();
          try {
            for (;;) {
              const { value, done } = await this.reader.read();
              if (done) break;
              if (value) this._feed(dec.decode(value, { stream: true }));
            }
          } finally { this.reader.releaseLock(); this.reader = null; }
        }
      } catch (e) { err = e; }
      if (this.connected) {
        this.connected = false;
        this._failAll(err || new Error('串口已断开'));
        if (this.onClose) this.onClose(err);
      }
    }

    _feed(text) {
      this.buf += text;
      let i;
      while ((i = this.buf.indexOf(CR)) >= 0) {
        const line = this.buf.slice(0, i).split(BEL).join('').trim();
        this.buf = this.buf.slice(i + 1);
        const f = this._parse(line);
        if (f) this._dispatch(f);
      }
      if (this.buf.length > 4096) this.buf = '';
    }

    // 解析 SLCAN 数据帧：t<3位ID><DLC><数据> 或 T<8位ID><DLC><数据>
    _parse(line) {
      const c = line[0];
      if (c !== 't' && c !== 'T') return null;
      const ext = c === 'T';
      const n = ext ? 8 : 3;
      const id = parseInt(line.substr(1, n), 16);
      const dlc = parseInt(line[1 + n], 16);
      if (isNaN(id) || isNaN(dlc) || dlc > 8 || line.length < 2 + n + dlc * 2) return null;
      const data = new Uint8Array(dlc);
      for (let i = 0; i < dlc; i++) data[i] = parseInt(line.substr(2 + n + i * 2, 2), 16);
      return { id, ext, dlc, data, ts: performance.now() };
    }

    _dispatch(f) {
      this.rxCount++;
      for (let k = 0; k < this.waiters.length; k++) {
        const w = this.waiters[k];
        if (w.test(f)) { this.waiters.splice(k, 1); clearTimeout(w.timer); w.resolve(f); break; }
      }
      if (this.onFrame) this.onFrame(f);
    }

    // 发送一帧；协议要求 DLC 固定为 8，不足补 0
    async send(id, data, ext) {
      if (!this.connected) throw new Error('未连接');
      const d = new Uint8Array(8);
      d.set(Array.from(data).slice(0, 8));
      let s = ext ? 'T' + hex(id, 8) : 't' + hex(id, 3);
      s += '8';
      for (const b of d) s += hex(b, 2);
      await this._raw(s + CR);
      this.txCount++;
      if (this.onTx) this.onTx({ id, ext: !!ext, dlc: 8, data: d, ts: performance.now() });
    }

    // 一问一答：串行排队（协议要求一次一请求一应答）。
    // o: { ext, ackId, timeout, match }；默认按回复 ID 和命令码匹配
    request(id, data, o = {}) {
      const job = this.chain.then(() => this._req(id, data, o));
      this.chain = job.catch(() => {});
      return job;
    }

    _req(id, data, o) {
      return new Promise((resolve, reject) => {
        const test = o.match || ((f) => (o.ackId === undefined || f.id === o.ackId) && f.data[0] === data[0]);
        const w = { test, resolve, reject, timer: 0 };
        w.timer = setTimeout(() => { this._rm(w); reject(new Error('超时无回复')); }, o.timeout || 150);
        this.waiters.push(w);
        this.send(id, data, o.ext).catch((e) => { clearTimeout(w.timer); this._rm(w); reject(e); });
      });
    }

    _rm(w) { const k = this.waiters.indexOf(w); if (k >= 0) this.waiters.splice(k, 1); }

    _failAll(err) {
      const ws = this.waiters.splice(0);
      for (const w of ws) { clearTimeout(w.timer); w.reject(err); }
    }
  }

  LK.Slcan = Slcan;
  LK.sleep = sleep;
  LK.hex = hex;
})(window.LK = window.LK || {});
