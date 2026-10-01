import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import defaults from '../server/defaults.json' with {type:'json'};
import {validateState} from '../server/state.js';
const source=readFileSync('public/model.js','utf8');
function engine(script){return vm.runInNewContext(script+'\n({setState:value=>{S=value;},compute,disenoCalc,computePresupuesto})',{
 document:{addEventListener(){}},window:{addEventListener(){}},NF:{start(){}},console,setTimeout,clearTimeout
});}
function fixture(){const s=structuredClone(defaults);
 s.control.tcBase=20;s.control.margenObj=.25;
 s.capacidad={dias:20,turnos:1,horas:8,comida:0,festivos:0,vacaciones:0,ausentismo:0,mantenimiento:0,setups:0,paros:0,horasUsadas:120};
 s.empleados=[{puesto:'Operador de prueba',tipo:'Directa',centro:'Corte/Pegado/Ensamble',period:'Mensual',sueldo:16000,n:1,uniformes:0,capacitacion:0,ausent:0}];
 s.inserts=[{id:'QA-001',q25:70,q26:80,diseno:{materiales:[{nombre:'Material de prueba',precio:100,largo:10,ancho:10,grosor:1},{},{}],piezas:[{comp:'Tapa',m1:5,m2:5,grosor:1,mat:1,cant:2}]}}];
 s.ruta=[{ins:'QA-001',op:10,proc:'Corte/Pegado/Ensamble',ce:'Corte/Pegado/Ensamble',prep:0,lote:1,minMO:10,minMaq:0,nop:1,retrab:0,merma:0}];
 s.perInsert={'QA-001':{volumen:10,mermaMat:0,garantia:0}};
 return s;
}
test('known fixture: plate yield, material cost, payroll, and capacity',()=>{
 const s=fixture();validateState(s);const e=engine(source);e.setState(s);const result=e.compute();const plate=e.disenoCalc(s.inserts[0]);
 assert.equal(result.capPractica,160);assert.equal(result.moDirecta,16000);assert.equal(plate.piezas[0].ppp,4);assert.equal(plate.totalUSD,50);assert.equal(result.integral[0].materialMXN,1000);
});
test('financial engine matches the original repository for catalog, scenarios, and monthly overrides',t=>{
 let original;try{original=execFileSync('git',['show','e9ad524:index.html'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{t.skip('Original Git history is not included in the distribution ZIP.');return;}
 let script=original.match(/<script>([\s\S]*?)<\/script>/)[1];script=script.replace(/renderAll\(\);\s*autoTC\(\);[\s\S]*$/,'');
 const old=engine(script),current=engine(source);
 for(const scenario of ['Base','Conservador','Estrés'])for(const month of [false,true]){
  const data=fixture();data.control.escenario=scenario;data.escenarios.materiales={Base:1,Conservador:1.05,'Estrés':1.15};data.escenarios.tc={Base:1,Conservador:1.05,'Estrés':1.1};
  if(month){data.periodos={'2026-09':{items:{'QA-001':{inc:true,vol:20}},capacidad:{dias:22},mano:{'e0.sueldo':18000}}};data.periodoActivo='2026-09';data.periodoVista='2026-09';}
  validateState(data);old.setState(structuredClone(data));current.setState(structuredClone(data));
  assert.deepEqual(JSON.parse(JSON.stringify(current.compute())),JSON.parse(JSON.stringify(old.compute())));
  assert.deepEqual(JSON.parse(JSON.stringify(current.computePresupuesto(current.compute()))),JSON.parse(JSON.stringify(old.computePresupuesto(old.compute()))));
 }
});
