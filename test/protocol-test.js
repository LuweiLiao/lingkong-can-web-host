// 用协议文档第 12 章的原始帧示例核对编解码。运行：node test/protocol-test.js
global.window = global;
const path = require('path');
const js = path.join(__dirname, '..', 'js');
require(path.join(js, 'slcan.js'));
require(path.join(js, 'protocol.js'));
const P = global.LK.P;
let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; } else { fail++; console.log('FAIL ' + name + '\n  got  ' + got + '\n  want ' + want); }
}
const H = P.hexBytes;

// 运动控制
eq('A1 +500', H(P.torque(500)), 'A1 00 00 00 F4 01 00 00');
eq('A2 +100°/s', H(P.speed(100, 0)), 'A2 00 00 00 10 27 00 00');
eq('A3 +90°', H(P.posMulti(90, 0)), 'A3 00 00 00 28 23 00 00');
eq('A4 限速', H(P.posMulti(90, 200)), 'A4 00 C8 00 28 23 00 00');
eq('A5 反向', H(P.posSingle(90, 1, 0)), 'A5 01 00 00 28 23 00 00');
eq('A7 -90°', H(P.posInc(-90, 0)), 'A7 00 00 00 D8 DC FF FF');

// 参数读写保存
eq('读 0x0006 U8', H(P.paramRead(6, 1)), '40 01 06 00 00 00 00 00');
eq('写 0x001E=1', H(P.paramWrite(0x1E, 1, 1)), '42 01 1E 00 01 00 00 00');
eq('SAVE', H(P.save()), '44 00 00 00 53 41 56 45');
const pr = P.paramReply(Uint8Array.from([0x40, 0x01, 0x06, 0x00, 0x04, 0, 0, 0]));
eq('读回复', pr.status + ',' + pr.type + ',' + pr.id + ',' + pr.value, '0,1,6,4');
eq('越界状态码', P.paramReply(Uint8Array.from([0x42, 0x50, 0x1E, 0, 0, 0, 0, 0])).status, 5);

// 口令帧
eq('REBOOT', H(P.reboot()), '07 52 45 42 4F 4F 54 5F');
eq('ALIGN', H(P.align()), '18 41 4C 49 47 4E 5F 5F');
eq('LINEAR', H(P.linearize()), '1B 4C 49 4E 45 41 52 5F');
eq('REALIGN', H(P.reducerAlign()), '20 52 45 41 4C 49 47 4E');
eq('RESET_S', H(P.resetSettings()), '48 52 45 53 45 54 5F 53');
eq('RESET_E', H(P.resetEncoder()), '4A 52 45 53 45 54 5F 45');

// 广播
eq('速度广播', H(P.bcastS16([10, -10, 0, 100])), '0A 00 F6 FF 00 00 64 00');
eq('混合广播', H(P.bcastMix([[0x9A, 0], [0x9C, 0], [0x9D, 0], [0x92, 0]])), '9A 00 9C 00 9D 00 92 00');
eq('广播 ID 组1', P.bcast(1).speed, 0x281);
eq('广播 ID 组2 混合', P.bcast(2).mix, 0x2C8);

// 运行时参数
eq('读速度限制', H(P.rtRead(32)), 'C0 20 00 00 00 00 00 00');

// 状态解码
const s2 = P.state2(Uint8Array.from([0x9C, 0x23, 0xF4, 0x01, 0x64, 0x00, 0x00, 0x80]));
eq('状态2', [s2.temp, s2.iq, s2.speed, s2.enc].join(','), '35,500,100,32768');
const s1 = P.state1(Uint8Array.from([0x9A, 0x23, 0x10, 0x0E, 0x64, 0x00, 0x34, 0x12]));
eq('状态1', [s1.temp, s1.vbus, s1.ibus, s1.state, s1.err].join(','), '35,36,1,3,1042');
eq('多圈 +100°', P.angleMulti(Uint8Array.from([0x92, 0x10, 0x27, 0, 0, 0, 0, 0])), 100);
eq('多圈 -100°', P.angleMulti(Uint8Array.from([0x92, 0xF0, 0xD8, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])), -100);
eq('故障文字', P.errText(0x401), '欠压、编码器异常');

// SLCAN 帧解析（0x141 回复状态 2）
const link = new global.LK.Slcan();
const f = link._parse('t14189C23F40164000080');
eq('SLCAN 解析', f && (f.id.toString(16) + ',' + f.dlc + ',' + H(f.data)), '141,8,9C 23 F4 01 64 00 00 80');
const fx = link._parse('T000001418' + '9C23F40164000080');
eq('SLCAN 扩展帧', fx && (fx.ext + ',' + fx.id.toString(16)), 'true,141');
eq('SLCAN 坏帧', link._parse('t1418'), null);

console.log('通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
