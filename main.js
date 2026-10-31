const { app, BrowserWindow, Menu, dialog, globalShortcut, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Keymap = require('./app/keymap.js');

const isMac = process.platform === 'darwin';
const NOTE_ID = /^n[a-z0-9]{4,40}$/;
let win = null;
let quitting = false;
let boundsTimer = null;
let prefs = null;
let summonKey = null;
let summonOk = false;
let summonPaused = false;

const dataPath = (...parts) => path.join(app.getPath('userData'), ...parts);
const notesDir = () => dataPath('notes');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// write to a temp file first so a crash mid-write never leaves a half note behind
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}

function notePath(id) {
  if (!NOTE_ID.test(String(id))) throw new Error(`bad note id: ${id}`);
  return path.join(notesDir(), id + '.json');
}

function noteFiles() {
  try {
    return fs.readdirSync(notesDir()).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
}

function loadPrefs() {
  const raw = readJSON(dataPath('settings.json'), {}) || {};
  const keys = { ...(raw.keys || {}) };
  if (raw.summon && !keys.summon) {
    const b = Keymap.fromAccel(raw.summon);
    if (b) keys.summon = [b];
  }
  prefs = {
    keys: Keymap.merge(keys),
    library: raw.library !== false,
    lastNote: typeof raw.lastNote === 'string' && NOTE_ID.test(raw.lastNote) ? raw.lastNote : null,
  };
}

function savePrefs() {
  const out = { keys: Keymap.diff(prefs.keys), library: prefs.library, lastNote: prefs.lastNote };
  writeText(dataPath('settings.json'), JSON.stringify(out, null, 2) + '\n');
}

// 0.1.0 kept one sheet in sheet.json; it becomes the first note
function migrate() {
  const old = dataPath('sheet.json');
  if (!fs.existsSync(old)) return;
  const d = readJSON(old, null);
  if (!noteFiles().length && d && d.S && Array.isArray(d.S.jots)) {
    const id = 'n' + Date.now().toString(36);
    const now = Date.now();
    writeText(notePath(id), JSON.stringify({ id, created: now, updated: now, S: d.S, cam: d.cam }));
    prefs.lastNote = id;
    savePrefs();
  }
  fs.renameSync(old, dataPath('sheet-0.1.json'));
}

function send(cmd) {
  if (!win) createWindow();
  win.show();
  win.webContents.send('command', cmd);
}

function createWindow() {
  const bounds = readJSON(dataPath('window.json'), { width: 1200, height: 800 });
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
      if (win && !win.isDestroyed() && !win.isFullScreen()) writeText(dataPath('window.json'), JSON.stringify(win.getBounds()));
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

function registerSummon(binding) {
  if (summonKey) globalShortcut.unregister(summonKey);
  summonKey = null;
  const acc = Keymap.accel(binding);
  let ok = false;
  try {
    ok = !!acc && globalShortcut.register(acc, summon);
  } catch {
    ok = false;
  }
  if (ok) summonKey = acc;
  console.log(`[inkling] summon ${acc || binding}: ${ok ? 'registered' : 'unavailable'}`);
  return ok;
}

async function confirmClear() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Clear', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Clear this note?',
    detail: 'You can still undo it.',
  });
  if (response === 0) send('clear');
}

function buildMenu() {
  const keys = prefs.keys;
  const lib = prefs.library;
  // the window reads every key itself, so menu items only show their keys and relay clicks
  const item = (label, id) => ({
    label,
    accelerator: Keymap.accel((keys[id] || [])[0] || '') || undefined,
    registerAccelerator: false,
    click: () => send(id),
  });
  const summonLabel = `${Keymap.show(keys.summon[0], isMac)}`;
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            item('Settings…', 'settings'),
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        ...(lib ? [item('New Note', 'newNote'), item('Find a Note…', 'library'), { type: 'separator' }] : []),
        { label: 'Clear This Note…', click: confirmClear },
        { type: 'separator' },
        { label: 'Show Data Folder', click: () => shell.openPath(app.getPath('userData')) },
        ...(isMac ? [] : [item('Settings…', 'settings')]),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'undo'),
        item('Redo', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        item('Select All', 'selectAll'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Jump to a Jot…', 'jump'),
        { type: 'separator' },
        item('Zoom In', 'zoomIn'),
        item('Zoom Out', 'zoomOut'),
        item('Actual Size', 'zoomReset'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Keyboard Shortcuts', 'help'),
        { label: lib ? 'Open Example Note' : 'Load Example Sheet', click: () => send('example') },
        { type: 'separator' },
        {
          label: summonOk ? `Summon from anywhere: ${summonLabel}` : `Summon shortcut ${summonLabel} is taken. Change it in Settings.`,
          enabled: false,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('settings:get', () => ({ ...prefs, summonOk }));
ipcMain.handle('settings:set', (_e, patch = {}) => {
  let summonTaken = false;
  if (patch.keys) {
    const prev = prefs.keys.summon[0];
    prefs.keys = Keymap.merge(patch.keys);
    summonPaused = false;
    summonOk = registerSummon(prefs.keys.summon[0]);
    if (!summonOk && prefs.keys.summon[0] !== prev) {
      summonTaken = true;
      prefs.keys.summon = [prev];
      summonOk = registerSummon(prev);
    }
  }
  if (typeof patch.library === 'boolean') prefs.library = patch.library;
  if (patch.lastNote === null || (typeof patch.lastNote === 'string' && NOTE_ID.test(patch.lastNote))) prefs.lastNote = patch.lastNote;
  savePrefs();
  if (patch.keys || typeof patch.library === 'boolean') buildMenu();
  return { ...prefs, summonOk, summonTaken };
});
// while the summon key is being re-recorded, pressing the old one must not hide the window
ipcMain.on('summon:pause', (_e, on) => {
  if (on && !summonPaused) {
    summonPaused = true;
    if (summonKey) globalShortcut.unregister(summonKey);
    summonKey = null;
  } else if (!on && summonPaused) {
    summonPaused = false;
    summonOk = registerSummon(prefs.keys.summon[0]);
  }
});

ipcMain.handle('notes:list', () =>
  noteFiles()
    .map((n) => readJSON(path.join(notesDir(), n), null))
    .filter((d) => d && NOTE_ID.test(String(d.id)) && d.S && Array.isArray(d.S.jots))
    .map((d) => ({
      id: d.id,
      created: d.created || 0,
      updated: d.updated || 0,
      jots: d.S.jots.map((j) => ({ id: String(j.id), text: String(j.text || ''), kind: j.kind || '' })),
    })),
);
ipcMain.handle('notes:load', (_e, id) => readJSON(notePath(id), null));
ipcMain.on('notes:save', (_e, id, text) => writeText(notePath(id), text));
ipcMain.on('notes:flush', (e, id, text) => {
  try {
    writeText(notePath(id), text);
  } finally {
    e.returnValue = true;
  }
});
// a deleted note moves to notes/.trash instead of disappearing
ipcMain.handle('notes:remove', (_e, id) => {
  const file = notePath(id);
  if (fs.existsSync(file)) {
    fs.mkdirSync(path.join(notesDir(), '.trash'), { recursive: true });
    fs.renameSync(file, path.join(notesDir(), '.trash', `${id}.json`));
  }
  return true;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', summon);
  app.whenReady().then(() => {
    loadPrefs();
    migrate();
    summonOk = registerSummon(prefs.keys.summon[0]);
    buildMenu();
    createWindow();
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
