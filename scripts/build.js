import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
for (const [source, name] of [
 ['dompurify/dist/purify.min.js','purify'], ['chart.js/dist/chart.umd.js','chart'],
 ['exceljs/dist/exceljs.min.js','exceljs'], ['jspdf/dist/jspdf.umd.min.js','jspdf'],
 ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js','autotable']
]) await copyFile('node_modules/' + source, 'public/vendor/' + name + '.js');
console.log('Assets prepared.');
