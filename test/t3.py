import asyncio, sys, os
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import *
FILES = sys.argv[1:]
async def main():
    async with async_playwright() as p:
        b, page, errs = await open_page(p)
        for f in FILES:
            await page.set_input_files('#fileIn', f)
            await page.wait_for_timeout(1500)
            name = os.path.basename(f)
            info = await page.evaluate("()=>({pages: NG.editor.pages, toast: (document.querySelector('.toast')||{}).textContent})")
            print(name, info)
            await page.evaluate("document.getElementById('desk').scrollTop = 0")
            await page.screenshot(path='/tmp/claude-open-'+name+'.png')
            # 저장
            await page.click('#bSave')
            async with page.expect_download() as dl:
                await page.click('.pop .mi >> nth=0')
            d = await dl.value
            out = '/tmp/claude-saved-'+name.rsplit('.',1)[0]+'.hwpx'
            await d.save_as(out)
            async with page.expect_download() as dl2:
                await page.click('#bSave'); await page.click('.pop .mi >> nth=1')
            d2 = await dl2.value
            await d2.save_as(out.replace('.hwpx','.docx'))
        print('\n'.join(errs[:30]))
        await b.close()
asyncio.run(main())
