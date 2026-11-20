// 曲线区：角度、速度、电流、母线电压、母线电流、编码器位置各一个子图，共用一套工具条
(function (LK) {
  'use strict';
  const app = LK.app, $ = app.$;
  const C = { blue: '#3fa7ff', green: '#3ecf8e', orange: '#f5a524', red: '#ff6b6b', violet: '#b48cff', cyan: '#4dd0e1', pink: '#f06292', lime: '#c0ca33', white: '#dbe4ee' };
  // 每个子图：[通道名, 单位, 颜色]；同一子图的通道叠在同一个坐标轴里
  const PLOTS = [
    { key: 'ang', title: '多圈角度', chs: [['角度', '°', C.blue], ['目标', '°', C.white]] },
    { key: 'spd', title: '速度', chs: [['速度', '°/s', C.green], ['目标', '°/s', C.white]] },
    { key: 'cur', title: '电流', chs: [['Iq', 'A', C.orange], ['目标', 'A', C.white], ['Ia', 'A', C.violet], ['Ib', 'A', C.cyan], ['Ic', 'A', C.pink]] },
    { key: 'vol', title: '母线电压', chs: [['电压', 'V', C.cyan]] },
    { key: 'ibus', title: '母线电流', chs: [['电流', 'A', C.pink]] },
    { key: 'enc', title: '编码器位置', chs: [['编码器', '', C.lime]] }
  ];
  const grid = $('#plotGrid'), sc = {};
  PLOTS.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'pcard';
    card.innerHTML = '<div class="phead"><span class="pdot" style="background:' + p.chs[0][2] + '"></span>' + p.title + '</div><canvas></canvas>';
    grid.appendChild(card);
    const s = new LK.Scope(card.querySelector('canvas'), p.chs.map((c) => ({ name: c[0], unit: c[1], lane: 0 })));
    s.chs.forEach((c, i) => { c.color = p.chs[i][2]; });
    sc[p.key] = s;
  });
  const all = Object.values(sc);
  // 时间轴联动：任一子图缩放或拖动，其它子图跟着变；纵轴缩放各自独立
  all.forEach((s) => { s.onView = (v) => all.forEach((o) => { if (o !== s) { o.view = v ? v.slice() : null; o.dirty = true; } }); });
  app.scope = sc.ang;

  // 所有子图同一时刻一起推数据，保证时间轴一致，导出 CSV 时可以直接按行对齐
  let t0 = 0, n = 0, nT = performance.now();
  function pushAll(v) {
    const now = performance.now();
    if (!sc.ang.t.length) t0 = now;
    const t = (now - t0) / 1000;
    PLOTS.forEach((p) => sc[p.key].push(t, v[p.key] || []));
    n++;
    if (now - nT > 1000) { $('#scInfo').textContent = '采样 ' + (n * 1000 / (now - nT)).toFixed(1) + ' 点/s'; n = 0; nT = now; }
  }
  const cur = (raw) => (raw === undefined || raw === null ? NaN : app.iScale ? raw * app.iScale : raw);
  const curUnit = () => { const u = app.iScale ? 'A' : 'LSB'; sc.cur.chs.forEach((c) => { c.unit = u; }); };

  // 轮询数据：目标值按当前运动模式叠到对应子图
  app.on('sample', (L) => {
    const s2 = L.s2 || {}, s1 = L.s1 || {}, s3 = L.s3 || {}, m = app.lastMode, tg = app.lastTarget, has = tg !== undefined;
    const three = app.want.s3;
    curUnit();
    pushAll({
      ang: [L.ang === null ? NaN : L.ang, has && (m === 'A3' || m === 'A4') ? tg : NaN],
      spd: [s2.speed, has && m === 'A2' ? tg : NaN],
      cur: [cur(s2.iq), has && m === 'A1' ? cur(tg) : NaN, three ? cur(s3.ia) : NaN, three ? cur(s3.ib) : NaN, three ? cur(s3.ic) : NaN],
      vol: [s1.vbus], ibus: [s1.ibus], enc: [s2.enc]
    });
  });
  // 响应测试数据：v = [目标, 实际, Iq]
  app.plotTest = (mode, v, s2) => {
    curUnit();
    pushAll({
      ang: mode === 'pos' ? [v[1], v[0]] : [],
      spd: mode === 'speed' ? [v[1], v[0]] : [],
      cur: mode === 'torque' ? [v[2], cur(v[0])] : [v[2]],
      enc: s2 ? [s2.enc] : []
    });
  };
  app.plotClear = (txt) => all.forEach((s) => { s.clear(); s.emptyText = txt || ''; });
  app.plotWindow = (s) => all.forEach((x) => x.setWindow(s));

  // 工具条
  const syncBtn = () => {
    const on = $('#pollOn').checked, b = $('#scStart');
    b.textContent = on ? '停止采集' : '开始采集';
    b.classList.toggle('primary', !on); b.classList.toggle('danger', on);
  };
  setInterval(syncBtn, 300);
  $('#scStart').onclick = () => {
    if ($('#pollOn').checked) { $('#pollOn').checked = false; app.pollStop(); }
    else { all.forEach((s) => { s.emptyText = ''; }); app.plotWindow(Number($('#scWin').value)); $('#pollOn').checked = true; app.pollStart(); }
    syncBtn();
  };
  $('#scPause').onclick = () => { const p = !sc.ang.paused; all.forEach((s) => s.setPaused(p)); $('#scPause').textContent = p ? '继续' : '暂停'; };
  $('#scClear').onclick = () => app.plotClear();
  $('#scWin').onchange = () => app.plotWindow(Number($('#scWin').value));
  app.want.s1 = $('#scS1').checked;
  $('#scS1').onchange = () => { app.want.s1 = $('#scS1').checked; };
  $('#scS3').onchange = () => { app.want.s3 = $('#scS3').checked; };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  app.stamp = stamp;
  app.download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // CSV：一行一个时刻，列为全部子图的全部通道
  $('#scCsv').onclick = () => {
    const NL = String.fromCharCode(10), head = ['t_s'], cols = [];
    PLOTS.forEach((p) => sc[p.key].chs.forEach((c) => { head.push(p.title + '-' + c.name + (c.unit ? '(' + c.unit + ')' : '')); cols.push(c.v); }));
    const t = sc.ang.t, out = [head.join(',')];
    for (let i = 0; i < t.length; i++) out.push(t[i].toFixed(4) + ',' + cols.map((v) => (isNaN(v[i]) ? '' : v[i])).join(','));
    app.download('曲线_' + stamp() + '.csv', String.fromCharCode(0xFEFF) + out.join(NL), 'text/csv');
  };
  // 截图：把 6 个子图按页面上的位置拼成一张 PNG
  $('#scPng').onclick = () => {
    const g = grid.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const out = document.createElement('canvas');
    out.width = Math.round(g.width * dpr); out.height = Math.round(g.height * dpr);
    const x = out.getContext('2d');
    x.fillStyle = '#0c1117'; x.fillRect(0, 0, out.width, out.height);
    grid.querySelectorAll('.pcard').forEach((card) => {
      const r = card.getBoundingClientRect(), cv = card.querySelector('canvas'), cr = cv.getBoundingClientRect();
      x.fillStyle = '#dbe4ee'; x.font = Math.round(13 * dpr) + 'px sans-serif';
      x.fillText(card.querySelector('.phead').textContent, (r.left - g.left + 10) * dpr, (r.top - g.top + 18) * dpr);
      x.drawImage(cv, (cr.left - g.left) * dpr, (cr.top - g.top) * dpr, cr.width * dpr, cr.height * dpr);
    });
    const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = '曲线_' + stamp() + '.png'; a.click();
  };
})(window.LK = window.LK || {});
