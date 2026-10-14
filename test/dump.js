const { NG, text } = require('./load.js');
const fs = require('fs');
(async()=>{
for (const f of process.argv.slice(2)) {
  const u8 = new Uint8Array(fs.readFileSync(f));
  try {
    const doc = f.endsWith('.hwpx') ? await NG.readHwpx(u8) : NG.readHwp(u8);
    console.log('=====', f.split('/').pop(), JSON.stringify({page:doc.page, pageNum:doc.pageNum, header: doc.header&&text(doc.header.blocks), footer: doc.footer&&text(doc.footer.blocks), bins:Object.keys(doc.bins)}));
    console.log(text(doc.blocks).slice(0, +process.env.N||40).join('\n'));
  } catch(e) { console.log('=====', f, 'ERROR', e.stack); }
}
})();
