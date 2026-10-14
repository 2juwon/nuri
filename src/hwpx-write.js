/* 누리글 — 공통 문서 모델 → HWPX(.hwpx) 저장 */
(function (NG) {
  'use strict';
  var esc = NG.esc;
  var NS = ' xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
  var ALIGN = { justify: 'JUSTIFY', left: 'LEFT', right: 'RIGHT', center: 'CENTER', distribute: 'DISTRIBUTE' };
  var LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
  var WIDTHS = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  var LINE_TYPES = { NONE: 1, SOLID: 1, DOT: 1, DASH: 1, DASH_DOT: 1, DASH_DOT_DOT: 1, LONG_DASH: 1, CIRCLE: 1, DOUBLE_SLIM: 1, SLIM_THICK: 1, THICK_SLIM: 1, SLIM_THICK_SLIM: 1 };

  function nearestWidth(mm) {
    var best = WIDTHS[1], d = 1e9;
    WIDTHS.forEach(function (w) { if (Math.abs(w - mm) < d) { d = Math.abs(w - mm); best = w; } });
    return (best === 1 || best === 2 || best === 3 || best === 4 || best === 5 ? best.toFixed(1) : String(best)) + ' mm';
  }
  function int(v) { return Math.max(0, Math.round(+v || 0)); }
  function sint(v) { return Math.round(+v || 0); }

  /* 머리 정보(header.xml) 모음: 같은 모양은 하나로 */
  function HeaderBuilder() {
    this.fonts = ['함초롬돋움', '함초롬바탕'];
    this.charList = []; this.charMap = {};
    this.paraList = []; this.paraMap = {};
    this.bfList = []; this.bfMap = {};
    this.CHAR_BASE = 7; this.PARA_BASE = 20; this.BF_BASE = 3;
  }
  HeaderBuilder.prototype.font = function (name) {
    name = name || NG.DEFAULT_FONT;
    var i = this.fonts.indexOf(name);
    if (i < 0) { this.fonts.push(name); i = this.fonts.length - 1; }
    return i;
  };
  HeaderBuilder.prototype.charPr = function (cs) {
    cs = cs || {};
    var o = {
      f: this.font(cs.font || NG.DEFAULT_FONT), s: Math.max(100, Math.round(cs.size || NG.DEFAULT_SIZE)),
      b: !!cs.bold, i: !!cs.italic, u: !!cs.underline, k: !!cs.strike, c: (cs.color || '#000000').toUpperCase(),
      h: cs.shade ? cs.shade.toUpperCase() : 'none', sp: !!cs.sup, sb: !!cs.sub && !cs.sup
    };
    var key = JSON.stringify(o);
    if (this.charMap[key] === undefined) { this.charMap[key] = this.CHAR_BASE + this.charList.length; this.charList.push(o); }
    return this.charMap[key];
  };
  HeaderBuilder.prototype.paraPr = function (ps) {
    ps = ps || {};
    var o = {
      a: ALIGN[ps.align] || 'JUSTIFY', l: sint(ps.left), r: sint(ps.right), n: sint(ps.indent), p: sint(ps.before), x: sint(ps.after),
      lt: { percent: 'PERCENT', fixed: 'FIXED', between: 'BETWEEN_LINES', atleast: 'AT_LEAST' }[ps.lsType] || 'PERCENT',
      lv: Math.round(ps.lsValue || 160)
    };
    var key = JSON.stringify(o);
    if (this.paraMap[key] === undefined) { this.paraMap[key] = this.PARA_BASE + this.paraList.length; this.paraList.push(o); }
    return this.paraMap[key];
  };
  HeaderBuilder.prototype.borderFill = function (bf) {
    function ln(l) {
      l = l || { type: 'NONE' };
      var t = LINE_TYPES[l.type] ? l.type : 'SOLID';
      return { t: t, w: nearestWidth(l.width || 0.12), c: (l.color || '#000000').toUpperCase() };
    }
    var o = { l: ln(bf && bf.l), r: ln(bf && bf.r), t: ln(bf && bf.t), b: ln(bf && bf.b), bg: bf && bf.bg ? bf.bg.toUpperCase() : null };
    var key = JSON.stringify(o);
    if (this.bfMap[key] === undefined) { this.bfMap[key] = this.BF_BASE + this.bfList.length; this.bfList.push(o); }
    return this.bfMap[key];
  };
  function langAttrs(v) { return 'hangul="' + v + '" latin="' + v + '" hanja="' + v + '" japanese="' + v + '" other="' + v + '" symbol="' + v + '" user="' + v + '"'; }
  HeaderBuilder.prototype.xml = function (tpl) {
    var self = this;
    // 글꼴: 모든 언어 목록에 같은 글꼴을 넣는다
    var fontXml = this.fonts.map(function (f, i) {
      var serif = NG.isSerifFont(f);
      return '<hh:font id="' + i + '" face="' + esc(f) + '" type="TTF" isEmbedded="0"><hh:typeInfo familyType="' + (serif ? 'FCAT_MYUNGJO' : 'FCAT_GOTHIC') + '" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>';
    }).join('');
    var x = tpl.replace(/<hh:fontface lang="(\w+)" fontCnt="\d+">[\s\S]*?<\/hh:fontface>/g, function (m, lang) {
      return '<hh:fontface lang="' + lang + '" fontCnt="' + self.fonts.length + '">' + fontXml + '</hh:fontface>';
    });
    var bfXml = this.bfList.map(function (o, i) {
      function L(n, l) { return '<hh:' + n + ' type="' + l.t + '" width="' + l.w + '" color="' + l.c + '"/>'; }
      return '<hh:borderFill id="' + (self.BF_BASE + i) + '" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">' +
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
        L('leftBorder', o.l) + L('rightBorder', o.r) + L('topBorder', o.t) + L('bottomBorder', o.b) +
        '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>' +
        (o.bg ? '<hc:fillBrush><hc:winBrush faceColor="' + o.bg + '" hatchColor="#999999" alpha="0"/></hc:fillBrush>' : '') +
        '</hh:borderFill>';
    }).join('');
    x = x.replace(/<hh:borderFills itemCnt="(\d+)">/, function (m, n) { return '<hh:borderFills itemCnt="' + (+n + self.bfList.length) + '">'; })
      .replace('</hh:borderFills>', bfXml + '</hh:borderFills>');
    var csXml = this.charList.map(function (o, i) {
      return '<hh:charPr id="' + (self.CHAR_BASE + i) + '" height="' + o.s + '" textColor="' + o.c + '" shadeColor="' + o.h + '" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">' +
        '<hh:fontRef ' + langAttrs(o.f) + '/><hh:ratio ' + langAttrs(100) + '/><hh:spacing ' + langAttrs(0) + '/><hh:relSz ' + langAttrs(100) + '/><hh:offset ' + langAttrs(0) + '/>' +
        (o.b ? '<hh:bold/>' : '') + (o.i ? '<hh:italic/>' : '') +
        '<hh:underline type="' + (o.u ? 'BOTTOM' : 'NONE') + '" shape="SOLID" color="' + (o.u ? o.c : '#000000') + '"/>' +
        '<hh:strikeout shape="' + (o.k ? 'SOLID' : 'NONE') + '" color="' + (o.k ? o.c : '#000000') + '"/>' +
        '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>' +
        (o.sp ? '<hh:supscript/>' : '') + (o.sb ? '<hh:subscript/>' : '') +
        '</hh:charPr>';
    }).join('');
    x = x.replace(/<hh:charProperties itemCnt="(\d+)">/, function (m, n) { return '<hh:charProperties itemCnt="' + (+n + self.charList.length) + '">'; })
      .replace('</hh:charProperties>', csXml + '</hh:charProperties>');
    var psXml = this.paraList.map(function (o, i) {
      function M(k) { // k: 1(실제 값) / 2(호환용 두 배 값)
        var ls = o.lt === 'PERCENT' ? o.lv : o.lv * k;
        return '<hh:margin><hc:intent value="' + o.n * k + '" unit="HWPUNIT"/><hc:left value="' + o.l * k + '" unit="HWPUNIT"/><hc:right value="' + o.r * k + '" unit="HWPUNIT"/><hc:prev value="' + o.p * k + '" unit="HWPUNIT"/><hc:next value="' + o.x * k + '" unit="HWPUNIT"/></hh:margin>' +
          '<hh:lineSpacing type="' + o.lt + '" value="' + ls + '" unit="HWPUNIT"/>';
      }
      return '<hh:paraPr id="' + (self.PARA_BASE + i) + '" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">' +
        '<hh:align horizontal="' + o.a + '" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>' +
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
        '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
        '<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">' + M(1) + '</hp:case><hp:default>' + M(2) + '</hp:default></hp:switch>' +
        '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>';
    }).join('');
    x = x.replace(/<hh:paraProperties itemCnt="(\d+)">/, function (m, n) { return '<hh:paraProperties itemCnt="' + (+n + self.paraList.length) + '">'; })
      .replace('</hh:paraProperties>', psXml + '</hh:paraProperties>');
    return x;
  };

  function Writer(doc) {
    this.doc = doc; this.h = new HeaderBuilder(); this.pics = []; this.idSeed = 1500000000;
    this.binNames = {}; this.binList = [];
  }
  Writer.prototype.uid = function () { return String(this.idSeed++); };
  Writer.prototype.contentWidth = function () {
    var p = this.doc.page; return p.width - p.margin.left - p.margin.right;
  };
  Writer.prototype.bin = function (key) {
    if (this.binNames[key]) return this.binNames[key];
    var b = this.doc.bins[key];
    if (!b || !b.data) return null;
    var ext = (b.ext || (b.mime || '').split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
    var id = 'image' + (this.binList.length + 1);
    this.binList.push({ id: id, href: 'BinData/' + id + '.' + ext, mime: b.mime === 'image/jpeg' ? 'image/jpg' : (b.mime || 'image/png'), data: b.data });
    this.binNames[key] = id;
    return id;
  };

  Writer.prototype.runs = function (runs, endCs) {
    var self = this, out = '', cur = null, buf = '';
    function close() {
      if (cur !== null) { out += '<hp:run charPrIDRef="' + cur + '"><hp:t>' + buf + '</hp:t></hp:run>'; cur = null; buf = ''; }
    }
    var lastCs = null;
    runs.forEach(function (r) {
      if (r.t === 'text' || r.t === 'tab' || r.t === 'br') {
        var cs = r.cs || lastCs || endCs;
        var id = self.h.charPr(cs);
        if (r.cs) lastCs = r.cs;
        if (cur !== id) { close(); cur = id; }
        if (r.t === 'text') buf += esc(r.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')).replace(/\t/g, '<hp:tab width="4000" leader="0" type="1"/>').replace(/\n/g, '<hp:lineBreak/>');
        else if (r.t === 'tab') buf += '<hp:tab width="4000" leader="0" type="1"/>';
        else buf += '<hp:lineBreak/>';
      } else if (r.t === 'img') {
        close();
        var pic = self.pic(r);
        if (pic) out += '<hp:run charPrIDRef="' + self.h.charPr(lastCs || endCs) + '">' + pic + '<hp:t/></hp:run>';
      }
    });
    close();
    if (!out) out = '<hp:run charPrIDRef="' + this.h.charPr(endCs || lastCs) + '"/>';
    return out;
  };

  Writer.prototype.pic = function (r) {
    var id = this.bin(r.bin);
    if (!id) return '';
    var w = int(r.w) || 7500, h = int(r.h) || 7500;
    var dw = int(r.pxW ? r.pxW * 75 : w), dh = int(r.pxH ? r.pxH * 75 : h);
    var wrap = r.wrap || 'inline';
    var inline = wrap === 'inline';
    var textWrap = inline ? 'TOP_AND_BOTTOM' : (wrap === 'left' || wrap === 'right') ? 'SQUARE' : 'TOP_AND_BOTTOM';
    var ha = wrap === 'right' ? 'RIGHT' : wrap === 'left' ? 'LEFT' : (r.align === 'center' ? 'CENTER' : r.align === 'right' ? 'RIGHT' : 'LEFT');
    var sx = (w / dw).toFixed(6), sy = (h / dh).toFixed(6);
    var uid = this.uid();
    return '<hp:pic id="' + uid + '" zOrder="' + (this.pics.length + 1) + '" numberingType="PICTURE" textWrap="' + textWrap + '" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="' + (+uid + 7) + '" reverse="0">' +
      '<hp:offset x="0" y="0"/><hp:orgSz width="' + dw + '" height="' + dh + '"/><hp:curSz width="' + w + '" height="' + h + '"/>' +
      '<hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="' + Math.round(w / 2) + '" centerY="' + Math.round(h / 2) + '" rotateimage="1"/>' +
      '<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="' + sx + '" e2="0" e3="0" e4="0" e5="' + sy + '" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>' +
      '<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="' + dw + '" y="0"/><hc:pt2 x="' + dw + '" y="' + dh + '"/><hc:pt3 x="0" y="' + dh + '"/></hp:imgRect>' +
      '<hp:imgClip left="0" right="' + dw + '" top="0" bottom="' + dh + '"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>' +
      '<hp:imgDim dimwidth="' + dw + '" dimheight="' + dh + '"/><hc:img binaryItemIDRef="' + id + '" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>' +
      '<hp:sz width="' + w + '" widthRelTo="ABSOLUTE" height="' + h + '" heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="' + (inline ? 1 : 0) + '" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="' + (inline ? 'PARA' : 'COLUMN') + '" vertAlign="TOP" horzAlign="' + ha + '" vertOffset="0" horzOffset="0"/>' +
      '<hp:outMargin left="' + (inline ? 0 : 283) + '" right="' + (inline ? 0 : 283) + '" top="' + (inline ? 0 : 283) + '" bottom="' + (inline ? 0 : 283) + '"/>' +
      '<hp:shapeComment>그림입니다.</hp:shapeComment></hp:pic>';
  };

  Writer.prototype.para = function (b, lead) {
    var ps = b.ps || {};
    var pid = this.h.paraPr(ps);
    var pb = ps.pageBreak || b.pageBreak ? 1 : 0;
    return '<hp:p id="0" paraPrIDRef="' + pid + '" styleIDRef="0" pageBreak="' + pb + '" columnBreak="0" merged="0">' + (lead || '') + this.runs(b.runs || [], b.endCs) + '</hp:p>';
  };

  Writer.prototype.blocks = function (blocks, first) {
    var self = this, out = '';
    blocks.forEach(function (b, i) {
      var lead = first && i === 0 ? first : '';
      if (b.t === 'p') out += self.para(b, lead);
      else if (b.t === 'table') out += self.tablePara(b, lead);
      else if (b.t === 'box') {
        // 글상자는 테두리 있는 1×1 표로 옮긴다
        var w = Math.min(int(b.w) || self.contentWidth(), self.contentWidth());
        out += self.tablePara({ t: 'table', cols: [w], rowH: [0], align: 'left', pageBreak: b.pageBreak, rows: [[{ r: 0, c: 0, rs: 1, cs: 1, valign: 'top', bf: b.bf || null, blocks: b.blocks && b.blocks.length ? b.blocks : [{ t: 'p', ps: {}, runs: [] }] }]] }, lead);
      }
    });
    return out;
  };

  Writer.prototype.tablePara = function (t, lead) {
    var self = this;
    var rows = t.rows.length, cols = t.cols.length;
    var colW = t.cols.map(int);
    var rowH = (t.rowH || []).map(function (x) { return int(x) || 2400; });
    while (rowH.length < rows) rowH.push(2400);
    var width = colW.reduce(function (a, b) { return a + b; }, 0);
    var height = rowH.reduce(function (a, b) { return a + b; }, 0);
    var tableBf = this.h.borderFill({ l: { type: 'NONE' }, r: { type: 'NONE' }, t: { type: 'NONE' }, b: { type: 'NONE' } });
    var trs = t.rows.map(function (row) {
      return '<hp:tr>' + row.map(function (c) {
        var cw = 0, ch = 0, k;
        for (k = c.c; k < c.c + c.cs && k < cols; k++) cw += colW[k];
        for (k = c.r; k < c.r + c.rs && k < rows; k++) ch += rowH[k];
        var bf = self.h.borderFill(c.bf || { l: { type: 'SOLID', width: 0.12 }, r: { type: 'SOLID', width: 0.12 }, t: { type: 'SOLID', width: 0.12 }, b: { type: 'SOLID', width: 0.12 } });
        var va = { top: 'TOP', middle: 'CENTER', bottom: 'BOTTOM' }[c.valign] || 'CENTER';
        var inner = self.blocks(c.blocks && c.blocks.length ? c.blocks : [{ t: 'p', ps: {}, runs: [] }]);
        return '<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="' + bf + '">' +
          '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="' + va + '" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' + inner + '</hp:subList>' +
          '<hp:cellAddr colAddr="' + c.c + '" rowAddr="' + c.r + '"/><hp:cellSpan colSpan="' + c.cs + '" rowSpan="' + c.rs + '"/>' +
          '<hp:cellSz width="' + cw + '" height="' + ch + '"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>';
      }).join('') + '</hp:tr>';
    }).join('');
    var ha = t.align === 'center' ? 'CENTER' : t.align === 'right' ? 'RIGHT' : 'LEFT';
    var tbl = '<hp:tbl id="' + this.uid() + '" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="' + rows + '" colCnt="' + cols + '" cellSpacing="0" borderFillIDRef="' + tableBf + '" noAdjust="0">' +
      '<hp:sz width="' + width + '" widthRelTo="ABSOLUTE" height="' + height + '" heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="' + ha + '" vertOffset="0" horzOffset="0"/>' +
      '<hp:outMargin left="283" right="283" top="283" bottom="283"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' +
      trs + '</hp:tbl>';
    var pb = t.pageBreak ? 1 : 0;
    var pid = this.h.paraPr({ align: t.align === 'center' ? 'center' : t.align === 'right' ? 'right' : 'left', lsType: 'percent', lsValue: 160 });
    return '<hp:p id="0" paraPrIDRef="' + pid + '" styleIDRef="0" pageBreak="' + pb + '" columnBreak="0" merged="0">' + (lead || '') +
      '<hp:run charPrIDRef="' + this.h.charPr({}) + '">' + tbl + '<hp:t/></hp:run></hp:p>';
  };

  Writer.prototype.secPrRun = function () {
    var d = this.doc, p = d.page, m = p.margin;
    var w = p.landscape ? Math.min(p.width, p.height) : p.width, h = p.landscape ? Math.max(p.width, p.height) : p.height;
    var tpl = NG.HWPX_TEMPLATE.section;
    var sec = tpl.slice(tpl.indexOf('<hp:secPr'), tpl.indexOf('</hp:secPr>') + '</hp:secPr>'.length);
    sec = sec.replace(/<hp:pagePr [^>]*>/, '<hp:pagePr landscape="' + (p.landscape ? 'NARROWLY' : 'WIDELY') + '" width="' + int(w) + '" height="' + int(h) + '" gutterType="LEFT_ONLY">')
      .replace(/<hp:margin [^>]*\/>/, '<hp:margin header="' + int(m.header) + '" footer="' + int(m.footer) + '" gutter="0" left="' + int(m.left) + '" right="' + int(m.right) + '" top="' + int(m.top) + '" bottom="' + int(m.bottom) + '"/>');
    var ctrls = '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>';
    var self = this, tw = this.contentWidth();
    ['header', 'footer'].forEach(function (k, i) {
      var hf = d[k];
      if (!hf || !hf.blocks || !hf.blocks.length) return;
      var has = hf.blocks.some(function (b) { return b.t !== 'p' || (b.runs || []).some(function (r) { return r.t !== 'text' || r.text.trim(); }); });
      if (!has) return;
      ctrls += '<hp:ctrl><hp:' + k + ' id="' + (i + 1) + '" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="' + (k === 'header' ? 'TOP' : 'BOTTOM') + '" linkListIDRef="0" linkListNextIDRef="0" textWidth="' + int(tw) + '" textHeight="' + int(k === 'header' ? m.header : m.footer) + '" hasTextRef="0" hasNumRef="0">' +
        self.blocks(hf.blocks) + '</hp:subList></hp:' + k + '></hp:ctrl>';
    });
    if (d.pageNum && d.pageNum.pos && d.pageNum.pos !== 'NONE') {
      ctrls += '<hp:ctrl><hp:pageNum pos="' + d.pageNum.pos + '" formatType="DIGIT" sideChar="' + esc(d.pageNum.side || '') + '"/></hp:ctrl>';
    }
    return '<hp:run charPrIDRef="' + this.h.charPr({}) + '">' + sec + ctrls + '</hp:run>';
  };

  Writer.prototype.firstText = function () {
    var s = '';
    (function walk(bs) {
      bs.forEach(function (b) {
        if (s.length > 1000) return;
        if (b.t === 'p') s += (b.runs || []).map(function (r) { return r.t === 'text' ? r.text : ''; }).join('') + '\r\n';
        else if (b.blocks) walk(b.blocks);
        else if (b.rows) b.rows.forEach(function (row) { row.forEach(function (c) { walk(c.blocks || []); }); });
      });
    })(this.doc.blocks);
    return s.slice(0, 1000);
  };

  NG.writeHwpx = async function (doc, opt) {
    opt = opt || {};
    var JSZip = NG.lib.JSZip || globalThis.JSZip;
    var T = NG.HWPX_TEMPLATE, w = new Writer(doc);
    var blocks = doc.blocks && doc.blocks.length ? doc.blocks : [{ t: 'p', ps: {}, runs: [] }];
    var body = w.blocks(blocks, w.secPrRun());
    var section = XMLDECL + '<hs:sec' + NS + '>' + body + '</hs:sec>';
    var header = w.h.xml(T.header);
    var now = new Date();
    var iso = now.toISOString().replace(/\.\d+Z$/, 'Z');
    var title = esc(opt.title || '');
    var manifestItems = '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
      w.binList.map(function (b) { return '<opf:item id="' + b.id + '" href="' + b.href + '" media-type="' + b.mime + '" isEmbeded="1"/>'; }).join('') +
      '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>';
    var hpf = T.hpf
      .replace(/<opf:title\/>/, title ? '<opf:title>' + title + '</opf:title>' : '<opf:title/>')
      .replace(/synthetic-fixture-author/g, '누리글')
      .replace(/(name="CreatedDate" content="text">)[^<]*/, '$1' + iso)
      .replace(/(name="ModifiedDate" content="text">)[^<]*/, '$1' + iso)
      .replace(/(name="date" content="text">)[^<]*/, '$1' + now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일')
      .replace(/<opf:manifest>[\s\S]*<\/opf:manifest>/, '<opf:manifest>' + manifestItems + '</opf:manifest>');
    var zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    zip.file('version.xml', T.version, { compression: 'STORE' });
    zip.file('Contents/header.xml', header);
    w.binList.forEach(function (b) { zip.file(b.href, b.data, { compression: 'STORE' }); });
    zip.file('Contents/section0.xml', section);
    zip.file('Preview/PrvText.txt', w.firstText());
    zip.file('settings.xml', T.settings);
    zip.file('META-INF/container.xml', T.container);
    zip.file('Contents/content.hpf', hpf);
    zip.file('META-INF/manifest.xml', T.manifest);
    zip.file('META-INF/container.rdf', T.rdf);
    return zip.generateAsync({ type: opt.type || 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/hwp+zip' });
  };
})(NG);
