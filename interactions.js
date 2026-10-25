// As seleções alteram apenas a visualização; não excluem nem regravam registros.
let recordsScope={mode:'all',filters:null,type:null,recordId:null,from:null,to:null,title:'',person:null,returnTab:'dash'};
const recordsModeLabels={all:'Todos os cultos',dated:'Cultos com data',undated:'Cultos sem data',people:'Cultos com presença informada',visitors:'Cultos com visitantes',money:'Cultos com entrada informada'};
function getDashboardFilters(){
  return Object.fromEntries(['fDe','fAte','fTipo','fPregador','fMeio'].map(id=>[id,document.getElementById(id).value]));
}
function filterForDashboard(rows,f){
  if(!f)return [...rows];
  return rows.filter(r=>(!f.fDe||(r.data&&r.data>=f.fDe))&&(!f.fAte||(r.data&&r.data<=f.fAte))&&(!f.fTipo||r.tipo===f.fTipo)&&(!f.fPregador||r.pregador===f.fPregador)&&(!f.fMeio||r.meio===f.fMeio));
}
function recordsModeMatches(r,mode){
  if(mode==='dated')return !!r.data;
  if(mode==='undated')return !r.data;
  if(mode==='people')return Number.isFinite(r.pessoas);
  if(mode==='visitors')return Number.isFinite(r.visitantes)&&r.visitantes>0;
  if(mode==='money')return Number.isFinite(r.valor);
  return true;
}
function scopedRecords(){
  const s=recordsScope;
  return filterForDashboard(data,s.filters).filter(r=>recordsModeMatches(r,s.mode)&&(!s.person||(s.person.missing?!hasParticipant(r[s.person.field]):participantKey(r[s.person.field])===s.person.key))&&(!s.type||r.tipo===s.type)&&(!s.recordId||r.id===s.recordId)&&(!s.from||(r.data&&r.data>=s.from))&&(!s.to||(r.data&&r.data<=s.to)));
}
function searchRecordText(text){return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function selectedRecords(){
  const terms=searchRecordText(document.getElementById('busca')?.value||'').trim().split(/\s+/).filter(Boolean);
  return scopedRecords().filter(r=>{
    const text=searchRecordText(JSON.stringify(r)+' '+fmtDate(r.data)+' '+fmtBRL(r.valor)+' '+(!r.data?'sem data':''));
    return terms.every(term=>text.includes(term));
  }).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
}
function openRecords(mode='all',options={}){
  recordsScope={mode,filters:options.filters||getDashboardFilters(),type:options.type||null,recordId:options.recordId||null,from:options.from||null,to:options.to||null,title:options.title||'',person:options.person||null,returnTab:options.returnTab||'dash'};
  document.getElementById('busca').value='';
  goTab('registros');
  if(recordsScope.recordId)document.querySelectorAll('#tableHolder .recordDetails').forEach(detail=>detail.open=true);
  document.getElementById('recordsTitle').focus({preventScroll:true});
}
function setRecordsMode(mode){recordsScope.mode=mode;recordsScope.recordId=null;if(!recordsScope.person)recordsScope.title='';renderTable();}
function backFromRecords(){goTab(recordsScope.returnTab||'dash');}
function resetRecordsView(){
  recordsScope={mode:'all',filters:null,type:null,recordId:null,from:null,to:null,title:'',person:null,returnTab:'dash'};
  document.getElementById('busca').value='';renderTable();
}
function showHighlightRecord(id){
  const row=data.find(r=>r.id===id);if(!row)return;
  openRecords('all',{recordId:id,title:'Culto de '+fmtDate(row.data)});
}
function updateRecordsContext(count){
  const s=recordsScope,f=s.filters,labels=[];
  if(f?.fDe)labels.push('Desde '+fmtDate(f.fDe));
  if(f?.fAte)labels.push('Até '+fmtDate(f.fAte));
  if(f?.fTipo)labels.push(f.fTipo);
  if(f?.fPregador)labels.push(f.fPregador);
  if(f?.fMeio)labels.push(f.fMeio);
  if(s.type)labels.push('Tipo: '+s.type);
  if(s.from||s.to)labels.push((s.from?fmtDate(s.from):'Início')+' a '+(s.to?fmtDate(s.to):'hoje'));
  document.getElementById('recordsTitle').textContent=s.title||recordsModeLabels[s.mode]||'Registros';
  document.getElementById('recordsContextText').textContent=labels.length?labels.join(' · '):'Selecione um culto para conferir os detalhes.';
  document.getElementById('recordsCount').textContent=count+' registro'+(count===1?'':'s')+' encontrado'+(count===1?'':'s');
  document.getElementById('recordsClear').hidden=!(s.mode!=='all'||s.person||s.type||s.recordId||s.from||s.to||labels.length||document.getElementById('busca').value);
  const back=document.getElementById('recordsBack');back.textContent=s.returnTab==='participacao'?'← Voltar à análise':'← Voltar ao painel';
  document.querySelectorAll('[data-record-quick]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.recordQuick===s.mode)));
}
function openChartRecords(model,row){
  const options={filters:getDashboardFilters(),recordId:row.recordId||null,from:row.from||null,to:row.to||null,title:'Cultos · '+row.label};
  const open=()=>openRecords(model.money?'money':'people',options);
  if(expandedChartId){document.getElementById('chartDialog').addEventListener('close',open,{once:true});closeChart();}
  else open();
}
let landscapeRequested=false;
let orientationBusy=false;
function updateOrientationControls(){
  document.querySelectorAll('[data-landscape-toggle]').forEach(button=>{button.textContent=landscapeRequested?'↕ Rotação livre':'↔ Horizontal';button.setAttribute('aria-pressed',String(landscapeRequested));button.disabled=orientationBusy;});
  document.querySelectorAll('[data-fullscreen-toggle]').forEach(button=>{button.textContent=document.fullscreenElement?'⛶ Sair da tela cheia':'⛶ Tela cheia';button.setAttribute('aria-pressed',String(!!document.fullscreenElement));button.disabled=orientationBusy;});
}
function releaseLandscape(){
  try{screen.orientation?.unlock?.();}catch(error){}
  landscapeRequested=false;
}
async function toggleLandscape(){
  if(orientationBusy)return;
  const message=document.getElementById('orientationHelp');
  if(landscapeRequested){releaseLandscape();message.textContent='Rotação livre. Para voltar à vertical, gire o celular com a rotação automática ativada.';updateOrientationControls();return;}
  orientationBusy=true;updateOrientationControls();
  try{
    if(!screen.orientation?.lock)throw new Error('unsupported');
    // O Chrome Android normalmente exige tela cheia para solicitar orientação.
    if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    await screen.orientation.lock('landscape');
    landscapeRequested=true;
    message.textContent='Modo horizontal ativado. Toque em Rotação livre para liberar a orientação.';
  }catch(error){
    releaseLandscape();
    message.textContent='O navegador não permitiu girar a tela. No Android, deslize o painel rápido, toque em Retrato para ativar Rotação automática e vire o celular. Se abriu dentro de outro app, abra este link no Chrome.';
  }finally{orientationBusy=false;updateOrientationControls();}
}
async function toggleAppFullscreen(){
  if(orientationBusy)return;
  const message=document.getElementById('orientationHelp');
  try{
    if(document.fullscreenElement){releaseLandscape();await document.exitFullscreen();}
    else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    else message.textContent='Tela cheia indisponível neste navegador. Abra o app no Chrome do Android.';
  }catch(error){message.textContent='Não foi possível abrir a tela cheia. Tente abrir o app diretamente no Chrome.';}
  updateOrientationControls();
}
function initInteractions(){
  document.querySelectorAll('[data-record-mode]').forEach(button=>button.addEventListener('click',()=>openRecords(button.dataset.recordMode)));
  document.getElementById('resumoTipo').addEventListener('click',event=>{
    const button=event.target.closest('[data-record-type]');if(button)openRecords('all',{type:button.dataset.recordType,title:'Cultos · '+button.dataset.recordType});
  });
  document.getElementById('destaques').addEventListener('click',event=>{
    const button=event.target.closest('[data-highlight-id]');if(button)showHighlightRecord(button.dataset.highlightId);
  });
  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement){releaseLandscape();document.getElementById('orientationHelp').textContent='Tela cheia encerrada. Use Horizontal para solicitar a orientação novamente.';}
    updateOrientationControls();
  });
}
