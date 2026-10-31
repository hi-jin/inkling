// Every action that has a key, plus helpers that read a key press, show a binding and turn it into an Electron accelerator.
// The window loads this as a plain script; the main process loads it with require().
(function (root) {
  const ACTIONS = [
    { id: 'summon', label: 'Bring Inkling to the front from any app', ctx: 'system', keys: ['Mod+Shift+Space'] },
    { id: 'library', label: 'Find a note', ctx: 'global', keys: ['Mod+O'], lib: true },
    { id: 'newNote', label: 'New note', ctx: 'global', keys: ['Mod+N'], lib: true },
    { id: 'jump', label: 'Jump to a jot', ctx: 'global', keys: ['Mod+K'] },
    { id: 'undo', label: 'Undo', ctx: 'global', keys: ['Mod+Z'] },
    { id: 'redo', label: 'Redo', ctx: 'global', keys: ['Mod+Shift+Z'] },
    { id: 'selectAll', label: 'Select all', ctx: 'global', keys: ['Mod+A'] },
    { id: 'zoomIn', label: 'Zoom in', ctx: 'global', keys: ['Mod+='] },
    { id: 'zoomOut', label: 'Zoom out', ctx: 'global', keys: ['Mod+-'] },
    { id: 'zoomReset', label: 'Actual size', ctx: 'global', keys: ['Mod+0'] },
    { id: 'help', label: 'Show all keys', ctx: 'global', keys: ['Mod+/'] },
    { id: 'settings', label: 'Settings', ctx: 'global', keys: ['Mod+,'] },
    { id: 'list', label: 'Next line in a list', ctx: 'writing', keys: ['Enter'] },
    { id: 'step', label: 'Next step, with an arrow', ctx: 'both', keys: ['Tab'] },
    { id: 'stepBack', label: 'Back to the previous step', ctx: 'both', keys: ['Shift+Tab'] },
    { id: 'done', label: 'Done writing', ctx: 'writing', keys: ['Escape'] },
    { id: 'walk', label: 'Move between jots', ctx: 'selected', keys: ['Arrows'], arrows: true },
    { id: 'extend', label: 'Select more', ctx: 'selected', keys: ['Shift+Arrows'], arrows: true },
    { id: 'move', label: 'Move selected jots', ctx: 'selected', keys: ['Alt+Arrows'], arrows: true },
    { id: 'moveGroup', label: 'Move their whole group', ctx: 'selected', keys: ['Alt+Shift+Arrows'], arrows: true },
    { id: 'edit', label: 'Edit the selected jot', ctx: 'selected', keys: ['Enter'] },
    { id: 'markQ', label: 'Mark as a question', ctx: 'selected', keys: ['?'] },
    { id: 'markImp', label: 'Mark as a key point', ctx: 'selected', keys: ['!'] },
    { id: 'markX', label: 'Scratch out', ctx: 'selected', keys: ['~'] },
    { id: 'delete', label: 'Delete', ctx: 'selected', keys: ['Backspace', 'Delete'] },
    { id: 'unlink', label: 'Remove arrows only', ctx: 'selected', keys: ['Shift+Backspace'] },
    { id: 'deselect', label: 'Deselect', ctx: 'selected', keys: ['Escape'] },
  ];
  const BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
  const MODS = ['Mod', 'Ctrl', 'Alt', 'Shift'];
  const NAMED = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
  const CODE_CHARS = { Equal: '=', Minus: '-', Slash: '/', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`' };
  const DIRS = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' };
  // macOS already answers these through its own menus
  const RESERVED = new Set(['Mod+Q', 'Mod+W', 'Mod+H', 'Mod+M', 'Mod+C', 'Mod+V', 'Mod+X', 'Mod+Alt+H', 'Mod+Ctrl+F']);
  const REACH = { system: ['w', 's'], global: ['w', 's'], writing: ['w'], selected: ['s'], both: ['w', 's'] };

  function parse(b) {
    const m = /^((?:(?:Mod|Ctrl|Alt|Shift)\+)*)(.+)$/.exec(String(b));
    return m ? { mods: m[1] ? m[1].slice(0, -1).split('+') : [], key: m[2] } : { mods: [], key: String(b) };
  }
  const canon = (mods, key) => [...MODS.filter((m) => mods.includes(m)), key].join('+');

  // Letters and digits are read by their physical key, so they still work with a Korean or other input source.
  // Plain symbols such as ? and ! are read as the character they type.
  function combo(ev, mac) {
    const k = ev.key || '', code = ev.code || '';
    if (/^(Shift|Control|Alt|Meta|CapsLock|Fn|FnLock|OS|Hyper|Super|AltGraph)$/.test(k)) return null;
    const mod = mac ? ev.metaKey : ev.ctrlKey, ctrl = mac && ev.ctrlKey, alt = ev.altKey, plain = !mod && !ctrl && !alt;
    let shift = ev.shiftKey, key = null;
    if (k === ' ' || code === 'Space') key = 'Space';
    else if (/^(Key[A-Z]|Digit\d)$/.test(code) && !(plain && k.length === 1 && k.charCodeAt(0) < 128 && /[^a-z0-9]/i.test(k))) key = code.replace(/^(Key|Digit)/, '');
    else if (NAMED.has(k)) key = k;
    else if (k.length === 1) {
      if (plain) { key = k; shift = false; } else key = CODE_CHARS[code] || k.toUpperCase();
    }
    if (!key) return null;
    const mods = [mod && 'Mod', ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift'].filter(Boolean);
    const dir = DIRS[key] || null;
    return { exact: canon(mods, key), family: dir ? canon(mods, 'Arrows') : null, dir, key, mods };
  }

  const SYM = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }, WORD = { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
  const KEYNAME = { Space: 'Space', Enter: 'Enter', Escape: 'Esc', Backspace: '⌫', Delete: '⌦', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Arrows: '↑↓←→', PageUp: 'PgUp', PageDown: 'PgDn' };
  function show(b, mac) {
    const { mods, key } = parse(b), name = KEYNAME[key] || key;
    return mac ? mods.map((m) => SYM[m]).join('') + name : [...mods.map((m) => WORD[m]), name].join('+');
  }

  const ACCEL = { Mod: 'CommandOrControl', Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift' };
  const ACCEL_KEY = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', '+': 'Plus' };
  function accel(b) {
    const { mods, key } = parse(b);
    if (key === 'Arrows') return null;
    const k = ACCEL_KEY[key] || (key.length === 1 ? key.toUpperCase() : NAMED.has(key) || key === 'Space' ? key : null);
    return k ? [...mods.map((m) => ACCEL[m]), k].join('+') : null;
  }
  // 0.1.0 stored the summon key as an Electron accelerator
  function fromAccel(a) {
    const parts = String(a || '').split('+'), last = parts.pop();
    const mods = parts.map((p) => (/^(CommandOrControl|CmdOrCtrl|Command|Cmd|Super|Meta)$/i.test(p) ? 'Mod' : /^(Control|Ctrl)$/i.test(p) ? 'Ctrl'
      : /^(Alt|Option)$/i.test(p) ? 'Alt' : /^Shift$/i.test(p) ? 'Shift' : null));
    if (!last || mods.includes(null)) return null;
    const back = { Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', Return: 'Enter', Esc: 'Escape', Plus: '+' };
    return canon(mods, back[last] || (last.length === 1 ? last.toUpperCase() : last));
  }

  // returns a sentence explaining why the binding cannot be used, or null
  function check(id, b, keys) {
    const a = BY_ID[id];
    if (!a) return 'Unknown action.';
    const { mods, key } = parse(b), strong = mods.some((m) => m !== 'Shift');
    if (!!a.arrows !== (key === 'Arrows')) return a.arrows ? 'Hold any modifiers you like, then press an arrow key.' : 'Arrow keys alone belong to moving around.';
    if (RESERVED.has(b)) return 'macOS already uses this one.';
    if (b === 'Space') return 'Space is for panning the sheet.';
    if ((a.ctx === 'system' || a.ctx === 'global') && !strong && !/^F\d+$/.test(key)) return 'Add ⌘, ⌃ or ⌥ so it does not type text.';
    if ((a.ctx === 'writing' || a.ctx === 'both') && !strong && (key.length === 1 || key === 'Space')) return 'This key types text while writing. Add ⌘, ⌃ or ⌥.';
    for (const o of ACTIONS) {
      if (o.id === id || !(keys[o.id] || []).includes(b)) continue;
      if (REACH[o.ctx].some((r) => REACH[a.ctx].includes(r))) return `Already used for “${o.label}”.`;
    }
    return null;
  }

  function merge(over) {
    const out = {};
    for (const a of ACTIONS) {
      const v = over && over[a.id];
      out[a.id] = Array.isArray(v) && v.length && v.every((x) => typeof x === 'string') ? v.slice() : a.keys.slice();
    }
    return out;
  }
  function diff(keys) {
    const out = {};
    for (const a of ACTIONS) if (keys[a.id] && JSON.stringify(keys[a.id]) !== JSON.stringify(a.keys)) out[a.id] = keys[a.id];
    return out;
  }

  const api = { ACTIONS, BY_ID, parse, combo, show, accel, fromAccel, check, merge, diff, defaults: () => merge({}) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Keymap = api;
})(this);
