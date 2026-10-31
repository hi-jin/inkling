// Settings: the library switch and every key, including the one that brings Inkling up from other apps.
const setEl=$('settings'),keyRows=$('keyRows'),keyMsg=$('keyMsg'),optLib=$('optLib');
const GROUPS=[
  ['Anywhere',['summon','library','newNote','jump','undo','redo','selectAll','zoomIn','zoomOut','zoomReset','help','settings']],
  ['Writing',['list','step','stepBack','done']],
  ['Selected',['walk','extend','move','moveGroup','edit','markQ','markImp','markX','delete','unlink','deselect']]];
let rec=null;

function say(text,bad){keyMsg.textContent=text;keyMsg.classList.toggle('bad',!!bad)}
function openSettings(){closeOverlays();if(cur)exitEdit();optLib.checked=libOn;say('');renderKeys();setEl.hidden=false;optLib.focus()}
function closeSettings(){stopRec();setEl.hidden=true;bd.focus({preventScroll:true})}
setEl.addEventListener('pointerdown',ev=>{if(ev.target===setEl)closeSettings()});
$('setDone').addEventListener('click',closeSettings);

function renderKeys(){
  keyRows.textContent='';
  for(const[name,ids]of GROUPS){
    const g=document.createElement('div');g.className='kgroup';const h=document.createElement('h3');h.textContent=name;g.appendChild(h);
    for(const id of ids){
      if(id==='summon'&&!DESK)continue;
      const a=Keymap.BY_ID[id],row=document.createElement('div'),lab=document.createElement('span'),chips=document.createElement('span');
      row.className='krow'+(a.lib&&!libOn?' off':'');lab.className='klabel';lab.textContent=a.label;chips.className='kchips';
      if(id==='summon'&&!summonOk){const w=document.createElement('span');w.className='warn';w.textContent=' · taken by another app';lab.appendChild(w)}
      KM[id].forEach((b,i)=>chips.appendChild(chip(id,i,b)));
      // the summon key is registered with macOS, which takes one shortcut per app action
      if(id!=='summon'&&KM[id].length<3){const add=document.createElement('button');add.type='button';add.className='add';add.textContent='+';add.title='Add another key';add.addEventListener('click',()=>startRec(id,KM[id].length,add));chips.appendChild(add)}
      const reset=document.createElement('button');reset.type='button';reset.className='kreset';reset.textContent='Reset';
      reset.hidden=JSON.stringify(KM[id])===JSON.stringify(a.keys);reset.addEventListener('click',()=>resetKey(id));
      row.append(lab,chips,reset);g.appendChild(row)}
    keyRows.appendChild(g)}}
function chip(id,i,b){
  const el=document.createElement('button'),k=document.createElement('kbd');el.type='button';el.className='chip';el.title='Change';
  k.textContent=Keymap.show(b,MAC);el.appendChild(k);
  if(KM[id].length>1){const x=document.createElement('span');x.className='x';x.textContent='×';x.title='Remove';
    x.addEventListener('click',ev=>{ev.stopPropagation();applyKeys({...KM,[id]:KM[id].filter((_,n)=>n!==i)},id)});el.appendChild(x)}
  el.addEventListener('click',()=>startRec(id,i,el));
  return el}

function startRec(id,i,el){
  stopRec(false);rec={id,i};el.classList.add('rec');
  const k=el.querySelector('kbd')||el;k.textContent=Keymap.BY_ID[id].arrows?'hold keys + an arrow':'press keys';
  say('');if(id==='summon')store.pauseSummon(true)}
function stopRec(redraw=true){if(!rec)return;if(rec.id==='summon')store.pauseSummon(false);rec=null;if(redraw)renderKeys()}
// while recording, every key goes to the recorder first
addEventListener('keydown',ev=>{
  if(!rec)return;ev.preventDefault();ev.stopImmediatePropagation();
  if(ev.key==='Escape'&&!ev.metaKey&&!ev.ctrlKey&&!ev.altKey&&!ev.shiftKey){stopRec();say('');return}
  const c=Keymap.combo(ev,MAC);if(!c)return;
  const{id,i}=rec,b=Keymap.BY_ID[id].arrows?c.family:c.exact;
  if(!b){say('Hold any modifiers you like, then press an arrow key.',true);return}
  const list=KM[id].slice();list[i]=b;const next={...KM,[id]:[...new Set(list)]};
  const err=Keymap.check(id,b,next);
  if(err){stopRec();say(err,true);return}
  rec=null;applyKeys(next,id)},true);

function resetKey(id){
  const next={...KM,[id]:Keymap.BY_ID[id].keys.slice()};
  for(const b of next[id]){const err=Keymap.check(id,b,next);if(err){say(`${Keymap.show(b,MAC)}: ${err}`,true);return}}
  applyKeys(next,id)}
async function applyKeys(next,id){
  KM=next;reindex();
  let r=null;try{r=await store.setSettings({keys:KM})}catch(_){}
  if(r){KM=Keymap.merge(r.keys);summonOk=!!r.summonOk;reindex()}
  if(r&&r.summonTaken)say('Another app already uses that shortcut. Pick another one.',true);else say(`Saved: ${Keymap.BY_ID[id]?Keymap.BY_ID[id].label:'all keys'}.`);
  renderKeys();renderHelp();updateHint()}
$('keysReset').addEventListener('click',()=>applyKeys(Keymap.defaults(),'all'));

optLib.addEventListener('change',async()=>{
  libOn=optLib.checked;try{await store.setSettings({library:libOn})}catch(_){}
  if(!libOn)lib.hidden=true;
  showTitle();renderKeys();renderHelp();updateHint();
  say(libOn?'Library is on.':'Library is off. Inkling opens this note every time.')});

function renderHelp(){
  const R=(k,t)=>`<li><span>${k}</span><span>${t}</span></li>`,G=(h,rows)=>`<div><h2>${h}</h2><ul>${rows.join('')}</ul></div>`;
  const writing=[R('Just type','Start a thought. Inkling finds free space.'),R(kd('list'),'Next line in a list. On an empty line, a new thought.'),
    R(kd('step'),'Next step, with an arrow. Arrows on the empty step point it.'),R(kd('stepBack'),'Back to the previous step'),
    R('<kbd>-&gt;</kbd> name','Connect to another jot'),R('<kbd>?</kbd> <kbd>!</kbd> <kbd>~</kbd> first','Question, key point, scratched out'),R(kd('done'),'Done writing. The jot stays selected.')];
  const selected=[R(kd('walk'),`Move between jots. ${kd('extend')} selects more.`),R(kd('move'),`Move it. ${kd('moveGroup')} brings its whole group.`),
    R(`${kd('edit')} or type`,'Edit it'),R(kd('markQ')+' '+kd('markImp')+' '+kd('markX'),'Mark or unmark every selected jot'),
    R(kd('delete'),`Delete. ${kd('unlink')} removes only its arrows.`),R(kd('deselect'),'Deselect')];
  const anywhere=[...(DESK?[R(kd('summon'),'Bring Inkling to the front from any app. Press again to go back.')]:[]),
    ...(libOn?[R(kd('library'),'Find a note by any word in it'),R(kd('newNote'),'New note')]:[]),
    R(kd('jump'),'Jump to a jot'),R(kd('zoomIn')+' '+kd('zoomOut'),'Zoom. Scroll, or hold <kbd>Space</kbd> and drag, to pan.'),
    R(kd('settings'),'Settings. Every key here can be changed.'),R('Click','Select. Click again to edit.'),R('Drag empty space','Select several. Circle them, or drag a box.'),
    R('Double-click','Write right there'),R('Click an arrow',`Then ${kd('delete')} to remove it`)];
  $('helpRef').innerHTML=G('Writing',writing)+G('Selected',selected)+G('Anywhere',anywhere);
  $('helpSub').innerHTML=`Write, then press ${kd('done')} to arrange. ${kd('help')} shows this again.`}
