export const VERSION = 1;
export function createGame(count, now = Date.now()) {
  if (![2, 3, 4].includes(count)) throw Error('Выберите от 2 до 4 команд');
  return {version:VERSION,count,scores:Array(count).fill(0),turn:0,used:[],phase:'select',deadline:now+30000,round:null,last:null};
}
export function chooseQuestion(s, id, bank, now = Date.now(), random = Math.random) {
  if (s.phase !== 'select' || now >= s.deadline || s.used.includes(id)) return false;
  const q = bank.questions.find(q=>q.id===id); if (!q) return false;
  const steal = random() < 1/3;
  s.round = {id,owner:s.turn,steal,order:[s.turn,...(steal?Array.from({length:s.count},(_,i)=>i).filter(i=>i!==s.turn):[])],cursor:0,answers:{}};
  s.used.push(id); s.phase='answer'; s.deadline=now+90000; s.last=null; return true;
}
export function answer(s, choice, bank, now=Date.now()) {
  if (s.phase!=='answer'||now>=s.deadline) return false;
  const q=bank.questions.find(q=>q.id===s.round.id);
  if(choice!==null&&(!Number.isInteger(choice)||choice<0||choice>=q.choices.length))return false;
  record(s,choice,bank,now);return true;
}
function record(s,choice,bank,now) {
  const r=s.round; r.answers[r.order[r.cursor]]=choice;
  if(++r.cursor<r.order.length){s.deadline=now+90000;return}
  const q=bank.questions.find(q=>q.id===r.id),awards=Array(s.count).fill(0);
  if(r.answers[r.owner]===q.correct)awards[r.owner]=q.value;
  else if(r.steal){const winners=r.order.filter(i=>i!==r.owner&&r.answers[i]===q.correct);if(winners.length)winners.forEach(i=>awards[i]=Math.floor(q.value/winners.length))}
  awards.forEach((v,i)=>s.scores[i]+=v);s.last={awards};s.phase='reveal';s.deadline=null;
}
export function nextRound(s,bank,now=Date.now()) {
  if(s.phase!=='reveal'&&s.phase!=='missed')return false;
  if(s.used.length===bank.questions.length){s.phase='finished';s.deadline=null;return true}
  s.turn=(s.turn+1)%s.count;s.round=null;s.last=null;s.phase='select';s.deadline=now+30000;return true;
}
export function tick(s,bank,now=Date.now()) {
  let changed=false;
  while(s.deadline!==null&&now>=s.deadline&&['select','answer'].includes(s.phase)){
    changed=true;const at=s.deadline;
    if(s.phase==='select'){s.phase='missed';s.deadline=null;s.last={message:'Время выбора вышло. Ход переходит следующей команде.'}}
    else record(s,null,bank,at);
  }
  return changed;
}
