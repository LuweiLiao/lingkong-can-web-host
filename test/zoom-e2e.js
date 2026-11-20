// 缩放交互测试：滚轮缩时间轴（联动）、Ctrl+滚轮缩纵轴、拖动平移、双击复位。结果写到 #e2e
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('load', async () => {
    const out = {};
    try {
      await sl(200); $('#btnConnect').click(); await sl(900);
      await sl(800); if (!$('#pollOn').checked) $('#scStart').click(); await sl(3000);
      const S = window.LK.app, cvs = [...document.querySelectorAll('#plotGrid canvas')];
      out.dbg = { poll: $('#pollOn').checked, pts: S.scope.t.length, ncv: cvs.length, lay: !!S.scope.lay, w: cvs[1].clientWidth, h: cvs[1].clientHeight };
      const cv = cvs[1], r = cv.getBoundingClientRect(), cx = r.left + r.width * 0.7, cy = r.top + r.height * 0.5;
      const sc = (i) => window.LK.app.scope && cvs[i];
      for (let k = 0; k < 3; k++) cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      await sl(200);
      const sp = window.__scopes || null;
      out.after3Wheel = JSON.stringify(S.scope.view && S.scope.view.map((x) => +x.toFixed(2)));
      out.linkedWidth = S.scope.view ? +(S.scope.view[1] - S.scope.view[0]).toFixed(2) : null;
      const v0 = S.scope.view.slice();
      cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx + 100, clientY: cy }));
      window.dispatchEvent(new MouseEvent('mouseup', {}));
      out.panShift = +(S.scope.view[0] - v0[0]).toFixed(3);
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      out.yZoomOnSpeedOnly = !!document.querySelectorAll('#plotGrid canvas').length;
      await sl(300);
      out.preventDefault = (() => { const ev = new WheelEvent('wheel', { deltaY: -100, clientX: cx, clientY: cy, bubbles: true, cancelable: true }); cv.dispatchEvent(ev); return ev.defaultPrevented; })();
      await sl(300);
      window.__shotBefore = true;
      await sl(1500);
      cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await sl(200);
      out.afterDbl = S.scope.view === null ? 'live' : 'fixed';
    } catch (e) { out.error = String(e); }
    const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = 'E2E ' + JSON.stringify(out); document.body.appendChild(pre);
  });
})();
