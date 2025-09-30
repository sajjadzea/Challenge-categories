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

/* ===== Tabs ===== */
function bindTabs(){
  document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t=b.dataset.tab;
    document.querySelectorAll('section[id^="tab-"]').forEach(s=>s.style.display=(s.id==='tab-'+t?'block':'none'));
  }));
}

/* ===== Network (Cytoscape) ===== */
async function renderNetwork(){
  const probs = await loadCSV('data/problems_enriched.csv').catch(()=>loadCSV('data/problems.csv').then(rows=>{
    return rows.map(r=>{
      const U=+r.uncertainty||0, I=+r.impact||0;
      const route = (I>=3&&U<3)?'COMMIT':(I>=3&&U>=3)?'EXPLORE':(I<3&&U>=3)?'PARK':'DEFER/AUTO';
      return {...r, route};
    });
  }).catch(()=>[]));
  const edgesRaw = await loadCSV('data/edges.csv').catch(()=>[]);
  const pClean = probs.filter(r => r && String(r.id||'').trim()!=='')
                      .map(p => ({ ...p, id:String(p.id).trim() }));
  const nodeSet = new Set(pClean.map(p=>p.id));
  const edges = edgesRaw.map(e=>({source:String(e.source||'').trim(), target:String(e.target||'').trim(), weight:+e.weight||1}))
                        .filter(e=> nodeSet.has(e.source) && nodeSet.has(e.target));

  // MICMAC (optional coloring)
  let micmacById=null;
  try{
    const mm = await loadCSV('data/micmac.csv');
    const cleaned = mm.map(r=>({id:String(r.id||'').trim(), cls:String(r.micmac_class||'').trim()}))
                      .filter(r=>r.id && r.cls);
    if(cleaned.length) micmacById = Object.fromEntries(cleaned.map(r=>[r.id, r.cls]));
  }catch(e){ micmacById=null; }

  const nodes = pClean.map(p=>({ data:{ id:p.id, label:p.title, route:p.route||'NA', sector:p.sector||'other', micmac:micmacById?.[p.id]||null, weight:+p.impact||1 } }));
  const links = edges.map(e=>({ data:{ id:e.source+'_'+e.target, source:e.source, target:e.target, weight:e.weight }}));

  const baseStyle = [
    { selector:'node', style:{ 'label':'data(label)','font-size':12,'text-wrap':'wrap','text-max-width':140,'text-background-color':'#0f172a','text-background-opacity':0.8,'text-background-shape':'roundrectangle','text-background-padding':'4px','width':'mapData(weight,1,5,22,34)','height':'mapData(weight,1,5,22,34)','background-color':'#888' } },
    { selector:'edge', style:{ 'curve-style':'bezier','width':'mapData(weight,1,5,2,6)','line-color':css('--edge'),'target-arrow-shape':'triangle','target-arrow-color':css('--edge') } }
  ];
  const style = micmacById ? baseStyle.concat(
    { selector:'node[micmac = "Driver"]',     style:{ 'background-color':'#065f46' } },
    { selector:'node[micmac = "Linkage"]',    style:{ 'background-color':css('--amber') } },
    { selector:'node[micmac = "Dependent"]',  style:{ 'background-color':css('--blue') } },
    { selector:'node[micmac = "Autonomous"]', style:{ 'background-color':css('--gray') } }
  ) : baseStyle.concat(
    { selector:'node[route = "EXPLORE"]', style:{ 'background-color':css('--amber') } },
    { selector:'node[route = "COMMIT"]',  style:{ 'background-color':css('--green') } }
  );

  const cy = cytoscape({ container:document.getElementById('cy'), elements:[...nodes,...links], layout:{ name:'cose' }, style });
  const msg = document.getElementById('msg');
  if(nodes.length===0) msg.textContent='هیچ مسئله‌ای پیدا نشد. فایل‌های data/* را پر کنید یا منتظر خروجی CI بمانید.';
  else if(edges.length===0 && edgesRaw.length>0) msg.textContent='یال‌های نامعتبر حذف شدند (گره‌هایی در edges بودند که در problems تعریف نشده‌اند).';
}

/* ===== Stacey 2×2 (Chart.js) ===== */
async function renderStacey(){
  const rows = await loadCSV('data/problems_enriched.csv').catch(()=>[]);
  const pts = rows.map(r=>({x:+r.impact||0, y:+r.uncertainty||0, label:r.title, route:r.route||'DEFER/AUTO'}));
  const ctx = document.getElementById('staceyChart').getContext('2d');
  // ensure CDN plugins are registered
  if(window.Chart && window.ChartDataLabels && window.ChartAnnotation){
    Chart.register(ChartDataLabels, ChartAnnotation);
  }
  const quadrantFills = {
    commit:'rgba(16,185,129,0.12)',
    explore:'rgba(245,158,11,0.12)',
    park:'rgba(239,68,68,0.1)',
    defer:'rgba(156,163,175,0.12)'
  };
  new Chart(ctx,{type:'scatter',
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
          title:(items)=>items.length?String(items[0].raw.label||''):'' ,
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
        }}}
      },
      scales:{
        x:{min:1,max:5,title:{display:true,text:'اثر (Impact)'}},
        y:{min:1,max:5,title:{display:true,text:'عدم‌قطعیت (Uncertainty)'}}
      }
    }});
}

/* ===== MICMAC (Chart.js) ===== */
async function renderMICMAC(){
  const rows = await loadCSV('data/micmac.csv').catch(()=>[]);
  const xs = rows.map(r=>+r.influence||0), ys = rows.map(r=>+r.dependence||0);
  const mx = median(xs), my = median(ys);
  const colors = {'Driver':'#065f46','Linkage':css('--amber'),'Dependent':css('--blue'),'Autonomous':css('--gray')};
  const pts = rows.map(r=>({x:+r.influence||0, y:+r.dependence||0, label:r.id, color:colors[r.micmac_class]||css('--gray')}));
  const ctx = document.getElementById('micmacChart').getContext('2d');
  new Chart(ctx,{type:'scatter',data:{datasets:[{data:pts, pointBackgroundColor:pts.map(d=>d.color)}]},
    options:{
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:(c)=>`${c.raw.label} (I:${c.raw.x.toFixed(1)}, D:${c.raw.y.toFixed(1)})`}},
        datalabels:{align:'top',formatter:(v)=>v.label,color:css('--muted'),clip:true},
        annotation:{annotations:{
          vline:{type:'line',xMin:mx,xMax:mx,borderColor:css('--grid'),borderDash:[6,6]},
          hline:{type:'line',yMin:my,yMax:my,borderColor:css('--grid'),borderDash:[6,6]}
        }}}
      },
      scales:{x:{title:{display:true,text:'نفوذ (Influence)'}},y:{title:{display:true,text:'وابستگی (Dependence)'}}}
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
async function boot(){ bindTabs(); await renderNetwork(); renderStacey(); renderMICMAC(); renderISM(); renderDrivers(); }
document.addEventListener('DOMContentLoaded', boot);
