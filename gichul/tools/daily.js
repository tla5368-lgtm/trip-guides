// 너와 나의 기출문제 — daily set tool (node). Usage:
//   node daily.js prep  <DATE> <SITE_DIR> <WORK_DIR>   -> takes 행정학 items from the pool for 5 rounds, writes WORK/rN_pool.json, WORK/pool_next.json, WORK/used_<area>.txt
//   node daily.js check <SITE_DIR> <WORK_DIR>                     -> validates WORK/gen_rN.json (generated part) and prints problems
//   node daily.js checkone <SITE_DIR> <WORK_DIR> <R>              -> validates one round while generating
//   node daily.js build <DATE> <SITE_DIR> <WORK_DIR>    -> merges pool + generated, validates, writes SITE/sets/DATE.json, SITE/sets/index.json, SITE/sets/stems.json, SITE/pool/admin.json
const fs=require('fs'),path=require('path');
const [,,cmd,...args]=process.argv;
const AREAS=[[0,'의사소통',10],[0,'문제해결',10],[0,'정보',10],[0,'조직이해',10],[0,'직업윤리',10],[1,'국어',8],[1,'한국사',8],[1,'시사',4],[2,'행정학',20]];
const SECS_OF=Object.fromEntries(AREAS.map(([s,a])=>[a,s]));
const rd=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const wr=(f,o)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(o));};
const norm=s=>String(s).replace(/<[^>]+>/g,'').replace(/[\s「」『』'"‘’“”·.,?!()\-]/g,'').slice(0,60);
const keyOf=q=>norm(String(q.q)+(q.p||''))+'|'+norm(q.o&&q.o[q.a]);
const POOL_REAL_PER_ROUND=4, POOL_SELF_PER_ROUND=6;
function validItem(q,where){const p=[];
  if(!(q&&typeof q==='object'))return [where+': not an object'];
  if(!(q.ar in SECS_OF))p.push(where+': unknown area '+q.ar);
  else if(q.s!==SECS_OF[q.ar])p.push(where+': s must be '+SECS_OF[q.ar]+' for '+q.ar);
  if(!q.q||typeof q.q!=='string')p.push(where+': empty q');
  if(!Array.isArray(q.o)||q.o.length!==4||q.o.some(x=>!x||typeof x!=='string'))p.push(where+': o must be 4 non-empty strings');
  else if(new Set(q.o.map(x=>x.trim())).size!==4)p.push(where+': duplicate options');
  if(![0,1,2,3].includes(q.a))p.push(where+': a must be 0..3');
  if(!q.e||String(q.e).length<20)p.push(where+': explanation too short');
  if(!q.src)p.push(where+': missing src');
  if(q.p!=null&&typeof q.p!=='string')p.push(where+': p must be string');
  return p;}
function loadStems(site){const f=path.join(site,'sets/stems.json');return fs.existsSync(f)?rd(f):[];}
if(cmd==='prep'){
  const [date,site,work]=args;fs.mkdirSync(work,{recursive:true});
  const pool=rd(path.join(site,'pool/admin.json'));
  for(let r=1;r<=5;r++){const take=pool.real.splice(0,POOL_REAL_PER_ROUND).concat(pool.self.splice(0,POOL_SELF_PER_ROUND));wr(path.join(work,`r${r}_pool.json`),take);
    console.log(`round ${r}: 행정학 from pool ${take.length} -> generate ${20-take.length} 행정학 + 50 NCS + 20 일반상식`);}
  wr(path.join(work,'pool_next.json'),pool);
  const stems=loadStems(site);const by={};stems.forEach(([a,s])=>{(by[a]=by[a]||[]).push(s);});
  AREAS.forEach(([,a])=>fs.writeFileSync(path.join(work,`used_${a}.txt`),(by[a]||[]).join('\n')));
  console.log('pool left: real',pool.real.length,'self',pool.self.length,'| used stems',stems.length);
}
else if(cmd==='check'||cmd==='build'){
  const site=cmd==='check'?args[0]:args[1], work=cmd==='check'?args[1]:args[2], date=args[0];
  const stems=loadStems(site);
  const seen=new Set(stems.map(x=>x[1]));let problems=[];const rounds=[];
  for(let r=1;r<=5;r++){
    const gf=path.join(work,`gen_r${r}.json`),pf=path.join(work,`r${r}_pool.json`);
    if(!fs.existsSync(gf)){problems.push(`r${r}: missing gen_r${r}.json`);continue;}
    let gen;try{gen=rd(gf);}catch(e){problems.push(`r${r}: invalid JSON ${e.message}`);continue;}
    if(!Array.isArray(gen)){problems.push(`r${r}: gen file must be a JSON array`);continue;}
    const pool=fs.existsSync(pf)?rd(pf):[];
    const all=[];AREAS.forEach(([s,a])=>{if(a==='행정학')all.push(...pool);all.push(...gen.filter(q=>q&&q.ar===a));});
    AREAS.forEach(([s,a,n])=>{const c=all.filter(q=>q.ar===a).length;if(c!==n)problems.push(`r${r}: ${a} has ${c}, need ${n}`);});
    if(gen.some(q=>!q||!(q.ar in SECS_OF)))problems.push(`r${r}: items with unknown area`);
    all.forEach((q,i)=>{problems.push(...validItem(q,`r${r}#${i+1}`));const k=keyOf(q);
      if(!isReal(q)){if(seen.has(k))problems.push(`r${r}#${i+1}: duplicate of an earlier question: ${String(q.q).slice(0,40)}`);seen.add(k);}});
    const dist=[0,1,2,3].map(x=>all.filter(q=>q.a===x).length);
    if(Math.min(...dist)<14||Math.max(...dist)>32)problems.push(`r${r}: answer positions unbalanced ${dist.join('/')}`);
    rounds.push(all);
  }
  function isReal(q){return String(q.src||'').indexOf('자체')<0;}
  if(problems.length){console.log('PROBLEMS ('+problems.length+'):\n'+problems.join('\n'));process.exit(1);}
  if(cmd==='check'){console.log('OK: 5 rounds × 90');process.exit(0);}
  wr(path.join(site,`sets/${date}.json`),{date,rounds});
  const idxf=path.join(site,'sets/index.json');const idx=fs.existsSync(idxf)?rd(idxf):{days:[]};
  idx.days=idx.days.filter(x=>x.date!==date).concat([{date,rounds:5,real:rounds.flat().filter(isReal).length}]).sort((a,b)=>a.date<b.date?-1:1);
  idx.updated=new Date().toISOString();wr(idxf,idx);
  rounds.flat().forEach(q=>stems.push([q.ar,keyOf(q)]));wr(path.join(site,'sets/stems.json'),stems);
  if(fs.existsSync(path.join(work,'pool_next.json')))wr(path.join(site,'pool/admin.json'),rd(path.join(work,'pool_next.json')));
  console.log('BUILT',date,'real items',rounds.flat().filter(isReal).length);
}
else if(cmd==='checkone'){
  // node daily.js checkone <SITE_DIR> <WORK_DIR> <R>  -> validates one generated round (gen_rR.json + rR_pool.json)
  const [site,work,R]=args;const stems=loadStems(site);const seen=new Set(stems.map(x=>x[1]));const problems=[];
  let gen;try{gen=rd(path.join(work,`gen_r${R}.json`));}catch(e){console.log('PROBLEMS: cannot read gen_r'+R+'.json '+e.message);process.exit(1);}
  const pool=fs.existsSync(path.join(work,`r${R}_pool.json`))?rd(path.join(work,`r${R}_pool.json`)):[];
  if(!Array.isArray(gen)){console.log('PROBLEMS: gen file must be a JSON array');process.exit(1);}
  const all=[];AREAS.forEach(([s,a])=>{if(a==='행정학')all.push(...pool);all.push(...gen.filter(q=>q&&q.ar===a));});
  AREAS.forEach(([s,a,n])=>{const c=all.filter(q=>q.ar===a).length;if(c!==n)problems.push(`${a} has ${c}, need ${n}`);});
  if(gen.some(q=>!q||!(q.ar in SECS_OF)))problems.push('items with unknown area');
  all.forEach((q,i)=>{problems.push(...validItem(q,`#${i+1}`));const k=keyOf(q);if(String(q.src||'').indexOf('자체')>=0){if(seen.has(k))problems.push(`#${i+1}: duplicate of an earlier question: ${String(q.q).slice(0,40)}`);seen.add(k);}});
  const dist=[0,1,2,3].map(x=>all.filter(q=>q.a===x).length);if(Math.min(...dist)<14||Math.max(...dist)>32)problems.push('answer positions unbalanced '+dist.join('/'));
  if(problems.length){console.log('PROBLEMS ('+problems.length+'):\n'+problems.join('\n'));process.exit(1);}
  console.log('OK round '+R+' answers '+dist.join('/'));
}
else{console.log('usage: prep|check|checkone|build');process.exit(2);}
