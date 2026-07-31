const fs=require('fs');
const SRC=fs.readFileSync('/home/brice/Code/github.com/bricef/bricef.github.io/ranker/app.js','utf8');
const fe=()=>({hidden:false,textContent:'',innerHTML:'',value:'',className:'',disabled:false,style:{},tagName:'DIV',
 classList:{add(){},remove(){},contains(){return false}},addEventListener(){},append(){},replaceChildren(){},remove(){},
 focus(){},select(){},setAttribute(){},setSelectionRange(){}});
const H=new Function('window','document','localStorage','navigator',SRC+`
;return {setup(it){state={title:'t',items:it,history:[]};refineTop=0;forcedPair=null;rebuild();},
 push(a,b,r){state.history.push({a,b,r});rebuild();},nextPair,estimateRemaining,
 done(){return state.history.length}};`)(
 {matchMedia:()=>({matches:true}),isSecureContext:false,scrollTo(){}},
 {getElementById:fe,createElement:fe,addEventListener(){},body:fe(),activeElement:null},
 {getItem:()=>null,setItem(){}},{});

// For each run, record the predicted total (done + remaining) at every step.
// A good estimate never makes the finish line move away from you.
for(const n of [10,20,50]){
  let worstRise=0, meanFinal=0, T=20, worstRiseAt='';
  const sample=[];
  for(let t=0;t<T;t++){
    const items=Array.from({length:n},(_,i)=>i).sort(()=>Math.random()-0.5).map(String);
    H.setup(items);
    let prevTotal=H.estimateRemaining(), first=prevTotal, maxTotal=prevTotal;
    const traj=[prevTotal];
    for(;;){
      const p=H.nextPair(); if(!p)break;
      H.push(p.a,p.b,(+items[p.a])<(+items[p.b])?'a':'b');
      const total=H.done()+H.estimateRemaining();
      traj.push(total);
      maxTotal=Math.max(maxTotal,total);
      prevTotal=total;
    }
    const actual=H.done();
    const rise=(maxTotal-first)/first;
    if(rise>worstRise){worstRise=rise; worstRiseAt=`first=${first} peak=${maxTotal} actual=${actual}`;}
    meanFinal+=actual;
    if(t===0) sample.push(...traj);
  }
  console.log(`n=${String(n).padStart(2)}  mean actual ${(meanFinal/T).toFixed(1).padStart(6)}   worst upward drift ${(worstRise*100).toFixed(1).padStart(5)}%   (${worstRiseAt})`);
  console.log(`      one trajectory: ${sample.filter((_,i)=>i%Math.ceil(sample.length/12)===0).join(' → ')}`);
}
