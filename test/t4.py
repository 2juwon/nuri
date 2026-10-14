import asyncio, sys, base64
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import *
async def main():
    async with async_playwright() as p:
        b, page, errs = await open_page(p)
        await page.click('#bNew'); await page.click('.dlg .btn.primary')
        await page.keyboard.type('표 시험 문서')
        await page.keyboard.press('Enter')
        # 표 3x4
        await page.click('#bTable')
        await page.click('.gridpick span[data-r="3"][data-c="4"]')
        await page.keyboard.type('가')
        await page.keyboard.press('Tab'); await page.keyboard.type('나')
        print('ctxTable visible:', await page.is_visible('#ctxTable'))
        # 셀 끌어서 고르기: (0,0)~(1,1)
        tds = await page.query_selector_all('#doc table td')
        b0 = await tds[0].bounding_box(); b5 = await tds[5].bounding_box()
        await page.mouse.move(b0['x']+20, b0['y']+8); await page.mouse.down()
        await page.mouse.move(b5['x']+20, b5['y']+8, steps=5); await page.mouse.up()
        print('selected:', await page.evaluate("document.querySelectorAll('#doc td.ng-sel').length"))
        await page.click('#bMerge')
        print('after merge cells:', await page.evaluate("[...document.querySelectorAll('#doc table tr')].map(tr=>[...tr.cells].map(c=>(c.rowSpan>1||c.colSpan>1)?c.rowSpan+'x'+c.colSpan:'1').join(',')).join(' | ')"))
        # 줄 아래 넣기, 칸 오른쪽 넣기
        await page.click('[data-t="rowBelow"]'); await page.click('[data-t="colRight"]')
        print('grid:', await page.evaluate("(()=>{const g=NG.tableGrid(document.querySelector('#doc table'));return g.rows.length+'x'+g.cols})()"))
        # 셀 나누기
        await page.click('#bSplit'); await page.click('.pop .mi >> nth=0')
        print('after split:', await page.evaluate("(()=>{const g=NG.tableGrid(document.querySelector('#doc table'));return g.rows.length+'x'+g.cols+' cells '+g.cells.length})()"))
        # 배경색
        await page.click('#bCellBg'); await page.click('.pop .sw >> nth=9')
        # 그림
        await page.click('#doc > p:last-child')
        await page.set_input_files('#imgIn', '/tmp/claude-img.png')
        await page.wait_for_timeout(500)
        print('img selected:', await page.is_visible('#ctxImg'), await page.evaluate("!!document.querySelector('#doc img')"))
        await page.click('[data-w="right"]')
        h = await page.query_selector('.ng-ov-h[data-h="se"]'); hb = await h.bounding_box()
        await page.mouse.move(hb['x']+5, hb['y']+5); await page.mouse.down(); await page.mouse.move(hb['x']+105, hb['y']+60, steps=4); await page.mouse.up()
        print('img size:', await page.evaluate("document.querySelector('#doc img').style.cssText"))
        # 도형
        await page.click('#doc > p:last-child'); await page.keyboard.press('End')
        await page.click('#bShape'); await page.click('.pop .mi >> nth=2')
        await page.click('#bShapeFill'); await page.click('.pop .sw >> nth=13')
        print('shape:', await page.evaluate("document.querySelectorAll('#doc img')[1].getAttribute('data-shape')"))
        await page.screenshot(path='/tmp/claude-s4.png')
        # 쪽 설정: 가로
        await page.click('[data-cmd="pageDlg"]'); await page.click('#pO button[data-o="1"]'); await page.click('.dlg .btn.primary')
        print('landscape:', await page.evaluate("JSON.stringify(NG.editor.settings.page)"))
        # 머리말
        await page.click('[data-cmd="hfDlg"]'); await page.fill('#hT', '머리말 시험'); await page.select_option('#nP', 'BOTTOM_RIGHT'); await page.click('.dlg .btn.primary')
        await page.wait_for_timeout(200)
        await page.screenshot(path='/tmp/claude-s4b.png')
        # 찾기 바꾸기
        await page.keyboard.press('Control+f'); await page.fill('#fQ','시험'); await page.fill('#fR','검사'); await page.click('#fAll')
        print('find:', await page.text_content('#fMsg'))
        # 저장 → 다시 열기
        async with page.expect_download() as dl:
            await page.click('#bSave'); await page.click('.pop .mi >> nth=0')
        d = await dl.value; await d.save_as('/tmp/claude-t4.hwpx')
        await page.set_input_files('#fileIn', '/tmp/claude-t4.hwpx'); await page.wait_for_timeout(1200)
        print('reopen grid:', await page.evaluate("(()=>{const t=document.querySelector('#doc table'); if(!t) return 'no table'; const g=NG.tableGrid(t);return g.rows.length+'x'+g.cols+' cells '+g.cells.length+' imgs '+document.querySelectorAll('#doc img').length+' header '+JSON.stringify(NG.editor.settings.header)+' pn '+JSON.stringify(NG.editor.settings.pageNum)+' land '+NG.editor.settings.page.landscape})()"))
        await page.screenshot(path='/tmp/claude-s4c.png')
        print('\n'.join(errs[:30]))
        await b.close()
asyncio.run(main())
