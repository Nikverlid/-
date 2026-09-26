import {VERSION,createGame,chooseQuestion,answer,nextRound,tick} from './team-engine.mjs?v=2';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const letters=['А','Б','В','Г'];
export function openTeamGame(bank,user){
 if(!['teacher','admin'].includes(user.role))throw Error('Нет доступа');
 if(document.getElementById('teamGame'))return;
 const key='school-team-'+(bank.work||'igor')+'-'+user.id;
 let state=null,interval=null,enteredFullscreen=false,simulatedFullscreen=false;
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.version===VERSION&&[2,3,4].includes(saved.count)&&Array.isArray(saved.used)&&saved.used.every(id=>bank.questions.some(q=>q.id===id)))state=saved}catch{}
 const d=document.createElement('dialog');d.id='teamGame';d.className='team-game';
 d.innerHTML='<div class="tg-top"><div><span class="tg-eyebrow">КОМАНДНЫЙ ТУРНИР</span><h2>Своя игра</h2><p>'+esc(bank.title||'Слово о полку Игореве')+'</p></div><div class="tg-tools"><button type="button" id="tgFullscreen" aria-label="Полный экран">⛶ Полный экран</button><button type="button" id="tgClose">✕ Выйти</button></div></div><div id="tgContent"></div>';
 document.body.append(d);d.showModal();
 const el=id=>d.querySelector('#'+id);
 function save(){try{if(state)localStorage.setItem(key,JSON.stringify(state));else localStorage.removeItem(key)}catch{}}
 function syncFullscreen(){
  const nativeFullscreen=document.fullscreenElement===document.documentElement||document.fullscreenElement===d;
  if(!nativeFullscreen)simulatedFullscreen=false;
  enteredFullscreen=nativeFullscreen||simulatedFullscreen;
  d.classList.toggle('tg-fullscreen-mode',enteredFullscreen);
  const button=el('tgFullscreen');
  if(button)button.textContent=enteredFullscreen?'↙ Выйти из полного экрана':'⛶ Полный экран';
 }
 async function close(){
  save();clearInterval(interval);simulatedFullscreen=false;
  if(document.fullscreenElement&&(document.fullscreenElement===document.documentElement||document.fullscreenElement===d)){
   try{await document.exitFullscreen()}catch{}
  }
  d.classList.remove('tg-fullscreen-mode');d.close();d.remove();
 }
 el('tgClose').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close()});
 el('tgFullscreen').onclick=async()=>{
  if(enteredFullscreen){
   simulatedFullscreen=false;
   if(document.fullscreenElement){try{await document.exitFullscreen()}catch{}}
   syncFullscreen();return;
  }
  try{
   if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
   else simulatedFullscreen=true;
  }catch{simulatedFullscreen=true}
  syncFullscreen();
 };
 document.addEventListener('fullscreenchange',syncFullscreen);
 function scores(){return '<div class="tg-scores">'+state.scores.map((score,i)=>`<div class="tg-score tg-team-${i} ${state.turn===i&&state.phase!=='finished'?'is-turn':''}"><span>Команда ${i+1}</span><strong>${score}<small> баллов</small></strong>${state.turn===i&&state.phase!=='finished'?'<em>Выбирает вопрос</em>':''}</div>`).join('')+'</div>'}
 function bar(text){return `<div class="tg-status"><h3>${esc(text)}</h3>${state.deadline?'<span class="tg-clock" id="tgClock" role="timer"></span>':''}</div>`}
 function setup(){el('tgContent').innerHTML=`<div class="tg-setup"><p class="tg-eyebrow">25 ВОПРОСОВ · 5 КАТЕГОРИЙ</p><h3>Сколько команд участвует?</h3><div class="tg-counts">${[2,3,4].map(n=>`<button data-count="${n}"><strong>${n}</strong><span>команды</span></button>`).join('')}</div><ul><li>Выбор вопроса — 1 минута. Ответ — до 2 минут на каждую команду.</li><li>Вопросы стоят от 10 до 50 баллов. Ошибка или отсутствие ответа — 0 баллов.</li><li>Иногда открывается перехват: отвечает команда, выбравшая вопрос, затем остальные по номеру. Номер команды появляется на выбранном варианте.</li><li>Если первая команда ответила верно, все баллы получает она. Иначе правильно ответившие соперники делят стоимость вопроса, округляя вниз.</li><li>Ответы команд вводит учитель. Правильный ответ откроется, когда все участвующие команды закончат отвечать.</li></ul><p class="tg-note">Игру можно свернуть и продолжить на этом устройстве. Текущий таймер продолжает идти.</p></div>`;d.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>{state=createGame(Number(b.dataset.count));save();render()})}
 function board(){return `<div class="tg-board-wrap"><div class="tg-board" role="group" aria-label="Категории и стоимость вопросов">${bank.categories.map(c=>`<section class="tg-category-col"><div class="tg-category"><h4>${esc(c.title)}</h4><p>${esc(c.description)}</p></div>${bank.questions.filter(q=>q.category===c.id).sort((a,b)=>a.value-b.value).map(q=>`<button class="tg-tile" data-question="${q.id}" ${state.used.includes(q.id)?'disabled':''} aria-label="${esc(c.title)}, ${q.value} баллов">${state.used.includes(q.id)?'✓':q.value}</button>`).join('')}</section>`).join('')}</div></div>`}
 function question(){
 const r=state.round,q=bank.questions.find(q=>q.id===r.id),category=bank.categories.find(c=>c.id===q.category),reveal=state.phase==='reveal',active=r.order[r.cursor];
 if(r.steal&&!r.stealStartedAt)r.stealStartedAt=Date.now();
 const stealAge=r.steal?Date.now()-r.stealStartedAt:0;
 const showStealArt=r.steal&&stealAge<6200;
 const showStealBanner=r.steal&&stealAge<5200;
 const sparks=Array.from({length:14},(_,i)=>{const n=i%7,row=Math.floor(i/7);return `<i style="--spark-delay:${4000-stealAge+i*28}ms;--spark-x:${n*22-66}px;--spark-y:${row*-10}px;--spark-end-x:${n*34-102}px;--spark-end-y:${row*36+92}px"></i>`}).join('');
 const stealArt=showStealArt?`<div class="tg-steal-intro" aria-hidden="true" style="--steal-age:${stealAge}ms"><div class="tg-steal-sparks">${sparks}</div></div>`:'';
 const markers=i=>r.order.filter(t=>r.answers[t]===i).map(t=>`<span class="tg-marker tg-team-${t}" aria-label="Выбрала команда ${t+1}">${t+1}</span>`).join('');
 return `${stealArt}<div class="tg-question"><div class="tg-question-label"><span>${esc(category.title)} · ${q.value} баллов</span><b class="${r.steal?(showStealBanner?'tg-steal tg-steal-target':'tg-steal'):''}">${r.steal?'⚡ ПЕРЕХВАТ':'Отвечает одна команда'}</b></div>${bar(reveal?'Разбор ответа':`Отвечает команда ${active+1}`)}<h3 class="tg-question-text">${esc(q.text)}</h3><div class="tg-answers">${q.choices.map((c,i)=>`<button data-choice="${i}" class="tg-option ${reveal?(i===q.correct?'tg-correct':r.order.some(t=>r.answers[t]===i)?'tg-wrong':''):''}" ${reveal?'disabled':''}><span class="tg-letter">${letters[i]}</span><span>${esc(c)}</span><span class="tg-markers">${markers(i)}</span>${reveal&&i===q.correct?'<strong class="tg-correct-label">✓ Верный ответ</strong>':''}</button>`).join('')}</div>${reveal?`<div class="tg-explanation"><p><b>Правильный ответ: ${letters[q.correct]}. ${esc(q.choices[q.correct])}</b></p><p>${esc(q.explanation)}</p><ul>${r.order.map(t=>`<li>Команда ${t+1}: ${r.answers[t]===null?'нет ответа':r.answers[t]===q.correct?'верно':'неверно'} — <b>+${state.last.awards[t]} баллов</b></li>`).join('')}</ul>${r.answers[r.owner]!==q.correct&&state.last.awards.some(v=>v>0)?'<p>Очки разделены между командами, перехватившими вопрос, с округлением вниз.</p>':''}</div><button class="tg-primary" id="tgNext">${state.used.length===bank.questions.length?'Итоги турнира':'Следующий ход →'}</button>`:`<div class="tg-question-bottom"><p>Очередь: ${r.order.map((t,i)=>i<r.cursor?`команда ${t+1} ✓`:`команда ${t+1}`).join(' → ')}</p><button id="tgPass">Нет ответа</button></div>`}</div>`;
 }
 function render(){if(!state){setup();return}tick(state,bank);save();
 let html=scores();
 if(state.phase==='select')html+=bar(`Ход команды ${state.turn+1} · выберите вопрос`)+board();
 else if(['answer','reveal'].includes(state.phase))html+=question();
 else if(state.phase==='missed')html+=`<div class="tg-explanation"><h3>Время выбора вышло</h3><p>Команда ${state.turn+1} не выбрала вопрос за 1 минуту. Ход пропущен, очки не изменились.</p><button id="tgNext" class="tg-primary">Ход команды ${(state.turn+1)%state.count+1} →</button></div>`;
 else if(state.phase==='finished'){const best=Math.max(...state.scores),winners=state.scores.map((v,i)=>v===best?i+1:null).filter(Boolean);html+=`<div class="tg-finish"><span class="tg-trophy">🏆</span><h3>${winners.length===1?'Победила команда '+winners[0]:'Ничья! Команды '+winners.join(', ')}</h3><p>Все 25 вопросов сыграны.</p><ol>${state.scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).map(x=>`<li>Команда ${x.i+1} <b>${x.v} баллов</b></li>`).join('')}</ol><button id="tgNew" class="tg-primary">Новый турнир</button></div>`}
 html+=`<footer class="tg-footer"><span>Сыграно: ${state.used.length} / ${bank.questions.length}</span>${state.phase!=='finished'?'<button id="tgRestart">Начать заново</button>':''}<details><summary>Правила и источники</summary><p>1 минута на выбор, 2 минуты на ответ каждой команды. При перехвате первой отвечает команда, выбравшая вопрос, затем остальные по номеру. Правильный ответ первой команды приносит ей всю стоимость. При её ошибке стоимость делится между правильно ответившими соперниками с округлением вниз. За ошибки очки не снимаются. После вопроса ход переходит следующей команде по кругу.</p>${bank.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' · ')}</details></footer>`;
 el('tgContent').innerHTML=html;
 d.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{tick(state,bank);if(chooseQuestion(state,b.dataset.question,bank))save();render()});
 d.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{if(tick(state,bank)){render();return}answer(state,Number(b.dataset.choice),bank);save();render()});
 if(el('tgPass'))el('tgPass').onclick=()=>{if(tick(state,bank)){render();return}answer(state,null,bank);save();render()};
 if(el('tgNext'))el('tgNext').onclick=()=>{nextRound(state,bank);save();render()};
 const reset=()=>{state=null;save();render()};if(el('tgNew'))el('tgNew').onclick=reset;
 if(el('tgRestart'))el('tgRestart').onclick=()=>{if(confirm('Начать новый турнир? Счёт этой игры будет сброшен.'))reset()};clock();
 }
 function clock(){if(!state)return;if(tick(state,bank)){save();render();return}const c=el('tgClock');if(c){const sec=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));c.textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');c.classList.toggle('tg-urgent',sec<=10)}}
 render();interval=setInterval(clock,200);
}
