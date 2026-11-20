// 主逻辑：全局状态、事件总线、连接管理、页签切换、状态栏
(function (LK) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const P = LK.P;
  const app = { link: new LK.Slcan(), ev: {}, ratio: 1, iScale: 0 };
  LK.app = app;
  app.$ = $;
  app.on = (n, f) => { (app.ev[n] = app.ev[n] || []).push(f); };
  app.emit = (n, a) => { (app.ev[n] || []).forEach((f) => { try { f(a); } catch (e) { console.error(e); } }); };
  app.node = () => Math.min(63, Math.max(1, Number($('#nodeId').value) || 1));
  app.ext = () => $('#frameFmt').value === '1';
  app.reqId = () => P.reqId(app.node());
  app.ackId = () => P.ackId(app.node(), $('#ackMode').value === '1');
  app.msg = (s, cls) => { const e = $('#stMsg'); e.textContent = s; e.className = cls || ''; };
  // 一问一答：发请求并等回复（默认超时 150 ms，大于固件 10 ms 确认边界）
  app.ask = (data, timeout) => app.link.request(app.reqId(), data, { ext: app.ext(), ackId: app.ackId(), timeout: timeout });
  // 只发不等（用于连续控制）
  app.tell = (data) => app.link.send(app.reqId(), data, app.ext());
  // 执行并把错误显示到状态栏，失败返回 null
  app.safe = async (fn) => { try { return await fn(); } catch (e) { app.msg(e.message, 'bad'); return null; } };

  // ==== 页签切换 ====
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
      app.emit('tab', b.dataset.tab);
    };
  });

  // ==== 连接管理 ====
  function setConn(on) {
    const s = $('#connState');
    s.textContent = on ? '已连接' : '未连接';
    s.className = 'badge ' + (on ? 'on' : 'off');
    $('#btnConnect').textContent = on ? '断开' : '连接';
    ['#btnStop', '#btnOff'].forEach((q) => { $(q).disabled = !on; });
    ['#portSel', '#btnAddPort', '#serialBaud', '#canKbps', '#listenOnly'].forEach((q) => { $(q).disabled = on; });
    document.querySelectorAll('.net').forEach((b) => { b.disabled = !on; });
    app.emit(on ? 'connected' : 'disconnected');
  }
  app.setConn = setConn;

  app.disconnect = async () => {
    app.emit('beforeDisconnect');
    await app.link.disconnect();
    setConn(false);
    app.msg('已断开');
  };
  app.link.onClose = (e) => {
    app.emit('beforeDisconnect');
    setConn(false);
    app.msg('串口意外断开：' + (e ? e.message : ''), 'bad');
  };
  $('#btnConnect').onclick = async () => {
    if (app.link.connected) { await app.disconnect(); return; }
    try {
      const port = app.selectedPort();
      if (!port) { app.msg('还没有已授权的串口，请先点“添加串口…”选择设备', 'warn'); return; }
      await app.link.connect({ port, baud: Number($('#serialBaud').value), canKbps: Number($('#canKbps').value), listenOnly: $('#listenOnly').checked });
      setConn(true);
      app.msg('已连接，节点 ' + app.node() + '，请求 ID 0x' + app.reqId().toString(16).toUpperCase());
    } catch (e) {
      app.msg('连接失败：' + e.message, 'bad');
    }
  };

  // 顶部快捷键：停止 0x81 / 关闭 0x80。直接发送不排队，同时停止连续发送和调参测试
  const quick = (c, txt) => app.safe(async () => {
    if (app.repStop) app.repStop();
    app.emit('halt');
    await app.tell(P.simple(c));
    app.msg(txt, 'ok');
  });
  $('#btnStop').onclick = () => quick(0x81, '已发送停止 0x81');
  $('#btnOff').onclick = () => quick(0x80, '已发送关闭 0x80');

  // 状态栏收发计数
  app.link.onFrame = (f) => app.emit('frame', f);
  app.link.onTx = (f) => app.emit('tx', f);
  setInterval(() => {
    $('#stRx').textContent = 'RX ' + app.link.rxCount;
    $('#stTx').textContent = 'TX ' + app.link.txCount;
  }, 500);

  // ==== SECTION: poll（状态轮询、总览刷新）====
  const f2 = (v, n) => (isFinite(v) ? v.toFixed(n) : '-');
  app.last = { s1: null, s2: null, s3: null, ang: null, ang1: null };
  const set = (id, t) => { const e = $('#' + id); if (e) e.textContent = t; };
  const amp = (raw) => (app.iScale ? f2(raw * app.iScale, 3) + ' A' : raw + ' LSB');

  // 读取全局换算量：相电流比例 0x00A4、减速比 R
  app.loadScales = async () => {
    const rd = async (id) => { const r = P.paramReply((await app.ask(P.paramRead(id, 7))).data); return r.status === 0 ? r.value : null; };
    const rdU16 = async (id) => { const r = P.paramReply((await app.ask(P.paramRead(id, 3))).data); return r.status === 0 ? r.value : null; };
    const s = await rd(0x00A4);
    if (s) app.iScale = s;
    const n = await rdU16(0x00BE), d = await rdU16(0x00BF);
    if (n && d) app.ratio = n / d;
  };

  app.showS1 = (s) => {
    const hero = $('#hero'); if (hero) hero.dataset.st = (s.err || s.state === 1) ? 'err' : s.state === 3 ? 'on' : s.state === 4 ? 'cal' : 'off';
    set('dState', P.STATES[s.state] !== undefined ? P.STATES[s.state] : '状态 ' + s.state);
    const e = $('#dErr'); e.textContent = s.err ? '0x' + s.err.toString(16).toUpperCase() + ' ' + P.errText(s.err) : '无故障'; e.className = s.err ? 'bad' : 'ok'; e.title = e.textContent;
    set('dTemp', s.temp + ' °C'); set('dVbus', f2(s.vbus, 2) + ' V'); set('dIbus', f2(s.ibus, 2) + ' A');
  };
  app.showS2 = (s) => {
    set('dTemp', s.temp + ' °C'); set('dIq', amp(s.iq)); set('dSpeed', s.speed + ' °/s'); set('dEnc', String(s.enc));
  };
  app.showS3 = (s) => { set('dIa', amp(s.ia)); set('dIb', amp(s.ib)); set('dIc', amp(s.ic)); };

  // 读一轮状态：一次一请求一应答；单项失败不影响其它项
  async function pollOnce(full) {
    const q = async (d, fn) => { try { const r = await app.ask(d); fn(r.data); return true; } catch (e) { return false; } };
    let ok = 0;
    ok += await q(P.simple(0x9C), (d) => { app.last.s2 = P.state2(d); app.showS2(app.last.s2); app.emit('s2', app.last.s2); }) ? 1 : 0;
    ok += await q(P.simple(0x92), (d) => { app.last.ang = P.angleMulti(d); set('dAngle', f2(app.last.ang, 2) + ' °'); app.emit('ang', app.last.ang); }) ? 1 : 0;
    if (full || app.want.s1) {
      ok += await q(P.simple(0x9A), (d) => { app.last.s1 = P.state1(d); app.showS1(app.last.s1); app.emit('s1', app.last.s1); }) ? 1 : 0;
    }
    if (full || app.want.s3) {
      ok += await q(P.simple(0x9D), (d) => { app.last.s3 = P.state3(d); app.showS3(app.last.s3); app.emit('s3', app.last.s3); }) ? 1 : 0;
    }
    {
      ok += await q(P.simple(0x94), (d) => { app.last.ang1 = P.angleSingle(d); set('dAngle1', f2(app.last.ang1, 2) + ' °'); }) ? 1 : 0;
    }
    app.emit('sample', app.last);
    return ok;
  }
  app.want = { s1: false, s3: false };
  // 零点与角度卡片：多圈 = 输出端圈数 × 360R + 单圈；编码器 0~65535 对应单圈 0~360R
  function showZero() {
    const L = app.last, R = app.ratio || 1, S = 360 * R;
    set('zR', '减速比 R = ' + Number(R.toFixed(4)));
    if (L.ang !== null && L.ang !== undefined) {
      const turns = Math.floor(L.ang / S), rem = L.ang - turns * S;
      set('zMulti', f2(L.ang, 2) + ' °');
      set('zTurns', turns + ' 圈 + ' + f2(rem, 2) + ' °');
      set('zOut', f2(L.ang / R, 2) + ' °');
    }
    if (L.s2) set('zEnc', L.s2.enc + ' ≈ ' + f2((L.s2.enc / 65536) * S, 2) + ' °');
  }
  app.on('sample', showZero);
  app.pollOnce = pollOnce;

  let pollTimer = 0, pollBusy = false, pollN = 0, pollT0 = 0, pollCycle = 0;
  function pollStop() { clearTimeout(pollTimer); pollTimer = 0; set('pollRate', ''); }
  async function pollTick() {
    if (!$('#pollOn').checked || !app.link.connected) { pollStop(); return; }
    const t = performance.now();
    if (!pollBusy) {
      pollBusy = true;
      pollCycle++;
      try { await pollOnce(pollCycle % 10 === 1); pollN++; } finally { pollBusy = false; }
    }
    if (t - pollT0 > 1000) { set('pollRate', (pollN * 1000 / (t - pollT0)).toFixed(1) + ' 轮/s'); pollN = 0; pollT0 = t; }
    pollTimer = setTimeout(pollTick, Math.max(10, Number($('#pollMs').value) || 50));
  }
  app.pollStart = () => { if (pollTimer) return; pollN = 0; pollT0 = performance.now(); pollTick(); };
  app.pollStop = pollStop;
  $('#pollOn').onchange = () => { if ($('#pollOn').checked) app.pollStart(); else pollStop(); };
  $('#btnOnce').onclick = () => app.safe(async () => { const n = await pollOnce(true); app.msg('读取完成，成功 ' + n + '/5 项', n === 5 ? 'ok' : 'warn'); });

  // 设备信息（附录 B）：字符串块按 ID 升序拼接每个值的 4 个原始字节
  async function readBlock(start, n) {
    const bytes = [];
    for (let i = 0; i < n; i++) {
      const r = P.paramReply((await app.ask(P.paramRead(start + i, 5))).data);
      if (r.status !== 0) throw new Error('读取 0x' + (start + i).toString(16) + ' 失败：' + P.PSTATUS[r.status]);
      for (let k = 0; k < 4; k++) bytes.push((r.raw >>> (8 * k)) & 0xFF);
    }
    return bytes;
  }
  const toText = (b) => { let s = ''; for (const c of b) { if (c === 0) break; if (c >= 32 && c < 127) s += String.fromCharCode(c); } return s; };
  const u16 = async (id) => { const r = P.paramReply((await app.ask(P.paramRead(id, 3))).data); if (r.status !== 0) throw new Error(P.PSTATUS[r.status]); return r.value; };
  $('#btnInfo').onclick = () => app.safe(async () => {
    const I = LK.INFO;
    const out = [];
    out.push('设备类型: ' + (await u16(I.devType)));
    out.push('驱动器: ' + toText(await readBlock(I.driverName[0], I.driverName[1])));
    out.push('电机: ' + toText(await readBlock(I.motorName[0], I.motorName[1])));
    out.push('芯片ID: ' + P.hexBytes(await readBlock(I.chipId[0], I.chipId[1])));
    out.push('驱动器硬件版本: V' + ((await u16(I.hwVer)) / 100).toFixed(2));
    out.push('电机版本: V' + ((await u16(I.motorVer)) / 100).toFixed(2));
    out.push('固件版本: V' + ((await u16(I.fwVer)) / 100).toFixed(2));
    $('#devInfo').innerHTML = out.map((s) => '<div>' + s.replace(/</g, '&lt;') + '</div>').join('');
    await app.loadScales();
    out.push('R=' + f2(app.ratio, 4) + '，相电流比例=' + app.iScale);
    $('#devInfo').innerHTML = out.map((s) => '<div>' + s.replace(/</g, '&lt;') + '</div>').join('');
    app.msg('设备信息读取完成', 'ok');
  });

  app.on('connected', () => { app.last = { s1: null, s2: null, s3: null, ang: null, ang1: null }; app.safe(async () => { await app.loadScales(); app.msg('已读取换算量：R=' + f2(app.ratio, 4) + '，相电流比例=' + app.iScale, 'ok'); }); });
  app.on('beforeDisconnect', () => { $('#pollOn').checked = false; pollStop(); const h = $('#hero'); if (h) h.dataset.st = 'off'; set('dState', '已断开'); });
  // ==== SECTION: control（电机管理、运动控制）====
  const s1Text = (s) => (P.STATES[s.state] || ('状态' + s.state)) + '，' + (s.err ? '故障 0x' + s.err.toString(16).toUpperCase() + ' ' + P.errText(s.err) : '无故障');
  async function readS1() { const r = await app.ask(P.simple(0x9A)); const s = P.state1(r.data); app.last.s1 = s; app.showS1(s); app.emit('s1', s); return s; }
  let repTimer = 0, repFail = 0, repGen = 0;
  function repStop() { repGen++; clearTimeout(repTimer); repTimer = 0; $('#mRepeat').checked = false; }
  app.repStop = repStop;

  // 电机处于开启状态时自动开始采集曲线（已在采集则不动）
  const autoPlot = (s) => { if (s && s.state === 3 && !$('#pollOn').checked && app.link.connected) { $('#pollOn').checked = true; app.pollStart(); } };
  $('#cOn').onclick = () => app.safe(async () => { await app.ask(P.simple(0x88)); await LK.sleep(50); const s = await readS1(); autoPlot(s); app.msg('开启后：' + s1Text(s) + (s.state === 3 ? '，已开始采集曲线' : ''), s.state === 3 && !s.err ? 'ok' : 'warn'); });
  // 连上时电机如果已经是开启状态，也直接开始采集
  app.on('connected', () => setTimeout(() => { readS1().then(autoPlot).catch(() => {}); }, 1200));
  $('#cStop').onclick = () => app.safe(async () => { repStop(); await app.ask(P.simple(0x81)); app.msg('已停止（0 扭矩输出）', 'ok'); });
  $('#cOff').onclick = () => app.safe(async () => { repStop(); await app.ask(P.simple(0x80)); app.msg('电机已关闭，需要重新开启才能控制', 'ok'); });
  $('#cClr').onclick = () => app.safe(async () => { const r = await app.ask(P.simple(0x9B)); app.showS1(P.state1(r.data)); await LK.sleep(50); const s = await readS1(); app.msg('清除故障后：' + s1Text(s), s.err ? 'warn' : 'ok'); });
  $('#cClrAng').onclick = () => app.safe(async () => {
    if (!confirm('清除多圈累计角度（0x93），之后多圈角度只剩单圈部分。\n若电机正在多圈位置模式，目标会按新角度重新解释，电机可能转动，建议先停止。继续？')) return;
    await app.ask(P.simple(0x93)); await LK.sleep(30); await pollOnce(true);
    app.msg('已清除多圈角度，当前多圈角度 ' + f2(app.last.ang, 2) + ' °', 'ok');
  });
  $('#cZero').onclick = () => app.safe(async () => {
    if (!confirm('把当前位置设为零点（0x95，只在内存，重启失效）。\n若电机正在位置模式，目标会按新零点重新解释，电机可能转动，建议先停止。继续？')) return;
    await app.ask(P.simple(0x95)); await LK.sleep(30); await pollOnce(true);
    app.msg('已设当前位置为零点，回读多圈角度 ' + f2(app.last.ang, 2) + ' °（重启后失效）', 'ok');
  });
  // 零偏写 Flash 复用维护工具里 0x19 的流程（要求手动输入确认词）
  $('#zOffset').onclick = () => $('#kOffset').click();
  document.querySelectorAll('[data-brake]').forEach((b) => {
    b.onclick = () => app.safe(async () => {
      const v = Number(b.dataset.brake);
      if (v === 1 && !confirm('释放抱闸后，负载可能下坠或转动。确认释放？')) return;
      const r = await app.ask(P.brake(v));
      set('brakeSt', r.data[1] === 1 ? '释放' : '吸合');
      app.msg('抱闸状态：' + (r.data[1] === 1 ? '释放' : '吸合'), 'ok');
    });
  });

  // 八种运动模式：单位、滑块范围、是否需要限制量和方向
  const MODES = {
    A1: { u: 'LSB', min: -2000, max: 2000, step: 10, lim: '', dir: 0 },
    A2: { u: '°/s', min: -360, max: 360, step: 1, lim: '扭矩限制 LSB', lim0: 0, dir: 0 },
    A3: { u: '°', min: -720, max: 720, step: 1, lim: '', dir: 0 },
    A4: { u: '°', min: -720, max: 720, step: 1, lim: '最大速度 °/s', lim0: 100, need: 1, dir: 0 },
    A5: { u: '° 单圈', min: 0, max: 360, step: 1, lim: '', dir: 1, single: 1 },
    A6: { u: '° 单圈', min: 0, max: 360, step: 1, lim: '最大速度 °/s', lim0: 100, need: 1, dir: 1, single: 1 },
    A7: { u: '° 增量', min: -360, max: 360, step: 1, lim: '', dir: 0, inc: 1 },
    A8: { u: '° 增量', min: -360, max: 360, step: 1, lim: '最大速度 °/s', lim0: 100, need: 1, dir: 0, inc: 1 }
  };
  function applyMode(reset) {
    const m = MODES[$('#mMode').value];
    const sl = $('#mSlider');
    sl.min = m.min; sl.step = m.step;
    sl.max = m.single ? Math.max(1, Math.ceil(360 * app.ratio) - 1) : m.max;
    $('#mLLbl').hidden = !m.lim;
    $('#mDLbl').hidden = !m.dir;
    if (reset) {
      if (m.lim) { $('#mLLbl').firstChild.textContent = m.lim + ' '; $('#mLim').value = m.lim0 || 0; }
      $('#mTarget').value = 0; sl.value = 0;
    }
    $('#mHint').textContent = '单位 ' + m.u + (m.single ? '，范围 0 ~ ' + (360 * app.ratio).toFixed(2) : '') + (app.ratio !== 1 && m.u.indexOf('°') === 0 && m.u !== '°/s' ? '（电机侧，输出端 ÷' + Number(app.ratio.toFixed(4)) + '）' : '');
  }
  function build() {
    const k = $('#mMode').value, m = MODES[k];
    const t = Number($('#mTarget').value), lim = Number($('#mLim').value) || 0, dir = Number($('#mDir').value);
    if (!isFinite(t)) throw new Error('目标不是有效数字');
    if (m.need && !(lim > 0)) throw new Error('限速模式的最大速度必须大于 0');
    if (m.single && (t < 0 || t >= 360 * app.ratio)) throw new Error('单圈目标必须在 0 ~ ' + (360 * app.ratio).toFixed(2) + ' 之内');
    switch (k) {
      case 'A1': return P.torque(t);
      case 'A2': return P.speed(t, lim);
      case 'A3': return P.posMulti(t, 0);
      case 'A4': return P.posMulti(t, lim);
      case 'A5': return P.posSingle(t, dir, 0);
      case 'A6': return P.posSingle(t, dir, lim);
      case 'A7': return P.posInc(t, 0);
      default: return P.posInc(t, lim);
    }
  }
  async function sendMotion() {
    const d = build();
    $('#mFrame').textContent = '0x' + app.reqId().toString(16).toUpperCase() + '  ' + P.hexBytes(d);
    const r = await app.ask(d);
    app.lastTarget = Number($('#mTarget').value);
    app.lastTargetUnit = MODES[$('#mMode').value].u;
    app.lastMode = $('#mMode').value;
    const s = P.state2(r.data);
    app.last.s2 = s; app.showS2(s); app.emit('s2', s);
    $('#mReply').textContent = P.hexBytes(r.data) + '  → ' + s.temp + ' °C, Iq=' + s.iq + ' LSB, ' + s.speed + ' °/s';
  }
  app.sendMotion = sendMotion;

  async function repTick(g) {
    if (g !== repGen) return;
    if (!$('#mRepeat').checked || !app.link.connected) { repStop(); return; }
    try { await sendMotion(); repFail = 0; } catch (e) {
      repFail++; app.msg('连续发送失败：' + e.message, 'bad');
      if (repFail >= 5) { repStop(); app.msg('连续失败 5 次，已停止连续发送', 'bad'); return; }
    }
    if (g !== repGen) return;
    repTimer = setTimeout(() => repTick(g), Math.max(5, Number($('#mRepMs').value) || 20));
  }
  $('#mRepeat').onchange = () => {
    repGen++; clearTimeout(repTimer); repTimer = 0;
    if (!$('#mRepeat').checked) return;
    if (MODES[$('#mMode').value].inc) { $('#mRepeat').checked = false; app.msg('增量模式不能连续发送，否则会一直累加', 'warn'); return; }
    repFail = 0; repTick(repGen);
  };
  $('#mMode').onchange = () => { if (MODES[$('#mMode').value].inc) repStop(); applyMode(true); };
  $('#mSlider').oninput = () => { $('#mTarget').value = $('#mSlider').value; };
  $('#mTarget').oninput = () => { $('#mSlider').value = $('#mTarget').value; };
  $('#mSend').onclick = () => app.safe(async () => { await sendMotion(); app.msg('已发送，收到回复', 'ok'); });
  $('#mHalt').onclick = () => app.safe(async () => { repStop(); await app.ask(P.simple(0x81)); app.msg('已停止连续发送并让电机停止', 'ok'); });
  app.on('beforeDisconnect', repStop);
  app.on('tab', (t) => { if (t === 'control') applyMode(false); });
  app.on('connected', () => setTimeout(() => applyMode(false), 600));
  applyMode(true);
  // ==== 串口下拉：列出已授权的串口；新设备用“添加串口…”授权一次 ====
  const ports = [];
  const portInfo = (p) => {
    const i = p.getInfo ? p.getInfo() : {};
    if (i.usbVendorId === undefined) return { key: '', text: '蓝牙或其他串口' };
    const key = i.usbVendorId.toString(16).toUpperCase().padStart(4, '0') + ':' + i.usbProductId.toString(16).toUpperCase().padStart(4, '0');
    const known = { '0483:5740': 'STM32 虚拟串口' };
    return { key, text: key, tip: known[key] || 'USB 串口' };
  };
  async function refreshPorts(pick) {
    if (!LK.Slcan.supported()) return;
    const sel = $('#portSel');
    const prev = pick || ports[Number(sel.value)];
    const list = await navigator.serial.getPorts();
    ports.length = 0;
    list.forEach((p) => ports.push(p));
    if (!ports.length) { sel.innerHTML = '<option value="-1">（还没有已授权串口，请点右侧添加）</option>'; return; }
    sel.innerHTML = ports.map((p, i) => '<option value="' + i + '" title="' + (portInfo(p).tip || '') + '">端口 ' + (i + 1) + ' · ' + portInfo(p).text + '</option>').join('');
    let k = ports.indexOf(prev);
    if (k < 0) k = ports.findIndex((p) => portInfo(p).key === '0483:5740');
    sel.value = String(k < 0 ? 0 : k);
  }
  $('#btnAddPort').onclick = async () => {
    try { const p = await navigator.serial.requestPort(); await refreshPorts(p); app.msg('已授权串口，可以点连接', 'ok'); }
    catch (e) { if (e.name !== 'NotFoundError') app.msg('添加串口失败：' + e.message, 'bad'); }
  };
  if (LK.Slcan.supported()) {
    navigator.serial.addEventListener('connect', () => { if (!app.link.connected) refreshPorts(); });
    navigator.serial.addEventListener('disconnect', () => { if (!app.link.connected) refreshPorts(); });
  }
  app.selectedPort = () => ports[Number($('#portSel').value)] || null;
  refreshPorts();

  // ==== SECTION: init ====
  if (!LK.Slcan.supported()) { $('#noSerial').hidden = false; $('#btnConnect').disabled = true; }
  setConn(false);
})(window.LK = window.LK || {});
