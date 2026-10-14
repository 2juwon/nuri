/* 누리글 — 공통 도구: 단위, 글꼴, 바이너리 읽기, CFB(복합 문서) 읽기 */
var NG = (typeof globalThis !== 'undefined' && globalThis.NG) ? globalThis.NG : (globalThis.NG = {});

(function (NG) {
  'use strict';

  /* ---------- 단위 ----------
     HWPUNIT(HU): 1/7200 인치. 1pt = 100HU, 1mm ≈ 283.465HU, CSS 1px = 75HU */
  NG.HU_PER_PX = 75;
  NG.HU_PER_MM = 7200 / 25.4;
  NG.huToPx = function (hu) { return hu / 75; };
  NG.pxToHu = function (px) { return Math.round(px * 75); };
  NG.huToMm = function (hu) { return hu / NG.HU_PER_MM; };
  NG.mmToHu = function (mm) { return Math.round(mm * NG.HU_PER_MM); };

  NG.PAPERS = {
    A4: { name: 'A4 (210×297mm)', w: 59528, h: 84186 },
    A3: { name: 'A3 (297×420mm)', w: 84188, h: 119055 },
    B5: { name: 'B5 (182×257mm)', w: 51592, h: 72852 },
    B4: { name: 'B4 (257×364mm)', w: 72852, h: 103181 },
    LETTER: { name: '레터 (216×279mm)', w: 61200, h: 79200 }
  };

  NG.defaultPage = function () {
    return {
      width: 59528, height: 84186, landscape: false,
      margin: { left: 8504, right: 8504, top: 5668, bottom: 4252, header: 4252, footer: 4252, gutter: 0 }
    };
  };

  /* ---------- 색 ---------- */
  NG.colorRefToHex = function (c) { // 0x00BBGGRR
    if (c === undefined || c === null) return null;
    c = c >>> 0;
    if (c === 0xFFFFFFFF) return null;
    var r = c & 0xFF, g = (c >> 8) & 0xFF, b = (c >> 16) & 0xFF;
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('').toUpperCase();
  };
  NG.cssColorToHex = function (s) {
    if (!s) return null;
    s = String(s).trim();
    if (s === 'transparent' || s === 'none') return null;
    var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
      return '#' + h.toUpperCase();
    }
    m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
    if (m) {
      if (m[4] !== undefined) {
        var a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        if (a === 0) return null;
      }
      return '#' + [m[1], m[2], m[3]].map(function (v) { return Math.round(+v).toString(16).padStart(2, '0'); }).join('').toUpperCase();
    }
    return null;
  };

  /* ---------- 글꼴 ----------
     한글 문서의 글꼴 이름은 그대로 두고, 컴퓨터에 없을 때 쓸 웹 글꼴을 뒤에 붙인다 */
  var SERIF = ['바탕', '함초롬바탕', '신명조', '명조', '휴먼명조', '한양신명조', 'HY신명조', '나눔명조', 'Batang', '궁서', '새바탕', '한컴바탕', '조선일보명조', 'KoPub바탕', '바탕체'];
  NG.isSerifFont = function (name) {
    if (!name) return true;
    if (/명조|바탕|궁서|serif|Myeongjo|Batang|Times/i.test(name) && !/sans/i.test(name)) return true;
    return SERIF.indexOf(name) >= 0;
  };
  NG.fontStack = function (name) {
    name = (name || '함초롬바탕').replace(/["']/g, '');
    var fb = NG.isSerifFont(name) ? '"Nanum Myeongjo", "Noto Serif KR", serif' : '"Nanum Gothic", "Noto Sans KR", sans-serif';
    return '"' + name + '", ' + fb;
  };
  NG.firstFontName = function (stack) {
    if (!stack) return null;
    var m = String(stack).match(/^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/);
    if (!m) return null;
    return (m[1] || m[2] || m[3] || '').trim();
  };
  NG.FONTS = ['함초롬바탕', '함초롬돋움', '맑은 고딕', '바탕', '돋움', '굴림', '궁서', '나눔고딕', '나눔명조', '휴먼명조', 'HY헤드라인M', '한컴 고딕'];
  NG.DEFAULT_FONT = '함초롬바탕';
  NG.DEFAULT_SIZE = 1000; // HU, 10pt

  /* ---------- 바이너리 읽기 ---------- */
  function Cursor(u8, pos) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.pos = pos || 0;
  }
  Cursor.prototype = {
    get left() { return this.u8.length - this.pos; },
    u8v: function () { var v = this.dv.getUint8(this.pos); this.pos += 1; return v; },
    i8: function () { var v = this.dv.getInt8(this.pos); this.pos += 1; return v; },
    u16: function () { var v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; },
    i16: function () { var v = this.dv.getInt16(this.pos, true); this.pos += 2; return v; },
    u32: function () { var v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; },
    i32: function () { var v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; },
    skip: function (n) { this.pos += n; return this; },
    wstr: function () { // WORD 길이 + WCHAR
      var n = this.u16(); var s = '';
      for (var i = 0; i < n; i++) s += String.fromCharCode(this.u16());
      return s;
    },
    bytes: function (n) { var b = this.u8.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  };
  NG.Cursor = Cursor;

  /* ---------- CFB(OLE 복합 문서) 읽기 ---------- */
  NG.readCFB = function (u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    for (var i = 0; i < 8; i++) if (u8[i] !== sig[i]) throw new Error('NOT_CFB');
    var secShift = dv.getUint16(0x1E, true), miniShift = dv.getUint16(0x20, true);
    var secSize = 1 << secShift, miniSize = 1 << miniShift;
    var nFat = dv.getUint32(0x2C, true), firstDir = dv.getUint32(0x30, true);
    var cutoff = dv.getUint32(0x38, true);
    var firstMiniFat = dv.getUint32(0x3C, true), nMiniFat = dv.getUint32(0x40, true);
    var firstDifat = dv.getUint32(0x44, true), nDifat = dv.getUint32(0x48, true);
    var ENDCHAIN = 0xFFFFFFFE, FREE = 0xFFFFFFFF;

    function secOff(n) { return (n + 1) * secSize; }
    var difat = [];
    for (i = 0; i < 109; i++) difat.push(dv.getUint32(0x4C + i * 4, true));
    var d = firstDifat, guard = 0;
    while (d !== ENDCHAIN && d !== FREE && guard++ < nDifat + 5) {
      var off = secOff(d), per = secSize / 4 - 1;
      for (i = 0; i < per; i++) difat.push(dv.getUint32(off + i * 4, true));
      d = dv.getUint32(off + per * 4, true);
    }
    var fatSecs = difat.filter(function (x) { return x !== FREE && x !== ENDCHAIN; }).slice(0, nFat);
    var fat = new Uint32Array(fatSecs.length * secSize / 4);
    fatSecs.forEach(function (s, k) {
      var o = secOff(s);
      for (var j = 0; j < secSize / 4; j++) {
        if (o + j * 4 + 4 <= u8.length) fat[k * secSize / 4 + j] = dv.getUint32(o + j * 4, true);
        else fat[k * secSize / 4 + j] = ENDCHAIN;
      }
    });
    function chain(start) {
      var out = [], s = start, g = 0;
      while (s !== ENDCHAIN && s !== FREE && s < fat.length && g++ < fat.length + 1) { out.push(s); s = fat[s]; }
      return out;
    }
    function readChain(start, size) {
      var secs = chain(start);
      var buf = new Uint8Array(secs.length * secSize);
      secs.forEach(function (s, k) {
        var o = secOff(s);
        buf.set(u8.subarray(o, Math.min(o + secSize, u8.length)), k * secSize);
      });
      return size !== undefined ? buf.subarray(0, Math.min(size, buf.length)) : buf;
    }
    var dirBuf = readChain(firstDir);
    var entries = [];
    for (i = 0; i + 128 <= dirBuf.length; i += 128) {
      var e = new DataView(dirBuf.buffer, dirBuf.byteOffset + i, 128);
      var nameLen = e.getUint16(64, true), name = '';
      for (var c = 0; c < Math.max(0, nameLen / 2 - 1); c++) name += String.fromCharCode(e.getUint16(c * 2, true));
      entries.push({
        name: name, type: e.getUint8(66),
        left: e.getUint32(68, true), right: e.getUint32(72, true), child: e.getUint32(76, true),
        start: e.getUint32(116, true), size: e.getUint32(120, true)
      });
    }
    var root = entries[0];
    var miniStream = root && root.start !== ENDCHAIN ? readChain(root.start, root.size) : new Uint8Array(0);
    var miniFat = [];
    if (nMiniFat && firstMiniFat !== ENDCHAIN) {
      var mf = readChain(firstMiniFat);
      var mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
      for (i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mdv.getUint32(i, true));
    }
    function readMini(start, size) {
      var out = new Uint8Array(size), s = start, p = 0, g = 0;
      while (s !== ENDCHAIN && s !== FREE && p < size && g++ < miniFat.length + 1) {
        var n = Math.min(miniSize, size - p);
        out.set(miniStream.subarray(s * miniSize, s * miniSize + n), p);
        p += n; s = miniFat[s];
      }
      return out;
    }
    var files = {};
    function walk(id, prefix, depth) {
      if (id === FREE || id >= entries.length || depth > 64) return;
      var en = entries[id];
      walk(en.left, prefix, depth + 1);
      walk(en.right, prefix, depth + 1);
      var path = prefix ? prefix + '/' + en.name : en.name;
      if (en.type === 2) {
        files[path] = en.size < cutoff ? readMini(en.start, en.size) : readChain(en.start, en.size);
      } else if (en.type === 1) {
        walk(en.child, path, depth + 1);
      }
    }
    if (root) walk(root.child, '', 0);
    return files;
  };

  /* zip/압축 해제 도구는 환경에서 주입: 브라우저는 pako·JSZip 전역, node 테스트는 require */
  NG.lib = NG.lib || {};
  NG.inflateRaw = function (u8) {
    var pako = NG.lib.pako || (typeof globalThis.pako !== 'undefined' ? globalThis.pako : null);
    return pako.inflateRaw(u8);
  };

  NG.esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
})(NG);
