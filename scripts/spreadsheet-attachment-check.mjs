import assert from 'node:assert/strict';
import { build } from 'esbuild';
import JSZip from 'jszip';

const compiled = await build({
  stdin: {
    contents: `export { extractSpreadsheetText } from './src/assistant-original/spreadsheet';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
});
const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const zip = new JSZip();
zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns:r="relationships"><sheets><sheet name="Costi" sheetId="1" r:id="rId1"/></sheets></workbook>`);
zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst><si><t>Prodotto</t></si><si><t>Occhiale Sole</t></si></sst>`);
zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Costo</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>12.5</v></c><c r="C2"><f>B2*2</f></c></row></sheetData></worksheet>`);
const bytes = await zip.generateAsync({ type: 'uint8array' });
const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const text = await module.extractSpreadsheetText(data);

assert.match(text, /\[FOGLIO: Costi\]/);
assert.match(text, /Prodotto\tCosto/);
assert.match(text, /Occhiale Sole\t12\.5\t=B2\*2/);
console.log('PASS XLSX attachment: workbook, shared strings, inline strings, numbers and formulas become local text.');
