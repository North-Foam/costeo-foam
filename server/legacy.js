import { validateState } from './state.js';

// Convert backups produced by the browser-only version without carrying its PIN
// into the shared database. Unknown fields still fail validation.
export function convertLegacyState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('El respaldo debe contener un objeto JSON.');
  const state = structuredClone(input);
  if (Object.hasOwn(state, 'seguridad')) {
    if (!state.seguridad || typeof state.seguridad !== 'object' ||
        Object.keys(state.seguridad).some(key => key !== 'pin')) {
      throw new Error('El respaldo contiene ajustes de seguridad desconocidos.');
    }
    delete state.seguridad;
  }
  if (state.control && !Object.hasOwn(state.control, 'tcAuto')) state.control.tcAuto = false;
  for (const insert of state.inserts ?? []) {
    for (const piece of insert.diseno?.piezas ?? []) {
      if (typeof piece.mat === 'string' && /^[1-3]$/.test(piece.mat)) piece.mat = Number(piece.mat);
    }
  }
  return validateState(state);
}
