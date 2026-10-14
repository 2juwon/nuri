/* 누리글 — 한글 5.0 바이너리(.hwp) 읽기 → 공통 문서 모델 */
(function (NG) {
  'use strict';
  var T = {
    DOC_PROPS: 16, ID_MAPPINGS: 17, BIN_DATA: 18, FACE_NAME: 19, BORDER_FILL: 20, CHAR_SHAPE: 21,
    PARA_SHAPE: 25,
    PARA_HEADER: 66, PARA_TEXT: 67, PARA_CHAR_SHAPE: 68, CTRL_HEADER: 71, LIST_HEADER: 72, PAGE_DEF: 73,
    SHAPE_COMPONENT: 76, TABLE: 77, SC_PICTURE: 85, SC_CONTAINER: 86, EQEDIT: 88
  };
  var CHAR_CTRL = { 0: 1, 10: 1, 13: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 1, 29: 1, 30: 1, 31: 1 };
  var EXT_CTRL = { 1: 1, 2: 1, 3: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 21: 1, 22: 1, 23: 1 };
  var ALIGN = ['justify', 'left', 'right', 'center', 'distribute', 'distribute'];
  var LINE = ['NONE', 'SOLID', 'DOT', 'DASH', 'DASH_DOT', 'DASH_DOT_DOT', 'LONG_DASH', 'CIRCLE', 'DOUBLE_SLIM', 'SLIM_THICK', 'THICK_SLIM', 'SLIM_THICK_SLIM', 'WAVE', 'DOUBLE_WAVE', 'THICK_3D', 'THICK_3D_REVERS', '3D', '3D_REVERS'];
  var WIDTH = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  var MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', wmf: 'image/wmf', emf: 'image/emf', tif: 'image/tiff', tiff: 'image/tiff' };

  function records(u8) {
    var out = [], c = new NG.Cursor(u8), n = 0;
    while (c.left >= 4 && n++ < 4000000) {
      var h = c.u32();
      var tag = h & 0x3FF, level = (h >>> 10) & 0x3FF, size = h >>> 20;
      if (size === 0xFFF) { if (c.left < 4) break; size = c.u32(); }
      if (size > c.left) size = c.left;
      out.push({ tag: tag, level: level, data: c.bytes(size) });
    }
    return out;
  }
  function ctrlId(v) { return String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }

  function inflateMaybe(u8, compressed) {
    if (!compressed) return u8;
    try { return NG.inflateRaw(u8); } catch (e) { return u8; }
  }

  function parseDocInfo(recs) {
    var info = { counts: [], fonts: [], charShapes: [], paraShapes: [], borderFills: [null], bins: [] };
    var faceAll = [];
    recs.forEach(function (r) {
      var c = new NG.Cursor(r.data);
      try {
        switch (r.tag) {
          case T.ID_MAPPINGS:
            while (c.left >= 4) info.counts.push(c.i32());
            break;
          case T.BIN_DATA: {
            var props = c.u16(), kind = props & 0xF, item = { kind: kind, comp: (props >> 4) & 3 };
            if (kind === 0) { item.abs = c.wstr(); item.rel = c.wstr(); }
            else { item.id = c.u16(); item.ext = c.left >= 2 ? c.wstr().toLowerCase() : ''; }
            info.bins.push(item);
            break;
          }
          case T.FACE_NAME: { c.u8v(); faceAll.push(c.wstr()); break; }
          case T.BORDER_FILL: {
            c.u16();
            var lines = [];
            for (var i = 0; i < 5; i++) lines.push({ type: LINE[c.u8v()] || 'SOLID', width: WIDTH[c.u8v()] || 0.12, color: NG.colorRefToHex(c.u32()) || '#000000' });
            var bf = { l: lines[0], r: lines[1], t: lines[2], b: lines[3], bg: null };
            if (c.left >= 4) {
              var fk = c.u32();
              if (fk & 1) { bf.bg = NG.colorRefToHex(c.u32()); c.u32(); c.i32(); }
            }
            info.borderFills.push(bf);
            break;
          }
          case T.CHAR_SHAPE: {
            var ids = []; for (i = 0; i < 7; i++) ids.push(c.u16());
            c.skip(7 * 4);
            var height = c.i32(), p = c.u32(); c.skip(2);
            var color = c.u32(), ucolor = c.u32(), shade = c.u32();
            var ul = (p >> 2) & 3;
            info.charShapes.push({
              fontId: ids[0], size: height,
              italic: !!(p & 1), bold: !!(p & 2),
              underline: ul === 1 || ul === 3, strike: ul === 2 || ((p >> 18) & 7) !== 0,
              sup: !!(p & (1 << 15)), sub: !!(p & (1 << 16)),
              color: NG.colorRefToHex(color) || '#000000', shade: NG.colorRefToHex(shade)
            });
            break;
          }
          case T.PARA_SHAPE: {
            var p1 = c.u32();
            var left = c.i32(), right = c.i32(), indent = c.i32(), prev = c.i32(), next = c.i32(), lsOld = c.i32();
            c.u16(); c.u16(); var bfid = c.u16(); c.skip(8);
            var p2 = c.left >= 4 ? c.u32() : 0, p3 = null, ls = null;
            if (c.left >= 8) { p3 = c.u32(); ls = c.u32(); }
            var lsType = p3 !== null ? (p3 & 31) : (p1 & 3);
            var lsVal = ls !== null ? ls : lsOld;
            info.paraShapes.push({
              align: ALIGN[(p1 >> 2) & 7] || 'justify',
              left: left / 2, right: right / 2, indent: indent / 2, before: prev / 2, after: next / 2,
              lsType: ['percent', 'fixed', 'between', 'atleast'][lsType] || 'percent',
              lsValue: lsType === 0 ? lsVal : lsVal / 2,
              pageBreakBefore: !!(p1 & (1 << 19))
            });
            break;
          }
        }
      } catch (e) { /* 손상된 레코드는 건너뜀 */ }
    });
    var nb = info.counts[0] || 0, nh = info.counts[1] || 0;
    info.fonts = faceAll.slice(0, nh);
    return info;
  }

  function Reader(doc, info, bins) {
    this.doc = doc; this.info = info; this.bins = bins;
  }
  Reader.prototype.charShape = function (id) {
    var s = this.info.charShapes[id] || this.info.charShapes[0] || { size: 1000, color: '#000000' };
    var cs = {
      font: this.info.fonts[s.fontId] || NG.DEFAULT_FONT, size: s.size || 1000,
      bold: s.bold, italic: s.italic, underline: s.underline, strike: s.strike,
      color: s.color, shade: s.shade, sup: s.sup, sub: s.sub
    };
    return cs;
  };
  Reader.prototype.paraShape = function (id) {
    var s = this.info.paraShapes[id] || { align: 'justify', left: 0, right: 0, indent: 0, before: 0, after: 0, lsType: 'percent', lsValue: 160 };
    return { align: s.align, left: s.left, right: s.right, indent: s.indent, before: s.before, after: s.after, lsType: s.lsType, lsValue: s.lsValue, pageBreak: s.pageBreakBefore };
  };
  Reader.prototype.borderFill = function (id) {
    return this.info.borderFills[id] || null;
  };

  /* 같은 수준의 문단 count개 읽기. i: 시작 위치, 반환 [blocks, 다음 위치] */
  Reader.prototype.paras = function (recs, i, count) {
    var blocks = [], level = recs[i] ? recs[i].level : 0, n = 0;
    while (i < recs.length && recs[i].tag === T.PARA_HEADER && recs[i].level === level && (count === undefined || n < count)) {
      var res = this.para(recs, i);
      Array.prototype.push.apply(blocks, res[0]);
      i = res[1]; n++;
    }
    return [blocks, i];
  };

  Reader.prototype.para = function (recs, i) {
    var head = recs[i], L = head.level, hc = new NG.Cursor(head.data);
    hc.u32(); hc.u32();
    var psId = hc.u16(); hc.u8v(); var brk = hc.u8v();
    var j = i + 1, text = null, csList = [], ctrls = [];
    while (j < recs.length && recs[j].level > L) {
      var r = recs[j];
      if (r.level === L + 1) {
        if (r.tag === T.PARA_TEXT) text = r.data;
        else if (r.tag === T.PARA_CHAR_SHAPE) {
          var cc = new NG.Cursor(r.data);
          while (cc.left >= 8) csList.push([cc.u32(), cc.u32()]);
        } else if (r.tag === T.CTRL_HEADER) {
          var k = j + 1;
          while (k < recs.length && recs[k].level > L + 1) k++;
          ctrls.push({ head: r, kids: recs.slice(j + 1, k) });
          j = k; continue;
        }
      }
      j++;
    }
    var ps = this.paraShape(psId);
    if (brk & 0x05) ps.pageBreak = true;
    var para = { t: 'p', ps: ps, runs: [] }, extra = [], after = [];
    var self = this, ctrlIdx = 0;
    var curCs = -1, buf = '';
    function csAt(pos) {
      var id = csList.length ? csList[0][1] : 0;
      for (var q = 0; q < csList.length; q++) if (csList[q][0] <= pos) id = csList[q][1]; else break;
      return id;
    }
    function flush() {
      if (buf) { para.runs.push({ t: 'text', text: buf, cs: self.charShape(curCs) }); buf = ''; }
    }
    if (text) {
      var u = new NG.Cursor(text), pos = 0;
      while (u.left >= 2) {
        var ch = u.u16();
        if (ch < 32) {
          if (CHAR_CTRL[ch]) {
            if (ch === 10) { flush(); para.runs.push({ t: 'br' }); }
            else if (ch === 24) buf += '-';
            else if (ch === 30 || ch === 31) { var id0 = csAt(pos); if (id0 !== curCs) { flush(); curCs = id0; } buf += ' '; }
            pos += 1;
          } else {
            u.skip(14);
            if (ch === 9) { flush(); para.runs.push({ t: 'tab', cs: self.charShape(csAt(pos)) }); }
            else if (EXT_CTRL[ch]) {
              var ctrl = ctrls[ctrlIdx++];
              if (ctrl) { flush(); self.control(ctrl, para, extra, after, csAt(pos)); }
            }
            pos += 8;
          }
          continue;
        }
        var id = csAt(pos);
        if (id !== curCs) { flush(); curCs = id; }
        buf += String.fromCharCode(ch);
        pos += 1;
      }
      flush();
    }
    // 남은 컨트롤(문자 위치 없이 들어온 것)
    while (ctrlIdx < ctrls.length) this.control(ctrls[ctrlIdx++], para, extra, after, 0);
    if (!para.runs.length && csList.length) para.endCs = this.charShape(csList[0][1]);
    var out = [];
    var hasContent = para.runs.some(function (r) { return r.t !== 'text' || r.text.trim(); });
    if (extra.length && !hasContent) {
      // 표만 있는 문단: 쪽 나눔 정보는 표 앞으로
      if (ps.pageBreak) extra[0].pageBreak = true;
      out = extra;
    } else {
      out = [para].concat(extra);
    }
    return [out.concat(after), j];
  };

  Reader.prototype.control = function (ctrl, para, extra, after, csId) {
    var c = new NG.Cursor(ctrl.head.data), id = ctrlId(c.u32()), kids = ctrl.kids, self = this, doc = this.doc;
    if (id === 'secd') {
      kids.forEach(function (r) {
        if (r.tag === T.PAGE_DEF && !doc._pageSet) {
          var p = new NG.Cursor(r.data);
          var v = []; for (var q = 0; q < 10 && p.left >= 4; q++) v.push(p.u32());
          var landscape = !!(v[9] & 1);
          doc.page = {
            width: v[0], height: v[1], landscape: landscape,
            margin: { left: v[2], right: v[3], top: v[4], bottom: v[5], header: v[6], footer: v[7], gutter: v[8] }
          };
          if (landscape && v[0] < v[1]) { doc.page.width = v[1]; doc.page.height = v[0]; }
          doc._pageSet = true;
        }
      });
    } else if (id === 'head' || id === 'foot') {
      var key = id === 'head' ? 'header' : 'footer';
      var li = kids.findIndex(function (r) { return r.tag === T.LIST_HEADER; });
      if (li >= 0 && !doc[key]) {
        var res = this.paras(kids, li + 1);
        doc[key] = { blocks: res[0] };
      }
    } else if (id === 'pgnp') {
      if (!doc.pageNum) {
        var props = c.u32(); c.u16(); c.u16(); c.u16(); var side = c.left >= 2 ? c.u16() : 0;
        var POS = ['NONE', 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT', 'OUTSIDE_TOP', 'OUTSIDE_BOTTOM', 'INSIDE_TOP', 'INSIDE_BOTTOM'];
        var pos = POS[(props >> 8) & 15] || 'BOTTOM_CENTER';
        if (pos !== 'NONE') doc.pageNum = { pos: pos.replace('OUTSIDE', 'BOTTOM').replace('INSIDE', 'BOTTOM'), side: side ? String.fromCharCode(side) : '' };
      }
    } else if (id === 'tbl ') {
      var t = this.table(c, kids);
      if (t) extra.push(t);
    } else if (id === 'gso ') {
      this.gso(c, kids, para, extra);
    } else if (id === 'eqed') {
      kids.forEach(function (r) {
        if (r.tag === T.EQEDIT) {
          var e = new NG.Cursor(r.data); e.u32(); var script = e.wstr();
          var cs = self.charShape(csId); cs.italic = true;
          para.runs.push({ t: 'text', text: script, cs: cs });
        }
      });
    } else if (id === 'tdut' || id === 'tcps') {
      try { var tx = c.wstr(); if (tx) para.runs.push({ t: 'text', text: tx, cs: self.charShape(csId) }); } catch (e) { }
    } else if (id === 'fn  ' || id === 'en  ') {
      // 각주·미주: 본문에 번호 대신 [주]로 표시, 내용은 문단 뒤에 작게
      var li2 = kids.findIndex(function (r) { return r.tag === T.LIST_HEADER; });
      var n = (doc._noteNo = (doc._noteNo || 0) + 1);
      var cs2 = self.charShape(csId); cs2.sup = true;
      para.runs.push({ t: 'text', text: n + ')', cs: cs2 });
      if (li2 >= 0) {
        var nb = this.paras(kids, li2 + 1)[0];
        nb.forEach(function (b, k) {
          if (b.t === 'p') {
            if (k === 0) b.runs.unshift({ t: 'text', text: n + ') ', cs: (b.runs[0] && b.runs[0].cs) || self.charShape(0) });
            b.runs.forEach(function (r) { if (r.cs) r.cs.size = Math.round(r.cs.size * 0.9); });
          }
        });
        doc._notes = (doc._notes || []).concat(nb);
      }
    }
  };

  function objCommon(c) {
    var o = { props: 0, w: 0, h: 0, margins: [0, 0, 0, 0] };
    if (c.left < 36) return o;
    o.props = c.u32(); o.vOff = c.i32(); o.hOff = c.i32(); o.w = c.u32(); o.h = c.u32(); c.i32();
    o.margins = [c.i16(), c.i16(), c.i16(), c.i16()];
    o.inline = !!(o.props & 1);
    o.wrap = (o.props >> 21) & 7;
    o.horzRel = (o.props >> 8) & 3;
    o.horzAlign = (o.props >> 10) & 7;
    return o;
  }

  Reader.prototype.table = function (c, kids) {
    var obj = objCommon(c);
    var L = kids.length ? kids[0].level : 0;
    var i = 0, tp = null, cells = [], caption = null, self = this;
    while (i < kids.length) {
      var r = kids[i];
      if (r.level !== L) { i++; continue; }
      if (r.tag === T.TABLE) {
        var tc = new NG.Cursor(r.data);
        tp = { props: tc.u32(), rows: tc.u16(), cols: tc.u16(), spacing: tc.u16(), inner: [tc.u16(), tc.u16(), tc.u16(), tc.u16()] };
        tc.skip(tp.rows * 2);
        tp.bf = tc.left >= 2 ? tc.u16() : 0;
        i++;
      } else if (r.tag === T.LIST_HEADER) {
        var lc = new NG.Cursor(r.data);
        var nPara = lc.u16(), lprops = lc.u32();
        if (!tp) { // 캡션
          lc.u16();
          var res0 = this.paras(kids, i + 1, nPara);
          caption = res0[0]; i = res0[1];
          continue;
        }
        lc.u16();
        var cell = { c: lc.u16(), r: lc.u16(), cs: lc.u16(), rs: lc.u16(), w: lc.u32(), h: lc.u32() };
        cell.margin = [lc.i16(), lc.i16(), lc.i16(), lc.i16()];
        var bfid = lc.left >= 2 ? lc.u16() : 0;
        cell.bf = self.borderFill(bfid);
        cell.valign = ['top', 'middle', 'bottom'][(lprops >> 21) & 3] || 'middle';
        var res = this.paras(kids, i + 1, nPara);
        cell.blocks = res[0];
        if (!cell.blocks.length) cell.blocks = [{ t: 'p', ps: this.paraShape(0), runs: [] }];
        cells.push(cell); i = res[1];
      } else i++;
    }
    if (!tp) return null;
    return buildTable(tp.rows, tp.cols, cells, obj.w, { inline: obj.inline, align: obj.horzAlign === 1 ? 'center' : obj.horzAlign === 2 ? 'right' : 'left', caption: caption });
  };

  function buildTable(rows, cols, cells, width, opt) {
    // 열 너비: 한 칸짜리 셀에서 먼저 구하고, 모자라면 병합 셀로 나눔
    var cw = new Array(cols).fill(0);
    cells.forEach(function (c) { if (c.cs === 1 && c.c < cols && c.w > cw[c.c]) cw[c.c] = c.w; });
    cells.forEach(function (c) {
      if (c.cs > 1) {
        var known = 0, unknown = [];
        for (var k = c.c; k < c.c + c.cs && k < cols; k++) { if (cw[k]) known += cw[k]; else unknown.push(k); }
        if (unknown.length) {
          var each = Math.max(0, (c.w - known) / unknown.length);
          unknown.forEach(function (k) { cw[k] = each || 0; });
        }
      }
    });
    var total = cw.reduce(function (a, b) { return a + b; }, 0) || width || cols * 8000;
    if (cw.some(function (x) { return !x; })) {
      var miss = cw.filter(function (x) { return !x; }).length;
      var rest = Math.max(total - cw.reduce(function (a, b) { return a + b; }, 0), miss * 2000);
      cw = cw.map(function (x) { return x || rest / miss; });
    }
    var grid = [];
    for (var r = 0; r < rows; r++) grid.push([]);
    cells.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    cells.forEach(function (c) { if (grid[c.r]) grid[c.r].push(c); });
    var rh = new Array(rows).fill(0);
    cells.forEach(function (c) { if (c.rs === 1 && c.r < rows) rh[c.r] = Math.max(rh[c.r], c.h); });
    return { t: 'table', cols: cw.map(Math.round), rows: grid, rowH: rh, inline: opt.inline, align: opt.align || 'left', caption: opt.caption || null };
  }
  NG.buildTable = buildTable;

  Reader.prototype.gso = function (c, kids, para, extra) {
    var obj = objCommon(c), self = this;
    var pics = [], texts = [];
    var shapeSize = null, style = null;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i];
      if (r.tag === T.SHAPE_COMPONENT && !shapeSize) {
        try {
          var sc = new NG.Cursor(r.data); sc.u32(); sc.u32(); sc.i32(); sc.i32(); sc.u16(); sc.u16(); sc.u32(); sc.u32();
          shapeSize = [sc.u32(), sc.u32()];
          sc.u32(); sc.i16(); sc.i32(); sc.i32();
          var pairs = sc.u16(); sc.skip((1 + 2 * pairs) * 48);
          if (sc.left >= 13) {
            var lc = sc.u32(), lw = sc.i32(), lp = sc.u32(); sc.u8v();
            var lt = LINE[lp & 63] || 'SOLID';
            style = { line: { type: lt, width: Math.max(0.1, lw / NG.HU_PER_MM), color: NG.colorRefToHex(lc) || '#000000' }, bg: null };
            if (sc.left >= 4) { var fk = sc.u32(); if (fk & 1) style.bg = NG.colorRefToHex(sc.u32()); }
          }
        } catch (e) { }
      }
      if (r.tag === T.SC_PICTURE) {
        try {
          var pc = new NG.Cursor(r.data);
          pc.skip(12 + 32 + 16 + 8 + 3);
          pics.push(pc.u16());
        } catch (e) { }
      } else if (r.tag === T.LIST_HEADER) {
        var nPara = new NG.Cursor(r.data).u16();
        var res = this.paras(kids, i + 1, nPara);
        texts = texts.concat(res[0]);
        i = res[1] - 1;
      }
    }
    var w = obj.w || (shapeSize && shapeSize[0]) || 10000, h = obj.h || (shapeSize && shapeSize[1]) || 10000;
    pics.forEach(function (binId, k) {
      var key = self.bins(binId);
      if (!key) return;
      var img = { t: 'img', bin: key, w: pics.length > 1 ? w / pics.length : w, h: h };
      if (obj.inline) img.wrap = 'inline';
      else if (obj.wrap === 0 || obj.wrap === 1 || obj.wrap >= 4) img.wrap = obj.horzAlign === 2 ? 'right' : obj.horzAlign === 1 ? 'block' : 'left';
      else img.wrap = 'block';
      if (!obj.inline && obj.wrap >= 4) img.overlay = true;
      if (img.wrap === 'block') img.align = obj.horzAlign === 1 ? 'center' : obj.horzAlign === 2 ? 'right' : 'left';
      para.runs.push(img);
    });
    if (texts.length) {
      var ln = style ? style.line : { type: 'NONE' };
      extra.push({ t: 'box', blocks: texts, w: w, bf: { l: ln, r: ln, t: ln, b: ln, bg: style ? style.bg : null } });
    }
  };

  NG.readHwp = function (u8) {
    var files = NG.readCFB(u8);
    var fh = files['FileHeader'];
    if (!fh) throw new Error('한글 문서가 아닙니다.');
    var sig = ''; for (var i = 0; i < 17; i++) sig += String.fromCharCode(fh[i]);
    if (sig !== 'HWP Document File') throw new Error('한글 문서가 아닙니다.');
    var flags = new DataView(fh.buffer, fh.byteOffset, fh.byteLength).getUint32(36, true);
    if (flags & 2) throw new Error('암호가 걸린 문서는 열 수 없습니다.');
    if (flags & 4) throw new Error('배포용 문서는 열 수 없습니다. 한글에서 배포용 해제 후 다시 저장해 주세요.');
    var compressed = !!(flags & 1);
    var info = parseDocInfo(records(inflateMaybe(files['DocInfo'], compressed)));
    var doc = { page: NG.defaultPage(), header: null, footer: null, pageNum: null, blocks: [], bins: {}, warnings: [] };
    var binMap = {};
    var binsFn = function (binId) {
      if (binMap[binId] !== undefined) return binMap[binId];
      var item = info.bins.filter(function (b) { return b.id === binId; })[0] || info.bins[binId - 1];
      if (!item || item.kind === 0) { binMap[binId] = null; return null; }
      var name = 'BIN' + item.id.toString(16).toUpperCase().padStart(4, '0') + (item.ext ? '.' + item.ext : '');
      var data = files['BinData/' + name];
      if (!data) { binMap[binId] = null; return null; }
      var comp = item.comp === 0 ? compressed : item.comp === 1;
      if (comp) { try { data = NG.inflateRaw(data); } catch (e) { } }
      var key = 'image' + item.id;
      doc.bins[key] = { mime: MIME[item.ext] || 'application/octet-stream', ext: item.ext, data: data };
      binMap[binId] = key;
      return key;
    };
    var rd = new Reader(doc, info, binsFn);
    var sec = 0;
    while (files['BodyText/Section' + sec]) {
      var recs = records(inflateMaybe(files['BodyText/Section' + sec], compressed));
      var start = 0;
      while (start < recs.length && recs[start].tag !== T.PARA_HEADER) start++;
      var res = rd.paras(recs, start);
      var blocks = res[0];
      if (sec > 0 && blocks.length) blocks[0].pageBreak = true, blocks[0].ps && (blocks[0].ps.pageBreak = true);
      doc.blocks = doc.blocks.concat(blocks);
      sec++;
    }
    if (doc._notes) { doc.blocks.push({ t: 'p', ps: rd.paraShape(0), runs: [] }); doc.blocks = doc.blocks.concat(doc._notes); }
    delete doc._notes; delete doc._noteNo; delete doc._pageSet;
    if (doc.blocks.length) { doc.blocks[0].pageBreak = false; if (doc.blocks[0].ps) doc.blocks[0].ps.pageBreak = false; }
    if (!doc.blocks.length) doc.blocks.push({ t: 'p', ps: rd.paraShape(0), runs: [] });
    return doc;
  };
})(NG);
