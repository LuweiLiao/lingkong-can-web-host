// 帧监视页：原始帧发送、帧记录（过滤、解析、导出）
(function (LK) {
  'use strict';
  const app = LK.app, $ = app.$, P = LK.P;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const MAX_ROWS = 1500;
  const POLL_CMDS = { 0x9A: 1, 0x9C: 1, 0x9D: 1, 0x92: 1, 0x94: 1 };
  const rows = [];   // { t, dir, id, ext, data, text, line }
  let t0 = 0, dirty = false;

  const hexId = (f) => f.id.toString(16).toUpperCase().padStart(f.ext ? 8 : 3, '0');
  const filterSet = () => {
    const s = $('#lgFilter').value.trim();
    if (!s) return null;
    const set = new Set();
    s.split(/[\s,]+/).forEach((x) => { const v = parseInt(x, 16); if (isFinite(v)) set.add(v); });
    return set.size ? set : null;
  };

  function add(f, tx) {
    if (!$('#lgOn').checked) return;
    if (!t0) t0 = f.ts;
    let text = '';
    try { text = P.describe(f, tx); } catch (e) { text = ''; }
    rows.push({ t: f.ts - t0, dir: tx ? 'TX' : 'RX', id: f.id, ext: f.ext, data: f.data, text });
    if (rows.length > MAX_ROWS * 2) rows.splice(0, rows.length - MAX_ROWS);
    dirty = true;
  }
  app.on('frame', (f) => add(f, false));
  app.on('tx', (f) => add(f, true));

  const visible = (r) => {
    if ($('#lgHideTx').checked && r.dir === 'TX') return false;
    if ($('#lgHidePoll').checked && POLL_CMDS[r.data[0]]) return false;
    const fs = filterSet();
    if (fs && !fs.has(r.id)) return false;
    return true;
  };

  function redraw() {
    const list = rows.filter(visible).slice(-MAX_ROWS);
    $('#lgBody').innerHTML = list.slice(-300).reverse().map((r) =>
      '<tr><td>' + r.t.toFixed(1) + '</td><td class="' + (r.dir === 'TX' ? 'warn' : 'ok') + '">' + r.dir + '</td><td>' +
      r.id.toString(16).toUpperCase().padStart(r.ext ? 8 : 3, '0') + '</td><td>' + esc(P.hexBytes(r.data)) + '</td><td>' + esc(r.text) + '</td></tr>'
    ).join('');
    $('#lgCount').textContent = '共 ' + rows.length + ' 条，显示最近 ' + Math.min(list.length, 300) + ' 条';
    dirty = false;
  }
  // 只在监视页可见且有新数据时刷新，避免拖慢轮询
  setInterval(() => {
    if (!dirty) return;
    if (!$('#tab-monitor').open) return;
    redraw();
  }, 300);
  $('#tab-monitor').addEventListener('toggle', () => { if ($('#tab-monitor').open) redraw(); });
  ['#lgFilter', '#lgHideTx', '#lgHidePoll'].forEach((q) => { $(q).onchange = redraw; });

  $('#lgClear').onclick = () => { rows.length = 0; t0 = 0; redraw(); };
  $('#lgExport').onclick = () => {
    const NL = String.fromCharCode(10);
    const out = rows.map((r) => r.t.toFixed(3) + '\t' + r.dir + '\t' + r.id.toString(16).toUpperCase() + '\t' + P.hexBytes(r.data) + '\t' + r.text);
    app.download('帧记录_' + app.stamp() + '.txt', String.fromCharCode(0xFEFF) + '时间ms\t方向\tID\t数据\t解析' + NL + out.join(NL), 'text/plain');
  };

  // 发送原始帧：只做格式检查，不检查命令内容
  $('#rSend').onclick = () => app.safe(async () => {
    const id = parseInt($('#rId').value.trim(), 16);
    const ext = $('#rExt').checked;
    if (!isFinite(id) || id < 0 || id > (ext ? 0x1FFFFFFF : 0x7FF)) throw new Error('ID 无效（标准帧 ≤ 0x7FF，扩展帧 ≤ 0x1FFFFFFF）');
    const parts = $('#rData').value.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 8) throw new Error('协议要求 DLC 固定为 8，需要填写 8 个字节');
    const bytes = parts.map((x) => parseInt(x, 16));
    if (bytes.some((b) => !(b >= 0 && b <= 255))) throw new Error('数据必须是 00~FF 的十六进制字节');
    const danger = { 0x07: 1, 0x18: 1, 0x19: 1, 0x1B: 1, 0x20: 1, 0x44: 1, 0x48: 1, 0x4A: 1 };
    if (danger[bytes[0]] && !confirm('命令 0x' + bytes[0].toString(16).toUpperCase() + ' 会改写 Flash、驱动电机开环转动或复位设备。确认发送？')) return;
    await app.link.send(id, bytes, ext);
    app.msg('已发送原始帧', 'ok');
  });

  // 节点 ID 变化时，同步原始帧 ID 的默认值
  $('#nodeId').addEventListener('change', () => { $('#rId').value = app.reqId().toString(16).toUpperCase(); });
})(window.LK = window.LK || {});
