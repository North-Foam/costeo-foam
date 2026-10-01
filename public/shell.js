'use strict';
// Sanitize every HTML rendering sink in the legacy view. All executable handlers
// are replaced by declarative actions and a strict dispatcher; CSP forbids inline JS.
const htmlDescriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
Object.defineProperty(Element.prototype,'innerHTML',{...htmlDescriptor,set(value){
  const clean=DOMPurify.sanitize(String(value),{ADD_ATTR:['data-click','data-change','data-enter'],FORBID_TAGS:['script','iframe','object','embed','style'],FORBID_ATTR:['srcdoc']});
  htmlDescriptor.set.call(this,clean);
}});
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Compatibility adapter: exports the original workbook rows through ExcelJS.
window.XLSX={utils:{book_new:()=>({sheets:[]}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(wb,sheet,name)=>wb.sheets.push({sheet,name})},write:async wb=>{
  const excel=new ExcelJS.Workbook();excel.creator='North Foam';
  for(const {sheet,name} of wb.sheets){const ws=excel.addWorksheet(name);ws.addRows(sheet.rows);if(sheet['!freeze'])ws.views=[{state:'frozen',...sheet['!freeze']}];ws.getRow(1).font={bold:true};ws.columns.forEach(c=>c.width=24);}
  return excel.xlsx.writeBuffer();
}};
window.NF=(()=>{
 let user=null,revision=0,pending=null,saving=false,timer=null,blocked=false,lastSaved='',message='Sin cambios pendientes';
 const root=()=>document.getElementById('auth-root');
 const view=()=>document.getElementById('application');
 async function api(path,method='GET',data){
  const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store'});
  const body=await response.json();if(!response.ok){const e=new Error(body.error||'No se pudo completar la operación.');e.status=response.status;e.code=body.code;throw e;}return body;
 }
 function formData(form){return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k==='nfName'?'name':k==='nfRole'?'role':k,v]));}
 function login(error=''){
  user=null;view().hidden=true;root().hidden=false;
  root().innerHTML=`<main class="auth-wrap"><section class="auth-card"><div class="auth-brand">NORTH FOAM</div><h1>Costeo integral</h1><p>Accede al sistema financiero con tu cuenta de trabajo.</p><form id="login-form" class="nf-form"><label>Correo electrónico<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button>Iniciar sesión</button><p class="nf-error" role="alert">${escapeText(error)}</p></form><p class="nf-footer">Acceso exclusivo para usuarios autorizados.<br>Si necesitas una cuenta o recuperar tu acceso, contacta al administrador.</p></section></main>`;
  bindForm(document.getElementById('login-form'),async data=>{const result=await api('login','POST',data);user=result.user;if(user.mustChangePassword)passwordScreen();else await load();});
 }
 function bindForm(form,fn){form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button[type=submit],button:not([type])');const output=form.querySelector('.nf-error');if(button)button.disabled=true;if(output)output.textContent='';try{await fn(formData(form));}catch(error){if(output)output.textContent=error.message;}finally{if(button)button.disabled=false;}});}
 function passwordScreen(){
  view().hidden=true;root().hidden=false;root().innerHTML=`<main class="auth-wrap"><section class="auth-card"><div class="auth-brand">NORTH FOAM</div><h1>Protege tu cuenta</h1><p>Cambia tu contraseña temporal antes de acceder.</p>${passwordForm()}<button id="exit-password" class="nf-button nf-secondary">Volver al acceso</button></section></main>`;
  bindPassword(document.getElementById('password-form'));document.getElementById('exit-password').onclick=logout;
 }
 function passwordForm(){return `<form id="password-form" class="nf-form"><label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>Nueva contraseña<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Repite la nueva contraseña<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="nf-message">Usa al menos 12 caracteres. Puedes usar una frase larga.</p><button>Cambiar contraseña</button><p class="nf-error" role="alert"></p></form>`;}
 function bindPassword(form){bindForm(form,async data=>{if(data.newPassword!==data.confirm)throw new Error('Las contraseñas no coinciden.');delete data.confirm;await api('password','POST',data);document.querySelector('.nf-account')?.remove();pending=null;blocked=false;login('Contraseña actualizada. Inicia sesión con la nueva contraseña.');});}
 async function load(){
  const result=await api('state');revision=result.revision;pending=null;blocked=false;lastSaved=JSON.stringify(result.state);message='Sin cambios pendientes';
  root().hidden=true;view().hidden=false;window.NF_MODEL.load(result.state,user.role);lastSaved=JSON.stringify(window.NF_MODEL.read());showSaveStatus();document.querySelector('.nf-warning')?.remove();
  applyPermissions();
  // Refresh the selected official exchange rate after loading shared state.
  // The model skips this for read-only users or when automatic updates are off.
  void window.NF_MODEL.refreshTC();
 }
 async function start(){try{const result=await api('me');user=result.user;if(user.mustChangePassword)passwordScreen();else await load();}catch(error){login(error.status===401?'':error.message);}}
 function showSaveStatus(){const t=document.getElementById('saveTxt'),d=document.getElementById('dot');if(t)t.textContent=message;if(d)d.style.background=blocked?'#a66b16':(saving||pending?'#ba912e':'#238565');}
 function queueSave(state){
  if(!user||user.role==='consulta')return;
  pending=JSON.parse(JSON.stringify(state));if(JSON.stringify(pending)===lastSaved){pending=null;return;}
  message=blocked?'Cambios pendientes: revisa el aviso':'Guardando…';showSaveStatus();clearTimeout(timer);if(!blocked)timer=setTimeout(flush,450);
 }
 async function flush(){
  if(saving||!pending||blocked)return;const snapshot=pending;pending=null;saving=true;
  try{const result=await api('state','PUT',{revision,state:snapshot});revision=result.revision;lastSaved=JSON.stringify(snapshot);message='Guardado en la base compartida';}
  catch(error){pending=pending||snapshot;blocked=true;message='Cambios sin guardar';warn(error);}
  finally{saving=false;showSaveStatus();if(pending&&!blocked)flush();}
 }
 function downloadPending(){const blob=new Blob([JSON.stringify(pending||window.NF_MODEL.read(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='NorthFoam-cambios-pendientes.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 function warn(error){
  document.querySelector('.nf-warning')?.remove();const box=document.createElement('div');box.className='nf-warning';box.setAttribute('role','alert');
  box.innerHTML=`<strong>No se han guardado tus últimos cambios.</strong><div>${escapeText(error.message)}</div><button class="nf-button" data-backup>Descargar cambios pendientes</button><button class="nf-button nf-secondary" data-reload>Recargar datos compartidos</button>${![401,403,409,400].includes(error.status)?'<button class="nf-button" data-retry>Reintentar</button>':''}`;
  box.querySelector('[data-backup]').onclick=downloadPending;
  box.querySelector('[data-reload]').onclick=()=>{if(confirm('Los cambios pendientes se descartarán. Descarga un respaldo antes si necesitas conservarlos.'))location.reload();};
  if(box.querySelector('[data-retry]'))box.querySelector('[data-retry]').onclick=()=>{blocked=false;box.remove();flush();};document.body.appendChild(box);
 }
 async function logout(){
  if(pending||saving){alert('Tienes cambios pendientes. Espera el guardado o descarga un respaldo antes de salir.');return;}
  try{await api('logout','POST',{});document.querySelector('.nf-account')?.remove();window.NF_MODEL.load(window.NF_MODEL.defaults,'consulta');login();}catch(error){alert(error.message);}
 }
 const readActions=new Set(['go','setCliFiltro','setCliRuta','setCliVista','setCliDiagrama','setDiseno','setDiagrama','setRutaFilter','setSensMetric','setPeriodoVista','setPresuPeriodo','setPeriodo','exportExcel','exportPDF','exportJSON','abrirAcceso']);
 const adminActions=new Set(['reset','importJSON','importPicker','mesCerrar','mesBorrar']);
 function permitted(name){return !!user&&(!adminActions.has(name)||user.role==='admin')&&(user.role!=='consulta'||readActions.has(name));}
 function applyPermissions(){
  document.querySelectorAll('#application [data-click],#application [data-change],#application [data-enter]').forEach(el=>{const raw=el.dataset.click||el.dataset.change||el.dataset.enter;const name=raw.split('(')[0];if(!permitted(name))el.disabled=true;});
  if(user?.role==='consulta')document.querySelectorAll('#application [data-path],#application [data-per],#application [data-ind],#application [data-ov],#application [data-mes],#application [data-insid],#application [data-frac]').forEach(el=>el.disabled=true);
 }
 function parseArgs(raw,el,event){
  if(!raw.trim())return [];const tokens=raw.match(/'[^']*'|"[^"]*"|[^,]+/g)||[];
  return tokens.map(t=>{t=t.trim();if(t==='this.value')return el.value;if(t==='event')return event;if(t==='true')return true;if(t==='false')return false;if(/^-?\d+(\.\d+)?$/.test(t))return Number(t);if(/^'[^']*'$|^"[^"]*"$/.test(t))return t.slice(1,-1);throw new Error('Acción inválida.');});
 }
 for(const type of ['click','change','keydown'])document.addEventListener(type,event=>{
  const attr=type==='keydown'?'data-enter':'data-'+type;const el=event.target.closest('['+attr+']');if(!el||!view().contains(el))return;if(type==='keydown'&&event.key!=='Enter')return;
  const raw=el.getAttribute(attr);const match=raw.match(/^(\w+)\((.*)\)$/);if(!match)return;const name=match[1];if(!permitted(name)){event.preventDefault();event.stopImmediatePropagation();return;}if(type==='keydown')event.preventDefault();
  if(name==='importPicker'){document.getElementById('imp').click();return;}
  if(!Object.hasOwn(window.app,name)||typeof window.app[name]!=='function')return;
  try{const result=window.app[name](...parseArgs(match[2],el,event));if(result?.catch)result.catch(e=>alert(e.message));applyPermissions();}catch(error){alert(error.message);}
 },true);
 // Stop legacy change listeners before they mutate local data for read-only users.
 document.addEventListener('change',event=>{if(user?.role==='consulta'&&view().contains(event.target)&&!event.target.hasAttribute('data-change')){event.preventDefault();event.stopImmediatePropagation();}},true);
 window.addEventListener('beforeunload',event=>{if(pending||saving){event.preventDefault();event.returnValue='';}});
 function accountPanel(title){document.querySelector('.nf-account')?.remove();const overlay=document.createElement('div');overlay.className='nf-account';overlay.innerHTML=`<section class="nf-panel" role="dialog" aria-modal="true" aria-label="${escapeText(title)}"><button class="nf-button nf-secondary" style="float:right" id="close-account">Cerrar</button><h2>${escapeText(title)}</h2><div id="account-content"></div></section>`;document.body.appendChild(overlay);overlay.querySelector('#close-account').onclick=()=>overlay.remove();return overlay.querySelector('#account-content');}
 function openAccount(){const area=accountPanel('Mi cuenta');area.innerHTML=`<p>${escapeText(user.name)} · ${escapeText(user.email)}</p><p class="nf-message">Perfil: ${escapeText({admin:'Administrador',captura:'Captura',consulta:'Consulta'}[user.role])}</p><div class="nf-actions">${user.role==='admin'?'<button class="nf-button" id="manage-users">Administrar usuarios</button><button class="nf-button nf-secondary" id="view-audit">Actividad reciente</button>':''}<button class="nf-button nf-secondary" id="logout">Cerrar sesión</button></div><h3>Cambiar mi contraseña</h3>${passwordForm()}`;bindPassword(document.getElementById('password-form'));document.getElementById('logout').onclick=logout;if(user.role==='admin'){document.getElementById('manage-users').onclick=()=>manageUsers().catch(e=>alert(e.message));document.getElementById('view-audit').onclick=()=>viewAudit().catch(e=>alert(e.message));}}
 async function manageUsers(){const data=await api('users');const area=accountPanel('Usuarios y permisos');area.innerHTML=`<p>Las cuentas nuevas deberán cambiar su contraseña temporal al ingresar.</p><form id="create-user" class="nf-form"><label>Nombre<input name="nfName" required maxlength="100"></label><label>Correo<input name="email" type="email" required></label><label>Perfil<select name="nfRole"><option value="consulta">Consulta</option><option value="captura">Captura</option><option value="admin">Administrador</option></select></label><label>Contraseña temporal<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button>Crear usuario</button><p class="nf-error" role="alert"></p></form><h3>Usuarios registrados</h3><div id="user-list"></div>`;
  bindForm(document.getElementById('create-user'),async input=>{await api('users','POST',input);await manageUsers();});
  const list=area.querySelector('#user-list');for(const u of data.users){const row=document.createElement('div');row.className='nf-user';row.innerHTML=`<div><strong>${escapeText(u.name)}</strong><small>${escapeText(u.email)} · ${escapeText(u.role)} · ${u.active?'Activo':'Desactivado'}${u.mustChangePassword?' · Contraseña temporal':''}</small></div><button class="nf-button nf-secondary">Editar</button>`;row.querySelector('button').onclick=()=>editUser(u);list.appendChild(row);}
 }
 function editUser(u){const area=accountPanel('Editar usuario');area.innerHTML=`<p>${escapeText(u.email)}</p><form id="edit-user" class="nf-form"><label>Nombre<input name="nfName" value="${escapeText(u.name)}" required maxlength="100"></label><label>Perfil<select name="nfRole">${['consulta','captura','admin'].map(r=>`<option value="${r}" ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></label><label>Estado<select name="active"><option value="true" ${u.active?'selected':''}>Activo</option><option value="false" ${!u.active?'selected':''}>Desactivado</option></select></label><label>Nueva contraseña temporal (opcional)<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label><p class="nf-message wide">Guardar estos cambios cerrará las sesiones de este usuario.</p><button>Guardar cambios</button><p class="nf-error" role="alert"></p></form>`;bindForm(document.getElementById('edit-user'),async data=>{data.active=data.active==='true';if(!data.password)delete data.password;await api('users/'+u.id,'PATCH',data);if(u.id===user.id){document.querySelector('.nf-account').remove();login('Tu cuenta se actualizó. Inicia sesión nuevamente.');}else await manageUsers();});}
 async function viewAudit(){const data=await api('audit');const area=accountPanel('Actividad reciente');const labels={login:'Inicio de sesión',state_saved:'Guardado de datos',user_created:'Usuario creado',user_updated:'Usuario actualizado',password_changed:'Contraseña cambiada'};area.innerHTML='<p>Últimos 100 eventos. Las contraseñas no se registran.</p>'+data.entries.map(e=>`<div class="nf-audit"><strong>${escapeText(labels[e.action]||e.action)}</strong> · ${escapeText(e.actor||'Sistema')} · ${escapeText(new Date(e.created_at).toLocaleString('es-MX'))}${e.details.revision?' · Versión '+Number(e.details.revision):''}</div>`).join('');}
 async function importState(state){if(user?.role!=='admin')return;if(pending||saving){alert('Espera a que termine el guardado actual.');return;}if(!confirm('¿Reemplazar los datos compartidos con este respaldo?'))return;try{const result=await api('state','PUT',{revision,state});revision=result.revision;await load();}catch(error){alert(error.message);}}
 return {start,queueSave,showSaveStatus,openAccount,importState,applyPermissions};
})();
