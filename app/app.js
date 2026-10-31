const $=id=>document.getElementById(id);
const bd=$('bd'),world=$('world'),mk=$('mk'),lz=$('lasso'),pop=$('pop'),pal=$('pal'),palIn=$('palIn'),palList=$('palList'),hint=$('hint'),help=$('help');
const GX=70,GY=50,LG=8,H0=33,PREFIX={'?':'q','!':'imp','~':'x'},DIRS={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D'};
const DESK=!!window.inkling;
const LS={get(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}},set(k,v){try{localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v))}catch(_){}}};
// opened as a plain page, Inkling keeps the same notes in this browser's storage instead of files
const store=window.inkling||{
  platform:/Mac/.test(navigator.platform)?'darwin':'other',
  async getSettings(){const s=LS.get('inkling:settings')||{};return{library:s.library!==false,lastNote:s.lastNote||null,keys:Keymap.merge(s.keys),summonOk:false}},
  async setSettings(p){const s={...(LS.get('inkling:settings')||{}),...p};if(p.keys)s.keys=Keymap.diff(Keymap.merge(p.keys));LS.set('inkling:settings',s);return this.getSettings()},
  pauseSummon(){},
  async listNotes(){return(LS.get('inkling:notes')||[]).map(id=>LS.get('inkling:note:'+id)).filter(d=>d&&d.S).map(d=>({id:d.id,created:d.created,updated:d.updated,jots:d.S.jots}))},
  async loadNote(id){return LS.get('inkling:note:'+id)},
  saveNote(id,t){LS.set('inkling:note:'+id,t);const ids=LS.get('inkling:notes')||[];if(!ids.includes(id))LS.set('inkling:notes',[...ids,id])},
  flushNote(id,t){this.saveNote(id,t)},
  async removeNote(id){LS.set('inkling:notes',(LS.get('inkling:notes')||[]).filter(x=>x!==id));try{localStorage.removeItem('inkling:note:'+id)}catch(_){}},
  onCommand(){}
};
const MAC=store.platform==='darwin';
if(DESK)document.documentElement.classList.add('desk');
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let S={jots:[],links:[]},nid=1,hist=[],fut=[],cur=null,lastFocus=null,prevFocus=null,lastDir='R',cam={x:-60,y:-40,z:1};
let sel=new Set(),anchor=null,selArrow=null,palResume=null,booted=false,saveT=0,libOn=true,summonOk=false;
let popState=null,palSel=0,palItems=[],drag=null,pan=null,lasso=null,nudgeT=0,editStart=null,spaceDown=false,lastDown={t:0,x:0,y:0};
const els=new Map(),SZ=new Map(),FRESH=new Set(),SHIFT=new Map(),GONE=new Set();

// keys: action -> bindings, and the reverse index the key handlers read
let KM=Keymap.defaults(),KIDX=new Map();
function reindex(){KIDX=new Map();for(const[id,bs]of Object.entries(KM))for(const b of bs){if(!KIDX.has(b))KIDX.set(b,[]);KIDX.get(b).push(id)}}
const CTX=id=>Keymap.BY_ID[id].ctx;
function keyActs(ev){const c=Keymap.combo(ev,MAC);if(!c)return{c:null,acts:[]};return{c,acts:[...(KIDX.get(c.exact)||[]),...(c.family?KIDX.get(c.family)||[]:[])]}}
const kd=id=>`<kbd>${esc(Keymap.show((KM[id]||[])[0]||'',MAC))}</kbd>`;
reindex();

function save(content=true){if(!booted||!note.id)return;if(content)note.dirty=true;clearTimeout(saveT);saveT=setTimeout(writeNote,250);if(content)showTitle()}
addEventListener('beforeunload',()=>{if(booted)flushNote()});
function pushHist(s){hist.push(s);if(hist.length>150)hist.shift();fut=[]}
function snap(){pushHist(JSON.stringify(S))}
const byId=id=>id?S.jots.find(j=>j.id===id&&!GONE.has(j.id)):null;
const live=()=>S.jots.filter(j=>!GONE.has(j.id));
const isJot=el=>!!(el&&el.classList&&el.classList.contains('jot'));
function rect(j){const s=SZ.get(j.id)||{w:120,h:H0},l=j.x-s.w*j.ax,t=j.y-s.h/2;return{l,t,r:l+s.w,b:t+s.h,w:s.w,h:s.h,cx:l+s.w/2,cy:j.y}}
function place(j){const e=els.get(j.id);if(!e)return;SZ.set(j.id,{w:e.offsetWidth,h:e.offsetHeight});const r=rect(j);e.style.left=r.l+'px';e.style.top=r.t+'px'}
const overlap=(a,b,p)=>a.l<b.r+p&&a.r>b.l-p&&a.t<b.b+p&&a.b>b.t-p;
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const num=id=>parseInt(String(id).replace(/\D/g,''))||1;
const toWorld=(cx,cy)=>{const b=bd.getBoundingClientRect();return{x:cam.x+(cx-b.left)/cam.z,y:cam.y+(cy-b.top)/cam.z}};

function ph(j){return j.via==='step'?'next step':j.via==='list'?'next item':'a thought'}
function setKind(j,kind){j.kind=kind;const e=els.get(j.id);if(e){e.classList.remove('q','imp','x');if(kind)e.classList.add(kind)}place(j)}
function setEditable(e,on){if(!on){e.removeAttribute('contenteditable');return}try{e.contentEditable='plaintext-only'}catch(_){}if(e.contentEditable!=='plaintext-only')e.contentEditable='true'}
function makeEl(j){
  const e=document.createElement('div');e.className='jot'+(j.kind?' '+j.kind:'');e.dataset.id=j.id;e.dataset.ph=ph(j);e.textContent=j.text;e.spellcheck=false;
  world.appendChild(e);els.set(j.id,e);
  e.addEventListener('focus',()=>{e.classList.add('editing');if(cur===j)return;if(lastFocus!==j.id)prevFocus=lastFocus;cur=j;lastFocus=j.id;sel=new Set([j.id]);anchor=j.id;selArrow=null;editStart={text:j.text,kind:j.kind,snap:JSON.stringify(S)};drawMarks();updateHint()});
  e.addEventListener('blur',()=>onBlur(j,e));
  e.addEventListener('input',()=>onInput(j,e));
  // Enter arrives here rather than as a keydown, so Korean and other input sources finish their syllable first
  e.addEventListener('beforeinput',ev=>{const t=ev.inputType;
    if(t==='insertParagraph'||t==='insertLineBreak'){if(popState){ev.preventDefault();confirmPop();return}if(KM.list.includes('Enter')||(t==='insertLineBreak'&&KM.list.includes('Shift+Enter'))){ev.preventDefault();doEnter(j,e)}}
    else if(t==='deleteContentBackward'&&!e.textContent){ev.preventDefault();doBackspace(j,e)}});
  e.addEventListener('keydown',ev=>onKey(ev,j,e));
  return e;
}
function renderAll(){for(const e of els.values())e.remove();els.clear();SZ.clear();FRESH.clear();SHIFT.clear();GONE.clear();cur=null;closePop();
  for(const j of S.jots)makeEl(j);for(const j of S.jots)place(j);
  sel=new Set([...sel].filter(id=>byId(id)));if(!sel.has(anchor))anchor=sel.size?[...sel].pop():null;selArrow=null;
  drawMarks();applyCam(false);updateHint();
  nid=1+Math.max(0,...S.jots.map(j=>num(j.id)));}

function caretOff(e){const s=getSelection();if(!s.rangeCount||!e.contains(s.anchorNode))return 0;const r=s.getRangeAt(0),p=document.createRange();p.selectNodeContents(e);p.setEnd(r.startContainer,r.startOffset);return p.toString().length}
function setCaret(e,off){const s=getSelection(),g=document.createRange(),n=e.firstChild;if(n&&n.nodeType===3){g.setStart(n,Math.min(off,n.length))}else g.setStart(e,0);g.collapse(true);s.removeAllRanges();s.addRange(g)}
function caretAt(e,x,y){let r=null;
  if(document.caretRangeFromPoint)r=document.caretRangeFromPoint(x,y);
  else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset)}}
  if(!r||!e.contains(r.startContainer))return false;r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return true}

// modes: writing = one jot holds the caret; selected = jots carry a marker swash and keys arrange them
function editJot(j,where,pt){const e=els.get(j.id);if(!e)return;
  if(cur&&cur!==j){const ce=els.get(cur.id);if(ce)ce.blur()}
  if(!byId(j.id))return;
  setEditable(e,true);e.classList.add('editing');e.focus({preventScroll:true});
  if(!(pt&&caretAt(e,pt.x,pt.y)))setCaret(e,where==='start'?0:e.textContent.length);
  ensureVisible(j)}
function exitEdit(){if(!cur)return;const j=cur,p=j.parent;bd.focus({preventScroll:true});setSel(byId(j.id)?[j.id]:byId(p)?[p]:[])}
function setSel(ids){sel=new Set(ids.filter(id=>byId(id)));anchor=sel.size?[...sel].pop():null;selArrow=null;if(anchor)lastFocus=anchor;drawMarks();updateHint()}
function commit(j){if(!j||!editStart||cur!==j)return;if(j.text!==editStart.text||j.kind!==editStart.kind)pushHist(editStart.snap);editStart={text:j.text,kind:j.kind,snap:JSON.stringify(S)};FRESH.delete(j.id)}

function onInput(j,e){
  if(e.textContent==='')e.innerHTML='';
  const m=e.textContent.match(/^([?!~]) /);
  if(m){const off=caretOff(e);e.textContent=e.textContent.slice(2);setKind(j,PREFIX[m[1]]);setCaret(e,Math.max(0,off-2))}
  j.text=e.textContent;place(j);drawMarks();updatePop(j);updateHint();save();
}
function onBlur(j,e){
  if(document.activeElement===e&&!GONE.has(j.id))return; // the window lost focus; keep writing when it comes back
  e.classList.remove('editing');setEditable(e,false);
  if(GONE.has(j.id))return;
  if(popState&&popState.j===j)closePop();
  if(!j.text.trim())removeEmpty(j);
  else if(editStart&&cur===j&&!FRESH.has(j.id)&&(j.text!==editStart.text||j.kind!==editStart.kind))pushHist(editStart.snap);
  FRESH.delete(j.id);if(cur===j)cur=null;editStart=null;drawMarks();updateHint();save();
}
function removeEmpty(j){
  if(GONE.has(j.id))return;GONE.add(j.id);
  const sh=SHIFT.get(j.id);if(sh)for(const id of sh.ids){const o=byId(id);if(o){o.y-=sh.dy;place(o)}}
  if(FRESH.has(j.id))hist.pop();else if(editStart&&cur===j)pushHist(editStart.snap);
  S.jots=S.jots.filter(x=>x!==j);S.links=S.links.filter(l=>l.from!==j.id&&l.to!==j.id);
  for(const o of S.jots)if(o.parent===j.id){o.parent=null;o.via=null}
  const e=els.get(j.id);els.delete(j.id);SZ.delete(j.id);FRESH.delete(j.id);SHIFT.delete(j.id);sel.delete(j.id);if(anchor===j.id)anchor=null;if(cur===j)cur=null;if(e)e.remove();
  drawMarks();save();
}
function addJot(spec,fresh){const j={id:'j'+nid++,text:'',kind:'',parent:null,via:null,dir:null,ax:0,...spec};S.jots.push(j);makeEl(j);place(j);if(fresh)FRESH.add(j.id);return j}

function cluster(j){const seen=new Set([j.id]),q=[j.id];while(q.length){const id=q.pop(),o=byId(id);const nb=[];if(o&&o.parent)nb.push(o.parent);for(const x of S.jots)if(x.parent===id)nb.push(x.id);for(const l of S.links){if(l.from===id)nb.push(l.to);if(l.to===id)nb.push(l.from)}for(const n of nb)if(!seen.has(n)&&byId(n)){seen.add(n);q.push(n)}}return[...seen].map(byId).filter(Boolean)}
function spotFrom(p,dir){const r=rect(p);if(dir==='R')return{x:r.r+GX,y:r.cy,ax:0};if(dir==='L')return{x:r.l-GX,y:r.cy,ax:1};if(dir==='D')return{x:r.cx,y:r.b+GY+H0/2,ax:.5};return{x:r.cx,y:r.t-GY-H0/2,ax:.5}}
// a list line slides down past whatever is in the way; a step steps aside, so its arrow never runs through another jot
function clearOf(j,dir,how){const pad=how==='list'?6:14;
  for(let k=0;k<40;k++){const r=rect(j),b=live().find(o=>o!==j&&overlap(r,rect(o),pad));if(!b)return;const q=rect(b);
    if(how==='list')j.y+=q.b+pad+1-r.t;
    else if(dir==='R'||dir==='L')j.y+=q.b+GY*.6-r.t;
    else j.x+=q.r+GX*.5-r.l}}
function freeSpot(near){
  const W=230,pad=40,rs=live().filter(o=>o.text).map(rect);
  const ok=(x,y)=>!rs.some(r=>x<r.r+pad&&x+W>r.l-pad&&y-H0/2<r.b+pad&&y+H0/2>r.t-pad);
  let bx,by;
  if(near&&byId(near.id)&&near.text){const c=cluster(near).map(rect);bx=Math.min(...c.map(r=>r.l));by=Math.max(...c.map(r=>r.b))+64}
  else{bx=cam.x+70/cam.z;by=cam.y+(DESK?110:60)/cam.z}
  for(let k=0;k<80;k++){const y=by+k*46;if(ok(bx,y))return{x:bx,y}}
  return{x:bx,y:by};
}

function newThought(near){const p=freeSpot(near);snap();lastDir='R';const j=addJot({x:p.x,y:p.y},true);editJot(j)}
function doEnter(j,e){
  closePop();
  if(!e.textContent.trim()){const near=byId(j.parent)||byId(prevFocus);removeEmpty(j);newThought(near);return}
  commit(j);snap();
  const r=rect(j),dy=H0+LG,cl=new Set(cluster(j).map(o=>o.id));
  const below=live().filter(o=>o!==j&&cl.has(o.id)&&rect(o).t>=r.b-2&&rect(o).l<r.r+20&&rect(o).r>r.l-20);
  for(const o of below){o.y+=dy;place(o)}
  const n=addJot({x:r.l,y:r.b+LG+H0/2,ax:0,parent:j.id,via:'list'},true);
  SHIFT.set(n.id,{ids:below.map(o=>o.id),dy});clearOf(n,'D','list');place(n);drawMarks();editJot(n);
}
function doTab(j){
  closePop();if(!j||!j.text.trim())return;
  commit(j);snap();
  const n=addJot({...spotFrom(j,lastDir),parent:j.id,via:'step',dir:lastDir},true);
  clearOf(n,lastDir,'step');place(n);drawMarks();editJot(n);
}
function redirect(j,dir){const p=byId(j.parent);if(!p)return;lastDir=dir;j.dir=dir;Object.assign(j,spotFrom(p,dir));place(j);clearOf(j,dir,'step');place(j);drawMarks();ensureVisible(j);updateHint()}
function doBackspace(j,e){const to=byId(j.parent)||byId(prevFocus)||nearest(j,'U');removeEmpty(j);if(to)editJot(to,'end');else{bd.focus({preventScroll:true});setSel([])}}
// nearest jot whose edge lies in that direction; a long line does not hide its neighbours
function nearest(j,dir){const c=rect(j),H=dir==='L'||dir==='R';let best=null,bs=1e12;
  for(const o of live()){if(o===j)continue;const r=rect(o);
    const ok=dir==='R'?r.l>c.l+8&&r.cx>c.cx:dir==='L'?r.r<c.r-8&&r.cx<c.cx:dir==='D'?r.t>c.t+4:r.b<c.b-4;if(!ok)continue;
    const gap=Math.max(0,dir==='R'?r.l-c.r:dir==='L'?c.l-r.r:dir==='D'?r.t-c.b:c.t-r.b);
    const off=H?Math.max(0,r.t-c.b,c.t-r.b):Math.max(0,r.l-c.r,c.l-r.r);
    const sc=gap+off*2.5+Math.hypot(r.cx-c.cx,r.cy-c.cy)*.05;if(sc<bs){bs=sc;best=o}}
  return best}

function moveSel(dir){const a=byId(anchor);if(!a)return;const n=nearest(a,dir);if(n){setSel([n.id]);ensureVisible(n)}}
function extendSel(dir){const a=byId(anchor);if(!a)return;const n=nearest(a,dir);if(!n)return;sel.add(n.id);anchor=n.id;lastFocus=n.id;drawMarks();ensureVisible(n);updateHint()}
// one press always moves about the same distance on screen, whatever the zoom
function nudgeSel(dir,group){
  const base=[...sel].map(byId).filter(Boolean);if(!base.length)return;
  if(Date.now()-nudgeT>800)snap();nudgeT=Date.now();
  const st=24*Math.pow(2,Math.round(Math.log2(1/cam.z))),dx=dir==='L'?-st:dir==='R'?st:0,dy=dir==='U'?-st:dir==='D'?st:0;
  const m=new Map();for(const j of base)for(const o of group?cluster(j):[j])m.set(o.id,o);
  for(const o of m.values()){o.x+=dx;o.y+=dy;place(o)}drawMarks();ensureVisible(byId(anchor)||base[0]);save();
}
// the ? badge sits inside the jot's left edge; growing it leftward keeps the words where they were
function keepKind(j,kind){const w0=rect(j).w;setKind(j,kind);j.x-=(rect(j).w-w0)*(1-j.ax);place(j)}
function toggleKind(kind){const js=[...sel].map(byId).filter(Boolean);if(!js.length)return;snap();const all=js.every(j=>j.kind===kind);for(const j of js)keepKind(j,all?'':kind);drawMarks();save();updateHint()}
function collapse(j){const listy=j.via==='list'||S.jots.some(o=>o.parent===j.id&&o.via==='list');if(!listy)return;
  const r=rect(j),cl=new Set(cluster(j).map(o=>o.id)),dy=r.h+LG;
  for(const o of live()){if(o===j||!cl.has(o.id))continue;const q=rect(o);if(q.t>=r.b-2&&q.l<r.r+20&&q.r>r.l-20){o.y-=dy;place(o)}}}
function deleteSel(){
  const ids=[...sel].filter(id=>byId(id));if(!ids.length)return;snap();
  const del=new Set(ids),up=id=>{let p=id;while(p&&del.has(p)){const o=S.jots.find(x=>x.id===p);p=o?o.parent:null}return p};
  const after=up(ids[ids.length-1]);
  if(ids.length===1)collapse(byId(ids[0]));
  for(const o of S.jots){if(del.has(o.id)||!o.parent||!del.has(o.parent))continue;const p=up(o.parent);if(p)o.parent=p;else{o.parent=null;o.via=null;o.dir=null}}
  S.jots=S.jots.filter(o=>!del.has(o.id));S.links=S.links.filter(l=>!del.has(l.from)&&!del.has(l.to));
  for(const id of ids){const e=els.get(id);if(e)e.remove();els.delete(id);SZ.delete(id)}
  if(lastFocus&&del.has(lastFocus))lastFocus=after;
  setSel(after?[after]:[]);save();
}
function arrowsFor(ids){const set=new Set(ids),both=set.size>1,out=[],hit=(a,b)=>both?a&&b:a||b;
  for(const j of live())if(j.via==='step'&&byId(j.parent)&&hit(set.has(j.parent),set.has(j.id)))out.push('s:'+j.id);
  for(const l of S.links)if(byId(l.from)&&byId(l.to)&&hit(set.has(l.from),set.has(l.to)))out.push('l:'+l.from+'>'+l.to);
  return out}
function removeArrows(keys){if(!keys.length)return;snap();
  for(const k of keys){if(k[0]==='s'){const j=byId(k.slice(2));if(j){j.parent=null;j.via=null;j.dir=null}}
    else{const[f,t]=k.slice(2).split('>');S.links=S.links.filter(l=>!(l.from===f&&l.to===t))}}
  selArrow=null;drawMarks();updateHint();save()}

function onKey(ev,j,e){
  const k=ev.key,ime=ev.isComposing||ev.keyCode===229;
  if(popState){
    if(k==='ArrowDown'||k==='ArrowUp'){ev.preventDefault();const n=popState.items.length;if(n){popState.idx=(popState.idx+(k==='ArrowDown'?1:n-1))%n;renderPop()}return}
    if(k==='Tab'){ev.preventDefault();confirmPop();return}
    if(k==='Escape'){ev.preventDefault();closePop();updateHint();return}
  }
  const{c,acts}=keyActs(ev),A=a=>acts.includes(a);
  if(A('step')){ev.preventDefault();if(!ime)doTab(j);return}
  if(A('stepBack')){ev.preventDefault();if(!ime){const p=byId(j.parent);if(p){commit(j);editJot(p,'end')}}return}
  if(ime)return;
  if(A('done')){ev.preventDefault();exitEdit();return}
  if(A('list')&&c.exact!=='Enter'&&c.exact!=='Shift+Enter'){ev.preventDefault();doEnter(j,e);return}
  // while writing, arrows only move the caret; an empty step is the one place they point the arrow instead
  if(DIRS[k]&&!ev.altKey&&!ev.metaKey&&!ev.ctrlKey&&!ev.shiftKey&&!e.textContent&&j.via==='step'){ev.preventDefault();redirect(j,DIRS[k]);return}
  if(k==='Backspace'&&j.kind&&caretOff(e)===0&&getSelection().isCollapsed&&e.textContent){ev.preventDefault();commit(j);keepKind(j,'');drawMarks();updateHint();save();return}
}

function updatePop(j){
  const m=j.text.match(/->\s*([^]*)$/);if(!m){closePop();return}
  const q=m[1].trim().toLowerCase();
  const items=live().filter(o=>o!==j&&o.text&&(!q||o.text.toLowerCase().includes(q))).sort((a,b)=>(q?a.text.toLowerCase().indexOf(q)-b.text.toLowerCase().indexOf(q):0)).slice(0,6);
  popState={j,idx:Math.min(popState&&popState.j===j?popState.idx:0,Math.max(0,items.length-1)),items,at:m.index};renderPop();updateHint();
}
function renderPop(){
  const{items,idx}=popState;pop.hidden=false;
  pop.innerHTML='<div class="hd">Connect to</div>'+(items.length?items.map((o,i)=>`<div class="it${i===idx?' on':''}" data-i="${i}"></div>`).join(''):'<div class="hd">No jot matches</div>');
  pop.querySelectorAll('.it').forEach(el=>{el.textContent=items[+el.dataset.i].text;el.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();popState.idx=+el.dataset.i;confirmPop()})});
  positionPop();
}
function positionPop(){if(!popState)return;const r=rect(popState.j),x=(r.l-cam.x)*cam.z,y=(r.b-cam.y)*cam.z+6;pop.style.left=clamp(x,8,bd.clientWidth-240)+'px';pop.style.top=clamp(y,8,bd.clientHeight-200)+'px'}
function closePop(){popState=null;pop.hidden=true}
function confirmPop(){
  if(!popState)return;const{j,items,idx,at}=popState,t=items[idx];closePop();if(!t)return;
  const e=els.get(j.id),before=j.text.slice(0,at).replace(/\s+$/,'');
  const from=before?j:(byId(j.parent)||byId(prevFocus));
  if(!from||from===t)return;
  if(before){commit(j);snap();j.text=before;e.textContent=before;place(j)}
  else{snap();removeEmpty(j)}
  if(!S.links.some(l=>l.from===from.id&&l.to===t.id))S.links.push({from:from.id,to:t.id});
  drawMarks();editJot(from,'end');save();
}

function openPal(){closeOverlays();palResume=cur?cur.id:null;pal.hidden=false;palIn.value='';palSel=0;renderPal();palIn.focus()}
function closePal(back){pal.hidden=true;const j=byId(palResume);palResume=null;if(back&&j)editJot(j,'end');else bd.focus({preventScroll:true})}
function renderPal(){
  const q=palIn.value.trim().toLowerCase();
  palItems=live().filter(o=>o.text&&(!q||o.text.toLowerCase().includes(q))).reverse().slice(0,8);
  palSel=Math.min(palSel,Math.max(0,palItems.length-1));
  palList.innerHTML=palItems.length?palItems.map((o,i)=>`<div class="it${i===palSel?' on':''}" data-i="${i}"></div>`).join(''):'<div class="empty">No jot matches</div>';
  palList.querySelectorAll('.it').forEach(el=>{el.textContent=palItems[+el.dataset.i].text;el.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();palSel=+el.dataset.i;pickPal()})});
}
function pickPal(){const j=palItems[palSel];pal.hidden=true;palResume=null;bd.focus({preventScroll:true});if(j){setSel([j.id]);ensureVisible(j)}}
palIn.addEventListener('input',()=>{palSel=0;renderPal()});
palIn.addEventListener('keydown',ev=>{
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();const n=palItems.length;if(n){palSel=(palSel+(ev.key==='ArrowDown'?1:n-1))%n;renderPal()}}
  else if(ev.key==='Enter'){ev.preventDefault();pickPal()}
  else if(ev.key==='Escape'){ev.preventDefault();closePal(true)}
});
palIn.addEventListener('blur',()=>{setTimeout(()=>{if(document.activeElement!==palIn)pal.hidden=true},0)});

function openHelp(){closeOverlays();if(cur)exitEdit();renderHelp();help.hidden=false;bd.focus({preventScroll:true})}
function closeHelp(){help.hidden=true}
help.addEventListener('pointerdown',ev=>{if(ev.target===help)closeHelp()});
function closeOverlays(){closeHelp();pal.hidden=true;lib.hidden=true;if(!setEl.hidden)closeSettings()}

function edge(r,to,gap){const dx=to.x-r.cx,dy=to.y-r.cy;const t=Math.min(dx?(r.w/2+gap)/Math.abs(dx):1e9,dy?(r.h/2+gap)/Math.abs(dy):1e9);return{x:r.cx+dx*t,y:r.cy+dy*t}}
const f2=p=>p.x.toFixed(1)+' '+p.y.toFixed(1);
function arrowD(ra,rb,r,bendK){const s=edge(ra,{x:rb.cx,y:rb.cy},5),e=edge(rb,{x:ra.cx,y:ra.cy},6),dx=e.x-s.x,dy=e.y-s.y,L=Math.hypot(dx,dy)||1,b=(r()-.5)*bendK*L,c={x:(s.x+e.x)/2-dy/L*b,y:(s.y+e.y)/2+dx/L*b},g=Math.atan2(e.y-c.y,e.x-c.x),hl=10,sp=.45;
  return 'M'+f2(s)+' Q'+f2(c)+' '+f2(e)+' M'+f2({x:e.x-hl*Math.cos(g-sp),y:e.y-hl*Math.sin(g-sp)})+' L'+f2(e)+' L'+f2({x:e.x-hl*Math.cos(g+sp),y:e.y-hl*Math.sin(g+sp)})}
function wobD(x1,y1,x2,y2,r,a){return 'M'+x1.toFixed(1)+' '+y1.toFixed(1)+' Q'+f2({x:(x1+x2)/2,y:(y1+y2)/2+(r()-.5)*a})+' '+x2.toFixed(1)+' '+y2.toFixed(1)}
// a highlighter pass: chisel-cut ends, edges that bow a little
function swashD(r,s){const R=rng(s),w=a=>(R()-.5)*a,l=r.l-3,rr=r.r+3,t=r.t+4,b=r.b-3,k=6,mx=(l+rr)/2;
  return 'M'+f2({x:l+k+w(2),y:t+w(2)})+' Q'+f2({x:mx,y:t-2+w(3)})+' '+f2({x:rr+w(2),y:t+1+w(2)})+' L'+f2({x:rr-k+w(2),y:b+w(2)})+' Q'+f2({x:mx,y:b+2+w(3)})+' '+f2({x:l+w(2),y:b-1+w(2)})+'Z'}
function drawMarks(){
  const js=live();let x0=-200,y0=-200,x1=200,y1=200,sw='',ink='',arr='';
  const multi=sel.size>1;
  const arrow=(key,d)=>{const on=selArrow===key;if(on)sw+=`<path class="aw" d="${d}"/>`;arr+=`<path class="hit" data-a="${key}" d="${d}"/><path class="ink${on?' on':''}" d="${d}"/>`};
  for(const j of js){const r=rect(j);x0=Math.min(x0,r.l-200);y0=Math.min(y0,r.t-200);x1=Math.max(x1,r.r+200);y1=Math.max(y1,r.b+200);
    if(sel.has(j.id)&&cur!==j)sw+=`<path class="sw${multi&&j.id===anchor?' on':''}" d="${swashD(r,num(j.id)*17)}"/>`;
    if(cur===j)ink+=`<path class="guide" d="M${(r.l+6).toFixed(1)} ${(r.b+1).toFixed(1)} L${Math.max(r.l+30,r.r-6).toFixed(1)} ${(r.b+1).toFixed(1)}"/>`;
    if(j.via==='step'){const p=byId(j.parent);if(p)arrow('s:'+j.id,arrowD(rect(p),r,rng(num(j.id)*13),.08))}
    if(j.kind==='imp'&&j.text)ink+=`<path class="ink" d="${wobD(r.l+5,r.b-4,r.r-5,r.b-5,rng(num(j.id)*7),4)}"/>`;
    if(j.kind==='x'&&j.text)ink+=`<path class="ink" d="${wobD(r.l+4,r.cy+1,r.r-4,r.cy,rng(num(j.id)*5),5)}"/>`}
  for(const l of S.links){const a=byId(l.from),b=byId(l.to);if(a&&b)arrow('l:'+a.id+'>'+b.id,arrowD(rect(a),rect(b),rng(num(a.id)*31+num(b.id)),.3))}
  mk.style.left=x0+'px';mk.style.top=y0+'px';mk.style.width=(x1-x0)+'px';mk.style.height=(y1-y0)+'px';
  mk.innerHTML=`<g transform="translate(${-x0} ${-y0})">${sw}${ink}${arr}</g>`;positionPop();
}

function applyCam(anim){world.style.transition=anim?'transform .28s cubic-bezier(.2,.7,.2,1)':'none';world.style.transform=`scale(${cam.z}) translate(${-cam.x}px,${-cam.y}px)`;
  const g=22*cam.z;bd.style.backgroundSize=`${g}px ${g}px`;bd.style.backgroundPosition=`${-cam.x*cam.z}px ${-cam.y*cam.z}px`;save(false)}
function ensureVisible(j){if(!j)return;const r=rect(j),W=bd.clientWidth,H=bd.clientHeight,z=cam.z,m=60,mt=DESK?76:60,mb=96;let nx=cam.x,ny=cam.y;
  if((r.l-cam.x)*z<m)nx=r.l-m/z;else if((r.r-cam.x)*z>W-m)nx=r.r-(W-m)/z;
  if((r.t-cam.y)*z<mt)ny=r.t-mt/z;else if((r.b-cam.y)*z>H-mb)ny=r.b-(H-mb)/z;
  if(nx!==cam.x||ny!==cam.y){cam.x=nx;cam.y=ny;applyCam(true);setTimeout(positionPop,300)}}
function zoomBy(f){const W=bd.clientWidth/2,H=bd.clientHeight/2,wx=cam.x+W/cam.z,wy=cam.y+H/cam.z;cam.z=clamp(f==='reset'?1:cam.z*f,.3,2.2);cam.x=wx-W/cam.z;cam.y=wy-H/cam.z;applyCam(true)}

function updateHint(){
  const K=(k,t)=>`<span>${k} ${t}</span>`,M=t=>`<span class="mode">${t}</span>`,n=sel.size,ar=n?arrowsFor([...sel]).length:0,arTxt=a=>`${a} arrow${a>1?'s':''}`;let h;
  if(popState)h=M('Connecting')+K('<kbd>↑</kbd><kbd>↓</kbd>','choose')+K('<kbd>Enter</kbd>','connect')+K('<kbd>Esc</kbd>','cancel');
  else if(cur&&!cur.text&&cur.via==='step')h=M('Writing')+K('<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd>','point this step')+K('type','to keep it here')+K(kd('done'),'cancel');
  else if(cur&&!cur.text)h=M('Writing')+K(kd('list'),'again for a new thought')+K(kd('done'),'cancel');
  else if(cur)h=M('Writing')+K(kd('list'),'list')+K(kd('step'),'next step')+K('<kbd>-&gt;</kbd>','connect')+K('<kbd>?</kbd><kbd>!</kbd><kbd>~</kbd>','at the start')+K(kd('done'),'done');
  else if(selArrow)h=M('Arrow')+K(kd('delete'),'remove it')+K(kd('deselect'),'deselect');
  else if(n>1)h=M(n+' selected')+K(kd('move'),'move together')+K(kd('markQ')+kd('markImp')+kd('markX'),'mark all')+K(kd('delete'),'delete')+(ar?K(kd('unlink'),'remove '+arTxt(ar)+' between'):'')+K(kd('deselect'),'deselect');
  else if(n===1)h=M('Selected')+K(kd('edit'),'edit')+K(kd('step'),'next step')+K(kd('extend'),'select more')+K(kd('move'),'move')+K(kd('delete'),'delete')+(ar?K(kd('unlink'),'remove '+arTxt(ar)):'');
  else h=K('Just type','to start a thought')+K(kd('walk'),'pick a jot')+(libOn?K(kd('library'),'notes'):'')+K(kd('jump'),'jump')+K(kd('help'),'all keys');
  hint.innerHTML=h;
}

// commands come from keys and from the desktop menu
function run(cmd){
  const ae=document.activeElement,field=ae&&ae.tagName==='INPUT';
  if(field&&(cmd==='undo'||cmd==='redo')){document.execCommand(cmd);return}
  if(field&&cmd==='selectAll'){ae.select();return}
  if(cmd==='undo'){if(cur)document.execCommand('undo');else undo()}
  else if(cmd==='redo'){if(cur)document.execCommand('redo');else redo()}
  else if(cmd==='selectAll'){if(cur){const r=document.createRange();r.selectNodeContents(els.get(cur.id));const s=getSelection();s.removeAllRanges();s.addRange(r)}else setSel(live().map(j=>j.id))}
  else if(cmd==='zoomIn')zoomBy(1.2);
  else if(cmd==='zoomOut')zoomBy(1/1.2);
  else if(cmd==='zoomReset')zoomBy('reset');
  else if(cmd==='jump')openPal();
  else if(cmd==='help'){if(help.hidden)openHelp();else closeHelp()}
  else if(cmd==='settings'){if(setEl.hidden)openSettings();else closeSettings()}
  else if(cmd==='library'){if(!libOn)return;if(lib.hidden)openLib();else closeLib()}
  else if(cmd==='newNote'){if(!libOn)return;closeOverlays();newNote('')}
  else if(cmd==='example')loadExample();
  else if(cmd==='clear'){closeOverlays();stopWriting();snap();S={jots:[],links:[]};sel.clear();renderAll();lastFocus=null;save();bd.focus({preventScroll:true})}
  else if(cmd==='summon'){closeOverlays();if(!cur){setSel([]);bd.focus({preventScroll:true})}}
}
store.onCommand(run);

document.addEventListener('keydown',ev=>{
  if(ev.isComposing)return;
  const t=ev.target,k=ev.key,{c,acts}=keyActs(ev),A=a=>acts.includes(a);
  const g=acts.find(a=>CTX(a)==='global'&&(libOn||!Keymap.BY_ID[a].lib));
  if(g){ev.preventDefault();run(g);return}
  if(!help.hidden){if(k==='Escape'||k==='Enter'){ev.preventDefault();closeHelp()}return}
  if(!setEl.hidden){if(k==='Escape'){ev.preventDefault();closeSettings()}return}
  if(!lib.hidden||isJot(t)||t===palIn)return;
  if(t.tagName==='BUTTON'&&(k==='Enter'||k===' '))return;
  if(k===' '){ev.preventDefault();spaceDown=true;bd.classList.add('space');return}
  const has=sel.size>0&&!!byId(anchor);
  if(selArrow&&A('delete')){ev.preventDefault();removeArrows([selArrow]);return}
  if(has&&A('unlink')){ev.preventDefault();removeArrows(arrowsFor([...sel]));return}
  if(has&&A('delete')){ev.preventDefault();deleteSel();return}
  if(A('deselect')){if(has||selArrow){ev.preventDefault();setSel([])}return}
  if(c&&c.dir){const f=['walk','extend','move','moveGroup'].find(A);if(!f)return;ev.preventDefault();
    if(!has){const j=byId(lastFocus)||live().pop();if(j){setSel([j.id]);ensureVisible(j)}return}
    if(f==='walk')moveSel(c.dir);else if(f==='extend')extendSel(c.dir);else nudgeSel(c.dir,f==='moveGroup');return}
  if(has&&A('step')){ev.preventDefault();doTab(byId(anchor));return}
  if(has&&A('stepBack')){ev.preventDefault();const p=byId(byId(anchor).parent);if(p)setSel([p.id]);return}
  if(A('edit')){ev.preventDefault();if(has)editJot(byId(anchor),'end');else newThought(byId(lastFocus));return}
  const mark=A('markQ')?'q':A('markImp')?'imp':A('markX')?'x':null;
  if(has&&mark){ev.preventDefault();toggleKind(mark);return}
  if(ev.metaKey||ev.ctrlKey||ev.altKey)return;
  if(k.length===1||k==='Process'||ev.keyCode===229){if(has)editJot(byId(anchor),'end');else newThought(byId(lastFocus))}
});
document.addEventListener('keyup',ev=>{if(ev.key===' '){spaceDown=false;bd.classList.remove('space')}});
addEventListener('blur',()=>{spaceDown=false;bd.classList.remove('space')});

const inPoly=(x,y,P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)c=!c}return c};
// a loose circle selects what it encloses; a straight drag selects what its box touches
function lassoUpdate(L){
  const b=bd.getBoundingClientRect(),P=L.pts.map(p=>({x:p.x-b.left,y:p.y-b.top}));
  const xs=P.map(p=>p.x),ys=P.map(p=>p.y),bx0=Math.min(...xs),bx1=Math.max(...xs),by0=Math.min(...ys),by1=Math.max(...ys);
  let A=0;for(let i=0,j=P.length-1;i<P.length;j=i++)A+=(P[j].x+P[i].x)*(P[j].y-P[i].y);A=Math.abs(A/2);
  const box=Math.max(1,(bx1-bx0)*(by1-by0)),boxMode=A<box*.3;
  const W=p=>({x:cam.x+p.x/cam.z,y:cam.y+p.y/cam.z}),PW=P.map(W),w0=W({x:bx0,y:by0}),w1=W({x:bx1,y:by1});
  sel=new Set(L.base);
  for(const j of live()){const r=rect(j);if(boxMode?r.l<w1.x&&r.r>w0.x&&r.t<w1.y&&r.b>w0.y:inPoly(r.cx,r.cy,PW))sel.add(j.id)}
  anchor=sel.size?[...sel].pop():null;selArrow=null;if(anchor)lastFocus=anchor;
  lz.innerHTML=boxMode?`<rect class="lz" x="${bx0}" y="${by0}" width="${bx1-bx0}" height="${by1-by0}" rx="10"/>`:`<path class="lz" d="M${P.map(f2).join(' L')} Z"/>`;
  drawMarks();updateHint();
}
bd.addEventListener('pointerdown',ev=>{
  if(ev.target.closest('#pop,#pal'))return;
  const je=ev.target.closest('.jot');
  if(je&&je.isContentEditable)return; // the jot being written keeps native caret and text selection
  if(ev.button===1||(ev.button===0&&spaceDown)){ev.preventDefault();pan={x0:ev.clientX,y0:ev.clientY,cx:cam.x,cy:cam.y};bd.classList.add('panning');try{bd.setPointerCapture(ev.pointerId)}catch(_){}return}
  if(ev.button!==0)return;
  ev.preventDefault();
  const now=Date.now(),dbl=!je&&now-lastDown.t<380&&Math.hypot(ev.clientX-lastDown.x,ev.clientY-lastDown.y)<8;lastDown={t:je?0:now,x:ev.clientX,y:ev.clientY};
  bd.focus({preventScroll:true});
  const hit=ev.target.closest('.hit');
  if(hit){sel=new Set();anchor=null;selArrow=hit.dataset.a;drawMarks();updateHint();return}
  if(je){const j=byId(je.dataset.id);if(!j)return;
    if(ev.shiftKey||ev.metaKey||ev.ctrlKey){if(sel.has(j.id)){sel.delete(j.id);if(anchor===j.id)anchor=sel.size?[...sel].pop():null}else{sel.add(j.id);anchor=j.id;lastFocus=j.id}selArrow=null;drawMarks();updateHint();return}
    const was=sel.size===1&&sel.has(j.id),multi=sel.size>1&&sel.has(j.id);
    if(!sel.has(j.id))setSel([j.id]);
    drag={j,x0:ev.clientX,y0:ev.clientY,moving:false,was,multi,alt:ev.altKey};try{bd.setPointerCapture(ev.pointerId)}catch(_){}return}
  if(dbl){snap();lastDir='R';const p=toWorld(ev.clientX,ev.clientY);const j=addJot({x:p.x-6,y:p.y},true);editJot(j);return}
  lasso={pts:[{x:ev.clientX,y:ev.clientY}],base:ev.shiftKey?new Set(sel):new Set(),moved:false};try{bd.setPointerCapture(ev.pointerId)}catch(_){}
});
bd.addEventListener('pointermove',ev=>{
  if(drag){const dx=ev.clientX-drag.x0,dy=ev.clientY-drag.y0;
    if(!drag.moving&&Math.hypot(dx,dy)>5){drag.moving=true;snap();const m=new Map();for(const id of sel){const j=byId(id);if(j)for(const o of drag.alt?cluster(j):[j])m.set(o.id,o)}drag.group=[...m.values()];drag.starts=drag.group.map(o=>({x:o.x,y:o.y}));for(const o of drag.group)els.get(o.id).classList.add('drag')}
    if(drag.moving){drag.group.forEach((o,i)=>{o.x=drag.starts[i].x+dx/cam.z;o.y=drag.starts[i].y+dy/cam.z;place(o)});drawMarks()}return}
  if(pan){cam.x=pan.cx-(ev.clientX-pan.x0)/cam.z;cam.y=pan.cy-(ev.clientY-pan.y0)/cam.z;applyCam(false);positionPop();return}
  if(lasso){const p=lasso.pts[lasso.pts.length-1];if(Math.hypot(ev.clientX-p.x,ev.clientY-p.y)<3)return;lasso.pts.push({x:ev.clientX,y:ev.clientY});
    if(!lasso.moved&&Math.hypot(ev.clientX-lasso.pts[0].x,ev.clientY-lasso.pts[0].y)>6)lasso.moved=true;if(lasso.moved)lassoUpdate(lasso)}
});
function endPointer(ev,cancel){
  if(drag){const d=drag;drag=null;
    if(d.moving){for(const o of d.group){const e=els.get(o.id);if(e)e.classList.remove('drag');o.x=Math.round(o.x/4)*4;o.y=Math.round(o.y/4)*4;place(o)}drawMarks();save()}
    else if(!cancel&&d.was)editJot(d.j,'end',{x:ev.clientX,y:ev.clientY});
    else if(!cancel&&d.multi)setSel([d.j.id]);
    return}
  if(pan){pan=null;bd.classList.remove('panning');return}
  if(lasso){const L=lasso;lasso=null;lz.innerHTML='';if(!L.moved&&!cancel)setSel([...L.base]);else updateHint()}
}
bd.addEventListener('pointerup',ev=>endPointer(ev,false));
bd.addEventListener('pointercancel',ev=>endPointer(ev,true));
bd.addEventListener('wheel',ev=>{ev.preventDefault();
  if(ev.ctrlKey){const b=bd.getBoundingClientRect(),px=ev.clientX-b.left,py=ev.clientY-b.top,wx=cam.x+px/cam.z,wy=cam.y+py/cam.z;cam.z=clamp(cam.z*Math.exp(-ev.deltaY*.01),.3,2.2);cam.x=wx-px/cam.z;cam.y=wy-py/cam.z}
  else{cam.x+=ev.deltaX/cam.z;cam.y+=ev.deltaY/cam.z}
  applyCam(false);positionPop()},{passive:false});

function stopWriting(){if(cur){const e=els.get(cur.id);if(e)e.blur()}}
function undo(){stopWriting();if(!hist.length)return;fut.push(JSON.stringify(S));S=JSON.parse(hist.pop());renderAll();save()}
function redo(){stopWriting();if(!fut.length)return;hist.push(JSON.stringify(S));S=JSON.parse(fut.pop());renderAll();save()}

function seed(){
  S={jots:[],links:[]};sel.clear();renderAll();nid=1;
  const add=(spec)=>addJot(spec,false);
  const list=(p,text,kind='')=>{const r=rect(p);return add({text,kind,x:r.l,y:r.b+LG+H0/2,ax:0,parent:p.id,via:'list'})};
  const step=(p,dir,text,kind='')=>{const j=add({text,kind,...spotFrom(p,dir),parent:p.id,via:'step',dir});clearOf(j,dir,'step');place(j);return j};
  const q=add({text:'Where does word order come from?',kind:'q',x:60,y:40});
  const a=list(q,'sine waves');const b=list(a,'learned embeddings');step(b,'R','capped at max length?','x');
  const t1=add({text:'tokens',x:60,y:250});const t2=step(t1,'R','embed');const t3=step(t2,'R','add position','imp');
  const t4=step(t3,'D','attention ×6');step(t4,'L','output');
  S.links.push({from:t3.id,to:b.id});
  cam={x:-60,y:DESK?-80:-50,z:1};lastFocus=null;lastDir='R';drawMarks();applyCam(false);updateHint();
}
async function loadExample(){closeOverlays();stopWriting();if(libOn&&filled().length)await newNote('');snap();seed();save();bd.focus({preventScroll:true})}

async function boot(){
  let st=null,list=[];
  try{st=await store.getSettings()}catch(_){}
  if(st){KM=Keymap.merge(st.keys);libOn=st.library!==false;summonOk=!!st.summonOk}
  reindex();
  try{list=await store.listNotes()}catch(_){}
  booted=true;
  const recent=list.slice().sort((a,b)=>b.updated-a.updated)[0];
  const pick=st&&st.lastNote&&list.some(n=>n.id===st.lastNote)?st.lastNote:recent&&recent.id;
  if(!(pick&&await openNote(pick))){
    note={id:newId(),created:Date.now(),updated:Date.now(),saved:false,dirty:true};
    seed();hist=[];fut=[];save();store.setSettings({lastNote:note.id});openHelp();
  }
  showTitle();updateHint();if(help.hidden)bd.focus({preventScroll:true});
  window.__ready=true;
}
// sizes are measured from the rendered text, so the handwriting font has to be in before the first jot appears
const fontsIn=document.fonts?Promise.all(['400 22px Kalam','700 22px Kalam','400 13px "IBM Plex Sans"'].map(f=>document.fonts.load(f).catch(()=>{}))):Promise.resolve();
document.addEventListener('DOMContentLoaded',()=>fontsIn.then(boot));
if(document.fonts)document.fonts.addEventListener('loadingdone',()=>{if(!booted)return;for(const j of S.jots)place(j);drawMarks()});
addEventListener('resize',()=>{drawMarks()});
