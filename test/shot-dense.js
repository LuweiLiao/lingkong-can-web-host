// 截图：连接、开启电机（自动采集）、等设置和 PID 自动读取；#tools 打开维护工具弹窗，#info 打开设备信息
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('load', async () => {
    await sl(200); $('#btnConnect').click(); await sl(900);
    $('#cOn').click(); await sl(4500);
    if (location.hash === '#tools') { $('#btnTools').click(); }
    if (location.hash === '#info') { document.querySelectorAll('details.pop')[1].open = true; $('#btnInfo').click(); await sl(2500); }
    await sl(600);
  });
})();
