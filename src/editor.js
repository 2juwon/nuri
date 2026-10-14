/* 누리글 — 편집기: 쪽 나누기, 되돌리기, 서식, 표, 그림 */
(function (NG) {
  'use strict';
  var PLIKE = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, DIV: 1 };
  var BLOCKISH = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, DIV: 1, TABLE: 1, UL: 1, OL: 1, HR: 1, TD: 1, TH: 1, TR: 1, TBODY: 1 };
  var PAGE_GAP = 28;

  function isGap(n) { return n && n.nodeType === 1 && n.classList.contains('ng-gap'); }
  function isPlike(el) {
    if (!el || el.nodeType !== 1 || !PLIKE[el.tagName]) return false;
    if (el.classList.contains('ng-box') || el.classList.contains('ng-gap')) return false;
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (BLOCKISH[n.tagName] && !isGap(n)) return false;
    }
    return true;
  }
  NG.isPlike = isPlike;

  function Editor(opts) {
    var self = this;
    this.paper = opts.paper; this.sheets = opts.sheets; this.doc = opts.doc; this.desk = opts.desk;
    this.overlay = opts.overlay;
    this.onState = opts.onState || function () { };
    this.onChange = opts.onChange || function () { };
    this.settings = { page: NG.defaultPage(), header: null, footer: null, pageNum: { pos: 'BOTTOM_CENTER', side: '-' } };
    this.zoom = 1; this.fit = false;
    this.undoStack = []; this.redoStack = []; this.lastInputType = ''; this.lastInputAt = 0;
    this.cellSel = null; this.selImg = null; this.pages = 1;
    var d = this.doc;
    d.setAttribute('contenteditable', 'true');
    d.setAttribute('spellcheck', 'false');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { }

    d.addEventListener('beforeinput', function (e) { self.beforeInput(e); });
    // 한글 입력(조합) 중에는 화면을 건드리지 않는다
    d.addEventListener('compositionstart', function () { if (!self.composing) self.pushUndo(); self.composing = true; });
    d.addEventListener('compositionend', function () { self.composing = false; self.lastInputType = 'insertText'; self.lastInputAt = Date.now(); self.schedule(); self.changed(); });
    d.addEventListener('input', function (e) { self.afterInput(e); });
    d.addEventListener('keydown', function (e) { self.keydown(e); });
    d.addEventListener('paste', function (e) { self.paste(e); });
    d.addEventListener('copy', function (e) { self.copy(e, false); });
    d.addEventListener('cut', function (e) { self.copy(e, true); });
    d.addEventListener('mousedown', function (e) { self.mousedown(e); });
    d.addEventListener('mousemove', function (e) { self.hoverResize(e); });
    d.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types, function (t) { return t === 'Files'; })) e.preventDefault(); });
    d.addEventListener('drop', function (e) { self.drop(e); });
    d.addEventListener('dblclick', function (e) { var td = e.target.closest && e.target.closest('td'); if (td) self.clearCellSel(); });
    document.addEventListener('selectionchange', function () {
      if (self._stateRaf) return;
      self._stateRaf = requestAnimationFrame(function () { self._stateRaf = 0; self.emitState(); });
    });
    window.addEventListener('resize', function () { self.schedule(); });
    d.addEventListener('load', function (e) { if (e.target.tagName === 'IMG') self.schedule(); }, true);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { self.schedule(); });
    this.initOverlay();
  }
  NG.Editor = Editor;

  /* ---------- 내용 넣고 빼기 ---------- */
  Editor.prototype.setContent = function (html, settings) {
    this.clearImgSel(); this.clearCellSel();
    if (settings) this.settings = settings;
    this.doc.innerHTML = html || '<p><br></p>';
    NG.internImages(this.doc);
    this.ensureStructure();
    this.undoStack = []; this.redoStack = [];
    this.applyPageCss();
    this.paginate();
    this.emitState();
  };
  Editor.prototype.cleanHtml = function () {
    var c = this.doc.cloneNode(true);
    c.querySelectorAll('.ng-gap').forEach(function (g) { g.remove(); });
    c.querySelectorAll('.ng-pushed').forEach(function (g) { g.classList.remove('ng-pushed'); g.style.removeProperty('--ng-push'); if (!g.getAttribute('class')) g.removeAttribute('class'); });
    c.querySelectorAll('.ng-sel').forEach(function (g) { g.classList.remove('ng-sel'); if (!g.getAttribute('class')) g.removeAttribute('class'); });
    c.querySelectorAll('.ng-img-sel').forEach(function (g) { g.classList.remove('ng-img-sel'); if (!g.getAttribute('class')) g.removeAttribute('class'); });
    return c.innerHTML;
  };
  Editor.prototype.ensureStructure = function () {
    var d = this.doc;
    // 맨 위 수준의 글자·인라인은 문단으로 묶기
    var run = null;
    Array.prototype.slice.call(d.childNodes).forEach(function (n) {
      var inline = n.nodeType === 3 ? !!n.nodeValue.replace(/[\n\r]/g, '') : (n.nodeType === 1 && !BLOCKISH[n.tagName] && !isGap(n) && !(n.classList && n.classList.contains('ng-box')));
      if (n.nodeType === 3 && !inline) { n.remove(); return; }
      if (inline) {
        if (!run) { run = document.createElement('p'); d.insertBefore(run, n); }
        run.appendChild(n);
      } else run = null;
    });
    if (!d.firstElementChild) d.innerHTML = '<p><br></p>';
    // 표 칸은 항상 문단을 품도록
    d.querySelectorAll('td,th').forEach(function (td) {
      if (td.classList.contains('ng-gapcell')) return;
      var hasBlock = Array.prototype.some.call(td.children, function (k) { return BLOCKISH[k.tagName] || k.classList.contains('ng-box'); });
      if (!hasBlock) {
        var p = document.createElement('p');
        while (td.firstChild) p.appendChild(td.firstChild);
        if (!p.firstChild) p.innerHTML = '<br>';
        td.appendChild(p);
      }
    });
    // 문서 끝이 표·쪽 나눔이면 뒤에 빈 문단 하나 (커서를 둘 곳)
    var last = d.lastElementChild;
    while (last && isGap(last)) last = last.previousElementSibling;
    if (last && (last.tagName === 'TABLE' || last.tagName === 'HR' || last.classList.contains('ng-box'))) d.appendChild(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
  };

  /* ---------- 쪽 ---------- */
  Editor.prototype.geom = function () {
    var p = this.settings.page, m = p.margin;
    var g = {
      W: NG.huToPx(p.width), H: NG.huToPx(p.height),
      ml: NG.huToPx(m.left), mr: NG.huToPx(m.right),
      mt: NG.huToPx(m.top), mb: NG.huToPx(m.bottom), mh: NG.huToPx(m.header), mf: NG.huToPx(m.footer), G: PAGE_GAP
    };
    g.CT = g.mt + g.mh; g.CB = g.mb + g.mf; g.step = g.H + g.G;
    return g;
  };
  Editor.prototype.applyPageCss = function () {
    var g = this.geom(), st = this.paper.style, d = this.doc.style;
    if (this.fit) {
      st.width = '100%'; st.zoom = 1;
      d.padding = '20px max(16px, env(safe-area-inset-right, 0px)) 40px max(16px, env(safe-area-inset-left, 0px))';
      this.paper.classList.add('ng-fit');
    } else {
      this.paper.classList.remove('ng-fit');
      st.width = g.W + 'px'; st.zoom = this.zoom;
      d.paddingTop = g.CT + 'px'; d.paddingBottom = g.CB + 'px'; d.paddingLeft = g.ml + 'px'; d.paddingRight = g.mr + 'px';
    }
    this.updatePrintCss();
  };
  Editor.prototype.setZoom = function (z) { this.zoom = Math.max(0.3, Math.min(3, z)); this.applyPageCss(); this.paginate(); this.positionOverlay(); };
  Editor.prototype.setFit = function (on) { this.fit = !!on; this.applyPageCss(); this.paginate(); this.positionOverlay(); };

  Editor.prototype.stripGaps = function () {
    var d = this.doc, touched = new Set();
    d.querySelectorAll('.ng-gap').forEach(function (g) { if (g.parentNode && g.parentNode.nodeType === 1) touched.add(g.parentNode); g.remove(); });
    d.querySelectorAll('.ng-pushed').forEach(function (el) { el.classList.remove('ng-pushed'); el.style.removeProperty('--ng-push'); if (!el.getAttribute('class')) el.removeAttribute('class'); if (!el.getAttribute('style')) el.removeAttribute('style'); });
    touched.forEach(function (el) { if (el.isConnected && el.tagName !== 'TBODY' && el !== d) el.normalize(); });
  };

  Editor.prototype.schedule = function () {
    var self = this;
    clearTimeout(this._pgT);
    this._pgT = setTimeout(function () { self.paginate(); }, 90);
  };

  Editor.prototype.paginate = function () {
    clearTimeout(this._pgT);
    if (this.composing) { this.schedule(); return; }
    var self = this, d = this.doc;
    this.stripGaps();
    if (this.fit) {
      this.pages = 1;
      this.paper.style.height = '';
      d.style.minHeight = '';
      this.sheets.innerHTML = '';
      this.emitPages();
      return;
    }
    var g = this.geom(), z = this.zoom;
    var top0 = d.getBoundingClientRect().top;
    function Y(v) { return (v - top0) / z; }
    function pageOf(y) { return Math.max(0, Math.floor(y / g.step)); }
    function pageTop(k) { return k * g.step + g.CT; }
    function limit(k) { return k * g.step + g.H - g.CB; }

    var blocks = Array.prototype.slice.call(d.children);
    var guard = 0;
    for (var i = 0; i < blocks.length && guard < 20000; i++) {
      var el = blocks[i];
      if (isGap(el)) continue;
      if (el.tagName === 'HR' && el.classList.contains('ng-pb')) {
        var rb = el.getBoundingClientRect(), hb = Y(rb.bottom), k0 = pageOf(Y(rb.top));
        var next = el.nextElementSibling;
        if (next) {
          var target = pageTop(k0 + 1);
          var nt = Y(next.getBoundingClientRect().top);
          if (nt < target - 0.5) {
            if (isPlike(next)) this.pushPara(next, target, Y);
            else { var gp = this.makeGap(0, true); next.parentNode.insertBefore(gp, next); gp.style.height = Math.max(0, target - Y(next.getBoundingClientRect().top)) + 'px'; }
          }
        }
        continue;
      }
      guard += this.fitBlock(el, Y, pageOf, pageTop, limit, g);
    }
    // 쪽 수
    var last = d.lastElementChild, bottom = g.CT;
    if (last) bottom = Y(last.getBoundingClientRect().bottom);
    var n = Math.max(1, pageOf(Math.max(0, bottom - 0.5)) + 1);
    if (bottom > limit(n - 1) + 0.5) n++;
    this.pages = n;
    var total = n * g.step - g.G;
    this.paper.style.height = total + 'px';
    d.style.minHeight = total + 'px';
    this.renderSheets(g, n);
    this.positionOverlay();
    this.emitPages();
  };

  Editor.prototype.fitBlock = function (el, Y, pageOf, pageTop, limit, g) {
    var steps = 0;
    if (el.tagName === 'TABLE') {
      this._skipRows = new Set();
      while (steps++ < 400 && this.splitTable(el, Y, pageOf, pageTop, limit)) { }
      return steps;
    }
    if (el.tagName === 'UL' || el.tagName === 'OL' || (el.tagName === 'DIV' && !el.classList.contains('ng-box') && !isPlike(el))) {
      var kids = Array.prototype.slice.call(el.children);
      for (var j = 0; j < kids.length; j++) if (!isGap(kids[j])) steps += this.fitBlock(kids[j], Y, pageOf, pageTop, limit, g);
      return steps;
    }
    if (isPlike(el)) {
      while (steps++ < 400 && this.splitText(el, Y, pageOf, pageTop, limit)) { }
      return steps;
    }
    var r = el.getBoundingClientRect(), top = Y(r.top), bottom = Y(r.bottom), k = pageOf(top);
    if (r.height > 0 && (top > limit(k) - 0.5 || bottom > limit(k) + 0.5) && top - pageTop(k) > 1) {
      var target = top > limit(k) - 0.5 ? pageTop(k + 1) : pageTop(k + 1);
      var gap = this.makeGap(0, true);
      el.parentNode.insertBefore(gap, el);
      var nt = Y(el.getBoundingClientRect().top);
      gap.style.height = Math.max(0, target - nt) + 'px';
    }
    return 1;
  };

  Editor.prototype.makeGap = function (h, block) {
    var s = document.createElement(block ? 'div' : 'span');
    s.className = 'ng-gap';
    s.contentEditable = 'false';
    s.style.height = Math.max(0, h) + 'px';
    return s;
  };
  /* 문단을 통째로 밀기: 위쪽 안 여백을 늘린다(문단 사이에 다른 요소를 끼우지 않음) */
  Editor.prototype.pushPara = function (el, target, Y) {
    var er = el.getBoundingClientRect();
    var contentTop = Y(er.top) + parseFloat(getComputedStyle(el).paddingTop || 0);
    var h = target - contentTop;
    if (h <= 0.5) return false;
    var cur = parseFloat(el.style.getPropertyValue('--ng-push')) || 0;
    el.classList.add('ng-pushed');
    el.style.setProperty('--ng-push', (cur + h) + 'px');
    return true;
  };

  function textAtoms(el) {
    var out = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (c.nodeValue.length) out.push(c); }
        else if (c.nodeType === 1) {
          if (isGap(c)) continue;
          if (c.tagName === 'IMG' || c.tagName === 'BR') out.push(c);
          else walk(c);
        }
      }
    })(el);
    return out;
  }
  function rectsOf(node) {
    if (node.nodeType === 3) {
      var r = document.createRange(); r.selectNodeContents(node);
      return Array.prototype.filter.call(r.getClientRects(), function (x) { return x.height > 0; });
    }
    if (node.tagName === 'IMG' && (node.classList.contains('ng-img-left') || node.classList.contains('ng-img-right'))) return [];
    var b = node.getBoundingClientRect();
    return b.height > 0 ? [b] : [];
  }

  Editor.prototype.splitText = function (el, Y, pageOf, pageTop, limit) {
    var atoms = textAtoms(el), frags = [];
    atoms.forEach(function (a, ai) { rectsOf(a).forEach(function (r) { frags.push({ a: a, ai: ai, top: Y(r.top), bottom: Y(r.bottom) }); }); });
    if (!frags.length) {
      var r0 = el.getBoundingClientRect(), t0 = Y(r0.top), k0 = pageOf(t0);
      if (r0.height > 0 && (t0 > limit(k0) - 0.5 || Y(r0.bottom) > limit(k0) + 0.5) && t0 - pageTop(k0) > 1) return this.pushPara(el, pageTop(k0 + 1), Y);
      return false;
    }
    var bi = -1;
    for (var i = 0; i < frags.length; i++) {
      var p = pageOf(frags[i].top);
      if (frags[i].top > limit(p) - 0.5 || frags[i].bottom > limit(p) + 0.5) { bi = i; break; }
    }
    if (bi < 0) return false;
    var lineTop = frags[bi].top, lineBottom = frags[bi].bottom;
    for (var j = bi - 1; j >= 0; j--) {
      if (frags[j].bottom > lineTop + 1 && frags[j].top < lineBottom - 1) { bi = j; lineTop = Math.min(lineTop, frags[j].top); }
      else if (frags[j].bottom <= lineTop + 1) break;
    }
    var pg = pageOf(lineTop);
    var target = pageTop(pg + 1);
    var isFirstLine = !frags.slice(0, bi).some(function (x) { return x.bottom <= lineTop + 1; });
    if (isFirstLine) {
      var er = el.getBoundingClientRect();
      var ct = Y(er.top) + parseFloat(getComputedStyle(el).paddingTop || 0);
      if (lineTop <= limit(pg) - 0.5 && ct - pageTop(pg) < 1) return false; // 쪽보다 큰 첫 줄
      return this.pushPara(el, target, Y);
    }
    var f = frags[bi], node = f.a, before;
    if (node.nodeType === 3) {
      var len = node.nodeValue.length, lo = 0, hi = len - 1, rg = document.createRange(), cut = len;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        rg.setStart(node, mid); rg.setEnd(node, mid + 1);
        var rr = rg.getBoundingClientRect();
        if (rr.height === 0 && mid > 0) { rg.setStart(node, mid - 1); rr = rg.getBoundingClientRect(); }
        if (Y(rr.bottom) > lineTop + 1) { cut = mid; hi = mid - 1; } else lo = mid + 1;
      }
      if (cut <= 0) before = node;
      else if (cut >= len) before = node.nextSibling;
      else before = node.splitText(cut);
    } else before = node;
    if (!before) return false;
    var gap = this.makeGap(0, false);
    before.parentNode.insertBefore(gap, before);
    var gt = Y(gap.getBoundingClientRect().top);
    var h = target - gt;
    if (h <= 0.5) { gap.remove(); return false; }
    gap.style.height = h + 'px';
    return true;
  };

  Editor.prototype.insertGapRow = function (tbl, gr, idx, target, Y) {
    var tr = document.createElement('tr');
    tr.className = 'ng-gap';
    tr.contentEditable = 'false';
    var td = document.createElement('td');
    td.className = 'ng-gapcell';
    td.colSpan = Math.max(1, gr.cols);
    td.style.cssText = 'height:0;padding:0;border:none;background:transparent';
    tr.appendChild(td);
    var ref = gr.rows[idx];
    ref.parentNode.insertBefore(tr, ref);
    var cur = Y(ref.getBoundingClientRect().top);
    var h = Math.max(0, target - cur);
    td.style.height = h + 'px';
    var cur2 = Y(ref.getBoundingClientRect().top);
    if (Math.abs(cur2 - target) > 0.5) td.style.height = Math.max(0, h + target - cur2) + 'px';
    return true;
  };

  Editor.prototype.splitTable = function (tbl, Y, pageOf, pageTop, limit) {
    var gr = NG.tableGrid(tbl), skip = this._skipRows;
    var idx = -1;
    for (var i = 0; i < gr.rows.length; i++) {
      if (skip.has(gr.rows[i])) continue;
      var rr = gr.rows[i].getBoundingClientRect(), t = Y(rr.top), b = Y(rr.bottom), p = pageOf(t);
      if (t > limit(p) - 0.5 || b > limit(p) + 0.5) { idx = i; break; }
    }
    if (idx < 0) return false;
    function crosses(bb) { return gr.cells.some(function (c) { return c.r < bb && c.r + c.rs > bb; }); }
    var bnd = idx;
    while (bnd > 0 && crosses(bnd)) bnd--;
    var bTop = Y(gr.rows[bnd].getBoundingClientRect().top), kk = pageOf(bTop);
    if (bTop <= limit(kk) - 0.5 && bTop - pageTop(kk) < 1) { skip.add(gr.rows[idx]); return true; } // 쪽보다 큰 줄: 그대로 둠
    var target = pageTop(kk + 1);
    if (target - bTop <= 0.5) { skip.add(gr.rows[idx]); return true; }
    return this.insertGapRow(tbl, gr, bnd, target, Y);
  };

  Editor.prototype.renderSheets = function (g, n) {
    var s = this.settings, html = '';
    function esc(t) { return NG.esc(t || ''); }
    var pn = s.pageNum && s.pageNum.pos && s.pageNum.pos !== 'NONE' ? s.pageNum : null;
    for (var i = 0; i < n; i++) {
      var num = pn ? (pn.side ? pn.side + ' ' + (i + 1) + ' ' + pn.side : String(i + 1)) : '';
      var parts = { TOP_LEFT: '', TOP_CENTER: '', TOP_RIGHT: '', BOTTOM_LEFT: '', BOTTOM_CENTER: '', BOTTOM_RIGHT: '' };
      if (pn && parts[pn.pos] !== undefined) parts[pn.pos] = num;
      var hdr = s.header && s.header.text ? '<div class="ng-hf ng-hdr" style="left:' + g.ml + 'px;right:' + g.mr + 'px;top:' + g.mt + 'px;height:' + g.mh + 'px;text-align:' + (s.header.align || 'center') + '">' + esc(s.header.text) + '</div>' : '';
      var ftr = s.footer && s.footer.text ? '<div class="ng-hf ng-ftr" style="left:' + g.ml + 'px;right:' + g.mr + 'px;bottom:' + g.mb + 'px;height:' + g.mf + 'px;text-align:' + (s.footer.align || 'center') + '">' + esc(s.footer.text) + '</div>' : '';
      var nums = '';
      ['TOP', 'BOTTOM'].forEach(function (v) {
        ['LEFT', 'CENTER', 'RIGHT'].forEach(function (h) {
          var t = parts[v + '_' + h];
          if (!t) return;
          var pos = v === 'TOP' ? 'top:' + Math.max(4, g.mt - 22) + 'px' : 'bottom:' + Math.max(4, g.mb - 22) + 'px';
          nums += '<div class="ng-pnum" style="' + pos + ';left:' + g.ml + 'px;right:' + g.mr + 'px;text-align:' + h.toLowerCase() + '">' + esc(t) + '</div>';
        });
      });
      html += '<div class="ng-sheet" style="top:' + (i * g.step) + 'px;height:' + g.H + 'px"><div class="ng-guide" style="left:' + g.ml + 'px;right:' + g.mr + 'px;top:' + g.CT + 'px;bottom:' + g.CB + 'px"></div>' + hdr + ftr + nums + '</div>';
    }
    this.sheets.innerHTML = html;
  };

  Editor.prototype.updatePrintCss = function () {
    var p = this.settings.page, m = p.margin, s = this.settings;
    var mm = function (hu) { return (NG.huToMm(hu)).toFixed(2) + 'mm'; };
    function q(t) { return '"' + String(t || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ') + '"'; }
    var boxes = {};
    function add(box, content) { boxes[box] = boxes[box] ? boxes[box] + ' "   " ' + content : content; }
    if (s.header && s.header.text) add('@top-' + (s.header.align === 'left' ? 'left' : s.header.align === 'right' ? 'right' : 'center'), q(s.header.text));
    if (s.footer && s.footer.text) add('@bottom-' + (s.footer.align === 'left' ? 'left' : s.footer.align === 'right' ? 'right' : 'center'), q(s.footer.text));
    if (s.pageNum && s.pageNum.pos && s.pageNum.pos !== 'NONE') {
      var pos = s.pageNum.pos.toLowerCase().replace('_', '-');
      var side = s.pageNum.side ? q(s.pageNum.side + ' ') + ' counter(page) ' + q(' ' + s.pageNum.side) : 'counter(page)';
      add('@' + pos, side);
    }
    var css = '@page{size:' + mm(p.width) + ' ' + mm(p.height) + ';margin:' + mm(m.top + m.header) + ' ' + mm(m.right) + ' ' + mm(m.bottom + m.footer) + ' ' + mm(m.left) + ';';
    Object.keys(boxes).forEach(function (b) { css += b + '{content:' + boxes[b] + ';font:9pt "함초롬바탕","Nanum Myeongjo",serif;white-space:pre}'; });
    css += '}';
    var el = document.getElementById('ng-print-css');
    if (!el) { el = document.createElement('style'); el.id = 'ng-print-css'; document.head.appendChild(el); }
    el.textContent = css;
  };

  Editor.prototype.emitPages = function () {
    this.onState(this.state());
  };

  /* ---------- 선택 위치 ---------- */
  Editor.prototype.range = function () {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var r = s.getRangeAt(0);
    if (!this.doc.contains(r.commonAncestorContainer) && r.commonAncestorContainer !== this.doc) return null;
    return r;
  };
  Editor.prototype.focus = function () {
    if (!this.range()) {
      var p = this.doc.querySelector('p,li,h1,h2,h3') || this.doc;
      var r = document.createRange(); r.selectNodeContents(p); r.collapse(true);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    this.doc.focus({ preventScroll: true });
  };
  Editor.prototype.blockOf = function (node) {
    for (var n = node && node.nodeType === 3 ? node.parentNode : node; n && n !== this.doc; n = n.parentNode) {
      if (isPlike(n)) return n;
    }
    return null;
  };
  Editor.prototype.selBlocks = function () {
    var self = this;
    if (this.cellSel) {
      var out = [];
      this.selCells().forEach(function (td) { td.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,blockquote,div').forEach(function (b) { if (isPlike(b)) out.push(b); }); });
      return out;
    }
    var r = this.range();
    if (!r) return [];
    var start = this.blockOf(r.startContainer), end = this.blockOf(r.endContainer);
    if (r.collapsed || start === end) return start ? [start] : [];
    var all = [], w = document.createTreeWalker(this.doc, NodeFilter.SHOW_ELEMENT, { acceptNode: function (n) { return isPlike(n) ? 1 : 3; } });
    var n;
    while ((n = w.nextNode())) if (r.intersectsNode(n)) all.push(n);
    return all;
  };
  Editor.prototype.saveSel = function () {
    var r = this.range();
    if (!r) return null;
    var root = this.doc;
    function path(node) {
      var p = [];
      while (node && node !== root) { var i = 0; for (var s = node.previousSibling; s; s = s.previousSibling) i++; p.unshift(i); node = node.parentNode; }
      return node === root ? p : null;
    }
    return { s: path(r.startContainer), so: r.startOffset, e: path(r.endContainer), eo: r.endOffset };
  };
  Editor.prototype.restoreSel = function (sv) {
    if (!sv || !sv.s) return;
    var root = this.doc;
    function node(p) { var n = root; for (var i = 0; i < p.length; i++) { if (!n.childNodes[p[i]]) return null; n = n.childNodes[p[i]]; } return n; }
    var a = node(sv.s), b = node(sv.e);
    if (!a || !b) return;
    try {
      var r = document.createRange();
      r.setStart(a, Math.min(sv.so, a.nodeType === 3 ? a.length : a.childNodes.length));
      r.setEnd(b, Math.min(sv.eo, b.nodeType === 3 ? b.length : b.childNodes.length));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) { }
  };

  /* ---------- 되돌리기 ---------- */
  Editor.prototype.snapshot = function () {
    this.stripGaps();
    return { html: this.cleanHtml(), sel: this.saveSel(), settings: JSON.stringify(this.settings) };
  };
  Editor.prototype.pushUndo = function () {
    var s = this.snapshot();
    var top = this.undoStack[this.undoStack.length - 1];
    if (top && top.html === s.html && top.settings === s.settings) return;
    this.undoStack.push(s);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  };
  Editor.prototype.restore = function (s) {
    this.clearImgSel(); this.clearCellSel();
    this.doc.innerHTML = s.html;
    this.settings = JSON.parse(s.settings);
    this.applyPageCss();
    this.restoreSel(s.sel);
    this.paginate();
    this.changed();
  };
  Editor.prototype.undo = function () {
    if (!this.undoStack.length) return;
    var cur = this.snapshot();
    this.redoStack.push(cur);
    this.restore(this.undoStack.pop());
  };
  Editor.prototype.redo = function () {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  };
  Editor.prototype.changed = function () {
    this.onChange();
    this.emitState();
  };

  /* ---------- 입력 ---------- */
  Editor.prototype.beforeInput = function (e) {
    var t = e.inputType || '';
    if (this.composing || e.isComposing || t === 'insertCompositionText') return;
    if (t === 'historyUndo') { e.preventDefault(); this.undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); this.redo(); return; }
    if (this.selImg && (t.indexOf('delete') === 0)) { e.preventDefault(); this.deleteImage(); return; }
    var now = Date.now();
    var typing = t === 'insertText' || t === 'insertCompositionText' || t === 'deleteContentBackward' || t === 'deleteContentForward';
    if (!typing || t !== this.lastInputType || now - this.lastInputAt > 1200) this.pushUndo();
    else this.stripGaps();
    this.lastInputType = t; this.lastInputAt = now;
    if (this.cellSel && t.indexOf('delete') === 0 && this.selCells().length > 1) {
      e.preventDefault();
      this.selCells().forEach(function (td) { td.innerHTML = '<p><br></p>'; });
      this.changed(); this.schedule();
    }
  };
  Editor.prototype.afterInput = function (e) {
    if (this.composing || (e && e.isComposing)) { this.onChange(); return; }
    this.convertMarkers();
    var d = this.doc;
    if (!d.firstElementChild || (d.childNodes.length === 1 && d.firstChild.nodeName === 'BR')) d.innerHTML = '<p><br></p>';
    else if (Array.prototype.some.call(d.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim(); })) {
      var sv = this.saveSel(); this.ensureStructure(); this.restoreSel(sv);
    }
    this.schedule();
    this.changed();
  };

  Editor.prototype.keydown = function (e) {
    var mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && !e.altKey) {
      var lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if ((lk === 'y') || (lk === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
      if (lk === 'b') { e.preventDefault(); this.exec('bold'); return; }
      if (lk === 'i') { e.preventDefault(); this.exec('italic'); return; }
      if (lk === 'u') { e.preventDefault(); this.exec('underline'); return; }
      if (k === 'Enter') { e.preventDefault(); this.exec('pageBreak'); return; }
    }
    if (this.selImg) {
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.deleteImage(); return; }
      if (k === 'Escape') { this.clearImgSel(); return; }
      if (k.length === 1 || k === 'Enter') this.clearImgSel();
    }
    if (k === 'Escape' && this.cellSel) { this.clearCellSel(); this.emitState(); return; }
    if (k === 'Tab' && !mod) {
      var td = this.currentCell();
      e.preventDefault();
      if (td) { this.moveCell(td, e.shiftKey ? -1 : 1); return; }
      this.pushUndo();
      document.execCommand('insertText', false, '\t');
    }
  };

  Editor.prototype.moveCell = function (td, dir) {
    var tbl = td.closest('table'), g = NG.tableGrid(tbl);
    var cells = g.cells.slice().sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    var i = cells.findIndex(function (c) { return c.el === td; });
    var n = cells[i + dir];
    if (!n && dir > 0) { this.tableOp('rowBelow'); g = NG.tableGrid(tbl); cells = g.cells.slice().sort(function (a, b) { return a.r - b.r || a.c - b.c; }); n = cells[i + 1]; }
    if (!n) return;
    var r = document.createRange(); r.selectNodeContents(n.el); r.collapse(false);
    var bl = n.el.querySelector('p,li,h1,h2,h3');
    if (bl) { r.selectNodeContents(bl); }
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };

  /* ---------- 붙여넣기·복사 ---------- */
  var ALLOWED_STYLE = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'font-size', 'font-family', 'text-align', 'vertical-align', 'margin-left', 'text-indent', 'line-height', 'width', 'height', 'border', 'border-left', 'border-right', 'border-top', 'border-bottom', 'text-align-last', 'padding-left'];
  NG.sanitizeHtml = function (html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var root = tpl.content;
    root.querySelectorAll('script,style,meta,link,title,iframe,object,embed,svg,math,form,input,button,select,textarea,noscript,head,colgroup').forEach(function (n) { n.remove(); });
    (function clean(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 8) { n.remove(); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName;
        var keep = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, SUP: 1, SUB: 1, SPAN: 1, FONT: 1, H1: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, TABLE: 1, TBODY: 1, THEAD: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1, IMG: 1, HR: 1, DIV: 1, BLOCKQUOTE: 1, A: 1 };
        if (!keep[tag]) {
          clean(n);
          var frag = document.createDocumentFragment();
          while (n.firstChild) frag.appendChild(n.firstChild);
          n.replaceWith(frag);
          return;
        }
        if (tag === 'IMG') {
          var isrc = n.getAttribute('src') || '', iid = n.getAttribute('data-img');
          if (!(/^data:image\//.test(isrc) || (iid && NG.imgs.has(iid)))) { n.remove(); return; }
        }
        if (n.classList.contains('ng-gap')) { n.remove(); return; }
        var style = n.getAttribute('style') || '';
        var kept = [];
        if (n.style) ALLOWED_STYLE.forEach(function (p) { var v = n.style.getPropertyValue(p); if (v && !/var\(/.test(v)) kept.push(p + ':' + v); });
        var colspan = n.getAttribute('colspan'), rowspan = n.getAttribute('rowspan'), src = n.getAttribute('src'), cls = n.getAttribute('class'), start = n.getAttribute('start'), shape = n.getAttribute('data-shape'), dimg = n.getAttribute('data-img');
        while (n.attributes.length) n.removeAttribute(n.attributes[0].name);
        if (kept.length) n.setAttribute('style', kept.join(';'));
        if (colspan) n.setAttribute('colspan', colspan);
        if (rowspan) n.setAttribute('rowspan', rowspan);
        if (src) n.setAttribute('src', src);
        if (start) n.setAttribute('start', start);
        if (shape) n.setAttribute('data-shape', shape);
        if (dimg) n.setAttribute('data-img', dimg);
        if (cls) {
          var keepCls = cls.split(/\s+/).filter(function (c) { return /^ng-(table|box|pb|img-left|img-right|img-block|center|right|shape)$/.test(c); });
          if (keepCls.length) n.setAttribute('class', keepCls.join(' '));
        }
        if (tag === 'TABLE') n.classList.add('ng-table');
        if (tag === 'FONT') { var sp = document.createElement('span'); while (n.firstChild) sp.appendChild(n.firstChild); if (kept.length) sp.setAttribute('style', kept.join(';')); n.replaceWith(sp); clean(sp); return; }
        if (tag === 'A') { var sp2 = document.createElement('span'); while (n.firstChild) sp2.appendChild(n.firstChild); n.replaceWith(sp2); clean(sp2); return; }
        clean(n);
      });
    })(root);
    // 블록 사이 공백 글자 제거
    root.querySelectorAll('table,tbody,tr,ul,ol').forEach(function (el) {
      Array.prototype.slice.call(el.childNodes).forEach(function (n) { if (n.nodeType === 3 && !n.nodeValue.trim()) n.remove(); });
    });
    Array.prototype.slice.call(root.childNodes).forEach(function (n) { if (n.nodeType === 3 && !n.nodeValue.trim() && /\n/.test(n.nodeValue)) n.remove(); });
    var div = document.createElement('div');
    div.appendChild(root);
    return div.innerHTML;
  };
  Editor.prototype.paste = function (e) {
    var cd = e.clipboardData;
    if (!cd) return;
    var self = this;
    var files = Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
    if (files.length) { e.preventDefault(); files.forEach(function (f) { self.insertImageFile(f); }); return; }
    var html = cd.getData('text/html'), text = cd.getData('text/plain');
    e.preventDefault();
    this.pushUndo();
    if (this.cellSel) this.clearCellSel();
    if (html) {
      var clean = NG.sanitizeHtml(html.replace(/<!--StartFragment-->|<!--EndFragment-->/g, ''));
      document.execCommand('insertHTML', false, clean);
      NG.internImages(this.doc);
    } else if (text) {
      document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'));
    }
    this.ensureStructure();
    this.schedule(); this.changed();
  };
  Editor.prototype.copy = function (e, cut) {
    var r = this.range();
    if (!r || r.collapsed) return;
    var frag = r.cloneContents();
    var div = document.createElement('div'); div.appendChild(frag);
    div.querySelectorAll('.ng-gap').forEach(function (g) { g.remove(); });
    div.querySelectorAll('.ng-pushed').forEach(function (g) { g.classList.remove('ng-pushed'); g.style.removeProperty('--ng-push'); });
    e.clipboardData.setData('text/html', div.innerHTML);
    e.clipboardData.setData('text/plain', r.toString());
    e.preventDefault();
    if (cut) { this.pushUndo(); r.deleteContents(); this.ensureStructure(); this.schedule(); this.changed(); }
  };
  Editor.prototype.drop = function (e) {
    var files = e.dataTransfer && Array.prototype.filter.call(e.dataTransfer.files || [], function (f) { return /^image\//.test(f.type); });
    if (!files || !files.length) return;
    e.preventDefault();
    var self = this;
    var pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (pos) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(pos); }
    files.forEach(function (f) { self.insertImageFile(f); });
  };

  /* ---------- 서식 ---------- */
  Editor.prototype.exec = function (cmd, val) {
    this.clearImgSelIfText(cmd);
    this.focus();
    var cellMode = !!this.cellSel && ['bold', 'italic', 'underline', 'strike', 'foreColor', 'hilite', 'fontName', 'fontSize', 'removeFormat', 'sup', 'sub'].indexOf(cmd) >= 0;
    this.pushUndo();
    if (cellMode) this.selectCellContents();
    try { document.execCommand('styleWithCSS', false, true); } catch (e) { }
    switch (cmd) {
      case 'bold': document.execCommand('bold'); break;
      case 'italic': document.execCommand('italic'); break;
      case 'underline': document.execCommand('underline'); break;
      case 'strike': document.execCommand('strikeThrough'); break;
      case 'sup': document.execCommand('superscript'); break;
      case 'sub': document.execCommand('subscript'); break;
      case 'removeFormat': document.execCommand('removeFormat'); break;
      case 'foreColor': document.execCommand('foreColor', false, val); break;
      case 'hilite':
        if (val === 'none') this.inlineStyle('backgroundColor', 'transparent', true);
        else document.execCommand('hiliteColor', false, val);
        break;
      case 'fontName': this.inlineStyle('fontFamily', NG.fontStack(val).replace(/"/g, "'")); break;
      case 'fontSize': this.inlineStyle('fontSize', val + 'pt'); break;
      case 'align': this.blockStyle(function (b) {
        b.style.textAlign = val === 'distribute' ? 'justify' : val;
        b.style.textAlignLast = val === 'distribute' ? 'justify' : '';
      }); break;
      case 'lineHeight': this.blockStyle(function (b) { b.style.lineHeight = String(val); }); break;
      case 'indent': this.blockStyle(function (b) {
        var cur = parseFloat(b.style.marginLeft) || 0;
        b.style.marginLeft = Math.max(0, cur + val * 26.67) + 'px';
        if (!parseFloat(b.style.marginLeft)) b.style.marginLeft = '';
      }); break;
      case 'para': this.blockStyle(function (b) {
        b.style.marginLeft = val.left ? val.left + 'px' : '';
        b.style.marginRight = val.right ? val.right + 'px' : '';
        b.style.textIndent = val.indent ? val.indent + 'px' : '';
        b.style.paddingLeft = val.indent < 0 ? (-val.indent) + 'px' : '';
        b.style.marginTop = val.before ? val.before + 'px' : '';
        b.style.marginBottom = val.after ? val.after + 'px' : '';
        if (val.lineHeight) b.style.lineHeight = String(val.lineHeight);
      }); break;
      case 'ul': document.execCommand('insertUnorderedList'); break;
      case 'ol': document.execCommand('insertOrderedList'); break;
      case 'block': document.execCommand('formatBlock', false, val); this.fixBlockAfterFormat(val); break;
      case 'pageBreak': this.pageBreakAtCaret(); break;
      case 'selectAll': { var r = document.createRange(); r.selectNodeContents(this.doc); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); break; }
    }
    if (cellMode && this.cellSel) this.markCells();
    this.ensureStructure();
    this.paginate();
    this.changed();
  };
  Editor.prototype.clearImgSelIfText = function (cmd) {
    if (this.selImg && ['align'].indexOf(cmd) < 0) {
      var img = this.selImg; this.clearImgSel();
      var r = document.createRange(); r.setStartAfter(img); r.collapse(true);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  };
  Editor.prototype.fixBlockAfterFormat = function (tag) {
    // 제목 문단의 글자 크기·굵기는 스타일이 정하도록 안쪽 크기 지정 제거
    var self = this;
    this.selBlocks().forEach(function (b) {
      if (/^H[1-3]$/.test(b.tagName)) {
        b.style.fontSize = ''; b.style.fontFamily = '';
        b.querySelectorAll('span').forEach(function (s) { s.style.fontSize = ''; s.style.fontWeight = ''; if (!s.getAttribute('style')) s.removeAttribute('style'); });
      }
    });
  };
  Editor.prototype.blockStyle = function (fn) {
    var bl = this.selBlocks();
    if (!bl.length) {
      var r = this.range();
      if (r) { document.execCommand('formatBlock', false, 'p'); bl = this.selBlocks(); }
    }
    bl.forEach(fn);
  };
  /* 글자 크기·글꼴: 표시 크기(7)로 칠한 뒤 원하는 값으로 바꾼다 */
  Editor.prototype.inlineStyle = function (prop, value, clearOnly) {
    this._marker = { prop: prop, value: value };
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    this.convertMarkers();
  };
  Editor.prototype.convertMarkers = function () {
    var m = this._marker;
    var els = this.doc.querySelectorAll('span[style*="xxx-large"], font[size="7"], span[style*="-webkit-xxx-large"]');
    if (!els.length) return;
    els.forEach(function (el) {
      var sp = el;
      if (el.tagName === 'FONT') { sp = document.createElement('span'); while (el.firstChild) sp.appendChild(el.firstChild); el.replaceWith(sp); }
      sp.style.fontSize = '';
      if (m) {
        sp.style[m.prop] = m.value;
        sp.querySelectorAll('[style]').forEach(function (k) { k.style[m.prop] = ''; if (!k.getAttribute('style')) k.removeAttribute('style'); });
        if (m.prop === 'backgroundColor' && m.value === 'transparent') sp.style.backgroundColor = '';
      }
      if (!sp.getAttribute('style')) {
        var f = document.createDocumentFragment(); while (sp.firstChild) f.appendChild(sp.firstChild); sp.replaceWith(f);
      }
    });
  };

  /* 쪽 나누기: 커서 자리에서 문단을 둘로 나누고 그 사이에 쪽 나눔 */
  Editor.prototype.pageBreakAtCaret = function () {
    var hr = document.createElement('hr'); hr.className = 'ng-pb';
    var cell = this.currentCell();
    if (cell) { // 표 안에서는 표 뒤에
      var tbl = cell.closest('table'); while (tbl.parentElement.closest('table')) tbl = tbl.parentElement.closest('table');
      var p = document.createElement('p'); p.innerHTML = '<br>';
      tbl.parentNode.insertBefore(p, tbl.nextSibling); tbl.parentNode.insertBefore(hr, p);
      var r0 = document.createRange(); r0.selectNodeContents(p); r0.collapse(true);
      var s0 = window.getSelection(); s0.removeAllRanges(); s0.addRange(r0);
      return;
    }
    var b = this.blockOf(this.range() && this.range().startContainer);
    if (b && b.tagName === 'LI') b = b.closest('ul,ol');
    if (!b || b.parentNode !== this.doc) { this.insertBlock(hr); return; }
    document.execCommand('insertParagraph');
    var nb = this.blockOf(this.range().startContainer);
    if (nb && nb.tagName === 'LI') nb = nb.closest('ul,ol');
    if (!nb || nb === b) { this.insertBlock(hr); return; }
    while (nb.parentNode !== this.doc && nb.parentNode) nb = nb.parentNode;
    this.doc.insertBefore(hr, nb);
  };

  /* 현재 문단 다음(빈 문단이면 그 자리)에 블록 넣기 */
  Editor.prototype.insertBlock = function (node, afterPara) {
    var r = this.range(), host = null;
    if (r) host = this.blockOf(r.startContainer);
    if (host && host.tagName === 'LI') host = host.closest('ul,ol');
    if (!host) { this.doc.appendChild(node); }
    else {
      var empty = !host.textContent.replace(/​/g, '').length && !host.querySelector('img');
      if (empty && node.tagName !== 'HR') host.replaceWith(node);
      else host.parentNode.insertBefore(node, host.nextSibling);
    }
    var next = node.nextElementSibling;
    while (next && isGap(next)) next = next.nextElementSibling;
    if (!next || next.tagName === 'TABLE' || next.tagName === 'HR') {
      var p = document.createElement('p'); p.innerHTML = '<br>';
      node.parentNode.insertBefore(p, node.nextSibling);
      next = p;
    }
    var rr = document.createRange();
    var target = node.tagName === 'TABLE' ? node.querySelector('td p') : next;
    rr.selectNodeContents(target); rr.collapse(true);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(rr);
  };

  /* ---------- 상태 알림 ---------- */
  Editor.prototype.state = function () {
    var st = { pages: this.pages, inTable: false, cellSel: !!this.cellSel, img: null, shape: null };
    var r = this.range();
    if (r) {
      var el = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
      if (el && el.nodeType === 1) {
        var cs = getComputedStyle(el);
        st.font = NG.firstFontName(cs.fontFamily);
        st.size = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
        var b = this.blockOf(el);
        if (b) {
          var bc = getComputedStyle(b);
          st.align = bc.textAlignLast === 'justify' && bc.textAlign === 'justify' ? 'distribute' : (bc.textAlign === 'start' ? 'left' : bc.textAlign);
          var lh = bc.lineHeight;
          st.lineHeight = lh === 'normal' ? 1.2 : Math.round(parseFloat(lh) / parseFloat(bc.fontSize) * 10) / 10;
          st.block = b.tagName === 'LI' ? 'P' : b.tagName;
        }
        try {
          st.bold = document.queryCommandState('bold'); st.italic = document.queryCommandState('italic');
          st.underline = document.queryCommandState('underline'); st.strike = document.queryCommandState('strikeThrough');
          st.sup = document.queryCommandState('superscript'); st.sub = document.queryCommandState('subscript');
          st.ul = document.queryCommandState('insertUnorderedList'); st.ol = document.queryCommandState('insertOrderedList');
        } catch (e) { }
        st.color = NG.cssColorToHex(cs.color);
        st.inTable = !!(el.closest && el.closest('td'));
      }
    }
    if (this.cellSel) st.inTable = true;
    if (this.selImg) { st.img = true; st.shape = !!this.selImg.getAttribute('data-shape'); st.wrap = this.imgWrap(this.selImg); }
    st.canUndo = this.undoStack.length > 0; st.canRedo = this.redoStack.length > 0;
    return st;
  };
  Editor.prototype.emitState = function () { this.onState(this.state()); };

  /* ---------- 표 ---------- */
  Editor.prototype.contentWidthPx = function () {
    var p = this.settings.page; return NG.huToPx(p.width - p.margin.left - p.margin.right);
  };
  NG.CELL_STYLE = 'border:0.12mm solid #000000;vertical-align:middle';
  Editor.prototype.insertTable = function (rows, cols) {
    this.pushUndo();
    this.focus();
    var host = this.currentCell();
    var W = host ? host.clientWidth - 16 : this.contentWidthPx();
    var cw = Math.floor(W / cols * 100) / 100;
    var t = document.createElement('table');
    t.className = 'ng-table';
    t.style.width = (cw * cols) + 'px';
    var h = '<colgroup>' + new Array(cols + 1).join('<col style="width:' + cw + 'px">') + '</colgroup><tbody>';
    for (var r = 0; r < rows; r++) {
      h += '<tr>';
      for (var c = 0; c < cols; c++) h += '<td style="' + NG.CELL_STYLE + '"><p><br></p></td>';
      h += '</tr>';
    }
    t.innerHTML = h + '</tbody>';
    this.insertBlock(t);
    this.paginate(); this.changed();
  };
  Editor.prototype.currentCell = function () {
    if (this.cellSel) return this.cellSel.anchor;
    var r = this.range();
    if (!r) return null;
    var n = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
    return n && n.closest ? n.closest('td,th') : null;
  };

  function model(tbl) {
    var g = NG.tableGrid(tbl);
    var colEls = tbl.querySelectorAll(':scope > colgroup > col');
    var cols = [];
    for (var i = 0; i < g.cols; i++) cols.push(colEls[i] ? (parseFloat(colEls[i].style.width) || 0) : 0);
    if (cols.some(function (w) { return !w; })) {
      var W = tbl.offsetWidth || 600; cols = cols.map(function (w) { return w || W / g.cols; });
    }
    return { tbl: tbl, cols: cols, nrows: g.rows.length, rowStyles: g.rows.map(function (tr) { return tr.getAttribute('style') || ''; }), cells: g.cells.map(function (c) { return { el: c.el, r: c.r, c: c.c, rs: c.rs, cs: c.cs }; }) };
  }
  function newCellLike(td) {
    var n = document.createElement('td');
    n.setAttribute('style', td ? (td.getAttribute('style') || NG.CELL_STYLE) : NG.CELL_STYLE);
    n.innerHTML = '<p><br></p>';
    return n;
  }
  function normalizeModel(m) {
    // 시작 셀이 없는 줄·칸 없애기
    var r = 0;
    while (r < m.nrows) {
      var starts = m.cells.some(function (c) { return c.r === r; });
      if (!starts && m.nrows > 1) {
        m.cells.forEach(function (c) { if (c.r < r && c.r + c.rs > r) c.rs--; if (c.r > r) c.r--; });
        m.rowStyles.splice(r, 1); m.nrows--;
      } else r++;
    }
    var c0 = 0;
    while (c0 < m.cols.length) {
      var st = m.cells.some(function (c) { return c.c === c0; });
      if (!st && m.cols.length > 1) {
        m.cells.forEach(function (c) { if (c.c < c0 && c.c + c.cs > c0) c.cs--; if (c.c > c0) c.c--; });
        if (c0 > 0) m.cols[c0 - 1] += m.cols[c0];
        else m.cols[1] += m.cols[0];
        m.cols.splice(c0, 1);
      } else c0++;
    }
  }
  function renderModel(m) {
    normalizeModel(m);
    var tbl = m.tbl;
    tbl.querySelectorAll(':scope > .ng-gap, :scope > tbody > .ng-gap').forEach(function (g) { g.remove(); });
    var cg = tbl.querySelector(':scope > colgroup');
    if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
    cg.innerHTML = m.cols.map(function (w) { return '<col style="width:' + (Math.round(w * 100) / 100) + 'px">'; }).join('');
    var tb = tbl.tBodies[0];
    if (!tb) { tb = document.createElement('tbody'); tbl.appendChild(tb); }
    Array.prototype.slice.call(tbl.querySelectorAll(':scope > thead, :scope > tfoot, :scope > tbody')).forEach(function (s) { if (s !== tb) s.remove(); });
    var trs = [];
    for (var r = 0; r < m.nrows; r++) { var tr = document.createElement('tr'); if (m.rowStyles[r]) tr.setAttribute('style', m.rowStyles[r]); trs.push(tr); }
    m.cells.slice().sort(function (a, b) { return a.r - b.r || a.c - b.c; }).forEach(function (c) {
      c.el.colSpan = c.cs; c.el.rowSpan = c.rs;
      if (c.cs === 1) c.el.removeAttribute('colspan');
      if (c.rs === 1) c.el.removeAttribute('rowspan');
      trs[c.r].appendChild(c.el);
    });
    tb.innerHTML = '';
    trs.forEach(function (tr) { tb.appendChild(tr); });
    tbl.style.width = m.cols.reduce(function (a, b) { return a + b; }, 0) + 'px';
  }
  NG.tableModel = model; NG.renderTableModel = renderModel;

  Editor.prototype.selRect = function () {
    if (this.cellSel) return this.cellSel;
    var td = this.currentCell();
    if (!td) return null;
    var tbl = td.closest('table'), g = NG.tableGrid(tbl);
    var c = g.cells.filter(function (x) { return x.el === td; })[0];
    return { tbl: tbl, r0: c.r, c0: c.c, r1: c.r + c.rs - 1, c1: c.c + c.cs - 1, anchor: td };
  };
  Editor.prototype.tableOp = function (op, arg) {
    var rect = this.selRect();
    if (!rect) return;
    this.pushUndo();
    var tbl = rect.tbl, m = model(tbl), self = this;
    var focusEl = null;
    function at(r, c) { return m.cells.filter(function (x) { return x.r <= r && r < x.r + x.rs && x.c <= c && c < x.c + x.cs; })[0]; }
    switch (op) {
      case 'rowAbove': case 'rowBelow': {
        var at0 = op === 'rowAbove' ? rect.r0 : rect.r1 + 1;
        var ref = op === 'rowAbove' ? rect.r0 : rect.r1;
        var news = [];
        m.cells.forEach(function (c) { if (c.r >= at0) c.r++; else if (c.r + c.rs > at0) { c.rs++; c._grew = true; } });
        for (var cc = 0; cc < m.cols.length;) {
          var cov = m.cells.filter(function (x) { return x._grew && x.c <= cc && cc < x.c + x.cs; })[0];
          if (cov) { cc += cov.cs; continue; }
          var src = at(ref < at0 ? ref : ref + 1, cc) || at(ref, cc);
          var span = 1;
          var nc = { el: newCellLike(src && src.el), r: at0, c: cc, rs: 1, cs: span };
          news.push(nc); cc += span;
        }
        m.cells.forEach(function (c) { delete c._grew; });
        m.cells = m.cells.concat(news);
        m.rowStyles.splice(at0, 0, '');
        m.nrows++;
        focusEl = news[0] && news[0].el;
        break;
      }
      case 'colLeft': case 'colRight': {
        var ac = op === 'colLeft' ? rect.c0 : rect.c1 + 1;
        var refc = op === 'colLeft' ? rect.c0 : rect.c1;
        var total = m.cols.reduce(function (a, b) { return a + b; }, 0);
        var nw = m.cols[refc];
        m.cells.forEach(function (c) { if (c.c >= ac) c.c++; else if (c.c + c.cs > ac) { c.cs++; c._grew = true; } });
        var news2 = [];
        for (var rr = 0; rr < m.nrows;) {
          var cov2 = m.cells.filter(function (x) { return x._grew && x.r <= rr && rr < x.r + x.rs; })[0];
          if (cov2) { rr += cov2.rs; continue; }
          var src2 = at(rr, ac < refc + 1 ? refc + 1 : refc) || at(rr, refc);
          news2.push({ el: newCellLike(src2 && src2.el), r: rr, c: ac, rs: 1, cs: 1 });
          rr++;
        }
        m.cells.forEach(function (c) { delete c._grew; });
        m.cells = m.cells.concat(news2);
        m.cols.splice(ac, 0, nw);
        var scale = total / (total + nw);
        m.cols = m.cols.map(function (w) { return w * scale; });
        focusEl = news2[0] && news2[0].el;
        break;
      }
      case 'delRow': {
        var n = rect.r1 - rect.r0 + 1;
        if (n >= m.nrows) { this.deleteTable(tbl); return; }
        m.cells = m.cells.filter(function (c) {
          var top = c.r, bot = c.r + c.rs - 1;
          var ovStart = Math.max(top, rect.r0), ovEnd = Math.min(bot, rect.r1);
          var ov = Math.max(0, ovEnd - ovStart + 1);
          if (ov === c.rs) return false;
          c.rs -= ov;
          if (c.r > rect.r1) c.r -= n; else if (c.r >= rect.r0) c.r = rect.r0;
          return true;
        });
        m.rowStyles.splice(rect.r0, n); m.nrows -= n;
        break;
      }
      case 'delCol': {
        var n2 = rect.c1 - rect.c0 + 1;
        if (n2 >= m.cols.length) { this.deleteTable(tbl); return; }
        var removedW = 0; for (var q = rect.c0; q <= rect.c1; q++) removedW += m.cols[q];
        var tot = m.cols.reduce(function (a, b) { return a + b; }, 0);
        m.cells = m.cells.filter(function (c) {
          var l = c.c, rgt = c.c + c.cs - 1;
          var ov = Math.max(0, Math.min(rgt, rect.c1) - Math.max(l, rect.c0) + 1);
          if (ov === c.cs) return false;
          c.cs -= ov;
          if (c.c > rect.c1) c.c -= n2; else if (c.c >= rect.c0) c.c = rect.c0;
          return true;
        });
        m.cols.splice(rect.c0, n2);
        var sc = tot / (tot - removedW);
        m.cols = m.cols.map(function (w) { return w * sc; });
        break;
      }
      case 'merge': {
        var inside = m.cells.filter(function (c) { return c.r >= rect.r0 && c.r + c.rs - 1 <= rect.r1 && c.c >= rect.c0 && c.c + c.cs - 1 <= rect.c1; });
        if (inside.length < 2) return;
        inside.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
        var main = inside[0];
        inside.slice(1).forEach(function (c) {
          var hasText = c.el.textContent.replace(/​/g, '').trim() || c.el.querySelector('img,table');
          if (hasText) Array.prototype.slice.call(c.el.childNodes).forEach(function (k) { main.el.appendChild(k); });
        });
        // 첫 셀이 비어 있었다면 빈 문단 정리
        if (main.el.children.length > 1) Array.prototype.slice.call(main.el.children).forEach(function (k) { if (main.el.children.length > 1 && isPlike(k) && !k.textContent.trim() && !k.querySelector('img')) k.remove(); });
        m.cells = m.cells.filter(function (c) { return inside.indexOf(c) <= 0; });
        main.rs = rect.r1 - rect.r0 + 1; main.cs = rect.c1 - rect.c0 + 1; main.r = rect.r0; main.c = rect.c0;
        focusEl = main.el;
        this.clearCellSel();
        break;
      }
      case 'unmerge': {
        var targets = m.cells.filter(function (c) { return (c.rs > 1 || c.cs > 1) && c.r >= rect.r0 && c.r <= rect.r1 && c.c >= rect.c0 && c.c <= rect.c1; });
        targets.forEach(function (t) {
          for (var i = 0; i < t.rs; i++) for (var j = 0; j < t.cs; j++) {
            if (!i && !j) continue;
            m.cells.push({ el: newCellLike(t.el), r: t.r + i, c: t.c + j, rs: 1, cs: 1 });
          }
          t.rs = 1; t.cs = 1;
        });
        break;
      }
      case 'splitCols': case 'splitRows': {
        var cell = m.cells.filter(function (c) { return c.el === rect.anchor; })[0] || at(rect.r0, rect.c0);
        var k = Math.max(2, arg || 2);
        if (op === 'splitCols') {
          if (cell.cs >= k) {
            var each = Math.floor(cell.cs / k), rest = cell.cs - each * (k - 1);
            var cpos = cell.c + rest; cell.cs = rest;
            for (var a = 1; a < k; a++) { m.cells.push({ el: newCellLike(cell.el), r: cell.r, c: cpos, rs: cell.rs, cs: each }); cpos += each; }
          } else {
            var add = k - cell.cs;
            var edge = cell.c + cell.cs; // 이 위치에 새 칸 add개
            var wsum = 0; for (var z = cell.c; z < edge; z++) wsum += m.cols[z];
            m.cells.forEach(function (c) {
              if (c === cell) return;
              if (c.c >= edge) c.c += add; else if (c.c + c.cs > edge - 1 && c.c <= edge - 1) c.cs += add;
            });
            var part = wsum / k;
            var newCols = []; for (var b2 = 0; b2 < k; b2++) newCols.push(part);
            m.cols.splice.apply(m.cols, [cell.c, cell.cs].concat(newCols));
            var startC = cell.c + 1;
            cell.cs = 1;
            for (var a2 = 0; a2 < k - 1; a2++) m.cells.push({ el: newCellLike(cell.el), r: cell.r, c: startC + a2, rs: cell.rs, cs: 1 });
          }
        } else {
          if (cell.rs >= k) {
            var each2 = Math.floor(cell.rs / k), rest2 = cell.rs - each2 * (k - 1);
            var rpos = cell.r + rest2; cell.rs = rest2;
            for (var a3 = 1; a3 < k; a3++) { m.cells.push({ el: newCellLike(cell.el), r: rpos, c: cell.c, rs: each2, cs: cell.cs }); rpos += each2; }
          } else {
            var addR = k - cell.rs, edgeR = cell.r + cell.rs;
            m.cells.forEach(function (c) {
              if (c === cell) return;
              if (c.r >= edgeR) c.r += addR; else if (c.r + c.rs > edgeR - 1 && c.r <= edgeR - 1) c.rs += addR;
            });
            for (var a4 = 0; a4 < addR; a4++) m.rowStyles.splice(edgeR, 0, '');
            m.nrows += addR;
            cell.rs = 1;
            var oldRs = k - addR; // 원래 rs
            // 원래 칸 영역(rs행)을 k행으로: 첫 행은 기존 셀, 나머지 새 셀
            var startR = cell.r + 1;
            for (var a5 = 0; a5 < k - 1; a5++) m.cells.push({ el: newCellLike(cell.el), r: startR + a5, c: cell.c, rs: 1, cs: cell.cs });
          }
        }
        break;
      }
      case 'bg': this.selCells().forEach(function (td) { td.style.backgroundColor = arg === 'none' ? '' : arg; }); this.afterTable(tbl, null); return;
      case 'valign': this.selCells().forEach(function (td) { td.style.verticalAlign = arg; }); this.afterTable(tbl, null); return;
      case 'border': {
        var cells = this.selCells(), g = NG.tableGrid(tbl);
        cells.forEach(function (td) {
          var c = g.cells.filter(function (x) { return x.el === td; })[0];
          if (arg === 'all') td.style.border = '0.12mm solid #000000';
          else if (arg === 'none') td.style.border = 'none';
          else if (arg === 'outer') {
            if (c.r === rect.r0) td.style.borderTop = '0.4mm solid #000000';
            if (c.r + c.rs - 1 === rect.r1) td.style.borderBottom = '0.4mm solid #000000';
            if (c.c === rect.c0) td.style.borderLeft = '0.4mm solid #000000';
            if (c.c + c.cs - 1 === rect.c1) td.style.borderRight = '0.4mm solid #000000';
          } else if (arg === 'double') {
            if (c.r + c.rs - 1 === rect.r1) td.style.borderBottom = '0.5mm double #000000';
          }
        });
        this.afterTable(tbl, null); return;
      }
      case 'fitWidth': {
        var Wt = this.contentWidthPx(), tw = m.cols.reduce(function (a, b) { return a + b; }, 0);
        var host = tbl.parentElement.closest('td');
        if (host) Wt = host.clientWidth - 16;
        m.cols = m.cols.map(function (w) { return w * Wt / tw; });
        break;
      }
      case 'equalCols': {
        var tw2 = m.cols.reduce(function (a, b) { return a + b; }, 0);
        var l0 = rect.c0, l1 = rect.c1;
        if (l0 === l1) { l0 = 0; l1 = m.cols.length - 1; }
        var seg = 0; for (var u = l0; u <= l1; u++) seg += m.cols[u];
        for (u = l0; u <= l1; u++) m.cols[u] = seg / (l1 - l0 + 1);
        break;
      }
      case 'align': {
        tbl.style.marginLeft = arg === 'center' || arg === 'right' ? 'auto' : '';
        tbl.style.marginRight = arg === 'center' ? 'auto' : '';
        this.afterTable(tbl, null); return;
      }
    }
    var anchor = rect.anchor;
    renderModel(m);
    if (!focusEl && anchor && anchor.isConnected) focusEl = anchor;
    if (!focusEl) focusEl = tbl.querySelector('td');
    this.afterTable(tbl, focusEl);
  };
  Editor.prototype.afterTable = function (tbl, focusEl) {
    if (focusEl) {
      this.clearCellSel();
      var p = focusEl.querySelector('p,li,h1,h2,h3') || focusEl;
      var r = document.createRange(); r.selectNodeContents(p); r.collapse(true);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } else if (this.cellSel) this.markCells();
    this.ensureStructure();
    this.paginate(); this.changed();
  };
  Editor.prototype.deleteTable = function (tbl) {
    tbl = tbl || (this.selRect() || {}).tbl;
    if (!tbl) return;
    this.pushUndo();
    this.clearCellSel();
    var p = document.createElement('p'); p.innerHTML = '<br>';
    tbl.replaceWith(p);
    var r = document.createRange(); r.selectNodeContents(p); r.collapse(true);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    this.ensureStructure(); this.paginate(); this.changed();
  };

  /* 셀 여러 개 고르기 (끌기) */
  Editor.prototype.mousedown = function (e) {
    var self = this, t = e.target;
    if (this._resizeHover) { this.startColResize(e); return; }
    if (t.tagName === 'IMG' && this.doc.contains(t)) {
      e.preventDefault();
      this.selectImage(t);
      return;
    }
    this.clearImgSel();
    var td = t.closest && t.closest('td,th');
    if (!td || td.classList.contains('ng-gapcell') || e.button !== 0) { this.clearCellSel(); return; }
    if (e.shiftKey && this.cellSel && this.cellSel.tbl === td.closest('table')) {
      e.preventDefault(); this.extendCellSel(this.cellSel.anchor, td); return;
    }
    this.clearCellSel();
    var start = td, tbl = td.closest('table');
    function move(ev) {
      var o = ev.target.closest && ev.target.closest('td,th');
      if (!o || o.closest('table') !== tbl || o.classList.contains('ng-gapcell')) return;
      if (o !== start || self.cellSel) {
        if (o === start && self.cellSel) { self.clearCellSel(); return; }
        if (o !== start) {
          window.getSelection().removeAllRanges();
          self.extendCellSel(start, o);
        }
      }
    }
    function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); if (self.cellSel) self.doc.focus({ preventScroll: true }); self.emitState(); }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  Editor.prototype.extendCellSel = function (a, b) {
    var tbl = a.closest('table'), g = NG.tableGrid(tbl);
    var ca = g.cells.filter(function (x) { return x.el === a; })[0], cb = g.cells.filter(function (x) { return x.el === b; })[0];
    if (!ca || !cb) return;
    var r0 = Math.min(ca.r, cb.r), r1 = Math.max(ca.r + ca.rs - 1, cb.r + cb.rs - 1);
    var c0 = Math.min(ca.c, cb.c), c1 = Math.max(ca.c + ca.cs - 1, cb.c + cb.cs - 1);
    var changed = true;
    while (changed) { // 병합 셀이 걸치면 넓힘
      changed = false;
      g.cells.forEach(function (c) {
        var inR = c.r <= r1 && c.r + c.rs - 1 >= r0, inC = c.c <= c1 && c.c + c.cs - 1 >= c0;
        if (inR && inC) {
          if (c.r < r0) { r0 = c.r; changed = true; }
          if (c.r + c.rs - 1 > r1) { r1 = c.r + c.rs - 1; changed = true; }
          if (c.c < c0) { c0 = c.c; changed = true; }
          if (c.c + c.cs - 1 > c1) { c1 = c.c + c.cs - 1; changed = true; }
        }
      });
    }
    this.cellSel = { tbl: tbl, r0: r0, c0: c0, r1: r1, c1: c1, anchor: a };
    this.markCells();
    this.emitState();
  };
  Editor.prototype.selCells = function () {
    if (!this.cellSel) { var td = this.currentCell(); return td ? [td] : []; }
    var s = this.cellSel, g = NG.tableGrid(s.tbl);
    return g.cells.filter(function (c) { return c.r >= s.r0 && c.r <= s.r1 && c.c >= s.c0 && c.c <= s.c1; }).map(function (c) { return c.el; });
  };
  Editor.prototype.markCells = function () {
    this.doc.querySelectorAll('.ng-sel').forEach(function (td) { td.classList.remove('ng-sel'); });
    if (!this.cellSel) return;
    this.selCells().forEach(function (td) { td.classList.add('ng-sel'); });
  };
  Editor.prototype.clearCellSel = function () {
    if (!this.cellSel) return;
    this.cellSel = null;
    this.doc.querySelectorAll('.ng-sel').forEach(function (td) { td.classList.remove('ng-sel'); if (!td.getAttribute('class')) td.removeAttribute('class'); });
  };
  Editor.prototype.selectCellContents = function () {
    var cells = this.selCells();
    if (!cells.length) return;
    var r = document.createRange();
    r.setStartBefore(cells[0].firstChild || cells[0]);
    r.setEndAfter(cells[cells.length - 1].lastChild || cells[cells.length - 1]);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };

  /* 칸 너비 끌어서 바꾸기 */
  Editor.prototype.hoverResize = function (e) {
    if (this._dragging) return;
    var td = e.target.closest && e.target.closest('td,th');
    var hit = null;
    if (td && !td.classList.contains('ng-gapcell')) {
      var r = td.getBoundingClientRect();
      if (Math.abs(e.clientX - r.right) < 5) hit = { td: td, side: 'right' };
      else if (Math.abs(e.clientX - r.left) < 5 && td.cellIndex > 0) hit = { td: td, side: 'left' };
    }
    this._resizeHover = hit;
    this.doc.style.cursor = hit ? 'col-resize' : '';
  };
  Editor.prototype.startColResize = function (e) {
    e.preventDefault();
    var self = this, hit = this._resizeHover, td = hit.td, tbl = td.closest('table');
    var g = NG.tableGrid(tbl), c = g.cells.filter(function (x) { return x.el === td; })[0];
    var boundary = hit.side === 'right' ? c.c + c.cs - 1 : c.c - 1; // 이 칸의 오른쪽 경계
    if (boundary < 0) return;
    this.pushUndo();
    var m = model(tbl);
    var cols = tbl.querySelectorAll(':scope > colgroup > col');
    if (cols.length !== m.cols.length) { renderModel(m); cols = tbl.querySelectorAll(':scope > colgroup > col'); }
    var startX = e.clientX, w0 = m.cols.slice(), last = boundary === m.cols.length - 1;
    this._dragging = true;
    function move(ev) {
      var dx = (ev.clientX - startX) / (self.fit ? 1 : self.zoom);
      var a = Math.max(16, w0[boundary] + dx);
      var d = a - w0[boundary];
      if (!last) {
        var b = w0[boundary + 1] - d;
        if (b < 16) { b = 16; a = w0[boundary] + w0[boundary + 1] - 16; }
        cols[boundary + 1].style.width = b + 'px';
      }
      cols[boundary].style.width = a + 'px';
      var tot = 0; cols.forEach(function (cl) { tot += parseFloat(cl.style.width); });
      tbl.style.width = tot + 'px';
    }
    function up() {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      self._dragging = false; self._resizeHover = null; self.doc.style.cursor = '';
      self.paginate(); self.changed();
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  /* ---------- 그림 ---------- */
  Editor.prototype.initOverlay = function () {
    var self = this, ov = this.overlay;
    ov.innerHTML = '<div class="ng-ov-box"></div>' + ['nw', 'ne', 'sw', 'se'].map(function (h) { return '<div class="ng-ov-h" data-h="' + h + '"></div>'; }).join('') + '<div class="ng-ov-size"></div>';
    ov.hidden = true;
    ov.addEventListener('mousedown', function (e) {
      var h = e.target.getAttribute('data-h');
      if (!h || !self.selImg) return;
      e.preventDefault(); e.stopPropagation();
      self.startImgResize(e, h);
    });
    ov.addEventListener('touchstart', function (e) {
      var h = e.target.getAttribute('data-h');
      if (!h || !self.selImg) return;
      e.preventDefault();
      var t = e.touches[0];
      self.startImgResize({ clientX: t.clientX, clientY: t.clientY, shiftKey: false, touch: true }, h);
    }, { passive: false });
    this.doc.addEventListener('touchend', function (e) {
      if (e.target.tagName === 'IMG' && self.doc.contains(e.target)) { self.selectImage(e.target); }
    });
  };
  Editor.prototype.selectImage = function (img) {
    this.clearCellSel();
    if (this.selImg && this.selImg !== img) this.selImg.classList.remove('ng-img-sel');
    this.selImg = img;
    img.classList.add('ng-img-sel');
    var r = document.createRange(); r.setStartAfter(img); r.collapse(true);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    this.overlay.hidden = false;
    this.positionOverlay();
    this.emitState();
  };
  Editor.prototype.clearImgSel = function () {
    if (!this.selImg) return;
    this.selImg.classList.remove('ng-img-sel');
    if (!this.selImg.getAttribute('class')) this.selImg.removeAttribute('class');
    this.selImg = null;
    this.overlay.hidden = true;
    this.emitState();
  };
  Editor.prototype.positionOverlay = function () {
    var img = this.selImg;
    if (!img || !img.isConnected) { if (img) this.clearImgSel(); return; }
    var pr = this.paper.getBoundingClientRect(), r = img.getBoundingClientRect();
    var z = this.fit ? 1 : this.zoom;
    var ov = this.overlay.style;
    ov.left = (r.left - pr.left) / z + 'px'; ov.top = (r.top - pr.top) / z + 'px';
    ov.width = r.width / z + 'px'; ov.height = r.height / z + 'px';
    this.overlay.querySelector('.ng-ov-size').textContent = Math.round(NG.huToMm(NG.pxToHu(r.width / z))) + ' × ' + Math.round(NG.huToMm(NG.pxToHu(r.height / z))) + ' mm';
  };
  Editor.prototype.startImgResize = function (e, h) {
    var self = this, img = this.selImg, z = this.fit ? 1 : this.zoom;
    this.pushUndo();
    var w0 = img.offsetWidth, h0 = img.offsetHeight, x0 = e.clientX, y0 = e.clientY, ratio = w0 / h0;
    var maxW = this.fit ? this.doc.clientWidth - 32 : this.contentWidthPx();
    var shape = img.getAttribute('data-shape');
    function move(ev) {
      var cx = ev.touches ? ev.touches[0].clientX : ev.clientX, cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      var dx = (cx - x0) / z, dy = (cy - y0) / z;
      if (h.indexOf('w') >= 0) dx = -dx;
      if (h.indexOf('n') >= 0) dy = -dy;
      var w = Math.max(12, Math.min(maxW, w0 + dx)), hh = Math.max(12, h0 + dy);
      if (!ev.shiftKey && !shape) hh = w / ratio;
      if (shape && !ev.shiftKey && false) hh = w / ratio;
      img.style.width = Math.round(w) + 'px'; img.style.height = Math.round(hh) + 'px';
      self.positionOverlay();
      if (ev.cancelable && ev.touches) ev.preventDefault();
    }
    function up() {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up);
      if (shape) self.redrawShape(img);
      self.paginate(); self.changed();
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
  };
  Editor.prototype.imgWrap = function (img) {
    return img.classList.contains('ng-img-left') ? 'left' : img.classList.contains('ng-img-right') ? 'right' : img.classList.contains('ng-img-block') ? (img.classList.contains('ng-center') ? 'center' : 'block') : 'inline';
  };
  Editor.prototype.setImgWrap = function (wrap) {
    var img = this.selImg; if (!img) return;
    this.pushUndo();
    img.classList.remove('ng-img-left', 'ng-img-right', 'ng-img-block', 'ng-center', 'ng-right');
    if (wrap === 'left') img.classList.add('ng-img-left');
    else if (wrap === 'right') img.classList.add('ng-img-right');
    else if (wrap === 'center') img.classList.add('ng-img-block', 'ng-center');
    else if (wrap === 'block') img.classList.add('ng-img-block');
    this.paginate(); this.positionOverlay(); this.changed();
  };
  Editor.prototype.imgOriginal = function () {
    var img = this.selImg; if (!img || img.getAttribute('data-shape')) return;
    this.pushUndo();
    var w = Math.min(img.naturalWidth, this.contentWidthPx());
    img.style.width = w + 'px'; img.style.height = (w * img.naturalHeight / img.naturalWidth) + 'px';
    this.paginate(); this.positionOverlay(); this.changed();
  };
  Editor.prototype.deleteImage = function () {
    var img = this.selImg; if (!img) return;
    this.pushUndo();
    this.clearImgSel();
    img.remove();
    this.ensureStructure();
    this.paginate(); this.changed();
  };
  Editor.prototype.insertImage = function (src, w, h, extra) {
    this.pushUndo();
    this.focus();
    var img = document.createElement('img');
    img.src = src;
    var maxW = this.fit ? Math.max(100, this.doc.clientWidth - 40) : this.contentWidthPx();
    var cell = this.currentCell();
    if (cell) maxW = Math.min(maxW, cell.clientWidth - 16);
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    img.style.width = Math.round(w) + 'px'; img.style.height = Math.round(h) + 'px';
    if (extra && extra.shape) img.setAttribute('data-shape', JSON.stringify(extra.shape));
    if (extra && extra.imgId) img.setAttribute('data-img', extra.imgId);
    var r = this.range();
    if (r) {
      r.deleteContents();
      r.insertNode(img);
      r.setStartAfter(img); r.collapse(true);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } else this.doc.appendChild(img);
    this.ensureStructure();
    this.paginate(); this.changed();
    this.selectImage(img);
    return img;
  };
  Editor.prototype.insertImageFile = function (file) {
    var self = this;
    file.arrayBuffer().then(function (ab) {
      var bytes = new Uint8Array(ab), mime = file.type || 'image/png';
      var id = NG.imgs.put(bytes, mime), url = NG.imgs.get(id).url;
      var probe = new Image();
      probe.onload = function () { self.insertImage(url, probe.naturalWidth, probe.naturalHeight, { imgId: id }); };
      probe.onerror = function () { self.onState({ error: '그림 파일을 읽을 수 없습니다. PNG, JPG, GIF 그림을 넣어 주세요.' }); };
      probe.src = url;
    });
  };
  /* 도형 */
  NG.shapeSvg = function (sp, w, h) {
    var sw = sp.sw || 2, f = sp.fill || 'none', s = sp.stroke || '#000000';
    var x = sw / 2, y = sw / 2, W = Math.max(1, w - sw), H = Math.max(1, h - sw);
    var body;
    switch (sp.type) {
      case 'round': body = '<rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" rx="' + Math.min(W, H) * 0.18 + '" fill="' + f + '" stroke="' + s + '" stroke-width="' + sw + '"/>'; break;
      case 'ellipse': body = '<ellipse cx="' + w / 2 + '" cy="' + h / 2 + '" rx="' + W / 2 + '" ry="' + H / 2 + '" fill="' + f + '" stroke="' + s + '" stroke-width="' + sw + '"/>'; break;
      case 'line': body = '<line x1="' + x + '" y1="' + h / 2 + '" x2="' + (w - x) + '" y2="' + h / 2 + '" stroke="' + s + '" stroke-width="' + sw + '"/>'; break;
      case 'arrow': {
        var head = Math.min(h * 0.9, sw * 5 + 8);
        body = '<line x1="' + x + '" y1="' + h / 2 + '" x2="' + (w - head) + '" y2="' + h / 2 + '" stroke="' + s + '" stroke-width="' + sw + '"/><polygon points="' + (w - head - 1) + ',' + (h / 2 - head / 2) + ' ' + w + ',' + h / 2 + ' ' + (w - head - 1) + ',' + (h / 2 + head / 2) + '" fill="' + s + '"/>';
        break;
      }
      case 'triangle': body = '<polygon points="' + w / 2 + ',' + y + ' ' + (w - x) + ',' + (h - y) + ' ' + x + ',' + (h - y) + '" fill="' + f + '" stroke="' + s + '" stroke-width="' + sw + '" stroke-linejoin="round"/>'; break;
      default: body = '<rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" fill="' + f + '" stroke="' + s + '" stroke-width="' + sw + '"/>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w) + '" height="' + Math.round(h) + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };
  Editor.prototype.insertShape = function (type) {
    var sp = { type: type, fill: type === 'line' || type === 'arrow' ? 'none' : '#DCE9E4', stroke: '#1F4E46', sw: 2 };
    var w = type === 'line' || type === 'arrow' ? 200 : 160, h = type === 'line' || type === 'arrow' ? 24 : 100;
    this.insertImage(NG.shapeSvg(sp, w, h), w, h, { shape: sp });
  };
  Editor.prototype.redrawShape = function (img) {
    var sp; try { sp = JSON.parse(img.getAttribute('data-shape')); } catch (e) { return; }
    img.src = NG.shapeSvg(sp, img.offsetWidth, img.offsetHeight);
  };
  Editor.prototype.setShape = function (patch) {
    var img = this.selImg; if (!img || !img.getAttribute('data-shape')) return;
    this.pushUndo();
    var sp = JSON.parse(img.getAttribute('data-shape'));
    Object.assign(sp, patch);
    img.setAttribute('data-shape', JSON.stringify(sp));
    this.redrawShape(img);
    this.changed();
  };
  Editor.prototype.shapeProps = function () {
    var img = this.selImg; if (!img || !img.getAttribute('data-shape')) return null;
    try { return JSON.parse(img.getAttribute('data-shape')); } catch (e) { return null; }
  };

  /* ---------- 찾기·바꾸기 ---------- */
  Editor.prototype.textNodes = function () {
    var out = [], w = document.createTreeWalker(this.doc, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  };
  Editor.prototype.find = function (q, back) {
    if (!q) return false;
    var nodes = this.textNodes(), r = this.range();
    var startNode = r ? (back ? r.startContainer : r.endContainer) : null, startOff = r ? (back ? r.startOffset : r.endOffset) : 0;
    var idx = startNode ? nodes.indexOf(startNode) : -1;
    if (startNode && idx < 0) { // 요소 위치: 그 다음 글자부터
      idx = 0; startOff = 0;
      for (var i = 0; i < nodes.length; i++) { if (startNode.compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING) { idx = i; break; } }
    }
    var n = nodes.length;
    for (var step = 0; step <= n; step++) {
      var j = back ? ((idx < 0 ? n - 1 : idx) - step + n) % n : ((idx < 0 ? 0 : idx) + step) % n;
      var t = nodes[j].nodeValue, pos;
      if (back) pos = t.lastIndexOf(q, step === 0 && idx >= 0 ? startOff - 1 - q.length + 1 : t.length);
      else pos = t.indexOf(q, step === 0 && idx >= 0 ? startOff : 0);
      if (step === 0 && back && pos >= startOff) pos = -1;
      if (pos >= 0) {
        var rg = document.createRange(); rg.setStart(nodes[j], pos); rg.setEnd(nodes[j], pos + q.length);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg);
        var el = nodes[j].parentElement;
        var rect = rg.getBoundingClientRect(), dr = this.desk.getBoundingClientRect();
        if (rect.top < dr.top + 40 || rect.bottom > dr.bottom - 40) this.desk.scrollBy({ top: rect.top - dr.top - dr.height / 3 });
        return true;
      }
    }
    return false;
  };
  Editor.prototype.replaceOne = function (q, rep) {
    var r = this.range();
    if (r && r.toString() === q) {
      this.pushUndo();
      document.execCommand('insertText', false, rep);
      this.schedule(); this.changed();
    }
    return this.find(q);
  };
  Editor.prototype.replaceAll = function (q, rep) {
    if (!q) return 0;
    this.pushUndo();
    var count = 0;
    this.textNodes().forEach(function (n) {
      var parts = n.nodeValue.split(q);
      if (parts.length > 1) { count += parts.length - 1; n.nodeValue = parts.join(rep); }
    });
    this.paginate(); this.changed();
    return count;
  };

  Editor.prototype.stats = function () {
    var t = this.doc.innerText || '';
    return { chars: t.replace(/\s/g, '').length, withSpace: t.replace(/\n/g, '').length };
  };
})(NG);
