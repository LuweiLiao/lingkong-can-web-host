// 自动操作页面并把结果写到 #e2e
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('load', async () => {
    const out = {};
    try {
      await sl(200); $('#btnConnect').click(); await sl(800);
      out.conn = $('#connState').textContent; out.msgConn = $('#stMsg').textContent;
      $('#cOn').click(); await sl(600);
      out.afterOn = $('#stMsg').textContent; out.dState = $('#dState').textContent; out.dErr = $('#dErr').textContent;
      $('#pollOn').checked = true; $('#pollOn').dispatchEvent(new Event('change')); await sl(2000);
      $('#pollOn').checked = false; $('#pollOn').dispatchEvent(new Event('change'));
      out.scopePoints = window.LK.app.scope.t.length;
      out.speed = $('#dSpeed').textContent; out.angle = $('#dAngle').textContent; out.iq = $('#dIq').textContent;
      out.vbus = $('#dVbus').textContent; out.angle1 = $('#dAngle1').textContent;
      $('#mSend').click(); await sl(400);
      out.motion = $('#mFrame').textContent + ' | ' + $('#mReply').textContent;
      $('#btnInfo').click(); await sl(1500);
      out.info = $('#devInfo').textContent;
      out.rx = $('#stRx').textContent; out.tx = $('#stTx').textContent;
      $('#btnConnect').click(); await sl(300);
      out.afterDisc = $('#connState').textContent;
    } catch (e) { out.error = String(e); }
    const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = 'E2E ' + JSON.stringify(out); document.body.appendChild(pre);
  });
})();
