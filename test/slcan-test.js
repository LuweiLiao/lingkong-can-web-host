// 用模拟设备测 SLCAN 驱动：一问一答排队、ID/命令码匹配、超时、拆包、BEL 过滤。运行：node test/slcan-test.js
global.window = global;
global.navigator = {};
const path = require('path');
require(path.join(__dirname, '..', 'js', 'slcan.js'));
const LK = global.LK, CR = String.fromCharCode(13), BEL = String.fromCharCode(7);
let pass = 0, fail = 0;
function eq(name, got, want) { if (got === want) pass++; else { fail++; console.log('FAIL ' + name + '\n  got  ' + got + '\n  want ' + want); } }

const link = new LK.Slcan();
link.connected = true;
const sent = [];
// 模拟设备：收到发往 0x141 的帧后按命令码回复
link._raw = async (s) => {
  sent.push(s);
  if (s[0] !== 't') return;
  const data = s.substr(5, 16), cmd = data.substr(0, 2);
  if (cmd === '9C') setTimeout(() => link._feed('t14189C23F40164000080' + CR), 5);
  else if (cmd === '9A') {
    // 先来一帧别的节点的回复，再来本节点的，并拆成两块到达，中间夹 BEL
    setTimeout(() => link._feed('t142' + '89A00000000000000' + CR), 5);
    setTimeout(() => link._feed(BEL + 't1418' + '9A2310'), 10);
    setTimeout(() => link._feed('0E64003412' + CR), 15);
  } else if (cmd === '92') setTimeout(() => link._feed('t14189210270000000000' + CR), 50);
  // 其它命令（如 A1）不回复，用来测超时
};

const H = (d) => Array.from(d).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const d8 = (c) => { const d = new Uint8Array(8); d[0] = c; return d; };

(async () => {
  // 1. 单次请求
  let r = await link.request(0x141, d8(0x9C), { ackId: 0x141, timeout: 200 });
  eq('单次请求', H(r.data), '9C 23 F4 01 64 00 00 80');
  eq('发出帧格式', sent[0], 't14189C00000000000000' + CR);

  // 2. 别的 ID 的帧被忽略，拆包和 BEL 被正确处理
  r = await link.request(0x141, d8(0x9A), { ackId: 0x141, timeout: 200 });
  eq('忽略其它ID+拆包', r.id.toString(16) + ' ' + H(r.data), '141 9A 23 10 0E 64 00 34 12');

  // 3. 超时
  let err = null;
  const t0 = Date.now();
  try { await link.request(0x141, d8(0xA1), { ackId: 0x141, timeout: 80 }); } catch (e) { err = e; }
  eq('超时报错', err && err.message, '超时无回复');
  eq('超时时间合理', Date.now() - t0 >= 70 && Date.now() - t0 < 300, true);
  eq('超时后等待表清空', link.waiters.length, 0);

  // 4. 并发请求按顺序串行：慢的 0x92（50ms）先发，快的 0x9C 后发，各自拿到自己的回复
  const order = [];
  const [a, b] = await Promise.all([
    link.request(0x141, d8(0x92), { ackId: 0x141, timeout: 300 }).then((x) => { order.push('92'); return x; }),
    link.request(0x141, d8(0x9C), { ackId: 0x141, timeout: 300 }).then((x) => { order.push('9C'); return x; })
  ]);
  eq('并发串行-回复1', a.data[0], 0x92);
  eq('并发串行-回复2', b.data[0], 0x9C);
  eq('并发串行-顺序', order.join(','), '92,9C');

  // 5. 超时的请求不会堵住后面的请求
  const p1 = link.request(0x141, d8(0xA1), { ackId: 0x141, timeout: 60 }).catch(() => 'timeout');
  const p2 = link.request(0x141, d8(0x9C), { ackId: 0x141, timeout: 200 });
  eq('超时不堵队列-1', await p1, 'timeout');
  eq('超时不堵队列-2', (await p2).data[0], 0x9C);

  // 6. 自定义 match（运行时参数：命令码和选择器都要对上）
  link._raw = async (s) => { if (s.substr(5, 2) === 'C0') setTimeout(() => { link._feed('t14188C0200000000000' + '00' + CR); link._feed('t14188C0210000000000' + '00' + CR); }, 5); };
  // 这里故意先回选择器 0x02 的帧，再回选择器 0x10 的帧
  const req = d8(0xC0); req[1] = 0x10;
  link._raw = async (s) => { setTimeout(() => { link._feed('t1418C002000000000000' + CR); link._feed('t1418C010000000000000' + CR); }, 5); };
  r = await link.request(0x141, req, { timeout: 200, match: (f) => f.id === 0x141 && f.data[0] === 0xC0 && f.data[1] === 0x10 });
  eq('自定义匹配', H(r.data), 'C0 10 00 00 00 00 00 00');

  // 7. 断开时所有等待中的请求被拒绝
  link._raw = async () => {};
  const pend = link.request(0x141, d8(0x9C), { ackId: 0x141, timeout: 1000 }).catch((e) => e.message);
  await LK.sleep(10);
  link._failAll(new Error('已断开'));
  eq('断开拒绝等待', await pend, '已断开');

  // 8. DLC 固定 8、扩展帧格式
  sent.length = 0;
  link._raw = async (s) => { sent.push(s); };
  await link.send(0x141, [0x9C], true);
  eq('扩展帧发送', sent[0], 'T000001418' + '9C00000000000000' + CR);

  console.log('通过 ' + pass + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
