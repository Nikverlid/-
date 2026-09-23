import fs from 'node:fs';import assert from 'node:assert/strict';
const {Window}=await import(process.env.SCHOOL_DOM_MODULE||'happy-dom');
const root=fs.existsSync('dist/index.html')?'dist/':'';
const html=fs.readFileSync(root+'index.html','utf8'),sleep=()=>new Promise(r=>setTimeout(r,30));
async function scenario(role){
 const w=new Window({url:'https://nikverlid.github.io/-/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,enableJavaScriptEvaluation:false}});
 w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.alert=s=>{throw Error(s)};w.confirm=()=>true;
 w.document.body.innerHTML=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 const calls=[],u={id:'u1',role,name:'Тест Ученик',class:role==='student'?'9А':null};
 let state={id:'a1',revision:0,game:'truth',position:1,correct:0,wrong:0,index:0,question:{text:'Серверный вопрос'},moves:[],solved:[],finished:false};
 w.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);calls.push(b);let data={};
  if(b.action==='login')data={token:'test-token',user:u};
  if(b.action==='dashboard')data={user:u,users:[u],homework:['truth','easy','crossword'].map(game=>({id:game,work:'igor',game,class:'9А',attempts:2,active:true})),attempts:[]};
  if(b.action==='questions')data={truthFacts:[['Проверочный факт',true]],easyQuiz:[['Вопрос',['А','Б','В','Г'],0]],mediumQuiz:[['Вопрос',['А','Б','В','Г'],0]],expertQuiz:[['Вопрос',['А','Б','В','Г'],0]],crossword:[{word:'ИГОРЬ',r:0,c:0,d:'H',clue:'Князь'}],rows:1,cols:5};
  if(b.action==='start'){state={...state,game:b.homework,index:0,revision:0,correct:0,wrong:0};if(b.homework==='easy')state.question=null;if(b.homework==='crossword'){state.question=null;state.grid=[{r:0,c:0,d:'H',length:5,clue:'Князь'}];state.rows=1;state.cols=5}data=state}
  if(b.action==='play'){state={...state,revision:state.revision+1,correct:1,index:1,right:true};if(b.operation==='roll')state={...state,position:2,question:{text:'Вопрос с сервера',choices:[{id:0,label:'А'},{id:1,label:'Б'}]}};if(b.operation==='check')state={...state,statuses:[false],solved:[],wrong:1};data=state}
  return {ok:true,json:async()=>data};
 };
 const external=['data-bednaya-liza.js','data-extra-works.js','data-dead-souls.js'].map(f=>fs.readFileSync(root+f,'utf8')).join('\n');
 const inline=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 w.eval(external+'\n'+inline+'\n'+fs.readFileSync(root+'school.js','utf8'));await sleep();
 assert(w.document.getElementById('schoolGate'));
 if(role!=='student'){w.document.querySelector('[data-auth="staff"]').click();await sleep()}
 const f=w.document.getElementById('schoolLogin');f.querySelector('[name="password"]').value='test';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await sleep();await sleep();
 assert(!w.document.getElementById('schoolGate'),'Login removes gate');assert(w.document.getElementById('schoolNav'));
 if(role!=='student'){
  assert.equal(!!w.document.getElementById('schoolAccounts'),role==='admin');w.document.getElementById('schoolQuestions').click();await sleep();assert(w.document.getElementById('sqList').textContent.includes('Проверочный факт'));w.document.querySelector('.school-close').click();
  w.document.getElementById('schoolHomework').click();await sleep();assert(w.document.getElementById('hwForm'));w.document.querySelector('.school-close').click();
  w.document.getElementById('schoolResults').click();await sleep();assert(w.document.getElementById('resultRows'));w.document.querySelector('.school-close').click();
 }else{
  assert(!w.document.getElementById('schoolQuestions'));assert(w.document.querySelector('[data-work="liza"]').classList.contains('school-locked'));
  w.document.querySelector('[data-work="igor"]').click();await sleep();w.document.querySelector('[data-start="truth"]').click();await sleep();await sleep();assert.equal(w.document.getElementById('factText').textContent,'Серверный вопрос');
  w.document.querySelector('[data-answer="true"]').click();await sleep();assert.equal(calls.filter(b=>b.action==='play').length,1);
  w.document.getElementById('backBtn').click();await sleep();w.document.querySelector('[data-start="crossword"]').click();await sleep();await sleep();assert.equal(w.document.querySelectorAll('#crossGrid input').length,5);w.document.getElementById('crossCheck').click();await sleep();assert(w.document.getElementById('crossFeedback').textContent.includes('Ошибок: 1'));
  w.document.getElementById('backBtn').click();await sleep();w.document.querySelector('[data-start="board"]').click();await sleep();w.document.querySelector('[data-school-level="easy"]').click();await sleep();await sleep();w.document.getElementById('rollBtn').click();await sleep();await sleep();assert(w.document.getElementById('questionDialog').open);assert.equal(w.document.getElementById('questionText').textContent,'Вопрос с сервера');
 }
 console.log(role+' UI: PASS');await w.happyDOM.close();
}
await scenario('teacher');await scenario('admin');await scenario('student');
