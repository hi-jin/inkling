const { app, BrowserWindow, Menu, dialog, globalShortcut, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isMac = process.platform === 'darwin';
const DEFAULTS = { summon: 'CommandOrControl+Shift+Space' };
let win = null;
let quitting = false;
let boundsTimer = null;

const dataPath = (name) => path.join(app.getPath('userData'), name);

function readJSON(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(dataPath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

// write to a temp file first so a crash mid-write never leaves a half sheet behind
function writeText(name, text) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const target = dataPath(name);
  fs.writeFileSync(target + '.tmp', text);
  fs.renameSync(target + '.tmp', target);
}

function settings() {
  const saved = readJSON('settings.json', null);
  if (!saved) writeText('settings.json', JSON.stringify(DEFAULTS, null, 2) + '\n');
  return { ...DEFAULTS, ...saved };
}

function send(cmd) {
  if (!win) createWindow();
  win.show();
  win.webContents.send('command', cmd);
}

function createWindow() {
  const bounds = readJSON('window.json', { width: 1200, height: 800 });
  win = new BrowserWindow({
    ...bounds,
    minWidth: 560,
    minHeight: 400,
    title: 'Inkling',
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151922' : '#fbfbfa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const keepBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (win && !win.isDestroyed() && !win.isFullScreen()) writeText('window.json', JSON.stringify(win.getBounds()));
    }, 400);
  };
  win.on('resize', keepBounds);
  win.on('move', keepBounds);
  // on macOS the window only hides, so the summon shortcut brings it back instantly
  win.on('close', (e) => {
    if (isMac && !quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

// the shortcut toggles: summon from anywhere, press again to go back to what you were doing
function summon() {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isVisible() && win.isFocused()) {
    if (isMac) app.hide();
    else win.minimize();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (isMac) app.focus({ steal: true });
  win.webContents.send('command', 'summon');
}

function registerSummon() {
  const accel = settings().summon;
  let ok = false;
  try {
    ok = globalShortcut.register(accel, summon);
  } catch {
    ok = false;
  }
  console.log(`[inkling] summon ${accel}: ${ok ? 'registered' : 'unavailable'}`);
  return { accel, ok };
}

async function confirmClear() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Clear', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Clear the whole sheet?',
    detail: 'You can still undo it with ⌘Z.',
  });
  if (response === 0) send('clear');
}

const pretty = (accel) =>
  accel
    .replace(/CommandOrControl|CmdOrCtrl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Command|Cmd/g, '⌘')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
    .replace(/Alt|Option/g, isMac ? '⌥' : 'Alt')
    .replace(/Control|Ctrl/g, isMac ? '⌃' : 'Ctrl')
    .replace(/\+/g, isMac ? '' : '+');

function buildMenu(summonState) {
  // the page reads these keys itself, so the menu only shows them and relays clicks
  const item = (label, accelerator, cmd) => ({ label, accelerator, registerAccelerator: false, click: () => send(cmd) });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Clear Sheet…', click: confirmClear },
        { type: 'separator' },
        { label: 'Show Data Folder', click: () => shell.openPath(app.getPath('userData')) },
        { label: 'Edit Settings…', click: () => shell.openPath(dataPath('settings.json')) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('selectAll') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Jump to a Jot…', accelerator: 'CmdOrCtrl+K', click: () => send('jump') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoomOut') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => send('zoomReset') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: () => send('help') },
        { label: 'Load Example Sheet', click: () => send('example') },
        { type: 'separator' },
        {
          label: summonState.ok
            ? `Summon from anywhere: ${pretty(summonState.accel)}`
            : `Summon shortcut ${pretty(summonState.accel)} is taken. Edit Settings to change it.`,
          enabled: false,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('sheet:load', () => readJSON('sheet.json', null));
ipcMain.on('sheet:save', (_e, text) => writeText('sheet.json', text));
ipcMain.on('sheet:flush', (e, text) => {
  writeText('sheet.json', text);
  e.returnValue = true;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', summon);
  app.whenReady().then(() => {
    createWindow();
    buildMenu(registerSummon());
    app.on('activate', () => {
      if (win) win.show();
      else createWindow();
    });
  });
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
