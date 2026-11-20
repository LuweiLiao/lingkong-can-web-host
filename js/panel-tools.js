// 校准维护页 + 广播页
(function (LK) {
  'use strict';
  const app = LK.app, $ = app.$, P = LK.P;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ==== 校准与维护 ====
  function log(s, cls) {
    const e = document.createElement('div');
    e.className = cls || '';
    e.textContent = new Date().toLocaleTimeString() + '  ' + s;
    $('#calLog').prepend(e);
    app.msg(s, cls);
  }
  // 高风险命令要求手动输入确认词
  const really = (txt, word) => prompt(txt + '\n\n请输入 ' + word + ' 以确认：') === word;
  function quiet() { $('#pollOn').checked = false; app.pollStop(); if (app.repStop) app.repStop(); app.emit('halt'); }
  async function checkS1() {
    const s = P.state1((await app.ask(P.simple(0x9A))).data);
    app.showS1(s);
    return (P.STATES[s.state] || s.state) + '，' + P.errText(s.err) + ((s.err & 0x800) ? '（Flash 参数异常！）' : '');
  }
  let busy = false;
  const calBtns = ['#kOffset', '#kAlign', '#kLinear', '#kRealign', '#kResetS'];
  async function exclusive(fn) {
    if (busy) { app.msg('上一个校准命令还没结束', 'warn'); return; }
    busy = true; calBtns.forEach((q) => { $(q).disabled = true; });
    try { await fn(); } catch (e) { log(e.message, 'bad'); } finally {
      busy = false; calBtns.forEach((q) => { $(q).disabled = !app.link.connected; });
    }
  }

  document.querySelectorAll('[data-enc]').forEach((b) => {
    b.onclick = () => app.safe(async () => {
      const r = P.encoderVal((await app.ask(P.encoderRead(Number(b.dataset.enc)))).data);
      $('#encVal').textContent = (r.sel ? '原始 ' : '修正 ') + r.val + '（0x' + r.val.toString(16).toUpperCase() + '）';
    });
  });

  $('#kOffset').onclick = () => exclusive(async () => {
    if (!really('0x19 会以当前位置更新编码器零偏并写入 Flash。请先停止电机并保持轴静止。', 'ZERO')) return;
    quiet();
    log('发送 0x19…');
    let r;
    try { r = await app.ask(P.setOffsetRom(), 3000); } catch (e) { throw new Error('0x19 无回复：当前配置可能不支持（带减速器的单编码器），或 Flash 保存失败'); }
    log('0x19 完成，moduleEncoderOffset = ' + new DataView(r.data.buffer).getUint32(4, true) + '；' + (await checkS1()), 'ok');
  });

  async function calib(cmd, req, title) {
    quiet();
    log(title + ' 已发送，等待最终回复（最长 120 s），期间不要操作…', 'warn');
    let r;
    try { r = await app.ask(req, 120000); } catch (e) { throw new Error(title + ' 等待超时：' + e.message); }
    const d = r.data, v = new DataView(d.buffer);
    if (d[1] === 2 && d[2] === 2) throw new Error(title + '：当前状态不允许（已有其他独占操作）');
    const extra = cmd === 0x18 ? '，对齐值 ' + v.getUint16(2, true) + '，对齐比例 ' + v.getInt16(4, true) : '，线性化比例 ' + v.getInt16(4, true);
    log(title + (d[6] === 1 ? ' 通过' : ' 失败') + '：相序 ' + (d[1] ? '反' : '正') + extra + '；' + (await checkS1()), d[6] === 1 ? 'ok' : 'bad');
  }
  $('#kAlign').onclick = () => exclusive(async () => {
    if (!really('0x18 电机与编码器对齐：电机会开环正反转，结果写入 Flash，中途无法取消。确认已空载、外壳已固定、转子可自由转动。', 'ALIGN')) return;
    await calib(0x18, P.align(), '0x18 编码器对齐');
  });
  $('#kLinear').onclick = () => exclusive(async () => {
    if (!really('0x1B 编码器线性化：电机会开环正反转，结果写入 Flash，中途无法取消。确认已空载、外壳已固定、转子可自由转动。', 'LINEAR')) return;
    await calib(0x1B, P.linearize(), '0x1B 编码器线性化');
  });
  $('#kRealign').onclick = () => exclusive(async () => {
    if (!really('0x20 双编码器关联对齐：采样当前位置并写入 Flash。仅支持双编码器辅助方案 1，请保持轴静止。', 'REALIGN')) return;
    quiet();
    let r;
    try { r = await app.ask(P.reducerAlign(), 3000); } catch (e) { throw new Error('0x20 无回复：编码器配置不支持，或 Flash 保存失败'); }
    const v = new DataView(r.data.buffer);
    log('0x20 完成：关联值 ' + v.getUint16(4, true) + '，标志 ' + r.data[6] + '；' + (await checkS1()), r.data[6] === 1 ? 'ok' : 'bad');
  });
  $('#kReboot').onclick = () => app.safe(async () => {
    if (!confirm('设备会立即复位且不回复。重启后按已保存的节点ID、波特率、帧格式通信。确认重启？')) return;
    quiet();
    await app.tell(P.reboot());
    log('已发送重启 0x07，请等待设备启动后再操作', 'warn');
  });
  $('#kResetS').onclick = () => exclusive(async () => {
    if (!really('0x48 会恢复全部普通设置为默认值并立即写入 Flash。通信配置改变后需要用新配置重新连接。', 'RESET')) return;
    quiet();
    await app.ask(P.resetSettings(), 3000);
    log('已恢复默认设置并保存。若通信参数改变，重启后需用新配置连接', 'ok');
  });
  const syncUnlock = () => { $('#kResetE').disabled = !($('#kUnlock').checked && app.link.connected); };
  $('#kUnlock').onchange = syncUnlock;
  app.on('connected', syncUnlock);
  app.on('disconnected', () => { $('#kUnlock').checked = false; syncUnlock(); });
  $('#kResetE').onclick = () => exclusive(async () => {
    if (!really('高风险：0x4A 会用默认值覆盖编码器标定参数并保存。参数与硬件不匹配会导致无法开启或运行异常，之后通常需要重新校准。仅在技术支持要求时使用。', 'RESET_E')) return;
    quiet();
    await app.ask(P.resetEncoder(), 3000);
    $('#kUnlock').checked = false; syncUnlock();
    log('已恢复默认编码器参数。请按技术支持要求重新校准', 'warn');
  });

  // ==== 广播 ====
  const MIX = [[0x9A, '读状态1'], [0x9B, '清除故障'], [0x9C, '读状态2'], [0x9D, '读状态3'], [0x92, '读多圈角度'], [0x80, '电机关闭'], [0x88, '电机开启'], [0x81, '电机停止'], [0x8C, '抱闸']];
  const hx = (n) => '0x' + n.toString(16).toUpperCase();
  const grp = () => Number($('#bGroup').value);
  function renderSlots() {
    const type = $('#bType').value, base = grp() === 2 ? 5 : 1;
    $('#bSlots').innerHTML = [0, 1, 2, 3].map((i) => {
      const cell = type === 'mix'
        ? `<td><select id=bC${i}>${MIX.map((c) => `<option value=${c[0]}>${hx(c[0])} ${c[1]}</option>`).join('')}</select></td><td><select id=bP${i}><option value=0>0</option><option value=1>1 释放</option><option value=16>0x10 查询</option></select></td>`
        : `<td><input type=number id=bV${i} value=0 step=any></td><td></td>`;
      return `<tr><td>${i}</td><td>节点 ${base + i}</td>${cell}</tr>`;
    }).join('');
  }
  $('#bGroup').onchange = renderSlots;
  $('#bType').onchange = renderSlots;
  renderSlots();

  let bCollect = null;
  app.on('frame', (f) => { if (bCollect) bCollect.push(f); });

  $('#bSend').onclick = () => app.safe(async () => {
    const type = $('#bType').value, g = grp(), id = P.bcast(g)[type];
    let d;
    if (type === 'mix') {
      const cmds = [0, 1, 2, 3].map((i) => [Number($('#bC' + i).value), Number($('#bP' + i).value)]);
      cmds.forEach((c, i) => { if (c[0] !== 0x8C && c[1] !== 0) throw new Error('槽位 ' + i + '：只有抱闸 0x8C 才能带参数'); });
      if (cmds.some((c) => c[0] === 0x88 || (c[0] === 0x8C && c[1] === 1)) && !confirm('混合广播包含开启电机或释放抱闸，电机可能立即动作。确认发送？')) return;
      d = P.bcastMix(cmds);
    } else {
      const k = type === 'angle' ? 100 : 1;
      const vals = [0, 1, 2, 3].map((i) => {
        const v = Number($('#bV' + i).value) * k;
        if (!isFinite(v) || Math.abs(v) > 32767) throw new Error('槽位 ' + i + ' 的值无效或超出 S16 范围');
        return Math.round(v);
      });
      if (!confirm('广播会让四个槽位对应的、已开启广播模式的节点同时动作；值为 0 的槽位会下发 0 目标。确认发送？')) return;
      d = P.bcastS16(vals);
    }
    $('#pollOn').checked = false; app.pollStop(); if (app.repStop) app.repStop();
    bCollect = [];
    try {
      await app.link.send(id, d, app.ext());
      $('#bFrame').textContent = hx(id) + '  ' + P.hexBytes(d);
      await LK.sleep(300);
    } finally { var got = bCollect; bCollect = null; }
    const diff = $('#ackMode').value === '1', base = g === 2 ? 5 : 1, off = diff ? 0x180 : 0x140;
    const rep = got.filter((f) => f.id >= off + base && f.id <= off + base + 3);
    $('#bReplies').innerHTML = rep.length
      ? rep.map((f) => '<div>节点 ' + (f.id - off) + '：' + esc(P.hexBytes(f.data)) + '  ' + esc(P.describe(f, false)) + '</div>').join('')
      : '<div class=warn>300 ms 内没有收到回复：检查目标节点是否已开启广播模式（0x001E），以及节点 ID、回复 ID 设置</div>';
    app.msg('广播已发送，收到 ' + rep.length + ' 个回复', rep.length ? 'ok' : 'warn');
  });

  const setBm = (v) => app.safe(async () => {
    if (app.node() > 8) throw new Error('广播只支持节点 1~8');
    const got = await app.paramWrite(0x001E, 1, v);
    app.msg('节点 ' + app.node() + ' 广播模式 = ' + got + '（仅 RAM，需要保存才能断电保持）', 'ok');
  });
  $('#bEnable').onclick = () => setBm(1);
  $('#bDisable').onclick = () => setBm(0);
})(window.LK = window.LK || {});
