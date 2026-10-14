/* 누리글 — HWPX(.hwpx) 읽기 → 공통 문서 모델 */
(function (NG) {
  'use strict';
  var ALIGN = { JUSTIFY: 'justify', LEFT: 'left', RIGHT: 'right', CENTER: 'center', DISTRIBUTE: 'distribute', DISTRIBUTE_SPACE: 'distribute' };

  function kids(el, name) {
    var out = [];
    if (!el) return out;
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || n.localName === name)) out.push(n);
    return out;
  }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function attr(el, name, def) { if (!el) return def; var v = el.getAttribute(name); return v === null || v === '' ? def : v; }
  function num(el, name, def) { var v = attr(el, name, null); return v === null ? def : +v; }
  function desc(el, name) { // 깊이 우선으로 첫 후손
    if (!el) return null;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      if (n.localName === name) return n;
      var d = desc(n, name); if (d) return d;
    }
    return null;
  }
  function mmWidth(s) { var m = String(s || '').match(/([\d.]+)/); return m ? +m[1] : 0.12; }
  function color(s) { if (!s || s === 'none') return null; return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null; }

  function parseHeader(root) {
    var h = { fonts: {}, charPr: {}, paraPr: {}, borderFill: {} };
    var faces = desc(root, 'fontfaces');
    kids(faces, 'fontface').forEach(function (ff) {
      if (attr(ff, 'lang') === 'HANGUL') kids(ff, 'font').forEach(function (f) { h.fonts[attr(f, 'id')] = attr(f, 'face'); });
    });
    kids(desc(root, 'borderFills'), 'borderFill').forEach(function (bf) {
      function line(n) { var e = kid(bf, n); return { type: attr(e, 'type', 'NONE'), width: mmWidth(attr(e, 'width')), color: attr(e, 'color', '#000000') }; }
      var wb = desc(bf, 'winBrush');
      h.borderFill[attr(bf, 'id')] = { l: line('leftBorder'), r: line('rightBorder'), t: line('topBorder'), b: line('bottomBorder'), bg: wb ? color(attr(wb, 'faceColor')) : null };
    });
    kids(desc(root, 'charProperties'), 'charPr').forEach(function (c) {
      var fr = kid(c, 'fontRef'), ul = kid(c, 'underline'), so = kid(c, 'strikeout');
      h.charPr[attr(c, 'id')] = {
        font: h.fonts[attr(fr, 'hangul', '0')] || NG.DEFAULT_FONT,
        size: num(c, 'height', 1000),
        bold: !!kid(c, 'bold'), italic: !!kid(c, 'italic'),
        underline: !!ul && attr(ul, 'type', 'NONE') !== 'NONE',
        strike: !!so && attr(so, 'shape', 'NONE') !== 'NONE' && attr(so, 'shape') !== '3D',
        sup: !!kid(c, 'supscript'), sub: !!kid(c, 'subscript'),
        color: color(attr(c, 'textColor')) || '#000000', shade: color(attr(c, 'shadeColor'))
      };
    });
    kids(desc(root, 'paraProperties'), 'paraPr').forEach(function (p) {
      var al = kid(p, 'align'), br = kid(p, 'breakSetting');
      var margin = null, ls = null, div = 1;
      var sw = kid(p, 'switch');
      if (sw) {
        var cs = kid(sw, 'case');
        if (cs) { margin = kid(cs, 'margin'); ls = kid(cs, 'lineSpacing'); }
        if (!margin) { var df = kid(sw, 'default'); margin = kid(df, 'margin'); ls = kid(df, 'lineSpacing'); div = 2; }
      }
      if (!margin) { margin = kid(p, 'margin'); ls = ls || kid(p, 'lineSpacing'); div = 1; }
      function mv(n) {
        var e = kid(margin, n); if (!e) return 0;
        var v = num(e, 'value', 0);
        if (attr(e, 'unit') === 'CHAR') return v * 1000;
        return v / div;
      }
      var lsType = attr(ls, 'type', 'PERCENT'), lsVal = num(ls, 'value', 160);
      h.paraPr[attr(p, 'id')] = {
        align: ALIGN[attr(al, 'horizontal', 'JUSTIFY')] || 'justify',
        left: mv('left'), right: mv('right'), indent: mv('intent'), before: mv('prev'), after: mv('next'),
        lsType: { PERCENT: 'percent', FIXED: 'fixed', BETWEEN_LINES: 'between', AT_LEAST: 'atleast' }[lsType] || 'percent',
        lsValue: lsType === 'PERCENT' ? lsVal : lsVal / div,
        pageBreak: attr(br, 'pageBreakBefore') === '1'
      };
    });
    return h;
  }

  function Ctx(h, doc, binOf) { this.h = h; this.doc = doc; this.binOf = binOf; }
  Ctx.prototype.cs = function (id) {
    var c = this.h.charPr[id] || this.h.charPr['0'] || { font: NG.DEFAULT_FONT, size: 1000, color: '#000000' };
    var o = {}; for (var k in c) o[k] = c[k]; return o;
  };
  Ctx.prototype.ps = function (id) {
    var p = this.h.paraPr[id] || { align: 'justify', left: 0, right: 0, indent: 0, before: 0, after: 0, lsType: 'percent', lsValue: 160 };
    var o = {}; for (var k in p) o[k] = p[k]; return o;
  };
  Ctx.prototype.paras = function (parent) {
    var self = this, out = [];
    kids(parent, 'p').forEach(function (p) { out = out.concat(self.para(p)); });
    return out;
  };
  Ctx.prototype.para = function (p) {
    var self = this, ps = this.ps(attr(p, 'paraPrIDRef', '0'));
    if (attr(p, 'pageBreak') === '1') ps.pageBreak = true;
    var para = { t: 'p', ps: ps, runs: [] }, extra = [];
    var firstCs = null;
    kids(p, 'run').forEach(function (run) {
      var csId = attr(run, 'charPrIDRef', '0');
      if (firstCs === null) firstCs = csId;
      kids(run).forEach(function (el) {
        var n = el.localName;
        if (n === 't') self.text(el, csId, para);
        else if (n === 'secPr') self.secPr(el);
        else if (n === 'ctrl') self.ctrl(el);
        else if (n === 'tbl') { var t = self.table(el); if (t) extra.push(t); }
        else if (n === 'pic') self.pic(el, para);
        else if (n === 'container') kids(el).forEach(function (k) { if (k.localName === 'pic') self.pic(k, para, el); });
        else if (n === 'dutmal') { var mt = kid(el, 'mainText'); if (mt && mt.textContent) para.runs.push({ t: 'text', text: mt.textContent, cs: self.cs(csId) }); }
        else if (n === 'compose') { var ct = attr(el, 'composeText', ''); if (ct) para.runs.push({ t: 'text', text: ct, cs: self.cs(csId) }); }
        else if (n === 'equation') {
          var sc = kid(el, 'script'); var cs = self.cs(csId); cs.italic = true;
          if (sc && sc.textContent) para.runs.push({ t: 'text', text: sc.textContent, cs: cs });
        } else if (['rect', 'ellipse', 'polygon', 'curve', 'arc'].indexOf(n) >= 0) {
          var dt = kid(el, 'drawText'), sl = dt && kid(dt, 'subList');
          if (sl) {
            var sz = kid(el, 'sz'), ls = kid(el, 'lineShape'), wb = desc(el, 'winBrush');
            var line = ls ? { type: attr(ls, 'style', 'SOLID'), width: Math.max(0.1, num(ls, 'width', 33) / NG.HU_PER_MM), color: color(attr(ls, 'color')) || '#000000' } : { type: 'NONE' };
            extra.push({ t: 'box', blocks: self.paras(sl), w: num(sz, 'width', 20000), bf: { l: line, r: line, t: line, b: line, bg: wb ? color(attr(wb, 'faceColor')) : null } });
          }
        }
      });
    });
    if (!para.runs.length && firstCs !== null) para.endCs = this.cs(firstCs);
    var hasContent = para.runs.some(function (r) { return r.t !== 'text' || r.text.trim(); });
    if (extra.length && !hasContent) { if (ps.pageBreak) extra[0].pageBreak = true; return extra; }
    return [para].concat(extra);
  };
  Ctx.prototype.text = function (t, csId, para) {
    var self = this, buf = '';
    function flush() { if (buf) { para.runs.push({ t: 'text', text: buf, cs: self.cs(csId) }); buf = ''; } }
    for (var n = t.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 || n.nodeType === 4) buf += n.nodeValue;
      else if (n.nodeType === 1) {
        var ln = n.localName;
        if (ln === 'tab') { flush(); para.runs.push({ t: 'tab', cs: self.cs(csId) }); }
        else if (ln === 'lineBreak') { flush(); para.runs.push({ t: 'br' }); }
        else if (ln === 'nbSpace' || ln === 'fwSpace') buf += ' ';
        else if (ln === 'hyphen') buf += '-';
        else if (n.textContent) buf += n.textContent;
      }
    }
    flush();
  };
  Ctx.prototype.secPr = function (el) {
    if (this.doc._pageSet) return;
    var pp = kid(el, 'pagePr'), m = kid(pp, 'margin');
    if (!pp) return;
    var w = num(pp, 'width', 59528), h = num(pp, 'height', 84186), land = attr(pp, 'landscape') === 'NARROWLY';
    this.doc.page = {
      width: land ? Math.max(w, h) : w, height: land ? Math.min(w, h) : h, landscape: land,
      margin: { left: num(m, 'left', 8504), right: num(m, 'right', 8504), top: num(m, 'top', 5668), bottom: num(m, 'bottom', 4252), header: num(m, 'header', 4252), footer: num(m, 'footer', 4252), gutter: num(m, 'gutter', 0) }
    };
    this.doc._pageSet = true;
  };
  Ctx.prototype.ctrl = function (el) {
    var self = this;
    kids(el).forEach(function (c) {
      var n = c.localName;
      if ((n === 'header' || n === 'footer') && !self.doc[n]) {
        var sl = kid(c, 'subList');
        if (sl) self.doc[n] = { blocks: self.paras(sl) };
      } else if (n === 'pageNum' && !self.doc.pageNum) {
        var pos = attr(c, 'pos', 'BOTTOM_CENTER');
        if (pos !== 'NONE') self.doc.pageNum = { pos: pos.replace('OUTSIDE', 'BOTTOM').replace('INSIDE', 'BOTTOM'), side: attr(c, 'sideChar', '') };
      }
    });
  };
  Ctx.prototype.table = function (el) {
    var self = this, rows = num(el, 'rowCnt', 0), cols = num(el, 'colCnt', 0);
    var sz = kid(el, 'sz'), pos = kid(el, 'pos');
    var cells = [];
    kids(el, 'tr').forEach(function (tr) {
      kids(tr, 'tc').forEach(function (tc) {
        var ad = kid(tc, 'cellAddr'), sp = kid(tc, 'cellSpan'), cz = kid(tc, 'cellSz'), sl = kid(tc, 'subList');
        var blocks = sl ? self.paras(sl) : [];
        if (!blocks.length) blocks = [{ t: 'p', ps: self.ps('0'), runs: [] }];
        var va = attr(sl, 'vertAlign', 'CENTER');
        cells.push({
          r: num(ad, 'rowAddr', 0), c: num(ad, 'colAddr', 0), rs: num(sp, 'rowSpan', 1), cs: num(sp, 'colSpan', 1),
          w: num(cz, 'width', 0), h: num(cz, 'height', 0),
          bf: self.h.borderFill[attr(tc, 'borderFillIDRef', '')] || null,
          valign: { TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom' }[va] || 'middle',
          blocks: blocks
        });
      });
    });
    if (!rows) rows = cells.reduce(function (a, c) { return Math.max(a, c.r + c.rs); }, 0);
    if (!cols) cols = cells.reduce(function (a, c) { return Math.max(a, c.c + c.cs); }, 0);
    if (!rows || !cols) return null;
    var ha = attr(pos, 'horzAlign', 'LEFT');
    return NG.buildTable(rows, cols, cells, num(sz, 'width', 0), { inline: attr(pos, 'treatAsChar') === '1', align: ha === 'CENTER' ? 'center' : ha === 'RIGHT' ? 'right' : 'left' });
  };
  Ctx.prototype.pic = function (el, para, container) {
    var img = desc(el, 'img');
    var key = img && this.binOf(attr(img, 'binaryItemIDRef'));
    if (!key) return;
    var cur = kid(el, 'curSz'), sz = kid(el, 'sz') || (container && kid(container, 'sz'));
    var w = num(cur, 'width', 0) || num(sz, 'width', 10000), h = num(cur, 'height', 0) || num(sz, 'height', 10000);
    var pos = kid(el, 'pos') || (container && kid(container, 'pos'));
    var wrap = attr(el, 'textWrap', 'SQUARE'), ha = attr(pos, 'horzAlign', 'LEFT');
    var r = { t: 'img', bin: key, w: w, h: h };
    if (attr(pos, 'treatAsChar') === '1') r.wrap = 'inline';
    else if (wrap === 'SQUARE' || wrap === 'TIGHT' || wrap === 'BEHIND_TEXT' || wrap === 'IN_FRONT_OF_TEXT') r.wrap = ha === 'RIGHT' ? 'right' : ha === 'CENTER' ? 'block' : 'left';
    else r.wrap = 'block';
    if ((attr(pos, 'treatAsChar') !== '1' && (wrap === 'BEHIND_TEXT' || wrap === 'IN_FRONT_OF_TEXT')) || container) r.overlay = true;
    if (r.wrap === 'block') r.align = ha === 'CENTER' ? 'center' : ha === 'RIGHT' ? 'right' : 'left';
    para.runs.push(r);
  };

  NG.readHwpx = async function (u8) {
    var JSZip = NG.lib.JSZip || globalThis.JSZip, DP = NG.lib.DOMParser || globalThis.DOMParser;
    var zip = await JSZip.loadAsync(u8);
    function xml(s) { return new DP().parseFromString(s, 'application/xml'); }
    async function read(path) { var f = zip.file(path); return f ? f.async('string') : null; }
    var hpfPath = 'Contents/content.hpf';
    var cont = await read('META-INF/container.xml');
    if (cont) {
      var m = cont.match(/full-path="([^"]+\.hpf)"/);
      if (m) hpfPath = m[1];
    }
    var hpf = await read(hpfPath);
    if (!hpf) throw new Error('HWPX 문서 구조를 찾을 수 없습니다.');
    var hroot = xml(hpf).documentElement;
    var items = {}, spine = [];
    kids(desc(hroot, 'manifest') || hroot, 'item').forEach(function (it) { items[attr(it, 'id')] = { href: attr(it, 'href'), type: attr(it, 'media-type', '') }; });
    kids(desc(hroot, 'spine'), 'itemref').forEach(function (r) { spine.push(attr(r, 'idref')); });
    var headerHref = (items.header && items.header.href) || 'Contents/header.xml';
    var header = parseHeader(xml(await read(headerHref)).documentElement);
    var doc = { page: NG.defaultPage(), header: null, footer: null, pageNum: null, blocks: [], bins: {}, warnings: [] };
    var binCache = {}, pending = [];
    function binOf(id) {
      if (!id) return null;
      if (binCache[id] !== undefined) return binCache[id];
      var it = items[id];
      if (!it || !zip.file(it.href)) { binCache[id] = null; return null; }
      var ext = (it.href.split('.').pop() || '').toLowerCase();
      var mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', wmf: 'image/wmf', emf: 'image/emf' }[ext] || it.type || 'application/octet-stream';
      if (mime === 'image/jpg') mime = 'image/jpeg';
      doc.bins[id] = { mime: mime, ext: ext, data: null };
      pending.push(zip.file(it.href).async('uint8array').then(function (d) { doc.bins[id].data = d; }));
      binCache[id] = id;
      return id;
    }
    var ctx = new Ctx(header, doc, binOf);
    var secIds = spine.filter(function (id) { return items[id] && /section/i.test(items[id].href); });
    if (!secIds.length) secIds = Object.keys(items).filter(function (id) { return /section\d+\.xml$/i.test(items[id].href); }).sort();
    for (var s = 0; s < secIds.length; s++) {
      var sx = await read(items[secIds[s]].href);
      if (!sx) continue;
      var blocks = ctx.paras(xml(sx).documentElement);
      if (s > 0 && blocks.length) { blocks[0].pageBreak = true; if (blocks[0].ps) blocks[0].ps.pageBreak = true; }
      doc.blocks = doc.blocks.concat(blocks);
    }
    await Promise.all(pending);
    delete doc._pageSet;
    if (doc.blocks.length) { doc.blocks[0].pageBreak = false; if (doc.blocks[0].ps) doc.blocks[0].ps.pageBreak = false; }
    if (!doc.blocks.length) doc.blocks.push({ t: 'p', ps: ctx.ps('0'), runs: [] });
    return doc;
  };
})(NG);
