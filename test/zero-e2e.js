// 零点与角度测试（模拟设备 R=10，多圈 252118°）：换算显示、设零点、清多圈。结果写到 #e2e
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (id) => $('#' + id).textContent;
  window.addEventListener('load', async () => {
    const out = {};
    try {
      window.confirm = () => true;
      await sl(200); $('#btnConnect').click(); await sl(2500);
      $('#mMode').value = 'A5'; $('#mMode').dispatchEvent(new Event('change'));
      $('#mTarget').value = '118'; $('#mSend').click(); await sl(1500);
      out.hint = txt('mHint');
      out.before = { R: txt('zR'), multi: txt('zMulti'), turns: txt('zTurns'), out: txt('zOut'), enc: txt('zEnc'), single: txt('dAngle1') };
      $('#cZero').click(); await sl(800);
      out.afterZero = { msg: txt('stMsg'), multi: txt('zMulti'), turns: txt('zTurns'), enc: txt('zEnc') };
      out.zOffsetBtn = !!$('#zOffset') && !$('#zOffset').disabled;
    } catch (e) { out.error = String(e); }
    const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = 'E2E ' + JSON.stringify(out); document.body.appendChild(pre);
  });
})();
