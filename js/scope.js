// 波形示波器：Canvas 绘制；lane 相同的通道叠在同一坐标轴
// 交互：滚轮缩放时间轴，Ctrl/Shift + 滚轮缩放纵轴，左键或中键拖动平移，双击回到实时跟随
(function (LK) {
  'use strict';
  const COLORS = ['#3fa7ff', '#3ecf8e', '#f5a524', '#ff5d5d', '#b48cff', '#4dd0e1', '#f06292', '#c0ca33'];
  const NL = String.fromCharCode(10);
  const fmt = (v) => (isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3)) : '-');

  // chs: [{ name, unit, lane }]，时间单位为秒
  class Scope {
    constructor(canvas, chs) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.chs = chs.map((c, i) => Object.assign({ on: true, has: false, color: COLORS[i % COLORS.length], v: [] }, c));
      this.t = []; this.win = 10; this.paused = false; this.freeze = 0; this.max = 200000; this.hx = null; this.dirty = true;
      this.view = null;   // null=实时跟随；[a, b]=固定时间范围
      this.yFix = null;   // null=纵轴自动；[mn, mx]=固定纵轴
      this.onView = null; // 时间范围变化时回调，用来联动其它子图
      this.lay = null; this.drag = null;
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('mousemove', (e) => { this.hx = pos(e)[0]; this.dirty = true; });
      canvas.addEventListener('mouseleave', () => { this.hx = null; this.dirty = true; });
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); this._wheel(e, pos(e)); }, { passive: false });
      canvas.addEventListener('mousedown', (e) => {
        if ((e.button !== 0 && e.button !== 1) || !this.lay) return;
        e.preventDefault();
        const l = this.lay;
        this.drag = { x: e.clientX, y: e.clientY, v: [l.t0, l.t0 + l.win], yf: this.yFix ? this.yFix.slice() : null, l, moved: false };
      });
      window.addEventListener('mousemove', (e) => {
        const d = this.drag; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        d.moved = true; canvas.style.cursor = 'grabbing';
        const dt = (-dx / d.l.pw) * d.l.win;
        this.setView([d.v[0] + dt, d.v[1] + dt], true);
        if (d.yf) { const dv = (dy / (d.l.y1 - d.l.top)) * (d.yf[1] - d.yf[0]); this.yFix = [d.yf[0] + dv, d.yf[1] + dv]; }
      });
      window.addEventListener('mouseup', () => { if (this.drag) { this.drag = null; canvas.style.cursor = ''; } });
      canvas.addEventListener('dblclick', () => { this.yFix = null; this.setView(null, true); });
      const loop = () => { if (!this.paused || this.dirty) { this.draw(); this.dirty = false; } requestAnimationFrame(loop); };
      loop();
    }

    _wheel(e, p) {
      const l = this.lay; if (!l) return;
      const f = e.deltaY > 0 ? 1.25 : 0.8;
      if (e.ctrlKey || e.shiftKey) {
        const yv = l.mn + ((l.y1 - p[1]) / (l.y1 - l.top)) * (l.mx - l.mn);
        this.yFix = [yv - (yv - l.mn) * f, yv + (l.mx - yv) * f]; this.dirty = true;
        return;
      }
      const tc = l.t0 + (Math.min(Math.max(p[0] - l.L, 0), l.pw) / l.pw) * l.win;
      let a = tc - (tc - l.t0) * f, b = tc + (l.t0 + l.win - tc) * f;
      if (b - a < 0.02) { const m = (a + b) / 2; a = m - 0.01; b = m + 0.01; }
      this.setView([a, b], true);
    }

    setView(v, emit) { this.view = v; this.dirty = true; if (emit && this.onView) this.onView(v); }

    push(t, vals) {
      this.t.push(t);
      this.chs.forEach((c, i) => { const x = vals[i] === undefined ? NaN : vals[i]; c.v.push(x); if (!isNaN(x)) c.has = true; });
      if (this.t.length > this.max) {
        const n = this.t.length - this.max + 10000;
        this.t.splice(0, n); this.chs.forEach((c) => c.v.splice(0, n));
      }
    }

    clear() { this.t.length = 0; this.chs.forEach((c) => { c.v.length = 0; c.has = false; }); this.view = null; this.yFix = null; this.dirty = true; }
    setWindow(s) { this.win = s; this.view = null; this.dirty = true; }
    setPaused(b) { this.paused = b; this.freeze = this.t.length ? this.t[this.t.length - 1] : 0; this.dirty = true; }
    setOn(i, b) { this.chs[i].on = b; this.dirty = true; }

    // 第一个 t >= x 的下标
    _lower(x) {
      let lo = 0, hi = this.t.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (this.t[m] < x) lo = m + 1; else hi = m; }
      return lo;
    }

    draw() {
      const cv = this.cv, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = this.ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0a0f15'; g.fillRect(0, 0, W, H);
      const on = this.chs.filter((c) => c.on && c.has), n = this.t.length;
      if (!on.length || !n) { this.lay = null; g.fillStyle = '#7d91a5'; g.font = '13px sans-serif'; const et = this.emptyText || '暂无数据'; g.fillText(et, (W - g.measureText(et).width) / 2, H / 2); return; }
      const groups = [], gi = {};
      on.forEach((c) => { const k = c.lane === undefined ? 'c' + this.chs.indexOf(c) : 'l' + c.lane; if (!(k in gi)) { gi[k] = groups.length; groups.push([]); } groups[gi[k]].push(c); });
      const L = 64, R = 10, T = 4, B = 20, pw = W - L - R, lh = (H - T - B) / groups.length;
      const latest = this.paused ? this.freeze : this.t[n - 1];
      const t0 = this.view ? this.view[0] : latest - this.win, win = this.view ? this.view[1] - this.view[0] : this.win, tEnd = t0 + win;
      const i0 = Math.max(0, this._lower(t0) - 1), i1 = Math.min(n, this._lower(tEnd) + 1);
      const X = (t) => L + ((t - t0) / win) * pw;
      g.font = '11px Consolas,monospace'; g.lineWidth = 1;
      const dig = win < 1 ? 3 : win < 10 ? 2 : 1;
      const NT = pw < 300 ? 3 : pw < 480 ? 4 : 5;
      for (let k = 0; k <= NT; k++) {
        const x = Math.round(L + (pw * k) / NT) + 0.5;
        g.strokeStyle = '#1a2330'; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke();
        const lab = this.view ? (t0 + (win * k) / NT).toFixed(dig) + 's' : (-(win * (NT - k)) / NT).toFixed(1) + 's';
        g.fillStyle = '#7d91a5'; g.textAlign = k === 0 ? 'left' : k === NT ? 'right' : 'center'; g.fillText(lab, x, H - 6);
      }
      g.textAlign = 'left';
      const lanes = [];
      groups.forEach((cs, j) => {
        const y0 = T + j * lh, y1 = y0 + lh - 4, top = y0 + 20;
        let mn = Infinity, mx = -Infinity;
        if (this.yFix) { mn = this.yFix[0]; mx = this.yFix[1]; } else {
          cs.forEach((c) => { for (let i = i0; i < i1; i++) { const v = c.v[i]; if (v < mn) mn = v; if (v > mx) mx = v; } });
          if (!isFinite(mn)) { mn = 0; mx = 1; }
          if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
          const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
        }
        const Y = (v) => y1 - ((v - mn) / (mx - mn)) * (y1 - top);
        if (j === 0) this.lay = { L, pw, t0, win, top, y1, mn, mx };
        g.strokeStyle = '#243040'; g.strokeRect(L + 0.5, y0 + 0.5, pw, y1 - y0);
        for (let k = 1; k < 4; k++) { const y = Math.round(top + ((y1 - top) * k) / 4) + 0.5; g.strokeStyle = '#151d27'; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
        if (mn < 0 && mx > 0) { g.strokeStyle = '#34445a'; g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(L + pw, Y(0)); g.stroke(); }
        g.fillStyle = '#7d91a5'; g.fillText(fmt(mx), 2, top + 4); g.fillText(fmt((mn + mx) / 2), 2, (top + y1) / 2 + 4); g.fillText(fmt(mn), 2, y1 - 2);
        g.save(); g.beginPath(); g.rect(L, y0, pw, y1 - y0); g.clip();
        cs.forEach((c) => {
          g.beginPath(); let pen = false;
          for (let i = i0; i < i1; i++) {
            const v = c.v[i]; if (isNaN(v)) { pen = false; continue; }
            const x = X(this.t[i]), y = Y(v);
            if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
          }
          g.strokeStyle = c.color; g.lineWidth = 1.4; g.stroke(); g.lineWidth = 1;
        });
        g.restore();
        let lx = L + 6;
        cs.forEach((c, ci) => {
          g.fillStyle = c.color; g.font = '12px sans-serif';
          const label = c.name + ' ' + fmt(c.v[Math.max(i0, i1 - 1)]) + (c.unit ? ' ' + c.unit : '');
          g.fillText(label, lx, y0 + 14); lx += g.measureText(label).width + 14;
          g.font = '11px Consolas,monospace';
          lanes.push({ c, y0: y0 + ci * 14, y1 });
        });
      });
      if (this.view || this.yFix) { const s = '缩放中 · 双击复位'; g.fillStyle = '#f5a524'; g.font = '11px sans-serif'; g.fillText(s, L + pw - g.measureText(s).width - 6, T + 14); g.font = '11px Consolas,monospace'; }
      if (this.hx !== null && !this.drag && this.hx >= L && this.hx <= L + pw && i1 > i0) {
        let k = this._lower(t0 + ((this.hx - L) / pw) * win);
        k = Math.min(Math.max(k, i0), i1 - 1);
        g.strokeStyle = '#7d91a5'; g.beginPath(); g.moveTo(this.hx, T); g.lineTo(this.hx, H - B); g.stroke();
        const tx = Math.min(this.hx + 6, L + pw - 90);
        lanes.forEach((l) => { g.fillStyle = l.c.color; g.fillText(fmt(l.c.v[k]) + (l.c.unit ? ' ' + l.c.unit : ''), tx, l.y0 + 30); });
        g.fillStyle = '#dbe4ee'; g.fillText('t=' + this.t[k].toFixed(3) + 's', tx, H - 6);
      }
    }

    toCSV() {
      const names = this.chs.map((c) => c.name + (c.unit ? '(' + c.unit + ')' : ''));
      const out = ['t_s,' + names.join(',')];
      for (let i = 0; i < this.t.length; i++) out.push(this.t[i].toFixed(4) + ',' + this.chs.map((c) => (isNaN(c.v[i]) ? '' : c.v[i])).join(','));
      return out.join(NL);
    }
  }

  LK.Scope = Scope;
})(window.LK = window.LK || {});
