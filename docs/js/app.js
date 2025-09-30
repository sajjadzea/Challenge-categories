const ROUTE_COLORS={
  'COMMIT':'#10b981',
  'EXPLORE':'#f59e0b',
  'PARK':'#f87171',
  'DEFER/AUTO':'#9ca3af',
  'DEFER':'#9ca3af',
  'AUTO':'#9ca3af'
};
const MICMAC_COLORS={
  'Driver':'#065f46',
  'Linkage':'#f59e0b',
  'Dependent':'#3b82f6',
  'Autonomous':'#9ca3af'
};
let staceyChart=null;
let micmacChart=null;
const staceyQuadrantPlugin={
  id:'staceyQuadrants',
  afterDraw(chart){
    const xScale=chart.scales.x;
    const yScale=chart.scales.y;
    if(!xScale||!yScale) return;
    const x=xScale.getPixelForValue(3);
    const y=yScale.getPixelForValue(3);
    const {ctx,chartArea}=chart;
    ctx.save();
    ctx.strokeStyle='#d1d5db';
    ctx.lineWidth=1;
    if(x>chartArea.left&&x<chartArea.right){
      ctx.beginPath();
      ctx.moveTo(x,chartArea.top);
      ctx.lineTo(x,chartArea.bottom);
      ctx.stroke();
    }
    if(y>chartArea.top&&y<chartArea.bottom){
      ctx.beginPath();
      ctx.moveTo(chartArea.left,y);
      ctx.lineTo(chartArea.right,y);
      ctx.stroke();
    }
    ctx.restore();
  }
};

function setMessage(id,message){
  const el=document.getElementById(id);
  if(!el) return;
  if(message){
    el.textContent=message;
    el.style.display='block';
  }else{
    el.textContent='';
    el.style.display='none';
  }
}

function showTab(tab){
  document.querySelectorAll('nav button').forEach(btn=>{
    const isActive=btn.dataset.tab===tab;
    btn.classList.toggle('active',isActive);
  });
  document.querySelectorAll('section').forEach(sec=>{
    sec.style.display=sec.id===`tab-${tab}`?'block':'none';
  });
}

document.querySelectorAll('nav button').forEach(btn=>{
  btn.addEventListener('click',()=>showTab(btn.dataset.tab));
});

async function loadCSV(p){ const r=await fetch(p); if(!r.ok) throw new Error(`Failed to load ${p}`); return Papa.parse(await r.text(),{header:true,skipEmptyLines:true}).data; }

function ensureRoute(entry){
  const I=+entry.impact||0;
  const U=+entry.uncertainty||0;
  if(entry.route) return entry.route;
  if(I>=3&&U<3) return 'COMMIT';
  if(I>=3&&U>=3) return 'EXPLORE';
  if(I<3&&U>=3) return 'PARK';
  return 'DEFER/AUTO';
}

function renderNetwork(problems,edges){
  const cyContainer=document.getElementById('cy');
  if(!problems.length){
    cyContainer.innerHTML='';
    return;
  }
  const nodes=problems.map(p=>({data:{id:p.id,label:p.title,route:ensureRoute(p),sector:p.sector||'other',micmac:p.micmac||null}}));
  const links=edges.map(e=>({data:{id:`${e.source}_${e.target}`,source:e.source,target:e.target,weight:+e.weight||1}}));
  const hasMicmac=problems.some(p=>p.micmac);
  const style=[
    {selector:'node',style:{'label':'data(label)','font-size':10,'background-color':'#888','text-wrap':'wrap','text-max-width':120}},
    {selector:'edge',style:{'curve-style':'bezier','width':'data(weight)','line-color':'#bbb'}}
  ];
  if(hasMicmac){
    style.push(
      {selector:'node[micmac = "Driver"]',style:{'background-color':'#065f46'}},
      {selector:'node[micmac = "Linkage"]',style:{'background-color':'#f59e0b'}},
      {selector:'node[micmac = "Dependent"]',style:{'background-color':'#3b82f6'}},
      {selector:'node[micmac = "Autonomous"]',style:{'background-color':'#9ca3af'}}
    );
  }else{
    style.push(
      {selector:'node[route = "EXPLORE"]',style:{'background-color':'#f59e0b'}},
      {selector:'node[route = "COMMIT"]',style:{'background-color':'#10b981'}}
    );
  }
  cytoscape({container:cyContainer,elements:[...nodes,...links],layout:{name:'cose'},style});
}

function renderStaceyChart(rows){
  const msgId='staceyMsg';
  if(!rows.length){
    setMessage(msgId,'داده‌ای برای نمودار Stacey در دسترس نیست.');
    if(staceyChart){staceyChart.destroy();staceyChart=null;}
    return;
  }
  const grouped={};
  rows.forEach(r=>{
    const normalized=(r.route||'').toUpperCase();
    const key=ROUTE_COLORS[normalized]?normalized:'OTHER';
    if(!grouped[key]){
      grouped[key]={label:key==='OTHER'?'OTHER':normalized,data:[],color:ROUTE_COLORS[normalized]||'#6b7280'};
    }
    grouped[key].data.push({x:+r.impact||0,y:+r.uncertainty||0,label:r.title||r.id||'',route:normalized});
  });
  const datasets=[];
  Object.keys(ROUTE_COLORS).forEach(route=>{
    if(grouped[route]){
      datasets.push({label:grouped[route].label,data:grouped[route].data,backgroundColor:grouped[route].color,pointRadius:6});
      delete grouped[route];
    }
  });
  if(grouped.OTHER){
    datasets.push({label:'OTHER',data:grouped.OTHER.data,backgroundColor:grouped.OTHER.color,pointRadius:6});
  }
  if(!datasets.length){
    setMessage(msgId,'هیچ نقطه‌ای برای نمایش در نمودار Stacey موجود نیست.');
    if(staceyChart){staceyChart.destroy();staceyChart=null;}
    return;
  }
  setMessage(msgId,'');
  if(staceyChart){staceyChart.destroy();}
  staceyChart=new Chart(document.getElementById('staceyChart').getContext('2d'),{
    type:'scatter',
    data:{datasets},
    options:{
      responsive:true,
      parsing:false,
      plugins:{
        tooltip:{
          callbacks:{
            label(ctx){
              const raw=ctx.raw||{};
              return `${raw.label||''} (I:${raw.x}, U:${raw.y})`;
            }
          }
        }
      },
      scales:{
        x:{min:1,max:5,ticks:{stepSize:1},title:{display:true,text:'Impact'}},
        y:{min:1,max:4,ticks:{stepSize:1},title:{display:true,text:'Uncertainty'}},
      }
    },
    plugins:[staceyQuadrantPlugin]
  });
}

function renderMicmacChart(rows,message){
  const msgId='micmacMsg';
  if(!rows.length){
    setMessage(msgId,message||'داده‌ای برای نمودار MICMAC یافت نشد.');
    if(micmacChart){micmacChart.destroy();micmacChart=null;}
    return;
  }
  const grouped={};
  rows.forEach(r=>{
    const cls=r.micmac_class||r.class||'';
    if(!cls) return;
    if(!grouped[cls]) grouped[cls]=[];
    grouped[cls].push({x:+r.influence||0,y:+r.dependence||0,label:r.id||'',class:cls});
  });
  const datasets=Object.entries(grouped).map(([cls,data])=>({label:cls,data,backgroundColor:MICMAC_COLORS[cls]||'#6b7280',pointRadius:6}));
  if(!datasets.length){
    setMessage(msgId,'نمودار MICMAC دادهٔ قابل نمایش ندارد.');
    if(micmacChart){micmacChart.destroy();micmacChart=null;}
    return;
  }
  setMessage(msgId,'');
  if(micmacChart){micmacChart.destroy();}
  micmacChart=new Chart(document.getElementById('micmacChart').getContext('2d'),{
    type:'scatter',
    data:{datasets},
    options:{
      responsive:true,
      parsing:false,
      plugins:{
        tooltip:{
          callbacks:{
            label(ctx){
              const raw=ctx.raw||{};
              return `${raw.label||''} (Inf:${raw.x}, Dep:${raw.y})`;
            }
          }
        }
      },
      scales:{
        x:{title:{display:true,text:'Influence'},beginAtZero:true},
        y:{title:{display:true,text:'Dependence'},beginAtZero:true}
      }
    }
  });
}

function renderISM(levels,message){
  const container=document.getElementById('ismList');
  container.innerHTML='';
  if(!levels.length){
    setMessage('ismMsg',message||'داده‌ای برای سطح‌بندی ISM موجود نیست.');
    return;
  }
  setMessage('ismMsg','');
  const groups=new Map();
  levels.forEach(item=>{
    const lvl=item.level||item.Level||'';
    if(!lvl) return;
    if(!groups.has(lvl)) groups.set(lvl,[]);
    groups.get(lvl).push(item.id||item.element||item.title||'نامشخص');
  });
  const sorted=[...groups.entries()].sort((a,b)=>{
    const an=Number(a[0]);
    const bn=Number(b[0]);
    if(!Number.isNaN(an)&&!Number.isNaN(bn)) return an-bn;
    return a[0].localeCompare(b[0]);
  });
  sorted.forEach(([lvl,items])=>{
    const box=document.createElement('div');
    const heading=document.createElement('h4');
    heading.textContent=`سطح ${lvl}`;
    box.appendChild(heading);
    const list=document.createElement('ul');
    items.forEach(text=>{
      const li=document.createElement('li');
      li.textContent=text;
      list.appendChild(li);
    });
    box.appendChild(list);
    container.appendChild(box);
  });
}

function renderDriversTable(rows,message){
  const tbody=document.querySelector('#driversTbl tbody');
  tbody.innerHTML='';
  if(!rows.length){
    setMessage('driversMsg',message||'داده‌ای برای جدول Drivers موجود نیست.');
    return;
  }
  setMessage('driversMsg','');
  rows.forEach(row=>{
    const tr=document.createElement('tr');
    ['id','influence','dependence'].forEach(key=>{
      const td=document.createElement('td');
      td.textContent=row[key]!==undefined?row[key]:'';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

(async()=>{
  const probs = await loadCSV('data/problems_enriched.csv')
    .catch(()=> loadCSV('data/problems.csv').then(rows=>{
      return rows.map(r=>{
        const U=+r.uncertainty||0, I=+r.impact||0;
        const route = (I>=3&&U<3)?'COMMIT':(I>=3&&U>=3)?'EXPLORE':(I<3&&U>=3)?'PARK':'DEFER/AUTO';
        return {...r, route};
      });
    }).catch(()=>[]));
  const edgesRaw = await loadCSV('data/edges.csv').catch(()=>[]);
  const nodeSet = new Set(probs.filter(r=>r && String(r.id||'').trim()!=='').map(r=>String(r.id).trim()));
  const edges = edgesRaw
    .map(e=>{
      const source=String(e?.source??'').trim();
      const target=String(e?.target??'').trim();
      return {...e,source,target};
    })
    .filter(e=>nodeSet.has(e.source) && nodeSet.has(e.target));
  if(probs.length===0){
    setMessage('msg','هیچ مسئله‌ای پیدا نشد.');
  }else if(edges.length===0 && edgesRaw.length>0){
    setMessage('msg','یال‌های نامعتبر حذف شدند.');
  }else if(edgesRaw.length===0){
    setMessage('msg','فایل edges.csv یافت نشد یا خالی است.');
  }else{
    setMessage('msg','');
  }

  let micmacById={};
  let micmacRowsForChart=null;
  try{
    const micmac=await loadCSV('data/micmac.csv');
    micmacRowsForChart=micmac;
    micmacById=Object.fromEntries(micmac.filter(r=>r.id&&r.micmac_class).map(r=>[String(r.id).trim(),r.micmac_class]));
  }catch(e){
    micmacById={};
    micmacRowsForChart=null;
  }

  const problemsWithMeta=probs.map(p=>{
    const id=String(p?.id??'').trim();
    const route=ensureRoute(p);
    const micmacClass=micmacById[id]||p.micmac||'';
    return {...p,id,route,micmac:micmacClass};
  });
  const networkProblems=problemsWithMeta.filter(p=>p.id);

  renderNetwork(networkProblems,edges);
  renderStaceyChart(problemsWithMeta);
  if(micmacRowsForChart){
    renderMicmacChart(micmacRowsForChart);
  }else{
    renderMicmacChart([], 'فایل micmac.csv یافت نشد یا خالی است.');
  }

  try{
    const ism=await loadCSV('data/ism_levels.csv');
    renderISM(ism);
  }catch(e){
    renderISM([], 'فایل ism_levels.csv یافت نشد یا خالی است.');
  }

  try{
    const drivers=await loadCSV('data/top_drivers.csv');
    renderDriversTable(drivers);
  }catch(e){
    renderDriversTable([], 'فایل top_drivers.csv یافت نشد یا خالی است.');
  }
})();
