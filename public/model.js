
"use strict";
/* ===================== DATOS BASE (fieles al Excel v2) ===================== */
const CENTROS=["Corte/Pegado/Ensamble","Empaque y Almacén / Manejo","Administración"];
const CENTRO_PROD="Corte/Pegado/Ensamble";
const PROCESOS=["Corte/Pegado/Ensamble"];
const ABREV={"Corte/Pegado/Ensamble":"Corte/Peg./Ens.","Empaque y Almacén / Manejo":"Empaque/Almacén","Administración":"Admin."};
function abrev(t){ t=String(t||""); return ABREV[t]||t; }
const TIPOS=["Directa","Administrativa","Comercial"];
const PERIOD=["Semanal","Mensual"];
const CLASES=["Directo","Indirecto variable","Indirecto fijo","Administrativo","Comercial","Logístico","Financiero"];
const COMPONENTES=["Tapa / Base","Tapa","Base","Frente / Atrás","Lateral","Divisor","Refuerzo","Inserto interno","Placa suajada","Extra"];
const TC_OFICIAL=0, TC_OFICIAL_FECHA="Sin configurar";

const DEFAULTS={"control":{"escenario":"Base","tcBase":null,"margenObj":0,"vigenciaMeses":0,"tcFecha":null,"tcAuto":false,"tcSerie":"fix"},"escenarios":{"tc":{"Base":1,"Conservador":1,"Estrés":1},"materiales":{"Base":1,"Conservador":1,"Estrés":1},"rendimiento":{"Base":1,"Conservador":1,"Estrés":1},"merma":{"Base":1,"Conservador":1,"Estrés":1},"volumen":{"Base":1,"Conservador":1,"Estrés":1},"utilizacion":{"Base":1,"Conservador":1,"Estrés":1},"energia":{"Base":1,"Conservador":1,"Estrés":1},"nomina":{"Base":1,"Conservador":1,"Estrés":1},"flete":{"Base":1,"Conservador":1,"Estrés":1},"tiempoCiclo":{"Base":1,"Conservador":1,"Estrés":1},"tiempoPrep":{"Base":1,"Conservador":1,"Estrés":1},"retrabajo":{"Base":1,"Conservador":1,"Estrés":1},"rechazo":{"Base":1,"Conservador":1,"Estrés":1},"mantenimiento":{"Base":1,"Conservador":1,"Estrés":1},"consumibles":{"Base":1,"Conservador":1,"Estrés":1},"garantias":{"Base":1,"Conservador":1,"Estrés":1},"precioVenta":{"Base":1,"Conservador":1,"Estrés":1},"financiero":{"Base":1,"Conservador":1,"Estrés":1},"deltaMargen":{"Base":0,"Conservador":0,"Estrés":0}},"capacidad":{"dias":null,"turnos":null,"horas":null,"comida":null,"festivos":null,"vacaciones":null,"ausentismo":null,"mantenimiento":null,"setups":null,"paros":null,"horasUsadas":null},"moParams":{"isn":null,"infonavit":null,"imss":null,"aguinaldoDias":null,"vacDias":null,"primaVac":null,"otros":null,"semanas":4.333333333333333},"empleados":[],"maquinaria":[],"indirectos":[],"energia":{"precio":null,"cargoFijo":null,"demandaKW":0,"cargoDemanda":0,"reciboReal":null,"cargas":[]},"financiero":{"activar":true,"diasInv":0,"diasCliente":0,"diasProveedor":0,"tasaAnual":0,"comision":0,"difCambiario":0,"reservaFX":0},"inserts":[],"catalogo":[],"perInsert":{},"presupuesto":{"otrosFijos":0,"meta":null},"periodos":{},"periodoActivo":null,"periodoVista":"catalogo","clientes":[],"ruta":[]};
/* ===================== ESTADO ===================== */
const KEY="northfoam_costeo_v2";
let S=load();
ensureEscenarios();
migrateCentros();
ensureClientes();
sortInserts();
function clone(o){return JSON.parse(JSON.stringify(o))}
function load(){return clone(DEFAULTS);}
function save(){ NF.queueSave(S); }
let savedTimer;
function flashSaved(){
  const t=document.getElementById('saveTxt'),d=document.getElementById('dot');
  t.textContent="Guardado"; d.style.background="var(--green)";
  clearTimeout(savedTimer);
}
function touched(){
  const t=document.getElementById('saveTxt'),d=document.getElementById('dot');
  t.textContent="Guardando…"; d.style.background="var(--amber)";
}

/* ===================== MOTOR DE CÁLCULO (espejo del libro) ===================== */
function num(x){const v=parseFloat(x); return isFinite(v)?v:0;}
let __escOverride=null;
function esc(){return __escOverride||S.control.escenario;}
function computeFor(scn){const p=__escOverride;__escOverride=scn;const R=compute();__escOverride=p;return R;}
function f(lever){
  const L=S.escenarios[lever]; if(!L) return lever==="deltaMargen"?0:1;
  const v=L[esc()]; if(v==null||v==="") return lever==="deltaMargen"?0:1;
  return num(v);
}
function ensureEscenarios(){
  if(!S.escenarios) S.escenarios={};
  for(const k in DEFAULTS.escenarios){ if(!S.escenarios[k]) S.escenarios[k]=clone(DEFAULTS.escenarios[k]); }
  // Siempre se trabaja con el escenario Base (las palancas por escenario se retiraron)
  if(S.control) S.control.escenario="Base";
  const dm=S.escenarios.deltaMargen;
  if(dm && dm.Base!=null && dm.Base!=="" && num(dm.Base)!==0 && S.control){
    S.control.margenObj=num(S.control.margenObj)+num(dm.Base); dm.Base=0;
  }
}

/* --- Costeo de placas por inserto --- */
function esBloqueMat(nombre){ return /\bBUN\b/i.test(String(nombre||"")); }
function catFind(nombre){return (S.catalogo||[]).find(m=>m.nombre===nombre);}
function ensureDiseno(ins){
  if(!ins.diseno) ins.diseno={materiales:[{},{},{}],piezas:[]};
  if(!ins.diseno.materiales) ins.diseno.materiales=[{},{},{}];
  while(ins.diseno.materiales.length<3) ins.diseno.materiales.push({});
  if(!ins.diseno.piezas) ins.diseno.piezas=[];
  return ins.diseno;
}
function matEff(slot){
  slot=slot||{}; const c=catFind(slot.nombre)||{};
  const pick=(v,cv)=>(v!=null&&v!=="")?num(v):(cv!=null?num(cv):0);
  return {nombre:slot.nombre||"",precio:pick(slot.precio,c.costo),largo:pick(slot.largo,c.largo),
          ancho:pick(slot.ancho,c.ancho),grosor:pick(slot.grosor,c.grosor),
          bloque:esBloqueMat(slot.nombre)};
}
function disenoCalc(ins){
  const d=ins.diseno; if(!d||!d.piezas||!d.piezas.length) return null;
  const mats=(d.materiales||[]).map(matEff);
  const piezas=d.piezas.map(p=>{
    const M=mats[(num(p.mat)||1)-1]||{precio:0,largo:0,ancho:0};
    const m1=num(p.m1),m2=num(p.m2);
    const o1=(m1>0&&m2>0&&M.largo>0&&M.ancho>0)?Math.floor(M.largo/m1)*Math.floor(M.ancho/m2):0;
    const o2=(m1>0&&m2>0&&M.largo>0&&M.ancho>0)?Math.floor(M.largo/m2)*Math.floor(M.ancho/m1):0;
    const pppArea=Math.max(o1,o2);
    const esBloque=!!M.bloque;
    const gPieza=num(p.grosor);
    const capas=(esBloque&&gPieza>0&&num(M.grosor)>0)?Math.floor(num(M.grosor)/gPieza):1;
    const pppAuto=pppArea*Math.max(1,capas);
    const ppp=(p.piezasManual!=null&&p.piezasManual!=="")?num(p.piezasManual):pppAuto;
    // Placa suajada: un suaje por pieza → total de suajes = cantidad por inserto
    const esSuaje=(p.comp==="Placa suajada");
    const areaBruta=m1*m2;
    const recArea=esSuaje?Math.min(areaBruta, num(p.s1)*num(p.s2)):0;
    const areaNeta=Math.max(0,areaBruta-recArea);
    const factorRec=(areaBruta>0)?(areaNeta/areaBruta):1;
    const costoBruto=ppp>0?M.precio/ppp:0;
    const costoUnit=costoBruto*factorRec;
    const cant=num(p.cant);
    const areaPl=M.largo*M.ancho;
    const aprov=(areaPl>0)?(ppp*areaBruta)/areaPl:0;
    return {...p,o1,o2,ppp,pppArea,esBloque,capas,orient:(o2>o1?"Orient. 2":"Orient. 1"),costoBruto,costoUnit,
            costoInserto:costoUnit*cant,aprov,esSuaje,areaBruta,recArea,areaNeta,factorRec,
            recPct:(areaBruta>0?recArea/areaBruta:0)};
  });
  return {mats,piezas,totalUSD:piezas.reduce((a,p)=>a+p.costoInserto,0)};
}

function compute(){
  const R={};
  // TC
  R.factorTC=f("tc"); R.tc=num(S.control.tcBase)*R.factorTC;
  // Capacidad
  const cap=S.capacidad;
  const capv=c=>valPeriodo("capacidad",c,cap[c]);
  R.capTeorica=num(capv("dias"))*num(capv("turnos"))*num(capv("horas"));
  R.capBase=(num(capv("dias"))-num(capv("festivos"))-num(capv("vacaciones")))*num(capv("turnos"))*(num(capv("horas"))-num(capv("comida")));
  R.capPractica=Math.max(0, R.capBase*(1-num(capv("ausentismo")))-num(capv("mantenimiento"))-num(capv("setups"))-num(capv("paros")));
  const hu=capv("horasUsadas");
  R.horasUsadas = (hu==null||hu==="")?null:num(hu)*f("utilizacion");
  R.ociosa = R.horasUsadas==null?null:(R.capPractica-R.horasUsadas);
  R.utilPct = (R.horasUsadas==null||R.capPractica<=0)?null:R.horasUsadas/R.capPractica;
  // Mano de obra
  const p=S.moParams;
  R.provAgui=num(p.aguinaldoDias)/365; R.provVac=(num(p.vacDias)*num(p.primaVac))/365;
  R.cargaTotal=num(p.isn)+num(p.infonavit)+num(p.imss)+R.provAgui+R.provVac+num(p.otros);
  R.factorEmpresa=1+R.cargaTotal; R.factorNomina=f("nomina");
  R.emp=S.empleados.map((e,ei)=>{
    const sv=valPeriodo("mano","e"+ei+".sueldo",e.sueldo), nv=valPeriodo("mano","e"+ei+".n",e.n);
    const bruto=(e.period==="Semanal"?num(sv)*num(p.semanas):num(sv))*num(nv);
    const costo=(bruto*R.factorEmpresa+num(e.uniformes)+num(e.capacitacion))*R.factorNomina;
    const horas=R.capPractica*(1-num(e.ausent))*num(nv);
    return {...e,bruto,costo,horas,tarifa:horas>0?costo/horas:null};
  });
  R.moDirecta=R.emp.filter(e=>e.tipo==="Directa").reduce((a,e)=>a+e.costo,0);
  R.moAdmin=R.emp.filter(e=>e.tipo==="Administrativa").reduce((a,e)=>a+e.costo,0);
  R.moComercial=R.emp.filter(e=>e.tipo==="Comercial").reduce((a,e)=>a+e.costo,0);
  // Maquinaria
  R.maq=S.maquinaria.map(m=>{
    const dep=(num(m.vida)>0)?(num(m.adquisicion)-num(m.residual))/(num(m.vida)*12):0;
    const costo=dep+(num(m.mantenimiento)+num(m.refacciones))*f("mantenimiento")+num(m.seguro);
    const tarifa=R.capPractica>0?costo/R.capPractica:null;
    return {...m,dep,costo,tarifa};
  });
  R.maqTotal=R.maq.reduce((a,m)=>a+m.costo,0);
  // Indirectos por clasificación
  const byClass=cl=>S.indirectos.filter(i=>i.cl===cl).reduce((a,i)=>a+montoIndirecto(i),0);
  R.indVar=byClass("Indirecto variable")*f("consumibles"); R.indFijo=byClass("Indirecto fijo");
  R.indFabril=R.indVar+R.indFijo;
  R.indAdmin=byClass("Administrativo"); R.indComercial=byClass("Comercial");
  R.indLog=byClass("Logístico")*f("flete"); R.indFin=byClass("Financiero"); R.indDir=byClass("Directo");
  // Energía
  const en=S.energia;
  const ev=c=>valPeriodo("energia",c,en[c]);
  R.consumo=en.cargas.reduce((a,c)=>a+num(c.kw)*num(c.h),0);
  R.enConsumo=R.consumo*num(ev("precio")); R.enDemanda=0; R.enFijo=num(ev("cargoFijo"));
  R.enEstimada=R.enConsumo+R.enFijo;
  const rr=ev("reciboReal");
  const recibo=(rr==null||rr==="")?null:num(rr);
  R.energiaSubtotal=(recibo!=null?recibo:R.enEstimada)*f("energia");
  // Pool y tasa
  R.pool=R.energiaSubtotal+R.moDirecta+R.maqTotal+R.indFabril;
  R.tasaPlanta=R.capPractica>0?R.pool/R.capPractica:null;
  R.ociosaCosto=(R.ociosa!=null&&R.tasaPlanta!=null)?R.ociosa*R.tasaPlanta:null;
  // Centros de costo
  R.indRate=R.capPractica>0?(R.energiaSubtotal+R.indFabril)/R.capPractica:0;
  R.centros=CENTROS.map(c=>{
    const dirEmp=R.emp.filter(e=>e.centro===c&&e.tipo==="Directa");
    const moCost=dirEmp.reduce((a,e)=>a+e.costo,0), moHrs=dirEmp.reduce((a,e)=>a+e.horas,0);
    const moRate=moHrs>0?moCost/moHrs:0;
    const maqRows=R.maq.filter(m=>m.centro===c);
    const maqCost=maqRows.reduce((a,m)=>a+m.costo,0), maqCap=maqRows.length*R.capPractica;
    const maqRate=maqCap>0?maqCost/maqCap:0;
    return {c,moRate,maqRate,indRate:R.indRate,total:moRate+maqRate+R.indRate};
  });
  const centro=c=>R.centros.find(x=>x.c===c)||{moRate:0,maqRate:0,indRate:R.indRate,total:R.indRate};
  // Financiero
  const fin=S.financiero;
  R.diasNetos=Math.max(0,num(fin.diasInv)+num(fin.diasCliente)-num(fin.diasProveedor));
  R.finTiempo=fin.activar?num(fin.tasaAnual)*R.diasNetos/365:0;
  R.finTotal=(fin.activar?R.finTiempo+num(fin.comision)+num(fin.difCambiario)+num(fin.reservaFX):0)*f("financiero");
  // Ruta por operación
  R.rutaCalc=S.ruta.map(r=>{
    const ct=centro(r.ce);
    const ok = isNum(r.prep)&&isNum(r.minMO)&&isNum(r.lote)&&num(r.lote)>0;
    if(!ok) return {...r,prepU:null,moU:null,maqU:null,indU:null,totU:null,estado:(r.ins?"PENDIENTE":"")};
    const rtb=num(r.retrab)*f("retrabajo");
    const mrm=Math.min(0.95,num(r.merma)*f("rechazo"));
    const up=(1+rtb)/(1-mrm);
    const tcf=f("tiempoCiclo"), tpf=f("tiempoPrep");
    const prepU=(num(r.prep)*tpf/num(r.lote))*(ct.moRate+ct.maqRate+ct.indRate)/60;
    const moU=num(r.minMO)*tcf*num(r.nop)*ct.moRate/60*up;
    const maqU=0;
    const indU=(num(r.minMO)*tcf*num(r.nop))/60*ct.indRate*up;
    return {...r,prepU,moU,maqU,indU,totU:prepU+moU+maqU+indU,estado:"OK"};
  });
  const agg=id=>{
    const rows=R.rutaCalc.filter(r=>r.ins===id&&r.estado==="OK");
    return {
      mo:rows.reduce((a,r)=>a+r.prepU+r.moU,0),
      maq:rows.reduce((a,r)=>a+r.maqU,0),
      ind:rows.reduce((a,r)=>a+r.indU,0),
      nrows:rows.length
    };
  };
  // Porcentajes de asignación (sobre conversión)
  R.pctAdmin=R.pool>0?(R.indAdmin+R.moAdmin)/R.pool:0;
  R.pctComercial=R.pool>0?(R.indComercial+R.moComercial)/R.pool:0;
  R.pctLog=R.pool>0?R.indLog/R.pool:0;
  // Costeo integral
  const getVolVista=volPeriodo(S.periodoVista||"catalogo");
  R.integral=S.inserts.map(ins=>{
    const pi=S.perInsert[ins.id]||{};
    const mermaMat=num(pi.mermaMat)*f("merma");
    const garantia=num(pi.garantia)*f("garantias");
    const margenObj=(pi.margenObj!=null&&pi.margenObj!=="")?num(pi.margenObj):(num(S.control.margenObj)+f("deltaMargen"));
    const a=agg(ins.id);
    const dz=disenoCalc(ins);
    const q25base=(dz&&dz.totalUSD>0)?dz.totalUSD:num(ins.q25);
    const materialUSD=q25base*f("materiales")/(f("rendimiento")||1);
    const materialMXN=materialUSD*(1+mermaMat)*R.tc;
    const conversion=a.mo+a.maq+a.ind;
    const costoManuf=materialMXN+conversion;
    const admin=conversion*R.pctAdmin, comercial=conversion*R.pctComercial, logistica=conversion*R.pctLog;
    const base=costoManuf+admin+comercial+logistica;
    const financiamiento=base*R.finTotal, garantiaMXN=base*garantia;
    const costoIntegral=base+financiamiento+garantiaMXN;
    const complete = materialUSD>0 && conversion>0;
    const precioSug = (complete && (1-margenObj)>0)?costoIntegral/(1-margenObj):null;
    const precioClUSD=num(ins.q26)*f("precioVenta");
    const precioClMXN=precioClUSD*R.tc;
    const utilidad = complete?precioClMXN-costoIntegral:null;
    const margenReal = (complete&&precioClMXN>0)?utilidad/precioClMXN:null;
    const markup = (complete&&costoIntegral>0)?utilidad/costoIntegral:null;
    let luz="g",estado="COSTEO INCOMPLETO";
    if(complete){
      if(margenReal<0){luz="r";estado="Rojo · margen negativo";}
      else if(margenReal<margenObj){luz="a";estado="Amarillo · bajo objetivo";}
      else {luz="v";estado="Verde · cumple objetivo";}
    }
    const vol=getVolVista(String(ins.id))*f("volumen");
    const contribUnit=precioClMXN-materialMXN;
    return {ins,mermaMat,materialUSD,materialMXN,mo:a.mo,maq:a.maq,ind:a.ind,conversion,costoManuf,
      admin,comercial,logistica,financiamiento,garantiaMXN,costoIntegral,margenObj,precioSug,
      precioClUSD,precioClMXN,utilidad,margenReal,markup,complete,luz,estado,nrows:a.nrows,
      vol,contribUnit,contribMes:contribUnit*vol,ingresoMes:precioClMXN*vol,
      costoMes:complete?costoIntegral*vol:null,utilMes:complete?utilidad*vol:null,
      tieneDiseno:!!(dz&&dz.piezas.length),disenoUSD:dz?dz.totalUSD:null};
  });
  // Agregados mensuales (requieren volumen capturado)
  R.anyVol=R.integral.some(i=>i.vol>0);
  const cv=R.integral.filter(i=>i.complete&&i.vol>0);
  R.ingresoMesComp=cv.reduce((a,i)=>a+i.ingresoMes,0);
  R.costoMesComp=cv.reduce((a,i)=>a+i.costoMes,0);
  R.utilMesComp=cv.reduce((a,i)=>a+i.utilMes,0);
  R.margenPond=R.ingresoMesComp>0?R.utilMesComp/R.ingresoMesComp:null;
  R.ingresoMesTot=R.integral.reduce((a,i)=>a+i.ingresoMes,0);
  R.contribMesTot=R.integral.reduce((a,i)=>a+i.contribMes,0);
  R.readyCount=R.integral.filter(i=>i.complete).length;
  // Validación
  const inc=R.integral.filter(i=>!i.complete).length;
  const sinRuta=R.integral.filter(i=>i.conversion===0).length;
  const bajoObj=R.integral.filter(i=>i.complete&&i.margenReal<i.margenObj).length;
  const pend=(S.capacidad.horasUsadas==null?1:0)+(S.energia.reciboReal==null?1:0);
  R.valid=[
    {k:"Insertos sin ruta / sin tiempos",v:sinRuta,rev:sinRuta>0},
    {k:"Insertos con costeo INCOMPLETO",v:inc,rev:inc>0},
    {k:"Insertos con margen < objetivo",v:bajoObj,rev:bajoObj>0},
    {k:"Costos mensuales clave PENDIENTES",v:pend,rev:pend>0},
    {k:"Centros sin capacidad práctica",v:(R.capPractica>0?0:CENTROS.length),rev:R.capPractica<=0},
    {k:"Diferencia pool vs componentes",v:0,rev:false},
    {k:"Errores de cálculo",v:0,rev:false}
  ];
  R.incompletos=inc; R.sinRuta=sinRuta; R.bajoObj=bajoObj; R.pend=pend;
  return R;
}
function isNum(x){return x!==null&&x!==""&&isFinite(parseFloat(x));}
function estadoCorto(s){return s==="COSTEO INCOMPLETO"?"Incompleto":s;}

/* ===================== FORMATO ===================== */
const fMXN=x=>x==null?"—":"$"+(x).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});
const fMXN0=x=>x==null?"—":"$"+(x).toLocaleString("es-MX",{maximumFractionDigits:0});
const fUSD=x=>x==null?"—":"US$"+(x).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});
const fUSD4=x=>x==null?"—":"US$"+(x).toLocaleString("es-MX",{minimumFractionDigits:4,maximumFractionDigits:4});
const fPct=x=>x==null?"—":(x*100).toLocaleString("es-MX",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
const fN=(x,d=1)=>x==null?"—":(x).toLocaleString("es-MX",{minimumFractionDigits:d,maximumFractionDigits:d});
const fRate=x=>x==null?'<span class="val-pend">PENDIENTE</span>':"$"+(x).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2})+"<span class='unit'>/h</span>";

/* ===================== BINDING DE INPUTS ===================== */
function setPath(path,val){
  const parts=path.split(".");let o=S;
  for(let i=0;i<parts.length-1;i++){let k=parts[i];if(/^\d+$/.test(k))k=+k;o=o[k];}
  let last=parts[parts.length-1]; if(/^\d+$/.test(last))last=+last;
  o[last]=val;
}
function inp(path,opts={}){
  const {type="num",cls="",pct=false,ph="",width=""}=opts;
  const parts=path.split(".");let o=S;let ok=true;
  for(const pp of parts){let k=/^\d+$/.test(pp)?+pp:pp; if(o==null){ok=false;break;} o=o[k];}
  let v=ok?o:"";
  let disp = v;
  if(pct && v!=null && v!=="") disp=(+v*100);
  if(v==null) disp="";
  const isPend = (v==null||v==="");
  const cl="f "+cls+(width?" "+width:"")+(isPend&&ph?" pend":"");
  const attr=`data-path="${path}" data-type="${type}" data-pct="${pct?1:0}"`;
  if(type==="text") return `<input class="${cl}" ${attr} value="${escapeHtml(disp)}" placeholder="${ph}">`;
  return `<input class="${cl}" ${attr} type="number" step="any" value="${disp===""?"":disp}" placeholder="${ph}">`;
}
function sel(path,options,cls=""){
  const parts=path.split(".");let o=S;for(const pp of parts){let k=/^\d+$/.test(pp)?+pp:pp;o=o[k];}
  return `<select class="f ${cls}" data-path="${path}" data-type="text">`+
    options.map(op=>`<option ${op===o?"selected":""}>${op}</option>`).join("")+`</select>`;
}
function getPath(path){let o=S;for(const pp of path.split(".")){let k=/^\d+$/.test(pp)?+pp:pp;if(o==null)return undefined;o=o[k];}return o;}
function selRaw(path,options,current){
  return `<select class="f" data-path="${path}" data-type="text">`+
    options.map(o=>`<option ${String(o)===String(current)?"selected":""}>${escapeHtml(String(o))}</option>`).join("")+`</select>`;
}
function ovInput(path,phval){
  const cur=getPath(path); const disp=(cur==null||cur==="")?"":cur;
  return `<input class="f" type="number" step="any" data-path="${path}" data-type="num" data-pct="0" value="${disp}" placeholder="${phval}">`;
}
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b];}return a||1;}
function toFrac(x){
  if(x==null||x==="") return "";
  const n=+x; if(!isFinite(n)) return "";
  const neg=n<0, v=Math.abs(n), whole=Math.floor(v+1e-9), frac=v-whole, denom=16;
  let numer=Math.round(frac*denom);
  if(Math.abs(frac*denom-numer)>0.02) return (neg?"-":"")+(+v.toFixed(4));
  if(numer===0) return (neg?"-":"")+whole;
  if(numer===denom) return (neg?"-":"")+(whole+1);
  const g=gcd(numer,denom), d=denom/g; numer/=g;
  return (neg?"-":"")+(whole>0?whole+" ":"")+numer+"/"+d;
}
function parseFrac(s){
  if(s==null) return null;
  s=String(s).trim().replace(/[”"'′″]/g,'').trim();
  if(s==="") return null;
  let m;
  if(m=s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/)){ const w=+m[1],n=+m[2],d=+m[3]; if(!d)return null; return (w<0?-1:1)*(Math.abs(w)+n/d); }
  if(m=s.match(/^(-?\d+)\s*\/\s*(\d+)$/)){ const n=+m[1],d=+m[2]; if(!d)return null; return n/d; }
  const v=parseFloat(s.replace(',','.')); return isFinite(v)?v:null;
}
function fracInput(path,ph){
  const cur=getPath(path); const disp=(cur==null||cur==="")?"":toFrac(cur);
  return `<input class="f" type="text" inputmode="text" data-frac="${path}" value="${escapeHtml(disp)}" placeholder="${escapeHtml(ph||'')}">`;
}
function centroSel(path){
  const cur=getPath(path); const c=(cur==null||cur==="")?"":String(cur);
  const opts=(c&&!CENTROS.includes(c))?[c].concat(CENTROS):CENTROS;
  return selRaw(path,opts,c||CENTROS[0]);
}
function procSel(path){
  const cur=getPath(path); const c=(cur==null||cur==="")?"":String(cur);
  const opts=(c&&!PROCESOS.includes(c))?[c].concat(PROCESOS):PROCESOS;
  return selRaw(path,opts,c||PROCESOS[0]);
}
function stdRutaOps(id){
  return [{ins:id,op:10,proc:CENTRO_PROD,ce:CENTRO_PROD,prep:null,lote:1,minMO:null,minMaq:null,nop:1,retrab:0,merma:0}];
}
function migrateCentros(){
  const NEW=CENTRO_PROD;
  const OLD=["Corte","Pegado / Ensamble","Corte y Pegado / Ensamble"];
  const fix=v=>OLD.includes(v)?NEW:v;
  (S.empleados||[]).forEach(e=>{e.centro=fix(e.centro);});
  (S.indirectos||[]).forEach(i=>{i.ce=fix(i.ce);});
  (S.maquinaria||[]).forEach(m=>{m.centro=fix(m.centro);});
  (S.ruta||[]).forEach(r=>{ r.ce=fix(r.ce); if(OLD.includes(r.proc)) r.proc=NEW; });
  // Una sola operación de producción (Corte/Pegado/Ensamble) por inserto
  const seen={};
  S.ruta=(S.ruta||[]).filter(r=>{
    if(r.proc!==NEW) return true;
    const k=String(r.ins); if(seen[k]) return false; seen[k]=true; return true;
  });
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||!el.dataset.path) return;
  let val;
  if(el.dataset.type==="text"){ val=el.value; }
  else{
    if(el.value===""){ val=null; }
    else{ val=parseFloat(el.value); if(el.dataset.pct==="1") val=val/100; }
  }
  setPath(el.dataset.path,val);
  save(); renderKPIs(); renderChain(); renderSection(current);
});
document.addEventListener("input",e=>{ if(e.target.dataset&&e.target.dataset.path) touched(); });

/* ===================== SECCIONES ===================== */
const SECTIONS=[
  {id:"dashboard",ix:"01",name:"Panel ejecutivo"},
  {id:"presupuesto",ix:"02",name:"Presupuesto y equilibrio"},
  {id:"resumen",ix:"03",name:"Resumen"},
  {id:"control",ix:"04",name:"Parámetros y costo financiero"},
  {id:"facturas",ix:"05",name:"Facturas de venta"},
  {id:"capacidad",ix:"06",name:"Capacidad"},
  {id:"mano",ix:"07",name:"Mano de obra"},
  {id:"indirectos",ix:"08",name:"Indirectos"},
  {id:"energia",ix:"09",name:"Energía y pool"},
  {id:"centros",ix:"10",name:"Centros de costo"},
  {id:"ruta",ix:"11",name:"Ruta de proceso"},
  {id:"mes",ix:"12",name:"Costeo mensual"},
  {id:"placas",ix:"13",name:"Costeo de placas"},
  {id:"diagrama",ix:"14",name:"Diagrama de corte"},
  {id:"validacion",ix:"15",name:"Validación"}
];
let current="dashboard";

function renderNav(){
  document.getElementById("navlist").innerHTML=SECTIONS.map(s=>
    `<li><button class="navbtn ${s.id===current?'active':''}" data-click="go('${s.id}')">
      <span class="ix mono">${s.ix}</span>${s.name}</button></li>`).join("");
}
function renderRol(){
  const b=document.getElementById("rolBadge"); if(!b) return;
  b.textContent=ROLES[ROL]||ROL; b.className="pill rol";
  b.title=puedeEditar()?"Puedes capturar datos":"Solo lectura";
}
function renderKPIs(){
  const R=compute();
  const estadoTxt = R.incompletos>0?`${R.incompletos} incompleto(s)`:(R.bajoObj>0?`${R.bajoObj} bajo objetivo`:"Todos OK");
  const estadoLuz = R.incompletos>0?"g":(R.bajoObj>0?"a":"v");
  document.getElementById("kpis").innerHTML=`
    ${kpi("Pool de manufactura",fMXN0(R.pool),"$/mes")}
    ${kpi("Tasa de planta",R.tasaPlanta==null?"—":fMXN(R.tasaPlanta),"$/h")}
    ${kpi("Capacidad práctica",fN(R.capPractica,0),"h/mes")}
    ${kpi("TC efectivo",fN(R.tc,4),"MXN/USD")}
    ${kpi("Margen objetivo",fPct(num(S.control.margenObj)+f("deltaMargen")),"")}
    <div class="kpi state"><div class="lab">Estado del costeo</div>
      <div class="val"><span class="lz ${estadoLuz}"><span class="b"></span>${estadoTxt}</span></div></div>`;
}
function kpi(lab,val,unit){return `<div class="kpi"><div class="lab">${lab}</div>
  <div class="val mono">${val} ${unit?`<small>${unit}</small>`:""}</div></div>`;}
function renderChain(){
  const R=compute();
  const chips=[
    ["Periodo",etiquetaPeriodo(S.periodoVista||"catalogo")],
    ["TC efectivo",fN(R.tc,4)],
    ["Capacidad",fN(R.capPractica,0)+" h"],
    ["Pool",fMXN0(R.pool)],
    ["Tasa planta",R.tasaPlanta==null?"—":fMXN(R.tasaPlanta)+"/h"],
    ["Centros",R.centros.length+" tarifas"],
    ["Ruta→Integral",R.sinRuta+" sin ruta"],
    ["Precio",R.incompletos>0?"incompleto":"listo"]
  ];
  document.getElementById("chain").innerHTML=chips.map((c,i)=>
    `<span class="c">${c[0]}: <b>${c[1]}</b></span>`+(i<chips.length-1?`<span class="ar">→</span>`:"")).join("");
}
function head(name,src,lead){
  return `<div class="sechead"><h2>${name}</h2><span class="src">${src}</span></div>
    ${lead?`<p class="lead">${lead}</p>`:""}`;
}

/* ---------- RESUMEN ---------- */
function secResumen(R){
  let rows=R.integral.map(i=>`<tr>
    <td class="l mono">${i.ins.id}</td>
    <td class="mono val-link">${fUSD(i.materialUSD)}</td>
    <td class="mono val-calc">${fMXN(i.materialMXN)}</td>
    <td class="mono val-calc">${i.conversion?fMXN(i.conversion):'<span class="val-pend">s/ruta</span>'}</td>
    <td class="mono val-calc">${fMXN(i.costoIntegral)}</td>
    <td class="mono val-calc">${i.precioSug==null?'—':fMXN(i.precioSug)}</td>
    <td class="mono val-link">${fMXN(i.precioClMXN)}</td>
    <td class="mono val-calc">${i.utilidad==null?'—':fMXN(i.utilidad)}</td>
    <td class="mono">${i.margenReal==null?'—':fPct(i.margenReal)}</td>
    <td class="mono">${i.markup==null?'—':fPct(i.markup)}</td>
    <td class="l"><span class="lz ${i.luz}"><span class="b"></span>${i.estado}</span></td></tr>`).join("");
  return head("Resumen del costeo","COSTEO_INTEGRAL · CONTROL · VALIDACION",
    "Vista de todos los insertos con su costo integral, precio y semáforo. Cambia cualquier dato en las demás secciones y estos indicadores se recalculan en cadena. Sin tiempos de ruta, el inserto queda como <b>costeo incompleto</b> y no genera precio válido.")
    +`<div class="filterbar">${periodoSelector()}<span class="hint">Consultando: <b>${escapeHtml(etiquetaPeriodo(S.periodoVista||"catalogo"))}</b></span>${badgePeriodo(S.periodoVista)}</div>
    <div class="scroll"><table><thead><tr>
      <th class="l">Inserto</th><th>Material (USD)</th><th>Material (MXN)</th><th>Conversión</th>
      <th>Costo integral</th><th>Precio sugerido</th><th>Precio cliente</th><th>Utilidad/pza</th>
      <th>Margen real</th><th>Markup</th><th class="l">Semáforo</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="legend">
      <span><span class="sw" style="background:var(--green)"></span><b>Verde</b> cumple objetivo</span>
      <span><span class="sw" style="background:var(--amber)"></span><b>Amarillo</b> positivo, bajo objetivo</span>
      <span><span class="sw" style="background:var(--red)"></span><b>Rojo</b> margen negativo</span>
      <span><span class="sw" style="background:var(--gray)"></span><b>Gris</b> costeo incompleto</span>
    </div>
    <div class="grid2" style="margin-top:16px">
      ${cardMini("Cómo se conecta","Escenario y TC → material en MXN. Capacidad + nómina + indirectos + energía → <b>pool</b> → <b>tasa de planta</b> → tarifas por <b>centro</b>. Los tiempos de <b>ruta</b> por inserto consumen esas tarifas → conversión → costo integral → precio y margen. Edita un dato en cualquier hoja y todo se actualiza aquí.")}
      ${cardValidResumen(R)}
    </div>`;
}
function cardMini(t,b){return `<div class="card"><h3>${t}</h3><div class="pad"><div class="note" style="border:0;background:none;padding:0">${b}</div></div></div>`;}
function cardValidResumen(R){
  const rows=R.valid.map(v=>`<tr><td class="l">${v.k}</td><td class="mono val-calc">${v.v}</td>
    <td class="l"><span class="pill ${v.rev?'rev':'ok'}">${v.rev?'REVISAR':'OK'}</span></td></tr>`).join("");
  return `<div class="card"><h3>Validación rápida</h3><div class="body"><table>${rows}</table></div></div>`;
}

/* ---------- CONTROL ---------- */
function secControl(R){
  return head("Parámetros y costo financiero","PARÁMETROS · COSTO FINANCIERO",
    "Parámetros generales del modelo (tipo de cambio, margen objetivo y vigencia de precios) y el costo financiero que se aplica en el costo integral de cada inserto.")
  +`<div class="grid2">
    <div class="card"><h3>Parámetros globales</h3><div class="pad">
      <table>
        <tr><td class="l">Tipo de cambio base <span class="unit">MXN/USD</span></td><td>${inp("control.tcBase")}</td></tr>
        <tr><td class="l">Fecha de actualización del TC</td><td>${inp("control.tcFecha",{type:"text",cls:"txt",ph:"dd/mm/aaaa"})}</td></tr>
        <tr><td class="l">TC efectivo</td><td class="mono val-calc">${fN(R.tc,4)}</td></tr>
        <tr><td class="l">Margen objetivo por defecto</td><td>${inp("control.margenObj",{pct:true})}<span class="unit">%</span></td></tr>
        <tr><td class="l">Vigencia de precios <span class="unit">meses</span></td><td>${inp("control.vigenciaMeses")}</td></tr>
      </table>
      <div class="note" style="margin-top:12px">
        <b>Tipo de cambio automático.</b> Si lo activas, la app consulta al abrirse la serie elegida del <b>Banco de México</b> (SIE) y aplica el último dato disponible, sin captura manual.
        <table style="margin:8px 0">
          <tr><td class="l">Actualización automática</td><td class="l">
            <select class="f" data-path="control.tcAuto" data-type="bool">
              <option value="true" ${S.control.tcAuto!==false?'selected':''}>Activada</option>
              <option value="false" ${S.control.tcAuto===false?'selected':''}>Desactivada (captura manual)</option>
            </select></td></tr>
          <tr><td class="l">Serie oficial a usar</td><td class="l">
            <select class="f" data-path="control.tcSerie" data-type="text">
              <option value="fix" ${S.control.tcSerie!=="pagos"?'selected':''}>FIX / publicación DOF (SF43718)</option>
              <option value="pagos" ${S.control.tcSerie==="pagos"?'selected':''}>Para solventar obligaciones (SF60653)</option>
            </select></td></tr>
          <tr><td class="l">Último dato recibido</td><td class="mono val-calc">${TC_API?((TC_API.fix?('FIX '+fN(TC_API.fix.valor,4)+' · '+TC_API.fix.fecha):'')+(TC_API.pagos?('  |  Pagos '+fN(TC_API.pagos.valor,4)+' · '+TC_API.pagos.fecha):'')):'<span class="val-pend">sin conexión al servicio</span>'}</td></tr>
        </table>
        <div style="margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="rowbtn" style="margin:0" data-click="refrescarTC()">Actualizar ahora</button>
          <a class="btn" style="display:inline-block" href="https://www.banxico.org.mx/tipcamb/tipCamMIBOW.jsp" target="_blank" rel="noopener">Banxico ↗</a>
          <a class="btn" style="display:inline-block" href="https://dof.gob.mx/indicadores.php" target="_blank" rel="noopener">DOF ↗</a>
        </div>
        Banxico determina el FIX cada día hábil (~12:00 h) y el DOF lo publica al día hábil siguiente: el FIX de hoy es la publicación DOF de mañana. Si el servicio no responde, se conserva el último valor y puedes capturarlo a mano arriba.
      </div>
      <div class="note" style="margin-top:8px">Margen sobre venta = utilidad ÷ precio. Markup = utilidad ÷ costo. Precio con margen objetivo = costo integral ÷ (1 − margen).</div>
    </div></div>
    <div class="card"><h3>Costo financiero</h3><div class="pad"><table>
      <tr><td class="l">Activar costo financiero</td><td class="l">
        <select class="f" data-path="financiero.activar" data-type="bool">
          <option value="true" ${S.financiero.activar?'selected':''}>Sí</option>
          <option value="false" ${!S.financiero.activar?'selected':''}>No</option>
        </select></td></tr>
      <tr><td class="l">Días de inventario</td><td>${inp("financiero.diasInv")}</td></tr>
      <tr><td class="l">Días de crédito al cliente</td><td>${inp("financiero.diasCliente")}</td></tr>
      <tr><td class="l">Días de crédito del proveedor</td><td>${inp("financiero.diasProveedor")}</td></tr>
      <tr><td class="l">Tasa anual de financiamiento</td><td>${inp("financiero.tasaAnual",{pct:true})}<span class="unit">%</span></td></tr>
      <tr><td class="l">Comisión bancaria (s/venta)</td><td>${inp("financiero.comision",{pct:true})}<span class="unit">%</span></td></tr>
      <tr><td class="l">Diferencial cambiario</td><td>${inp("financiero.difCambiario",{pct:true})}<span class="unit">%</span></td></tr>
      <tr><td class="l">Reserva de riesgo cambiario</td><td>${inp("financiero.reservaFX",{pct:true})}<span class="unit">%</span></td></tr>
      <tr class="sub"><td class="l">Días financiados netos</td><td class="mono val-calc">${fN(R.diasNetos,0)}</td></tr>
      <tr class="sub"><td class="l">Costo financiero por tiempo</td><td class="mono val-calc">${fPct(R.finTiempo)}</td></tr>
      <tr class="total"><td class="l">% financiero total (sobre costo)</td><td class="mono">${fPct(R.finTotal)}</td></tr>
    </table>
    <div class="note" style="margin-top:12px">Costo financiero = base × tasa anual × días financiados ÷ 365, más comisiones y coberturas. Días financiados netos = inventario + crédito al cliente − crédito del proveedor. Se aplica en el costo integral como % sobre el costo previo.</div></div></div>
  </div>`;
}

/* ---------- CAPACIDAD ---------- */
function secCapacidad(R){
  const rows=[
    ["dias","Días laborables por mes","días"],["turnos","Turnos por día","turnos"],
    ["horas","Horas ordinarias por turno","h"],["comida","Horas de comida no productivas / turno","h"],
    ["festivos","Días festivos por mes","días"],["vacaciones","Vacaciones (días/mes, prorrateo)","días"],
    ["ausentismo","Ausentismo","%"],["mantenimiento","Mantenimiento programado","h/mes"],
    ["setups","Preparaciones / setups","h/mes"],["paros","Paros no programados","h/mes"]
  ];
  const irows=rows.map(([kk,lab,u])=>`<tr><td class="l">${lab}</td>
    <td>${perInput("capacidad",kk,"capacidad."+kk,{pct:u==="%"})}<span class="unit">${u}</span></td></tr>`).join("");
  return head("Capacidad práctica","CAPACIDAD",
    "Sustituye el viejo factor fijo de 85%. La capacidad práctica es el denominador de todas las tarifas. La capacidad ociosa se muestra aparte y no se reparte entre productos.")
  +`<div class="filterbar">${periodoSelector()}<span class="hint">${escapeHtml(etiquetaPeriodo(S.periodoVista||"catalogo"))} — ${avisoPeriodo()}</span>${badgePeriodo(S.periodoVista)}</div>
    <div class="grid2">
    <div class="card"><h3>Tiempo disponible</h3><div class="pad"><table>${irows}</table></div></div>
    <div class="card"><h3>Capacidad resultante</h3><div class="pad"><table>
      <tr><td class="l">Capacidad teórica</td><td class="mono val-calc">${fN(R.capTeorica,0)}<span class="unit">h/mes</span></td></tr>
      <tr><td class="l">Horas productivas base</td><td class="mono val-calc">${fN(R.capBase,0)}<span class="unit">h/mes</span></td></tr>
      <tr class="total"><td class="l">Capacidad práctica</td><td class="mono">${fN(R.capPractica,0)}<span class="unit">h/mes</span></td></tr>
      <tr><td class="l">Horas utilizadas <span class="hint">(captura)</span></td><td>${perInput("capacidad","horasUsadas","capacidad.horasUsadas",{ph:"PENDIENTE"})}</td></tr>
      <tr><td class="l">Capacidad ociosa</td><td class="mono val-calc">${R.ociosa==null?'<span class="val-pend">PENDIENTE</span>':fN(R.ociosa,0)+' h'}</td></tr>
      <tr><td class="l">% de utilización</td><td class="mono val-calc">${R.utilPct==null?'<span class="val-pend">PENDIENTE</span>':fPct(R.utilPct)}</td></tr>
    </table></div></div>
  </div>`;
}

/* ---------- MANO DE OBRA ---------- */
function secMano(R){
  const p=[
    ["isn","ISN Baja California",1],["infonavit","INFONAVIT",1],["imss","IMSS + RCV patronal (aprox.)",1],
    ["aguinaldoDias","Aguinaldo (días/año)",0],["vacDias","Vacaciones (días/año)",0],
    ["primaVac","Prima vacacional",1],["otros","Otros costos laborales",1],["semanas","Semanas por mes",0]
  ];
  const prows=p.map(([k,lab,isPct])=>`<tr><td class="l">${lab}${k==="imss"?' <span class="tag">confirmar</span>':''}</td>
    <td>${inp("moParams."+k,{pct:isPct===1})}${isPct?'<span class="unit">%</span>':''}</td></tr>`).join("");
  const erows=R.emp.map((e,i)=>`<tr>
    <td class="l">${inp(`empleados.${i}.puesto`,{type:"text",cls:"txt wide"})}</td>
    <td class="l">${sel(`empleados.${i}.tipo`,TIPOS)}</td>
    <td class="l">${centroSel(`empleados.${i}.centro`)}</td>
    <td class="l">${sel(`empleados.${i}.period`,PERIOD)}</td>
    <td>${perInput("mano","e"+i+".sueldo",`empleados.${i}.sueldo`,{ph:"—"})}</td>
    <td>${perInput("mano","e"+i+".n",`empleados.${i}.n`,{dec:0})}</td>
    <td class="mono val-calc">${fMXN0(e.bruto)}</td>
    <td class="mono val-calc">${fMXN0(e.costo)}</td>
    <td class="mono val-calc">${e.tarifa==null?'—':fMXN(e.tarifa)+'/h'}</td>
    <td><button class="del" data-click="delRow('empleados',${i})">✕</button></td></tr>`).join("");
  return head("Mano de obra","MANO_OBRA",
    "Sustituye el factor 1.35 por cargas patronales explícitas. El costo-empresa por hora = costo mensual ÷ horas productivas. Los % de ley son supuestos: confírmalos con tu contador.")
  +`<div class="filterbar">${periodoSelector()}<span class="hint">${escapeHtml(etiquetaPeriodo(S.periodoVista||"catalogo"))} — sueldos y número de personas por periodo; ${avisoPeriodo()}</span></div>
    <div class="grid2">
    <div class="card"><h3>Cargas patronales</h3><div class="pad"><table>${prows}
      <tr class="sub"><td class="l">Provisión aguinaldo</td><td class="mono">${fPct(R.provAgui)}</td></tr>
      <tr class="sub"><td class="l">Provisión vacaciones + prima</td><td class="mono">${fPct(R.provVac)}</td></tr>
      <tr class="total"><td class="l">Carga patronal total</td><td class="mono">${fPct(R.cargaTotal)}</td></tr>
      <tr class="total"><td class="l">Factor costo-empresa</td><td class="mono">${fN(R.factorEmpresa,3)}</td></tr>
    </table></div></div>
    <div class="card"><h3>Roll-ups mensuales</h3><div class="pad"><table>
      <tr><td class="l">MO directa → pool de manufactura</td><td class="mono val-calc">${fMXN(R.moDirecta)}</td></tr>
      <tr><td class="l">Labor administrativa → costo integral</td><td class="mono val-calc">${fMXN(R.moAdmin)}</td></tr>
      <tr><td class="l">Labor comercial → costo integral</td><td class="mono val-calc">${fMXN(R.moComercial)}</td></tr>
    </table><div class="note" style="margin-top:12px">Factor de nómina del escenario aplicado: <b>${fN(R.factorNomina,2)}</b>.</div></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Plantilla y costo empresa</h3><div class="body"><div class="scroll" style="border:0;box-shadow:none">
    <table><thead><tr><th class="l">Puesto</th><th class="l">Tipo</th><th class="l">Centro</th><th class="l">Periodicidad</th>
      <th>Sueldo bruto</th><th>N°</th><th>Bruto mensual</th><th>Costo empresa</th><th>Tarifa $/h</th><th></th></tr></thead>
    <tbody>${erows}</tbody></table></div>
    <button class="rowbtn" data-click="addEmp()">+ Agregar puesto</button></div></div>`;
}


/* ---------- INDIRECTOS ---------- */
function indMontoInput(i,it){
  const k=S.periodoVista||"catalogo"; const v=montoIndirecto(it,k);
  if(!indirectoEditable()) return `<span class="mono val-calc" title="Promedio de los meses capturados">${fMXN(v)}</span>`;
  if(k==="catalogo") return inp(`indirectos.${i}.m`,{ph:"—"});
  const P=ensurePeriodo(k); const id=indKey(it);
  const ov=(P.indirectos||{})[id];
  const disp=(ov===undefined||ov===null||ov==="")?"":ov;
  return `<input class="f" type="number" step="any" data-ind="${escapeHtml(id)}" value="${disp}" placeholder="${it.m==null?'0':num(it.m)}">`;
}
function secIndirectos(R){
  const rows=S.indirectos.map((it,i)=>`<tr>
    <td class="l">${inp(`indirectos.${i}.c`,{type:"text",cls:"txt wide"})}</td>
    <td class="l">${sel(`indirectos.${i}.cl`,CLASES)}</td>
    <td class="l">${centroSel(`indirectos.${i}.ce`)}</td>
    <td>${indMontoInput(i,it)}</td>
    <td class="mono val-calc" title="Monto del catálogo (base)">${it.m==null||it.m===""?'<span class="hint">—</span>':fMXN(num(it.m))}</td>
    <td><button class="del" data-click="delRow('indirectos',${i})">✕</button></td></tr>`).join("");
  return head("Indirectos y gastos","INDIRECTOS",
    "La clasificación decide a dónde va cada gasto: los fabriles entran a la tasa de manufactura; administración, comercial, logística y financiero se aplican en el costo integral. Los conceptos son fijos, pero <b>el monto se captura por mes</b>: elige el periodo y ajusta lo que cambió; lo que dejes en blanco toma el valor del catálogo.")
  +`<div class="filterbar">${periodoSelector()}
      ${badgePeriodo(S.periodoVista)}<span class="hint">Montos de <b>${escapeHtml(etiquetaPeriodo(S.periodoVista||"catalogo"))}</b>${(S.periodoVista||"catalogo")==="catalogo"?" — valores base del catálogo":(indirectoEditable()?" — captura el monto del mes; en blanco usa el del catálogo":" — promedio de los meses capturados")}</span>
      ${indirectoEditable()&&(S.periodoVista||"catalogo")!=="catalogo"?`<button class="rowbtn" style="margin:0" data-click="indCopiarBase()">Copiar montos del catálogo</button><button class="rowbtn" style="margin:0" data-click="indLimpiarMes()">Limpiar mes</button>`:""}</div>
    <div class="scroll"><table><thead><tr><th class="l">Concepto</th><th class="l">Clasificación</th><th class="l">Centro</th><th>$/mes${(S.periodoVista||"catalogo")==="catalogo"?"":" del periodo"}</th><th>Base<br>catálogo</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <button class="rowbtn" data-click="addInd()">+ Agregar concepto</button>
    <div class="grid2" style="margin-top:16px">
      <div class="card"><h3>Roll-ups por naturaleza</h3><div class="body"><table>
        <tr><td class="l">Indirecto variable (fabril)</td><td class="mono val-calc">${fMXN(R.indVar)}</td></tr>
        <tr><td class="l">Indirecto fijo (fabril)</td><td class="mono val-calc">${fMXN(R.indFijo)}</td></tr>
        <tr class="total"><td class="l">Total indirectos fabriles → pool</td><td class="mono">${fMXN(R.indFabril)}</td></tr>
        <tr><td class="l">Administrativo → integral</td><td class="mono val-calc">${fMXN(R.indAdmin)}</td></tr>
        <tr><td class="l">Comercial → integral</td><td class="mono val-calc">${fMXN(R.indComercial)}</td></tr>
        <tr><td class="l">Logístico → integral</td><td class="mono val-calc">${fMXN(R.indLog)}</td></tr>
        <tr><td class="l">Financiero</td><td class="mono val-calc">${fMXN(R.indFin)}</td></tr>
      </table></div></div>
      <div class="card"><h3>% de asignación (sobre conversión)</h3><div class="body"><table>
        <tr><td class="l">% Administración</td><td class="mono val-calc">${fPct(R.pctAdmin)}</td></tr>
        <tr><td class="l">% Comercial</td><td class="mono val-calc">${fPct(R.pctComercial)}</td></tr>
        <tr><td class="l">% Logística</td><td class="mono val-calc">${fPct(R.pctLog)}</td></tr>
      </table><div class="note" style="margin-top:10px">Incluyen la labor administrativa y comercial de la hoja de mano de obra, divididas entre el pool de manufactura.</div></div></div>
    </div>`;
}

/* ---------- ENERGÍA Y POOL ---------- */
function secEnergia(R){
  const loads=S.energia.cargas.map((c,i)=>`<tr>
    <td class="l">${inp(`energia.cargas.${i}.n`,{type:"text",cls:"txt wide"})}</td>
    <td>${inp(`energia.cargas.${i}.kw`)}</td>
    <td>${inp(`energia.cargas.${i}.h`)}</td>
    <td class="mono val-calc">${fN(num(c.kw)*num(c.h),0)}</td>
    <td><button class="del" data-click="delRow('energia.cargas',${i})">✕</button></td></tr>`).join("");
  return head("Energía y pool de manufactura","COSTEO_MANUFACTURA",
    "Tarifa comercial de baja tensión (PDBT): sólo cargo por consumo ($/kWh) + cargo fijo, sin cargo por demanda (eso aplica a media tensión con subestación). La base principal debe ser el recibo real de CFE; la estimación por potencia×horas es sólo validación. El pool reúne energía + MO directa + indirectos fabriles y define la tasa de planta.")
  +`<div class="filterbar">${periodoSelector()}<span class="hint">${escapeHtml(etiquetaPeriodo(S.periodoVista||"catalogo"))} — ${avisoPeriodo()}</span>${badgePeriodo(S.periodoVista)}</div>
    <div class="grid2">
    <div class="card"><h3>Parámetros de energía · CFE tarifa comercial baja tensión (PDBT)</h3><div class="pad"><table>
      <tr><td class="l">Precio de energía (tarifa comercial PDBT)</td><td>${perInput("energia","precio","energia.precio")}<span class="unit">$/kWh</span></td></tr>
      <tr><td class="l">Cargo fijo mensual</td><td>${perInput("energia","cargoFijo","energia.cargoFijo")}</td></tr>
      <tr><td class="l">Costo real de recibo CFE <span class="hint">(base principal)</span></td><td>${perInput("energia","reciboReal","energia.reciboReal",{ph:"PENDIENTE"})}</td></tr>
    </table></div></div>
    <div class="card"><h3>Resumen de energía</h3><div class="pad"><table>
      <tr><td class="l">Consumo estimado</td><td class="mono val-calc">${fN(R.consumo,0)}<span class="unit">kWh</span></td></tr>
      <tr><td class="l">Costo energía (consumo)</td><td class="mono val-calc">${fMXN(R.enConsumo)}</td></tr>
      <tr><td class="l">Cargo fijo mensual</td><td class="mono val-calc">${fMXN(R.enFijo)}</td></tr>
      <tr><td class="l">Energía estimada</td><td class="mono val-calc">${fMXN(R.enEstimada)}</td></tr>
      <tr class="total"><td class="l">Subtotal energía</td><td class="mono">${fMXN(R.energiaSubtotal)}</td></tr>
    </table></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Cargas eléctricas (validación)</h3><div class="body">
    <div class="scroll" style="border:0;box-shadow:none"><table><thead><tr><th class="l">Equipo / carga</th><th>Potencia kW</th><th>Horas/mes</th><th>kWh/mes</th><th></th></tr></thead>
    <tbody>${loads}</tbody></table></div>
    <button class="rowbtn" data-click="addCarga()">+ Agregar carga</button></div></div>
  <div class="card" style="margin-top:16px"><h3>Pool de manufactura y tasa de planta</h3><div class="pad"><table>
    <tr><td class="l">Energía eléctrica</td><td class="mono val-link">${fMXN(R.energiaSubtotal)}</td></tr>
    <tr><td class="l">Mano de obra directa</td><td class="mono val-link">${fMXN(R.moDirecta)}</td></tr>
    <tr><td class="l">Indirectos fabriles</td><td class="mono val-link">${fMXN(R.indFabril)}</td></tr>
    <tr class="total"><td class="l">Total pool de manufactura</td><td class="mono">${fMXN(R.pool)}</td></tr>
    <tr><td class="l">Capacidad práctica</td><td class="mono val-link">${fN(R.capPractica,0)} h/mes</td></tr>
    <tr class="total"><td class="l">Tasa de manufactura (planta)</td><td class="mono">${R.tasaPlanta==null?'—':fMXN(R.tasaPlanta)+' /h'}</td></tr>
    <tr><td class="l">Costo de capacidad ociosa <span class="hint">(no se reparte)</span></td><td class="mono val-calc">${R.ociosaCosto==null?'<span class="val-pend">PENDIENTE</span>':fMXN(R.ociosaCosto)}</td></tr>
  </table></div></div>`;
}

/* ---------- CENTROS ---------- */
function secCentros(R){
  const rows=R.centros.map(c=>`<tr>
    <td class="l">${c.c}</td>
    <td class="mono val-calc">${c.moRate>0?fMXN(c.moRate):'—'}</td>
    <td class="mono val-calc">${fMXN(c.indRate)}</td>
    <td class="mono" style="font-weight:700">${fMXN(c.total)}<span class="unit">/h</span></td></tr>`).join("");
  return head("Centros de costo","CENTROS_COSTO",
    "Cada centro tiene su propia tarifa de mano de obra (derivada de la nómina de sus operadores directos) y una tarifa de indirectos de planta. Tarifa total = mano de obra + indirectos. Los tiempos de la ruta consumen estas tarifas.")
  +`<div class="scroll"><table><thead><tr><th class="l">Centro de costo</th><th>Tarifa MO $/h</th><th>Tarifa indirectos $/h</th><th>Tarifa TOTAL $/h</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ---------- RUTA ---------- */
let rutaFilter="(todos)";
function secRuta(R){
  const insCli=S.inserts.filter(pasaCliente).map(i=>String(i.id));
  const insOpts=["(todos)"].concat(insCli);
  if(rutaFilter!=="(todos)"&&!insCli.includes(rutaFilter)) rutaFilter="(todos)";
  const insDe=id=>S.inserts.find(x=>String(x.id)===String(id));
  const shown=R.rutaCalc.map((r,i)=>({r,i}))
    .filter(x=>insCli.includes(String(x.r.ins)))
    .filter(x=>rutaFilter==="(todos)"||String(x.r.ins)===rutaFilter);
  const rows=shown.map(({r,i})=>`<tr>
    <td class="l">${sel(`ruta.${i}.ins`,S.inserts.map(x=>x.id))}</td>
    <td class="l" title="Se define en Costeo de placas">${escapeHtml(clienteLabel(insDe(r.ins)))}</td>
    <td>${inp(`ruta.${i}.op`)}</td>
    <td class="l val-calc" title="${escapeHtml(String(r.proc||CENTRO_PROD))}">${escapeHtml(abrev(r.proc||CENTRO_PROD))}</td>
    <td class="l val-calc" title="${escapeHtml(String(r.ce||CENTRO_PROD))}">${escapeHtml(abrev(r.ce||CENTRO_PROD))}</td>
    <td>${inp(`ruta.${i}.prep`,{ph:"PEND"})}</td>
    <td>${inp(`ruta.${i}.lote`)}</td>
    <td>${inp(`ruta.${i}.minMO`,{ph:"PEND"})}</td>
    <td>${inp(`ruta.${i}.nop`)}</td>
    <td>${inp(`ruta.${i}.retrab`,{pct:true})}</td>
    <td>${inp(`ruta.${i}.merma`,{pct:true})}</td>
    <td class="mono val-calc">${r.totU==null?'—':fMXN(r.totU)}</td>
    <td class="l">${r.estado?`<span class="pill ${r.estado==='OK'?'ok':'rev'}">${r.estado}</span>`:''}</td>
    <td><button class="del" data-click="delRow('ruta',${i})">✕</button></td></tr>`).join("");
  return head("Ruta de proceso","RUTA_PROCESO",
    "Captura los tiempos reales por operación. Prep/unidad = min prep ÷ tamaño de lote. MO/unidad = min MO × operadores × tarifa MO ÷ 60. Se ajusta por retrabajo y merma. <b>Sin tiempos, el inserto queda incompleto.</b>")
  +`<div class="filterbar">${clienteSelector("setCliRuta")}
    <div class="exsel" style="display:inline-flex"><span>Inserto</span>
      <select data-change="setRutaFilter(this.value)">${insOpts.map(o=>`<option ${o===rutaFilter?'selected':''}>${escapeHtml(o)}</option>`).join("")}</select></div>
    <span class="hint">${shown.length} operación(es)</span></div>
    <div class="tabla-integral"><table class="compact"><thead><tr>
    <th class="l">Inserto</th><th class="l">Cliente</th><th>Op</th><th class="l">Proceso</th><th class="l">Centro</th><th>Min prep/<br>lote</th><th>Lote</th>
    <th>Min MO/u</th><th>N°<br>op.</th><th>%<br>retrab.</th><th>%<br>merma</th><th>Costo<br>total/u</th><th class="l">Estado</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <button class="rowbtn" data-click="addRuta()">+ Agregar operación</button>
    <button class="rowbtn" data-click="rutasEstandar()">Aplicar ruta estándar (Corte/Pegado/Ensamble) a todos</button>`;
}


function inpPer(id,field,pct){
  const pi=S.perInsert[id]||{}; const v=pi[field];
  const disp=(v==null||v==="")?"":(pct?v*100:v);
  return `<input class="f" type="number" step="any" data-per="${id}" data-field="${field}" data-pct="${pct?1:0}" value="${disp}" placeholder="0">`;
}
function inpPerMargen(id,def){
  const pi=S.perInsert[id]||{}; const v=pi.margenObj;
  const disp=(v==null||v==="")?"":v*100;
  return `<input class="f" type="number" step="any" data-per="${id}" data-field="margenObj" data-pct="1" value="${disp}" placeholder="${(def*100).toFixed(1)}">`;
}
function insIdInput(i,id){
  return `<input class="f txt" style="width:92px" data-insid="${i}" value="${escapeHtml(id==null?'':id)}" placeholder="N° inserto">`;
}
function nextInsId(){
  const ids=new Set(S.inserts.map(x=>String(x.id))); let n=1;
  while(ids.has("NUEVO-"+n)) n++; return "NUEVO-"+n;
}
function clienteDe(ins){ return (ins&&ins.cliente)?String(ins.cliente).trim():""; }
function clienteLabel(ins){ return clienteDe(ins)||"Sin cliente"; }
function ensureClientes(){
  ensureFacturas();
  if(!Array.isArray(S.clientes)) S.clientes=[];
  // normalizar material de pieza guardado como texto ("1","2","3") a número
  (S.inserts||[]).forEach(i=>{ const pz=i&&i.diseno&&i.diseno.piezas; if(Array.isArray(pz)) pz.forEach(p=>{ if(p&&typeof p.mat==="string"){ const n=Number(p.mat); p.mat=(Number.isFinite(n)&&n>=1&&n<=3)?n:1; } }); });
  // migrar clientes capturados antes en perInsert
  S.inserts.forEach(i=>{ const pc=(S.perInsert[String(i.id)]||{}).cliente;
    if(pc&&!i.cliente){ i.cliente=String(pc).trim(); }
    if((S.perInsert[String(i.id)]||{}).cliente) delete S.perInsert[String(i.id)].cliente; });
  S.inserts.forEach(i=>{ const c=clienteDe(i); if(c&&!S.clientes.includes(c)) S.clientes.push(c); });
  S.clientes.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));
}
function sortInserts(){
  S.inserts.sort((a,b)=>String(a.id==null?"":a.id).localeCompare(String(b.id==null?"":b.id),undefined,{numeric:true,sensitivity:"base"}));
}
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||el.dataset.ov===undefined) return;
  const [grupo,clave]=String(el.dataset.ov).split("|");
  let v=null;
  if(el.value!==""){ v=parseFloat(el.value); if(el.dataset.pct==="1") v=v/100; }
  setValPeriodo(grupo,clave,v);
  save(); renderKPIs(); renderChain(); renderSection(current);
});
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||el.dataset.ind===undefined) return;
  const k=S.periodoVista||"catalogo"; if(k==="catalogo") return;
  const P=ensurePeriodo(k); if(!P.indirectos) P.indirectos={};
  if(el.value==="") delete P.indirectos[el.dataset.ind];
  else P.indirectos[el.dataset.ind]=parseFloat(el.value);
  save(); renderKPIs(); renderChain(); renderSection("indirectos");
});
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||el.dataset.mes===undefined) return;
  const P=ensurePeriodo(periodoKey()); const id=el.dataset.mes;
  if(!P.items[id]) P.items[id]={};
  if(el.dataset.campo==="inc"){ P.items[id].inc=el.checked; }
  else { P.items[id].vol=(el.value===""?null:parseFloat(el.value)); if(P.items[id].vol>0) P.items[id].inc=true; }
  save(); renderKPIs(); renderChain(); renderSection("mes");
});
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||el.dataset.frac===undefined) return;
  setPath(el.dataset.frac, parseFrac(el.value));
  save(); renderKPIs(); renderChain(); renderSection(current);
});
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||el.dataset.insid===undefined) return;
  const i=+el.dataset.insid; const old=String(S.inserts[i].id==null?"":S.inserts[i].id);
  const nv=el.value.trim();
  if(nv===old) return;
  if(nv!=="" && S.inserts.some((x,j)=>j!==i && String(x.id)===nv)){
    alert("Ya existe un inserto con el número "+nv+". Usa un número distinto.");
    el.value=old; return;
  }
  if(nv!==""){
    if(S.perInsert[old]){ S.perInsert[nv]=S.perInsert[old]; if(nv!==old) delete S.perInsert[old]; }
    S.ruta.forEach(r=>{ if(String(r.ins)===old) r.ins=nv; });
  }
  S.inserts[i].id=nv;
  sortInserts();
  save(); renderKPIs(); renderChain(); renderSection(current);
});
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||!el.dataset.per) return;
  const id=el.dataset.per, field=el.dataset.field;
  if(!S.perInsert[id]) S.perInsert[id]={};
  if(el.dataset.txt==="1"){ S.perInsert[id][field]=el.value.trim()||null; }
  else if(el.value===""){ S.perInsert[id][field]=null; }
  else { let val=parseFloat(el.value); if(el.dataset.pct==="1") val=val/100; S.perInsert[id][field]=val; }
  save(); renderKPIs(); renderChain(); renderSection(current);
});

/* ---------- COSTEO DE PLACAS (diseño de material por inserto) ---------- */
let disenoSel=null;
let cliVista="(todos)";
function secDiseno(R){
  if(!S.inserts.length) return head("Costeo de placas","INSERTO","")+`<div class="note">Aún no hay insertos. Escribe el número del primero y oprime <b>+ Crear inserto</b>.</div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:10px">
      <input id="newInsId" class="f txt" style="width:170px" placeholder="Número del nuevo inserto" data-enter="addNamedInsert()">
      <button class="btn primary" data-click="addNamedInsert()">+ Crear inserto</button></div>`;
  if(disenoSel==null||!S.inserts.some(x=>String(x.id)===String(disenoSel))) disenoSel=String(S.inserts[0].id);
  const idx=S.inserts.findIndex(x=>String(x.id)===String(disenoSel));
  const ins=S.inserts[idx]; ensureDiseno(ins);
  const dz=disenoCalc(ins)||{mats:ins.diseno.materiales.map(matEff),piezas:[],totalUSD:0};
  const it=R.integral.find(x=>String(x.ins.id)===String(disenoSel))||{};
  const catNames=(S.catalogo||[]).map(m=>m.nombre);
  const insOpts=S.inserts.map(x=>`<option ${String(x.id)===String(disenoSel)?'selected':''}>${escapeHtml(String(x.id))}</option>`).join("");

  const matRows=[0,1,2].map(k=>{
    const slot=ins.diseno.materiales[k]||{}; const eff=matEff(slot);
    const delCat=!!catFind(slot.nombre);
    return `<tr>
      <td class="l mono">M${k+1}</td>
      <td class="l">${selRaw(`inserts.${idx}.diseno.materiales.${k}.nombre`,["(manual)"].concat(catNames),slot.nombre||"(manual)")}</td>
      <td>${delCat?`<span class="val-link mono" title="Del catálogo">${fUSD(eff.precio)}</span>`:ovInput(`inserts.${idx}.diseno.materiales.${k}.precio`,'$ placa')}</td>
      <td>${delCat?`<span class="val-link mono" title="Del catálogo">${toFrac(eff.largo)||'—'}</span>`:fracInput(`inserts.${idx}.diseno.materiales.${k}.largo`,'in')}</td>
      <td>${delCat?`<span class="val-link mono" title="Del catálogo">${toFrac(eff.ancho)||'—'}</span>`:fracInput(`inserts.${idx}.diseno.materiales.${k}.ancho`,'in')}</td>
      <td>${delCat?`<span class="val-link mono" title="${eff.bloque?'Espesor del bloque según el proveedor (fijo)':'Grosor del material seleccionado'}">${toFrac(eff.grosor)||'—'}${eff.bloque?'<span class="unit">bloque</span>':''}</span>`:fracInput(`inserts.${idx}.diseno.materiales.${k}.grosor`,'in')}</td>
      <td class="mono val-calc">${(eff.largo>0&&eff.ancho>0)?fN(eff.largo*eff.ancho,0)+' in²':'—'}</td></tr>`;
  }).join("");

  const pRows=dz.piezas.map((p,j)=>`<tr>
    <td class="l">${selRaw(`inserts.${idx}.diseno.piezas.${j}.comp`,(COMPONENTES.includes(p.comp)?COMPONENTES:[p.comp||""].concat(COMPONENTES)),p.comp||"Tapa / Base")}</td>
    <td>${fracInput(`inserts.${idx}.diseno.piezas.${j}.m1`,'0')}</td>
    <td>${fracInput(`inserts.${idx}.diseno.piezas.${j}.m2`,'0')}</td>
    <td><select class="f" data-path="inserts.${idx}.diseno.piezas.${j}.mat" data-type="num" data-pct="0">${[1,2,3].map(o=>`<option value="${o}" ${o===(num(p.mat)||1)?"selected":""}>${o}</option>`).join("")}</select></td>
    <td>${p.esBloque?fracInput(`inserts.${idx}.diseno.piezas.${j}.grosor`,'0'):`<span class="mono val-link" title="Grosor del material asignado">${(function(){const M=dz.mats[(num(p.mat)||1)-1]||{};return M.grosor>0?toFrac(M.grosor):'<span class="hint">—</span>';})()}</span>`}</td>
    <td>${inp(`inserts.${idx}.diseno.piezas.${j}.cant`)}</td>
    <td class="${p.esSuaje?'':'sua-off'}" title="Medidas del hueco suajado (material recuperable)">${p.esSuaje?fracInput(`inserts.${idx}.diseno.piezas.${j}.s1`,'0'):'<span class="hint">—</span>'}</td>
    <td class="${p.esSuaje?'':'sua-off'}">${p.esSuaje?fracInput(`inserts.${idx}.diseno.piezas.${j}.s2`,'0'):'<span class="hint">—</span>'}</td>
    <td class="${p.esSuaje?'':'sua-off'}" title="Un suaje por pieza: igual a la cantidad por inserto">${p.esSuaje?`<span class="mono val-calc">${fN(num(p.cant),0)}</span>`:'<span class="hint">—</span>'}</td>
    <td class="mono val-calc" title="Área recuperada que NO se costea">${p.esSuaje?fPct(p.recPct):'<span class="hint">—</span>'}</td>
    <td class="mono val-calc" title="${p.esBloque?('Bloque: '+p.capas+' capa(s) de '+toFrac(num(p.grosor))+'\" × '+p.pppArea+' pzas por capa'):'Piezas por placa'}">${p.esBloque?(p.pppArea+' × '+p.capas):(p.o1+' / '+p.o2)}</td>
    <td>${ovInput(`inserts.${idx}.diseno.piezas.${j}.piezasManual`,String(Math.max(p.o1,p.o2)))}</td>
    <td class="mono val-calc">${fPct(p.aprov)}</td>
    <td class="mono val-calc" title="${p.esSuaje?('Bruto '+fUSD(p.costoBruto)+' menos el suaje recuperado'):''}">${fUSD(p.costoUnit)}</td>
    <td class="mono val-calc" style="font-weight:700">${fUSD(p.costoInserto)}</td>
    <td><button class="del" data-click="delPieza(${idx},${j})">✕</button></td></tr>`).join("");

  const q26=num(ins.q26), matUSD=dz.totalUSD, util=q26-matUSD, matMXN=matUSD*R.tc;
  const catRows=(S.catalogo||[]).map((m,k)=>`<tr>
    <td class="l">${inp(`catalogo.${k}.nombre`,{type:"text",cls:"txt wide"})}</td>
    <td>${fracInput(`catalogo.${k}.grosor`,'in')}</td>
    <td>${fracInput(`catalogo.${k}.ancho`,'in')}</td>
    <td>${fracInput(`catalogo.${k}.largo`,'in')}</td>
    <td>${inp(`catalogo.${k}.costo`)}</td>
    <td><button class="del" data-click="delMaterial(${k})">✕</button></td></tr>`).join("");

  return head("Costeo de placas — optimización de corte","INSERTO (hoja individual del Excel)",
    "Aquí capturas lo que antes vivía en la hoja de cada inserto: las placas de foam (hasta 3 materiales), las piezas (base, laterales, tapa…) con sus medidas y cantidad, y el aprovechamiento por placa. El costo del material resultante alimenta automáticamente el <b>Costeo mensual</b>. Las medidas aceptan <b>fracciones</b> (ej. <b>17 3/4</b>, <b>3/8</b>) o decimales. Piezas por placa = máximo entre las dos orientaciones; puedes forzar el valor real de tu corte optimizado.")
  +`<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div class="exsel" style="display:inline-flex"><span>Cliente</span>
        <select data-change="setClienteInserto(${idx},this.value)">
          <option value="">Sin cliente</option>
          ${(S.clientes||[]).map(c=>`<option ${clienteDe(ins)===c?'selected':''}>${escapeHtml(c)}</option>`).join("")}
        </select></div>
      <div style="display:flex;gap:6px;align-items:center">
        <input id="newCliId" class="f txt" style="width:150px" placeholder="Nuevo cliente" data-enter="addCliente()">
        <button class="btn" data-click="addCliente()">+ Cliente</button>
      </div>
      <div class="exsel" style="display:inline-flex"><span>Inserto</span>
        <select data-change="setDiseno(this.value)">${insOpts}</select></div>
      <button class="btn" style="border-color:var(--red);color:var(--red)" data-click="delInsert(${idx})">Eliminar inserto</button>
      <div style="display:flex;gap:6px;align-items:center">
        <input id="newInsId" class="f txt" style="width:170px" placeholder="Número del nuevo inserto" data-enter="addNamedInsert()">
        <button class="btn primary" data-click="addNamedInsert()">+ Crear inserto</button>
      </div>
    </div>
    <div class="hint" style="margin:-8px 0 12px">Insertos de <b>${escapeHtml(clienteLabel(ins))}</b>: ${escapeHtml(S.inserts.filter(x=>clienteLabel(x)===clienteLabel(ins)).map(x=>String(x.id)).join(", ")||"—")}</div>

    <div class="card"><h3>Placas / materiales del inserto (hasta 3)</h3><div class="body"><div class="scroll" style="border:0;box-shadow:none">
      <table><thead><tr><th class="l">#</th><th class="l">Material (catálogo o manual)</th><th>Precio placa $</th><th>Largo in</th><th>Ancho in</th><th>Grosor in</th><th>Área placa</th></tr></thead>
      <tbody>${matRows}</tbody></table></div>
      <div class="hint" style="padding:6px 12px">Elige el material del catálogo y su precio y medidas se toman solos (déjalos en blanco para usar el catálogo, o captura un valor para sobreescribir). Usa "(manual)" para un material fuera del catálogo.</div></div></div>

    <div class="card" style="margin-top:16px"><h3>Piezas / componentes</h3><div class="body"><div class="scroll" style="border:0;box-shadow:none">
      <table class="compact"><thead><tr><th class="l">Componente</th><th>Medida 1<br>in</th><th>Medida 2<br>in</th><th>Mat.</th><th>Grosor<br>in</th><th>Cant./<br>inserto</th>
      <th title="Solo para Placa suajada">Suaje<br>med. 1</th><th title="Solo para Placa suajada">Suaje<br>med. 2</th><th title="Un suaje por pieza; igual a la cantidad por inserto">N°<br>suajes</th><th title="Área recuperada que no se costea">Recup.</th>
      <th>Pzas/placa<br>(o1/o2 · bloque)</th><th>Pzas/placa<br>(usar)</th><th>Aprov.</th><th>Costo<br>unit. $</th><th>Costo<br>inserto $</th><th></th></tr></thead>
      <tbody>${pRows||`<tr><td colspan="12" class="l" style="color:var(--muted2)">Sin piezas. Agrega la primera con el botón de abajo.</td></tr>`}</tbody></table></div>
      <div class="hint" style="padding:6px 12px">Las medidas aceptan fracciones (17 3/4). El <b>grosor</b> lo toma del material seleccionado. La excepción es el <b>BUN</b> (bloque de poliuretano), que se reconoce solo: ahí capturas el <b>grosor de cada pieza</b> en su renglón (el espesor del bloque es fijo del catálogo) y el sistema calcula cuántas capas salen. En <b>Placa suajada</b>, captura las medidas del hueco: esa área se descuenta del costo porque el material recuperado se reutiliza en otro inserto — no es merma. El <b>N° de suajes</b> es fijo (un suaje por pieza), así que equivale a la cantidad por inserto.</div>
      <button class="rowbtn" data-click="addPieza(${idx})">+ Agregar pieza</button></div></div>

    <div class="grid2" style="margin-top:16px">
      <div class="card"><h3>Resultado del inserto ${escapeHtml(String(ins.id))}</h3><div class="pad"><table>
        <tr class="total"><td class="l">Costo de material (Q25)</td><td class="mono">${fUSD(matUSD)}</td></tr>
        <tr><td class="l">Material en pesos (× TC ${fN(R.tc,4)})</td><td class="mono val-calc">${fMXN(matMXN)}</td></tr>
        <tr><td class="l">Precio cliente (US$, editable)</td><td>${inp(`inserts.${idx}.q26`)}</td></tr>
        <tr><td class="l">Contribución antes de conversión</td><td class="mono val-calc">${fUSD(util)}</td></tr>
        <tr><td class="l">Contribución % sobre venta</td><td class="mono val-calc">${q26>0?fPct(util/q26):'—'}</td></tr>
      </table><div class="note" style="margin-top:10px">Este costo de material entra al <b>Costeo mensual</b> como material del inserto. La utilidad final se calcula ahí, ya con mano de obra e indirectos de la <b>Ruta de proceso</b>.</div></div></div>
      <div class="card"><h3>Desglose por pieza</h3><div class="body"><table>
        <thead><tr><th class="l">Componente</th><th>Mat.</th><th>Costo inserto</th><th>% del material</th></tr></thead>
        <tbody>${dz.piezas.map(p=>`<tr><td class="l">${escapeHtml(String(p.comp||''))}</td><td class="mono">M${p.mat||1}</td>
          <td class="mono val-calc">${fUSD(p.costoInserto)}</td><td class="mono">${matUSD>0?fPct(p.costoInserto/matUSD):'—'}</td></tr>`).join("")||`<tr><td colspan="4" class="l" style="color:var(--muted2)">—</td></tr>`}</tbody></table></div></div>
    </div>

    <div class="card" style="margin-top:16px"><h3>Catálogo de placas (materiales) <span class="hint" style="font-weight:400">— compartido por todos los insertos</span></h3><div class="body"><div class="scroll" style="border:0;box-shadow:none">
      <table><thead><tr><th class="l">Material</th><th>Grosor in</th><th>Ancho in</th><th>Largo in</th><th>Costo placa $</th><th></th></tr></thead>
      <tbody>${catRows}</tbody></table></div>
      <button class="rowbtn" data-click="addMaterial()">+ Agregar material</button>
      <div class="hint" style="padding:6px 12px">Al actualizar el precio o medida de una placa aquí, se recalculan todos los insertos que la usan.</div></div></div>`;
}

/* ---------- DIAGRAMA DE CORTE (orientación óptima) ---------- */
const NESTPAL=['#2f9e8f','#0d7d8c','#6bbf9e','#e0a800','#cf3f52','#7d6bbf','#c98a3a','#3a86c9'];
function cutCalc(p,mat){
  const L=num(mat.largo),A=num(mat.ancho),m1=num(p.m1),m2=num(p.m2);
  if(!(L>0&&A>0&&m1>0&&m2>0)) return null;
  const o1=Math.floor(L/m1)*Math.floor(A/m2), o2=Math.floor(L/m2)*Math.floor(A/m1);
  const useO2=o2>o1, cols=useO2?Math.floor(L/m2):Math.floor(L/m1), rows=useO2?Math.floor(A/m1):Math.floor(A/m2);
  const ppp=Math.max(o1,o2), aprov=(L*A>0)?(ppp*m1*m2)/(L*A):0;
  return {L,A,m1,m2,o1,o2,useO2,cols,rows,pw:(useO2?m2:m1),ph:(useO2?m1:m2),ppp,aprov};
}
function plateSVG(p,mat){
  const d=cutCalc(p,mat); if(!d) return null;
  const maxW=380,maxH=250, scale=Math.min(maxW/d.L,maxH/d.A), w=d.L*scale, h=d.A*scale;
  const esSuaje=(p.comp==="Placa suajada");
  const s1=num(p.s1),s2=num(p.s2);
  let rects="";
  for(let r=0;r<d.rows;r++) for(let c=0;c<d.cols;c++){
    const x=c*d.pw*scale, y=r*d.ph*scale, pw=d.pw*scale-1, ph=d.ph*scale-1;
    rects+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="1.5" fill="#2f9e8f" stroke="#ffffff" stroke-width="0.8"/>`;
    if(esSuaje&&s1>0&&s2>0){
      const hw=Math.min(pw*0.92,(d.useO2?s2:s1)*scale), hh=Math.min(ph*0.92,(d.useO2?s1:s2)*scale);
      if(hw>0&&hh>0) rects+=`<rect x="${(x+(pw-hw)/2).toFixed(1)}" y="${(y+(ph-hh)/2).toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}" rx="1" fill="#9ec9e8" stroke="#ffffff" stroke-width="0.6"/>`;
    }
  }
  const svg=`<svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="100%" style="max-width:${w.toFixed(0)}px;height:auto;display:block;border-radius:6px">
    <defs><pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="#cbd3da" stroke-width="2"/></pattern></defs>
    <rect x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#hatch)" stroke="#98a2ac" stroke-width="1.2"/>${rects}</svg>`;
  return {svg,cols:d.cols,rows:d.rows,ppp:d.ppp,aprov:d.aprov,useO2:d.useO2,o1:d.o1,o2:d.o2,esSuaje};
}
function fillPlateMixed(types,L,A){
  const minArea=Math.min(...types.map(t=>t.w*t.h));
  const reps=Math.max(2,Math.ceil((L*A)/(minArea*types.reduce((a,t)=>a+Math.max(1,t.cant),0)))+2);
  let pool=[];
  for(let r=0;r<reps;r++) types.forEach(t=>{ for(let i=0;i<Math.max(1,Math.round(t.cant));i++) pool.push(t); });
  pool.sort((a,b)=>b.h-a.h);
  const shelves=[]; const placements=[]; let used=0, totalH=0; const tally={};
  for(const t of pool){
    let w=t.w,h=t.h; if(w>L){[w,h]=[h,w];} if(w>L||h>A) continue;
    let sh=shelves.find(s=> s.usedW+w<=L+1e-6 && h<=s.h+1e-6);
    if(!sh && totalH+h<=A+1e-6){ sh={y:totalH,h:h,usedW:0}; shelves.push(sh); totalH+=h; }
    if(!sh) continue;
    placements.push({x:sh.usedW,y:sh.y,w,h,color:t.color}); sh.usedW+=w; used+=w*h;
    tally[t.comp]=(tally[t.comp]||0)+1;
  }
  return {placements,used,aprov:(L*A>0?used/(L*A):0),tally,total:placements.length};
}
function nestPlateSVG(placements,L,A){
  const maxW=380,maxH=250, scale=Math.min(maxW/L,maxH/A), w=L*scale, h=A*scale;
  const rects=placements.map(p=>`<rect x="${(p.x*scale).toFixed(1)}" y="${(p.y*scale).toFixed(1)}" width="${(p.w*scale-1).toFixed(1)}" height="${(p.h*scale-1).toFixed(1)}" rx="1.2" fill="${p.color}" stroke="#ffffff" stroke-width="0.7"/>`).join("");
  return `<svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="100%" style="max-width:${w.toFixed(0)}px;height:auto;display:block;border-radius:6px">
    <defs><pattern id="hatch2" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="#cbd3da" stroke-width="2"/></pattern></defs>
    <rect width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#hatch2)" stroke="#98a2ac" stroke-width="1.2"/>${rects}</svg>`;
}
function secDiagrama(R){
  if(!S.inserts.length) return head("Diagrama de corte","")+`<div class="note">Aún no hay insertos. Agrégalos en Costeo de placas.</div>`;
  if(disenoSel==null||!S.inserts.some(x=>String(x.id)===String(disenoSel))) disenoSel=String(S.inserts[0].id);
  const idx=S.inserts.findIndex(x=>String(x.id)===String(disenoSel));
  const ins=S.inserts[idx]; ensureDiseno(ins);
  const dz=disenoCalc(ins)||{mats:ins.diseno.materiales.map(matEff),piezas:[]};
  const insOpts=S.inserts.filter(pasaCliente).map(x=>`<option ${String(x.id)===String(disenoSel)?'selected':''}>${escapeHtml(String(x.id))}</option>`).join("");
  let blocks="", usedArea=0, plateAreaTot=0, hay=false;
  dz.piezas.forEach(p=>{
    const mat=dz.mats[(num(p.mat)||1)-1]||matEff({});
    const d=plateSVG(p,mat);
    if(!d){
      blocks+=`<div class="card" style="margin-top:14px"><h3>${escapeHtml(p.comp||'Pieza')}</h3><div class="pad"><div class="note">Captura las medidas de la pieza y de la placa (en Costeo de placas) para ver su diagrama de corte.</div></div></div>`;
      return;
    }
    hay=true;
    usedArea+=d.ppp*num(p.m1)*num(p.m2); plateAreaTot+=num(mat.largo)*num(mat.ancho);
    const merma=1-d.aprov;
    blocks+=`<div class="card" style="margin-top:14px"><h3>${escapeHtml(p.comp||'Pieza')} <span class="hint" style="font-weight:400">· ${escapeHtml(mat.nombre||('Material '+(p.mat||1)))}</span></h3>
      <div class="pad"><div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:280px">${d.svg}
          <div class="legend" style="margin-top:8px"><span><span class="sw" style="background:#2f9e8f"></span>Aprovechado (${d.ppp} pzas)</span>${d.esSuaje?'<span><span class="sw" style="background:#9ec9e8"></span>Suaje recuperado (no se costea)</span>':''}<span><span class="sw" style="background:#cbd3da"></span>Merma (recorte)</span></div></div>
        <div style="min-width:220px"><table>
          <tr><td class="l">Placa (largo × ancho)</td><td class="mono val-calc">${fN(num(mat.largo),1)} × ${fN(num(mat.ancho),1)} in</td></tr>
          <tr><td class="l">Pieza (med. 1 × med. 2)</td><td class="mono val-calc">${fN(num(p.m1),2)} × ${fN(num(p.m2),2)} in</td></tr>
          <tr><td class="l">Orientación óptima</td><td class="mono val-calc">${d.useO2?'Rotada 90° (Orient. 2)':'Normal (Orient. 1)'}</td></tr>
          <tr><td class="l">Acomodo (columnas × filas)</td><td class="mono val-calc">${d.cols} × ${d.rows}</td></tr>
          <tr class="total"><td class="l">Piezas por placa</td><td class="mono">${d.ppp}</td></tr>
          <tr><td class="l">Comparación O1 / O2</td><td class="mono val-calc">${d.o1} / ${d.o2}</td></tr>
          <tr><td class="l">Aprovechamiento</td><td class="mono" style="color:#0f7a3d;font-weight:700">${fPct(d.aprov)}</td></tr>
          <tr><td class="l">Merma</td><td class="mono" style="color:#a32636;font-weight:700">${fPct(merma)}</td></tr>
        </table></div>
      </div></div></div>`;
  });
  const aprovTot=plateAreaTot>0?usedArea/plateAreaTot:0;
  // Nesting combinado por material
  const compColors={}; let ci=0;
  dz.piezas.forEach(p=>{ if(!(p.comp in compColors)){ compColors[p.comp]=NESTPAL[ci%NESTPAL.length]; ci++; } });
  const byMat={0:[],1:[],2:[]};
  dz.piezas.forEach(p=>{ if(num(p.m1)>0&&num(p.m2)>0) byMat[(num(p.mat)||1)-1].push(p); });
  let nest="";
  [0,1,2].forEach(k=>{
    const mat=dz.mats[k]||matEff({}); const ps=byMat[k];
    if(!ps.length || !(num(mat.largo)>0&&num(mat.ancho)>0)) return;
    if(ps.length<2) return; // el nesting combinado aplica cuando hay 2+ piezas en la misma placa
    const types=ps.map(p=>({comp:p.comp,color:compColors[p.comp],w:Math.max(num(p.m1),num(p.m2)),h:Math.min(num(p.m1),num(p.m2)),cant:num(p.cant)||1}));
    const res=fillPlateMixed(types,num(mat.largo),num(mat.ancho));
    const tallyRows=Object.keys(res.tally).map(c=>`<tr><td class="l"><span class="sw" style="background:${compColors[c]}"></span>${escapeHtml(c)}</td><td class="mono val-calc">${res.tally[c]}</td></tr>`).join("");
    nest+=`<div class="card" style="margin-top:14px"><h3>Nesting combinado · ${escapeHtml(mat.nombre||('Material '+(k+1)))}</h3>
      <div class="pad"><div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:280px">${nestPlateSVG(res.placements,num(mat.largo),num(mat.ancho))}
          <div class="hint" style="margin-top:6px">Piezas de distintos componentes acomodadas juntas en una sola lámina.</div></div>
        <div style="min-width:220px"><table>
          <tr class="sub"><td class="l">Componente</td><td>Pzas en la lámina</td></tr>
          ${tallyRows}
          <tr class="total"><td class="l">Total por lámina (combinado)</td><td class="mono">${res.total}</td></tr>
          <tr><td class="l">Aprovechamiento combinado</td><td class="mono" style="color:#0f7a3d;font-weight:700">${fPct(res.aprov)}</td></tr>
          <tr><td class="l">Merma combinada</td><td class="mono" style="color:#a32636;font-weight:700">${fPct(1-res.aprov)}</td></tr>
        </table>
        <div class="note" style="margin-top:10px">Acomodo heurístico por hileras. Reduce merma cuando las piezas se complementan; si una pieza grande domina la lámina, puede rendir más cortándola sola (ver diagrama por pieza arriba).</div></div>
      </div></div></div>`;
  });
  const nestSec = nest ? `<div class="sechead" style="margin-top:20px"><h2 style="font-size:15px">Nesting combinado por material</h2></div>${nest}` : "";
  const resumen = hay ? `<div class="hero" style="margin-top:6px">
      ${hcard("Aprovechamiento promedio", fPct(aprovTot), "de la superficie de lámina", aprovTot>=0.85?"v":(aprovTot>=0.7?"a":"r"))}
      ${hcard("Merma promedio", fPct(1-aprovTot), "recorte de lámina", (1-aprovTot)<=0.15?"v":((1-aprovTot)<=0.3?"a":"r"))}
      ${hcard("Piezas / componentes", String(dz.piezas.length), "en este inserto")}
    </div>` : "";
  return head("Diagrama de corte — orientación óptima de láminas","OPTIMIZACIÓN DE CORTE",
    "Para cada pieza se dibuja la mejor orientación de corte en la lámina (la que rinde más piezas por placa), comparando las dos orientaciones. <b>Verde</b> = superficie aprovechada; <b>gris rayado</b> = merma (recorte). Cambia las medidas en Costeo de placas y el diagrama se actualiza.")
  +`<div class="filterbar">${clienteSelector("setCliDiagrama")}
      <div class="exsel" style="display:inline-flex"><span>Inserto</span>
        <select data-change="setDiagrama(this.value)">${insOpts}</select></div></div>
    ${resumen}${blocks}${nestSec}`;
}

/* ---------- COSTEO MENSUAL (insertos trabajados en el mes) ---------- */
function mesActual(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
function periodoKey(){ if(!S.periodoActivo) S.periodoActivo=mesActual(); return S.periodoActivo; }
function ensurePeriodo(k){ if(!S.periodos) S.periodos={}; if(!S.periodos[k]) S.periodos[k]={items:{}}; if(!S.periodos[k].items) S.periodos[k].items={}; return S.periodos[k]; }
function nombreMes(k){
  if(!k||!/^\d{4}-\d{2}$/.test(k)) return k||"";
  const [y,m]=k.split("-").map(Number);
  const N=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return (N[m-1]||"")+" "+y;
}
function periodoTieneDatos(k){
  const P=(S.periodos||{})[k]; if(!P) return false;
  const items=Object.values(P.items||{}).some(c=>c&&(c.inc||num(c.vol)>0));
  const otros=["indirectos","capacidad","energia","mano"].some(g=>P[g]&&Object.keys(P[g]).length);
  return items||otros;
}
function estadoPeriodo(k){
  if(!k||k==="catalogo"||String(k).indexOf("anio:")===0) return null;
  const P=(S.periodos||{})[k]||{};
  if(P.estado==="cerrado") return "cerrado";
  return periodoTieneDatos(k)?"borrador":"vacio";
}
function badgePeriodo(k){
  const e=estadoPeriodo(k); if(!e) return "";
  if(e==="cerrado") return `<span class="pill ok" title="Mes cerrado">Cerrado</span>`;
  if(e==="borrador") return `<span class="pill" style="background:var(--amberBg);color:#8a6100" title="Datos capturados sin cerrar">Borrador</span>`;
  return `<span class="pill" style="background:var(--grayBg);color:var(--muted)" title="Sin datos capturados">Sin datos</span>`;
}
function computeMes(R,k){
  const P=ensurePeriodo(k||periodoKey());
  const filas=R.integral.map((it,i)=>{
    const id=String(it.ins.id); const cfg=P.items[id]||{};
    const inc=cfg.inc===true; const vol=num(cfg.vol);
    const ventas=it.precioClMXN*vol;
    const costo=it.complete?it.costoIntegral*vol:null;
    const material=it.materialMXN*vol;
    const util=it.complete?it.utilidad*vol:null;
    return {it,i,id,inc,vol,ventas,costo,material,util,
            contrib:(it.precioClMXN-it.materialMXN)*vol};
  });
  const act=filas.filter(f=>f.inc&&f.vol>0);
  const comp=act.filter(f=>f.it.complete);
  const ventas=act.reduce((a,f)=>a+f.ventas,0);
  const material=act.reduce((a,f)=>a+f.material,0);
  const contrib=act.reduce((a,f)=>a+f.contrib,0);
  const costoAbs=comp.reduce((a,f)=>a+f.costo,0);
  const utilAbs=comp.reduce((a,f)=>a+f.util,0);
  const piezas=act.reduce((a,f)=>a+f.vol,0);
  const Pre=computePresupuesto(R);
  // Requerimiento de material del mes (consolidado por material)
  const pzRows=[]; const porMat={}; let matUSD=0;
  act.forEach(f=>{
    const dz=disenoCalc(f.it.ins); if(!dz) return;
    matUSD+=dz.totalUSD*f.vol;
    dz.piezas.forEach(p=>{
      const M=dz.mats[(num(p.mat)||1)-1]||matEff({});
      const nom=M.nombre||("Material "+(num(p.mat)||1));
      const tot=num(p.cant)*f.vol, frac=p.ppp>0?tot/p.ppp:0;
      pzRows.push({ins:f.id,comp:p.comp,mat:nom,tot,ppp:p.ppp,frac,placas:Math.ceil(frac-1e-9)});
      if(!porMat[nom]) porMat[nom]={nom,precio:M.precio,frac:0,costoTeo:0};
      porMat[nom].frac+=frac; porMat[nom].costoTeo+=p.costoInserto*f.vol;
    });
  });
  const mats=Object.values(porMat).map(m=>({...m,comprar:Math.ceil(m.frac-1e-9),costoPlacas:Math.ceil(m.frac-1e-9)*m.precio}));
  const totPlacasUSD=mats.reduce((a,m)=>a+m.costoPlacas,0);
  // Agrupación por cliente
  const porCli={};
  act.forEach(f=>{
    const cli=clienteLabel(f.it.ins);
    if(!porCli[cli]) porCli[cli]={cli,ins:0,piezas:0,ventas:0,costo:0,util:0,contrib:0,completos:0};
    const g=porCli[cli]; g.ins++; g.piezas+=f.vol; g.ventas+=f.ventas; g.contrib+=f.contrib;
    if(f.it.complete){ g.costo+=f.costo; g.util+=f.util; g.completos++; }
  });
  const clientes=Object.values(porCli).map(g=>({...g,margen:(g.ventas>0&&g.completos?g.util/g.ventas:null)}))
                   .sort((a,b)=>b.ventas-a.ventas);
  return {P,filas,act,comp,ventas,material,contrib,costoAbs,utilAbs,piezas,
          margen:(ventas>0?utilAbs/ventas:null), fijos:Pre.GF,
          utilOper:contrib-Pre.GF, incompletos:act.length-comp.length,
          pzRows,mats,matUSD,totPlacasUSD,clientes};
}
let cliFiltro="(todos)";
function secMes(R){
  const k=periodoKey(); const M=computeMes(R,k);
  const cliLista=["(todos)"].concat([...new Set(S.inserts.map(i=>clienteLabel(i)))].sort());
  if(!cliLista.includes(cliFiltro)) cliFiltro="(todos)";
  const rows=M.filas.filter(f=>cliFiltro==="(todos)"||clienteLabel(f.it.ins)===cliFiltro)
    .map(f=>{ const it=f.it, id=f.id, act=f.inc&&f.vol>0;
      const conv=it.mo+it.maq+it.ind;
      const gastosOp=it.admin+it.comercial+it.logistica+it.financiamiento+it.garantiaMXN;
      const tip=`Admin ${fMXN(it.admin)} · Comercial ${fMXN(it.comercial)} · Logística ${fMXN(it.logistica)} · Financ. ${fMXN(it.financiamiento)} · Garantías ${fMXN(it.garantiaMXN)}`;
      return `<tr${f.inc?'':' style="opacity:.5"'}>
    <td class="l"><label style="display:flex;align-items:center;gap:6px;cursor:pointer">
      <input type="checkbox" data-mes="${escapeHtml(id)}" data-campo="inc" ${f.inc?'checked':''}>
      <span class="mono">${escapeHtml(id)}</span></label></td>
    <td class="l" title="Se define en Costeo de placas">${escapeHtml(clienteLabel(it.ins))}</td>
    <td><input class="f" type="number" step="any" data-mes="${escapeHtml(id)}" data-campo="vol" value="${f.vol||''}" placeholder="0"></td>
    <td>${it.tieneDiseno?`<span class="val-link mono" title="Calculado en Costeo de placas">${fUSD(it.disenoUSD)}</span>`:inp(`inserts.${f.i}.q25`)}</td>
    <td>${inpPer(id,"mermaMat",true)}</td>
    <td class="mono val-calc" title="Material en pesos con merma y TC">${fMXN(it.materialMXN)}</td>
    <td class="mono val-calc" title="Mano de obra + indirectos de la ruta">${conv?fMXN(conv):'—'}</td>
    <td class="mono val-calc" title="${escapeHtml(tip)}">${fMXN(gastosOp)}</td>
    <td class="mono val-calc" style="font-weight:700">${it.complete?fMXN(it.costoIntegral):'<span class="val-pend">INCOMP.</span>'}</td>
    <td>${inpPerMargen(id,it.margenObj)}</td>
    <td class="mono val-calc">${it.precioSug==null?'—':fMXN(it.precioSug)}</td>
    <td title="${escapeHtml('En pesos: '+fMXN(it.precioClMXN))}">${inp(`inserts.${f.i}.q26`)}</td>
    <td class="mono val-calc">${act?fMXN(f.ventas):'—'}</td>
    <td class="mono val-calc" style="font-weight:700">${act&&it.complete?fMXN(f.util):'—'}</td>
    <td class="mono" title="Markup ${it.markup==null?'—':fPct(it.markup)}">${it.margenReal==null?'—':fPct(it.margenReal)}</td></tr>`; }).join("");
  const hist=Object.keys(S.periodos||{}).sort().reverse();
  return head("Costeo mensual — insertos trabajados en el mes","REPORTE POR PERIODO",
    "Selecciona el mes y marca qué insertos se trabajan, con su volumen del periodo. Aquí ves el costo integral completo de cada inserto (material, conversión de la <b>Ruta de proceso</b> y gastos de operación), su precio sugerido y su margen. Cada periodo se guarda por separado para consultarlo después.")
  +`<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <div class="exsel" style="display:inline-flex"><span>Periodo</span>
        <input type="month" class="f" style="width:140px" value="${escapeHtml(k)}" data-change="setPeriodo(this.value)"></div>
      <div class="exsel" style="display:inline-flex"><span>Cliente</span>
        <select data-change="setCliFiltro(this.value)">${cliLista.map(c=>`<option ${c===cliFiltro?'selected':''}>${escapeHtml(c)}</option>`).join("")}</select></div>
      ${badgePeriodo(k)}<span class="hint">${nombreMes(k)} · ${M.act.length} insertos · ${fN(M.piezas,0)} pzas${hist.length>1?(' · '+hist.length+' periodos guardados'):''}</span>
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button class="rowbtn" style="margin:0" data-click="mesTodos(true)">Marcar todos</button>
        <button class="rowbtn" style="margin:0" data-click="mesTodos(false)">Desmarcar</button>
        <button class="rowbtn" style="margin:0" data-click="mesCopiarVol()">Traer volúmenes del catálogo</button>
        <button class="rowbtn" style="margin:0" data-click="mesAplicarPanel()">Aplicar al panel</button>
        <button class="rowbtn" style="margin:0" data-click="mesCerrar()">${((S.periodos[k]||{}).estado==="cerrado")?"Reabrir mes":"Cerrar mes"}</button>
        ${esAdmin()?`<button class="rowbtn" style="margin:0;border-color:var(--red);color:var(--red)" data-click="mesBorrar()">Borrar mes</button>`:""}
      </div>
    </div>

    <div class="hero">
      ${hcard("Ventas del mes", fMXN0(M.ventas), nombreMes(k), "", true)}
      ${hcard("Costo integral", M.comp.length?fMXN0(M.costoAbs):"—", M.incompletos?(M.incompletos+" sin ruta"):"insertos completos", M.incompletos?"a":"v")}
      ${hcard("Utilidad del mes", M.comp.length?fMXN0(M.utilAbs):"—", M.margen!=null?("margen "+fPct(M.margen)):"captura volúmenes", M.utilAbs>0?"v":(M.comp.length?"r":"g"))}
      ${hcard("Piezas a producir", fN(M.piezas,0), M.act.length+" insertos activos")}
    </div>

    <div class="tabla-integral" style="margin-top:14px"><table class="compact"><thead><tr>
      <th class="l">Incluir / inserto</th><th class="l">Cliente</th><th>Vol.<br>del mes</th><th>Mat.<br>(USD)</th><th>%<br>Merma</th>
      <th>Material<br>u. (MXN)</th><th>Conversión<br>u. (MXN)</th><th>Gastos op.<br>u. (MXN)</th><th>Costo<br>integral u.</th>
      <th>Margen<br>obj.</th><th>Precio<br>sugerido u.</th><th>Precio cli.<br>u. (USD)</th>
      <th>Ventas<br>del mes</th><th>Utilidad<br>del mes</th><th>Margen<br>real</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr class="total"><td class="l">Totales del periodo</td><td></td><td class="mono">${fN(M.piezas,0)}</td>
        <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        <td class="mono">${fMXN(M.ventas)}</td><td class="mono">${fMXN(M.utilAbs)}</td>
        <td class="mono">${M.margen==null?'—':fPct(M.margen)}</td></tr></tfoot></table></div>
    <div class="note" style="margin-top:6px">Azul = dato editable. <b>Material US$</b> se calcula en Costeo de placas; si el inserto no tiene placas capturadas puedes escribirlo aquí. <b>% merma</b>, <b>margen objetivo</b> y <b>precio cliente US$</b> son datos del inserto (aplican en todos los meses); si dejas el margen vacío usa el objetivo global (${fPct(num(S.control.margenObj)+f("deltaMargen"))}). Pasa el cursor sobre <b>Gastos op.</b> para ver el desglose (admin, comercial, logística, financiamiento y garantías), sobre <b>Precio cli.</b> para verlo en pesos y sobre <b>Margen real</b> para el markup. Sin tiempos en Ruta de proceso el inserto queda <b>incompleto</b>.</div>

    <div class="grid2" style="margin-top:16px">
      <div class="card"><h3>Resultado del periodo · ${nombreMes(k)}</h3><div class="pad"><table class="fija">
        <tr><td class="l" style="width:58%">Ventas del mes</td><td class="mono val-calc">${fMXN(M.ventas)}</td></tr>
        <tr><td class="l">(−) Material</td><td class="mono val-calc">(${fMXN(M.material)})</td></tr>
        <tr class="sub"><td class="l">= Margen de contribución</td><td class="mono">${fMXN(M.contrib)}</td></tr>
        <tr><td class="l">(−) Gastos fijos del mes</td><td class="mono val-calc">(${fMXN(M.fijos)})</td></tr>
        <tr class="total"><td class="l">= Utilidad de operación</td><td class="mono">${fMXN(M.utilOper)}</td></tr>
      </table><div class="note" style="margin-top:10px">Lectura directa: contribución de lo que se produce este mes contra los gastos fijos del periodo.</div></div></div>
      <div class="card"><h3>Por absorción (costo integral)</h3><div class="pad"><table class="fija">
        <tr><td class="l" style="width:58%">Ventas del mes</td><td class="mono val-calc">${fMXN(M.ventas)}</td></tr>
        <tr><td class="l">(−) Costo integral de lo vendido</td><td class="mono val-calc">(${fMXN(M.costoAbs)})</td></tr>
        <tr class="total"><td class="l">= Utilidad del mes</td><td class="mono">${fMXN(M.utilAbs)}</td></tr>
        <tr><td class="l">Margen ponderado</td><td class="mono val-calc">${M.margen==null?'—':fPct(M.margen)}</td></tr>
        <tr><td class="l">Insertos sin costeo completo</td><td class="mono val-calc">${M.incompletos}</td></tr>
      </table><div class="note" style="margin-top:10px">Cada pieza ya absorbe su parte de conversión y gastos. Sólo incluye insertos con ruta capturada.</div></div></div>
    </div>

    ${(function(){ const F=computeFacturado(R,k); const Pj=proyectadoPeriodo(R,k); if(!F.n&&!F.lista.length) return `<div class="note" style="margin-top:16px">Aún no hay facturas de venta de ${nombreMes(k)}. Súbelas en <b>Facturas de venta</b> para comparar lo real contra lo proyectado.</div>`;
      const pc=pctCumpl(F.mxn,Pj.ventas);
      return `<div class="card" style="margin-top:16px"><h3>Proyectado vs. facturado (real) · ${nombreMes(k)}</h3><div class="pad"><table class="fija">
        <tr><th class="l" style="width:40%"></th><th>Proyectado</th><th>Facturado</th><th>Diferencia</th><th>Cumplimiento</th></tr>
        <tr><td class="l">Piezas</td><td class="mono val-calc">${fN(Pj.piezas,0)}</td><td class="mono val-calc" style="font-weight:700">${fN(F.piezas,0)}</td><td class="mono val-calc">${fN(F.piezas-Pj.piezas,0)}</td><td class="mono">${pctCumpl(F.piezas,Pj.piezas)==null?'—':fPct(pctCumpl(F.piezas,Pj.piezas))}</td></tr>
        <tr><td class="l">Ventas (MXN, antes de IVA)</td><td class="mono val-calc">${fMXN(Pj.ventas)}</td><td class="mono val-calc" style="font-weight:700">${fMXN(F.mxn)}</td><td class="mono val-calc">${fMXN(F.mxn-Pj.ventas)}</td><td class="l">${pc==null?'—':`<span class="lz ${luzCumpl(pc)}"><span class="b"></span>${fPct(pc)}</span>`}</td></tr>
        <tr><td class="l">Margen de contribución (ventas − material)</td><td class="mono val-calc">${fMXN(M.contrib)}</td><td class="mono val-calc" style="font-weight:700">${fMXN(F.contrib)}</td><td class="mono val-calc">${fMXN(F.contrib-M.contrib)}</td><td></td></tr>
        <tr class="total"><td class="l">Utilidad de operación (contribución − gastos fijos)</td><td class="mono">${fMXN(M.utilOper)}</td><td class="mono">${fMXN(F.contrib-M.fijos)}</td><td class="mono">${fMXN(F.contrib-M.fijos-M.utilOper)}</td><td></td></tr>
      </table><div class="note" style="margin-top:10px">${F.n} factura(s) vigente(s)${F.sinAsignar.length?(' · <b>'+F.sinAsignar.length+' concepto(s) sin inserto</b> por '+fMXN(F.sinMXN)+' (cuentan en ventas pero sin costo de material)'):''}. Detalle por inserto y por mes en <b>Facturas de venta</b>.</div></div></div>`; })()}

    ${M.clientes&&M.clientes.length?`
    <div class="sechead" style="margin-top:22px"><h2 style="font-size:15px">Resultado por cliente</h2>
      <span class="src">${M.clientes.length} cliente(s) en ${nombreMes(k)}</span></div>
    <div class="tabla-integral" style="margin-top:8px"><table class="compact"><thead><tr>
      <th class="l">Cliente</th><th>Insertos</th><th>Piezas</th><th>Ventas</th><th>Costo</th><th>Utilidad</th><th>Margen</th><th>% de ventas</th>
      </tr></thead><tbody>${M.clientes.map(g=>`<tr>
        <td class="l" style="font-weight:500">${escapeHtml(g.cli)}</td>
        <td class="mono">${g.ins}</td><td class="mono">${fN(g.piezas,0)}</td>
        <td class="mono val-calc">${fMXN(g.ventas)}</td>
        <td class="mono val-calc">${g.completos?fMXN(g.costo):'—'}</td>
        <td class="mono val-calc" style="font-weight:700">${g.completos?fMXN(g.util):'—'}</td>
        <td class="mono">${g.margen==null?'—':fPct(g.margen)}</td>
        <td class="mono val-calc">${M.ventas>0?fPct(g.ventas/M.ventas):'—'}</td></tr>`).join("")}
      </tbody><tfoot><tr class="total"><td class="l">Total del mes (todos los clientes)</td>
        <td class="mono">${M.act.length}</td><td class="mono">${fN(M.piezas,0)}</td>
        <td class="mono">${fMXN(M.ventas)}</td><td class="mono">${fMXN(M.costoAbs)}</td>
        <td class="mono">${fMXN(M.utilAbs)}</td><td class="mono">${M.margen==null?'—':fPct(M.margen)}</td>
        <td class="mono">100.0%</td></tr></tfoot></table></div>
    <div class="note" style="margin-top:8px">El cliente de cada inserto se define en <b>Costeo de placas</b>. El costeo mensual total siempre considera todos los insertos, sin importar el cliente.</div>`:''}

    ${M.pzRows.length?`
    <div class="sechead" style="margin-top:22px"><h2 style="font-size:15px">Requerimiento de material del mes</h2>
      <span class="src">consolidado de los insertos activos</span></div>
    <div class="grid2" style="margin-top:8px">
      <div class="card"><h3>Piezas a cortar</h3><div class="body">
        <table class="fija"><thead><tr>
          <th class="l" style="width:17%">Inserto</th><th class="l" style="width:27%">Componente</th><th style="width:17%">Piezas<br>totales</th>
          <th style="width:13%">Pzas/<br>placa</th><th style="width:13%">Placas<br>teórico</th><th style="width:13%">Placas a<br>cortar</th></tr></thead>
        <tbody>${M.pzRows.map(r=>`<tr><td class="l mono">${escapeHtml(r.ins)}</td><td class="l">${escapeHtml(String(r.comp||''))}</td>
          <td class="mono val-calc" style="font-weight:600">${fN(r.tot,0)}</td><td class="mono">${r.ppp}</td>
          <td class="mono val-calc">${fN(r.frac,2)}</td><td class="mono val-calc" style="font-weight:600">${r.placas}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h3>Costo del material total</h3><div class="body">
        <table class="fija"><thead><tr>
          <th class="l" style="width:24%">Material</th><th style="width:10%">Placas<br>teórico</th><th style="width:12%">Placas a<br>comprar</th>
          <th style="width:14%">Precio<br>placa</th><th style="width:19%">Costo<br>teórico</th><th style="width:21%">Costo placas<br>completas</th></tr></thead>
        <tbody>${M.mats.map(m=>`<tr><td class="l">${escapeHtml(m.nom)}</td><td class="mono val-calc">${fN(m.frac,2)}</td>
          <td class="mono val-calc" style="font-weight:600">${m.comprar}</td><td class="mono">${fUSD(m.precio)}</td>
          <td class="mono val-calc">${fUSD(m.costoTeo)}</td><td class="mono val-calc" style="font-weight:600">${fUSD(m.costoPlacas)}</td></tr>`).join("")}
          <tr class="total"><td class="l">Totales</td><td></td><td></td><td></td><td class="mono">${fUSD(M.matUSD)}</td><td class="mono">${fUSD(M.totPlacasUSD)}</td></tr>
        </tbody></table>
        <table class="fija" style="margin-top:2px">
          <tr><td class="l" style="width:58%">Costo material — teórico (MXN)<div class="hint">× TC ${fN(R.tc,4)}</div></td><td class="mono val-calc">${fMXN(M.matUSD*R.tc)}</td></tr>
          <tr><td class="l">Costo material — placas completas (MXN)</td><td class="mono val-calc">${fMXN(M.totPlacasUSD*R.tc)}</td></tr>
          <tr><td class="l">Ventas del mes (MXN)</td><td class="mono val-calc">${fMXN(M.ventas)}</td></tr>
          <tr class="total"><td class="l">${M.comp.length?'Utilidad del mes (MXN)':'Contribución del mes (MXN)'}</td><td class="mono">${M.comp.length?fMXN(M.utilAbs):fMXN(M.contrib)}</td></tr>
        </table>
        <div class="hint" style="padding:6px 12px">Costo teórico = consumo exacto de material. Costo por placas completas = redondeando a placas enteras a comprar${M.matUSD>0?(', desperdicio por placa incompleta '+fPct((M.totPlacasUSD-M.matUSD)/M.matUSD)):''}.</div></div></div>
    </div>`:''}`;
}

/* ===================== FACTURAS DE VENTA (CFDI XML) ===================== */
let facUltimo=null;
function ensureFacturas(){
  if(!Array.isArray(S.facturas)) S.facturas=[];
  if(!S.facturaMap||typeof S.facturaMap!=="object"||Array.isArray(S.facturaMap)) S.facturaMap={};
}
function limpiaTxt(s,max){ return String(s==null?"":s).replace(/[<>\u0000-\u0008]/g,"").replace(/\s+/g," ").trim().slice(0,max||200); }
function facSigno(fa){ return fa.tipo==="E"?-1:1; }
function facTC(fa,tcDef){ return (fa.moneda==="MXN"||fa.moneda==="XXX")?1:(num(fa.tc)>0?num(fa.tc):tcDef); }
function insDeConcepto(c){
  const n=String(c.n||"").trim(); if(!n) return null;
  const ids=new Set(S.inserts.map(i=>String(i.id)));
  const m=(S.facturaMap||{})[n]; if(m&&ids.has(String(m))) return String(m);
  if(ids.has(n)) return n;
  const low=n.toLowerCase(); const hit=S.inserts.find(i=>String(i.id).toLowerCase()===low);
  return hit?String(hit.id):null;
}
function enPeriodo(fecha,key){
  const m=String(fecha||"").slice(0,7);
  if(!key||key==="catalogo") return false;
  if(String(key).startsWith("anio:")) return m.slice(0,4)===String(key).slice(5);
  return m===key;
}
function computeFacturado(R,key){
  ensureFacturas();
  const byId=Object.fromEntries(R.integral.map(i=>[String(i.ins.id),i]));
  const lista=S.facturas.filter(fa=>enPeriodo(fa.fecha,key));
  const vig=lista.filter(fa=>!fa.cancelada);
  const porIns={}; const sinAsignar=[]; let mxn=0, piezas=0, material=0, utilidad=0, utilCompleta=true;
  vig.forEach(fa=>{
    const sg=facSigno(fa), tc=facTC(fa,R.tc);
    (fa.conceptos||[]).forEach(c=>{
      const q=num(c.q)*sg, imp=num(c.i)*sg*tc;
      mxn+=imp;
      const id=insDeConcepto(c);
      if(!id){ sinAsignar.push({n:c.n,d:c.d,q,imp,fecha:fa.fecha,uuid:fa.uuid}); return; }
      if(!porIns[id]) porIns[id]={q:0,mxn:0};
      porIns[id].q+=q; porIns[id].mxn+=imp; piezas+=q;
      const it=byId[id];
      if(it){ material+=it.materialMXN*q; if(it.complete) utilidad+=imp-it.costoIntegral*q; else utilCompleta=false; }
    });
  });
  const sinMXN=sinAsignar.reduce((a,c)=>a+c.imp,0);
  return {key,lista,vig,n:vig.length,canceladas:lista.length-vig.length,porIns,sinAsignar,sinMXN,mxn,piezas,material,
          contrib:mxn-sinMXN-material,utilidad,utilCompleta};
}
function proyectadoPeriodo(R,key){
  const getVol=volPeriodo(key); let ventas=0,piezas=0; const porIns={};
  R.integral.forEach(it=>{ const v=getVol(String(it.ins.id)); if(v>0){ porIns[String(it.ins.id)]=v; ventas+=it.precioClMXN*v; piezas+=v; } });
  return {ventas,piezas,porIns};
}
function parseCFDI(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,"application/xml");
  if(doc.getElementsByTagName("parsererror").length) throw new Error("el archivo no es un XML válido");
  const all=root=>[...root.getElementsByTagName("*")];
  const comp=all(doc).find(e=>e.localName==="Comprobante"); if(!comp) throw new Error("no es un CFDI (falta el nodo Comprobante)");
  const a=(e,k)=>e?(e.getAttribute(k)||""):"";
  const tipo=a(comp,"TipoDeComprobante");
  if(tipo==="P") throw new Error("es un complemento de pago, no una factura de venta");
  if(tipo!=="I"&&tipo!=="E") throw new Error("tipo de comprobante "+(tipo||"desconocido")+" no soportado");
  const tfd=all(doc).find(e=>e.localName==="TimbreFiscalDigital");
  const uuid=a(tfd,"UUID").toUpperCase();
  if(!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid)) throw new Error("no tiene timbre fiscal (UUID)");
  const kids=(e,name)=>[...e.children].filter(x=>x.localName===name);
  const em=kids(comp,"Emisor")[0], re=kids(comp,"Receptor")[0];
  const cont=kids(comp,"Conceptos")[0];
  const conceptos=(cont?kids(cont,"Concepto"):[]).map(c=>{
    const imp=num(a(c,"Importe")), des=num(a(c,"Descuento"));
    return {n:limpiaTxt(a(c,"NoIdentificacion"),80),d:limpiaTxt(a(c,"Descripcion"),200),
            q:num(a(c,"Cantidad")),u:num(a(c,"ValorUnitario")),i:Math.round((imp-des)*100)/100};
  });
  if(!conceptos.length) throw new Error("no tiene conceptos");
  if(conceptos.length>500) throw new Error("tiene más de 500 conceptos");
  const fecha=a(comp,"Fecha").slice(0,10);
  if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(fecha)) throw new Error("fecha inválida");
  let moneda=(a(comp,"Moneda")||"MXN").toUpperCase(); if(!/^[A-Z]{3}$/.test(moneda)) moneda="MXN";
  const tc=a(comp,"TipoCambio")?num(a(comp,"TipoCambio")):null;
  return {uuid,fecha,serie:limpiaTxt(a(comp,"Serie"),40),folio:limpiaTxt(a(comp,"Folio"),40),tipo,moneda,
    tc:(tc>0?tc:null),emisorRfc:limpiaTxt(a(em,"Rfc"),20),receptorRfc:limpiaTxt(a(re,"Rfc"),20),receptor:limpiaTxt(a(re,"Nombre"),200),
    subtotal:num(a(comp,"SubTotal")),total:num(a(comp,"Total")),conceptos};
}
function pctCumpl(real,proy){ return proy>0?real/proy:null; }
function luzCumpl(p){ return p==null?"g":(p>=1?"v":(p>=0.9?"a":"r")); }
function secFacturas(R){
  ensureFacturas();
  const k=periodoKey(); const F=computeFacturado(R,k); const Pj=proyectadoPeriodo(R,k);
  const byId=Object.fromEntries(R.integral.map(i=>[String(i.ins.id),i]));
  const cumpl=pctCumpl(F.mxn,Pj.ventas);
  // Comparativo por inserto
  const ids=[...new Set(Object.keys(Pj.porIns).concat(Object.keys(F.porIns)))]
    .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  let tPq=0,tFq=0,tPv=0,tFv=0;
  const cRows=ids.map(id=>{
    const it=byId[id]; const pq=Pj.porIns[id]||0, fq=(F.porIns[id]||{}).q||0, fv=(F.porIns[id]||{}).mxn||0;
    const pv=it?it.precioClMXN*pq:0; tPq+=pq; tFq+=fq; tPv+=pv; tFv+=fv;
    const pc=pctCumpl(fq,pq); const prom=fq?fv/fq:null;
    return `<tr><td class="l mono">${escapeHtml(id)}</td><td class="l">${escapeHtml(it?clienteLabel(it.ins):'—')}</td>
      <td class="mono val-calc">${fN(pq,0)}</td><td class="mono val-calc" style="font-weight:700">${fN(fq,0)}</td>
      <td class="mono val-calc" style="color:${fq-pq<0?'var(--red)':'inherit'}">${fq-pq>0?'+':''}${fN(fq-pq,0)}</td>
      <td class="l">${pc==null?'<span class="hint">sin proyección</span>':`<span class="lz ${luzCumpl(pc)}"><span class="b"></span>${fPct(pc)}</span>`}</td>
      <td class="mono val-calc">${fMXN(pv)}</td><td class="mono val-calc" style="font-weight:700">${fMXN(fv)}</td>
      <td class="mono val-calc" style="color:${fv-pv<0?'var(--red)':'inherit'}">${fMXN(fv-pv)}</td>
      <td class="mono val-calc" title="Precio de catálogo en pesos: ${it?fMXN(it.precioClMXN):'—'}">${prom==null?'—':fMXN(prom)}</td>
      <td class="mono val-calc">${it?fMXN(it.precioClMXN):'—'}</td></tr>`;
  }).join("");
  // Conceptos sin inserto
  const insOpts=S.inserts.map(i=>String(i.id));
  const sinRows=F.sinAsignar.map(c=>`<tr><td class="l mono">${escapeHtml(c.fecha)}</td><td class="l mono">${escapeHtml(c.n||'(vacío)')}</td>
      <td class="l">${escapeHtml(c.d)}</td><td class="mono">${fN(c.q,0)}</td><td class="mono val-calc">${fMXN(c.imp)}</td>
      <td class="l">${c.n?`<select class="f" data-facmap="${escapeHtml(c.n)}"><option value="">Asignar a…</option>${insOpts.map(o=>`<option>${escapeHtml(o)}</option>`).join("")}</select>`:'<span class="hint">sin No. de identificación</span>'}</td></tr>`).join("");
  // Facturas del periodo
  const fRows=F.lista.slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).map(fa=>{
    const tc=facTC(fa,R.tc); const sub=num(fa.subtotal)*facSigno(fa)*tc;
    const pend=(fa.conceptos||[]).filter(c=>!insDeConcepto(c)).length;
    return `<tr${fa.cancelada?' style="opacity:.5"':''}><td class="l mono">${escapeHtml(fa.fecha)}</td>
      <td class="l mono">${escapeHtml([fa.serie,fa.folio].filter(Boolean).join("-")||'—')}${fa.tipo==="E"?' <span class="tag">N. crédito</span>':''}</td>
      <td class="l">${escapeHtml(fa.receptor||fa.receptorRfc||'—')}</td>
      <td class="mono">${escapeHtml(fa.moneda)}${fa.moneda!=="MXN"?' · '+fN(tc,4):''}</td>
      <td class="mono val-calc">${fMXN(sub)}</td>
      <td class="mono">${(fa.conceptos||[]).length}${pend?` <span class="val-pend" title="Conceptos sin inserto">${pend} sin inserto</span>`:''}</td>
      <td class="l"><button class="rowbtn" style="margin:0" data-click="toggleFacCancelada('${fa.uuid}')">${fa.cancelada?'Cancelada · reactivar':'Vigente · cancelar'}</button></td>
      <td><button class="del" data-click="delFactura('${fa.uuid}')" title="Eliminar factura">✕</button></td></tr>`;
  }).join("");
  // Comparativo mensual del año
  const y=k.slice(0,4); let aPq=0,aFq=0,aPv=0,aFv=0,aN=0;
  const mRows=Array.from({length:12},(_,i)=>{
    const mk=y+"-"+String(i+1).padStart(2,"0");
    const p=proyectadoPeriodo(R,mk), fz=computeFacturado(R,mk);
    if(!p.piezas&&!fz.n) return `<tr style="opacity:.45"><td class="l">${nombreMes(mk)}</td><td class="mono">—</td><td class="mono">—</td><td></td><td class="mono">—</td><td class="mono">—</td><td></td><td class="mono">—</td></tr>`;
    aPq+=p.piezas; aFq+=fz.piezas; aPv+=p.ventas; aFv+=fz.mxn; aN+=fz.n;
    const pc=pctCumpl(fz.mxn,p.ventas);
    return `<tr${mk===k?' style="background:var(--accentSoft)"':''}><td class="l">${nombreMes(mk)}</td>
      <td class="mono val-calc">${fN(p.piezas,0)}</td><td class="mono val-calc" style="font-weight:700">${fN(fz.piezas,0)}</td>
      <td class="mono">${pctCumpl(fz.piezas,p.piezas)==null?'—':fPct(pctCumpl(fz.piezas,p.piezas))}</td>
      <td class="mono val-calc">${fMXN(p.ventas)}</td><td class="mono val-calc" style="font-weight:700">${fMXN(fz.mxn)}</td>
      <td class="l">${pc==null?'—':`<span class="lz ${luzCumpl(pc)}"><span class="b"></span>${fPct(pc)}</span>`}</td>
      <td class="mono">${fz.n}</td></tr>`;
  }).join("");
  const ult=facUltimo?`<div class="note" style="margin:0 0 12px">${facUltimo}</div>`:"";
  return head("Facturas de venta","CFDI · VENTAS REALES",
    "Sube los XML de tus facturas de venta (CFDI). Cada concepto se asigna al inserto cuyo número viene en <b>No. de identificación</b>. Lo facturado se compara contra el volumen proyectado del mes y se muestra como <b>real</b> en Costeo mensual, Presupuesto y equilibrio y el Panel ejecutivo, sin modificar lo proyectado.")
  +`<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <div class="exsel" style="display:inline-flex"><span>Periodo</span>
        <input type="month" class="f" style="width:140px" value="${escapeHtml(k)}" data-change="setPeriodo(this.value)"></div>
      <label class="btn primary" style="cursor:pointer">Subir XML de facturas
        <input type="file" accept=".xml,text/xml,application/xml" multiple style="display:none" data-change="subirFacturas(event)"></label>
      <span class="hint">${nombreMes(k)} · ${F.n} factura(s) vigente(s)${F.canceladas?(' · '+F.canceladas+' cancelada(s)'):''} · ${S.facturas.length} en total</span>
    </div>
    ${ult}
    <div class="hero">
      ${hcard("Facturado del mes",fMXN0(F.mxn),"antes de IVA · "+nombreMes(k),"",true)}
      ${hcard("Ventas proyectadas",fMXN0(Pj.ventas),"volumen del mes × precio cliente")}
      ${hcard("Cumplimiento",cumpl==null?"—":fPct(cumpl),cumpl==null?"sin volumen proyectado":(F.mxn-Pj.ventas>=0?"+":"")+fMXN0(F.mxn-Pj.ventas)+" vs. proyectado",luzCumpl(cumpl))}
      ${hcard("Piezas facturadas",fN(F.piezas,0),"vs. "+fN(Pj.piezas,0)+" proyectadas")}
    </div>
    <div class="sechead" style="margin-top:18px"><h2 style="font-size:17px">Proyectado vs. facturado por inserto</h2><span class="src">${nombreMes(k)}</span></div>
    ${ids.length?`<div class="tabla-integral" style="margin-top:8px"><table class="compact"><thead><tr>
      <th class="l">Inserto</th><th class="l">Cliente</th><th>Pzas<br>proyectadas</th><th>Pzas<br>facturadas</th><th>Diferencia<br>pzas</th><th class="l">Cumplimiento</th>
      <th>Ventas<br>proyectadas</th><th>Ventas<br>facturadas</th><th>Diferencia<br>$</th><th>Precio prom.<br>facturado</th><th>Precio<br>catálogo</th>
      </tr></thead><tbody>${cRows}</tbody>
      <tfoot><tr class="total"><td class="l">Totales</td><td></td><td class="mono">${fN(tPq,0)}</td><td class="mono">${fN(tFq,0)}</td><td class="mono">${fN(tFq-tPq,0)}</td>
        <td class="l">${pctCumpl(tFq,tPq)==null?'':fPct(pctCumpl(tFq,tPq))}</td><td class="mono">${fMXN(tPv)}</td><td class="mono">${fMXN(tFv)}</td><td class="mono">${fMXN(tFv-tPv)}</td><td></td><td></td></tr></tfoot></table></div>`
      :`<div class="note">No hay volumen proyectado ni facturas en ${nombreMes(k)}. Captura volúmenes en <b>Costeo mensual</b> o sube las facturas del mes.</div>`}
    ${F.sinAsignar.length?`
    <div class="sechead" style="margin-top:18px"><h2 style="font-size:17px">Conceptos sin inserto</h2><span class="src">${F.sinAsignar.length} concepto(s) · ${fMXN(F.sinMXN)}</span></div>
    <div class="tabla-integral" style="margin-top:8px"><table class="compact"><thead><tr>
      <th class="l">Fecha</th><th class="l">No. identificación</th><th class="l">Descripción</th><th>Cantidad</th><th>Importe MXN</th><th class="l">Inserto</th>
      </tr></thead><tbody>${sinRows}</tbody></table></div>
    <div class="note" style="margin-top:6px">Su No. de identificación no coincide con ningún inserto. Asígnalo y la app recordará la equivalencia para las siguientes facturas. Estos importes sí cuentan en el total facturado, pero no en el comparativo por inserto.</div>`:''}
    <div class="sechead" style="margin-top:18px"><h2 style="font-size:17px">Facturas de ${nombreMes(k)}</h2><span class="src">${F.lista.length} XML</span></div>
    ${F.lista.length?`<div class="tabla-integral" style="margin-top:8px"><table class="compact"><thead><tr>
      <th class="l">Fecha</th><th class="l">Serie-folio</th><th class="l">Cliente</th><th>Moneda · TC</th><th>Subtotal MXN</th><th>Conceptos</th><th class="l">Estado</th><th></th>
      </tr></thead><tbody>${fRows}</tbody></table></div>`:`<div class="note">Aún no hay facturas de este mes.</div>`}
    <div class="sechead" style="margin-top:18px"><h2 style="font-size:17px">Comparativo mensual ${y}</h2><span class="src">proyectado vs. facturado</span></div>
    <div class="tabla-integral" style="margin-top:8px"><table class="compact"><thead><tr>
      <th class="l">Mes</th><th>Pzas<br>proyectadas</th><th>Pzas<br>facturadas</th><th>% pzas</th><th>Ventas<br>proyectadas</th><th>Ventas<br>facturadas</th><th class="l">Cumplimiento $</th><th>Facturas</th>
      </tr></thead><tbody>${mRows}</tbody>
      <tfoot><tr class="total"><td class="l">Total ${y}</td><td class="mono">${fN(aPq,0)}</td><td class="mono">${fN(aFq,0)}</td><td class="mono">${pctCumpl(aFq,aPq)==null?'—':fPct(pctCumpl(aFq,aPq))}</td>
        <td class="mono">${fMXN(aPv)}</td><td class="mono">${fMXN(aFv)}</td><td class="mono">${pctCumpl(aFv,aPv)==null?'—':fPct(pctCumpl(aFv,aPv))}</td><td class="mono">${aN}</td></tr></tfoot></table></div>
    <div class="note" style="margin-top:8px">Importes antes de IVA (subtotal menos descuentos). Las facturas en dólares se convierten con el tipo de cambio del propio CFDI. Las notas de crédito (tipo E) restan. Las ventas proyectadas usan el precio cliente actual de cada inserto. Las facturas marcadas como canceladas no cuentan.</div>`;
}
document.addEventListener("change",e=>{
  const el=e.target; if(!el.dataset||el.dataset.facmap===undefined) return;
  ensureFacturas(); const n=el.dataset.facmap; if(!n||!el.value) return;
  S.facturaMap[n]=el.value;
  save(); renderKPIs(); renderChain(); renderSection(current); toast("Concepto "+n+" asignado al inserto "+el.value);
});

/* ---------- VALIDACIÓN ---------- */
function secValidacion(R){
  ensureFacturas(); let sinIns=0; S.facturas.filter(f=>!f.cancelada).forEach(f=>(f.conceptos||[]).forEach(c=>{ if(!insDeConcepto(c)) sinIns++; }));
  const rows=R.valid.concat([{k:"Conceptos facturados sin inserto",v:sinIns,rev:sinIns>0}]).map(v=>`<tr><td class="l">${v.k}</td><td class="mono val-calc">${v.v}</td>
    <td class="l"><span class="pill ${v.rev?'rev':'ok'}">${v.rev?'REVISAR':'OK'}</span></td></tr>`).join("");
  const pend=[];
  if(S.capacidad.horasUsadas==null) pend.push("Horas realmente utilizadas (Capacidad)");
  if(S.energia.reciboReal==null) pend.push("Recibo real de CFE (Energía)");
  if(R.moParams) {}
  const rutaPend=S.inserts.filter(ins=>!R.integral.find(x=>x.ins.id===ins.id&&x.conversion>0)).map(x=>x.id);
  return head("Validación","VALIDACION",
    "Controles de integridad. Ninguno marca OK cuando falta información; revisa todo lo que no esté en 0 / OK.")
  +`<div class="grid2">
    <div class="card"><h3>Controles</h3><div class="body"><table>${rows}</table></div></div>
    <div class="card"><h3>Pendientes por capturar</h3><div class="pad">
      <div class="note" style="border:0;background:none;padding:0">
        ${pend.length?"<b>Costos clave:</b><br>• "+pend.join("<br>• "):"Sin costos clave pendientes."}
        <br><br><b>Insertos sin ruta con tiempos:</b><br>${rutaPend.length?"• "+rutaPend.join(", "):"Ninguno"}
      </div></div></div>
  </div>`;
}

/* ===================== PANEL EJECUTIVO ===================== */
let CHARTS=[];
function mkChart(id,cfg){const el=document.getElementById(id);if(!el)return;try{CHARTS.push(new Chart(el,cfg));}catch(e){console.warn(e);}}
let sensMetric="tasa";
const PAL=['#2b5488','#2f9e8f','#6bbf9e','#b7d9a8','#e0a800','#cf3f52','#6c7a89','#8a97a3'];
const SEM={v:'#1f9d55',a:'#e0a800',r:'#cf3f52',g:'#b0bac3'};
function destroyCharts(){CHARTS.forEach(c=>{try{c.destroy();}catch(e){}});CHARTS=[];}

function secDashboard(R){
  const scn=S.control.escenario;
  const util=R.utilPct;
  const ready=R.readyCount, total=R.integral.length;
  const readyLuz = ready===0?"g":(ready<total?"a":"v");
  const bajoObj=R.integral.filter(i=>i.complete&&i.margenReal<i.margenObj).length;
  const bajoCosto=R.integral.filter(i=>i.complete&&i.utilidad<0).length;
  // Segundo hero adaptativo
  const margenCard = R.margenPond!=null
    ? hcard("Margen ponderado", fPct(R.margenPond), (R.margenPond>=(num(S.control.margenObj)+f("deltaMargen"))?"cumple objetivo":"bajo el objetivo"), R.margenPond<0?"r":(R.margenPond<(num(S.control.margenObj))?"a":"v"))
    : hcard("Margen ponderado", "—", "requiere ruta y volumen", "g");
  const ingresoCard = R.anyVol
    ? hcard("Ingreso mensual", fMXN0(R.ingresoMesTot), "de los insertos con volumen", "")
    : hcard("Contribución unit. prom.", fMXN(promedio(R.integral.map(i=>i.contribUnit))), "precio − material (antes de conversión)", "");
  const utilCard = R.anyVol && R.utilMesComp
    ? hcard("Utilidad mensual", fMXN0(R.utilMesComp), "insertos completos con volumen", R.utilMesComp<0?"r":"v")
    : hcard("Utilidad mensual", "—", "captura volumen y ruta", "g");
  const ociosaCard = R.ociosaCosto!=null
    ? hcard("Costo de capacidad ociosa", fMXN0(R.ociosaCosto), fN(R.ociosa,0)+" h/mes sin absorber", R.ociosa>0?"a":"v")
    : hcard("Capacidad ociosa", "—", "captura horas utilizadas", "g");

  return `
    <div class="exhead">
      <h2>Panel ejecutivo</h2>
      ${periodoSelector()}
      <span class="hint" style="margin-left:auto">${new Date().toLocaleDateString("es-MX",{day:'2-digit',month:'long',year:'numeric'})}</span>
    </div>
    <p class="lead">Indicadores para toma de decisiones. Todo se recalcula en vivo con los datos capturados en las demás secciones.</p>

    <div class="hero">
      ${hcard("Tipo de cambio "+(S.control.tcFecha?("· "+escapeHtml(String(S.control.tcFecha))):"(MXN/USD)"), "$"+fN(R.tc,4), "FIX efectivo", "", true)}
      ${hcard("Pool de manufactura", fMXN0(R.pool), "costo mensual a absorber")}
      ${hcard("Tasa de planta", R.tasaPlanta==null?"—":fMXN(R.tasaPlanta), "por hora productiva")}
      ${hcard("Capacidad práctica", fN(R.capPractica,0)+' <small>h/mes</small>', util==null?"utilización sin capturar":("utilización "+fPct(util)), util==null?"g":(util<0.7?"a":"v"))}
      ${hcard("Insertos costeados", ready+" / "+total, ready<total?(total-ready)+" requieren ruta":"todos completos", readyLuz)}
    </div>
    <div class="hero">
      ${margenCard}${ingresoCard}${utilCard}${ociosaCard}
    </div>

    <div class="exgrid">
      <div class="card"><h3>Salud del portafolio</h3><div class="chartbox"><canvas id="ch_health"></canvas></div></div>
      <div class="card"><h3>Estructura del pool de manufactura</h3><div class="chartbox"><canvas id="ch_pool"></canvas></div></div>
      <div class="card full"><h3>Precio cliente vs. costo por inserto <span class="hint" style="font-weight:400">(MXN/pza)</span></h3><div style="overflow-x:auto"><div class="chartbox tall" style="min-width:${Math.max(560,R.integral.length*46)}px"><canvas id="ch_price"></canvas></div></div></div>
      <div class="card full"><h3>Margen por inserto vs. objetivo</h3><div style="overflow-x:auto"><div class="chartbox tall" style="min-width:${Math.max(560,R.integral.length*46)}px"><canvas id="ch_margin"></canvas></div></div></div>
      <div class="card full"><h3>Decisiones sugeridas</h3><ul class="insights">${insights(R,bajoObj,bajoCosto)}</ul></div>
    </div>`;
}
function hcard(k,v,d,luz="",accent=false){
  return `<div class="hcard ${accent?'accent':''} ${luz}">${(!accent&&luz)?'<div class="bar"></div>':''}
    <div class="k">${k}</div><div class="v mono">${v}</div>${d?`<div class="d">${d}</div>`:''}</div>`;
}
function promedio(arr){const v=arr.filter(x=>isFinite(x)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;}
function insights(R,bajoObj,bajoCosto){
  const li=[]; const objG=num(S.control.margenObj)+f("deltaMargen");
  const inc=R.integral.filter(i=>!i.complete).length;
  if(inc>0) li.push(["info",`<b>${inc} de ${R.integral.length} insertos</b> requieren captura de tiempos de ruta para tener costo integral y precio válidos.`]);
  if(bajoCosto>0) li.push(["risk",`<b>${bajoCosto} inserto(s)</b> se venden por debajo de su costo integral: revisar precio o costo de inmediato.`]);
  const gap=R.integral.filter(i=>i.complete&&i.precioSug!=null&&i.precioClMXN<i.precioSug);
  if(gap.length>0) li.push(["warn",`<b>${gap.length} inserto(s)</b> por debajo del precio con margen objetivo (${fPct(objG)}): oportunidad de ajuste de precio.`]);
  // material share
  const comp=R.integral.filter(i=>i.complete);
  if(comp.length){ const ms=promedio(comp.map(i=>i.costoIntegral>0?i.materialMXN/i.costoIntegral:0));
    li.push(["info",`El material representa en promedio <b>${fPct(ms)}</b> del costo integral; es la palanca de negociación con proveedor más relevante.`]); }
  if(R.ociosaCosto!=null && R.ociosa>0) li.push(["warn",`La capacidad ociosa cuesta <b>${fMXN0(R.ociosaCosto)}/mes</b> (${fN(R.ociosa,0)} h sin absorber): más volumen o menos costo fijo mejora la tasa.`]);
  { const kv=S.periodoVista||"catalogo"; if(kv!=="catalogo"){ const F=computeFacturado(R,kv); if(F.n){ const Pj=proyectadoPeriodo(R,kv); const pc=pctCumpl(F.mxn,Pj.ventas);
      li.push([pc==null?"info":(pc>=1?"ok":"warn"),`Facturado en <b>${escapeHtml(etiquetaPeriodo(kv))}</b>: <b>${fMXN0(F.mxn)}</b> en ${F.n} factura(s)${pc==null?' (sin volumen proyectado para comparar)':(' — '+fPct(pc)+' de lo proyectado ('+fMXN0(Pj.ventas)+')')}.`]); } } }
  if(R.margenPond!=null) li.push([R.margenPond>=objG?"ok":"warn",`Margen ponderado del portafolio: <b>${fPct(R.margenPond)}</b> (objetivo ${fPct(objG)}).`]);
  return li.map(([k,t])=>`<li><span class="ic ${k}">${k==='ok'?'✓':k==='risk'?'!':k==='warn'?'▲':'i'}</span><span>${t}</span></li>`).join("");
}

function buildDashboardCharts(R){
  if(typeof Chart==="undefined") return;
  Chart.defaults.font.family="'IBM Plex Sans',sans-serif";
  Chart.defaults.font.size=11; Chart.defaults.color="#5f6d7a";
  const ids=R.integral.map(i=>i.ins.id);
  const mk=(id,cfg)=>{const el=document.getElementById(id);if(!el)return;try{CHARTS.push(new Chart(el,cfg));}catch(e){console.warn(e);}};

  // A. Salud del portafolio
  const cnt={v:0,a:0,r:0,g:0}; R.integral.forEach(i=>cnt[i.luz]++);
  mk("ch_health",{type:"doughnut",
    data:{labels:["Verde · cumple","Amarillo · bajo objetivo","Rojo · negativo","Incompleto"],
      datasets:[{data:[cnt.v,cnt.a,cnt.r,cnt.g],backgroundColor:[SEM.v,SEM.a,SEM.r,SEM.g],borderWidth:2,borderColor:"#fff"}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"right",labels:{boxWidth:12,padding:10}}}}});

  // B. Estructura del pool
  mk("ch_pool",{type:"doughnut",
    data:{labels:["Energía","Mano de obra directa","Indirectos fabriles"],
      datasets:[{data:[R.energiaSubtotal,R.moDirecta,R.indFabril],
        backgroundColor:[PAL[4],PAL[0],PAL[6]],borderWidth:2,borderColor:"#fff"}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"58%",
      plugins:{legend:{position:"right",labels:{boxWidth:12,padding:10}},
        tooltip:{callbacks:{label:c=>` ${c.label}: ${fMXN0(c.parsed)} (${fPct(c.parsed/R.pool)})`}}}}});

  // C. Precio vs costo por inserto
  const costo=R.integral.map(i=>i.complete?i.costoIntegral:i.materialMXN);
  const precio=R.integral.map(i=>i.precioClMXN);
  const sug=R.integral.map(i=>i.precioSug);
  mk("ch_price",{type:"bar",
    data:{labels:ids,datasets:[
      {label:"Costo (integral o material s/ruta)",data:costo,backgroundColor:PAL[6],borderRadius:4},
      {label:"Precio cliente",data:precio,backgroundColor:PAL[0],borderRadius:4},
      {label:"Precio sugerido (margen obj.)",data:sug,type:"line",borderColor:SEM.a,backgroundColor:SEM.a,
        borderWidth:2,borderDash:[5,4],pointRadius:3,pointBackgroundColor:SEM.a,spanGaps:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      scales:{y:{ticks:{callback:v=>"$"+v.toLocaleString("es-MX")}}},
      plugins:{legend:{position:"bottom",labels:{boxWidth:12,padding:12}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y==null?'—':fMXN(c.parsed.y)}`}}}}});

  // D. Margen por inserto
  const mg=R.integral.map(i=>i.complete?i.margenReal*100:(i.precioClMXN>0?i.contribUnit/i.precioClMXN*100:0));
  const cols=R.integral.map(i=>i.complete?SEM[i.luz]:"#cfd6dc");
  const obj=R.integral.map(i=>i.margenObj*100);
  mk("ch_margin",{type:"bar",
    data:{labels:ids,datasets:[
      {label:"Margen real % (o contribución % si s/ruta)",data:mg,backgroundColor:cols,borderRadius:4},
      {label:"Margen objetivo %",data:obj,type:"line",borderColor:"#16222e",borderWidth:2,borderDash:[5,4],pointRadius:0}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      scales:{y:{ticks:{callback:v=>v+"%"}}},
      plugins:{legend:{position:"bottom",labels:{boxWidth:12,padding:12}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fN(c.parsed.y,1)}%`}}}}});

}

/* ===================== PRESUPUESTO Y PUNTO DE EQUILIBRIO ===================== */
function volPeriodo(key){
  if(!key||key==="catalogo") return id=>num((S.perInsert[id]||{}).volumen);
  if(String(key).startsWith("anio:")){
    const y=String(key).slice(5);
    const ks=Object.keys(S.periodos||{}).filter(k=>k.indexOf(y+"-")===0);
    return id=>ks.reduce((a,k)=>{const c=((S.periodos[k]||{}).items||{})[id]||{}; return a+(c.inc?num(c.vol):0);},0);
  }
  const P=(S.periodos||{})[key]||{items:{}};
  return id=>{const c=(P.items||{})[id]||{}; return c.inc?num(c.vol):0;};
}
function etiquetaPeriodo(key){
  if(!key||key==="catalogo") return "Catálogo (volúmenes generales)";
  if(String(key).startsWith("anio:")) return "Año "+String(key).slice(5);
  return nombreMes(key);
}
function valPeriodo(grupo,clave,base){
  const k=S.periodoVista||"catalogo";
  const nn=v=>(v===undefined||v===null||v==="")?null:num(v);
  const get=mk=>{ const P=(S.periodos||{})[mk]; const g=P&&P[grupo]; return g?nn(g[clave]):null; };
  if(!k||k==="catalogo") return base;
  if(String(k).indexOf("anio:")===0){
    const ms=mesesDe(String(k).slice(5)); if(!ms.length) return base;
    const bs=nn(base);
    const vals=ms.map(mk=>{ const v=get(mk); return v==null?bs:v; }).filter(v=>v!=null);
    if(!vals.length) return base;
    return vals.reduce((a,b)=>a+b,0)/vals.length;
  }
  const v=get(k); return v==null?base:v;
}
function setValPeriodo(grupo,clave,valor){
  const k=S.periodoVista||"catalogo"; if(k==="catalogo"||String(k).indexOf("anio:")===0) return false;
  const P=ensurePeriodo(k); if(!P[grupo]) P[grupo]={};
  if(valor===null||valor==="") delete P[grupo][clave]; else P[grupo][clave]=valor;
  return true;
}
function periodoEditable(){ const k=S.periodoVista||"catalogo"; return String(k).indexOf("anio:")!==0; }
function indKey(it){ return String((it&&it.c)||"").trim(); }
function mesesDe(y){ return Object.keys(S.periodos||{}).filter(k=>k.indexOf(y+"-")===0).sort(); }
function montoIndirecto(it,key){
  const k=(key!==undefined)?key:(S.periodoVista||"catalogo");
  const base=num(it.m), id=indKey(it);
  const ovMes=mk=>{ const P=(S.periodos||{})[mk]; const o=P&&P.indirectos&&P.indirectos[id];
                    return (o===undefined||o===null||o==="")?null:num(o); };
  if(!k||k==="catalogo") return base;
  if(String(k).indexOf("anio:")===0){
    const ms=mesesDe(String(k).slice(5));
    if(!ms.length) return base;
    return ms.reduce((a,mk)=>{const v=ovMes(mk); return a+(v==null?base:v);},0)/ms.length;
  }
  const v=ovMes(k); return v==null?base:v;
}
function indirectoEditable(){ const k=S.periodoVista||"catalogo"; return String(k).indexOf("anio:")!==0; }
function perInput(grupo,clave,basePath,opts){
  opts=opts||{};
  const k=S.periodoVista||"catalogo";
  if(k==="catalogo") return inp(basePath,opts);
  const base=getPath(basePath);
  const val=valPeriodo(grupo,clave,base);
  if(!periodoEditable()) return `<span class="mono val-calc" title="Promedio de los meses capturados">${opts.pct?fPct(val):(val==null?'<span class="hint">—</span>':fN(num(val),opts.dec===undefined?2:opts.dec))}</span>`;
  const P=ensurePeriodo(k); const g=P[grupo]||{}; const ov=g[clave];
  let disp=(ov===undefined||ov===null||ov==="")?"":ov;
  if(opts.pct&&disp!=="") disp=+disp*100;
  let ph=(base==null||base==="")?(opts.ph||"0"):String(opts.pct?+base*100:base);
  return `<input class="f" type="number" step="any" data-ov="${escapeHtml(grupo)}|${escapeHtml(clave)}" data-pct="${opts.pct?1:0}" value="${disp}" placeholder="${escapeHtml(ph)}">`;
}
function avisoPeriodo(){
  const k=S.periodoVista||"catalogo";
  if(k==="catalogo") return "valores base del catálogo";
  if(!periodoEditable()) return "promedio de los meses capturados (solo lectura)";
  return "captura el valor de este mes; en blanco usa el del catálogo";
}
const confirmPinClear=false;
const ROLES={admin:"Administrador",captura:"Captura",consulta:"Consulta"};
let ROL="consulta";
function setRol(r){ ROL=r; }
function esAdmin(){ return ROL==="admin"; }
function puedeEditar(){ return ROL==="admin"||ROL==="captura"; }
function pedirPin(msg,onOk){ if(esAdmin()) onOk(); }
function clienteSelector(fn){
  const cur=cliVista||"(todos)";
  const lista=["(todos)"].concat([...new Set(S.inserts.map(i=>clienteLabel(i)))].sort());
  if(!lista.includes(cur)) cliVista="(todos)";
  return `<div class="exsel" style="display:inline-flex"><span>Cliente</span>
    <select data-change="${fn||'setCliVista'}(this.value)">
      ${lista.map(c=>`<option ${c===cliVista?'selected':''}>${escapeHtml(c)}</option>`).join("")}
    </select></div>`;
}
function pasaCliente(ins){ return cliVista==="(todos)"||clienteLabel(ins)===cliVista; }
function periodoSelector(){
  const cur=S.periodoVista||"catalogo";
  return `<div class="exsel" style="display:inline-flex"><span>Periodo</span>
    <select data-change="setPeriodoVista(this.value)">
      ${listaPeriodos().map(o=>`<option value="${escapeHtml(o.v)}" ${cur===o.v?'selected':''}>${escapeHtml(o.t)}</option>`).join("")}
    </select></div>`;
}
function listaPeriodos(){
  const ks=Object.keys(S.periodos||{}).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().reverse();
  const anios=[...new Set(ks.map(k=>k.slice(0,4)))].sort().reverse();
  return [{v:"catalogo",t:"Catálogo (volúmenes generales)"}]
    .concat(anios.map(y=>({v:"anio:"+y,t:"Año "+y})))
    .concat(ks.map(k=>({v:k,t:nombreMes(k)})));
}
function avgContribRatio(R){
  const arr=R.integral.filter(i=>i.precioClMXN>0).map(i=>i.contribUnit/i.precioClMXN);
  return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
}
function computePresupuesto(R,pk){
  const key=(pk!==undefined)?pk:(S.periodoVista||"catalogo");
  const gfManuf=R.pool, gfAdmin=R.indAdmin+R.moAdmin, gfComer=R.indComercial+R.moComercial,
        gfLog=R.indLog, gfFin=R.indFin, otros=num(S.presupuesto.otrosFijos);
  const GF=gfManuf+gfAdmin+gfComer+gfLog+gfFin+otros;
  const getVol=volPeriodo(key);
  const esAnio=String(key).indexOf("anio:")===0;
  const meses=esAnio?Math.max(1,Object.keys(S.periodos||{}).filter(k=>k.indexOf(String(key).slice(5)+"-")===0).length):1;
  let ventas=0, matMes=0;
  const fv=f("volumen");
  R.integral.forEach(i=>{ const v=getVol(String(i.ins.id))*fv; ventas+=i.precioClMXN*v; matMes+=i.materialMXN*v; });
  const contribMes=ventas-matMes;
  const conVol=ventas>0;
  const ratio=conVol?(ventas>0?contribMes/ventas:0):avgContribRatio(R);
  const GFper=GF*meses;
  const PE=ratio>0?GFper/ratio:null;
  const utilOper=conVol?(contribMes-GFper):null;
  const margenSeg=(conVol&&ventas>0&&PE!=null)?(ventas-PE)/ventas:null;
  const faltante=(PE!=null&&conVol&&ventas<PE)?(PE-ventas):null;
  const meta=(S.presupuesto.meta==null||S.presupuesto.meta==="")?null:num(S.presupuesto.meta);
  return {key,etiqueta:etiquetaPeriodo(key),meses,gfManuf,gfAdmin,gfComer,gfLog,gfFin,otros,
          GF:GFper,GFmes:GF,ventas,matMes,contribMes,conVol,ratio,PE,utilOper,margenSeg,faltante,meta};
}
function secPresupuesto(R){
  const P=computePresupuesto(R);
  let estLuz,estTxt;
  if(!P.conVol){estLuz="g";estTxt="Captura volúmenes para la utilidad real";}
  else if(P.utilOper>0){estLuz="v";estTxt="La empresa genera utilidad de operación";}
  else if(Math.abs(P.utilOper)<1){estLuz="a";estTxt="En punto de equilibrio";}
  else {estLuz="r";estTxt="Por debajo del punto de equilibrio";}
  const per = (P.PE!=null&&P.ventas>0)?P.PE/P.ventas:null;

  const pnl=`<table>
    <tr><td class="l">Ventas netas mensuales</td><td class="mono val-calc">${P.conVol?fMXN(P.ventas):'<span class="val-pend">captura volúmenes</span>'}</td></tr>
    <tr><td class="l">(−) Costo variable — material</td><td class="mono val-calc">${P.conVol?'('+fMXN(P.matMes)+')':'—'}</td></tr>
    <tr class="sub"><td class="l">= Margen de contribución${P.conVol?' ('+fPct(P.ratio)+')':''}</td><td class="mono">${P.conVol?fMXN(P.contribMes):'—'}</td></tr>
    <tr><td class="l">(−) Gastos fijos de operación</td><td class="mono val-calc">(${fMXN(P.GF)})</td></tr>
    <tr class="total"><td class="l">= Utilidad (pérdida) de operación</td><td class="mono">${P.utilOper==null?'—':fMXN(P.utilOper)}</td></tr>
  </table>`;

  const gf=`<table>
    <tr><td class="l">Manufactura (energía, MO directa, indirectos fabriles)</td><td class="mono val-calc">${fMXN(P.gfManuf)}</td></tr>
    <tr><td class="l">Administración (nómina + indirectos)</td><td class="mono val-calc">${fMXN(P.gfAdmin)}</td></tr>
    <tr><td class="l">Comercial (nómina + indirectos)</td><td class="mono val-calc">${fMXN(P.gfComer)}</td></tr>
    <tr><td class="l">Logística</td><td class="mono val-calc">${fMXN(P.gfLog)}</td></tr>
    <tr><td class="l">Financiero (gastos fijos)</td><td class="mono val-calc">${fMXN(P.gfFin)}</td></tr>
    <tr><td class="l">Otros gastos fijos</td><td>${inp("presupuesto.otrosFijos")}</td></tr>
    <tr class="total"><td class="l">Total gastos fijos mensuales</td><td class="mono">${fMXN(P.GF)}</td></tr>
  </table>`;

  const be=`<table>
    <tr class="total"><td class="l">Punto de equilibrio (ventas)</td><td class="mono">${P.PE==null?'<span class="val-pend">captura precios/volúmenes</span>':fMXN(P.PE)}</td></tr>
    <tr><td class="l">Margen de contribución usado</td><td class="mono val-calc">${fPct(P.ratio)}${P.conVol?' (ponderado)':' (promedio · sin volumen)'}</td></tr>
    <tr><td class="l">Equilibrio como % de ventas actuales</td><td class="mono val-calc">${per==null?'—':fPct(per)}</td></tr>
    <tr><td class="l">Margen de seguridad</td><td class="mono val-calc">${P.margenSeg==null?'—':fPct(P.margenSeg)}</td></tr>
    <tr><td class="l">Faltante para el equilibrio</td><td class="mono val-calc">${P.faltante==null?(P.conVol?'$0 (ya cubierto)':'—'):fMXN(P.faltante)}</td></tr>
    <tr><td class="l">Meta de ventas mensual</td><td>${inp("presupuesto.meta",{ph:"opcional"})}</td></tr>
    <tr><td class="l">Meta vs. equilibrio</td><td class="mono val-calc">${(P.meta!=null&&P.PE!=null)?(P.meta>=P.PE?('+'+fMXN(P.meta-P.PE)+' sobre equilibrio'):(fMXN(P.meta-P.PE))):'—'}</td></tr>
  </table>`;

  return head("Presupuesto y punto de equilibrio","ESTADO DE RESULTADOS · EQUILIBRIO",
    "Hoja financiera de la empresa. El costo variable es el material; la mano de obra y los indirectos se tratan como gastos fijos del periodo. Punto de equilibrio = gastos fijos ÷ margen de contribución. Consulta cualquier mes trabajado o el acumulado de un año.")
  +`<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      ${periodoSelector()}
      <span class="hint">${escapeHtml(P.etiqueta)}${P.meses>1?(" · "+P.meses+" meses acumulados"):""}${P.conVol?"":" · sin volúmenes capturados en este periodo"}</span>
    </div>
    <div class="hero">
      ${hcard("Ventas "+(P.meses>1?"del año":"del periodo"),P.conVol?fMXN0(P.ventas):"—",escapeHtml(P.etiqueta),"",true)}
      ${hcard("Margen de contribución",fPct(P.ratio),P.conVol?"ponderado por mezcla":"promedio (sin volumen)")}
      ${hcard("Gastos fijos",fMXN0(P.GF),P.meses>1?(P.meses+" meses · "+fMXN0(P.GFmes)+"/mes"):"a cubrir cada mes")}
      ${hcard("Punto de equilibrio",P.PE==null?"—":fMXN0(P.PE),"en ventas "+(P.meses>1?"anuales":"mensuales"))}
    </div>
    <div class="hero">
      ${hcard("Utilidad de operación",P.utilOper==null?"—":fMXN0(P.utilOper),P.utilOper==null?"captura volúmenes":(P.utilOper>0?"la empresa gana":"pérdida"),P.utilOper==null?"g":(P.utilOper>0?"v":"r"))}
      ${hcard("Margen de seguridad",P.margenSeg==null?"—":fPct(P.margenSeg),"qué tanto arriba del equilibrio",P.margenSeg==null?"g":(P.margenSeg>0?"v":"r"))}
      ${hcard("Faltante para equilibrio",P.faltante==null?(P.conVol?"$0":"—"):fMXN0(P.faltante),P.faltante==null?(P.conVol?"equilibrio cubierto":"—"):"ventas adicionales necesarias",P.faltante==null?"v":"a")}
      <div class="hcard ${estLuz}"><div class="bar"></div><div class="k">Estado financiero</div>
        <div class="v" style="font-size:15px">${estTxt}</div></div>
    </div>

    <div class="exgrid">
      <div class="card"><h3>Estado de resultados mensual</h3><div class="pad">${pnl}
        <div class="note" style="margin-top:10px">Utilidad de operación antes de impuestos. No incluye ISR/IVA.</div></div></div>
      <div class="card"><h3>Punto de equilibrio</h3><div class="pad">${be}</div></div>
      ${(function(){ if(P.key==="catalogo") return ""; const F=computeFacturado(R,P.key); if(!F.n) return `<div class="card full"><h3>Real facturado · ${escapeHtml(P.etiqueta)}</h3><div class="pad"><div class="note">Sin facturas de venta en este periodo. Súbelas en <b>Facturas de venta</b> para ver el resultado real contra el equilibrio.</div></div></div>`;
        const uo=F.contrib-P.GF; const pc=pctCumpl(F.mxn,P.ventas);
        return `<div class="card full"><h3>Real facturado vs. proyectado · ${escapeHtml(P.etiqueta)}</h3><div class="pad"><table class="fija">
          <tr><th class="l" style="width:40%"></th><th>Proyectado</th><th>Facturado (real)</th><th>Diferencia</th></tr>
          <tr><td class="l">Ventas netas</td><td class="mono val-calc">${fMXN(P.ventas)}</td><td class="mono val-calc" style="font-weight:700">${fMXN(F.mxn)}</td><td class="mono val-calc">${fMXN(F.mxn-P.ventas)}</td></tr>
          <tr><td class="l">(−) Costo variable — material</td><td class="mono val-calc">(${fMXN(P.matMes)})</td><td class="mono val-calc">(${fMXN(F.material)})</td><td class="mono val-calc">${fMXN(P.matMes-F.material)}</td></tr>
          <tr class="sub"><td class="l">= Margen de contribución</td><td class="mono">${fMXN(P.contribMes)}</td><td class="mono">${fMXN(F.contrib)}</td><td class="mono">${fMXN(F.contrib-P.contribMes)}</td></tr>
          <tr><td class="l">(−) Gastos fijos</td><td class="mono val-calc">(${fMXN(P.GF)})</td><td class="mono val-calc">(${fMXN(P.GF)})</td><td></td></tr>
          <tr class="total"><td class="l">= Utilidad de operación</td><td class="mono">${P.utilOper==null?'—':fMXN(P.utilOper)}</td><td class="mono">${fMXN(uo)}</td><td class="mono">${P.utilOper==null?'—':fMXN(uo-P.utilOper)}</td></tr>
          <tr><td class="l">Cumplimiento de ventas</td><td></td><td class="mono">${pc==null?'—':fPct(pc)}</td><td></td></tr>
          <tr><td class="l">Facturado vs. punto de equilibrio</td><td></td><td class="mono">${P.PE==null?'—':(F.mxn>=P.PE?('+'+fMXN(F.mxn-P.PE)+' arriba'):(fMXN(F.mxn-P.PE)+' abajo'))}</td><td></td></tr>
        </table><div class="note" style="margin-top:10px">${F.n} factura(s) vigente(s). Material real = costo de material por pieza × piezas facturadas de cada inserto${F.sinAsignar.length?('; '+F.sinAsignar.length+' concepto(s) sin inserto no llevan costo de material'):''}.</div></div></div>`; })()}
      <div class="card full"><h3>Gráfica de equilibrio</h3><div class="chartbox tall"><canvas id="ch_breakeven"></canvas></div></div>
      <div class="card full"><h3>Gastos fijos de operación (mensuales)</h3><div class="pad">${gf}</div></div>
    </div>`;
}
function buildPresupuestoCharts(R){
  if(typeof Chart==="undefined") return;
  Chart.defaults.font.family="'IBM Plex Sans',sans-serif"; Chart.defaults.font.size=11; Chart.defaults.color="#5f6d7a";
  const P=computePresupuesto(R);
  if(!(P.ratio>0)||P.PE==null){ return; }
  const Fx=P.key!=="catalogo"?computeFacturado(R,P.key):null;
  const xMax=Math.max(P.PE, P.ventas||0, P.meta||0, (Fx&&Fx.n)?Fx.mxn:0)*1.4 || P.PE*1.4;
  const line=(fn)=>[{x:0,y:fn(0)},{x:xMax,y:fn(xMax)}];
  const datasets=[
    {label:"Ingresos",data:line(x=>x),borderColor:PAL[0],backgroundColor:PAL[0],borderWidth:2,pointRadius:0,tension:0},
    {label:"Costo total (fijo + variable)",data:line(x=>P.GF+(1-P.ratio)*x),borderColor:SEM.r,backgroundColor:SEM.r,borderWidth:2,pointRadius:0,tension:0},
    {label:"Gastos fijos",data:line(x=>P.GF),borderColor:"#9aa3ab",borderDash:[5,4],borderWidth:1.5,pointRadius:0},
    {label:"Punto de equilibrio",data:[{x:P.PE,y:P.PE}],type:"scatter",backgroundColor:"#16222e",pointRadius:6,pointHoverRadius:7}
  ];
  if(P.key!=="catalogo"){ const F=computeFacturado(R,P.key); if(F.n) datasets.push({label:"Ventas facturadas (real)",data:[{x:F.mxn,y:F.mxn}],type:"scatter",backgroundColor:PAL[4],pointRadius:6,pointHoverRadius:7,pointStyle:"rectRot"}); }
  if(P.conVol) datasets.push({label:"Ventas actuales",data:[{x:P.ventas,y:P.ventas}],type:"scatter",backgroundColor:SEM.v,pointRadius:6,pointHoverRadius:7});
  const money=v=>v>=1000?"$"+(v/1000).toLocaleString("es-MX",{maximumFractionDigits:0})+"k":"$"+v;
  mkChart("ch_breakeven",{type:"line",data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,parsing:true,
      scales:{x:{type:"linear",title:{display:true,text:"Ventas mensuales ($)"},ticks:{callback:money}},
              y:{title:{display:true,text:"$ mensuales"},ticks:{callback:money}}},
      plugins:{legend:{position:"bottom",labels:{boxWidth:12,padding:12}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fMXN0(c.parsed.y)}`,title:c=>"Ventas: "+fMXN0(c[0].parsed.x)}}}}});
}

/* ===================== RENDER ===================== */
function renderSection(id){
  destroyCharts();
  const R=compute();
  const map={dashboard:secDashboard,mes:secMes,presupuesto:secPresupuesto,resumen:secResumen,control:secControl,capacidad:secCapacidad,mano:secMano,
    indirectos:secIndirectos,energia:secEnergia,centros:secCentros,
    ruta:secRuta,financiero:secControl,facturas:secFacturas,integral:secMes,placas:secDiseno,diagrama:secDiagrama,validacion:secValidacion};
  const cont=document.getElementById("content");
  cont.className="content"+(puedeEditar()?"":" ro");
  cont.innerHTML=(map[id]||secDashboard)(R);
  NF.applyPermissions();
  if(id==="dashboard") buildDashboardCharts(R);
  if(id==="presupuesto") buildPresupuestoCharts(R);
}
function renderAll(){renderNav();renderRol();renderKPIs();renderChain();renderSection(current);}

/* ===================== EXPORTACIÓN (Excel / PDF) ===================== */
const r2=x=>x==null?null:Math.round(x*100)/100;
const r4=x=>x==null?null:Math.round(x*10000)/10000;
function toast(msg){
  const t=document.getElementById('saveTxt'),d=document.getElementById('dot');
  t.textContent=msg; d.style.background="var(--accent)";
  clearTimeout(toast._t); toast._t=setTimeout(()=>NF.showSaveStatus(),3500);
}
function askConfirm(msg,onYes,yesLabel){
  const ov=document.createElement("div"); ov.className="modal-ov";
  const m=document.createElement("div"); m.className="modal";
  m.innerHTML=`<div class="modal-msg">${msg}</div><div class="modal-actions">
    <button class="btn" type="button" data-no>Cancelar</button>
    <button class="btn danger" type="button" data-yes>${yesLabel||"Eliminar"}</button></div>`;
  ov.appendChild(m); document.body.appendChild(ov);
  const close=()=>{ if(ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener("keydown",onKey); };
  const onKey=ev=>{ if(ev.key==="Escape") close(); };
  m.querySelector("[data-no]").onclick=close;
  m.querySelector("[data-yes]").onclick=()=>{ close(); onYes(); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  document.addEventListener("keydown",onKey);
  m.querySelector("[data-yes]").focus();
}
async function saveFile(filename, data, mime){
  // Vía oficial en página publicada: capacidad "downloads"
  try{
    const dl = (window.claude && window.claude.use) ? await window.claude.use("downloads") : null;
    if(dl){
      try{ await dl.save({filename, data}); toast("Descarga lista: "+filename); return; }
      catch(err){
        if(err && err.code==="declined") return;               // el usuario canceló
        console.warn("downloads.save:",err);                    // otro error → intento respaldo
      }
    }
  }catch(e){ console.warn(e); }
  // Respaldo (HTML alojado por tu cuenta o vista previa)
  try{
    const blob = (data instanceof Blob) ? data : new Blob([data],{type:mime||"application/octet-stream"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    toast("Descarga lista: "+filename);
  }catch(e){ alert("Esta vista no permite descargar archivos. Ábrela desde el enlace del artefacto."); }
}
function buildWorkbook(){
  const R=compute();
  const wb=XLSX.utils.book_new();
  const margenGlobal=(num(S.control.margenObj)+f("deltaMargen"));
  const resumen=[
    ["COSTEO FOAM INTEGRAL · NORTH FOAM"],
    ["Generado", new Date().toLocaleString("es-MX")],
    ["Escenario", S.control.escenario],
    ["Tipo de cambio efectivo (MXN/USD)", r4(R.tc)],
    ["Pool de manufactura (MXN/mes)", r2(R.pool)],
    ["Tasa de planta (MXN/h)", R.tasaPlanta==null?"PENDIENTE":r2(R.tasaPlanta)],
    ["Capacidad práctica (h/mes)", r2(R.capPractica)],
    ["Margen objetivo global (%)", r2(margenGlobal*100)],
    [],
    ["VALIDACIÓN","Resultado","Estado"],
    ...R.valid.map(v=>[v.k, v.v, v.rev?"REVISAR":"OK"])
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  const P=computePresupuesto(R);
  const per=(P.PE!=null&&P.ventas>0)?P.PE/P.ventas:null;
  let est; if(!P.conVol) est="Captura volúmenes para la utilidad real";
    else if(P.utilOper>0) est="La empresa genera utilidad de operación";
    else if(Math.abs(P.utilOper)<1) est="En punto de equilibrio";
    else est="Por debajo del punto de equilibrio";
  const pre=[
    ["PRESUPUESTO Y PUNTO DE EQUILIBRIO"],
    ["Generado", new Date().toLocaleString("es-MX")],
    ["Escenario", S.control.escenario],
    ["Estado financiero", est],
    [],
    ["ESTADO DE RESULTADOS MENSUAL (MXN)"],
    ["Ventas netas mensuales", r2(P.ventas)],
    ["(-) Costo variable — material", r2(-P.matMes)],
    ["= Margen de contribución", r2(P.contribMes)],
    ["   Margen de contribución %", r2(P.ratio*100)],
    ["(-) Gastos fijos de operación", r2(-P.GF)],
    ["= Utilidad (pérdida) de operación", P.utilOper==null?"— (captura volúmenes)":r2(P.utilOper)],
    [],
    ["GASTOS FIJOS DE OPERACIÓN (MXN/mes)"],
    ["Manufactura (energía, MO directa, indirectos fabriles)", r2(P.gfManuf)],
    ["Administración (nómina + indirectos)", r2(P.gfAdmin)],
    ["Comercial (nómina + indirectos)", r2(P.gfComer)],
    ["Logística", r2(P.gfLog)],
    ["Financiero (gastos fijos)", r2(P.gfFin)],
    ["Otros gastos fijos", r2(P.otros)],
    ["Total gastos fijos mensuales", r2(P.GF)],
    [],
    ["PUNTO DE EQUILIBRIO"],
    ["Punto de equilibrio (ventas $/mes)", P.PE==null?"—":r2(P.PE)],
    ["Margen de contribución usado %", r2(P.ratio*100)],
    ["   Base del margen", P.conVol?"ponderado por mezcla real":"promedio (sin volumen)"],
    ["Equilibrio como % de ventas actuales", per==null?"—":r2(per*100)],
    ["Margen de seguridad %", P.margenSeg==null?"—":r2(P.margenSeg*100)],
    ["Faltante para el equilibrio", P.faltante==null?(P.conVol?0:"—"):r2(P.faltante)],
    ["Meta de ventas mensual", P.meta==null?"—":r2(P.meta)],
    ["Meta vs. equilibrio", (P.meta!=null&&P.PE!=null)?r2(P.meta-P.PE):"—"]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pre), "Presupuesto");

  const kk=periodoKey(); const M=computeMes(R,kk);
  if(M.act.length){
    const mesRows=[["COSTEO MENSUAL — "+nombreMes(kk)],[],
      ["Inserto","Cliente","Volumen","Costo integral u.","Precio cliente u.","Ventas del mes","Costo del mes","Utilidad del mes","Margen %","Estado"]];
    M.act.forEach(f=>mesRows.push([f.id,clienteLabel(f.it.ins),f.vol,r2(f.it.costoIntegral),r2(f.it.precioClMXN),r2(f.ventas),
      f.it.complete?r2(f.costo):"—",f.it.complete?r2(f.util):"—",f.it.margenReal==null?"—":r2(f.it.margenReal*100),f.it.estado]));
    mesRows.push(["TOTALES","",M.piezas,"","",r2(M.ventas),r2(M.costoAbs),r2(M.utilAbs),M.margen==null?"—":r2(M.margen*100),""]);
    mesRows.push([],["Margen de contribución",r2(M.contrib)],["Gastos fijos del mes",r2(M.fijos)],
      ["Utilidad de operación",r2(M.utilOper)],["Insertos sin costeo completo",M.incompletos]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mesRows), "Costeo mensual");
    if(M.clientes&&M.clientes.length){
      const cliRows=[["RESULTADO POR CLIENTE — "+nombreMes(kk)],[],
        ["Cliente","Insertos","Piezas","Ventas","Costo","Utilidad","Margen %","% de ventas"]];
      M.clientes.forEach(g=>cliRows.push([g.cli,g.ins,g.piezas,r2(g.ventas),g.completos?r2(g.costo):"—",
        g.completos?r2(g.util):"—",g.margen==null?"—":r2(g.margen*100),M.ventas>0?r2(g.ventas/M.ventas*100):"—"]));
      cliRows.push(["TOTAL DEL MES",M.act.length,M.piezas,r2(M.ventas),r2(M.costoAbs),r2(M.utilAbs),M.margen==null?"—":r2(M.margen*100),100]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cliRows), "Por cliente");
    }
  }

  const H=["Inserto","Material USD","% Merma mat.","Material MXN","MO","Indirectos",
    "Costo manufactura","Admin","Comercial","Logística","Financiamiento","Garantías","Costo integral",
    "Margen obj. %","Precio sugerido","Precio cliente USD","Precio cliente MXN","Utilidad/pza",
    "Margen real %","Markup %","Estado"];
  const body=R.integral.map(i=>[i.ins.id, r4(i.materialUSD), r2(i.mermaMat*100), r2(i.materialMXN),
    r2(i.mo), r2(i.ind), r2(i.costoManuf), r2(i.admin), r2(i.comercial), r2(i.logistica),
    r2(i.financiamiento), r2(i.garantiaMXN), r2(i.costoIntegral), r2(i.margenObj*100),
    i.precioSug==null?"INCOMPLETO":r2(i.precioSug), r2(i.precioClUSD), r2(i.precioClMXN),
    i.utilidad==null?"":r2(i.utilidad), i.margenReal==null?"":r2(i.margenReal*100),
    i.markup==null?"":r2(i.markup*100), i.estado]);
  const wsI=XLSX.utils.aoa_to_sheet([H,...body]); wsI["!freeze"]={xSplit:1,ySplit:1};
  XLSX.utils.book_append_sheet(wb, wsI, "Costeo integral");

  const CH=["Centro de costo","Tarifa MO $/h","Tarifa indirectos $/h","Tarifa TOTAL $/h"];
  const crows=R.centros.map(c=>[c.c, r2(c.moRate), r2(c.indRate), r2(c.total)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CH,...crows]), "Centros de costo");

  const PH=["Concepto","MXN/mes"];
  const pool=[PH,["Energía eléctrica",r2(R.energiaSubtotal)],["Mano de obra directa",r2(R.moDirecta)],
    ["Indirectos fabriles",r2(R.indFabril)],
    ["TOTAL POOL",r2(R.pool)],[],["Capacidad práctica (h/mes)",r2(R.capPractica)],
    ["Tasa de planta (MXN/h)",R.tasaPlanta==null?"PENDIENTE":r2(R.tasaPlanta)]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pool), "Pool");

  const RH=["Inserto","Op","Proceso","Centro","Min prep/lote","Lote","Min MO/u","N° op.",
    "% retrab.","% merma","Costo total/u","Estado"];
  const rrows=R.rutaCalc.filter(r=>r.ins).map(r=>[r.ins,r.op,r.proc,r.ce,
    r.prep,r.lote,r.minMO,r.nop,r2(num(r.retrab)*100),r2(num(r.merma)*100),
    r.totU==null?"":r2(r.totU), r.estado]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([RH,...rrows]), "Ruta de proceso");

  const PDH=["Inserto","Componente","Mat.","Medida 1 in","Medida 2 in","Grosor in","Cant./inserto","Pzas/placa","Aprov. %","Costo unit USD","Costo inserto USD"];
  const prow=[];
  S.inserts.forEach(ins=>{ const d=disenoCalc(ins); if(d) d.piezas.forEach(p=>prow.push([ins.id,p.comp,p.mat,p.m1,p.m2,p.grosor,p.cant,p.ppp,r2(p.aprov*100),r4(p.costoUnit),r2(p.costoInserto)])); });
  if(prow.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([PDH,...prow]), "Costeo de placas");

  // Requerimiento de material por cantidad terminada
  const rqP=[["Inserto","Volumen del mes","Componente","Material","Pzas/inserto","Piezas totales","Pzas/placa","Placas (teórico)","Placas a cortar"]];
  const rqM=[["Inserto","Volumen del mes","Material","Placas (teórico)","Placas a comprar","Precio placa USD","Costo teórico USD","Costo placas USD","Costo teórico MXN","Costo placas MXN"]];
  const PM=ensurePeriodo(periodoKey());
  S.inserts.forEach(ins=>{
    const d=disenoCalc(ins); if(!d) return;
    const cfgQ=PM.items[String(ins.id)]||{}; const Q=(cfgQ.inc?num(cfgQ.vol):0); if(!(Q>0)) return;
    d.piezas.forEach(p=>{
      const tot=num(p.cant)*Q, frac=p.ppp>0?tot/p.ppp:0, placas=Math.ceil(frac-1e-9);
      rqP.push([ins.id,Q,p.comp,"M"+(p.mat||1),num(p.cant),tot,p.ppp,r2(frac),placas]);
    });
    [0,1,2].forEach(k=>{
      const eff=d.mats[k]||{}; const rows=d.piezas.filter(p=>(num(p.mat)||1)-1===k);
      if(!rows.length||!(eff.precio>0)) return;
      const frac=rows.reduce((a,p)=>a+(p.ppp>0?(num(p.cant)*Q)/p.ppp:0),0);
      const comprar=Math.ceil(frac-1e-9);
      const costoTeo=rows.reduce((a,p)=>a+p.costoInserto,0)*Q, costoPl=comprar*eff.precio;
      rqM.push([ins.id,Q,eff.nombre||("M"+(k+1)),r2(frac),comprar,r4(eff.precio),r2(costoTeo),r2(costoPl),r2(costoTeo*R.tc),r2(costoPl*R.tc)]);
    });
  });
  if(rqP.length>1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rqP), "Req. piezas a cortar");
  if(rqM.length>1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rqM), "Req. material y costo");

  const rqU=[["Inserto","Volumen del mes","Ingreso total MXN","Costo integral total MXN","Utilidad total MXN","Contribución total (sin ruta) MXN","Estado"]];
  S.inserts.forEach(ins=>{
    const d=disenoCalc(ins); if(!d) return;
    const cfgU=PM.items[String(ins.id)]||{}; const Q=(cfgU.inc?num(cfgU.vol):0); if(!(Q>0)) return;
    const it=R.integral.find(x=>String(x.ins.id)===String(ins.id))||{};
    const ing=num(it.precioClMXN)*Q, comp=!!it.complete;
    rqU.push([ins.id,Q,r2(ing), comp?r2(num(it.costoIntegral)*Q):"—", comp?r2(num(it.utilidad)*Q):"—",
      comp?"—":r2((num(it.precioClMXN)-num(it.materialMXN))*Q), comp?"Completo":"Sin ruta (contribución)"]);
  });
  if(rqU.length>1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rqU), "Req. utilidad orden");

  // Diagrama de corte (datos por pieza) y nesting combinado
  const dcH=["Inserto","Componente","Material","Med. 1 in","Med. 2 in","Orientación","Cols","Filas","Piezas/placa","Aprovechamiento %","Merma %"];
  const dc=[dcH]; const ncH=["Inserto","Material","Piezas/placa (combinado)","Aprovechamiento combinado %","Merma combinada %","Aprov. por separado %","Mejora %"]; const nc=[ncH];
  S.inserts.forEach(ins=>{
    const dz=disenoCalc(ins); if(!dz||!dz.piezas.length) return;
    dz.piezas.forEach(p=>{
      const mat=dz.mats[(num(p.mat)||1)-1]||{}; const d=cutCalc(p,mat); if(!d) return;
      dc.push([ins.id,p.comp,mat.nombre||("M"+(p.mat||1)),num(p.m1),num(p.m2),d.useO2?"Rotada 90°":"Normal",d.cols,d.rows,d.ppp,r2(d.aprov*100),r2((1-d.aprov)*100)]);
    });
    [0,1,2].forEach(k=>{
      const mat=dz.mats[k]||{}; const ps=dz.piezas.filter(p=>(num(p.mat)||1)-1===k && num(p.m1)>0 && num(p.m2)>0);
      if(ps.length<2||!(num(mat.largo)>0&&num(mat.ancho)>0)) return;
      const types=ps.map(p=>({comp:p.comp,color:"",w:Math.max(num(p.m1),num(p.m2)),h:Math.min(num(p.m1),num(p.m2)),cant:num(p.cant)||1}));
      const res=fillPlateMixed(types,num(mat.largo),num(mat.ancho));
      const ind=ps.reduce((a,p)=>{const d=cutCalc(p,mat);return a+(d?d.aprov:0);},0)/ps.length;
      nc.push([ins.id,mat.nombre||("M"+(k+1)),res.total,r2(res.aprov*100),r2((1-res.aprov)*100),r2(ind*100),r2((res.aprov-ind)*100)]);
    });
  });
  if(dc.length>1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dc), "Diagrama corte");
  if(nc.length>1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nc), "Nesting combinado");
  ensureFacturas();
  if(S.facturas.length){
    const fx=[["UUID","Fecha","Serie","Folio","Tipo","Cliente","RFC cliente","Moneda","TC","No. identificación","Inserto","Descripción","Cantidad","Valor unitario","Importe","Importe MXN","Estado"]];
    S.facturas.forEach(fa=>{ const tc=facTC(fa,R.tc), sg=facSigno(fa); (fa.conceptos||[]).forEach(c=>fx.push([fa.uuid,fa.fecha,fa.serie||"",fa.folio||"",fa.tipo==="E"?"Nota de crédito":"Ingreso",fa.receptor||"",fa.receptorRfc||"",fa.moneda,tc,c.n||"",insDeConcepto(c)||"(sin asignar)",c.d||"",num(c.q)*sg,num(c.u),num(c.i)*sg,r2(num(c.i)*sg*tc),fa.cancelada?"Cancelada":"Vigente"])); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fx), "Facturas de venta");
    const y=periodoKey().slice(0,4); const cm=[["Mes","Piezas proyectadas","Piezas facturadas","Ventas proyectadas MXN","Ventas facturadas MXN","Cumplimiento %","Facturas"]];
    for(let m=1;m<=12;m++){ const mk=y+"-"+String(m).padStart(2,"0"); const p=proyectadoPeriodo(R,mk), fz=computeFacturado(R,mk);
      cm.push([nombreMes(mk),p.piezas,fz.piezas,r2(p.ventas),r2(fz.mxn),p.ventas>0?r2(fz.mxn/p.ventas*100):"",fz.n]); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cm), "Proyectado vs facturado "+y);
  }
  return wb;
}

/* ===================== APP API ===================== */
const app={
  go(id){current=id;renderNav();renderSection(id);document.querySelector(".content").scrollIntoView({block:"start"});window.scrollTo(0,0);},
  addInsert(){ const id=nextInsId(); S.inserts.push({id,q25:null,q26:null}); S.ruta.push(...stdRutaOps(id)); sortInserts(); save(); renderKPIs(); renderChain(); renderSection(current); },
  addInserts(n){ for(let k=0;k<n;k++){ const id=nextInsId(); S.inserts.push({id,q25:null,q26:null}); S.ruta.push(...stdRutaOps(id)); } sortInserts(); save(); renderKPIs(); renderChain(); renderSection(current); toast(n+" insertos agregados"); },
  rutasEstandar(){
    S.inserts.forEach(ins=>{ const id=String(ins.id);
      if(!S.ruta.some(r=>String(r.ins)===id&&r.proc===CENTRO_PROD)) S.ruta.push(stdRutaOps(id)[0]);
    });
    save(); renderKPIs(); renderChain(); renderSection("ruta"); toast("Ruta estándar aplicada a todos los insertos");
  },
  delInsert(i){
    const id=String(S.inserts[i].id==null?"":S.inserts[i].id);
    askConfirm("¿Eliminar el inserto <b>"+(id||"(sin número)")+"</b>? Se quitará también su volumen, su ruta y su costeo de placas. Esta acción no se puede deshacer.", ()=>{
      S.inserts.splice(i,1);
      if(id){ delete S.perInsert[id]; S.ruta=S.ruta.filter(r=>String(r.ins)!==id); if(String(disenoSel)===id) disenoSel=null; }
      save(); renderKPIs(); renderChain(); renderSection(current); toast("Inserto "+(id||"")+" eliminado");
    }, "Eliminar inserto");
  },
  setClienteInserto(idx,v){ S.inserts[idx].cliente=(v||"").trim()||null; ensureClientes(); save(); renderKPIs(); renderChain(); renderSection("placas"); },
  addCliente(){
    const el=document.getElementById("newCliId"); const v=(el?el.value:"").trim();
    if(!v){ toast("Escribe el nombre del cliente"); if(el)el.focus(); return; }
    if(!Array.isArray(S.clientes)) S.clientes=[];
    if(!S.clientes.includes(v)) S.clientes.push(v);
    S.clientes.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));
    const i=S.inserts.findIndex(x=>String(x.id)===String(disenoSel));
    if(i>=0) S.inserts[i].cliente=v;
    save(); renderSection("placas"); toast("Cliente "+v+" asignado a "+disenoSel);
  },
  setCliFiltro(v){ cliFiltro=v; renderSection("mes"); },
  indCopiarBase(){ const k=S.periodoVista||"catalogo"; if(k==="catalogo") return;
    const P=ensurePeriodo(k); P.indirectos=P.indirectos||{};
    S.indirectos.forEach(it=>{ if(it.m!=null&&it.m!=="") P.indirectos[indKey(it)]=num(it.m); });
    save(); renderKPIs(); renderChain(); renderSection("indirectos"); toast("Montos del catálogo copiados a "+etiquetaPeriodo(k)); },
  indLimpiarMes(){ const k=S.periodoVista||"catalogo"; if(k==="catalogo") return;
    askConfirm("¿Limpiar los montos capturados de <b>"+etiquetaPeriodo(k)+"</b>? Volverán a tomar el valor del catálogo.",()=>{
      const P=ensurePeriodo(k); P.indirectos={}; save(); renderKPIs(); renderChain(); renderSection("indirectos"); toast("Montos del mes limpiados");
    },"Limpiar"); },
  mesCerrar(){ if(!esAdmin()) return; const k=periodoKey(); const P=ensurePeriodo(k);
    P.estado=(P.estado==="cerrado")?null:"cerrado"; save(); renderSection("mes");
    toast(P.estado==="cerrado"?(nombreMes(k)+" cerrado"):(nombreMes(k)+" reabierto")); },
  mesBorrar(){ const k=periodoKey();
    if(!esAdmin()){ toast("Solo el Administrador puede borrar un periodo"); return; }
    askConfirm("¿Borrar TODOS los datos capturados de <b>"+nombreMes(k)+"</b>?<br><br>Se eliminan volúmenes, clientes del mes y los montos de indirectos, capacidad, energía y nómina de ese periodo. El catálogo de insertos no se toca.",()=>{
      pedirPin("Confirma con la contraseña para borrar <b>"+nombreMes(k)+"</b>.",()=>{
        delete S.periodos[k];
        if(S.periodoVista===k) S.periodoVista="catalogo";
        save(); renderKPIs(); renderChain(); renderSection("mes"); toast(nombreMes(k)+" borrado");
      });
    },"Borrar mes"); },
  setCliRuta(v){ cliVista=v; rutaFilter="(todos)"; renderSection("ruta"); },
  setCliVista(v){ cliVista=v; renderSection(current); },
  setCliDiagrama(v){ cliVista=v; const l=S.inserts.filter(pasaCliente); if(l.length&&!l.some(x=>String(x.id)===String(disenoSel))) disenoSel=String(l[0].id); renderSection("diagrama"); },
  abrirAcceso(){ NF.openAccount(); },
  setPeriodoVista(v){ S.periodoVista=v||"catalogo"; save(); renderKPIs(); renderChain(); renderSection(current); toast("Consultando "+etiquetaPeriodo(S.periodoVista)); },
  setPresuPeriodo(v){ S.periodoVista=v||"catalogo"; save(); renderKPIs(); renderChain(); renderSection("presupuesto"); },
  setPeriodo(v){ if(!v) return; S.periodoActivo=v; ensurePeriodo(v); save(); renderSection(current==="facturas"?"facturas":"mes"); },
  async subirFacturas(ev){
    const input=ev&&ev.target; const files=input&&input.files?[...input.files]:[]; if(!files.length) return;
    ensureFacturas(); const ya=new Set(S.facturas.map(f=>f.uuid)); let ok=0,dup=0; const errs=[]; const meses={};
    for(const file of files){
      try{
        if(file.size>2*1024*1024) throw new Error("pesa más de 2 MB");
        const fa=parseCFDI(await file.text());
        if(ya.has(fa.uuid)){dup++;continue;}
        S.facturas.push(fa); ya.add(fa.uuid); ok++; meses[fa.fecha.slice(0,7)]=(meses[fa.fecha.slice(0,7)]||0)+1;
      }catch(e){ errs.push(escapeHtml(file.name)+": "+escapeHtml(e.message||String(e))); }
    }
    if(input) input.value="";
    S.facturas.sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
    const ms=Object.keys(meses).sort(); if(ms.length) S.periodoActivo=ms[ms.length-1];
    facUltimo=`<b>Carga:</b> ${ok} factura(s) agregada(s)${ms.length?(" ("+ms.map(m=>nombreMes(m)+": "+meses[m]).join(", ")+")"):""}${dup?(" · "+dup+" ya existían (no se duplicaron)"):""}${errs.length?("<br><b>No se cargaron "+errs.length+":</b> "+errs.join(" · ")):""}`;
    if(ok) save(); renderKPIs(); renderChain(); renderSection("facturas"); toast(ok+" factura(s) cargada(s)");
  },
  toggleFacCancelada(uuid){ ensureFacturas(); const fa=S.facturas.find(f=>f.uuid===uuid); if(!fa) return; if(fa.cancelada) delete fa.cancelada; else fa.cancelada=true; save(); renderKPIs(); renderChain(); renderSection(current); },
  delFactura(uuid){ ensureFacturas(); const fa=S.facturas.find(f=>f.uuid===uuid); if(!fa) return;
    askConfirm("¿Eliminar la factura <b>"+escapeHtml([fa.serie,fa.folio].filter(Boolean).join("-")||fa.uuid)+"</b> del "+escapeHtml(fa.fecha)+"? Puedes volver a subir su XML después.",()=>{
      S.facturas=S.facturas.filter(f=>f.uuid!==uuid); save(); renderKPIs(); renderChain(); renderSection(current); toast("Factura eliminada"); },"Eliminar"); },
  mesTodos(v){ const P=ensurePeriodo(periodoKey()); S.inserts.forEach(i=>{ const id=String(i.id); if(!P.items[id])P.items[id]={}; P.items[id].inc=v; }); save(); renderSection("mes"); },
  mesCopiarVol(){ const P=ensurePeriodo(periodoKey()); let n=0;
    S.inserts.forEach(i=>{ const id=String(i.id); const v=num((S.perInsert[id]||{}).volumen);
      if(v>0){ if(!P.items[id])P.items[id]={}; P.items[id].vol=v; P.items[id].inc=true; n++; } });
    save(); renderSection("mes"); toast(n?(n+" volúmenes traídos"):"El catálogo no tiene volúmenes capturados"); },
  mesAplicarPanel(){ const P=ensurePeriodo(periodoKey()); let n=0;
    S.inserts.forEach(i=>{ const id=String(i.id); const c=P.items[id]||{};
      if(!S.perInsert[id]) S.perInsert[id]={};
      S.perInsert[id].volumen=(c.inc&&num(c.vol)>0)?num(c.vol):null; if(c.inc&&num(c.vol)>0)n++; });
    save(); renderKPIs(); renderChain(); renderSection("mes"); toast("Panel actualizado con "+n+" insertos del mes"); },
  setDiseno(id){ disenoSel=String(id); renderSection("placas"); },
  setDiagrama(id){ disenoSel=String(id); renderSection("diagrama"); },
  addNamedInsert(){
    const el=document.getElementById("newInsId"); const v=(el?el.value:"").trim();
    if(!v){ toast("Escribe el número del nuevo inserto"); if(el)el.focus(); return; }
    if(S.inserts.some(x=>String(x.id)===v)){
      toast("Ya existe el inserto "+v+"; lo abrí");
      disenoSel=v; renderSection("placas"); return;
    }
    S.inserts.push({id:v,q25:null,q26:null,diseno:{materiales:[{},{},{}],piezas:[]}});
    S.ruta.push(...stdRutaOps(v));
    sortInserts();
    disenoSel=v; save(); renderKPIs(); renderChain(); renderSection("placas"); toast("Inserto "+v+" creado");
  },
  addPieza(idx){ ensureDiseno(S.inserts[idx]); S.inserts[idx].diseno.piezas.push({comp:"Tapa / Base",m1:null,m2:null,grosor:null,mat:1,cant:1,piezasManual:null,s1:null,s2:null}); save(); renderKPIs(); renderChain(); renderSection("placas"); },
  delPieza(idx,j){ S.inserts[idx].diseno.piezas.splice(j,1); save(); renderKPIs(); renderChain(); renderSection("placas"); },
  addMaterial(){ if(!S.catalogo)S.catalogo=[]; S.catalogo.push({nombre:"NUEVO material",grosor:null,ancho:null,largo:null,costo:null}); save(); renderSection("placas"); },
  delMaterial(k){ S.catalogo.splice(k,1); save(); renderKPIs(); renderChain(); renderSection("placas"); },
  setEscenario(s){S.control.escenario=s;save();renderKPIs();renderChain();renderSection(current);},
  aplicarEscenarios(){ S.escenarios=clone(DEFAULTS.escenarios); save(); renderKPIs(); renderChain(); renderSection("control"); toast("Factores neutrales aplicados"); },
  refrescarTC(){
    toast("Consultando Banxico…");
    autoTC(true).then(res=>{
      if(current==="control") renderSection("control");
      if(res?.ok) toast(res.cambio?"TC actualizado: $"+fN(res.valor,4)+" ("+res.fecha+")":"TC ya estaba al día: $"+fN(res.valor,4));
      else toast("No se actualizó — "+(res?.motivo||"error desconocido"));
    });
  },
  setTcOficial(v){ S.control.tcBase=v; S.control.tcFecha=new Date().toLocaleDateString("es-MX"); save(); renderKPIs(); renderChain(); renderSection("control"); toast("TC base actualizado a "+v); },
  setSensMetric(m){sensMetric=m;renderSection("dashboard");},
  setRutaFilter(v){rutaFilter=v;renderSection("ruta");},
  addEmp(){S.empleados.push({puesto:"Nuevo puesto",tipo:"Directa",centro:"Corte",period:"Semanal",sueldo:null,n:1,uniformes:0,capacitacion:0,ausent:0});save();renderSection("mano");},
  addInd(){S.indirectos.push({c:"Nuevo concepto",cl:"Indirecto fijo",ce:"Otros",m:null});save();renderSection("indirectos");},
  addCarga(){S.energia.cargas.push({n:"Nueva carga",kw:0,h:0});save();renderSection("energia");},
  addRuta(){if(!S.inserts.length){toast("Primero agrega un inserto en Costeo de placas");return;} S.ruta.push({ins:S.inserts[0].id,op:20,proc:"Corte",ce:"Corte/Pegado/Ensamble",prep:null,lote:1,minMO:null,minMaq:null,nop:1,retrab:0,merma:0});save();renderSection("ruta");},
  delRow(path,i){
    const parts=path.split(".");let o=S;for(const p of parts)o=o[p];
    o.splice(i,1);save();renderKPIs();renderChain();renderSection(current);
  },
  reset(){ if(!esAdmin()) return; askConfirm("¿Restablecer todos los datos a los valores originales del modelo? Se eliminarán los datos compartidos. Esta acción solo está disponible para el administrador.", ()=>{ S=clone(DEFAULTS); save(); renderAll(); }, "Restablecer"); },
  exportJSON(){
    saveFile("costeo-foam-datos.json", JSON.stringify(S,null,2), "application/json");
  },
  async exportExcel(){
    if(typeof XLSX==="undefined"){alert("No se pudo cargar la librería de Excel. Revisa tu conexión e inténtalo de nuevo.");return;}
    try{
      const wb=buildWorkbook();
      const ab=await XLSX.write(wb,{bookType:"xlsx",type:"array"});
      const blob=new Blob([ab],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      saveFile("Costeo_FOAM_Integral.xlsx", blob);
    }catch(e){console.error(e);alert("No se pudo generar el Excel.");}
  },
  exportPDF(){
    if(!window.jspdf||!window.jspdf.jsPDF){alert("No se pudo cargar la librería de PDF. Revisa tu conexión e inténtalo de nuevo.");return;}
    try{
      const {jsPDF}=window.jspdf;
      const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a4"});
      const R=compute();
      doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(22,34,46);
      doc.text("Costeo FOAM Integral · North Foam",40,42);
      try{ const ls=document.getElementById('brandLogo'); if(ls&&ls.src) doc.addImage(ls.src,'PNG',742,20,80,62); }catch(e){}
      doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(80,90,100);
      const meta=`Generado: ${new Date().toLocaleString("es-MX")}    Escenario: ${S.control.escenario}    `+
        `TC efectivo: ${fN(R.tc,4)}    Pool: ${fMXN0(R.pool)}/mes    `+
        `Tasa planta: ${R.tasaPlanta==null?"—":fMXN(R.tasaPlanta)+"/h"}    Capacidad: ${fN(R.capPractica,0)} h/mes`;
      doc.text(meta,40,60);
      const head=[["Inserto","Material MXN","Conversión","Costo integral","Precio sugerido",
        "Precio cliente","Utilidad/pza","Margen real","Markup","Estado"]];
      const body=R.integral.map(i=>[i.ins.id, fMXN(i.materialMXN), i.conversion?fMXN(i.conversion):"s/ruta",
        fMXN(i.costoIntegral), i.precioSug==null?"INCOMPLETO":fMXN(i.precioSug), fMXN(i.precioClMXN),
        i.utilidad==null?"—":fMXN(i.utilidad), i.margenReal==null?"—":fPct(i.margenReal),
        i.markup==null?"—":fPct(i.markup), estadoCorto(i.estado)]);
      const luces=R.integral.map(i=>i.luz);
      const color={v:[230,245,236],a:[251,241,216],r:[251,230,233],g:[236,239,241]};
      doc.autoTable({head,body,startY:78,
        styles:{font:"helvetica",fontSize:8,cellPadding:4,lineColor:[221,227,232],lineWidth:.5,textColor:[24,36,48]},
        headStyles:{fillColor:[30,48,64],textColor:255,halign:"right",fontStyle:"bold"},
        columnStyles:{0:{halign:"left",fontStyle:"bold"},9:{halign:"left"}},
        bodyStyles:{halign:"right"},
        didParseCell:function(d){ if(d.section==="body"){const l=luces[d.row.index]; if(l&&color[l]) d.cell.styles.fillColor=color[l];} }
      });
      let y=(doc.lastAutoTable?doc.lastAutoTable.finalY:78)+18;
      doc.setFontSize(8);doc.setTextColor(90,100,110);
      doc.text("Margen sobre venta = utilidad ÷ precio.  Markup = utilidad ÷ costo.  Precio sugerido = costo integral ÷ (1 − margen objetivo).",40,y,{maxWidth:760});
      doc.text("Sin tiempos de ruta el inserto queda como costeo incompleto y no genera precio válido. Verde: cumple objetivo · Amarillo: bajo objetivo · Rojo: margen negativo · Gris: incompleto.",40,y+13,{maxWidth:760});
      // Página de optimización de corte
      const cutBody=[];
      S.inserts.forEach(ins=>{ const dz=disenoCalc(ins); if(!dz||!dz.piezas.length) return;
        dz.piezas.forEach(p=>{ const mat=dz.mats[(num(p.mat)||1)-1]||{}; const d=cutCalc(p,mat); if(!d) return;
          cutBody.push([ins.id,p.comp,mat.nombre||("M"+(p.mat||1)),fN(num(p.m1),2)+" × "+fN(num(p.m2),2),d.useO2?"Rotada":"Normal",String(d.ppp),fPct(d.aprov),fPct(1-d.aprov)]);
        });
      });
      if(cutBody.length){
        doc.addPage();
        doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(22,34,46);
        doc.text("Optimización de corte — aprovechamiento y merma",40,42);
        doc.autoTable({head:[["Inserto","Componente","Material","Pieza (in)","Orientación","Pzas/placa","Aprovech.","Merma"]],body:cutBody,startY:60,
          styles:{font:"helvetica",fontSize:8,cellPadding:4,lineColor:[221,227,232],lineWidth:.5},
          headStyles:{fillColor:[30,48,64],textColor:255,fontStyle:"bold"},
          columnStyles:{0:{halign:"left",fontStyle:"bold"},1:{halign:"left"},2:{halign:"left"},4:{halign:"left"}}});
      }
      const P=computePresupuesto(R);
      const tabla=(titulo,head,body,opts)=>{
        if(!body||!body.length) return;
        doc.addPage();
        doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(22,34,46);
        doc.text(titulo,40,42);
        if(opts&&opts.sub){ doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(90,100,110);doc.text(opts.sub,40,58); }
        doc.autoTable({head:[head],body:body,startY:(opts&&opts.sub)?72:60,
          styles:{font:"helvetica",fontSize:8,cellPadding:4,lineColor:[221,227,232],lineWidth:.5,textColor:[24,36,48]},
          headStyles:{fillColor:[30,48,64],textColor:255,fontStyle:"bold"},
          columnStyles:(opts&&opts.cols)||{0:{halign:"left",fontStyle:"bold"},1:{halign:"left"}},
          bodyStyles:{halign:"right"},
          didParseCell:(opts&&opts.didParseCell)||undefined});
      };

      // Presupuesto y punto de equilibrio
      const per=(P.PE!=null&&P.ventas>0)?P.PE/P.ventas:null;
      let est; if(!P.conVol) est="Captura volúmenes para la utilidad real";
        else if(P.utilOper>0) est="La empresa genera utilidad de operación";
        else if(Math.abs(P.utilOper)<1) est="En punto de equilibrio"; else est="Por debajo del punto de equilibrio";
      tabla("Presupuesto y punto de equilibrio",["Concepto","Importe / valor"],[
        ["Ventas netas mensuales",P.conVol?fMXN(P.ventas):"—"],
        ["(−) Costo variable — material",P.conVol?"("+fMXN(P.matMes)+")":"—"],
        ["= Margen de contribución",P.conVol?fMXN(P.contribMes)+"  ("+fPct(P.ratio)+")":"—"],
        ["(−) Gastos fijos de operación","("+fMXN(P.GF)+")"],
        ["= Utilidad (pérdida) de operación",P.utilOper==null?"—":fMXN(P.utilOper)],
        ["",""],
        ["Punto de equilibrio (ventas)",P.PE==null?"—":fMXN(P.PE)],
        ["Margen de contribución usado",fPct(P.ratio)],
        ["Equilibrio como % de ventas actuales",per==null?"—":fPct(per)],
        ["Margen de seguridad",P.margenSeg==null?"—":fPct(P.margenSeg)],
        ["Faltante para el equilibrio",P.faltante==null?(P.conVol?fMXN(0):"—"):fMXN(P.faltante)],
        ["Estado financiero",est],
        ["",""],
        ["Gastos fijos — manufactura",fMXN(P.gfManuf)],
        ["Gastos fijos — administración",fMXN(P.gfAdmin)],
        ["Gastos fijos — comercial",fMXN(P.gfComer)],
        ["Gastos fijos — logística",fMXN(P.gfLog)],
        ["Gastos fijos — financiero",fMXN(P.gfFin)],
        ["Gastos fijos — otros",fMXN(P.otros)],
        ["Total gastos fijos mensuales",fMXN(P.GF)]
      ],{cols:{0:{halign:"left",fontStyle:"bold"}}});

      // Costeo mensual del periodo activo
      const kk=periodoKey(); const M=computeMes(R,kk);
      if(M.act.length){
        tabla("Costeo mensual — "+nombreMes(kk),
          ["Inserto","Cliente","Volumen","Costo integral u.","Precio cliente u.","Ventas del mes","Costo del mes","Utilidad del mes","Margen"],
          M.act.map(f=>[f.id,clienteLabel(f.it.ins),fN(f.vol,0),fMXN(f.it.costoIntegral),fMXN(f.it.precioClMXN),fMXN(f.ventas),
            f.it.complete?fMXN(f.costo):"—",f.it.complete?fMXN(f.util):"—",f.it.margenReal==null?"—":fPct(f.it.margenReal)])
            .concat([["TOTALES","",fN(M.piezas,0),"","",fMXN(M.ventas),fMXN(M.costoAbs),fMXN(M.utilAbs),M.margen==null?"—":fPct(M.margen)]]),
          {sub:"Contribución "+fMXN(M.contrib)+"  −  gastos fijos "+fMXN(M.fijos)+"  =  utilidad de operación "+fMXN(M.utilOper),
           cols:{0:{halign:"left",fontStyle:"bold"}}});
      }

      // Pool y centros de costo
      tabla("Pool de manufactura y tarifas por centro",["Concepto","Valor"],[
        ["Energía eléctrica",fMXN(R.energiaSubtotal)],
        ["Mano de obra directa",fMXN(R.moDirecta)],
        ["Indirectos fabriles",fMXN(R.indFabril)],
        ["TOTAL POOL DE MANUFACTURA",fMXN(R.pool)],
        ["Capacidad práctica",fN(R.capPractica,0)+" h/mes"],
        ["Tasa de planta",R.tasaPlanta==null?"—":fMXN(R.tasaPlanta)+" /h"],
        ["",""]
      ].concat(R.centros.map(c=>["Centro: "+c.c,"MO "+fMXN(c.moRate)+"  ·  Indirectos "+fMXN(c.indRate)+"  ·  Total "+fMXN(c.total)+"/h"])),
      {cols:{0:{halign:"left",fontStyle:"bold"}}});

      // Ruta de proceso
      const rutaBody=R.rutaCalc.filter(r=>r.ins).map(r=>[r.ins,String(r.op||""),r.proc||"",
        isNum(r.prep)?fN(num(r.prep),1):"—",isNum(r.lote)?fN(num(r.lote),0):"—",
        isNum(r.minMO)?fN(num(r.minMO),2):"—",fN(num(r.nop)||1,0),
        r.totU==null?"—":fMXN(r.totU),r.estado||""]);
      tabla("Ruta de proceso — tiempos y costo de conversión",
        ["Inserto","Op","Proceso","Min prep/lote","Lote","Min MO/u","Operadores","Costo/u","Estado"],rutaBody,
        {cols:{0:{halign:"left",fontStyle:"bold"},2:{halign:"left"},8:{halign:"left"}}});

      // Requerimiento de material (insertos con cantidad deseada)
      const reqBody=[];
      S.inserts.forEach(ins=>{ const dz=disenoCalc(ins); if(!dz) return;
        const cfgP=ensurePeriodo(periodoKey()).items[String(ins.id)]||{}; const Qd=(cfgP.inc?num(cfgP.vol):0); if(!(Qd>0)) return;
        dz.piezas.forEach(p=>{ const tot=num(p.cant)*Qd, frac=p.ppp>0?tot/p.ppp:0;
          reqBody.push([ins.id,fN(Qd,0),p.comp,"M"+(p.mat||1),fN(tot,0),String(p.ppp),String(Math.ceil(frac-1e-9))]); });
      });
      tabla("Requerimiento de material del mes",
        ["Inserto","Volumen","Componente","Mat.","Piezas totales","Pzas/placa","Placas a cortar"],reqBody,
        {cols:{0:{halign:"left",fontStyle:"bold"},2:{halign:"left"}}});

      // Validación
      tabla("Validación — controles de integridad",["Control","Resultado","Estado"],
        R.valid.map(v=>[v.k,String(v.v),v.rev?"REVISAR":"OK"]),
        {cols:{0:{halign:"left"},2:{halign:"left"}}});

      // Numeración de páginas
      const tot=doc.internal.getNumberOfPages();
      for(let i=1;i<=tot;i++){ doc.setPage(i);
        doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(140,150,160);
        doc.text("North Foam · Costeo FOAM Integral · "+new Date().toLocaleDateString("es-MX")+"   —   Página "+i+" de "+tot,40,560);
      }
      const blob=doc.output("blob");
      saveFile("Costeo_FOAM_Integral.pdf", blob);
    }catch(e){console.error(e);alert("No se pudo generar el PDF.");}
  },
  importJSON(ev){
    if(!esAdmin()) return;
    const file=ev.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=()=>{try{const p=JSON.parse(r.result);NF.importState(p);}
      catch(e){alert("No se pudo leer el archivo. ¿Es un respaldo válido?");}};
    r.readAsText(file);ev.target.value="";
  }
};
/* boolean select para financiero.activar */
document.addEventListener("change",e=>{
  const el=e.target;if(!el.dataset||el.dataset.type!=="bool")return;
  setPath(el.dataset.path, el.value==="true");save();renderKPIs();renderChain();renderSection(current);
});

/* ===== Tipo de cambio automático (Banxico vía /api/tc) ===== */
let TC_API=null;
async function autoTC(force=false){
  if(!puedeEditar()) return {ok:false,motivo:"Tu perfil no permite cambiar el tipo de cambio"};
  if(!force&&S.control.tcAuto===false) return {ok:false,motivo:"actualización automática desactivada"};
  try{
    const r=await fetch("/api/tc",{cache:"no-store"});
    if(!r.ok){
      let motivo="El servicio respondió "+r.status;
      try{const body=await r.json();if(body?.error) motivo=body.error;}catch(e){}
      return {ok:false,motivo};
    }
    const j=await r.json();
    if(!j||(!j.fix&&!j.pagos)) return {ok:false,motivo:"Banxico no devolvió datos"};
    TC_API=j;
    const pick=S.control.tcSerie==="pagos"?j.pagos:j.fix;
    if(!pick) return {ok:false,motivo:"Banxico no devolvió la serie seleccionada"};
    if(!(pick&&isFinite(pick.valor)&&pick.valor>0)) return {ok:false,motivo:"Banxico devolvió un dato no válido"};
    const cambio=(+S.control.tcBase!==+pick.valor)||(S.control.tcFecha!==pick.fecha);
    if(cambio){
      S.control.tcBase=pick.valor; S.control.tcFecha=pick.fecha;
      save(); renderKPIs(); renderChain();
      if(current==="dashboard"||current==="control"||current==="presupuesto") renderSection(current);
    }
    return {ok:true,cambio,valor:pick.valor,fecha:pick.fecha};
  }catch(e){return {ok:false,motivo:"No se pudo conectar con Banxico"};}
}

window.app=app;
window.NF_MODEL={
 defaults: DEFAULTS,
 read:()=>S,
 load:(state,role)=>{S=clone(state);setRol(role);ensureEscenarios();migrateCentros();ensureClientes();sortInserts();renderAll();},
 refreshTC:()=>autoTC(),
 render:()=>renderAll(),
 sections:SECTIONS,
 compute:()=>compute()
};
NF.start();
