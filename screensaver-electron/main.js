// 时间景观 · 桌面屏保（Win7 兼容版，Electron 22）
// 支持 /s(全屏,默认) /c(配置) /p <hwnd>(预览) /a(密码)
// 显示内容优先级：同目录 url.txt > 默认域名下的应用页(屏保模式)
const { app, BrowserWindow, screen, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'https://timeview.site/timeview/app?scrsv=1';

function readUrl() {
  try {
    const cfg = path.join(path.dirname(process.execPath), 'url.txt');
    if (fs.existsSync(cfg)) {
      const v = fs.readFileSync(cfg, 'utf-8').trim();
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
    }
  } catch (e) {}
  return DEFAULT_URL;
}

const argv = process.argv.slice(1).map(function (a) { return String(a).toLowerCase(); });

if (argv.indexOf('/c') >= 0) {
  // 配置
  app.whenReady().then(function () {
    dialog.showMessageBoxSync({
      type: 'info',
      title: '时间景观屏保',
      message: '时间景观 · 桌面屏保',
      detail: '地球表盘 · 月相 · 节气 · 星空 · 实时时钟\n\n无需额外配置。',
      buttons: ['确定']
    });
    app.quit();
  });
} else if (argv.indexOf('/a') >= 0) {
  app.quit();
} else {
  // /s 全屏（默认）；/p 也先按全屏处理（简化，后续可嵌入父窗口）
  let win = null;
  let timer = null;
  let basePos = null;
  let startTime = 0;

  function quit() {
    if (timer) { clearInterval(timer); timer = null; }
    if (win && !win.isDestroyed()) win.close();
    app.quit();
  }

  app.whenReady().then(function () {
    const display = screen.getPrimaryDisplay();
    win = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y,
      width: display.bounds.width, height: display.bounds.height,
      frame: false, fullscreen: true, alwaysOnTop: true, skipTaskbar: true,
      show: false, backgroundColor: '#050a18',
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    win.setMenuBarVisibility(false);
    const url = new URL(readUrl()); url.searchParams.set('scrsv', '1');
    win.loadURL(url.toString());
    win.webContents.setAudioMuted(true);
    win.once('ready-to-show', function () { win.show(); });

    // 退出检测：鼠标移动（全局轮询，前 400ms 忽略防止误退）
    basePos = screen.getCursorScreenPoint();
    startTime = Date.now();
    timer = setInterval(function () {
      if (Date.now() - startTime < 400) return;
      const p = screen.getCursorScreenPoint();
      if (Math.abs(p.x - basePos.x) > 4 || Math.abs(p.y - basePos.y) > 4) quit();
    }, 30);

    // 退出检测：任意按键 / 鼠标点击
    win.webContents.on('before-input-event', function (event, input) {
      if (input.type === 'keyDown' || input.type === 'mouseDown') quit();
    });

    win.on('closed', function () { app.quit(); });
  });
}

app.on('window-all-closed', function () { app.quit(); });
