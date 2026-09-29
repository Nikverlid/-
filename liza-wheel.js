const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function openLizaWheel({user,request}){
 if(!['teacher','admin'].includes(user?.role))throw Error('Нет доступа');
 const existing=document.getElementById('lizaWheel');if(existing){existing.focus();return}
 const d=document.createElement('dialog');d.id='lizaWheel';d.setAttribute('aria-label','Бедная Лиза — колесо фортуны');
 let state=null,busy=false,closed=false,spinTimer=null,mode='wheel',expanded=false,ownsFullscreen=false;
 d.innerHTML=`<header class="lw-head"><div><span class="lw-eyebrow">ОТКРЫТЫЙ УРОК · Н. М. КАРАМЗИН</span><h2>Бедная Лиза</h2><p>Колесо фортуны · за пределами эксперта</p></div><div class="lw-tools"><button data-lw="full">⛶ На весь экран</button><button data-lw="close" aria-label="Закрыть игру">✕ Закрыть</button></div></header><div class="lw-toolbar"><span id="lwProgress">Загружаем игру…</span><div><button data-lw="refresh">Обновить</button><button data-lw="edit">Участники</button><button data-lw="reset">Новая игра</button></div></div><p id="lwError" role="alert" hidden></p><section id="lwEditor" hidden><label for="lwNames">Имена участников — по одному на строку</label><p>Можно указать имя и фамилию. Этот список увидит учитель на своём устройстве.</p><textarea id="lwNames" rows="7" maxlength="2840" spellcheck="false" placeholder="Анна Иванова&#10;Никита Вершинин"></textarea><div><button data-lw="save" class="lw-primary">Сохранить участников</button><button data-lw="cancel-edit">Отмена</button></div></section><div class="lw-layout"><main class="lw-stage" id="lwStage"><p>Подключаемся…</p></main><aside class="lw-roster"><div class="lw-roster-head"><h3>Участники</h3><span>А → Я</span></div><div class="lw-legend"><span>+ верно</span><span>− неверно</span></div><ol id="lwPlayers" aria-label="Участники по алфавиту"></ol></aside></div>`;
 const $=id=>d.querySelector('#'+id);
 const on=(name,handler)=>d.querySelector('[data-lw="'+name+'"]')?.addEventListener('click',handler);
 const error=m=>{$('lwError').textContent=m||'';$('lwError').hidden=!m};
 const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
 const fullscreenChanged=()=>{if(closed)return;if(ownsFullscreen&&!fullscreenElement()){ownsFullscreen=false;expanded=false;paintFullscreen()}};
 function paintFullscreen(){d.classList.toggle('lw-expanded',expanded);d.querySelector('[data-lw="full"]').textContent=expanded?'↙ Выйти из полного экрана':'⛶ На весь экран'}
 async function leaveFullscreen(){if(ownsFullscreen&&fullscreenElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;try{await exit?.call(document)}catch{}}ownsFullscreen=false}
 function close(){closed=true;clearTimeout(spinTimer);document.removeEventListener('fullscreenchange',fullscreenChanged);document.removeEventListener('webkitfullscreenchange',fullscreenChanged);void leaveFullscreen();d.close();d.remove()}
 on('close',close);d.addEventListener('cancel',e=>{e.preventDefault();close()});
 document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);
 on('full',async()=>{
  if(expanded){await leaveFullscreen();expanded=false;paintFullscreen();return}
  error('');
  // Fullscreen the document, not the modal: browsers reject requestFullscreen on dialog elements.
  const root=document.documentElement,requestFull=root.requestFullscreen||root.webkitRequestFullscreen;
  if(!fullscreenElement()){
   if(!requestFull){error('Этот браузер не поддерживает полноэкранный режим сайта. На компьютере нажмите F11.');return}
   try{await requestFull.call(root);ownsFullscreen=true}catch{error('Браузер не разрешил полный экран. На компьютере можно нажать F11.');return}
  }
  if(closed){await leaveFullscreen();return}expanded=true;paintFullscreen();
  // Put the modal above the new fullscreen layer without rebuilding game state.
  if(d.open)d.close();d.showModal();
 });
 document.body.append(d);d.showModal();
 function lock(value){busy=value;d.querySelectorAll('button').forEach(b=>{if(!['close','full'].includes(b.dataset.lw))b.disabled=value||(b.hasAttribute('data-choice')&&state?.active?.correct!==null)||(b.dataset.lw==='spin'&&state?.finished)})}
 async function call(action,data={}){
  let timer;const controller=new AbortController();
  try{return await Promise.race([request(action,data,controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Не удалось дождаться сервера. Нажмите «Обновить»: ход сохранится, если сервер успел его принять.'))},15000)})])}finally{clearTimeout(timer)}
 }
 async function load(){if(busy)return;lock(true);error('');try{state=await call('wheel_get');if(closed)return;mode=state.active?'question':'wheel';render()}catch(e){if(!closed){error(e.message);$('lwStage').innerHTML='<div class="lw-empty"><h3>Не удалось загрузить игру</h3><p>Нажмите «Обновить», чтобы повторить подключение.</p></div>'}}finally{if(!closed)lock(false)}}
 async function change(action,data={},animate=false){
  if(busy||!state)return;lock(true);error('');
  try{
   const next=await call(action,{...data,revision:state.revision});if(closed)return;state=next;
   if(animate){mode='wheel';render();lock(true);animateWheel();return}
   mode=state.active?'question':'wheel';render();
  }catch(e){if(!closed){error(e.message);try{state=await call('wheel_get');if(!closed){mode=state.active?'question':'wheel';render()}}catch{}}}
  finally{if(!closed&&!(animate&&spinTimer))lock(false)}
 }
 function editor(){if(!state||busy)return;$('lwNames').value=state.players.map(p=>p.name).join('\n');$('lwEditor').hidden=false;$('lwNames').focus()}
 on('edit',editor);on('cancel-edit',()=>{$('lwEditor').hidden=true});
 on('save',async()=>{const names=$('lwNames').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);if(state.asked&&!confirm('Изменение участников начнёт новую игру и очистит её результаты. Продолжить?'))return;await change('wheel_roster',{names});if(!closed&&!$('lwError').textContent)$('lwEditor').hidden=true});
 on('refresh',load);on('reset',()=>{if(state&&confirm('Начать новую игру? Имена сохранятся, ответы и результаты этого раунда будут очищены.'))change('wheel_reset')});
 function wheel(){
  const players=state.players,n=players.length;if(!n)return '<div class="lw-empty"><span class="lw-book">✦</span><h3>Всё начинается с участников</h3><p>Список пока пуст. Список участников ещё не подготовлен.</p></div>';
  const step=360/n,R=270,c=300,xy=deg=>[c+R*Math.cos(deg*Math.PI/180),c+R*Math.sin(deg*Math.PI/180)];
  const sectors=players.map((p,i)=>{const start=-90+i*step,end=start+step,a=xy(start),b=xy(end),mid=start+step/2,left=Math.cos(mid*Math.PI/180)<0,x=c+171*Math.cos(mid*Math.PI/180),y=c+171*Math.sin(mid*Math.PI/180),font=Math.max(8,Math.min(n>22?13:18,190/(p.name.length*.62)));const shape=n===1?`<circle cx="300" cy="300" r="270" fill="#145d4f"/>`:`<path d="M300 300 L${a[0]} ${a[1]} A270 270 0 ${step>180?1:0} 1 ${b[0]} ${b[1]} Z" fill="${['#2268ad','#ad3e55','#217755','#7550a2','#a45c17','#17778a','#a53f86','#59652b','#4756ad','#965037','#167767','#945b8e','#526332','#a63e3e','#4b6490'][i%15]}" stroke="#f3faf8" stroke-width="2"/>`;return `<g><title>${esc(p.name)}</title>${shape}<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${left?mid+180:mid} ${x} ${y})" fill="white" font-size="${font}" font-weight="700">${esc(p.name)}</text></g>`}).join('');
  return `<div class="lw-wheel-wrap"><span class="lw-pointer" aria-hidden="true"></span><svg id="lwWheel" viewBox="0 0 600 600" role="img" aria-label="Колесо с именами участников">${sectors}<circle cx="300" cy="300" r="51" fill="#fff" stroke="#d7af63" stroke-width="6"/><text x="300" y="316" text-anchor="middle" font-size="49" fill="#145d4f">✦</text></svg></div><p class="lw-wheel-caption" id="lwSelected" aria-live="polite">Кто помнит каждую деталь?</p><button class="lw-primary lw-spin" data-lw="spin" ${busy||state.finished?'disabled':''}>${state.finished?'Все вопросы сыграны':'Крутить колесо'}</button><p class="lw-note">15 вопросов без повторов. Каждый получит ход, прежде чем колесо начнёт следующий круг.</p>`;
 }
 function animateWheel(){
  const i=state.players.findIndex(p=>p.id===state.active.playerId),step=360/state.players.length,angle=1800+360-(i+.5)*step,svg=$('lwWheel');
  $('lwSelected').textContent='Колесо выбирает участника…';svg.getBoundingClientRect();svg.style.transform=`rotate(${angle}deg)`;
  spinTimer=setTimeout(()=>{spinTimer=null;if(closed)return;mode='question';render();lock(false)},4200);
 }
 function question(){
  const a=state.active,q=a.question,p=state.players.find(p=>p.id===a.playerId),review=a.correct!==null;
  return `<section class="lw-question"><div class="lw-question-top"><span>ВОПРОС ${state.asked} / ${state.total}</span><strong>${esc(p.name)}</strong></div><h3>${esc(q.text)}</h3><div class="lw-answers">${q.choices.map((c,i)=>`<button data-choice="${c.id}" ${review?'disabled':''} class="${review?(c.id===q.correct?'lw-right':c.id===a.choice?'lw-wrong':''):''}"><b>${['А','Б','В','Г'][i]}</b><span>${esc(c.label)}</span>${review&&c.id===q.correct?'<em>✓ Верный ответ</em>':''}</button>`).join('')}</div>${review?`<div class="lw-feedback ${a.correct?'lw-good':'lw-bad'}"><h4>${a.correct?'Верно! +':'Неверно. −'}</h4><p>${esc(q.explanation)}</p>${q.detail?.length?`<details class="lw-detail"><summary>Подробный разбор ответа</summary>${q.detail.map(p=>`<p>${esc(p)}</p>`).join('')}</details>`:''}</div>${state.finished?'<div class="lw-finish"><h3>Все 15 вопросов разобраны!</h3><p>Результаты участников сохранены в списке справа.</p></div>':'<button data-lw="next" class="lw-primary">Следующий участник →</button>'}`:'<p class="lw-note">Учитель нажимает вариант, который выбрал участник.</p>'}</section>`;
 }
 function render(){
  if(closed)return;
  $('lwProgress').textContent=`${state.asked} / ${state.total} вопросов · ${state.players.length} участников`;
  $('lwPlayers').style.setProperty('--lw-count',Math.max(1,Math.min(state.players.length,15)));
  $('lwPlayers').innerHTML=[...state.players].sort((a,b)=>a.name.localeCompare(b.name,'ru',{sensitivity:'base',numeric:true})).map(p=>{const active=p.id===state.active?.playerId,pending=active&&state.active.correct===null,last=p.results.at(-1),status=pending||!last?'waiting':last.correct?'good':'bad';return `<li class="lw-player lw-${status} ${active?'lw-current':''}"><span class="lw-person-name">${esc(p.name)}${pending?'<small>Отвечает сейчас</small>':''}</span><span class="lw-signs" aria-label="${p.results.length?'Результаты ответов':'Ещё не отвечал'}">${p.results.map(r=>`<b class="${r.correct?'lw-plus':'lw-minus'}">${r.correct?'+':'−'}</b>`).join('')}</span></li>`}).join('');
  $('lwStage').innerHTML=mode==='question'&&state.active?question():wheel();
  on('spin',()=>change('wheel_spin',{},true));on('next',()=>change('wheel_spin',{},true));
  d.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>change('wheel_answer',{roundId:state.active.id,choice:Number(b.dataset.choice)})));
 }
 await load();
}

