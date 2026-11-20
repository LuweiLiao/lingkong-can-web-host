// 协议编解码：按《CAN 通信协议 V2.4》组帧和解帧（固定 8 字节，多字节小端）
(function (LK) {
  'use strict';
  const P = {};
  const dv = (d) => new DataView(d.buffer, d.byteOffset, d.byteLength);
  const blank = (c) => { const d = new Uint8Array(8); d[0] = c; return d; };
  const ascii = (c, s) => { const d = blank(c); for (let i = 0; i < s.length; i++) d[1 + i] = s.charCodeAt(i); return d; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = Math.round;

  P.reqId = (node) => 0x140 + node;
  P.ackId = (node, diff) => (diff ? 0x180 : 0x140) + node;
  P.hexBytes = (d) => Array.from(d).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

  // ---- 简单命令和带口令命令 ----
  P.simple = blank;
  P.reboot = () => ascii(0x07, 'REBOOT_');
  P.align = () => ascii(0x18, 'ALIGN__');
  P.setOffsetRom = () => blank(0x19);
  P.linearize = () => ascii(0x1B, 'LINEAR_');
  P.reducerAlign = () => ascii(0x20, 'REALIGN');
  P.resetSettings = () => ascii(0x48, 'RESET_S');
  P.resetEncoder = () => ascii(0x4A, 'RESET_E');
  P.save = () => Uint8Array.from([0x44, 0, 0, 0, 0x53, 0x41, 0x56, 0x45]);
  P.brake = (v) => { const d = blank(0x8C); d[1] = v; return d; };
  P.encoderRead = (sel) => { const d = blank(0x90); d[1] = sel; return d; };

  // ---- 运动控制 ----
  P.torque = (lsb) => { const d = blank(0xA1); dv(d).setInt16(4, clamp(rnd(lsb), -32768, 32767), true); return d; };
  P.speed = (dps, lim) => {
    const d = blank(0xA2); const v = dv(d);
    v.setInt16(2, clamp(rnd(lim || 0), -32768, 32767), true);
    v.setInt32(4, clamp(rnd(dps * 100), -2147483648, 2147483647), true);
    return d;
  };
  P.posMulti = (deg, vmax) => {
    const d = blank(vmax ? 0xA4 : 0xA3); const v = dv(d);
    if (vmax) v.setUint16(2, clamp(rnd(vmax), 0, 65535), true);
    v.setInt32(4, clamp(rnd(deg * 100), -2147483648, 2147483647), true);
    return d;
  };
  P.posSingle = (deg, dir, vmax) => {
    const d = blank(vmax ? 0xA6 : 0xA5); const v = dv(d);
    d[1] = dir ? 1 : 0;
    if (vmax) v.setUint16(2, clamp(rnd(vmax), 0, 65535), true);
    v.setUint32(4, clamp(rnd(deg * 100), 0, 4294967295), true);
    return d;
  };
  P.posInc = (deg, vmax) => {
    const d = blank(vmax ? 0xA8 : 0xA7); const v = dv(d);
    if (vmax) v.setUint16(2, clamp(rnd(vmax), 0, 65535), true);
    v.setInt32(4, clamp(rnd(deg * 100), -2147483648, 2147483647), true);
    return d;
  };

  // ---- 回复解码 ----
  P.STATES = ['初始化', '故障', '关闭', '开启', '校准'];
  P.ERRORS = [[0x001, '欠压'], [0x002, '过压'], [0x004, '驱动器温度保护'], [0x008, '电机温度保护'], [0x010, '母线电流保护'], [0x020, 'I²t 电流保护'], [0x040, '堵转保护'], [0x080, '输入丢失'], [0x100, '短路/相电流硬保护/Inorm 过流'], [0x200, '电流采样偏置异常'], [0x400, '编码器异常'], [0x800, 'Flash 参数异常']];
  P.errText = (e) => (e ? P.ERRORS.filter((x) => e & x[0]).map((x) => x[1]).join('、') : '无故障');
  P.state1 = (d) => { const v = dv(d); return { temp: v.getInt8(1), vbus: v.getUint16(2, true) * 0.01, ibus: v.getInt16(4, true) * 0.01, state: d[6] >> 4, err: ((d[6] & 0x0F) << 8) | d[7] }; };
  P.state2 = (d) => { const v = dv(d); return { temp: v.getInt8(1), iq: v.getInt16(2, true), speed: v.getInt16(4, true), enc: v.getUint16(6, true) }; };
  P.state3 = (d) => { const v = dv(d); return { temp: v.getInt8(1), ia: v.getInt16(2, true), ib: v.getInt16(4, true), ic: v.getInt16(6, true) }; };
  P.angleMulti = (d) => {
    let r = 0n;
    for (let i = 7; i >= 1; i--) r = (r << 8n) | BigInt(d[i]);
    if (r & (1n << 55n)) r -= (1n << 56n);
    return Number(r) / 100;
  };
  P.angleSingle = (d) => dv(d).getUint32(4, true) / 100;
  P.encoderVal = (d) => ({ sel: d[1], val: dv(d).getUint32(4, true) });

  // ---- 参数子帧 0x40/0x42/0x44 ----
  P.TYPES = { 1: 'U8', 2: 'S8', 3: 'U16', 4: 'S16', 5: 'U32', 6: 'S32', 7: 'F32' };
  P.PSTATUS = ['成功', '帧格式错误', '参数 ID 不存在', '类型或长度不匹配', '参数只读', '数值超出允许范围', '保存失败'];
  function putVal(v, t, x) {
    switch (t) {
      case 1: v.setUint8(4, x); break;
      case 2: v.setInt8(4, x); break;
      case 3: v.setUint16(4, x, true); break;
      case 4: v.setInt16(4, x, true); break;
      case 5: v.setUint32(4, x >>> 0, true); break;
      case 6: v.setInt32(4, x, true); break;
      case 7: v.setFloat32(4, x, true); break;
      default: break;
    }
  }
  function getVal(v, t) {
    switch (t) {
      case 1: return v.getUint8(4);
      case 2: return v.getInt8(4);
      case 3: return v.getUint16(4, true);
      case 4: return v.getInt16(4, true);
      case 5: return v.getUint32(4, true);
      case 6: return v.getInt32(4, true);
      case 7: return v.getFloat32(4, true);
      default: return 0;
    }
  }
  P.paramRead = (id, t) => { const d = blank(0x40); d[1] = t; dv(d).setUint16(2, id, true); return d; };
  P.paramWrite = (id, t, x) => { const d = blank(0x42); d[1] = t; const v = dv(d); v.setUint16(2, id, true); putVal(v, t, x); return d; };
  P.paramReply = (d) => {
    const v = dv(d); const t = d[1] & 0x0F;
    return { cmd: d[0], status: d[1] >> 4, type: t, id: v.getUint16(2, true), value: getVal(v, t), raw: v.getUint32(4, true) };
  };

  // ---- 运行时控制参数 0xC0/0xC1 ----
  // 选择器：10/11/12 = 角度/速度/电流 PID；30 扭矩限制；32 速度限制；34 角度限制；36 电流斜率；38 速度斜率
  P.rtRead = (sel) => { const d = blank(0xC0); d[1] = sel; return d; };
  P.rtWrite = (sel, a) => {
    const d = blank(0xC1); const v = dv(d); d[1] = sel;
    if (sel >= 10 && sel <= 12) { v.setUint16(2, a[0], true); v.setUint16(4, a[1], true); v.setUint16(6, a[2], true); }
    else if (sel === 30) v.setInt16(4, a[0], true);
    else v.setInt32(4, a[0], true);
    return d;
  };
  P.rtDecode = (d) => {
    const v = dv(d); const sel = d[1];
    if (sel >= 10 && sel <= 12) return { sel, vals: [v.getUint16(2, true), v.getUint16(4, true), v.getUint16(6, true)] };
    if (sel === 30) return { sel, vals: [v.getInt16(4, true)] };
    return { sel, vals: [v.getInt32(4, true)] };
  };

  // ---- 广播 ----
  P.bcast = (group) => { const b = group === 2 ? 0x2C0 : 0x280; return { torque: b, speed: b + 1, angle: b + 2, mix: b + 8 }; };
  P.bcastS16 = (vals) => { const d = new Uint8Array(8); const v = dv(d); for (let i = 0; i < 4; i++) v.setInt16(i * 2, clamp(rnd(vals[i] || 0), -32768, 32767), true); return d; };
  P.bcastMix = (cmds) => { const d = new Uint8Array(8); for (let i = 0; i < 4; i++) { const c = cmds[i] || [0, 0]; d[i * 2] = c[0]; d[i * 2 + 1] = c[1]; } return d; };

  // ---- 帧解析成可读文字（帧监视、广播回复用）----
  P.CMDS = { 0x07: '重启', 0x18: '编码器对齐', 0x19: '保存编码器零偏', 0x1B: '编码器线性化', 0x20: '双编码器对齐', 0x40: '读参数', 0x42: '写参数', 0x44: '保存参数', 0x48: '恢复默认设置', 0x4A: '恢复默认编码器参数', 0x80: '关闭', 0x81: '停止', 0x88: '开启', 0x8C: '抱闸', 0x90: '读编码器', 0x92: '读多圈角度', 0x93: '清多圈角度', 0x94: '读单圈角度', 0x95: '设零点(RAM)', 0x9A: '读状态1', 0x9B: '清故障', 0x9C: '读状态2', 0x9D: '读状态3', 0xA1: '扭矩控制', 0xA2: '速度控制', 0xA3: '多圈位置', 0xA4: '多圈位置限速', 0xA5: '单圈位置', 0xA6: '单圈位置限速', 0xA7: '增量位置', 0xA8: '增量位置限速', 0xC0: '读运行参数', 0xC1: '写运行参数' };
  const BC = { 0x280: '组1 扭矩广播', 0x281: '组1 速度广播', 0x282: '组1 角度广播', 0x288: '组1 混合广播', 0x2C0: '组2 扭矩广播', 0x2C1: '组2 速度广播', 0x2C2: '组2 角度广播', 0x2C8: '组2 混合广播' };
  P.describe = (f, tx) => {
    const d = f.data, c = d[0], v = dv(d);
    if (BC[f.id]) return BC[f.id];
    if (d.length < 8) return '';
    const name = P.CMDS[c] || ('未知 0x' + c.toString(16));
    const pid = () => '0x' + v.getUint16(2, true).toString(16).toUpperCase().padStart(4, '0');
    if (tx) {
      if (c === 0xA1) return name + ' ' + v.getInt16(4, true) + ' LSB';
      if (c === 0xA2) return name + ' ' + (v.getInt32(4, true) / 100) + ' °/s' + (v.getInt16(2, true) ? '，限 ' + v.getInt16(2, true) : '');
      if (c >= 0xA3 && c <= 0xA8) return name + ' ' + ((c === 0xA5 || c === 0xA6) ? v.getUint32(4, true) : v.getInt32(4, true)) / 100 + ' °' + (v.getUint16(2, true) ? '，' + v.getUint16(2, true) + ' °/s' : '');
      if (c === 0x40) return name + ' ' + pid() + ' ' + (P.TYPES[d[1] & 15] || '');
      if (c === 0x42) return name + ' ' + pid() + ' = ' + P.paramReply(d).value;
      if (c === 0xC0 || c === 0xC1) return name + ' 选择器 ' + d[1];
      return name;
    }
    if (c === 0x9A || c === 0x9B) { const s = P.state1(d); return '状态1：' + (P.STATES[s.state] || s.state) + '，' + s.temp + '°C，' + s.vbus.toFixed(2) + 'V，' + s.ibus.toFixed(2) + 'A，' + P.errText(s.err); }
    if (c === 0x9C || (c >= 0xA1 && c <= 0xA8)) { const s = P.state2(d); return '状态2：' + s.temp + '°C，Iq ' + s.iq + '，' + s.speed + '°/s，编码器 ' + s.enc; }
    if (c === 0x9D) { const s = P.state3(d); return '状态3：Ia ' + s.ia + '，Ib ' + s.ib + '，Ic ' + s.ic; }
    if (c === 0x92) return '多圈角度 ' + P.angleMulti(d).toFixed(2) + ' °';
    if (c === 0x94) return '单圈角度 ' + P.angleSingle(d).toFixed(2) + ' °';
    if (c === 0x90) return '编码器 ' + (d[1] ? '原始' : '修正') + ' ' + v.getUint32(4, true);
    if (c === 0x8C) return '抱闸 ' + (d[1] ? '释放' : '吸合');
    if (c === 0x40 || c === 0x42 || c === 0x44) { const r = P.paramReply(d); return name + ' ' + pid() + ' ' + (P.PSTATUS[r.status] || r.status) + (r.status === 0 && c !== 0x44 ? ' 值 ' + r.value : ''); }
    if (c === 0xC0 || c === 0xC1) { const r = P.rtDecode(d); return name + ' 选择器 ' + r.sel + '：' + r.vals.join(' / '); }
    if (c === 0x18 || c === 0x1B) return name + (d[1] === 2 ? ' 当前状态不允许' : ' 结果：' + (d[6] ? '通过' : '失败'));
    return name;
  };

  LK.P = P;
})(window.LK = window.LK || {});
