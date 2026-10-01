import test from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../server/defaults.json' with { type: 'json' };
import { convertLegacyState } from '../server/legacy.js';

test('converts browser backup while retaining historical business fields', () => {
  const old = structuredClone(defaults);
  delete old.control.tcAuto;
  old.seguridad = { pin: 'old-pin' };
  old.catalogo = [{ nombre: 'PU BUN', costo: 20, bloque: true }];
  old.inserts = [{ id: '160143', diseno: { materiales: [{ nombre: 'PU BUN' }], piezas: [{ comp: 'Tapa', mat: '2' }], qDeseada: 140 } }];
  old.presupuesto.periodo = 'anio:2026';
  const current = convertLegacyState(old);
  assert.equal(current.control.tcAuto, false);
  assert.equal(current.inserts[0].diseno.piezas[0].mat, 2);
  assert.equal(current.inserts[0].diseno.qDeseada, 140);
  assert.equal(current.catalogo[0].bloque, true);
  assert.equal(current.presupuesto.periodo, 'anio:2026');
  assert.equal(Object.hasOwn(current, 'seguridad'), false);
  assert.equal(old.inserts[0].diseno.piezas[0].mat, '2');
});

test('rejects unknown fields instead of silently dropping them', () => {
  const old = structuredClone(defaults);
  old.unknown = 'data';
  assert.throws(() => convertLegacyState(old));
});
