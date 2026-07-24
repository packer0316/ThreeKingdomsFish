const { app, BrowserWindow } = require('electron');
const path = require('path');

// Electron 桌面版外殼：載入 vite 打包後的 dist/index.html
// （專案 package.json 為 "type": "module"，主程序用 .cjs 走 CommonJS）

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#000000',
    autoHideMenuBar: true,          // 隱藏選單列（按 Alt 可暫時叫出）
    webPreferences: {
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
