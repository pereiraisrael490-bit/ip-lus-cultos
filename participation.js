// Contagem por culto e função, sempre sobre a mesma base em uso no aplicativo.
function participantKey(value){return String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
function participantName(value){return String(value??'').trim().replace(/\s+/g,' ');}
function hasParticipant(value){return !!participantKey(value)&&!['—','-','não informado','nao informado'].includes(participantKey(value));}
function participationFilters(){
  return {fDe:document.getElementById('pDe').value,fAte:document.getElementById('pAte').value,fTipo:document.getElementById('pTipo').value,fPregador:'',fMeio:''};
}
function participationRows(){
  const rows=filterForDashboard(data,participationFilters());
  return document.getElementById('pSemData').checked?rows:rows.filter(r=>r.data);
}
function participantGroups(rows,field){
  const groups=new Map();
  rows.forEach(row=>{
    if(!hasParticipant(row[field]))return;
    const key=participantKey(row[field]);
    if(!groups.has(key))groups.set(key,{key,name:participantName(row[field]),count:0});
    groups.get(key).count++;
  });
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
}
function renderParticipantRanking(rows,field,holderId,coverageId){
  const groups=participantGroups(rows,field),known=groups.reduce((sum,g)=>sum+g.count,0),missing=rows.length-known;
  const coverage=document.getElementById(coverageId);
  coverage.textContent=`${known} de ${rows.length} cultos com ${field==='pregador'?'pregador(a)':'abertura'} informado${field==='pregador'?'':'a'}.`;
  let rank=0,previous=-1;
  const ranking=groups.map((g,index)=>{
    if(g.count!==previous)rank=index+1;
    previous=g.count;
    const percent=(100*g.count/known).toLocaleString('pt-BR',{maximumFractionDigits:1});
    return `<button type="button" class="participantRow" data-person-field="${field}" data-person-key="${escapeHtml(g.key)}"><span class="participantPlace">${rank}º</span><span class="participantIdentity"><strong>${escapeHtml(g.name)}</strong><span class="participantBar" aria-hidden="true"><i style="width:${100*g.count/groups[0].count}%"></i></span><small>${percent}% dos cultos com nome informado</small></span><span class="participantCount"><strong>${g.count}</strong><small>culto${g.count===1?'':'s'}</small></span></button>`;
  }).join('');
  document.getElementById(holderId).innerHTML=(ranking||'<div class="empty">Nenhum nome informado neste período.</div>')+(missing?`<button type="button" class="participantMissing" data-person-field="${field}" data-person-missing="true">${missing} culto${missing===1?'':'s'} sem ${field==='pregador'?'pregador(a)':'abertura'} informado${field==='pregador'?'':'a'} · Ver registros →</button>`:'');
}
function renderParticipation(){
  if(!document.getElementById('participacao'))return;
  const f=participationFilters(),dated=!!(f.fDe||f.fAte),toggle=document.getElementById('pSemData');
  toggle.disabled=dated;
  const invalid=f.fDe&&f.fAte&&f.fDe>f.fAte;
  const rows=invalid?[]:participationRows();
  document.getElementById('participationScope').textContent=invalid?'A data inicial deve ser anterior ou igual à data final.':`${rows.length} cultos na análise. ${dated?'Cultos sem data ficam fora do período selecionado.':toggle.checked?'Inclui os cultos sem data.':'Cultos sem data excluídos.'}`;
  renderParticipantRanking(rows,'pregador','preachersRanking','preachersCoverage');
  renderParticipantRanking(rows,'abriu','openersRanking','openersCoverage');
}
function clearParticipationFilters(){
  ['pDe','pAte','pTipo'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pSemData').checked=true;renderParticipation();
}
function openParticipantRecords(button){
  const field=button.dataset.personField;
  if(!['pregador','abriu'].includes(field))return;
  const missing=button.dataset.personMissing==='true',key=button.dataset.personKey;
  const group=participantGroups(participationRows(),field).find(g=>g.key===key);
  const name=missing?'Não informado':group?.name;
  if(!name)return;
  openRecords(document.getElementById('pSemData').checked?'all':'dated',{
    filters:participationFilters(),person:{field,key,missing},returnTab:'participacao',
    title:missing?`Cultos sem ${field==='pregador'?'pregador(a)':'abertura'} informado${field==='pregador'?'':'a'}`:`${field==='pregador'?'Pregações':'Aberturas'} · ${name}`
  });
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('participacao').addEventListener('click',event=>{
    const button=event.target.closest('[data-person-field]');if(button)openParticipantRecords(button);
  });
});
