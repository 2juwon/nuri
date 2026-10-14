globalThis.NG = {};
require('../src/core.js'); 
NG.lib.pako = require('pako'); NG.lib.JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
NG.lib.DOMParser = DOMParser; NG.lib.XMLSerializer = XMLSerializer;
for (const f of ['hwp.js','hwpx-read.js','hwpx-template.js','hwpx-write.js','docx-write.js']) { try { require('../src/'+f); } catch(e){ if(e.code!=='MODULE_NOT_FOUND') throw e; } }
function text(blocks, ind=''){ let out=[]; for(const b of blocks){ if(b.t==='p') out.push(ind+(b.ps&&b.ps.pageBreak?'[쪽]':'')+b.runs.map(r=>r.t==='text'?r.text:r.t==='br'?'⏎':r.t==='tab'?'⇥':r.t==='img'?`[그림 ${r.bin} ${r.wrap} ${Math.round(r.w/283)}x${Math.round(r.h/283)}mm]`:'').join('')); else if(b.t==='table'){ out.push(ind+`[표 ${b.rows.length}x${b.cols.length} cols=${b.cols.map(x=>Math.round(x/283)).join(',')}]`); b.rows.forEach((row,ri)=>row.forEach(c=>out.push(ind+`  (${c.r},${c.c} ${c.rs}x${c.cs}${c.bf&&c.bf.bg?' bg'+c.bf.bg:''}) `+text(c.blocks).join(' / ')))); } else if(b.t==='box'){ out.push(ind+'[글상자]'); out.push(...text(b.blocks, ind+'  ')); } } return out; }
module.exports = { NG, text };
