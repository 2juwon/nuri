import asyncio, sys
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import *
INIT = """
window.__saved = [];
window.claude = { use: async (n) => n === 'downloads' ? { save: async ({filename, data}) => {
  const buf = new Uint8Array(await data.arrayBuffer());
  window.__saved.push({filename, size: buf.length, head: Array.from(buf.slice(0,5))}); if (/pdf$/.test(filename)) { let s=''; for (let i=0;i<buf.length;i++) s+=String.fromCharCode(buf[i]); window.__pdf = btoa(s); }
  if (/\\.hwpx$/.test(filename)) throw {code:'rejected_extension', message:'x'};
  return {status:'saved'}; } } : null };
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':1300,'height':900})
        await setup(ctx)
        await ctx.add_init_script(INIT)
        page = await ctx.new_page()
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await page.goto('file://'+ROOT+'/dist/index.html'); await page.wait_for_timeout(800)
        print('print button hidden:', await page.evaluate("document.getElementById('bPrint').hidden"))
        await page.click('#bSave'); await page.click('.pop .mi >> nth=0')
        await page.wait_for_timeout(800)
        print('dialog:', await page.text_content('.dlg h2'))
        await page.click('.dlg .btn.primary'); await page.wait_for_timeout(500)
        await page.click('#bSave'); await page.click('.pop .mi >> nth=2')
        for i in range(60):
            await page.wait_for_timeout(500)
            s = await page.evaluate("window.__saved.map(x=>x.filename)")
            if any(x.endswith('.pdf') for x in s): break
        print('saved:', await page.evaluate("JSON.stringify(window.__saved)"))
        import base64
        open('/tmp/claude-a.pdf','wb').write(base64.b64decode(await page.evaluate('window.__pdf')))
        await page.screenshot(path='/tmp/claude-a1.png')
        print('\n'.join(errs[:20]))
        await b.close()
asyncio.run(main())
