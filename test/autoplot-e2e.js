// 自动采集测试：连上时电机已开启→自动采集；停止采集后点“开启电机”→再次自动采集
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('load', async () => {
    const out = {};
    try {
      await sl(200); $('#btnConnect').click(); await sl(3000);
      out.onConnect = $('#pollOn').checked; out.btn1 = $('#scStart').textContent; out.pts1 = window.LK.app.scope.t.length;
      $('#scStart').click(); await sl(400);
      out.afterStop = $('#pollOn').checked;
      $('#cOn').click(); await sl(1500);
      out.afterOn = $('#pollOn').checked; out.btn2 = $('#scStart').textContent; out.msg = $('#stMsg').textContent;
    } catch (e) { out.error = String(e); }
    const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = 'E2E ' + JSON.stringify(out); document.body.appendChild(pre);
  });
})();
