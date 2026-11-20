// 设置页：参数做成图形控件（开关、分段按钮、滑块），不再显示原始表格
(function (LK) {
  'use strict';
  const app = LK.app, $ = app.$, P = LK.P, M = LK.PARAM_MAP;
  const PROT = ['不可用', '禁用', '可恢复', '不可恢复'], EN3 = ['不可用', '禁用', '启用'];
  // 控件：n=数值框(可带滑块)，sw=开关，seg=分段按钮，sel=下拉；k=显示值与原始值的倍率，u=单位，s=滑块范围
  const n = (id, u, k, s) => ({ id, kind: 'n', u, k: k || 1, s });
  const sw = (id) => ({ id, kind: 'sw' });
  const seg = (id, opts) => ({ id, kind: 'seg', opts });
  const sel = (id, opts) => ({ id, kind: 'sel', opts });
  const lv = (id, opts) => ({ id, kind: 'sel', opts, lvl: true });
  const r = (label, ...ctrls) => ({ label, ctrls });
  // 卡片：[标题, 放到哪个容器, 行]。保护等级用带颜色的下拉框（lv），比分段按钮省宽度
  const CARDS = [
    ['运动限制', 'setA', [
      r('最大扭矩', n(0x8C, 'LSB', 1, [0, 2000])), r('最大速度', n(0x8E, '°/s', 0.01, [0, 3600])),
      r('电流斜率', n(0x92, 'LSB/s', 1, [0, 300000])), r('速度斜率', n(0x94, '°/s²', 1, [0, 600000]))]],
    ['电机', 'setA', [r('转向', seg(0x1F, ['正向', '反向'])), r('线性化补偿', sw(0xCB)), r('CSP 平滑', sw(0x23))]],
    ['电压与电流保护', 'setC', [
      r('过压', lv(0x2B, PROT), n(0x3A, 'V', 0.01)), r('欠压', lv(0x2A, PROT), n(0x39, 'V', 0.01)),
      r('母线电流', lv(0x2C, PROT), n(0x3B, 'A', 0.01), n(0x3C, 'ms')),
      r('瞬时过流', n(0x42, 'A', 0.01)), r('相电流硬保护', n(0x43, 'A', 0.01))]],
    ['温度、堵转与 I²t', 'setC', [
      r('电机温度', lv(0x28, PROT), n(0x37, '°C')), r('驱动温度', lv(0x29, PROT), n(0x38, '°C')),
      r('堵转', lv(0x2E, PROT), n(0x3F, 'A', 0.01), n(0x40, 'ms')),
      r('I²t', lv(0x2D, PROT), n(0x3D, 'A', 0.01), n(0x3E, 'ms')), r('额定电流', n(0xB2, 'A', 0.01)),
      r('丢输入', lv(0x2F, PROT), n(0x41, 'ms'))]],
    ['泄放电阻与抱闸', 'setC', [
      r('泄放电阻', lv(0x4B, EN3), n(0x4C, 'V', 0.01), n(0x4D, 'V', 0.01)),
      r('断电抱闸', lv(0x50, EN3), n(0x51, '%'), n(0x52, '%'))]],
    ['通信（保存并重启后生效）', 'setC', [
      r('节点 ID', n(0x00)), r('CAN 速率', sel(0x06, LK.ENUMS.can)), r('帧格式', seg(0x08, LK.ENUMS.ext)),
      r('回复 0x180', sw(0x02)), r('广播模式', sw(0x1E))]]
  ];
  const COMM = { 0x00: 1, 0x02: 1, 0x06: 1, 0x08: 1 };
  const ctl = {};
  const list = () => Object.values(ctl);
  const hx = (id) => '0x' + id.toString(16).toUpperCase().padStart(4, '0');

  async function rawRead(id, t) {
    const rep = P.paramReply((await app.ask(P.paramRead(id, t))).data);
    if (rep.id !== id) throw new Error('回复参数 ID 不匹配');
    if (rep.status !== 0) throw new Error('读 ' + hx(id) + ' 失败：' + (P.PSTATUS[rep.status] || rep.status));
    return rep.value;
  }
  async function rawWrite(id, t, v) {
    const rep = P.paramReply((await app.ask(P.paramWrite(id, t, v))).data);
    if (rep.id !== id) throw new Error('回复参数 ID 不匹配');
    if (rep.status !== 0) throw new Error('写 ' + hx(id) + ' 失败：' + (P.PSTATUS[rep.status] || rep.status));
    return rep.value;
  }

  const paint = (c) => { if (c.btns) c.btns.forEach((b, i) => b.classList.toggle('on', i === c.val)); };
  // 把设备返回的原始值显示到控件上
  function put(c, raw) {
    c.raw = raw;
    if (c.kind === 'n') { const v = Number((raw * c.k).toFixed(4)); c.inp.value = v; if (c.rg) { if (v > Number(c.rg.max)) c.rg.max = v; if (v < Number(c.rg.min)) c.rg.min = v; c.rg.value = v; } }
    else if (c.kind === 'sw') c.inp.checked = raw === 1;
    else if (c.kind === 'seg') { c.val = raw; paint(c); }
    else { c.inp.value = String(raw); c.inp.dataset.v = c.inp.value; }
    c.touched = false;
    c.el.classList.remove('dirty', 'na');
  }
  // 读控件当前值并换成原始值；还没有值时返回 null
  // 没读到过、也没被用户改过的控件返回 null，避免把控件默认值当成改动写进电机
  function take(c) {
    if (c.raw === null && !c.touched) return null;
    if (c.kind === 'n') return c.inp.value === '' ? null : Math.round(Number(c.inp.value) / c.k);
    if (c.kind === 'sw') return c.inp.checked ? 1 : 0;
    if (c.kind === 'seg') return c.val === undefined ? null : c.val;
    return Number(c.inp.value);
  }
  function mark(c) { c.touched = true; const v = take(c); c.el.classList.toggle('dirty', v !== null && v !== c.raw); }

  function build(c) {
    const p = M[c.id], el = document.createElement('div');
    el.className = 'ctl c-' + c.kind;
    el.title = p.cn + '（' + hx(c.id) + '）';
    c.raw = null;
    if (c.kind === 'n') {
      el.innerHTML = '<input type="number" step="any"><i>' + (c.u || '') + '</i>';
      c.inp = el.firstChild;
      if (c.s) { const rg = document.createElement('input'); rg.type = 'range'; rg.min = c.s[0]; rg.max = c.s[1]; rg.step = 'any'; rg.oninput = () => { c.inp.value = rg.value; mark(c); }; el.appendChild(rg); c.rg = rg; }
      c.inp.oninput = () => { if (c.rg) c.rg.value = c.inp.value; mark(c); };
    } else if (c.kind === 'sw') {
      el.innerHTML = '<label class="sw"><input type="checkbox"><b></b></label>';
      c.inp = el.querySelector('input'); c.inp.onchange = () => mark(c);
    } else if (c.kind === 'seg') {
      c.btns = c.opts.map((t, i) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { c.val = i; paint(c); mark(c); }; el.appendChild(b); return b; });
    } else {
      el.innerHTML = '<select>' + c.opts.map((t, i) => '<option value="' + i + '">' + t + '</option>').join('') + '</select>';
      c.inp = el.firstChild; if (c.lvl) c.inp.className = 'lvl'; c.inp.onchange = () => { c.inp.dataset.v = c.inp.value; mark(c); };
    }
    c.el = el; ctl[c.id] = c;
    return el;
  }
  function render() {
    ['setA', 'setC'].forEach((h) => { document.getElementById(h).innerHTML = ''; });
    CARDS.forEach((cd) => {
      const card = document.createElement('section'); card.className = 'pnl c-orange scard';
      card.innerHTML = '<h2>' + cd[0] + '</h2>';
      cd[2].forEach((row) => {
        const d = document.createElement('div'); d.className = 'srow';
        d.innerHTML = '<span class="sl">' + row.label + '</span>';
        const box = document.createElement('div'); box.className = 'sc';
        row.ctrls.forEach((c) => box.appendChild(build(c)));
        d.appendChild(box); card.appendChild(d);
      });
      document.getElementById(cd[1]).appendChild(card);
    });
  }
  async function readAll() {
    let ok = 0, bad = 0;
    for (const c of list()) {
      try { put(c, await rawRead(c.id, M[c.id].t)); ok++; } catch (e) { bad++; c.el.classList.add('na'); }
      $('#sInfo').textContent = '读取中 ' + (ok + bad) + '/' + list().length;
    }
    $('#sInfo').textContent = '读取完成：成功 ' + ok + '，失败 ' + bad;
    app.msg('设置读取：成功 ' + ok + '，失败 ' + bad, bad ? 'warn' : 'ok');
  }
  render();
  // ==== PART2: 应用、保存、导入导出、导出给其它面板 ====

  // 应用：只写有改动的项；先确认，通信项再确认一次
  async function apply() {
    const ch = list().filter((c) => { const v = take(c); return v !== null && v !== c.raw; });
    if (!ch.length) { app.msg('没有修改项', 'warn'); return; }
    for (const c of ch) {
      const p = M[c.id], v = take(c);
      if (!Number.isFinite(v)) throw new Error(p.cn + '：不是有效数字');
      if (p.t !== 7 && !Number.isInteger(v)) throw new Error(p.cn + '：必须为整数');
      if (p.min !== null && p.max !== null && (v < p.min || v > p.max)) throw new Error(p.cn + '：超出范围 ' + (p.min * c.k || p.min) + ' ~ ' + (p.max * c.k || p.max) + (c.u ? ' ' + c.u : ''));
    }
    const txt = ch.map((c) => M[c.id].cn + '：' + (c.raw === null ? '?' : Number((c.raw * (c.k || 1)).toFixed(4))) + ' → ' + Number((take(c) * (c.k || 1)).toFixed(4)) + (c.u ? ' ' + c.u : '')).join('\n');
    if (!confirm('将写入以下 ' + ch.length + ' 项到电机内存（尚未保存）：\n' + txt)) return;
    if (ch.some((c) => COMM[c.id]) && !confirm('包含通信项（节点 ID、CAN 波特率、帧格式、回复 ID）。保存并重启后，上位机要用新配置重新连接。继续写入？')) return;
    let ok = 0;
    for (const c of ch) {
      const v = take(c), got = await rawWrite(c.id, M[c.id].t, v);
      put(c, got); ok++;
      if (got !== v) app.msg(M[c.id].cn + ' 回读值与写入值不一致', 'warn');
    }
    app.msg('已写入 ' + ok + ' 项到电机内存，确认效果后再保存' + (ch.some((c) => COMM[c.id]) ? '（含通信项，需保存并重启）' : ''), 'ok');
  }
  async function save() {
    if (!confirm('把当前全部参数写入 Flash？\nFlash 有擦写寿命，不要频繁保存。')) return;
    const req = P.save();
    const r = await app.ask(req, 1000);
    if (P.hexBytes(r.data) !== P.hexBytes(req)) throw new Error('保存失败：' + (P.PSTATUS[r.data[1] >> 4] || P.hexBytes(r.data)));
    app.msg('已保存到电机。通信项需要重启电机后才生效', 'ok');
  }
  $('#sReadAll').onclick = () => app.safe(readAll);
  $('#sApply').onclick = () => app.safe(apply);
  $('#sSave').onclick = () => app.safe(save);

  // 导出当前值；导入只填进控件并标记，不自动写入，通信项不导入
  $('#sExport').onclick = () => {
    const o = { node: app.node(), time: new Date().toISOString(), params: {} };
    list().forEach((c) => { if (c.raw !== null) o.params[M[c.id].key] = c.raw; });
    if (!Object.keys(o.params).length) { app.msg('还没有读取到设置，请先点“读取”', 'warn'); return; }
    app.download('电机设置_节点' + app.node() + '_' + app.stamp() + '.json', JSON.stringify(o, null, 2), 'application/json');
  };
  $('#sImport').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text()), src = o.params || o;
      let n = 0;
      list().forEach((c) => {
        const k = M[c.id].key;
        if (COMM[c.id] || !(k in src) || !Number.isFinite(Number(src[k]))) return;
        const v = Number(src[k]);
        if (c.kind === 'n') { c.inp.value = Number((v * c.k).toFixed(4)); if (c.rg) c.rg.value = c.inp.value; }
        else if (c.kind === 'sw') c.inp.checked = v === 1;
        else if (c.kind === 'seg') { c.val = v; paint(c); }
        else { c.inp.value = String(v); c.inp.dataset.v = c.inp.value; }
        mark(c); n++;
      });
      app.msg('已导入 ' + n + ' 项（不含通信项），检查后点“应用修改”', 'ok');
    } catch (err) { app.msg('导入失败：' + err.message, 'bad'); }
  };

  // 给调参页、广播页用的参数读写接口
  app.paramRead = rawRead;
  app.paramWrite = rawWrite;
  // 连上后自动读一次，让设置区直接有值
  app.on('connected', () => setTimeout(() => app.safe(readAll), 900));
  app.on('disconnected', () => { $('#sInfo').textContent = ''; });
})(window.LK = window.LK || {});
