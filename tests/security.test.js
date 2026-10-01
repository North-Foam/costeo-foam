import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
process.env.LOCAL_DATABASE=':memory:';
process.env.APP_ORIGIN='http://localhost:3199';
const { app }=await import('../server/app.js');
const { db }=await import('../server/db.js');
const { migrate }=await import('../scripts/migrate.js');
const { hashPassword }=await import('../server/security.js');
const defaults=(await import('../server/defaults.json',{with:{type:'json'}})).default;
const password=randomBytes(24).toString('base64url');
let database,server;const sessions={};const users={};
async function request(path,{method='GET',body,session,origin=process.env.APP_ORIGIN}={}){
 const response=await fetch(process.env.APP_ORIGIN+'/api/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{}),...(session?{Cookie:session}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie'),headers:response.headers};
}
before(async()=>{database=await db();await migrate(database);const hash=await hashPassword(password);
 for(const role of ['admin','captura','consulta']){const id=randomUUID();users[role]=id;await database.query('INSERT INTO users(id,email,name,role,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,false)',[id,role+'@example.test',role,role,hash]);}
 await new Promise(resolve=>{server=app.listen(3199,'localhost',resolve);});
 for(const role of Object.keys(users)){const r=await request('login',{method:'POST',body:{email:role+'@example.test',password}});assert.equal(r.status,200);sessions[role]=r.cookie.split(';')[0];}
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await database.close();});
test('authentication, cookies, origin, and server-enforced roles',async()=>{
 assert.equal((await request('state')).status,401);
 assert.equal((await request('state',{session:'nf_session='+'a'.repeat(64)})).status,401);
 assert.equal((await request('state',{method:'PUT',session:sessions.admin,origin:'https://attacker.test',body:{revision:0,state:defaults}})).status,403);
 assert.equal((await request('state',{method:'PUT',session:sessions.admin,origin:null,body:{revision:0,state:defaults}})).status,403);
 assert.equal((await request('state',{method:'PUT',session:sessions.consulta,body:{revision:0,state:defaults}})).status,403);
 assert.equal((await request('users',{session:sessions.captura})).status,403);
 const r=await request('login',{method:'POST',body:{email:'admin@example.test',password}});assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/SameSite=Strict/);
});
test('blank database and optimistic concurrency preserve the winning save',async()=>{
 const initial=await request('state',{session:sessions.admin});assert.equal(initial.body.state.inserts.length,0);assert.equal(initial.body.state.empleados.length,0);
 const a=structuredClone(initial.body.state);a.control.tcBase=20;
 const b=structuredClone(a);b.control.tcBase=25;
 const results=await Promise.all([request('state',{method:'PUT',session:sessions.admin,body:{revision:initial.body.revision,state:a}}),request('state',{method:'PUT',session:sessions.captura,body:{revision:initial.body.revision,state:b}})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const actual=await request('state',{session:sessions.consulta});assert.equal(actual.body.revision,initial.body.revision+1);
});
test('captura cannot delete, close, reopen, or modify closed periods',async()=>{
 let data=(await request('state',{session:sessions.admin})).body;data.state.periodos['2026-09']={items:{},estado:'cerrado'};
 assert.equal((await request('state',{method:'PUT',session:sessions.admin,body:{revision:data.revision,state:data.state}})).status,200);
 data=(await request('state',{session:sessions.admin})).body;
 for(const change of [s=>delete s.periodos['2026-09'],s=>s.periodos['2026-09'].estado=null,s=>s.periodos['2026-09'].items.TEST={inc:true,vol:3},s=>s.periodos['2026-10']={items:{},estado:'cerrado'}]){
  const state=structuredClone(data.state);change(state);assert.equal((await request('state',{method:'PUT',session:sessions.captura,body:{revision:data.revision,state}})).status,403);
 }
});
test('invalid state, prototype pollution, and markup are rejected',async()=>{
 const data=(await request('state',{session:sessions.admin})).body;
 for(const change of [s=>s.control.tcBase='bad',s=>s.clientes.push('<img src=x onerror=alert(1)>'),s=>s.inserts.push({id:'__proto__'}),s=>s.extra=true]){
  const state=structuredClone(data.state);change(state);assert.equal((await request('state',{method:'PUT',session:sessions.admin,body:{revision:data.revision,state}})).status,400);
 }
});
test('admin creates users; temporary password gates data; resets revoke sessions',async()=>{
 const email='new@example.test';const r=await request('users',{method:'POST',session:sessions.admin,body:{name:'Prueba',email,role:'captura',password}});assert.equal(r.status,201);assert.equal(r.body.user.mustChangePassword,true);assert.equal(r.body.user.password_hash,undefined);
 let login=await request('login',{method:'POST',body:{email,password}});let session=login.cookie.split(';')[0];assert.equal((await request('state',{session})).body.code,'PASSWORD_CHANGE_REQUIRED');
 const newPassword=randomBytes(24).toString('base64url');assert.equal((await request('password',{method:'POST',session,body:{currentPassword:password,newPassword}})).status,200);
 assert.equal((await request('state',{session})).status,401);
 login=await request('login',{method:'POST',body:{email,password:newPassword}});session=login.cookie.split(';')[0];assert.equal((await request('state',{session})).status,200);
 assert.equal((await request('users/'+r.body.user.id,{method:'PATCH',session:sessions.admin,body:{active:false}})).status,200);assert.equal((await request('state',{session})).status,401);
 assert.equal((await request('users/'+users.admin,{method:'PATCH',session:sessions.admin,body:{active:false}})).status,400);
 const audits=await request('audit',{session:sessions.admin});assert.equal(audits.status,200);assert.ok(audits.body.entries.some(e=>e.action==='user_created'));assert.ok(!JSON.stringify(audits.body).includes(password));
});
test('login attempts are rate limited in the shared database',async()=>{
 let result;for(let i=0;i<9;i++)result=await request('login',{method:'POST',body:{email:'unknown@example.test',password:'invalid password'}});assert.equal(result.status,429);
});
