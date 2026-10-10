import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import defaults from './defaults.json' with { type: 'json' };
const num = z.number().finite().min(-1e12).max(1e12).nullable();
const text = z.string().max(500).refine(s => !/[<>\u0000-\u0008]/.test(s), 'No se permite código HTML en los campos.');
const key = z.string().max(200).refine(s => !['__proto__', 'constructor', 'prototype'].includes(s) && !/[<>\u0000]/.test(s));
const id = z.string().regex(/^[\p{L}\p{N}_ -]{1,80}$/u, 'Usa letras, números, espacios, guion o guion bajo en el número de inserto.').refine(s => !['__proto__', 'constructor', 'prototype'].includes(s));
const numericRecord = z.record(key, num);
const numbers = keys => Object.fromEntries(keys.map(k => [k, num.optional()]));
const material = z.object({ nombre: text.optional(), bloque: z.boolean().optional(), ...numbers(['precio','grosor','ancho','largo','costo']) }).strict();
const toNumber = v => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) ? Number(v) : v;
const pieza = z.object({ comp: text.optional(), ...numbers(['m1','m2','grosor','cant','piezasManual','s1','s2']), mat: z.preprocess(toNumber, num.optional()).optional() }).strict();
const period = z.object({
  items: z.record(id, z.object({ inc: z.boolean().optional(), vol: num.optional() }).strict()),
  estado: z.enum(['cerrado']).nullable().optional(),
  cierre: z.object({ fecha: text, tc: num, gf: num, items: z.record(id, z.record(key, num)) }).strict().nullable().optional(), indirectos: numericRecord.optional(), capacidad: numericRecord.optional(), energia: numericRecord.optional(), mano: numericRecord.optional()
}).strict();
const concepto = z.object({ n: text, d: text, q: num, u: num, i: num }).strict();
const factura = z.object({
  uuid: z.string().regex(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/), fecha: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/),
  serie: text.optional(), folio: text.optional(), tipo: z.enum(['I','E']), moneda: z.string().regex(/^[A-Z]{3}$/), tc: num.optional(),
  emisorRfc: text.optional(), receptorRfc: text.optional(), receptor: text.optional(), subtotal: num, total: num,
  cancelada: z.boolean().optional(), metodo: text.optional(), conceptos: z.array(concepto).max(500)
}).strict();
const fechaR = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/);
const uuidR = z.string().regex(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
const compra = z.object({
  uuid: uuidR, fecha: fechaR, serie: text.optional(), folio: text.optional(), tipo: z.enum(['I','E','N']), moneda: z.string().regex(/^[A-Z]{3}$/), tc: num.optional(),
  emisorRfc: text.optional(), emisor: text.optional(), receptorRfc: text.optional(), receptor: text.optional(), subtotal: num, total: num, metodo: text.optional(),
  cancelada: z.boolean().optional(), conceptos: z.array(concepto).max(500),
  nomina: z.object({ fechaPago: fechaR, percepciones: num, deducciones: num }).strict().optional()
}).strict();
const pago = z.object({ uuid: uuidR, fecha: fechaR, receptorRfc: text.optional(), docs: z.array(z.object({ id: uuidR, imp: num, f: fechaR }).strict()).max(500) }).strict();
const registro = z.object({
  id: z.string().regex(/^[a-z0-9]{4,24}$/), fecha: z.string().regex(/^(\d{4}-(0[1-9]|1[0-2])-\d{2})?$/), ins: id,
  pzas: num.optional(), rech: num.optional(), prep: num.optional(), min: num.optional(), nop: num.optional(), nota: text.nullable().optional()
}).strict();
const schema = z.object({
  control: z.object({ escenario: z.enum(['Base','Conservador','Estrés']), tcBase: num, margenObj: num, vigenciaMeses: num, tcFecha: text.nullable(), tcAuto: z.boolean(), tcSerie: z.enum(['fix','pagos']) }).strict(),
  escenarios: z.object(Object.fromEntries(Object.keys(defaults.escenarios).map(k => [k, z.object({Base:num, Conservador:num, 'Estrés':num}).strict()]))).strict(),
  capacidad: z.object(numbers(Object.keys(defaults.capacidad))).strict(), moParams: z.object(numbers(Object.keys(defaults.moParams))).strict(),
  empleados: z.array(z.object({ puesto:text, tipo:text, centro:text, period:text, ...numbers(['sueldo','n','uniformes','capacitacion','ausent']) }).strict()).max(2000),
  maquinaria: z.array(z.object({nombre:text.optional(),centro:text.optional(), ...numbers(['vida','adquisicion','residual','mantenimiento','refacciones','seguro'])}).strict()).max(2000),
  indirectos: z.array(z.object({ c:text, cl:text, ce:text, m:num }).strict()).max(2000),
  energia: z.object({ ...numbers(['precio','cargoFijo','demandaKW','cargoDemanda','reciboReal']), cargas:z.array(z.object({n:text,kw:num,h:num,v:z.boolean().optional()}).strict()).max(2000) }).strict(),
  financiero: z.object({ activar:z.boolean(), ...numbers(Object.keys(defaults.financiero).filter(k=>k!=='activar')) }).strict(),
  inserts:z.array(z.object({id,cliente:text.nullable().optional(),q25:num.optional(),q26:num.optional(),diseno:z.object({materiales:z.array(material).max(3),piezas:z.array(pieza).max(2000),qDeseada:num.optional()}).strict().optional()}).strict()).max(2000),
  catalogo:z.array(material).max(2000), perInsert:z.record(id,z.object({ ...numbers(['mermaMat','margenObj','garantia','volumen','flete','precioCliente','rechazo','consumibles','mantenimiento','empaque','garantias']), cliente:text.nullable().optional() }).strict()),
  presupuesto:z.object({otrosFijos:num,meta:num,periodo:z.string().regex(/^(catalogo|anio:\d{4}|\d{4}-(0[1-9]|1[0-2]))$/).optional()}).strict(),
  periodos:z.record(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),period),
  periodoActivo:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(), periodoVista:z.string().regex(/^(catalogo|anio:\d{4}|\d{4}-(0[1-9]|1[0-2]))$/),
  facturas:z.array(factura).max(3000).optional(), compras:z.array(compra).max(4000).optional(), pagos:z.array(pago).max(3000).optional(),
  compraMap:z.record(key, z.object({ t: z.enum(['mat','gasto','energia','nomina','ign']), v: text.optional() }).strict()).optional(),
  seguridad:z.object({ pinSalt: z.string().regex(/^[0-9a-f]{32}$/), pinHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict().optional(), produccion:z.array(registro).max(10000).optional(), facturaMap:z.record(key,id).optional(),
  clientes:z.array(text).max(2000), ruta:z.array(z.object({ ins:id, proc:text, ce:text, ...numbers(['op','prep','lote','minMO','minMaq','nop','retrab','merma']) }).strict()).max(10000)
}).strict();
export function validateState(value) {
  const state = schema.parse(value);
  if (new Set(state.inserts.map(i=>i.id)).size !== state.inserts.length) { const e=new Error('Hay números de inserto duplicados.');e.status=400;throw e; }
  if (state.facturas && new Set(state.facturas.map(f=>f.uuid)).size !== state.facturas.length) { const e=new Error('Hay facturas duplicadas (mismo UUID).');e.status=400;throw e; }
  return state;
}
export function validateRoleChanges(role, before, after) {
  if (role === 'admin') return;
  if (!isDeepStrictEqual(before.seguridad ?? null, after.seguridad ?? null)) {
    const e = new Error('Solo el administrador puede crear o cambiar el PIN.'); e.status=403; throw e;
  }
  for (const [month, old] of Object.entries(before.periodos)) {
    const current = after.periodos[month];
    if (!current || (old.estado ?? null) !== (current.estado ?? null) || (old.estado === 'cerrado' && !isDeepStrictEqual(old,current))) {
      const e = new Error('Solo el administrador puede borrar, cerrar, reabrir o modificar un periodo cerrado.'); e.status=403; throw e;
    }
  }
  for (const [month,p] of Object.entries(after.periodos)) if (!before.periodos[month] && p.estado === 'cerrado') {
    const e = new Error('Solo el administrador puede cerrar periodos.');e.status=403;throw e;
  }
}
