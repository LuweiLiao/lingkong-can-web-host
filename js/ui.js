// 界面小交互：点击别处时收起顶栏弹出框；“维护工具”弹窗的打开和关闭
(function () {
  'use strict';
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.pop[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  const dlg = document.getElementById('toolsDlg');
  document.getElementById('btnTools').onclick = () => dlg.showModal();
  document.getElementById('dlgClose').onclick = () => dlg.close();
  // 点弹窗外的遮罩也关闭
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
})();
