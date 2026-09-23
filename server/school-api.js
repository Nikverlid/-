import postgres from 'npm:postgres@3.4.7';
const sql=postgres(Deno.env.get('SUPABASE_DB_URL'),{prepare:false,max:3});
const headers={'Access-Control-Allow-Origin':'https://nikverlid.github.io','Access-Control-Allow-Headers':'content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const fail=(message)=>{throw new Error(message)};
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const salt=()=>hex(crypto.getRandomValues(new Uint8Array(24)));
async function hash(p,s){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(s),iterations:210000},k,256))}
const cleanName=s=>String(s||'').trim().replace(/\s+/g,' ');
const validClass=s=>/^[789][АБ]$/.test(s);
const publicUser=u=>({id:u.id,login:u.login,name:u.name,class:u.class,role:u.role,onboarding_done:!!u.onboarding_done});
const timerSeconds={truth:150,crossword:300,easy:300,medium:300,expert:600};
function gamePercent(s,d,g){const total=g==='truth'?10:g==='crossword'?d.crossword.length:s.correct+s.wrong;return s.abandoned?0:total?Math.round(10000*s.correct/(g==='crossword'?total+s.wrong:total))/100:0}
const rand=n=>{const b=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(b)}while(b[0]>=limit);return b[0]%n};
const shuffled=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
async function rate(key,max){const [r]=await sql`insert into school.rate_limits(key,hits,until_at) values(${key},1,now()+interval '15 minutes') on conflict(key) do update set hits=case when school.rate_limits.until_at<now() then 1 else school.rate_limits.hits+1 end, until_at=case when school.rate_limits.until_at<now() then now()+interval '15 minutes' else school.rate_limits.until_at end returning hits`;if(r.hits>max)fail('Слишком много попыток. Подождите 15 минут.')}
function question(s,d,game){if(game==='crossword'||s.pending==null)return null;const q=game==='truth'?d.truthFacts[s.pending]:d[game+'Quiz'][s.pending];return game==='truth'?{text:q[0]}:{text:q[0],choices:s.choices.map(i=>({id:i,label:q[1][i]}))}}
function prepare(s,d,game){if(game==='truth'){s.pending=s.order[s.index]??null;return}if(s.position===1||s.position>=31)return;const q=s.order[s.index];if(q==null){s.pending=null;return}s.pending=q;s.choices=shuffled([0,1,2,3]);if(s.hint){const correct=d[game+'Quiz'][q][2];s.choices=shuffled([correct,s.choices.find(x=>x!==correct)]);s.hint=false}}
function land(s,d,game){const p=s.position;if(p===4){s.hint=true;return}if(p===24)return;const target={8:11,12:6,16:25,20:18,28:30}[p];if(target){s.moves.push({from:p,to:target,portal:p===12||p===16});s.position=target}if(s.position>=31){s.finished=true;return}prepare(s,d,game)}
function view(a,d,g){const s=a.state;return {id:a.id,game:g,finished:a.finished,timedOut:!!s.timedOut,remainingMs:Math.max(0,(s.deadline||0)-Date.now()),percent:a.percent,position:s.position,correct:s.correct,wrong:s.wrong,index:s.index,question:question(s,d,g),moves:s.moves||[],dice:s.dice,won:s.won,statuses:s.statuses,solved:s.solved,words:s.words,revision:s.revision,grid:g==='crossword'?d.crossword.map(w=>({r:w.r,c:w.c,d:w.d,length:w.word.length,clue:w.clue})):null,rows:d.rows,cols:d.cols}}
async function action(b,token,ip){
 if(b.action==='login'||b.action==='register'){
  await rate('ip:'+ip,180);
  if(b.action==='login')await rate('login:'+ip+':'+(b.staff?'staff':cleanName(b.surname)+' '+cleanName(b.first)+':'+String(b.class||'')),20);
  const password=String(b.password||'');if(password.length>128)fail('Пароль слишком длинный');
  if(b.action==='register'){
   if(password.length<6)fail('Пароль ученика: не менее 6 символов');
   const surname=cleanName(b.surname),first=cleanName(b.first),name=surname+' '+first,cls=String(b.class||'');
   if(!validClass(cls)||surname.length<2||first.length<2||name.length>100)fail('Проверьте фамилию, имя и класс');
   const s=salt(),h=await hash(password,s);
   const u=await sql.begin(async t=>{await t`select pg_advisory_xact_lock(76213)`;const [{n}]=await t`select count(*)::int n from school.accounts where class=${cls} and role='student'`;if(n>=15)fail('В этом классе уже 15 учеников');const login='u'+salt().slice(0,10);const [u]=await t`insert into school.accounts(login,name,class,role,password_hash,salt) values(${login},${name},${cls},'student',${h},${s}) returning *`;return u});
   const tok=salt()+salt();await sql`insert into school.sessions values(${await sha(tok)},${u.id},now()+interval '90 days')`;return {user:publicUser(u),token:tok};
  }
  let users;
  if(b.staff)users=await sql`select * from school.accounts where role in ('teacher','admin')`;
  else if(b.login)users=await sql`select * from school.accounts where login=${String(b.login)} and role='student'`;
  else users=await sql`select * from school.accounts where lower(name)=lower(${cleanName(b.surname)+' '+cleanName(b.first)}) and class=${String(b.class||'')} and role='student'`;
  let u;for(const x of users)if(await hash(password,x.salt)===x.password_hash)u=x;
  if(!u)fail('Неверные данные для входа');
  const tok=salt()+salt();await sql`insert into school.sessions values(${await sha(tok)},${u.id},now()+interval '90 days')`;return {user:publicUser(u),token:tok};
 }
 const tokenHash=await sha(token);const [u]=await sql`select a.* from school.accounts a join school.sessions s on s.account_id=a.id where s.token_hash=${tokenHash} and s.expires_at>now()`;if(!u)fail('Войдите в аккаунт заново');await sql`update school.sessions set expires_at=now()+interval '90 days' where token_hash=${tokenHash} and expires_at<now()+interval '30 days'`;
 const staff=u.role==='teacher'||u.role==='admin';
 if(b.action==='logout'){await sql`delete from school.sessions where token_hash=${tokenHash}`;return {ok:true}}
 if(b.action==='onboarding_done'){if(u.role!=='student')fail('Нет доступа');await sql`update school.accounts set onboarding_done=true where id=${u.id}`;return {ok:true}}
 if(b.action==='dashboard'){
  const homework=staff?await sql`select * from school.homework order by class,work,game`:await sql`select * from school.homework where class=${u.class} order by work,game`;
  const attempts=staff?await sql`select a.id,a.account_id,a.homework_id,a.percent,a.finished,a.created_at,a.state->'wrong' as wrong,a.state->'correct' as correct from school.attempts a`:await sql`select id,account_id,homework_id,percent,finished,created_at,state->'wrong' as wrong,state->'correct' as correct from school.attempts where account_id=${u.id}`;
  const users=staff?await sql`select id,login,name,class,role from school.accounts where role='student' order by class,name`:[publicUser(u)];return {user:publicUser(u),homework,attempts,users};
 }
 if(b.action==='questions'){if(!staff)fail('Нет доступа');const [c]=await sql`select data from school.catalog where work=${String(b.work)}`;if(!c)fail('Произведение не найдено');return c.data}
 if(b.action==='password'){if(String(b.password||'').length<6||b.password.length>128)fail('Новый пароль: 6–128 символов');if(await hash(String(b.old||''),u.salt)!==u.password_hash)fail('Старый пароль неверен');const s=salt();await sql`update school.accounts set password_hash=${await hash(b.password,s)},salt=${s} where id=${u.id}`;await sql`delete from school.sessions where account_id=${u.id} and token_hash<>${tokenHash}`;return {ok:true}}
 if(b.action==='assign'){
  if(!staff)fail('Нет доступа');if(!validClass(b.class)||!Number.isInteger(b.attempts)||b.attempts<1||b.attempts>100)fail('Проверьте класс и число попыток');
  const lockKey=`${b.class}:${b.work}:${b.game}`;return await sql.begin(async t=>{await t`select pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;await t`update school.homework set active=false where class=${b.class} and work=${b.work} and game=${b.game} and active`;const [h]=await t`insert into school.homework(class,work,game,attempts) values(${b.class},${b.work},${b.game},${b.attempts}) returning id`;return {ok:true,id:h.id}});
 }
 if(b.action==='toggle'){if(!staff)fail('Нет доступа');await sql`update school.homework set active=${!!b.active} where id=${b.id}`;return {ok:true}}
 if(b.action==='admin'){
  if(u.role!=='admin')fail('Нет доступа');
  return await sql.begin(async t=>{await t`select pg_advisory_xact_lock(76213)`;const [target]=await t`select * from school.accounts where id=${b.id} for update`;if(!target||target.role!=='student')fail('Ученик не найден');
   if(b.operation==='delete'){await t`delete from school.accounts where id=${target.id}`}
   else if(b.operation==='edit'){const name=cleanName(b.name);if(name.length<4||name.length>100||!validClass(b.class))fail('Проверьте данные');if(b.class!==target.class){const [{n}]=await t`select count(*)::int n from school.accounts where class=${b.class}`;if(n>=15)fail('В классе уже 15 учеников')}await t`update school.accounts set name=${name},class=${b.class} where id=${target.id}`;await t`delete from school.sessions where account_id=${target.id}`}
   else if(b.operation==='reset_password'){if(String(b.password||'').length<6||b.password.length>128)fail('Пароль: 6–128 символов');const s=salt();await t`update school.accounts set password_hash=${await hash(b.password,s)},salt=${s} where id=${target.id}`;await t`delete from school.sessions where account_id=${target.id}`}
   else if(b.operation==='reset_attempts'){await t`delete from school.attempts where account_id=${target.id} and homework_id=${b.homework}`}
   else if(b.operation==='score'){if(!Number.isFinite(b.percent)||b.percent<0||b.percent>100)fail('Процент: 0–100');await t`update school.attempts set percent=${b.percent},finished=true where id=${b.attempt} and account_id=${target.id}`}
   else fail('Неизвестное действие');await t`insert into school.audit(actor,action,target) values(${u.id},${b.operation},${target.id})`;return {ok:true}});
 }
 if(b.action==='start'){
  if(u.role!=='student')fail('Для учителя доступны свободные игры');
  return await sql.begin(async t=>{await t`select id from school.accounts where id=${u.id} for update`;const [hw]=await t`select * from school.homework where id=${b.homework} and class=${u.class} and active`;if(!hw)fail('Игра не назначена вашему классу');
   const [c]=await t`select data from school.catalog where work=${hw.work}`;const [old]=await t`select * from school.attempts where account_id=${u.id} and homework_id=${hw.id} and not finished order by created_at desc limit 1`;if(old){const s=old.state;if(!s.deadline){s.deadline=Date.now()+timerSeconds[hw.game]*1000;await t`update school.attempts set state=${t.json(s)} where id=${old.id}`;old.state=s}else if(Date.now()>=s.deadline){s.finished=true;s.timedOut=true;s.won=false;s.revision++;const p=gamePercent(s,c.data,hw.game);const [done]=await t`update school.attempts set state=${t.json(s)},finished=true,percent=${p} where id=${old.id} returning *`;return view(done,c.data,hw.game)}return view(old,c.data,hw.game)}
   const [{n}]=await t`select count(*)::int n from school.attempts where account_id=${u.id} and homework_id=${hw.id}`;if(n>=hw.attempts)fail('Попытки закончились');
   const g=hw.game,d=c.data,s={position:1,correct:0,wrong:0,index:0,revision:0,deadline:Date.now()+timerSeconds[g]*1000,order:[],pending:null,moves:[],solved:[],hint:false};if(g==='truth')s.order=shuffled(d.truthFacts.map((_,i)=>i)).slice(0,10);else if(g!=='crossword')s.order=shuffled(d[g+'Quiz'].map((_,i)=>i));if(g==='truth')prepare(s,d,g);
   const [a]=await t`insert into school.attempts(account_id,homework_id,state) values(${u.id},${hw.id},${t.json(s)}) returning *`;return view(a,d,g)});
 }
 if(b.action==='play')return await sql.begin(async t=>{
  const [a]=await t`select * from school.attempts where id=${b.id} and account_id=${u.id} for update`;if(!a)fail('Попытка не найдена');const [hw]=await t`select * from school.homework where id=${a.homework_id} and class=${u.class} and active`;if(!hw)fail('Доступ к домашке закрыт');const [{data:d}]=await t`select data from school.catalog where work=${hw.work}`;const g=hw.game,s=a.state;
  if(a.finished)return view(a,d,g);
  if(Date.now()>=s.deadline||b.operation==='timeout'){if(Date.now()<s.deadline)fail('Время ещё не вышло');if(g==='crossword'&&Array.isArray(b.words)&&b.words.length===d.crossword.length){s.words=b.words.map((w,i)=>s.solved.includes(i)?d.crossword[i].word:String(w||'').slice(0,100));s.statuses=d.crossword.map((w,i)=>s.words[i].trim().toUpperCase().replaceAll('Ё','Е')===w.word.replaceAll('Ё','Е'));s.statuses.forEach((ok,i)=>{if(!s.solved.includes(i)){if(ok){s.solved.push(i);s.correct++}else s.wrong++}})}s.finished=true;s.timedOut=true;s.won=false;s.moves=[];s.dice=null;s.revision++;const p=gamePercent(s,d,g);const [done]=await t`update school.attempts set state=${t.json(s)},finished=true,percent=${p} where id=${a.id} returning *`;return view(done,d,g)}
  if(b.revision!==s.revision)return view(a,d,g);
  s.moves=[];s.dice=null;let right=null;
  if(b.operation==='abandon'){s.finished=true;s.won=false;s.abandoned=true}
  else if(g==='crossword'){
   if(b.operation!=='check'||!Array.isArray(b.words)||b.words.length!==d.crossword.length)fail('Неверная проверка');
   s.words=b.words.map((w,i)=>s.solved.includes(i)?d.crossword[i].word:String(w||'').slice(0,100));
   s.statuses=d.crossword.map((w,i)=>s.words[i].trim().toUpperCase().replaceAll('Ё','Е')===w.word.replaceAll('Ё','Е'));
   s.statuses.forEach((ok,i)=>{if(!s.solved.includes(i)){if(ok){s.solved.push(i);s.correct++}else s.wrong++}});s.finished=s.solved.length===d.crossword.length;
  }else if(b.operation==='roll'&&g!=='truth'){
   if(s.pending!=null)fail('Сначала ответьте на вопрос');s.dice=rand(6)+1;const from=s.position;s.position=Math.min(31,from+s.dice);s.moves.push({from,to:s.position});land(s,d,g);if(s.finished)s.won=true;
  }else if(b.operation==='answer'){
   if(s.pending==null)fail('Нет ожидающего вопроса');const q=g==='truth'?d.truthFacts[s.pending]:d[g+'Quiz'][s.pending];if(g==='truth'&&typeof b.answer!=='boolean')fail('Выберите ответ');if(g!=='truth'&&!s.choices.includes(b.answer))fail('Выберите один из вариантов');right=b.answer===q[g==='truth'?1:2];right?s.correct++:s.wrong++;s.pending=null;s.index++;
   if(g==='truth'){if(s.index===10)s.finished=true;else prepare(s,d,g)}
   else if(!right){if(s.wrong>=(g==='expert'?5:g==='medium'?10:Infinity)){s.finished=true;s.won=false}else{const from=s.position;s.position=Math.max(1,from-2);s.moves.push({from,to:s.position});if([4,8,12,16,20,24,28].includes(s.position)){const f=s.position;s.position--;s.moves.push({from:f,to:s.position})}land(s,d,g)}}
  }else fail('Неизвестное действие');
  s.revision++;let percent=null;if(s.finished)percent=gamePercent(s,d,g)
  const [updated]=await t`update school.attempts set state=${t.json(s)},finished=${!!s.finished},percent=${percent} where id=${a.id} returning *`;return {...view(updated,d,g),right};
 });
 fail('Неизвестное действие');
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return new Response('{}',{status:405,headers});
 try{const raw=await req.text();if(raw.length>30000)fail('Запрос слишком большой');const b=JSON.parse(raw);const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');const result=await action(b,token,ip);return new Response(JSON.stringify(result),{headers})}
 catch(e){let error=e.message||'Ошибка';if(e.code==='23505')error='Ученик с таким именем уже зарегистрирован в этом классе';else if(e.code)error='Проверьте введённые данные';return new Response(JSON.stringify({error}),{status:400,headers})}
});
