// 调参页：运行时 PID/限制（0xC0/0xC1）、持久化 PID、响应测试
(function (LK) {
  'use strict';
  const app = LK.app, $ = app.$, P = LK.P;
  const LOOPS = [[10, '角度环', [0x0073, 0x0074]], [11, '速度环', [0x0078, 0x0079]], [12, '电流环', [0x007D, 0x007E]]];
  // 运行时限制：[选择器, 名称, 单位, 原始值到显示值的倍率]
  const LIMS = [[30, '扭矩限制', 'LSB', 1], [32, '速度限制', '°/s', 0.01], [34, '角度限制', '°', 0.01], [36, '电流斜率', 'LSB/s', 1], [38, '速度斜率', '°/s²', 1]];

  $('#pidBody').innerHTML = LOOPS.map((l) => '<tr><td>' + l[1] + '</td>' + [0, 1, 2].map((k) => '<td><input type="number" min="0" max="65535" id="pid' + l[0] + '_' + k + '"></td>').join('') + '</tr>').join('');
  $('#limBody').innerHTML = LIMS.map((l) => '<tr><td>' + l[1] + '</td><td><input type="number" step="any" id="lim' + l[0] + '"></td><td>' + l[2] + '</td></tr>').join('');

  // 运行时参数请求：回复需命令码和选择器都对上
  const rt = (d, timeout) => app.link.request(app.reqId(), d, { ext: app.ext(), timeout, match: (f) => f.id === app.ackId() && f.data[0] === d[0] && f.data[1] === d[1] });
  const u16 = (id) => { const v = Number($(id).value); if ($(id).value === '' || !Number.isInteger(v) || v < 0 || v > 65535) throw new Error('PID 系数必须是 0~65535 的整数'); return v; };

  async function readPid() {
    for (const l of LOOPS) {
      const r = P.rtDecode((await rt(P.rtRead(l[0]))).data);
      r.vals.forEach((v, k) => { $('#pid' + l[0] + '_' + k).value = v; });
    }
  }
  async function readLim() {
    for (const l of LIMS) {
      const r = P.rtDecode((await rt(P.rtRead(l[0]))).data);
      $('#lim' + l[0]).value = Number((r.vals[0] * l[3]).toFixed(4));
    }
  }
  $('#pidRead').onclick = () => app.safe(async () => { await readPid(); app.msg('已读取运行时 PID', 'ok'); });
  $('#limRead').onclick = () => app.safe(async () => { await readLim(); app.msg('已读取运行时限制', 'ok'); });
  $('#pidWrite').onclick = () => app.safe(async () => {
    const vals = LOOPS.map((l) => [0, 1, 2].map((k) => u16('#pid' + l[0] + '_' + k)));
    for (let i = 0; i < LOOPS.length; i++) {
      const r = P.rtDecode((await rt(P.rtWrite(LOOPS[i][0], vals[i]))).data);
      r.vals.forEach((v, k) => { $('#pid' + LOOPS[i][0] + '_' + k).value = v; });
    }
    app.msg('运行时 PID 已写入（重启后恢复为参数表中的值）', 'ok');
  });
  $('#limWrite').onclick = () => app.safe(async () => {
    const raws = LIMS.map((l) => {
      const v = Number($('#lim' + l[0]).value);
      if ($('#lim' + l[0]).value === '' || !isFinite(v)) throw new Error(l[1] + ' 无效');
      return Math.round(v / l[3]);
    });
    for (let i = 0; i < LIMS.length; i++) {
      const r = P.rtDecode((await rt(P.rtWrite(LIMS[i][0], [raws[i]]))).data);
      $('#lim' + LIMS[i][0]).value = Number((r.vals[0] * LIMS[i][3]).toFixed(4));
    }
    app.msg('运行时限制已写入，回填的是设备实际采用的值', 'ok');
  });
  $('#pidPersist').onclick = () => app.safe(async () => {
    const vals = LOOPS.map((l) => [u16('#pid' + l[0] + '_0'), u16('#pid' + l[0] + '_1')]);
    if (vals.some((a) => a.some((v) => v > 2000))) throw new Error('参数表中的 Kp/Ki 范围是 0~2000');
    if (!confirm('把 Kp、Ki 写入参数表（0x0073/74、0x0078/79、0x007D/7E）并保存到 Flash？Kd 不会保存。')) return;
    for (let i = 0; i < LOOPS.length; i++) for (let k = 0; k < 2; k++) await app.paramWrite(LOOPS[i][2][k], 3, vals[i][k]);
    const req = P.save();
    const r = await app.ask(req, 1000);
    if (P.hexBytes(r.data) !== P.hexBytes(req)) throw new Error('SAVE 失败');
    app.msg('Kp/Ki 已写入参数表并保存', 'ok');
  });

  // ==== 响应测试 ====
  // 测试数据画到右侧对应子图（速度环→速度图，位置环→角度图，电流环→电流图），这里只留 CSV 用的数据
  const ts = {
    mode: 'speed', rows: [], chs: [{ unit: '' }, { unit: '' }, { unit: '' }],
    clear() { this.rows = []; if (app.plotClear) app.plotClear('响应测试期间不采集此项'); },
    setWindow(s) { if (app.plotWindow) app.plotWindow(s); },
    push(t, v, s2) { this.rows.push([t].concat(v)); if (app.plotTest) app.plotTest(this.mode, v, s2); },
    toCSV() { const NL = String.fromCharCode(10); return 't_s,目标(' + this.chs[0].unit + '),实际(' + this.chs[1].unit + '),Iq(' + this.chs[2].unit + ')' + NL + this.rows.map((r) => r.map((x) => Number(Number(x).toFixed(4))).join(',')).join(NL); }
  };
  const LIMDEF = { speed: ['限扭 LSB', 0], pos: ['限速 °/s', 300], torque: null };
  const UNIT = { speed: '°/s', pos: '°', torque: 'LSB' };
  function onLoop() {
    const k = $('#tLoop').value, d = LIMDEF[k];
    $('#tLimLbl').hidden = !d;
    if (d) { $('#tLimLbl').firstChild.textContent = d[0] + ' '; $('#tLim').value = d[1]; }
    $('#tAmp').value = k === 'torque' ? 100 : k === 'pos' ? 30 : 60;
  }
  $('#tLoop').onchange = onLoop; onLoop();

  let running = false, abort = false;
  const STEP_T = 0.2;
  const wave = (w, t, a, per) => (w === 'step' ? (t < STEP_T ? 0 : a) : w === 'square' ? ((t % per) < per / 2 ? a : -a) : a * Math.sin((2 * Math.PI * t) / per));

  // 阶跃指标：上升时间(10%~90%)、超调、2% 调节时间、稳态误差
  function metrics(t, ref, y, a) {
    const idx = t.map((x, i) => i).filter((i) => t[i] >= STEP_T);
    if (idx.length < 10 || !a) return '数据太少，无法计算指标';
    const pre = t.map((x, i) => i).filter((i) => t[i] < STEP_T);
    const y0 = pre.length ? y[pre[pre.length - 1]] : 0;
    const d = a - y0, sgn = Math.sign(d) || 1;
    const at = (frac) => { const i = idx.find((k) => (y[k] - y0) * sgn >= Math.abs(d) * frac); return i === undefined ? NaN : t[i]; };
    const tr = at(0.9) - at(0.1);
    const peak = Math.max(...idx.map((k) => (y[k] - y0) * sgn));
    const os = ((peak - Math.abs(d)) / Math.abs(d)) * 100;
    const tail = idx.slice(Math.floor(idx.length * 0.8));
    const fin = tail.reduce((s, k) => s + y[k], 0) / tail.length;
    let tsl = NaN;
    for (let j = idx.length - 1; j >= 0; j--) { if (Math.abs(y[idx[j]] - a) > Math.abs(d) * 0.02) { tsl = j + 1 < idx.length ? t[idx[j + 1]] - STEP_T : NaN; break; } if (j === 0) tsl = 0; }
    const f = (v, n) => (isFinite(v) ? v.toFixed(n) : '-');
    return '上升时间 ' + f(tr * 1000, 0) + ' ms，超调 ' + f(Math.max(0, os), 1) + ' %，2% 调节时间 ' + (isFinite(tsl) ? f(tsl * 1000, 0) + ' ms' : '未稳定在 ±2% 内') + '，稳态误差 ' + f(a - fin, 3);
  }

  async function runTest() {
    if (running) return;
    const k = $('#tLoop').value, w = $('#tWave').value;
    const a = Number($('#tAmp').value), per = Math.max(0.05, Number($('#tPer').value) || 1);
    const dur = Math.min(60, Math.max(0.2, Number($('#tDur').value) || 3));
    const lim = Number($('#tLim').value) || 0, gap = Math.max(0, Number($('#tMs').value) || 0);
    if (!isFinite(a) || a === 0) throw new Error('幅值必须是非 0 数字');
    if (k === 'pos' && !(lim > 0)) throw new Error('位置环测试需要填写最大速度');
    if (k === 'torque' && !confirm('电流环测试会直接输出电流，空载时电机可能快速加速。确认电机已固定或堵转、并准备好急停？')) return;
    if (k !== 'torque' && !confirm('即将让电机按 ' + ({ step: '阶跃', square: '方波', sine: '正弦' })[w] + ' 运动 ' + dur + ' 秒，幅值 ' + a + ' ' + UNIT[k] + '。确认？')) return;
    $('#pollOn').checked = false; app.pollStop(); if (app.repStop) app.repStop();
    const s1 = P.state1((await app.ask(P.simple(0x9A))).data);
    if (s1.state !== 3 || s1.err) throw new Error('电机未处于开启状态或有故障，请先在“控制”页开启电机（当前：' + (P.STATES[s1.state] || s1.state) + '，' + P.errText(s1.err) + '）');
    running = true; abort = false;
    $('#tRun').disabled = true; $('#tMetrics').textContent = '测试中…';
    ts.mode = k; ts.clear(); ts.setWindow(Math.max(1, dur)); ts.chs[0].unit = UNIT[k]; ts.chs[1].unit = UNIT[k]; ts.chs[2].unit = app.iScale ? 'A' : 'LSB';
    const T = [], R = [], Y = [];
    let fail = 0;
    try {
      const start = k === 'pos' ? P.angleMulti((await app.ask(P.simple(0x92))).data) : 0;
      const t0 = performance.now();
      for (;;) {
        const t = (performance.now() - t0) / 1000;
        if (t >= dur || abort) break;
        const ref = wave(w, t, a, per);
        try {
          const cmd = k === 'speed' ? P.speed(ref, lim) : k === 'pos' ? P.posMulti(start + ref, lim) : P.torque(ref);
          const s = P.state2((await app.ask(cmd)).data);
          let y = k === 'speed' ? s.speed : s.iq;
          if (k === 'pos') y = P.angleMulti((await app.ask(P.simple(0x92))).data) - start;
          const tt = (performance.now() - t0) / 1000;
          ts.push(tt, [ref, y, app.iScale ? s.iq * app.iScale : s.iq], s);
          T.push(tt); R.push(ref); Y.push(y);
          fail = 0;
        } catch (e) {
          if (++fail >= 5) throw new Error('连续 5 次无回复，测试中止');
        }
        if (gap) await LK.sleep(gap);
      }
    } finally {
      try {
        if (abort) await app.tell(P.simple(0x81));
        else if (k === 'speed') await app.ask(P.speed(0, lim));
        else if (k === 'torque') await app.ask(P.torque(0));
      } catch (e) { /* 收尾失败只提示 */ app.msg('测试收尾命令失败：' + e.message, 'bad'); }
      running = false; $('#tRun').disabled = !app.link.connected;
    }
    const rate = T.length > 1 ? (T.length / (T[T.length - 1] - T[0])).toFixed(0) : '0';
    $('#tMetrics').textContent = (abort ? '已中止。' : '') + '采样 ' + T.length + ' 点（' + rate + ' Hz）。' + (w === 'step' && !abort ? metrics(T, R, Y, a) : '');
    app.msg(abort ? '测试已中止并发送停止' : '测试完成', abort ? 'warn' : 'ok');
  }

  $('#tRun').onclick = () => app.safe(runTest);
  $('#tAbort').onclick = () => app.safe(async () => { abort = true; if (!running) { await app.tell(P.simple(0x81)); app.msg('已发送停止 0x81', 'ok'); } });
  $('#tCsv').onclick = () => app.download('响应测试_' + app.stamp() + '.csv', String.fromCharCode(0xFEFF) + ts.toCSV(), 'text/csv');
  app.on('halt', () => { abort = true; });
  app.on('beforeDisconnect', () => { abort = true; });
  app.on('connected', () => { $('#tRun').disabled = running; });
  // 连接后自动读一次运行时 PID 和限制（只读）
  app.on('connected', () => setTimeout(() => app.safe(async () => { await readPid(); await readLim(); }), 1500));
})(window.LK = window.LK || {});
