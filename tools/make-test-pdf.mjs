// Emits a minimal, valid multi-page PDF with correct xref offsets, for
// verifying the Read tab. Not shipped — a dev tool. Usage:
//   node tools/make-test-pdf.mjs 5 > test-book.pdf
import { Buffer } from 'node:buffer';

const pages = Math.max(1, parseInt(process.argv[2] || '5', 10));
const objs = [];
function add(body) { objs.push(body); return objs.length; } // 1-based obj number

const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
const pagesObj = 2; objs.push(null); // reserve #2, fill later
const fontObj = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

const kids = [];
for (let i = 1; i <= pages; i++) {
  const text = `BT /F1 40 Tf 60 300 Td (Page ${i} of ${pages}) Tj ET\n` +
               `BT /F1 16 Tf 60 250 Td (Chess Training Center test book) Tj ET`;
  const contentNum = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  const pageNum = add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] ` +
    `/Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentNum} 0 R >>`);
  kids.push(`${pageNum} 0 R`);
}
objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;

let pdf = '%PDF-1.4\n';
const offsets = [];
objs.forEach((body, idx) => {
  offsets[idx] = Buffer.byteLength(pdf, 'latin1');
  pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
offsets.forEach(off => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

process.stdout.write(Buffer.from(pdf, 'latin1'));
