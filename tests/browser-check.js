import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
process.env.LOCAL_DATABASE=':memory:';process.env.APP_ORIGIN='http://localhost:3200';
process.env.BMX_TOKEN='browser-test-token';
let banxicoCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{
 if(!String(url).startsWith('https://www.banxico.org.mx/SieAPIRest/'))return originalFetch(url,options);
 banxicoCalls++;
 assert.equal(options.headers['Bmx-Token'],process.env.BMX_TOKEN);
 return Promise.resolve(new Response(JSON.stringify({bmx:{series:[
  {idSerie:'SF43718',datos:[{dato:'17.4321',fecha:'30/09/2026'}]},
  {idSerie:'SF60653',datos:[{dato:'17.3210',fecha:'30/09/2026'}]}
 ]}}),{status:200,headers:{'Content-Type':'application/json'}}));
};
const {app}=await import('../server/app.js');const {db}=await import('../server/db.js');const {migrate}=await import('../scripts/migrate.js');const {hashPassword}=await import('../server/security.js');
const database=await db();await migrate(database);const password=randomBytes(24).toString('base64url');const hash=await hashPassword(password);
for(const role of ['admin','captura','consulta'])await database.query('INSERT INTO users(id,email,name,role,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,false)',[randomUUID(),role+'@example.test','Usuario de prueba',role,hash]);
const server=await new Promise(resolve=>{const s=app.listen(3200,'localhost',()=>resolve(s));});
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('test-results',{recursive:true});
 const temporaryPassword=randomBytes(24).toString('base64url');
const errors=[];const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function login(page,role){await page.goto(process.env.APP_ORIGIN);await page.locator('[name=email]').fill(role+'@example.test');await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.locator('#application').waitFor({state:'visible'});}
async function saved(){await page.waitForFunction(()=>document.getElementById('saveTxt').textContent==='Guardado en la base compartida');}
async function waitForState(predicate){for(let i=0;i<100;i++){const {state}=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));if(predicate(state))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Shared state did not reach the expected value');}
try{
 await page.goto(process.env.APP_ORIGIN);await page.getByRole('heading',{name:'Costeo integral'}).waitFor();await page.screenshot({path:'test-results/login-desktop.png'});
 await login(page,'admin');console.log('Login verified');
 assert.equal(banxicoCalls,0,'Auto update is off by default');
 await page.locator('[data-click="go(\'control\')"]').click();
 await page.locator('[data-path="control.tcAuto"]').selectOption('true');
 await waitForState(state=>state.control.tcAuto===true);
 await page.reload();
 await waitForState(state=>state.control.tcBase===17.4321&&state.control.tcFecha==='30/09/2026');
 assert.equal(banxicoCalls,1,'The enabled option fetches FIX once on login');
 await page.locator('[data-click="go(\'control\')"]').click();
 await page.locator('[data-path="control.tcAuto"]').selectOption('false');
 await waitForState(state=>state.control.tcAuto===false);
 console.log('Automatic Banxico update and opt-out verified');
 for(const section of await page.evaluate(()=>NF_MODEL.sections)){await page.locator(`[data-click="go('${section.id}')"]`).click();await page.locator('#content').waitFor({state:'visible'});}
 assert.deepEqual(errors,[]);console.log('All empty-state screens verified');
 await page.locator('[data-click="go(\'placas\')"]').click();await page.locator('#newInsId').fill('NUEVO-1');await page.locator('[data-click="addNamedInsert()"]').click();await saved();
 await page.locator('[data-click="go(\'mano\')"]').click();await page.locator('[data-click="addEmp()"]').click();await saved();
 await page.locator('[data-path="empleados.0.sueldo"]').fill('1000');await page.locator('[data-path="empleados.0.sueldo"]').press('Tab');await saved();
 await page.locator('[data-click="go(\'indirectos\')"]').click();await page.locator('[data-click="addInd()"]').click();await saved();
 await page.locator('[data-click="go(\'energia\')"]').click();await page.locator('[data-click="addCarga()"]').click();await saved();
 await page.locator('[data-click="go(\'placas\')"]').click();await page.locator('[data-click="addMaterial()"]').click();await saved();
 await page.locator('[data-click^="addPieza("]').click();await saved();
 await page.locator('[data-click="go(\'dashboard\')"]').click();await page.screenshot({path:'test-results/dashboard-desktop.png'});console.log('Data entry and server persistence verified');
 const reloaded=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(reloaded.state.empleados[0].sueldo,1000);assert.equal(reloaded.state.inserts.length,1);
 const xlsxDownload=page.waitForEvent('download');await page.locator('[data-click="exportExcel()"]').click();const xlsx=await xlsxDownload;await xlsx.saveAs('test-results/export.xlsx');
 const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile('test-results/export.xlsx');assert.ok(workbook.worksheets.length>=6);
 const pdfDownload=page.waitForEvent('download');await page.locator('[data-click="exportPDF()"]').click();const pdf=await pdfDownload;await pdf.saveAs('test-results/export.pdf');assert.equal((await readFile('test-results/export.pdf')).subarray(0,4).toString(),'%PDF');console.log('Excel and PDF export verified');
 await page.locator('[data-click="abrirAcceso()"]').click();await page.getByRole('button',{name:'Administrar usuarios'}).click();await page.locator('#create-user [name=nfName]').fill('Nueva cuenta de prueba');await page.locator('#create-user [name=email]').fill('new-ui@example.test');await page.locator('#create-user [name=password]').fill(temporaryPassword);await page.getByRole('button',{name:'Crear usuario',exact:true}).click();await page.getByText('new-ui@example.test',{exact:false}).waitFor();await page.screenshot({path:'test-results/users-desktop.png'});console.log('User management UI verified');
 const viewerContext=await browser.newContext();const viewer=await viewerContext.newPage();viewer.on('pageerror',e=>errors.push(e.message));await login(viewer,'consulta');
 await viewer.locator('[data-click="go(\'placas\')"]').click();assert.equal(await viewer.locator('[data-click="addNamedInsert()"]').first().isDisabled(),true);const denied=await viewer.evaluate(async()=>{const d=await fetch('/api/state').then(r=>r.json());return (await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:d.revision,state:d.state})})).status;});assert.equal(denied,403);console.log('Read-only UI and direct API denial verified');

 await page.getByText('Nueva cuenta de prueba',{exact:true}).locator('..').locator('..').getByRole('button',{name:'Editar'}).click();
 await page.locator('#edit-user [name=nfRole]').selectOption('captura');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('new-ui@example.test · captura',{exact:false}).waitFor();console.log('Role update UI verified');
 const tempContext=await browser.newContext();const tempPage=await tempContext.newPage();tempPage.on('pageerror',e=>errors.push(e.message));
 await tempPage.goto(process.env.APP_ORIGIN);await tempPage.locator('[name=email]').fill('new-ui@example.test');await tempPage.locator('[name=password]').fill(temporaryPassword);await tempPage.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await tempPage.getByRole('heading',{name:'Protege tu cuenta'}).waitFor();
 const changedPassword=randomBytes(24).toString('base64url');await tempPage.locator('[name=currentPassword]').fill(temporaryPassword);await tempPage.locator('[name=newPassword]').fill(changedPassword);await tempPage.locator('[name=confirm]').fill(changedPassword);await tempPage.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();await tempPage.getByRole('heading',{name:'Costeo integral'}).waitFor();
 await tempPage.locator('[name=email]').fill('new-ui@example.test');await tempPage.locator('[name=password]').fill(changedPassword);await tempPage.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await tempPage.locator('#application').waitFor({state:'visible'});console.log('First-login password change UI verified');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await database.query('UPDATE workspace SET revision=revision+1 WHERE id=1');
 await page.locator('[data-click="go(\'mano\')"]').click();await page.locator('[data-path="empleados.0.sueldo"]').fill('2000');await page.locator('[data-path="empleados.0.sueldo"]').press('Tab');
 await page.locator('.nf-warning').waitFor({state:'visible'});assert.match(await page.locator('.nf-warning').innerText(),/Otra persona guardó cambios/);
 assert.equal((await database.query('SELECT state FROM workspace WHERE id=1')).rows[0].state.empleados[0].sueldo,1000);
 const backupDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar cambios pendientes',exact:true}).click();await (await backupDownload).saveAs('test-results/pending.json');assert.equal(JSON.parse(await readFile('test-results/pending.json','utf8')).empleados[0].sueldo,2000);console.log('Conflict warning and recovery backup verified');
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true});await mobile.goto(process.env.APP_ORIGIN);await mobile.getByRole('heading',{name:'Costeo integral'}).waitFor();await mobile.screenshot({path:'test-results/login-mobile.png'});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('BROWSER_CHECK_PASS');
}catch(error){await page.screenshot({path:'test-results/failure.png'});console.error('Page errors:',errors);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await database.close();}
