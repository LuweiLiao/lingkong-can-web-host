// 设置区端到端：读取前点应用不能写入；改值、应用、保存、超范围拒绝。结果写到 #e2e
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const row = (label) => [...document.querySelectorAll('.srow')].find((r) => r.querySelector('.sl').textContent === label);
  const num = (r, k) => r.querySelectorAll('.c-n input[type=number]')[k];
  window.addEventListener('load', async () => {
    const out = {};
    try {
      window.confirm = () => true;
      await sl(200); $('#btnConnect').click(); await sl(300);
      $('#sApply').click(); await sl(300);
      out.applyBeforeRead = $('#stMsg').textContent;
      await sl(3000);
      out.read = $('#sInfo').textContent;
      const r = row('过压'), n = num(r, 0), lvl = r.querySelector('select.lvl');
      n.value = '60'; n.dispatchEvent(new Event('input'));
      lvl.value = '2'; lvl.dispatchEvent(new Event('change'));
      out.dirtyBefore = document.querySelectorAll('.ctl.dirty').length;
      $('#sApply').click(); await sl(800);
      out.apply = $('#stMsg').textContent;
      out.after = n.value + ' | ' + lvl.value + ' | color=' + lvl.dataset.v;
      out.dirtyAfter = document.querySelectorAll('.ctl.dirty').length;
      $('#sSave').click(); await sl(600);
      out.save = $('#stMsg').textContent;
      const n2 = num(row('欠压'), 0);
      n2.value = '500'; n2.dispatchEvent(new Event('input'));
      $('#sApply').click(); await sl(500);
      out.range = $('#stMsg').textContent + ' | ' + $('#stMsg').className;
    } catch (e) { out.error = String(e); }
    const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = 'E2E ' + JSON.stringify(out); document.body.appendChild(pre);
  });
})();
