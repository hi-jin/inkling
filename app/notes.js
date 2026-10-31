// Notes: each note is its own file. The library finds one by any word in it.
const lib=$('lib'),libIn=$('libIn'),libList=$('libList'),libFoot=$('libFoot'),titleEl=$('title');
let note={id:null,created:0,updated:0,saved:false,dirty:false},libNotes=[],libItems=[],libSel=0,libArm=null;
const newId=()=>'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const filled=()=>S.jots.filter(j=>!GONE.has(j.id)&&String(j.text).trim());
const delKey=()=>Keymap.show('Mod+Backspace',MAC);

function noteTitle(js){const f=js.filter(j=>String(j.text||'').trim()).sort((a,b)=>num(a.id)-num(b.id))[0];return f?String(f.text).trim().split('\n')[0].slice(0,80):'Untitled'}
function showTitle(){const t=noteTitle(live());titleEl.hidden=!libOn;titleEl.textContent=t;document.title=libOn?t:'Inkling'}
titleEl.addEventListener('click',()=>openLib());

// a note reaches disk only once it holds a jot; empty jots being written are left out
function noteJSON(){if(note.dirty){note.updated=Date.now();note.dirty=false}return JSON.stringify({id:note.id,created:note.created,updated:note.updated,S:{jots:filled(),links:S.links},cam})}
function writeNote(){clearTimeout(saveT);if(!note.id||(!note.saved&&!filled().length))return;note.saved=true;store.saveNote(note.id,noteJSON())}
function flushNote(){clearTimeout(saveT);if(!note.id||(!note.saved&&!filled().length))return;note.saved=true;store.flushNote(note.id,noteJSON())}
// leaving a note that was emptied removes it, so the library never fills with blanks
async function leaveEmpty(){if(libOn&&note.id&&note.saved&&!filled().length)await store.removeNote(note.id)}
function freshState(){hist=[];fut=[];sel.clear();anchor=null;selArrow=null;lastFocus=null;prevFocus=null;lastDir='R';closePop()}

async function openNote(id,focus){
  if(note.id===id){if(focus&&byId(focus)){setSel([focus]);ensureVisible(byId(focus))}bd.focus({preventScroll:true});return true}
  let d=null;try{d=await store.loadNote(id)}catch(_){}
  if(!d||!d.S||!Array.isArray(d.S.jots))return false;
  stopWriting();flushNote();await leaveEmpty();
  note={id:d.id,created:d.created||Date.now(),updated:d.updated||0,saved:true,dirty:false};
  S={jots:d.S.jots,links:Array.isArray(d.S.links)?d.S.links:[]};cam=d.cam||{x:-60,y:DESK?-80:-50,z:1};freshState();renderAll();
  store.setSettings({lastNote:id});showTitle();bd.focus({preventScroll:true});
  if(focus&&byId(focus)){setSel([focus]);ensureVisible(byId(focus))}
  return true}
async function newNote(text){
  stopWriting();
  if(note.id&&!filled().length&&!text){bd.focus({preventScroll:true});return}
  flushNote();await leaveEmpty();
  note={id:newId(),created:Date.now(),updated:Date.now(),saved:false,dirty:true};
  S={jots:[],links:[]};cam={x:-60,y:DESK?-80:-50,z:1};freshState();renderAll();
  store.setSettings({lastNote:note.id});showTitle();bd.focus({preventScroll:true});
  if(text){const j=addJot({text,x:60,y:40},false);setSel([j.id]);save()}}

async function openLib(){
  if(!libOn)return;closeOverlays();stopWriting();flushNote();
  let list=[];try{list=await store.listNotes()}catch(_){}
  // the open note may be newer than its file
  libNotes=list.filter(n=>n.id!==note.id);
  if(filled().length)libNotes.push({id:note.id,created:note.created,updated:note.updated||Date.now(),jots:filled().map(j=>({id:j.id,text:j.text,kind:j.kind}))});
  lib.hidden=false;libIn.value='';libSel=0;libArm=null;renderLib();libIn.focus()}
function closeLib(){lib.hidden=true;libArm=null;bd.focus({preventScroll:true})}

function ago(t){const s=(Date.now()-t)/1000;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';if(s<604800)return Math.floor(s/86400)+'d ago';return new Date(t).toLocaleDateString('en',{month:'short',day:'numeric'})}
function marked(el,text,terms){el.textContent='';if(!terms.length){el.textContent=text;return}
  const re=new RegExp(terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi');let i=0,m;
  while((m=re.exec(text))){if(m.index>i)el.append(text.slice(i,m.index));const b=document.createElement('mark');b.textContent=m[0];el.append(b);i=m.index+m[0].length}
  if(i<text.length)el.append(text.slice(i))}
function snippet(text,terms){const t=String(text).replace(/\s+/g,' '),lo=t.toLowerCase(),hits=terms.map(x=>lo.indexOf(x)).filter(p=>p>=0),at=hits.length?Math.min(...hits):0,s=Math.max(0,at-28);
  return(s?'…':'')+t.slice(s,s+96)+(t.length>s+96?'…':'')}
// every word must appear somewhere in the note; notes whose title holds them all come first
function renderLib(){
  const q=libIn.value.trim(),terms=q.toLowerCase().split(/\s+/).filter(Boolean),rows=[];
  for(const n of libNotes){const title=noteTitle(n.jots);
    if(terms.length){const hay=(title+'\n'+n.jots.map(j=>j.text).join('\n')).toLowerCase();if(!terms.every(t=>hay.includes(t)))continue}
    const inTitle=terms.length>0&&terms.every(t=>title.toLowerCase().includes(t));
    const hit=terms.length&&!inTitle?n.jots.find(j=>terms.some(t=>String(j.text).toLowerCase().includes(t))):null;
    rows.push({n,title,hit,score:inTitle?1:0})}
  rows.sort((a,b)=>b.score-a.score||b.n.updated-a.n.updated);
  libItems=q?[...rows,{fresh:true,text:q}]:[{fresh:true,text:''},...rows];
  libSel=clamp(libSel,0,libItems.length-1);
  libList.textContent='';
  libItems.forEach((it,i)=>{
    const el=document.createElement('div'),t=document.createElement('div'),m=document.createElement('div');
    el.className='li'+(i===libSel?' on':'')+(it.fresh?' fresh':'')+(it.n&&it.n.id===note.id?' cur':'')+(it.n&&libArm===it.n.id?' arm':'');
    t.className='lt';m.className='lm';
    if(it.fresh){t.textContent=it.text?`New note “${it.text}”`:'New note';m.innerHTML=kd('newNote')}
    else{marked(t,it.title,terms);m.textContent=libArm===it.n.id?'delete?':it.n.id===note.id?'open now':ago(it.n.updated)}
    el.append(t,m);
    if(it.hit){const s=document.createElement('div');s.className='ls';marked(s,snippet(it.hit.text,terms),terms);el.append(s)}
    el.addEventListener('pointerdown',ev=>{ev.preventDefault();libSel=i;pickLib()});
    libList.appendChild(el)});
  const on=libList.querySelector('.on');if(on)on.scrollIntoView({block:'nearest'});
  const count=`<span>${libNotes.length} note${libNotes.length===1?'':'s'}</span>`;
  libFoot.innerHTML=libArm?`<span>Press <kbd>${esc(delKey())}</kbd> again to delete it. It moves to the trash folder.</span>`
    :`<span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> open</span><span><kbd>${esc(delKey())}</kbd> delete</span><span><kbd>Esc</kbd> close</span>${count}`}
async function pickLib(){const it=libItems[libSel];if(!it)return;lib.hidden=true;libArm=null;
  if(it.fresh)await newNote(it.text);else await openNote(it.n.id,it.hit&&it.hit.id)}
async function removeLib(){
  const it=libItems[libSel];if(!it||it.fresh)return;
  if(libArm!==it.n.id){libArm=it.n.id;renderLib();return}
  libArm=null;const id=it.n.id;
  if(id===note.id){clearTimeout(saveT);note={id:null,created:0,updated:0,saved:false,dirty:false}}
  await store.removeNote(id);libNotes=libNotes.filter(n=>n.id!==id);
  if(!note.id){const next=libNotes.slice().sort((a,b)=>b.updated-a.updated)[0];if(!(next&&await openNote(next.id)))await newNote('')}
  lib.hidden=false;renderLib();libIn.focus()}

libIn.addEventListener('input',()=>{libSel=0;libArm=null;renderLib()});
libIn.addEventListener('keydown',ev=>{
  if(ev.isComposing)return;
  const n=libItems.length;
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();if(n){libSel=(libSel+(ev.key==='ArrowDown'?1:n-1))%n;libArm=null;renderLib()}}
  else if(ev.key==='Enter'){ev.preventDefault();pickLib()}
  else if(ev.key==='Escape'){ev.preventDefault();closeLib()}
  else if(ev.key==='Backspace'&&(MAC?ev.metaKey:ev.ctrlKey)){ev.preventDefault();removeLib()}
});
libIn.addEventListener('blur',()=>setTimeout(()=>{if(!lib.hidden&&document.activeElement!==libIn)lib.hidden=true},0));
