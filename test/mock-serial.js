// 假的 Web Serial 设备：按协议对发往 0x141 的帧回复，用于无硬件的端到端测试
(function () {
  const CR = String.fromCharCode(13);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
  const dev = { speed: 0, ang: 25211800, target: 0, sine: true, R: 10, t: Date.now() };
  function step() { const n = Date.now(), dt = (n - dev.t) / 1000; dev.t = n; const tg = dev.sine ? 100 * Math.sin(n / 700) : dev.target; dev.speed += (tg - dev.speed) * Math.min(1, dt * 12); dev.ang += Math.round(dev.speed * dt * 100); }
  function frame(id, d) { let s = 't' + hex(id, 3) + '8'; for (const b of d) s += hex(b, 2); return s + CR; }
  function reply(d) {
    const r = new Uint8Array(8), v = new DataView(r.buffer), c = d[0];
    r[0] = c; step(); const S = 36000 * dev.R; if (c >= 0xA3 && c <= 0xA8) { dev.sine = false; dev.target = 0; } if (c === 0x95) dev.ang = 0; if (c === 0x93) dev.ang = ((dev.ang % S) + S) % S; if (c === 0xA2) { dev.sine = false; dev.target = new DataView(d.buffer, d.byteOffset).getInt32(4, true) / 100; }
    if (c === 0x9C || (c >= 0xA1 && c <= 0xA8)) { r[1] = 35; v.setInt16(2, Math.round(300 + dev.speed * 3), true); v.setInt16(4, Math.round(dev.speed), true); v.setUint16(6, Math.round((((dev.ang % S) + S) % S) / S * 65535), true); }
    else if (c === 0x9A || c === 0x9B) { r[1] = 35; v.setUint16(2, Math.round(2400 + 40 * Math.sin(Date.now() / 1500)), true); v.setInt16(4, Math.round(80 + Math.abs(dev.speed) * 0.9), true); r[6] = 0x30; r[7] = 0; }
    else if (c === 0x9D) { r[1] = 35; v.setInt16(2, 100, true); v.setInt16(4, -50, true); v.setInt16(6, -50, true); }
    else if (c === 0x92) { const x = BigInt(dev.ang); for (let i = 0; i < 7; i++) r[1 + i] = Number((x >> BigInt(8 * i)) & 0xFFn); }
    else if (c === 0x94) { v.setUint32(4, Math.round(((dev.ang % S) + S) % S), true); }
    else if (c === 0x40) {
      const id = d[2] | (d[3] << 8);
      r.set(d.slice(0, 4));
      if (id === 0xA4) v.setFloat32(4, 0.01611328125, true);
      else if (id === 0xBE) v.setUint16(4, dev.R, true); else if (id === 0xBF) v.setUint16(4, 1, true);
      else if (id === 0xE000) v.setUint16(4, 7, true);
      else if (id === 0xE042) v.setUint16(4, 240, true);
      else if (id === 0xE010) v.setUint32(4, 0x4B4C4F4C, true);
    }
    else r.set(d);
    return r;
  }
  const queue = []; let waiter = null, text = '';
  function push(s) { const u = enc.encode(s); if (waiter) { const w = waiter; waiter = null; w({ value: u, done: false }); } else queue.push(u); }
  const port = {
    async open() {}, async close() {},
    readable: { getReader() { return {
      read() { if (queue.length) return Promise.resolve({ value: queue.shift(), done: false }); return new Promise((res) => { waiter = res; }); },
      releaseLock() {},
      cancel() { if (waiter) { const w = waiter; waiter = null; w({ value: undefined, done: true }); } return Promise.resolve(); }
    }; } },
    writable: { getWriter() { return {
      async write(u8) {
        text += dec.decode(u8);
        let i;
        while ((i = text.indexOf(CR)) >= 0) {
          const line = text.slice(0, i); text = text.slice(i + 1);
          if (line[0] === 't' && line.length === 21 && parseInt(line.substr(1, 3), 16) === 0x141) {
            const d = new Uint8Array(8);
            for (let k = 0; k < 8; k++) d[k] = parseInt(line.substr(5 + k * 2, 2), 16);
            setTimeout(() => push(frame(0x141, reply(d))), 2);
          }
        }
      },
      releaseLock() {}
    }; } }
  };
  port.getInfo = () => ({ usbVendorId: 0x0483, usbProductId: 0x5740 });
  Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => port, getPorts: async () => [port], addEventListener() {} }, configurable: true });
})();
