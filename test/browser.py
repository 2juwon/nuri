import asyncio, sys, os, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBS = {
 'jszip.min.js': ROOT+'/node_modules/jszip/dist/jszip.min.js',
 'pako.min.js': ROOT+'/node_modules/pako/dist/pako.min.js',
 'html2canvas.min.js': ROOT+'/node_modules/html2canvas/dist/html2canvas.min.js',
 'jspdf.umd.min.js': ROOT+'/node_modules/jspdf/dist/jspdf.umd.min.js',
}
async def setup(ctx):
    async def handle(route):
        url = route.request.url
        for k,v in LIBS.items():
            if url.endswith(k):
                return await route.fulfill(path=v, content_type='application/javascript')
        if 'fonts.g' in url: return await route.fulfill(body='', content_type='text/css')
        await route.continue_()
    await ctx.route('**/*', handle)
async def open_page(p, w=1400, h=900, mobile=False, dark=False, file='index.html', clear=True):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width':w,'height':h}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile, color_scheme='dark' if dark else 'light', accept_downloads=True)
    await setup(ctx)
    page = await ctx.new_page()
    errs=[]
    page.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None)
    page.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    await page.goto('file://'+ROOT+'/dist/'+file)
    await page.wait_for_timeout(700)
    return b, page, errs
