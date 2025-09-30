/* ===== Helpers ===== */
async function loadCSV(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error('Failed '+path);
  const text = await res.text();
  return Papa.parse(text, { header:true, skipEmptyLines:true }).data;
}
function median(arr){ if(!arr.length) return 0; const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function colorByRoute(r){ return ({'COMMIT':css('--green'),'EXPLORE':css('--amber'),'PARK':css('--red'),'DEFER/AUTO':css('--gray')})[r]||css('--gray'); }

const appState = {
  data:{
    problems:[],
    problemMap:{},
    edges:[],
    edgesRawCount:0,
    invalidEdgeCount:0,
    micmac:[],
    micmacMap:{}
  },
  filters:{ sector:'', route:'', micmac:'' },
  charts:{ stacey:null, micmac:null },
  cy:null,
  activeTab:'net',
  pluginsRegistered:false,
  dataLoaded:false
};

function inferRoute(row){
  const raw = String(row.route||'').trim();
  if(raw) return raw;
  const U = +row.uncertainty||0, I = +row.impact||0;
  return (I>=3&&U<3)?'COMMIT':(I>=3&&U>=3)?'EXPLORE':(I<3&&U>=3)?'PARK':'DEFER/AUTO';
}

function matchesProblemFilters(problem){
  const { sector, route, micmac } = appState.filters;
  if(sector && problem.sector !== sector) return false;
  if(route && problem.route !== route) return false;
  if(micmac && problem.micmac !== micmac) return false;
  return true;
}

function matchesMicmacFilters(row){
  const { sector, route, micmac } = appState.filters;
  if(micmac && row.micmac_class !== micmac) return false;
  if(!sector && !route) return true;
  const problem = appState.data.problemMap[row.id];
  if(!problem) return false;
  if(sector && problem.sector !== sector) return false;
  if(route && problem.route !== route) return false;
  return true;
}

function ensureChartPlugins(){
  if(!window.Chart || appState.pluginsRegistered) return;
  const plugins = [];
  if(window.ChartDataLabels) plugins.push(window.ChartDataLabels);
  if(window.ChartAnnotation) plugins.push(window.ChartAnnotation);
  if(plugins.length) window.Chart.register(...plugins);
  appState.pluginsRegistered = true;
}

function renderForTab(tab){
  if(tab==='net') renderNetwork();
  else if(tab==='stacey') renderStacey();
  else if(tab==='micmac') renderMICMAC();
}

/* ===== Tabs ===== */
function bindTabs(){
  const buttons = document.querySelectorAll('nav button');
  buttons.forEach(b=>b.addEventListener('click',()=>{
    buttons.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t=b.dataset.tab;
    appState.activeTab = t;
    document.querySelectorAll('section[id^="tab-"]').forEach(s=>s.style.display=(s.id==='tab-'+t?'block':'none'));
    renderForTab(t);
  }));
  const activeBtn = document.querySelector('nav button.active');
  if(activeBtn) appState.activeTab = activeBtn.dataset.tab;
}

/* ===== Data ===== */
async function loadCoreData(){
  const problemsRaw = await loadCSV('data/problems_enriched.csv').catch(()=>loadCSV('data/problems.csv')).catch(()=>[]);
  const micmacRaw = await loadCSV('data/micmac.csv').catch(()=>[]);

  const micmac = micmacRaw.map(r=>{
    const id = String(r.id||'').trim();
    if(!id) return null;
    const cls = String(r.micmac_class||r.class||'').trim();
    return {
      id,
      micmac_class: cls,
      influence:+r.influence||0,
      dependence:+r.dependence||0
    };
  }).filter(Boolean);
  const micmacMap = Object.fromEntries(micmac.map(r=>[r.id,r]));

  const problems = problemsRaw.map(row=>{
    const id = String(row.id||'').trim();
    if(!id) return null;
    const title = String(row.title||'').trim()||id;
    const sector = String(row.sector||'').trim();
    const route = inferRoute(row);
    const impact = +row.impact||0;
    const uncertainty = +row.uncertainty||0;
    const micmacCls = (micmacMap[id]?.micmac_class||'').trim();
    return { id, title, sector, route, impact, uncertainty, micmac:micmacCls };
  }).filter(Boolean);

  const problemMap = Object.fromEntries(problems.map(p=>[p.id,p]));
  const problemSet = new Set(problems.map(p=>p.id));

  const edgesRaw = await loadCSV('data/edges.csv').catch(()=>[]);
  let invalidEdgeCount = 0;
  const edges = edgesRaw.map(row=>{
    const source = String(row.source||'').trim();
    const target = String(row.target||'').trim();
    if(!source || !target || !problemSet.has(source) || !problemSet.has(target)){
      invalidEdgeCount += 1;
      return null;
    }
    return { source, target, weight:+row.weight||1 };
  }).filter(Boolean);

  appState.data = {
    problems,
    problemMap,
    edges,
    edgesRawCount:edgesRaw.length,
    invalidEdgeCount,
    micmac,
    micmacMap
  };
  appState.dataLoaded = true;
}

function populateFilterOptions(){
  const sectorSet = new Set();
  const routeSet = new Set();
  const micmacSet = new Set();
  appState.data.problems.forEach(p=>{
    if(p.sector) sectorSet.add(p.sector);
    if(p.route) routeSet.add(p.route);
    if(p.micmac) micmacSet.add(p.micmac);
  });
  appState.data.micmac.forEach(r=>{ if(r.micmac_class) micmacSet.add(r.micmac_class); });

  const fillSelect=(id, values, key)=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    while(sel.options.length>1) sel.remove(1);
    const arr = Array.from(values).filter(Boolean).sort((a,b)=>a.localeCompare(b,'fa',{sensitivity:'base',numeric:true}));
    arr.forEach(val=>{
      const opt=document.createElement('option');
      opt.value=val; opt.textContent=val;
      if(appState.filters[key]===val) opt.selected=true;
      sel.appendChild(opt);
    });
    if(appState.filters[key] && !arr.includes(appState.filters[key])){
      appState.filters[key]='';
      sel.value='';
    }else if(appState.filters[key]){
      sel.value=appState.filters[key];
    }else{
      sel.value='';
    }
  };

  fillSelect('f-sector', sectorSet, 'sector');
  fillSelect('f-route', routeSet, 'route');
  fillSelect('f-micmac', micmacSet, 'micmac');
}

function bindFilterEvents(){
  const mapping = { 'f-sector':'sector', 'f-route':'route', 'f-micmac':'micmac' };
  Object.entries(mapping).forEach(([id,key])=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    sel.addEventListener('change',()=>{
      appState.filters[key] = sel.value;
      renderForTab(appState.activeTab);
    });
  });
}

/* ===== Network (Cytoscape) ===== */
function renderNetwork(){
  if(!appState.dataLoaded) return;
  const container = document.getElementById('cy');
  if(!container) return;
  if(appState.cy){ appState.cy.destroy(); appState.cy=null; }

  const filteredProblems = appState.data.problems.filter(matchesProblemFilters);
  const nodes = filteredProblems.map(p=>({ data:{
    id:p.id,
    label:p.title||p.id,
    route:p.route||'NA',
    sector:p.sector||'other',
    micmac:p.micmac||'',
    weight:p.impact>0?Math.min(Math.max(p.impact,1),5):1
  }}));

  const allowed = new Set(filteredProblems.map(p=>p.id));
  const filteredEdges = appState.data.edges
    .filter(e=>allowed.has(e.source)&&allowed.has(e.target))
    .map(e=>({ data:{ id:`${e.source}_${e.target}`, source:e.source, target:e.target, weight:e.weight } }));

  const baseStyle = [
    { selector:'node', style:{ 'label':'data(label)','font-size':12,'text-wrap':'wrap','text-max-width':140,'text-background-color':'#0f172a','text-background-opacity':0.8,'text-background-shape':'roundrectangle','text-background-padding':'4px','width':'mapData(weight,1,5,22,34)','height':'mapData(weight,1,5,22,34)','background-color':'#888' } },
    { selector:'edge', style:{ 'curve-style':'bezier','width':'mapData(weight,1,5,2,6)','line-color':css('--edge'),'target-arrow-shape':'triangle','target-arrow-color':css('--edge') } }
  ];
  const useMicmacStyle = Object.keys(appState.data.micmacMap||{}).length>0;
  const style = useMicmacStyle ? baseStyle.concat(
    { selector:'node[micmac = "Driver"]',     style:{ 'background-color':'#065f46' } },
    { selector:'node[micmac = "Linkage"]',    style:{ 'background-color':css('--amber') } },
    { selector:'node[micmac = "Dependent"]',  style:{ 'background-color':css('--blue') } },
    { selector:'node[micmac = "Autonomous"]', style:{ 'background-color':css('--gray') } }
  ) : baseStyle.concat(
    { selector:'node[route = "EXPLORE"]', style:{ 'background-color':css('--amber') } },
    { selector:'node[route = "COMMIT"]',  style:{ 'background-color':css('--green') } }
  );

  appState.cy = cytoscape({ container, elements:[...nodes,...filteredEdges], layout:{ name:'cose' }, style });

  const msg = document.getElementById('msg');
  if(msg){
    msg.textContent='';
    if(nodes.length===0){
      msg.textContent='هیچ مسئله‌ای مطابق فیلترها پیدا نشد.';
    }else if(filteredEdges.length===0){
      if(appState.data.edges.length===0){
        if(appState.data.edgesRawCount>0 && appState.data.invalidEdgeCount>0){
          msg.textContent='یال‌های نامعتبر حذف شدند (گره‌هایی در edges بودند که در problems تعریف نشده‌اند).';
        }else{
          msg.textContent='هیچ یالی برای نمایش وجود ندارد.';
        }
      }else{
        msg.textContent='هیچ یالی مطابق فیلترها وجود ندارد.';
      }
    }else if(appState.data.invalidEdgeCount>0){
      msg.textContent='یال‌های نامعتبر حذف شدند (گره‌هایی در edges بودند که در problems تعریف نشده‌اند).';
    }
  }
}

/* ===== Stacey 2×2 (Chart.js) ===== */
function renderStacey(){
  if(!appState.dataLoaded || !window.Chart) return;
  const canvas = document.getElementById('staceyChart');
  if(!canvas) return;
  if(appState.charts.stacey){ appState.charts.stacey.destroy(); appState.charts.stacey=null; }
  ensureChartPlugins();

  const pts = appState.data.problems.filter(matchesProblemFilters)
    .map(r=>({x:+r.impact||0, y:+r.uncertainty||0, label:r.title, route:r.route||'DEFER/AUTO'}));
  const ctx = canvas.getContext('2d');
  const quadrantFills = {
    commit:'rgba(16,185,129,0.12)',
    explore:'rgba(245,158,11,0.12)',
    park:'rgba(239,68,68,0.1)',
    defer:'rgba(156,163,175,0.12)'
  };
  appState.charts.stacey = new Chart(ctx,{type:'scatter',
    data:{datasets:[{
      label:'Stacey Matrix',
      data:pts,
      pointRadius:6,
      pointHoverRadius:7,
      pointBackgroundColor:pts.map(d=>colorByRoute(d.route)),
      pointBorderWidth:0
    }]},
    options:{responsive:true,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          title:(items)=>items.length?String(items[0].raw.label||''):'',
          label:(ctx)=>`(I:${ctx.raw.x}, U:${ctx.raw.y})`
        }},
        datalabels:{align:'top',formatter:(v)=>v.label,color:css('--muted'),clip:true},
        annotation:{annotations:{
          commit:{type:'box',xMin:3,xMax:5,yMin:1,yMax:3,backgroundColor:quadrantFills.commit,drawTime:'beforeDatasetsDraw'},
          explore:{type:'box',xMin:3,xMax:5,yMin:3,yMax:5,backgroundColor:quadrantFills.explore,drawTime:'beforeDatasetsDraw'},
          park:{type:'box',xMin:1,xMax:3,yMin:3,yMax:5,backgroundColor:quadrantFills.park,drawTime:'beforeDatasetsDraw'},
          defer:{type:'box',xMin:1,xMax:3,yMin:1,yMax:3,backgroundColor:quadrantFills.defer,drawTime:'beforeDatasetsDraw'},
          vline:{type:'line',xMin:3,xMax:3,borderColor:css('--grid'),borderDash:[6,6],borderWidth:1.5},
          hline:{type:'line',yMin:3,yMax:3,borderColor:css('--grid'),borderDash:[6,6],borderWidth:1.5}
        }}
      },
      scales:{
        x:{min:1,max:5,title:{display:true,text:'اثر (Impact)'}},
        y:{min:1,max:5,title:{display:true,text:'عدم‌قطعیت (Uncertainty)'}}
      }
    }});
}

/* ===== MICMAC (Chart.js) ===== */
function renderMICMAC(){
  if(!appState.dataLoaded || !window.Chart) return;
  const canvas = document.getElementById('micmacChart');
  if(!canvas) return;
  if(appState.charts.micmac){ appState.charts.micmac.destroy(); appState.charts.micmac=null; }
  ensureChartPlugins();

  const rows = appState.data.micmac.filter(matchesMicmacFilters);
  const xs = rows.map(r=>+r.influence||0), ys = rows.map(r=>+r.dependence||0);
  const mx = median(xs), my = median(ys);
  const colors = {'Driver':'#065f46','Linkage':css('--amber'),'Dependent':css('--blue'),'Autonomous':css('--gray')};
  const pts = rows.map(r=>({x:+r.influence||0, y:+r.dependence||0, label:r.id, color:colors[r.micmac_class]||css('--gray')}));
  const ctx = canvas.getContext('2d');
  appState.charts.micmac = new Chart(ctx,{type:'scatter',data:{datasets:[{data:pts, pointBackgroundColor:pts.map(d=>d.color)}]},
    options:{
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:(c)=>`${c.raw.label} (I:${c.raw.x.toFixed(1)}, D:${c.raw.y.toFixed(1)})`}},
        datalabels:{align:'top',formatter:(v)=>v.label,color:css('--muted'),clip:true},
        annotation:{annotations:{
          vline:{type:'line',xMin:mx,xMax:mx,borderColor:css('--grid'),borderDash:[6,6]},
          hline:{type:'line',yMin:my,yMax:my,borderColor:css('--grid'),borderDash:[6,6]}
        }}
      },
      scales:{x:{title:{display:true,text:'نفوذ'}},y:{title:{display:true,text:'وابستگی'}}}
    }});
}

/* ===== ISM Levels ===== */
async function renderISM(){
  const rows = await loadCSV('data/ism_levels.csv').catch(()=>[]);
  const byLevel = {};
  rows.forEach(r=>{ const L=+r.level||1; (byLevel[L]=byLevel[L]||[]).push(String(r.id||'').trim()); });
  const maxL = Math.max(...Object.keys(byLevel).map(Number), 1);
  const wrap = document.getElementById('ismList'); wrap.innerHTML='';
  for(let L=maxL; L>=1; L--){
    const box = document.createElement('div'); box.className='card';
    box.innerHTML = `<strong>Level ${L}</strong><div class="legend"></div>`;
    const leg = box.querySelector('.legend');
    (byLevel[L]||[]).forEach(id=>{ const s=document.createElement('span'); s.textContent=id; s.style.padding='6px 10px';
      s.style.border='1px solid #2a3344'; s.style.borderRadius='10px'; s.style.background='#0f172a'; leg.appendChild(s); });
    wrap.appendChild(box);
  }
}

/* ===== Top Drivers Table ===== */
async function renderDrivers(){
  const rows = await loadCSV('data/top_drivers.csv').catch(()=>[]);
  const tb = document.querySelector('#driversTbl tbody'); tb.innerHTML='';
  rows.forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.id}</td><td>${(+r.influence||0).toFixed(2)}</td><td>${(+r.dependence||0).toFixed(2)}</td>`; tb.appendChild(tr); });
}

/* ===== Boot ===== */
async function boot(){
  bindTabs();
  await loadCoreData();
  populateFilterOptions();
  bindFilterEvents();
  renderForTab(appState.activeTab);
  renderISM();
  renderDrivers();
}
document.addEventListener('DOMContentLoaded', boot);
