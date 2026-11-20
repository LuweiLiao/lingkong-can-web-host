// 静态检查：JS 里引用的元素 id、script 文件、未填的标记。运行：node test/check-ids.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/id='([^']+)'/g)].map((m) => m[1]));
const dyn = /^(pid\d+_\d|lim\d+|bC\d|bP\d|bV\d)$/;   // 由脚本动态生成的 id
let bad = 0;
for (const f of fs.readdirSync(path.join(root, 'js'))) {
  const s = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  for (const m of s.matchAll(/\$\('#([A-Za-z0-9_]+)'\)/g)) {
    if (!ids.has(m[1]) && !dyn.test(m[1])) { bad++; console.log('缺少 id: #' + m[1] + ' (' + f + ')'); }
  }
}
for (const m of html.matchAll(/(?:src|href)='([^']+)'/g)) {
  if (!fs.existsSync(path.join(root, m[1]))) { bad++; console.log('缺少文件 ' + m[1]); }
}
if (/SECTION:/.test(html)) { bad++; console.log('index.html 还有未填的 SECTION 标记'); }
console.log(bad ? '发现 ' + bad + ' 处问题' : '检查通过，共 ' + ids.size + ' 个 id');
process.exit(bad ? 1 : 0);
