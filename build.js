const fs = require('fs');
const order = ['core.js','hwp.js','hwpx-read.js','hwpx-template.js','hwpx-write.js','docx-write.js','dom.js','editor.js','sample.js','app.js'];
const ui = fs.readFileSync('src/ui.html','utf8');
const js = order.map(f => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync('src/'+f,'utf8')).join('\n').replace(/<\/script/gi, '<\\/script');
const libs = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></script>\n';
const body = ui + '\n' + libs + '<script>\n' + js + '\n</script>\n';
fs.mkdirSync('dist', {recursive:true});
fs.writeFileSync('dist/artifact.html', body);
// 일반 웹(GitHub Pages 등)용 완성본
const headEnd = ui.indexOf('</style>') + 8;
const head = ui.slice(0, headEnd), rest = ui.slice(headEnd);
const og = '<meta property="og:title" content="누리글"><meta property="og:description" content="한글(hwp·hwpx) 문서를 웹에서 열고 고치고 저장하는 무료 문서 편집기">';
const page = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + og + '\n' + head + '\n</head>\n<body>\n' + rest + '\n' + libs + '<script>\n' + js + '\n</script>\n</body>\n</html>\n';
fs.writeFileSync('dist/index.html', page);
fs.writeFileSync('index.html', page); // GitHub Pages
console.log('built', fs.statSync('dist/artifact.html').size, fs.statSync('dist/index.html').size);
