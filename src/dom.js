/* 누리글 — 문서 모델 ↔ 편집 화면(HTML) 변환 */
(function (NG) {
  'use strict';
  var esc = NG.esc;
  var px = function (hu) { return Math.round(NG.huToPx(hu) * 100) / 100; };

  /* ---------- 그림 데이터 ---------- */
  function b64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  NG.bytesToDataUrl = function (u8, mime) { return 'data:' + mime + ';base64,' + b64(u8); };
  NG.dataUrlToBytes = function (url) {
    var m = String(url).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) return null;
    var mime = m[1] || 'application/octet-stream', data;
    if (m[2]) {
      var bin = atob(m[3]); data = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    } else data = new TextEncoder().encode(decodeURIComponent(m[3]));
    return { mime: mime, data: data };
  };
  NG.placeholderImage = function (label) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect x="1" y="1" width="198" height="118" fill="#f3f4f1" stroke="#9aa39a" stroke-dasharray="6 4"/><text x="100" y="66" font-size="14" text-anchor="middle" fill="#5d665d" font-family="sans-serif">' + esc(label) + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };
  /* 그림 보관함: 본문에는 짧은 blob 주소만 두고 원본 바이트는 여기에 */
  NG.imgs = (function () {
    var map = new Map();
    return {
      put: function (bytes, mime, id) {
        id = id || ('i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
        var old = map.get(id);
        if (old) return id;
        var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        map.set(id, { bytes: bytes, mime: mime, url: url });
        return id;
      },
      get: function (id) { return map.get(id) || null; },
      has: function (id) { return map.has(id); },
      ids: function () { return Array.from(map.keys()); }
    };
  })();
  /* data: 주소 그림을 보관함으로 옮김 (붙여 넣거나 웹 문서를 열었을 때) */
  NG.internImages = function (root) {
    root.querySelectorAll('img').forEach(function (img) {
      var id = img.getAttribute('data-img');
      if (id && NG.imgs.has(id)) { if (img.getAttribute('src') !== NG.imgs.get(id).url) img.setAttribute('src', NG.imgs.get(id).url); return; }
      if (img.getAttribute('data-shape')) return;
      var src = img.getAttribute('src') || '';
      if (/^data:image\/(png|jpeg|gif|bmp|webp)/.test(src)) {
        var d = NG.dataUrlToBytes(src);
        if (d) { var nid = NG.imgs.put(d.data, d.mime, id || undefined); img.setAttribute('data-img', nid); img.setAttribute('src', NG.imgs.get(nid).url); }
      }
    });
  };
  var SHOWABLE = { 'image/png': 1, 'image/jpeg': 1, 'image/gif': 1, 'image/bmp': 1, 'image/webp': 1, 'image/svg+xml': 1 };

  /* ---------- 모델 → HTML ---------- */
  function csStyle(cs, base) {
    var s = [];
    if (!cs) return '';
    if (!base || cs.font !== base.font) s.push('font-family:' + esc(NG.fontStack(cs.font)).replace(/&quot;/g, "'"));
    if (!base || cs.size !== base.size) s.push('font-size:' + (cs.size / 100) + 'pt');
    if (cs.bold) s.push('font-weight:700');
    if (cs.italic) s.push('font-style:italic');
    var dec = [];
    if (cs.underline) dec.push('underline');
    if (cs.strike) dec.push('line-through');
    if (dec.length) s.push('text-decoration:' + dec.join(' '));
    if (cs.color && cs.color !== '#000000') s.push('color:' + cs.color);
    if (cs.shade) s.push('background-color:' + cs.shade);
    if (cs.sup) s.push('vertical-align:super;font-size:' + (cs.size / 100 * 0.7).toFixed(1) + 'pt');
    else if (cs.sub) s.push('vertical-align:sub;font-size:' + (cs.size / 100 * 0.7).toFixed(1) + 'pt');
    return s.join(';');
  }
  function psStyle(ps, cs) {
    var s = [];
    ps = ps || {};
    var al = ps.align || 'justify';
    if (al === 'distribute') s.push('text-align:justify;text-align-last:justify');
    else s.push('text-align:' + al);
    if (ps.left) s.push('margin-left:' + px(ps.left) + 'px');
    if (ps.right) s.push('margin-right:' + px(ps.right) + 'px');
    if (ps.indent) s.push('text-indent:' + px(ps.indent) + 'px');
    if (ps.indent < 0) s.push('padding-left:' + px(-ps.indent) + 'px');
    if (ps.before) s.push('margin-top:' + px(ps.before) + 'px');
    if (ps.after) s.push('margin-bottom:' + px(ps.after) + 'px');
    var size = (cs && cs.size) || 1000;
    if (ps.lsType === 'fixed' && ps.lsValue) s.push('line-height:' + px(ps.lsValue) + 'px');
    else if (ps.lsType === 'atleast' && ps.lsValue) s.push('line-height:' + Math.max(px(ps.lsValue), px(size) * 1.2).toFixed(1) + 'px');
    else if (ps.lsType === 'between') s.push('line-height:' + (px(size) * 1.2 + px(ps.lsValue || 0)).toFixed(1) + 'px');
    else s.push('line-height:' + ((ps.lsValue || 160) / 100));
    if (cs) {
      s.push('font-family:' + esc(NG.fontStack(cs.font)).replace(/&quot;/g, "'"));
      s.push('font-size:' + (cs.size / 100) + 'pt');
    }
    return s.join(';');
  }
  NG.psStyle = psStyle;

  function imgHtml(r, bins, warn, page) {
    var b = bins[r.bin];
    if (r.overlay && page && r.w >= page.width * 0.6 && r.h >= page.height * 0.4) { warn('background'); return ''; }
    var src;
    if (!b || !b.data) { src = NG.placeholderImage('그림 없음'); warn('missing'); }
    else if (!SHOWABLE[b.mime]) { src = NG.placeholderImage('표시할 수 없는 그림(' + (b.ext || '?').toUpperCase() + ')'); warn('format'); }
    else { var iid = NG.imgs.put(b.data, b.mime); src = NG.imgs.get(iid).url; r = Object.assign({}, r, { _id: iid }); }
    var w = r.w, h = r.h;
    if (page) { // 본문보다 넓은 그림은 본문 폭에 맞춤
      var cw = page.width - page.margin.left - page.margin.right;
      if (w > cw && w > 0) { h = h * cw / w; w = cw; }
    }
    var cls = r.wrap === 'left' ? 'ng-img-left' : r.wrap === 'right' ? 'ng-img-right' : r.wrap === 'block' ? 'ng-img-block' + (r.align === 'center' ? ' ng-center' : r.align === 'right' ? ' ng-right' : '') : '';
    return '<img src="' + src + '"' + (r._id ? ' data-img="' + r._id + '"' : '') + (cls ? ' class="' + cls + '"' : '') + ' style="width:' + px(w) + 'px;height:' + px(h) + 'px" alt="">';
  }

  function paraHtml(b, bins, warn) {
    var first = null;
    b.runs.forEach(function (r) { if (!first && r.cs) first = r.cs; });
    var base = first || b.endCs || null;
    var inner = '', curStyle = null, buf = '';
    function flush() {
      if (buf) inner += curStyle ? '<span style="' + curStyle + '">' + buf + '</span>' : buf;
      buf = ''; curStyle = null;
    }
    b.runs.forEach(function (r) {
      if (r.t === 'text' || r.t === 'tab') {
        var st = csStyle(r.cs, base);
        if (st !== curStyle) { flush(); curStyle = st; }
        buf += r.t === 'tab' ? '\t' : esc(r.text);
      } else if (r.t === 'br') { flush(); inner += '<br>'; }
      else if (r.t === 'img') { flush(); inner += imgHtml(r, bins, warn, NG._curPage); }
    });
    flush();
    if (!inner || /<br>$/.test(inner)) inner += '<br>';
    return '<p style="' + psStyle(b.ps, base) + '">' + inner + '</p>';
  }

  function borderCss(side, l) {
    if (!l || l.type === 'NONE') return 'border-' + side + ':none';
    var style = { SOLID: 'solid', DOT: 'dotted', DASH: 'dashed', DASH_DOT: 'dashed', DASH_DOT_DOT: 'dashed', LONG_DASH: 'dashed', CIRCLE: 'dotted', DOUBLE_SLIM: 'double', SLIM_THICK: 'double', THICK_SLIM: 'double', SLIM_THICK_SLIM: 'double' }[l.type] || 'solid';
    var w = l.width || 0.12;
    if (style === 'double') w = Math.max(w, 0.5);
    return 'border-' + side + ':' + w + 'mm ' + style + ' ' + (l.color || '#000000');
  }
  NG.borderCss = borderCss;

  function tableHtml(t, bins, warn) {
    var W = t.cols.reduce(function (a, b) { return a + b; }, 0);
    var al = t.align === 'center' ? 'margin-left:auto;margin-right:auto' : t.align === 'right' ? 'margin-left:auto' : '';
    var h = '<table class="ng-table" style="width:' + px(W) + 'px;' + al + '"><colgroup>' +
      t.cols.map(function (w) { return '<col style="width:' + px(w) + 'px">'; }).join('') + '</colgroup><tbody>';
    t.rows.forEach(function (row, ri) {
      var rh = t.rowH && t.rowH[ri] ? ' style="height:' + px(t.rowH[ri]) + 'px"' : '';
      h += '<tr' + rh + '>';
      row.forEach(function (c) {
        var st = [];
        var bf = c.bf || { l: { type: 'SOLID' }, r: { type: 'SOLID' }, t: { type: 'SOLID' }, b: { type: 'SOLID' } };
        st.push(borderCss('left', bf.l), borderCss('right', bf.r), borderCss('top', bf.t), borderCss('bottom', bf.b));
        if (bf.bg) st.push('background-color:' + bf.bg);
        st.push('vertical-align:' + (c.valign || 'middle'));
        h += '<td' + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '') + (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + ' style="' + st.join(';') + '">' +
          blocksHtml(c.blocks, bins, warn) + '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  function blocksHtml(blocks, bins, warn) {
    var out = '';
    blocks.forEach(function (b, i) {
      var pb = (b.pageBreak || (b.ps && b.ps.pageBreak)) && i > 0;
      if (pb) out += '<hr class="ng-pb">';
      if (b.t === 'p') out += paraHtml(b, bins, warn);
      else if (b.t === 'table') out += tableHtml(b, bins, warn);
      else if (b.t === 'box') {
        var bf = b.bf || { l: { type: 'NONE' }, r: { type: 'NONE' }, t: { type: 'NONE' }, b: { type: 'NONE' } };
        var st = [borderCss('left', bf.l), borderCss('right', bf.r), borderCss('top', bf.t), borderCss('bottom', bf.b)];
        if (bf.bg) st.push('background-color:' + bf.bg);
        out += '<div class="ng-box" style="' + st.join(';') + '">' + blocksHtml(b.blocks, bins, warn) + '</div>';
      }
    });
    return out;
  }

  function hfFromBlocks(hf) {
    if (!hf || !hf.blocks) return null;
    var lines = [], align = 'center';
    (function walk(bs) {
      bs.forEach(function (b) {
        if (b.t === 'p') {
          var s = b.runs.map(function (r) { return r.t === 'text' ? r.text : r.t === 'tab' ? '    ' : r.t === 'br' ? '\n' : ''; }).join('').replace(/\s+$/, '');
          if (s.trim()) { if (!lines.length) align = b.ps && b.ps.align === 'right' ? 'right' : b.ps && (b.ps.align === 'left' || b.ps.align === 'justify') ? 'left' : 'center'; lines.push(s.trim()); }
        } else if (b.blocks) walk(b.blocks);
        else if (b.rows) b.rows.forEach(function (r) { r.forEach(function (c) { walk(c.blocks); }); });
      });
    })(hf.blocks);
    return lines.length ? { text: lines.join('\n'), align: align } : null;
  }

  /* 모델 → { html, settings, warnings } */
  NG.docToEditor = function (doc) {
    var warns = {};
    function warn(k) { warns[k] = (warns[k] || 0) + 1; }
    // 종이 크기만 한 배경 그림(글 뒤로)은 화면을 덮으므로 뺀다
    NG._curPage = doc.page;
    var html = blocksHtml(doc.blocks, doc.bins || {}, warn);
    var settings = {
      page: JSON.parse(JSON.stringify(doc.page || NG.defaultPage())),
      header: hfFromBlocks(doc.header),
      footer: hfFromBlocks(doc.footer),
      pageNum: doc.pageNum ? { pos: doc.pageNum.pos, side: doc.pageNum.side || '' } : null
    };
    var warnings = [];
    if (warns.format) warnings.push('이 화면에서 보여 줄 수 없는 형식의 그림 ' + warns.format + '개를 빈 상자로 바꿨습니다.');
    if (warns.background) warnings.push('쪽 전체에 깔린 배경 그림 ' + warns.background + '개는 빼고 열었습니다.');
    if (warns.missing) warnings.push('찾을 수 없는 그림 ' + warns.missing + '개를 빈 상자로 바꿨습니다.');
    return { html: html, settings: settings, warnings: warnings };
  };

  /* ---------- 편집 화면 → 모델 ---------- */
  var BLOCK = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, DIV: 1, BLOCKQUOTE: 1, LI: 1, PRE: 1, ADDRESS: 1, FIGURE: 1, SECTION: 1, ARTICLE: 1 };
  function isGap(n) { return n.nodeType === 1 && n.classList && n.classList.contains('ng-gap'); }
  function hasBlockChild(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && !isGap(n) && (BLOCK[n.tagName] || n.tagName === 'TABLE' || n.tagName === 'UL' || n.tagName === 'OL' || n.tagName === 'HR')) return true;
    }
    return false;
  }
  function pxNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  NG.EditorExporter = function (rootPx) { this.cache = new Map(); };
  NG.EditorExporter.prototype.cs = function (el, blockEl) {
    var cs = getComputedStyle(el);
    var dec = { u: false, s: false }, bg = null, sup = false, sub = false;
    for (var e = el; e && e !== blockEl.parentNode; e = e.parentElement) {
      var c2 = e === el ? cs : getComputedStyle(e);
      var tdl = c2.textDecorationLine || c2.textDecoration || '';
      if (/underline/.test(tdl)) dec.u = true;
      if (/line-through/.test(tdl)) dec.s = true;
      if (!bg && e !== blockEl) bg = NG.cssColorToHex(c2.backgroundColor);
      if (c2.verticalAlign === 'super') sup = true;
      if (c2.verticalAlign === 'sub') sub = true;
      if (e === blockEl) break;
    }
    var size = pxNum(cs.fontSize);
    if (sup || sub) size = size / 0.7;
    return {
      font: NG.firstFontName(cs.fontFamily) || NG.DEFAULT_FONT,
      size: Math.round(size * 75 / 50) * 50 || 1000,
      bold: (+cs.fontWeight || (cs.fontWeight === 'bold' ? 700 : 400)) >= 600,
      italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
      underline: dec.u, strike: dec.s,
      color: NG.cssColorToHex(cs.color) || '#000000', shade: bg,
      sup: sup, sub: sub
    };
  };
  NG.EditorExporter.prototype.ps = function (el, extraLeft) {
    var cs = getComputedStyle(el);
    var al = cs.textAlign;
    var align = al === 'center' ? 'center' : (al === 'right' || al === 'end') ? 'right' : al === 'justify' ? (cs.textAlignLast === 'justify' ? 'distribute' : 'justify') : 'left';
    var fs = pxNum(cs.fontSize) || 13.33, lh = cs.lineHeight;
    var ls = lh === 'normal' ? 120 : Math.round(pxNum(lh) / fs * 100);
    var indent = pxNum(cs.textIndent);
    var padL = pxNum(cs.paddingLeft);
    var left = pxNum(cs.marginLeft) + (indent < 0 ? padL : 0) + (extraLeft || 0);
    return {
      align: align,
      left: NG.pxToHu(left), right: NG.pxToHu(pxNum(cs.marginRight)), indent: NG.pxToHu(indent),
      before: NG.pxToHu(pxNum(cs.marginTop)), after: NG.pxToHu(pxNum(cs.marginBottom)),
      lsType: 'percent', lsValue: Math.max(50, Math.min(500, ls || 160))
    };
  };
  NG.EditorExporter.prototype.inlineRuns = function (blockEl, prefix) {
    var self = this, runs = [];
    if (prefix) runs.push({ t: 'text', text: prefix, cs: this.cs(blockEl, blockEl) });
    (function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var text = n.nodeValue;
          if (!text) continue;
          var cs = self.cs(n.parentElement, blockEl);
          var parts = text.split(/(\t|\n)/);
          parts.forEach(function (p) {
            if (p === '\t') runs.push({ t: 'tab', cs: cs });
            else if (p === '\n') runs.push({ t: 'br', cs: cs });
            else if (p) runs.push({ t: 'text', text: p.replace(/​/g, ''), cs: cs });
          });
        } else if (n.nodeType === 1) {
          if (isGap(n)) continue;
          var tag = n.tagName;
          if (tag === 'BR') { if (n.nextSibling || n.parentNode !== blockEl) runs.push({ t: 'br', cs: self.cs(n.parentElement, blockEl) }); }
          else if (tag === 'IMG') { var r = self.img(n); if (r) runs.push(r); }
          else if (tag === 'TABLE' || tag === 'UL' || tag === 'OL' || BLOCK[tag]) { /* 블록 속 블록은 바깥에서 처리 */ }
          else walk(n);
        }
      }
    })(blockEl);
    // 끝의 줄바꿈 하나는 문단 끝이라 뺀다
    while (runs.length && runs[runs.length - 1].t === 'br') runs.pop();
    return runs;
  };
  NG.EditorExporter.prototype.img = function (img) {
    var key = img.getAttribute('data-bin') || img.src;
    var w = NG.pxToHu(img.offsetWidth || parseFloat(img.style.width) || img.naturalWidth || 100);
    var h = NG.pxToHu(img.offsetHeight || parseFloat(img.style.height) || img.naturalHeight || 100);
    var wrap = img.classList.contains('ng-img-left') ? 'left' : img.classList.contains('ng-img-right') ? 'right' : img.classList.contains('ng-img-block') ? 'block' : 'inline';
    var align = img.classList.contains('ng-center') ? 'center' : img.classList.contains('ng-right') ? 'right' : 'left';
    if (!this.bins) this.bins = {};
    if (!this.binKeys) this.binKeys = new Map();
    var id = this.binKeys.get(key);
    if (!id) { id = 'b' + (this.binKeys.size + 1); this.binKeys.set(key, id); this.imgEls = this.imgEls || {}; this.imgEls[id] = img; }
    return { t: 'img', bin: id, w: w, h: h, wrap: wrap, align: align, pxW: img.naturalWidth || 0, pxH: img.naturalHeight || 0 };
  };
  NG.EditorExporter.prototype.block = function (el, out, opts) {
    var self = this;
    opts = opts || {};
    if (isGap(el)) return;
    var tag = el.tagName;
    if (tag === 'HR') { self.pendingBreak = true; return; }
    if (tag === 'TABLE') { out.push(self.table(el)); return; }
    if (tag === 'UL' || tag === 'OL') {
      var n = +(el.getAttribute('start') || 1);
      var depth = (opts.depth || 0);
      Array.prototype.forEach.call(el.children, function (li) {
        if (li.tagName !== 'LI') { self.block(li, out, opts); return; }
        var prefix = tag === 'OL' ? (n++) + '. ' : ['• ', '◦ ', '▪ '][depth % 3];
        var b = { t: 'p', ps: self.ps(li), runs: self.inlineRuns(li, prefix) };
        b.ps.indent = 0;
        self.mark(b); out.push(b);
        Array.prototype.forEach.call(li.children, function (k) { if (k.tagName === 'UL' || k.tagName === 'OL') self.block(k, out, { depth: depth + 1 }); });
      });
      return;
    }
    if (el.classList && el.classList.contains('ng-box')) {
      var inner = [];
      Array.prototype.forEach.call(el.childNodes, function (k) { self.node(k, inner); });
      var cs = getComputedStyle(el);
      var line = cs.borderTopStyle === 'none' || !pxNum(cs.borderTopWidth) ? { type: 'NONE', width: 0.12, color: '#000000' } : { type: 'SOLID', width: Math.max(0.1, pxNum(cs.borderTopWidth) * 25.4 / 96), color: NG.cssColorToHex(cs.borderTopColor) || '#000000' };
      var box = { t: 'box', blocks: inner, w: NG.pxToHu(el.offsetWidth), bf: { l: line, r: line, t: line, b: line, bg: NG.cssColorToHex(cs.backgroundColor) } };
      self.mark(box); out.push(box);
      return;
    }
    if (hasBlockChild(el)) {
      Array.prototype.forEach.call(el.childNodes, function (k) { self.node(k, out); });
      return;
    }
    var b2 = { t: 'p', ps: self.ps(el), runs: self.inlineRuns(el) };
    if (!b2.runs.length) b2.endCs = self.cs(el, el);
    self.mark(b2); out.push(b2);
  };
  NG.EditorExporter.prototype.mark = function (b) {
    if (this.pendingBreak) { b.pageBreak = true; if (b.ps) b.ps.pageBreak = true; this.pendingBreak = false; }
  };
  NG.EditorExporter.prototype.node = function (n, out) {
    if (n.nodeType === 3) {
      if (!n.nodeValue.replace(/[\s​]/g, '')) return;
      var p = { t: 'p', ps: this.ps(n.parentElement), runs: [{ t: 'text', text: n.nodeValue, cs: this.cs(n.parentElement, n.parentElement) }] };
      this.mark(p); out.push(p); return;
    }
    if (n.nodeType !== 1 || isGap(n)) return;
    if (BLOCK[n.tagName] || n.tagName === 'TABLE' || n.tagName === 'UL' || n.tagName === 'OL' || n.tagName === 'HR') this.block(n, out);
    else if (n.tagName === 'IMG') { var r = this.img(n); var p2 = { t: 'p', ps: this.ps(n.parentElement), runs: [r] }; this.mark(p2); out.push(p2); }
    else if (n.tagName === 'BR') { /* 블록 사이 줄바꿈 무시 */ }
    else { var p3 = { t: 'p', ps: this.ps(n.parentElement), runs: [] }; p3.runs = this.inlineRuns({ firstChild: n, parentNode: n.parentNode, nodeType: 1 }); this.mark(p3); out.push(p3); }
  };
  NG.EditorExporter.prototype.table = function (tbl) {
    var self = this;
    var g = NG.tableGrid(tbl);
    var cols = [];
    var colEls = tbl.querySelectorAll(':scope > colgroup > col');
    for (var i = 0; i < g.cols; i++) {
      var w = colEls[i] ? pxNum(colEls[i].style.width) : 0;
      cols.push(NG.pxToHu(w || (tbl.offsetWidth / g.cols)));
    }
    var rows = [], rowH = [];
    g.rows.forEach(function (tr, ri) {
      rowH.push(NG.pxToHu(tr.offsetHeight));
      rows.push([]);
    });
    g.cells.forEach(function (c) {
      var cs = getComputedStyle(c.el);
      function line(side) {
        var st = cs['border' + side + 'Style'], wd = pxNum(cs['border' + side + 'Width']);
        if (st === 'none' || st === 'hidden' || !wd) return { type: 'NONE', width: 0.12, color: '#000000' };
        var type = { solid: 'SOLID', dotted: 'DOT', dashed: 'DASH', double: 'DOUBLE_SLIM' }[st] || 'SOLID';
        var mm = c.el.style['border' + side] && /([\d.]+)mm/.test(c.el.style['border' + side]) ? +RegExp.$1 : wd * 25.4 / 96;
        return { type: type, width: mm, color: NG.cssColorToHex(cs['border' + side + 'Color']) || '#000000' };
      }
      var blocks = [];
      Array.prototype.forEach.call(c.el.childNodes, function (k) { self.node(k, blocks); });
      if (!blocks.length) blocks.push({ t: 'p', ps: self.ps(c.el), runs: [], endCs: self.cs(c.el, c.el) });
      var va = cs.verticalAlign;
      rows[c.r].push({
        r: c.r, c: c.c, rs: c.rs, cs: c.cs,
        bf: { l: line('Left'), r: line('Right'), t: line('Top'), b: line('Bottom'), bg: NG.cssColorToHex(cs.backgroundColor) },
        valign: va === 'top' ? 'top' : va === 'bottom' ? 'bottom' : 'middle',
        blocks: blocks
      });
    });
    var ml = tbl.style.marginLeft, mr = tbl.style.marginRight;
    var align = ml === 'auto' && mr === 'auto' ? 'center' : ml === 'auto' ? 'right' : 'left';
    var t = { t: 'table', cols: cols, rows: rows, rowH: rowH, align: align };
    this.mark(t);
    return t;
  };

  /* 표의 격자: 병합을 펼쳐 칸마다 어떤 셀이 차지하는지 */
  NG.tableGrid = function (tbl) {
    var rows = Array.prototype.filter.call(tbl.rows, function (tr) { return !tr.classList.contains('ng-gap') && tr.closest('table') === tbl; });
    var map = [], cells = [], ncol = 0;
    rows.forEach(function (tr, r) {
      map[r] = map[r] || [];
      var c = 0;
      Array.prototype.forEach.call(tr.cells, function (td) {
        while (map[r][c]) c++;
        var cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, td.rowSpan || 1);
        rs = Math.min(rs, rows.length - r);
        var cell = { el: td, r: r, c: c, rs: rs, cs: cs };
        cells.push(cell);
        for (var i = 0; i < rs; i++) {
          map[r + i] = map[r + i] || [];
          for (var j = 0; j < cs; j++) map[r + i][c + j] = cell;
        }
        c += cs;
        ncol = Math.max(ncol, c);
      });
    });
    for (var r = 0; r < rows.length; r++) { map[r] = map[r] || []; ncol = Math.max(ncol, map[r].length); }
    return { rows: rows, map: map, cells: cells, cols: ncol };
  };

  /* 편집 화면 전체 → 모델 */
  NG.editorToDoc = function (docEl, settings) {
    var ex = new NG.EditorExporter();
    var blocks = [];
    Array.prototype.forEach.call(docEl.childNodes, function (n) { ex.node(n, blocks); });
    if (!blocks.length) blocks.push({ t: 'p', ps: {}, runs: [] });
    var s = settings;
    function hf(o, pos) {
      if (!o || !o.text) return null;
      return {
        blocks: o.text.split('\n').map(function (line) {
          return { t: 'p', ps: { align: o.align || 'center', lsType: 'percent', lsValue: 150 }, runs: line ? [{ t: 'text', text: line, cs: { font: NG.DEFAULT_FONT, size: 900, color: '#000000' } }] : [], endCs: { font: NG.DEFAULT_FONT, size: 900 } };
        })
      };
    }
    return {
      page: s.page, header: hf(s.header), footer: hf(s.footer), pageNum: s.pageNum && s.pageNum.pos !== 'NONE' ? s.pageNum : null,
      blocks: blocks, bins: {}, _exporter: ex
    };
  };
})(NG);
