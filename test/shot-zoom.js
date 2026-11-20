// 截图：连接、采集，然后对速度子图滚轮放大 3 次并 Ctrl+滚轮放大纵轴
(function () {
  const $ = (s) => document.querySelector(s);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('load', async () => {
    await sl(200); $('#btnConnect').click(); await sl(900);
    $('#cOn').click(); await sl(300);
    $('#scStart').click(); await sl(6000);
    if (location.hash === '#zoom') {
      const cv = document.querySelectorAll('#plotGrid canvas')[1], r = cv.getBoundingClientRect(), x = r.left + r.width * 0.6, y = r.top + r.height * 0.5;
      for (let k = 0; k < 3; k++) cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      $('#pollOn').checked = false; window.LK.app.pollStop();
    }
    await sl(600);
  });
})();
