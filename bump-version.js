// 每次上线部署前运行：把 server.js 的 VERSION 与 sw.js 的缓存键同步 +1 小版本
// 用法：node bump-version.js
const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
const swFile = path.join(__dirname, 'sw.js');

let server = fs.readFileSync(serverFile, 'utf-8');
const m = server.match(/const VERSION = "(\d+)\.(\d+)";/);
if (!m) { console.error('未找到 server.js 里的 VERSION 常量'); process.exit(1); }
const newVer = m[1] + '.' + (parseInt(m[2], 10) + 1);
server = server.replace(/const VERSION = "\d+\.\d+";/, 'const VERSION = "' + newVer + '";');
fs.writeFileSync(serverFile, server);

let sw = fs.readFileSync(swFile, 'utf-8');
sw = sw.replace(/const C = "timeview-v\d+\.\d+";/, 'const C = "timeview-v' + newVer + '";');
fs.writeFileSync(swFile, sw);

console.log('✅ 版本已更新为 v' + newVer + '（server.js VERSION + sw.js 缓存键同步）');
