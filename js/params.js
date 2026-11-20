// 参数表：对应协议附录 A（68 个普通参数）、附录 B（产品信息）、附录 C（枚举）
// 行格式：ID|名称|中文|类型码|可写(1/0)|最小|最大|单位或备注|枚举名
// 类型码：1=U8 2=S8 3=U16 4=S16 5=U32 6=S32 7=F32
(function (LK) {
  'use strict';
  const ENUMS = {
    bool: ['禁用', '启用'],
    ext: ['标准帧', '扩展帧'],
    dir: ['正向', '反向'],
    bus: ['无', 'RS485', 'CAN', 'EtherCAT', 'EtherCAT+RS485', 'EtherCAT+CAN'],
    rs485: ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600', '1000000', '2000000', '4000000'],
    can: ['100k', '125k', '250k', '500k', '1M'],
    prot: ['不可用', '禁用', '可恢复', '不可恢复'],
    en3: ['不可用', '禁用', '启用']
  };
  const RAW = [
    ['通信与基本配置', [
      '0x0000|driverId|节点ID|1|1|0|63|0=使用拨码 1~8，保存重启生效',
      '0x0001|busType|总线类型|1|1|0|5||bus',
      '0x0002|differentAckId|不同回复ID|1|1|0|1|1=0x180+ID，保存重启生效|bool',
      '0x0003|rs485BaudRate|RS485波特率|1|1|0|10||rs485',
      '0x0006|canBaudRate|CAN波特率|1|1|0|4|保存后重启生效|can',
      '0x0008|canUseExtended|CAN扩展帧|1|1|0|1|保存后重启生效|ext',
      '0x001E|broadcastMode|广播模式|1|1|0|1||bool',
      '0x001F|spinDirection|电机转向|1|1|0|1||dir',
      '0x0023|cspSmoothEnable|CSP平滑使能|1|1|0|1||bool'
    ]],
    ['保护参数', [
      '0x0028|protectMotorTempEnable|电机温度保护|1|1|0|3||prot',
      '0x0029|protectDriverTempEnable|驱动温度保护|1|1|0|3||prot',
      '0x002A|protectUnderVoltageEnable|欠压保护|1|1|0|3||prot',
      '0x002B|protectOverVoltageEnable|过压保护|1|1|0|3||prot',
      '0x002C|protectBusCurrentEnable|母线电流保护|1|1|0|3||prot',
      '0x002D|protectI2tCurrentEnable|I2t电流保护|1|1|0|3||prot',
      '0x002E|protectStallEnable|堵转保护|1|1|0|3||prot',
      '0x002F|protectLostInputEnable|丢输入保护|1|1|0|3||prot',
      '0x0037|protectMotorTemp|电机温度阈值|2|1|-55|125|°C',
      '0x0038|protectDriverTemp|驱动温度阈值|2|1|-55|125|°C',
      '0x0039|protectUnderVoltage|欠压阈值|3|1|100|40000|0.01 V',
      '0x003A|protectOverVoltage|过压阈值|3|1|100|40000|0.01 V',
      '0x003B|protectBusCurrent|母线电流阈值|3|1|10|40000|0.01 A',
      '0x003C|protectBusCurrentTime|母线电流时间|3|1|0|60000|ms',
      '0x003D|protectI2tPeakCurrent|I2t峰值电流|3|1|10|40000|0.01 A',
      '0x003E|protectI2tPeakTime|I2t峰值时间|3|1|0|60000|ms',
      '0x003F|protectStallCurrent|堵转电流阈值|3|1|10|40000|0.01 A',
      '0x0040|protectStallTime|堵转保护时间|3|1|0|60000|ms',
      '0x0041|protectLostInputTime|丢输入时间|3|1|0|60000|ms',
      '0x0042|protectInormCurrent|Inorm瞬时过流|3|1|10|40000|0.01 A，触发故障位 0x100',
      '0x0043|protectPhaseCurrentHard|相电流硬保护|3|1|10|40000|0.01 A，触发故障位 0x100',
      '0x00B2|motorRatedCurrent|额定电流(I2t)|3|1|10|40000|0.01 A'
    ]],
    ['泄放电阻与断电抱闸', [
      '0x004B|brakeResEnable|泄放电阻使能|1|1|0|2||en3',
      '0x004C|brakeResOnVoltage|泄放开启电压|3|1|100|40000|0.01 V',
      '0x004D|brakeResDeadbandVoltage|泄放死区电压|3|1|0|1000|0.01 V',
      '0x0050|offBrakeEnable|断电抱闸使能|1|1|0|2||en3',
      '0x0051|offBrakeTriggerDutyCycle|抱闸触发占空比|1|1|0|100|%',
      '0x0052|offBrakeHoldingDutyCycle|抱闸保持占空比|1|1|0|100|%'
    ]],
    ['PID 参数', [
      '0x0073|anglePidKp|角度PID Kp|3|1|0|2000|原始系数',
      '0x0074|anglePidKi|角度PID Ki|3|1|0|2000|原始系数',
      '0x0078|speedPidKp|速度PID Kp|3|1|0|2000|原始系数',
      '0x0079|speedPidKi|速度PID Ki|3|1|0|2000|原始系数',
      '0x007D|currentPidKp|电流PID Kp|3|1|0|2000|原始系数',
      '0x007E|currentPidKi|电流PID Ki|3|1|0|2000|原始系数'
    ]],
    ['运动限制', [
      '0x008C|maxTorque|最大扭矩/电流目标|4|1|-2000|2000|原始电流 LSB，不是 N·m',
      '0x008E|maxSpeed|最大速度|6|1|-6000000|6000000|0.01°/s',
      '0x0090|maxAngle|最大角度|6|1|-2147483647|2147483647|存储单位 °',
      '0x0092|currentRamp|电流斜率|6|1|-300000|300000|原始 LSB/s',
      '0x0094|speedRamp|速度斜率|6|1|-600000|600000|°/s²'
    ]],
    ['采样比例', [
      '0x00A0|uScaleVoltagePerLsb|母线电压比例|7|0|||V/LSB',
      '0x00A2|ibusScaleCurrentPerLsb|母线电流比例|7|0|||A/LSB',
      '0x00A4|iScaleCurrentPerLsb|相电流比例|7|0|||A/LSB，用于 Iq/Ia/Ib/Ic 换算'
    ]],
    ['电机、编码器与标定', [
      '0x00AB|motorPoles|电机磁极数|1|1|2|200|极数',
      '0x00B9|vfVoltage|VF电压|3|1|0|65535|内部校准值',
      '0x00BE|moduleReductionRatioNumerator|减速比分子|3|0|1|65535|与分母共同定义 R',
      '0x00BF|moduleReductionRatioDenominator|减速比分母|3|0|1|65535|与分子共同定义 R',
      '0x00C0|moduleEncoderNum|模组编码器配置|1|0|||原始枚举值',
      '0x00C4|motorEncoderDirection|电机编码器方向|1|0|||原始枚举值',
      '0x00C5|motorPhaseSequence|电机相序|1|0|||原始枚举值',
      '0x00C6|motorEncoderAlignValue16|编码器对齐值|3|0|||原始标定值',
      '0x00C7|motorEncoderAlignRatio|编码器对齐比例|4|0|||原始标定值',
      '0x00C8|motorEncoderAlignGoodFlag|对齐完成标志|1|0|0|1|1=有效',
      '0x00C9|motorEncoderLinearizeRatio|线性化比例|4|0|||原始标定值',
      '0x00CA|motorEncoderLinearizeGoodFlag|线性化完成标志|1|0|0|1|1=有效',
      '0x00CB|motorEncoderLinearizeEnable|线性化使能|1|1|0|1||bool',
      '0x00CC|motorEncoderOffset|电机编码器零位|5|0|||原始标定值',
      '0x00D9|encoderRelateValue16|主副编码器关联值|3|0|||原始标定值',
      '0x00DA|encoderRelateValueFlag|关联标志|1|0|0|1|1=有效',
      '0x00DB|secondEncoderOffset|第二编码器零位|5|0|||原始标定值'
    ]]
  ];

  const num = (s) => (s === '' || s === undefined ? null : Number(s));
  const groups = RAW.map((g) => ({
    name: g[0],
    rows: g[1].map((s) => {
      const a = s.split('|');
      return { id: Number(a[0]), key: a[1], cn: a[2], t: Number(a[3]), rw: a[4] === '1', min: num(a[5]), max: num(a[6]), unit: a[7] || '', en: a[8] ? ENUMS[a[8]] : null };
    })
  }));
  const map = {};
  groups.forEach((g) => g.rows.forEach((r) => { map[r.id] = r; }));

  LK.ENUMS = ENUMS;
  LK.PARAM_GROUPS = groups;
  LK.PARAM_MAP = map;
  // 附录 B：产品信息（只读）。[起始ID, 个数] 的字符串块按 ID 升序拼接每个值的 4 个原始字节
  LK.INFO = {
    devType: 0xE000, hwVer: 0xE040, motorVer: 0xE041, fwVer: 0xE042,
    driverName: [0xE010, 10], motorName: [0xE020, 10], chipId: [0xE030, 5]
  };
})(window.LK = window.LK || {});
