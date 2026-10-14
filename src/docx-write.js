/* 누리글 — 공통 문서 모델 → Word(.docx) 저장 */
(function (NG) {
  'use strict';
  var esc = NG.esc;
  var tw = function (hu) { return Math.round((hu || 0) / 5); };     // 1 twip = 5 HU
  var emu = function (hu) { return Math.round((hu || 0) * 127); };  // 1 HU = 127 EMU
  var JC = { justify: 'both', left: 'left', right: 'right', center: 'center', distribute: 'distribute' };
  var BORDER = { NONE: 'nil', SOLID: 'single', DOT: 'dotted', DASH: 'dashed', DASH_DOT: 'dotDash', DASH_DOT_DOT: 'dotDotDash', LONG_DASH: 'dashed', DOUBLE_SLIM: 'double', SLIM_THICK: 'thinThickSmallGap', THICK_SLIM: 'thickThinSmallGap', SLIM_THICK_SLIM: 'triple', CIRCLE: 'dotted' };

  function W(doc) { this.doc = doc; this.media = []; this.mediaMap = {}; this.rid = 10; this.pid = 1; }
  W.prototype.image = function (key) {
    if (this.mediaMap[key]) return this.mediaMap[key];
    var b = this.doc.bins[key];
    if (!b || !b.data) return null;
    var ext = (b.ext || (b.mime || '').split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
    if (['png', 'jpg', 'gif', 'bmp'].indexOf(ext) < 0) return null;
    var m = { rid: 'rId' + (this.rid++), name: 'image' + (this.media.length + 1) + '.' + ext, data: b.data, ext: ext };
    this.media.push(m); this.mediaMap[key] = m;
    return m;
  };
  W.prototype.rpr = function (cs) {
    cs = cs || {};
    var f = esc(cs.font || NG.DEFAULT_FONT);
    var x = '<w:rPr><w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:eastAsia="' + f + '" w:cs="' + f + '"/>';
    if (cs.bold) x += '<w:b/><w:bCs/>';
    if (cs.italic) x += '<w:i/><w:iCs/>';
    if (cs.strike) x += '<w:strike/>';
    if (cs.color && cs.color !== '#000000') x += '<w:color w:val="' + cs.color.slice(1) + '"/>';
    var sz = Math.round((cs.size || 1000) / 50);
    x += '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>';
    if (cs.shade) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + cs.shade.slice(1) + '"/>';
    if (cs.underline) x += '<w:u w:val="single"/>';
    if (cs.sup) x += '<w:vertAlign w:val="superscript"/>';
    else if (cs.sub) x += '<w:vertAlign w:val="subscript"/>';
    return x + '</w:rPr>';
  };
  W.prototype.ppr = function (ps, pageBreak, extra) {
    ps = ps || {};
    var x = '<w:pPr>' + (pageBreak ? '<w:pageBreakBefore/>' : '');
    x += '<w:spacing w:before="' + tw(ps.before) + '" w:after="' + tw(ps.after) + '"';
    if (ps.lsType === 'fixed') x += ' w:line="' + Math.max(20, tw(ps.lsValue)) + '" w:lineRule="exact"';
    else if (ps.lsType === 'atleast') x += ' w:line="' + Math.max(20, tw(ps.lsValue)) + '" w:lineRule="atLeast"';
    else x += ' w:line="' + Math.round((ps.lsValue || 160) * 2.4) + '" w:lineRule="auto"';
    x += '/>';
    var ind = ' w:left="' + tw(ps.left) + '" w:right="' + tw(ps.right) + '"';
    if (ps.indent > 0) ind += ' w:firstLine="' + tw(ps.indent) + '"';
    else if (ps.indent < 0) ind += ' w:hanging="' + tw(-ps.indent) + '"';
    x += '<w:ind' + ind + '/><w:jc w:val="' + (JC[ps.align] || 'both') + '"/>' + (extra || '') + '</w:pPr>';
    return x;
  };
  W.prototype.runs = function (runs, endCs) {
    var self = this, x = '';
    runs.forEach(function (r) {
      if (r.t === 'text') x += '<w:r>' + self.rpr(r.cs) + '<w:t xml:space="preserve">' + esc(r.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')).replace(/\t/g, '</w:t><w:tab/><w:t xml:space="preserve">').replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">') + '</w:t></w:r>';
      else if (r.t === 'tab') x += '<w:r>' + self.rpr(r.cs || endCs) + '<w:tab/></w:r>';
      else if (r.t === 'br') x += '<w:r><w:br/></w:r>';
      else if (r.t === 'img') x += self.drawing(r);
    });
    if (!x) x = '<w:r>' + self.rpr(endCs) + '</w:r>';
    return x;
  };
  W.prototype.drawing = function (r) {
    var m = this.image(r.bin);
    if (!m) return '';
    var id = this.pid++, cx = emu(r.w), cy = emu(r.h);
    var graphic = '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="그림 ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + m.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    if (r.wrap === 'left' || r.wrap === 'right') {
      return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="' + (251658240 + id) + '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/>' +
        '<wp:positionH relativeFrom="column"><wp:align>' + r.wrap + '</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="' + id + '" name="그림 ' + id + '"/><wp:cNvGraphicFramePr/>' + graphic + '</wp:anchor></w:drawing></w:r>';
    }
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="' + id + '" name="그림 ' + id + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' + graphic + '</wp:inline></w:drawing></w:r>';
  };
  W.prototype.para = function (b, pageBreak) {
    var ps = b.ps || {};
    var onlyBlockImg = b.runs.length && b.runs.every(function (r) { return r.t === 'img' && r.wrap === 'block'; });
    var p2 = onlyBlockImg ? Object.assign({}, ps, { align: b.runs[0].align || 'left' }) : ps;
    return '<w:p>' + this.ppr(p2, pageBreak) + this.runs(b.runs, b.endCs) + '</w:p>';
  };
  W.prototype.border = function (name, l) {
    if (!l || l.type === 'NONE') return '<w:' + name + ' w:val="nil"/>';
    var sz = Math.max(2, Math.round((l.width || 0.12) / 25.4 * 72 * 8));
    return '<w:' + name + ' w:val="' + (BORDER[l.type] || 'single') + '" w:sz="' + sz + '" w:space="0" w:color="' + (l.color || '#000000').slice(1) + '"/>';
  };
  W.prototype.table = function (t, pageBreak) {
    var self = this, cols = t.cols, nrows = t.rows.length;
    var x = '';
    if (pageBreak) x += '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
    var total = cols.reduce(function (a, b) { return a + b; }, 0);
    x += '<w:tbl><w:tblPr><w:tblW w:w="' + tw(total) + '" w:type="dxa"/>' + (t.align === 'center' ? '<w:jc w:val="center"/>' : t.align === 'right' ? '<w:jc w:val="right"/>' : '') +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="102" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="102" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      '<w:tblGrid>' + cols.map(function (w) { return '<w:gridCol w:w="' + tw(w) + '"/>'; }).join('') + '</w:tblGrid>';
    // 격자: 줄마다 칸 위치 → 셀(시작) 또는 세로 병합 이어짐
    var grid = [];
    for (var r = 0; r < nrows; r++) grid.push([]);
    t.rows.forEach(function (row) {
      row.forEach(function (c) {
        for (var i = 0; i < c.rs && c.r + i < nrows; i++) grid[c.r + i][c.c] = { cell: c, first: i === 0 };
      });
    });
    for (r = 0; r < nrows; r++) {
      var h = t.rowH && t.rowH[r] ? '<w:trPr><w:trHeight w:val="' + tw(t.rowH[r]) + '" w:hRule="atLeast"/></w:trPr>' : '';
      x += '<w:tr>' + h;
      for (var c = 0; c < cols.length;) {
        var g = grid[r][c];
        if (!g) { x += '<w:tc><w:tcPr><w:tcW w:w="' + tw(cols[c]) + '" w:type="dxa"/></w:tcPr><w:p/></w:tc>'; c++; continue; }
        var cell = g.cell, w = 0;
        for (var k = cell.c; k < cell.c + cell.cs; k++) w += cols[k] || 0;
        var bf = cell.bf || {};
        var pr = '<w:tcPr><w:tcW w:w="' + tw(w) + '" w:type="dxa"/>' + (cell.cs > 1 ? '<w:gridSpan w:val="' + cell.cs + '"/>' : '') +
          (cell.rs > 1 ? (g.first ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '') +
          '<w:tcBorders>' + self.border('top', bf.t) + self.border('left', bf.l) + self.border('bottom', bf.b) + self.border('right', bf.r) + '</w:tcBorders>' +
          (bf.bg ? '<w:shd w:val="clear" w:color="auto" w:fill="' + bf.bg.slice(1) + '"/>' : '') +
          '<w:vAlign w:val="' + ({ top: 'top', middle: 'center', bottom: 'bottom' }[cell.valign] || 'center') + '"/></w:tcPr>';
        var inner = g.first ? self.blocks(cell.blocks) : '<w:p/>';
        if (!inner || /<\/w:tbl>$/.test(inner)) inner += '<w:p/>';
        x += '<w:tc>' + pr + inner + '</w:tc>';
        c += cell.cs;
      }
      x += '</w:tr>';
    }
    return x + '</w:tbl>';
  };
  W.prototype.blocks = function (blocks) {
    var self = this, x = '';
    (blocks || []).forEach(function (b) {
      var pb = !!(b.pageBreak || (b.ps && b.ps.pageBreak));
      if (b.t === 'p') x += self.para(b, pb);
      else if (b.t === 'table') x += self.table(b, pb) + '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
      else if (b.t === 'box') {
        var line = { type: 'SOLID', width: 0.12, color: '#000000' };
        x += self.table({ cols: [b.w || 40000], rows: [[{ r: 0, c: 0, rs: 1, cs: 1, valign: 'top', bf: b.bf || { l: line, r: line, t: line, b: line }, blocks: b.blocks }]], rowH: [0] }, pb);
      }
    });
    return x;
  };

  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  NG.writeDocx = async function (doc, opt) {
    opt = opt || {};
    var JSZip = NG.lib.JSZip || globalThis.JSZip;
    var w = new W(doc), p = doc.page, m = p.margin;
    var body = w.blocks(doc.blocks);
    var hdrFtr = [], rels = [];
    function hfXml(tag, hf, withNum, numAlign) {
      var x = '';
      (hf ? hf.blocks : []).forEach(function (b) { if (b.t === 'p') x += w.para(b, false); });
      if (withNum) {
        var side = doc.pageNum.side ? doc.pageNum.side + ' ' : '';
        var side2 = doc.pageNum.side ? ' ' + doc.pageNum.side : '';
        x += '<w:p>' + w.ppr({ align: numAlign, lsType: 'percent', lsValue: 100 }) + '<w:r>' + w.rpr({ size: 900 }) + '<w:t xml:space="preserve">' + esc(side) + '</w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r>' + w.rpr({ size: 900 }) + '<w:t>1</w:t></w:r></w:fldSimple><w:r>' + w.rpr({ size: 900 }) + '<w:t xml:space="preserve">' + esc(side2) + '</w:t></w:r></w:p>';
      }
      if (!x) x = '<w:p/>';
      return DECL + '<w:' + tag + ' ' + NS + '>' + x + '</w:' + tag + '>';
    }
    var pn = doc.pageNum && doc.pageNum.pos && doc.pageNum.pos !== 'NONE' ? doc.pageNum.pos : null;
    var numAlign = pn ? (/LEFT/.test(pn) ? 'left' : /RIGHT/.test(pn) ? 'right' : 'center') : null;
    var refs = '';
    if (doc.header || (pn && /^TOP/.test(pn))) {
      hdrFtr.push({ name: 'header1.xml', xml: hfXml('hdr', doc.header, pn && /^TOP/.test(pn), numAlign), type: 'header' });
      refs += '<w:headerReference w:type="default" r:id="rId3"/>';
      rels.push('<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
    }
    if (doc.footer || (pn && /^BOTTOM/.test(pn))) {
      hdrFtr.push({ name: 'footer1.xml', xml: hfXml('ftr', doc.footer, pn && /^BOTTOM/.test(pn), numAlign), type: 'footer' });
      refs += '<w:footerReference w:type="default" r:id="rId4"/>';
      rels.push('<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
    }
    var sect = '<w:sectPr>' + refs + '<w:pgSz w:w="' + tw(p.width) + '" w:h="' + tw(p.height) + '"' + (p.landscape ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + tw(m.top + m.header) + '" w:right="' + tw(m.right) + '" w:bottom="' + tw(m.bottom + m.footer) + '" w:left="' + tw(m.left) + '" w:header="' + tw(m.top) + '" w:footer="' + tw(m.bottom) + '" w:gutter="0"/></w:sectPr>';
    var document = DECL + '<w:document ' + NS + '><w:body>' + body + sect + '</w:body></w:document>';
    w.media.forEach(function (md) { rels.push('<Relationship Id="' + md.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + md.name + '"/>'); });
    rels.unshift('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>');
    var styles = DECL + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="함초롬바탕" w:hAnsi="함초롬바탕" w:eastAsia="함초롬바탕" w:cs="함초롬바탕"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="384" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="a1"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    var settings = DECL + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="800"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    var exts = {};
    w.media.forEach(function (md) { exts[md.ext] = 1; });
    var mimeOf = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };
    var ct = DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Object.keys(exts).map(function (e) { return '<Default Extension="' + e + '" ContentType="' + mimeOf[e] + '"/>'; }).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      hdrFtr.map(function (h) { return '<Override PartName="/word/' + h.name + '" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + h.type + '+xml"/>'; }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = DECL + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(opt.title || '') + '</dc:title><dc:creator>누리글</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
    var zip = new JSZip();
    zip.file('[Content_Types].xml', ct);
    zip.file('_rels/.rels', DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    zip.file('docProps/core.xml', core);
    zip.file('word/document.xml', document);
    zip.file('word/styles.xml', styles);
    zip.file('word/settings.xml', settings);
    hdrFtr.forEach(function (h) { zip.file('word/' + h.name, h.xml); });
    zip.file('word/_rels/document.xml.rels', DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>');
    w.media.forEach(function (md) { zip.file('word/media/' + md.name, md.data); });
    return zip.generateAsync({ type: opt.type || 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  };
})(NG);
