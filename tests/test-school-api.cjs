const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const endpoint='https://qnhkmasocibvqcedcevm.supabase.co/functions/v1/school-api';
// curl uses the environment's configured network transport. Never log session tokens.
function call(action,data={},token=''){return JSON.parse(execFileSync('curl',['--max-time','45','-sS',endpoint,'-H','Content-Type: application/json',...(token?['-H','Authorization: Bearer '+token]:[]),'-d',JSON.stringify({action,...data})],{encoding:'utf8'}))}
const must=x=>{assert(!x.error,x.error);return x};
const teacher=must(call('login',{staff:true,password:process.env.SCHOOL_TEST_TEACHER}));
const admin=must(call('login',{staff:true,password:process.env.SCHOOL_TEST_ADMIN}));
assert.equal(teacher.user.role,'teacher');assert.equal(admin.user.role,'admin');
console.log('Staff sign-in: PASS');
const student=must(call('register',{surname:'Проверочный',first:'Тест',class:'7А',password:'test-only-7aa'}));
console.log('Test account:',student.user.id);
try{
 const st=student.token,tt=teacher.token;
 assert(call('questions',{work:'igor'},st).error);assert(call('assign',{class:'7А',work:'igor',game:'truth',attempts:1},st).error);
 assert(call('admin',{id:student.user.id,operation:'edit',name:'Тест Тест',class:'7А'},tt).error);
 assert(call('start',{homework:'00000000-0000-0000-0000-000000000000'},st).error);
 console.log('Role and assignment denial: PASS');
 const catalog=must(call('questions',{work:'igor'},tt));
 for(const game of ['truth','easy','crossword'])must(call('assign',{class:'7А',work:'igor',game,attempts:1},tt));
 const dashboard=must(call('dashboard',{},st));
 const hw=g=>dashboard.homework.find(h=>h.game===g);
 let a=must(call('start',{homework:hw('truth').id},st));const id=a.id;
 assert.equal(must(call('start',{homework:hw('truth').id},st)).id,id);
 const first=must(call('play',{id,revision:0,operation:'answer',answer:catalog.truthFacts.find(q=>q[0]===a.question.text)[1]},st));
 const duplicate=must(call('play',{id,revision:0,operation:'answer',answer:false},st));assert.equal(first.revision,duplicate.revision);assert.equal(first.correct,duplicate.correct);a=first;
 while(!a.finished){const fact=catalog.truthFacts.find(q=>q[0]===a.question.text);a=must(call('play',{id,revision:a.revision,operation:'answer',answer:a.index===9?!fact[1]:fact[1]},st))}
 assert.equal(Number(a.percent),90);assert.equal(a.wrong,1);assert(call('start',{homework:hw('truth').id},st).error);
 console.log('Truth score, resume, idempotency, attempt limit: PASS');
 let c=must(call('start',{homework:hw('crossword').id},st));c=must(call('play',{id:c.id,revision:c.revision,operation:'check',words:catalog.crossword.map(()=>'' )},st));assert.equal(c.wrong,10);
 c=must(call('play',{id:c.id,revision:c.revision,operation:'check',words:catalog.crossword.map(w=>w.word)},st));assert.equal(Number(c.percent),50);assert(c.finished);
 console.log('Crossword mistakes retained: PASS');
 let b=must(call('start',{homework:hw('easy').id},st));let n=0;
 while(!b.finished&&n++<120){if(b.question){const q=catalog.easyQuiz.find(q=>q[0]===b.question.text);b=must(call('play',{id:b.id,revision:b.revision,operation:'answer',answer:q[2]},st))}else b=must(call('play',{id:b.id,revision:b.revision,operation:'roll'},st))}
 assert(b.finished&&b.won);assert.equal(Number(b.percent),100);console.log('Board full game: PASS');
 assert(call('play',{id,revision:0,operation:'answer',answer:true},tt).error);
 console.log('Cross-account attempt access denied: PASS');
}finally{
 must(call('admin',{id:student.user.id,operation:'delete'},admin.token));
 must(call('logout',{},teacher.token));must(call('logout',{},admin.token));
 console.log('Temporary test student removed');
}
