// Apresentação dos gráficos. Os registros originais continuam intactos.
const chartModels = new Map();
let chartPeriod = window.matchMedia('(max-width:800px)').matches ? 'week' : 'cult';
let expandedChartId = null;
let chartOpener = null;
let chartZoom = 1;
let chartReturnY = 0;
let chartScrollRestoration = 'auto';
const chartNumber = value => Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1});
const chartValue = (model,value) => model.money ? fmtBRL(value) : chartNumber(value)+' pessoas';
const chartShortDate = date => date.slice(8,10)+'/'+date.slice(5,7);
const chartMonth = key => new Date(key+'-01T12:00:00Z').toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'}).replace('.','').replace(' de ','/');
function monthDrillRow(row){
  const [year,month]=row.key.split('-').map(Number);
  return {...row,axis:chartMonth(row.key),from:row.key+'-01',to:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
}

function chartRows(rows,key,period){
  const known=rows.filter(r=>r.data&&Number.isFinite(r[key]));
  if(period==='cult') return known.map(r=>({label:fmtDate(r.data)+' • '+(r.tipo||'Culto'),axis:chartShortDate(r.data),value:Number(r[key]),recordId:r.id}));
  const groups=new Map();
  known.forEach(r=>{
    let groupKey=r.data.slice(0,7);
    if(period==='week'){
      const date=new Date(r.data+'T12:00:00Z');
      date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
      groupKey=date.toISOString().slice(0,10);
    }
    const group=groups.get(groupKey)||{sum:0,count:0};
    group.sum+=Number(r[key]); group.count++; groups.set(groupKey,group);
  });
  return [...groups].sort((a,b)=>a[0].localeCompare(b[0])).map(([keyDate,g])=>{
    let label=monthLabel(keyDate),axis=chartMonth(keyDate),from=keyDate+'-01';
    const [year,month]=keyDate.split('-').map(Number);
    let to=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    if(period==='week'){
      const end=new Date(keyDate+'T12:00:00Z'); end.setUTCDate(end.getUTCDate()+6);
      label=fmtDate(keyDate)+' a '+fmtDate(end.toISOString().slice(0,10)); axis=chartShortDate(keyDate);
      from=keyDate;to=end.toISOString().slice(0,10);
    }
    // Evolução de presença agregada = média por culto. Financeiro = soma.
    return {label:label+' • '+g.count+' culto'+(g.count===1?'':'s'),axis,value:key==='pessoas'?g.sum/g.count:g.sum,from,to};
  });
}

function setChartPeriod(period){
  if(!['cult','week','month'].includes(period))return;
  chartPeriod=period; renderAll();
}
function renderDashboardCharts(rows){
  document.querySelectorAll('[data-chart-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chartPeriod===chartPeriod)));
  const periodText={cult:'por culto',week:'por semana',month:'por mês'}[chartPeriod];
  const configs=[
    {id:'chartPresenca',title:chartPeriod==='cult'?'Evolução de presença':'Presença média '+periodText,description:chartPeriod==='cult'?'Pessoas presentes em cada culto.':'Média de pessoas por culto, agrupada '+periodText+'.',type:'line',rows:chartRows(rows,'pessoas',chartPeriod),color:'--primary2',money:false},
    {id:'chartFinanceiro',title:'Entradas '+periodText,description:chartPeriod==='cult'?'Valores informados em cada culto.':'Soma das entradas informadas, agrupada '+periodText+'.',type:'bar',rows:chartRows(rows,'valor',chartPeriod),color:'--primary',money:true},
    {id:'chartMesPresenca',title:'Presença por mês',description:'Total de pessoas registradas em cada mês.',type:'horizontal',rows:aggregateMonths(rows,'pessoas').map(monthDrillRow),color:'--accent',money:false},
    {id:'chartMesFinanceiro',title:'Entradas por mês',description:'Total de dízimos / entradas em cada mês.',type:'horizontal',rows:aggregateMonths(rows,'valor').map(monthDrillRow),color:'--primary2',money:true}
  ];
  configs.forEach(model=>{
    chartModels.set(model.id,model);
    const el=document.getElementById(model.id),card=el.closest('.chartCard');
    card.querySelector('h3').textContent=model.title; card.querySelector('p').textContent=model.description;
    card.querySelector('.chartExpand').setAttribute('aria-label','Ampliar '+model.title.toLowerCase());
    el.style.height=model.type==='horizontal'?Math.max(180,model.rows.length*32+20)+'px':'';
    renderChart(el,model,false);
    document.getElementById(model.id+'Readout').textContent=model.rows.length?'Toque no gráfico para ver o valor.':'Sem dados para este filtro.';
  });
  if(expandedChartId)renderExpandedChart();
}

function renderChart(el,model,expanded){
  if(!model.rows.length){el.innerHTML='<div class="empty">Sem dados para este filtro.</div>';return;}
  const w=Math.round(el.clientWidth),h=Math.round(el.clientHeight);
  if(w<1||h<1)return;
  const grid=css('--grid'),muted=css('--muted'),color=css(model.color),ink=css('--ink');
  const number=value=>model.money?'R$ '+new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(value):chartNumber(value);
  const values=model.rows.map(r=>r.value), max=Math.max(...values.map(Math.abs),1);
  const point=(i,mark,hit)=>`<g class="chartPoint" data-point="${i}" role="button" tabindex="0" aria-label="${escapeHtml(model.rows[i].label+' • '+chartValue(model,model.rows[i].value))}">${hit}${mark}<title>${escapeHtml(model.rows[i].label+' • '+chartValue(model,model.rows[i].value))}</title></g>`;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${escapeHtml(model.title)}">`;
  if(model.type==='horizontal'){
    const left=56,right=Math.max(...model.rows.map(r=>(model.money?fmtBRL(r.value):chartNumber(r.value)).length))*6.5+12,inner=Math.max(40,w-left-right),step=(h-12)/model.rows.length;
    model.rows.forEach((r,i)=>{
      const y=6+step*i,bh=Math.min(17,step*.58),barWidth=Math.abs(r.value)/max*inner;
      svg+=`<text x="0" y="${y+bh/2+4}" font-size="11" fill="${muted}">${escapeHtml(r.axis)}</text>`;
      svg+=point(i,`<rect class="chartMark" x="${left}" y="${y}" width="${inner}" height="${bh}" rx="4" fill="${grid}"/><rect x="${left}" y="${y}" width="${barWidth}" height="${bh}" rx="4" fill="${color}"/>`,`<rect x="0" y="${y-3}" width="${w}" height="${step}" fill="transparent"/>`);
      svg+=`<text x="${w-1}" y="${y+bh/2+4}" font-size="11" font-weight="700" text-anchor="end" fill="${ink}">${escapeHtml(model.money?fmtBRL(r.value):chartNumber(r.value))}</text>`;
    });
  }else{
    const left=model.money?58:34,right=16,top=14,bottom=34,inner=w-left-right,plot=h-top-bottom;
    const minimum=Math.min(0,...values),maximum=Math.max(1,...values)*1.12,range=maximum-minimum;
    const y=value=>top+plot*(maximum-value)/range;
    for(let i=0;i<=3;i++){
      const value=minimum+range*i/3,yy=y(value);
      svg+=`<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="${grid}"/><text x="${left-7}" y="${yy+4}" text-anchor="end" font-size="10" fill="${muted}">${escapeHtml(number(value))}</text>`;
    }
    const slot=inner/model.rows.length,x=i=>model.type==='line'?left+(model.rows.length===1?inner/2:inner*i/(model.rows.length-1)):left+slot*(i+.5);
    if(model.type==='line'&&model.rows.length>1)svg+=`<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${model.rows.map((r,i)=>x(i)+','+y(r.value)).join(' ')}"/>`;
    const ticks=Math.max(2,Math.floor(inner/64)),stride=Math.max(1,Math.ceil((model.rows.length-1)/(ticks-1)));
    model.rows.forEach((r,i)=>{
      const xx=x(i),yy=y(r.value),bw=Math.max(.5,Math.min(32,slot*.65));
      const mark=model.type==='line'?`<circle class="chartMark" cx="${xx}" cy="${yy}" r="${expanded?3:2.2}" fill="${color}"/>`:`<rect class="chartMark" x="${xx-bw/2}" y="${Math.min(yy,y(0))}" width="${bw}" height="${Math.max(1,Math.abs(y(0)-yy))}" rx="${Math.min(3,bw/3)}" fill="${color}"/>`;
      const hitWidth=Math.max(1,inner/(model.rows.length-1||1));
      svg+=point(i,mark,`<rect x="${Math.max(left,xx-hitWidth/2)}" y="${top}" width="${Math.min(hitWidth,w-right-Math.max(left,xx-hitWidth/2))}" height="${plot}" fill="transparent"/>`);
      if(i%stride===0||i===model.rows.length-1){
        // Não desenha o último rótulo se ele ficaria colado ao anterior.
        if(i===model.rows.length-1&&i%stride!==0&&i%stride<stride*.7)return;
        svg+=`<text x="${xx}" y="${h-10}" text-anchor="${i===0?'start':i===model.rows.length-1?'end':'middle'}" font-size="10" fill="${muted}">${escapeHtml(r.axis)}</text>`;
      }
    });
  }
  el.innerHTML=svg+'</svg>';
  const showPoint=event=>{
    const group=event.target.closest('[data-point]');if(!group)return;
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
    if(event.type==='keydown')event.preventDefault();
    const row=model.rows[Number(group.dataset.point)],readout=document.getElementById(expanded?'chartDialogReadout':model.id+'Readout');
    readout.innerHTML=`${escapeHtml(row.label)}<br><strong>${escapeHtml(chartValue(model,row.value))}</strong><button type="button" class="chartViewRecords">Ver cultos deste ponto →</button>`;
    readout.querySelector('button').onclick=()=>openChartRecords(model,row);
  };
  el.onclick=showPoint; el.onkeydown=showPoint;
}

function openChart(id,opener){
  if(!chartModels.has(id))return;
  expandedChartId=id;chartOpener=opener;chartZoom=1;
  chartReturnY=window.scrollY;
  chartScrollRestoration=history.scrollRestoration;
  history.scrollRestoration='manual';
  document.getElementById('chartZoom').value='1';
  document.getElementById('chartDataDetails').open=false;
  document.body.classList.add('chartDialogOpen');
  document.getElementById('chartDialog').showModal();
  history.pushState({...history.state,ipLusChart:true},'');
  renderExpandedChart();
}
function renderExpandedChart(){
  const model=chartModels.get(expandedChartId);if(!model)return;
  document.getElementById('chartDialogTitle').textContent=model.title;
  document.getElementById('chartDialogDescription').textContent=model.description;
  const el=document.getElementById('chartExpanded'),viewport=document.getElementById('chartViewport'),available=Math.max(240,viewport.clientWidth-18);
  el.style.width=Math.min(6000,(model.type==='horizontal'?available:Math.max(available,model.rows.length*36))*chartZoom)+'px';
  el.style.height=(model.type==='horizontal'?Math.max(240,model.rows.length*40):Math.max(280,Math.min(480,window.innerHeight*.48)))+'px';
  renderChart(el,model,true);
  document.getElementById('chartDialogReadout').textContent=model.rows.length?'Toque em uma barra ou ponto para ver o valor.':'Sem dados para este filtro.';
  document.getElementById('chartDataRows').innerHTML=model.rows.length?model.rows.map(r=>`<div class="chartDataRow"><span>${escapeHtml(r.label)}</span><strong>${escapeHtml(chartValue(model,r.value))}</strong></div>`).join(''):'<p class="muted">Sem dados para este filtro.</p>';
}
function setChartZoom(value){chartZoom=Number(value)||1;renderExpandedChart();}
function finishChartClose(){
  const dialog=document.getElementById('chartDialog');if(dialog.open)dialog.close();
  expandedChartId=null;document.body.classList.remove('chartDialogOpen');
  chartOpener?.focus({preventScroll:true});chartOpener=null;
  window.scrollTo({top:chartReturnY,behavior:'instant'});
  requestAnimationFrame(()=>{history.scrollRestoration=chartScrollRestoration;});
}
function closeChart(){
  if(!expandedChartId)return;
  if(history.state?.ipLusChart)history.back();
  else finishChartClose();
}
function initCharts(){
  const dialog=document.getElementById('chartDialog');
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeChart();});
  window.addEventListener('popstate',()=>{if(expandedChartId&&!history.state?.ipLusChart)finishChartClose();});
  document.querySelectorAll('.chartExpand[data-chart]').forEach(button=>button.addEventListener('click',()=>openChart(button.dataset.chart,button)));
}
