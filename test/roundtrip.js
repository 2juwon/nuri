const L = require('./load.js'); const N = L.NG; const fs = require('fs'), path=require('path');
(async()=>{
  const out = process.env.OUT || '/tmp/claude-rt'; fs.mkdirSync(out,{recursive:true});
  for (const f of process.argv.slice(2)) {
    const u8 = new Uint8Array(fs.readFileSync(f));
    const doc = f.endsWith('.hwpx') ? await N.readHwpx(u8) : N.readHwp(u8);
    const bytes = await N.writeHwpx(doc, {title:'test'});
    const o = path.join(out, path.basename(f).replace(/\.hwpx?$/,'')+'.rt.hwpx');
    fs.writeFileSync(o, bytes);
    const back = await N.readHwpx(bytes);
    const a = L.text(doc.blocks).join('\n'), b = L.text(back.blocks).join('\n');
    console.log(a===b ? 'SAME ' : 'DIFF ', o, bytes.length);
    if (a!==b) { const al=a.split('\n'), bl=b.split('\n'); for(let i=0;i<Math.max(al.length,bl.length);i++) if(al[i]!==bl[i]){ console.log('  A:',al[i]); console.log('  B:',bl[i]); break; } }
  }
})().catch(e=>console.log(e.stack));
