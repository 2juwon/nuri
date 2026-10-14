/* 누리글 — 화면 연결: 도구 모음, 대화 상자, 파일 열기·저장, 자동 저장 */
(function (NG) {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STORE = 'nurigeul.doc.v1';
  var FRAMED = false; try { FRAMED = window.top !== window.self; } catch (e) { FRAMED = true; }
  var IN_ARTIFACT = typeof window.claude !== 'undefined' || FRAMED;
  var narrow = window.matchMedia('(max-width: 760px)').matches;

  var ed = new NG.Editor({
    paper: $('#paper'), sheets: $('#sheets'), doc: $('#doc'), desk: $('#desk'), overlay: $('#overlay'),
    onState: function (st) { reflect(st); },
    onChange: function () { dirty(); }
  });
  NG.editor = ed;

  /* ---------- 알림 ---------- */
  var toastT;
  function toast(msg, ms) {
    var t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }
  function busy(msg) {
    var b = $('.busy');
    if (msg === false) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'busy'; b.innerHTML = '<div></div>'; document.body.appendChild(b); }
    b.firstChild.textContent = msg;
  }

  /* ---------- 펼침 메뉴 ---------- */
  var openPopEl = null;
  function closePop() { if (openPopEl) { openPopEl.remove(); openPopEl = null; } }
  function pop(anchor, build) {
    closePop();
    var p = document.createElement('div'); p.className = 'pop';
    p.addEventListener('mousedown', function (e) { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
    build(p);
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
    var top = r.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    p.style.left = left + 'px'; p.style.top = top + 'px';
    openPopEl = p;
    var first = p.querySelector('button'); if (first && !narrow) first.focus({ preventScroll: true });
    return p;
  }
  document.addEventListener('mousedown', function (e) { if (openPopEl && !openPopEl.contains(e.target)) closePop(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  function menuItem(p, label, sub, fn, icon) {
    var b = document.createElement('button'); b.className = 'mi';
    b.innerHTML = (icon ? '<svg><use href="#' + icon + '"/></svg>' : '') + '<span>' + NG.esc(label) + (sub ? '<small>' + NG.esc(sub) + '</small>' : '') + '</span>';
    b.addEventListener('click', function () { closePop(); fn(); });
    p.appendChild(b);
    return b;
  }

  var PALETTE = ['#000000', '#3F3F3F', '#7F7F7F', '#A5A5A5', '#D8D8D8', '#FFFFFF', '#1F4E79', '#2E75B6', '#9DC3E6', '#DEEBF7',
    '#C00000', '#FF0000', '#FF6A00', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#7030A0',
    '#843C0C', '#C55A11', '#F4B183', '#FBE5D6', '#FFF2CC', '#E2F0D9', '#A9D18E', '#548235', '#1E6B58', '#D7ECE4'];
  function colorPop(anchor, opts, cb) {
    pop(anchor, function (p) {
      var g = document.createElement('div'); g.className = 'swatches';
      PALETTE.forEach(function (c) {
        var s = document.createElement('button'); s.className = 'sw'; s.style.background = c; s.title = c; s.setAttribute('aria-label', c);
        s.addEventListener('click', function () { closePop(); cb(c); });
        g.appendChild(s);
      });
      p.appendChild(g);
      var row = document.createElement('div'); row.className = 'swrow';
      if (opts.none) {
        var nb = document.createElement('button'); nb.className = 'mi'; nb.style.width = 'auto'; nb.style.padding = '4px 8px'; nb.textContent = opts.none;
        nb.addEventListener('click', function () { closePop(); cb('none'); });
        row.appendChild(nb);
      }
      var lab = document.createElement('label'); lab.innerHTML = '<input type="color" value="' + (opts.value || '#1E6B58') + '"> 다른 색';
      lab.querySelector('input').addEventListener('change', function (e) { closePop(); cb(e.target.value.toUpperCase()); });
      row.appendChild(lab);
      p.appendChild(row);
    });
  }

  /* ---------- 대화 상자 ---------- */
  function dialog(title, bodyHtml, buttons, onOpen) {
    var back = document.createElement('div'); back.className = 'dlg-back';
    back.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-label="' + NG.esc(title) + '"><h2>' + NG.esc(title) + '</h2><div class="body">' + bodyHtml + '</div><div class="foot"></div></div>';
    var foot = back.querySelector('.foot');
    function close() { back.remove(); document.removeEventListener('keydown', esc); ed.focus(); }
    function esc(e) { if (e.key === 'Escape') close(); }
    buttons.forEach(function (b) {
      var el = document.createElement('button'); el.className = 'btn' + (b.primary ? ' primary' : ''); el.textContent = b.label;
      el.addEventListener('click', function () { if (b.fn && b.fn(back) === false) return; close(); });
      foot.appendChild(el);
    });
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', esc);
    document.body.appendChild(back);
    if (onOpen) onOpen(back);
    var f = back.querySelector('input,select,textarea');
    if (f && !narrow) f.focus();
    return { el: back, close: close };
  }

  /* ---------- 글꼴 목록 ---------- */
  var selFont = $('#selFont');
  NG.FONTS.forEach(function (f) { var o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = NG.fontStack(f); selFont.appendChild(o); });

  /* ---------- 선택 위치 기억 (도구를 누르면 편집 영역 밖으로 초점이 가므로) ---------- */
  var savedRange = null;
  document.addEventListener('selectionchange', function () {
    var s = window.getSelection();
    if (s.rangeCount && ed.doc.contains(s.getRangeAt(0).commonAncestorContainer)) savedRange = s.getRangeAt(0).cloneRange();
  });
  function restoreRange() {
    var s = window.getSelection();
    if (s.rangeCount && ed.doc.contains(s.getRangeAt(0).commonAncestorContainer)) return;
    if (savedRange && ed.doc.contains(savedRange.commonAncestorContainer)) { s.removeAllRanges(); s.addRange(savedRange); }
  }
  $$('.tools, .ctx').forEach(function (bar) {
    bar.addEventListener('mousedown', function (e) {
      var t = e.target.closest('button');
      if (t) e.preventDefault(); // 버튼을 눌러도 글자 선택이 풀리지 않게
    });
  });

  function run(fn) { restoreRange(); fn(); }

  /* ---------- 도구 버튼 ---------- */
  var lastColor = '#C0392B', lastHilite = '#FFE45C', lastCellBg = '#DCEBF7';
  var COMMANDS = {
    undo: function () { ed.undo(); }, redo: function () { ed.redo(); },
    bold: function () { ed.exec('bold'); }, italic: function () { ed.exec('italic'); }, underline: function () { ed.exec('underline'); },
    strike: function () { ed.exec('strike'); }, sup: function () { ed.exec('sup'); }, sub: function () { ed.exec('sub'); },
    removeFormat: function () { ed.exec('removeFormat'); },
    ul: function () { ed.exec('ul'); }, ol: function () { ed.exec('ol'); },
    indent: function () { ed.exec('indent', 1); }, outdent: function () { ed.exec('indent', -1); },
    sizeUp: function () { stepSize(1); }, sizeDown: function () { stepSize(-1); },
    image: function () { $('#imgIn').click(); },
    pageBreak: function () { ed.exec('pageBreak'); },
    pageDlg: pageDialog, hfDlg: hfDialog, paraDlg: paraDialog, find: openFind
  };
  $('#tools').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cmd && COMMANDS[b.dataset.cmd]) run(COMMANDS[b.dataset.cmd]);
    else if (b.dataset.align) run(function () { ed.exec('align', b.dataset.align); });
  });
  var SIZES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];
  function stepSize(d) {
    var cur = parseFloat($('#inSize').value) || 10, next;
    if (d > 0) next = SIZES.filter(function (s) { return s > cur; })[0] || cur + 4;
    else next = SIZES.filter(function (s) { return s < cur; }).pop() || Math.max(1, cur - 1);
    $('#inSize').value = next;
    ed.exec('fontSize', next);
  }
  $('#inSize').addEventListener('change', function () {
    var v = parseFloat(this.value);
    if (!(v >= 1 && v <= 400)) { toast('글자 크기는 1에서 400 사이 숫자로 적어 주세요.'); return; }
    run(function () { ed.exec('fontSize', v); });
  });
  $('#inSize').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); this.dispatchEvent(new Event('change')); } });
  selFont.addEventListener('change', function () { var v = this.value; run(function () { ed.exec('fontName', v); }); });
  $('#selStyle').addEventListener('change', function () { var v = this.value; run(function () { ed.exec('block', v); }); });
  $('#bColor').addEventListener('click', function (e) {
    if (e.offsetY > 0 && e.target.closest('.bar')) { run(function () { ed.exec('foreColor', lastColor); }); return; }
    colorPop(this, { value: lastColor, none: '검정(기본)' }, function (c) {
      if (c === 'none') c = '#000000';
      lastColor = c; $('#colorBar').style.background = c;
      run(function () { ed.exec('foreColor', c); });
    });
  });
  $('#bHilite').addEventListener('click', function () {
    colorPop(this, { value: lastHilite, none: '형광펜 지우기' }, function (c) {
      if (c !== 'none') { lastHilite = c; $('#hiliteBar').style.background = c; }
      run(function () { ed.exec('hilite', c); });
    });
  });
  $('#bLine').addEventListener('click', function () {
    pop(this, function (p) {
      [100, 130, 160, 180, 200, 250].forEach(function (v) {
        menuItem(p, v + '%', v === 160 ? '한글 기본값' : '', function () { run(function () { ed.exec('lineHeight', v / 100); }); });
      });
      p.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
      menuItem(p, '문단 모양…', '여백·들여쓰기·간격', paraDialog);
    });
  });
  $('#bTable').addEventListener('click', function () {
    var btn = this;
    pop(btn, function (p) {
      var g = document.createElement('div'); g.className = 'gridpick';
      var lab = document.createElement('div'); lab.className = 'gridlabel'; lab.textContent = '줄과 칸을 고르세요';
      for (var r = 0; r < 8; r++) for (var c = 0; c < 10; c++) {
        var s = document.createElement('span'); s.dataset.r = r + 1; s.dataset.c = c + 1;
        g.appendChild(s);
      }
      g.addEventListener('mouseover', function (e) {
        var s = e.target.closest('span'); if (!s) return;
        var R = +s.dataset.r, C = +s.dataset.c;
        $$('span', g).forEach(function (x) { x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C); });
        lab.textContent = R + '줄 × ' + C + '칸';
      });
      g.addEventListener('click', function (e) {
        var s = e.target.closest('span'); if (!s) return;
        closePop(); run(function () { ed.insertTable(+s.dataset.r, +s.dataset.c); });
      });
      p.appendChild(g); p.appendChild(lab);
      p.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
      menuItem(p, '줄·칸 수 적어서 만들기…', '', tableDialog);
    });
  });
  function tableDialog() {
    dialog('표 만들기', '<div class="row2"><label class="field"><span>줄 수</span><input id="tR" type="number" min="1" max="200" value="4"></label><label class="field"><span>칸 수</span><input id="tC" type="number" min="1" max="30" value="4"></label></div>', [
      { label: '취소' },
      { label: '만들기', primary: true, fn: function (d) {
        var r = +$('#tR', d).value, c = +$('#tC', d).value;
        if (!(r >= 1 && r <= 200 && c >= 1 && c <= 30)) { toast('줄은 1~200, 칸은 1~30 사이로 적어 주세요.'); return false; }
        setTimeout(function () { run(function () { ed.insertTable(r, c); }); }, 0);
      } }
    ]);
  }
  $('#bShape').addEventListener('click', function () {
    pop(this, function (p) {
      [['rect', '사각형'], ['round', '둥근 사각형'], ['ellipse', '타원'], ['triangle', '삼각형'], ['line', '직선'], ['arrow', '화살표']].forEach(function (s) {
        menuItem(p, s[1], '', function () { run(function () { ed.insertShape(s[0]); }); });
      });
    });
  });
  $('#imgIn').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('그림 파일(PNG, JPG, GIF 등)을 골라 주세요.'); return; }
    run(function () { ed.insertImageFile(f); });
  });

  /* 표 도구 */
  $('#ctxTable').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !b.dataset.t) return;
    if (b.dataset.t === 'delTable') { run(function () { ed.deleteTable(); }); return; }
    if (b.dataset.t === 'merge' && !ed.cellSel) { toast('합칠 셀들을 마우스로 끌어서 고르거나, Shift를 누른 채 다른 셀을 눌러 주세요.'); return; }
    run(function () { ed.tableOp(b.dataset.t); });
  });
  $('#bSplit').addEventListener('click', function () {
    pop(this, function (p) {
      menuItem(p, '칸으로 나누기', '세로선으로 둘', function () { run(function () { ed.tableOp('splitCols', 2); }); });
      menuItem(p, '세 칸으로 나누기', '세로선으로 셋', function () { run(function () { ed.tableOp('splitCols', 3); }); });
      menuItem(p, '줄로 나누기', '가로선으로 둘', function () { run(function () { ed.tableOp('splitRows', 2); }); });
      menuItem(p, '합친 셀 풀기', '', function () { run(function () { ed.tableOp('unmerge'); }); });
    });
  });
  $('#bCellBg').addEventListener('click', function () {
    colorPop(this, { value: lastCellBg, none: '배경 없음' }, function (c) {
      if (c !== 'none') { lastCellBg = c; $('#cellBar').style.background = c; }
      run(function () { ed.tableOp('bg', c); });
    });
  });
  $('#bBorder').addEventListener('click', function () {
    pop(this, function (p) {
      menuItem(p, '모든 테두리', '0.12mm 실선', function () { run(function () { ed.tableOp('border', 'all'); }); });
      menuItem(p, '바깥 테두리 굵게', '고른 범위 둘레 0.4mm', function () { run(function () { ed.tableOp('border', 'outer'); }); });
      menuItem(p, '아래 이중선', '표 머리줄에 자주 씀', function () { run(function () { ed.tableOp('border', 'double'); }); });
      menuItem(p, '테두리 없음', '', function () { run(function () { ed.tableOp('border', 'none'); }); });
      p.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
      menuItem(p, '표를 가운데로', '', function () { run(function () { ed.tableOp('align', 'center'); }); });
      menuItem(p, '표를 왼쪽으로', '', function () { run(function () { ed.tableOp('align', 'left'); }); });
    });
  });
  $('#bVAlign').addEventListener('click', function () {
    pop(this, function (p) {
      menuItem(p, '위', '', function () { run(function () { ed.tableOp('valign', 'top'); }); });
      menuItem(p, '가운데', '', function () { run(function () { ed.tableOp('valign', 'middle'); }); });
      menuItem(p, '아래', '', function () { run(function () { ed.tableOp('valign', 'bottom'); }); });
    });
  });
  /* 그림 도구 */
  $('#ctxImg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.w) ed.setImgWrap(b.dataset.w);
    else if (b.dataset.i === 'orig') ed.imgOriginal();
    else if (b.dataset.i === 'del') ed.deleteImage();
  });
  $('#bShapeFill').addEventListener('click', function () {
    var sp = ed.shapeProps() || {};
    colorPop(this, { value: sp.fill, none: '채우기 없음' }, function (c) { ed.setShape({ fill: c === 'none' ? 'none' : c }); reflect(ed.state()); });
  });
  $('#bShapeLine').addEventListener('click', function () {
    var sp = ed.shapeProps() || {};
    colorPop(this, { value: sp.stroke }, function (c) { ed.setShape({ stroke: c === 'none' ? '#000000' : c }); reflect(ed.state()); });
  });
  $('#bShapeW').addEventListener('click', function () {
    pop(this, function (p) {
      [1, 2, 3, 5, 8].forEach(function (w) { menuItem(p, w + 'px', '', function () { ed.setShape({ sw: w }); }); });
    });
  });

  /* ---------- 도구 상태 반영 ---------- */
  var lastSt = {};
  function reflect(st) {
    if (st.error) { toast(st.error); return; }
    lastSt = st;
    function on(sel, v) { var el = $(sel); if (el) el.classList.toggle('on', !!v); }
    on('[data-cmd="bold"]', st.bold); on('[data-cmd="italic"]', st.italic); on('[data-cmd="underline"]', st.underline); on('[data-cmd="strike"]', st.strike);
    on('[data-cmd="sup"]', st.sup); on('[data-cmd="sub"]', st.sub); on('[data-cmd="ul"]', st.ul); on('[data-cmd="ol"]', st.ol);
    $$('[data-align]').forEach(function (b) { b.classList.toggle('on', b.dataset.align === st.align); });
    $('[data-cmd="undo"]').disabled = !st.canUndo; $('[data-cmd="redo"]').disabled = !st.canRedo;
    if (st.font && document.activeElement !== selFont) {
      if (!Array.prototype.some.call(selFont.options, function (o) { return o.value === st.font; })) {
        var o = document.createElement('option'); o.value = st.font; o.textContent = st.font; selFont.appendChild(o);
      }
      selFont.value = st.font;
    }
    if (st.size && document.activeElement !== $('#inSize')) $('#inSize').value = st.size;
    if (st.lineHeight) $('#lhLabel').textContent = Math.round(st.lineHeight * 100) + '%';
    if (st.block && document.activeElement !== $('#selStyle')) $('#selStyle').value = /^H[1-3]$/.test(st.block) ? st.block : 'P';
    $('#ctxTable').hidden = !st.inTable || !!st.img;
    $('#ctxImg').hidden = !st.img;
    if (st.img) {
      $('#imgTitle').textContent = st.shape ? '도형' : '그림';
      $('#bOrig').hidden = !!st.shape;
      ['#bShapeFill', '#bShapeLine', '#bShapeW'].forEach(function (s) { $(s).hidden = !st.shape; });
      $$('#ctxImg [data-w]').forEach(function (b) { b.classList.toggle('on', b.dataset.w === st.wrap || (st.wrap === 'block' && b.dataset.w === 'center' && false)); });
      if (st.shape) { var sp = ed.shapeProps() || {}; $('#shapeFillBar').style.background = sp.fill === 'none' ? 'transparent' : sp.fill; $('#shapeLineBar').style.background = sp.stroke; }
    }
    $('#bMerge').classList.toggle('on', !!st.cellSel);
    updateStatus();
  }
  function updateStatus() {
    var cur = 1;
    if (!ed.fit) {
      var r = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0) : null;
      if (r && ed.doc.contains(r.startContainer)) {
        var rects = r.getClientRects(), rr = rects.length ? rects[0] : (r.startContainer.nodeType === 1 ? r.startContainer.getBoundingClientRect() : null);
        if (rr) {
          var y = (rr.top - ed.paper.getBoundingClientRect().top) / ed.zoom;
          cur = Math.min(ed.pages, Math.max(1, Math.floor(y / ed.geom().step) + 1));
        }
      }
    }
    $('#stPage').textContent = ed.fit ? '화면 맞춤 보기' : cur + ' / ' + ed.pages + '쪽';
    var s = ed.stats();
    $('#stChars').textContent = '글자 ' + s.chars.toLocaleString('ko-KR');
    var pg = ed.settings.page, name = 'A4';
    Object.keys(NG.PAPERS).forEach(function (k) { var P = NG.PAPERS[k]; if ((Math.abs(P.w - Math.min(pg.width, pg.height)) < 300) && Math.abs(P.h - Math.max(pg.width, pg.height)) < 300) name = k === 'LETTER' ? '레터' : k; });
    if (!name) name = '사용자';
    $('#stPaper').textContent = name + (pg.landscape ? ' 가로' : '');
  }

  /* ---------- 보기·확대 ---------- */
  function setZoom(z) { ed.setZoom(z); $('#zVal').textContent = Math.round(ed.zoom * 100) + '%'; try { localStorage.setItem('nurigeul.zoom', ed.zoom); } catch (e) { } }
  $('#zIn').addEventListener('click', function () { setZoom(Math.round((ed.zoom + 0.1) * 10) / 10); });
  $('#zOut').addEventListener('click', function () { setZoom(Math.round((ed.zoom - 0.1) * 10) / 10); });
  $('#zVal').addEventListener('click', function () { setZoom(1); });
  function setView(fit) {
    if (!fit && window.innerWidth < 900) {
      var avail = $('#desk').clientWidth - 24;
      var need = ed.geom().W;
      if (need * ed.zoom > avail) { ed.zoom = Math.max(0.3, Math.floor(avail / need * 100) / 100); $('#zVal').textContent = Math.round(ed.zoom * 100) + '%'; }
    }
    ed.setFit(fit);
    $('#vFit').classList.toggle('on', fit); $('#vPage').classList.toggle('on', !fit);
    $('#desk').classList.toggle('fitmode', fit);
    $('#zoomBox').hidden = fit;
    updateStatus();
  }
  $('#vPage').addEventListener('click', function () { setView(false); });
  $('#vFit').addEventListener('click', function () { setView(true); });

  /* ---------- 쪽 설정 ---------- */
  function mm(hu) { return Math.round(NG.huToMm(hu) * 10) / 10; }
  function pageDialog() {
    var p = ed.settings.page, m = p.margin;
    var cur = 'CUSTOM';
    Object.keys(NG.PAPERS).forEach(function (k) { var P = NG.PAPERS[k]; if (Math.abs(P.w - Math.min(p.width, p.height)) < 300 && Math.abs(P.h - Math.max(p.width, p.height)) < 300) cur = k; });
    var opts = Object.keys(NG.PAPERS).map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + NG.PAPERS[k].name + '</option>'; }).join('') + '<option value="CUSTOM"' + (cur === 'CUSTOM' ? ' selected' : '') + '>사용자 정의</option>';
    function num(id, label, v) { return '<label class="field"><span>' + label + '</span><span class="unit" data-u="mm"><input id="' + id + '" type="number" step="0.5" min="0" value="' + v + '"></span></label>'; }
    var body = '<div class="row2"><label class="field"><span>용지 종류</span><select id="pP">' + opts + '</select></label>' +
      '<div class="field"><span>용지 방향</span><div class="choice" id="pO"><button type="button" data-o="0"' + (!p.landscape ? ' class="on"' : '') + '>세로</button><button type="button" data-o="1"' + (p.landscape ? ' class="on"' : '') + '>가로</button></div></div></div>' +
      '<div class="row2" id="pCustom"' + (cur === 'CUSTOM' ? '' : ' hidden') + '>' + num('pW', '폭', mm(Math.min(p.width, p.height))) + num('pH', '길이', mm(Math.max(p.width, p.height))) + '</div>' +
      '<div class="row3">' + num('mT', '위쪽', mm(m.top)) + num('mH', '머리말', mm(m.header)) + num('mL', '왼쪽', mm(m.left)) + '</div>' +
      '<div class="row3">' + num('mB', '아래쪽', mm(m.bottom)) + num('mF', '꼬리말', mm(m.footer)) + num('mR', '오른쪽', mm(m.right)) + '</div>' +
      '<p class="note">한글과 같은 방식입니다. 본문은 위쪽 여백과 머리말 높이를 더한 곳에서 시작합니다.</p>' +
      '<div class="choice"><button type="button" id="pDef">한글 기본값(위 20·머리말 15·좌우 30mm)</button><button type="button" id="pNarrow">좁게(모두 15mm)</button></div>';
    dialog('쪽 설정', body, [
      { label: '취소' },
      { label: '적용', primary: true, fn: function (d) {
        var land = $('#pO .on', d).dataset.o === '1';
        var key = $('#pP', d).value, w, h;
        if (key === 'CUSTOM') { w = NG.mmToHu(+$('#pW', d).value); h = NG.mmToHu(+$('#pH', d).value); }
        else { w = NG.PAPERS[key].w; h = NG.PAPERS[key].h; }
        if (!(w > 20000 && h > 20000)) { toast('용지 폭과 길이를 70mm 이상으로 적어 주세요.'); return false; }
        var M = {};
        [['top', 'mT'], ['header', 'mH'], ['left', 'mL'], ['bottom', 'mB'], ['footer', 'mF'], ['right', 'mR']].forEach(function (x) { M[x[0]] = NG.mmToHu(Math.max(0, +$('#' + x[1], d).value || 0)); });
        var W = land ? Math.max(w, h) : Math.min(w, h), H = land ? Math.min(w, h) : Math.max(w, h);
        if (M.left + M.right > W - 10000 || M.top + M.header + M.bottom + M.footer > H - 10000) { toast('여백이 너무 커서 본문 자리가 없습니다. 여백을 줄여 주세요.'); return false; }
        ed.pushUndo();
        ed.settings.page = { width: W, height: H, landscape: land, margin: { left: M.left, right: M.right, top: M.top, bottom: M.bottom, header: M.header, footer: M.footer, gutter: 0 } };
        ed.applyPageCss(); ed.paginate(); ed.changed();
      } }
    ], function (d) {
      $('#pP', d).addEventListener('change', function () { $('#pCustom', d).hidden = this.value !== 'CUSTOM'; });
      $$('#pO button', d).forEach(function (b) { b.addEventListener('click', function () { $$('#pO button', d).forEach(function (x) { x.classList.toggle('on', x === b); }); }); });
      $('#pDef', d).addEventListener('click', function () { [['mT', 20], ['mH', 15], ['mL', 30], ['mB', 15], ['mF', 15], ['mR', 30]].forEach(function (x) { $('#' + x[0], d).value = x[1]; }); });
      $('#pNarrow', d).addEventListener('click', function () { [['mT', 15], ['mH', 10], ['mL', 15], ['mB', 15], ['mF', 10], ['mR', 15]].forEach(function (x) { $('#' + x[0], d).value = x[1]; }); });
    });
  }

  /* ---------- 머리말·꼬리말·쪽 번호 ---------- */
  function hfDialog() {
    var s = ed.settings, h = s.header || { text: '', align: 'center' }, f = s.footer || { text: '', align: 'center' };
    var pn = s.pageNum || { pos: 'NONE', side: '' };
    function align(id, v) { return '<div class="choice" id="' + id + '">' + [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].map(function (a) { return '<button type="button" data-a="' + a[0] + '"' + (a[0] === v ? ' class="on"' : '') + '>' + a[1] + '</button>'; }).join('') + '</div>'; }
    var POS = [['NONE', '넣지 않음'], ['BOTTOM_CENTER', '아래 가운데'], ['BOTTOM_RIGHT', '아래 오른쪽'], ['BOTTOM_LEFT', '아래 왼쪽'], ['TOP_RIGHT', '위 오른쪽'], ['TOP_CENTER', '위 가운데'], ['TOP_LEFT', '위 왼쪽']];
    var body = '<label class="field"><span>머리말 (쪽마다 맨 위)</span><textarea id="hT" placeholder="예: 2026년 하반기 업무 보고">' + NG.esc(h.text) + '</textarea></label>' + align('hA', h.align) +
      '<label class="field"><span>꼬리말 (쪽마다 맨 아래)</span><textarea id="fT" placeholder="예: 누리상사 기획팀">' + NG.esc(f.text) + '</textarea></label>' + align('fA', f.align) +
      '<div class="row2"><label class="field"><span>쪽 번호 위치</span><select id="nP">' + POS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === pn.pos ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>모양</span><select id="nS"><option value="-"' + (pn.side === '-' ? ' selected' : '') + '>- 1 -</option><option value=""' + (pn.side !== '-' ? ' selected' : '') + '>1</option></select></label></div>';
    dialog('머리말·꼬리말·쪽 번호', body, [
      { label: '취소' },
      { label: '적용', primary: true, fn: function (d) {
        ed.pushUndo();
        var ht = $('#hT', d).value.replace(/\s+$/, ''), ft = $('#fT', d).value.replace(/\s+$/, '');
        ed.settings.header = ht ? { text: ht, align: $('#hA .on', d).dataset.a } : null;
        ed.settings.footer = ft ? { text: ft, align: $('#fA .on', d).dataset.a } : null;
        var pos = $('#nP', d).value;
        ed.settings.pageNum = pos === 'NONE' ? null : { pos: pos, side: $('#nS', d).value };
        ed.applyPageCss(); ed.paginate(); ed.changed();
      } }
    ], function (d) {
      ['hA', 'fA'].forEach(function (id) { $$('#' + id + ' button', d).forEach(function (b) { b.addEventListener('click', function () { $$('#' + id + ' button', d).forEach(function (x) { x.classList.toggle('on', x === b); }); }); }); });
    });
  }

  /* ---------- 문단 모양 ---------- */
  function paraDialog() {
    restoreRange();
    var b = ed.selBlocks()[0];
    var cs = b ? getComputedStyle(b) : null;
    var pt = function (px) { return Math.round(px * 0.75 * 10) / 10; };
    var ind = cs ? parseFloat(cs.textIndent) || 0 : 0;
    var lh = cs ? (cs.lineHeight === 'normal' ? 120 : Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100)) : 160;
    var vals = { left: cs ? pt(parseFloat(cs.marginLeft) || 0) : 0, right: cs ? pt(parseFloat(cs.marginRight) || 0) : 0, indent: pt(Math.abs(ind)), before: cs ? pt(parseFloat(cs.marginTop) || 0) : 0, after: cs ? pt(parseFloat(cs.marginBottom) || 0) : 0 };
    function num(id, label, v, u) { return '<label class="field"><span>' + label + '</span><span class="unit" data-u="' + (u || 'pt') + '"><input id="' + id + '" type="number" step="1" min="0" value="' + v + '"></span></label>'; }
    var body = '<div class="row2">' + num('aL', '왼쪽 여백', vals.left) + num('aR', '오른쪽 여백', vals.right) + '</div>' +
      '<div class="row2"><div class="field"><span>첫 줄</span><div class="choice" id="aK"><button type="button" data-k="0"' + (!ind ? ' class="on"' : '') + '>보통</button><button type="button" data-k="1"' + (ind > 0 ? ' class="on"' : '') + '>들여쓰기</button><button type="button" data-k="-1"' + (ind < 0 ? ' class="on"' : '') + '>내어쓰기</button></div></div>' + num('aI', '첫 줄 값', vals.indent || 10) + '</div>' +
      '<div class="row3">' + num('aB', '문단 위', vals.before) + num('aA', '문단 아래', vals.after) + num('aH', '줄 간격', lh, '%') + '</div>';
    dialog('문단 모양', body, [
      { label: '취소' },
      { label: '적용', primary: true, fn: function (d) {
        var px = function (v) { return (+v || 0) / 0.75; };
        var k = +$('#aK .on', d).dataset.k;
        var lhv = +$('#aH', d).value;
        if (!(lhv >= 50 && lhv <= 500)) { toast('줄 간격은 50%에서 500% 사이로 적어 주세요.'); return false; }
        var v = { left: px($('#aL', d).value), right: px($('#aR', d).value), indent: k * px($('#aI', d).value), before: px($('#aB', d).value), after: px($('#aA', d).value), lineHeight: lhv / 100 };
        setTimeout(function () { run(function () { ed.exec('para', v); }); }, 0);
      } }
    ], function (d) {
      $$('#aK button', d).forEach(function (bt) { bt.addEventListener('click', function () { $$('#aK button', d).forEach(function (x) { x.classList.toggle('on', x === bt); }); }); });
    });
  }

  /* ---------- 찾기·바꾸기 ---------- */
  function openFind() {
    var fb = $('.findbar');
    if (fb) { $('#fQ', fb).focus(); $('#fQ', fb).select(); return; }
    fb = document.createElement('div'); fb.className = 'findbar'; fb.setAttribute('role', 'search');
    var r = ed.range(), pre = r && !r.collapsed ? r.toString().slice(0, 60) : '';
    fb.innerHTML = '<div class="r"><input id="fQ" placeholder="찾을 말" aria-label="찾을 말"><button class="btn" id="fPrev" title="이전">↑</button><button class="btn" id="fNext" title="다음">↓</button><button class="btn" id="fX" title="닫기" aria-label="닫기">✕</button></div>' +
      '<div class="r"><input id="fR" placeholder="바꿀 말" aria-label="바꿀 말"><button class="btn" id="fOne">바꾸기</button><button class="btn" id="fAll">모두</button></div><div class="msg" id="fMsg"></div>';
    document.body.appendChild(fb);
    fb.style.top = ($('#desk').getBoundingClientRect().top + 10) + 'px';
    var q = $('#fQ', fb); q.value = pre; q.focus(); q.select();
    function say(t) { $('#fMsg', fb).textContent = t; }
    function go(back) { if (!q.value) return; say(ed.find(q.value, back) ? '' : '"' + q.value + '"을(를) 찾지 못했습니다.'); }
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey); } if (e.key === 'Escape') fb.remove(); });
    $('#fNext', fb).addEventListener('click', function () { go(false); });
    $('#fPrev', fb).addEventListener('click', function () { go(true); });
    $('#fX', fb).addEventListener('click', function () { fb.remove(); ed.focus(); });
    $('#fOne', fb).addEventListener('click', function () { if (!ed.replaceOne(q.value, $('#fR', fb).value)) say('더 바꿀 곳이 없습니다.'); });
    $('#fAll', fb).addEventListener('click', function () { var n = ed.replaceAll(q.value, $('#fR', fb).value); say(n ? n + '곳을 바꿨습니다.' : '바꿀 곳이 없습니다.'); });
  }

  /* ---------- 파일 열기 ---------- */
  function startsWith(u8, arr) { for (var i = 0; i < arr.length; i++) if (u8[i] !== arr[i]) return false; return true; }
  async function openBytes(u8, filename) {
    var base = (filename || '문서').replace(/\.[^.]+$/, '');
    busy('문서를 여는 중…');
    try {
      var doc = null, ext = (filename.split('.').pop() || '').toLowerCase();
      if (startsWith(u8, [0xD0, 0xCF, 0x11, 0xE0])) doc = NG.readHwp(u8);
      else if (startsWith(u8, [0x50, 0x4B])) {
        var zip = await JSZip.loadAsync(u8);
        if (zip.file('word/document.xml')) throw new Error('Word(.docx) 파일 열기는 아직 할 수 없습니다. 한글 파일(.hwp, .hwpx)을 열어 주세요.');
        if (!zip.file('Contents/content.hpf') && !zip.file('mimetype')) throw new Error('한글(HWPX) 문서가 아닌 압축 파일입니다.');
        doc = await NG.readHwpx(u8);
      } else if (ext === 'html' || ext === 'htm' || /^\s*</.test(new TextDecoder().decode(u8.subarray(0, 200)))) {
        var text = new TextDecoder().decode(u8);
        var dp = new DOMParser().parseFromString(text, 'text/html');
        var own = dp.querySelector('.ng-doc');
        var settings = null;
        if (own && own.getAttribute('data-settings')) { try { settings = JSON.parse(own.getAttribute('data-settings')); } catch (e) { } }
        var html = NG.sanitizeHtml((own || dp.body).innerHTML);
        loadInto(html, settings || defaultSettings(), base, []);
        return;
      } else if (ext === 'txt') {
        var t = new TextDecoder().decode(u8).replace(/\r\n?/g, '\n');
        loadInto(t.split('\n').map(function (l) { return '<p>' + (NG.esc(l) || '<br>') + '</p>'; }).join(''), defaultSettings(), base, []);
        return;
      } else throw new Error('열 수 없는 파일입니다. 한글 파일(.hwp, .hwpx)이나 웹 문서(.html), 글 파일(.txt)을 골라 주세요.');
      var res = NG.docToEditor(doc);
      loadInto(res.html, res.settings, base, res.warnings);
    } catch (err) {
      console.error(err);
      toast(err && err.message && /[가-힣]/.test(err.message) ? err.message : '문서를 읽다가 문제가 생겼습니다. 파일이 손상되었거나 아직 지원하지 않는 형식일 수 있습니다.', 6000);
    } finally { busy(false); }
  }
  function defaultSettings() { return { page: NG.defaultPage(), header: null, footer: null, pageNum: { pos: 'BOTTOM_CENTER', side: '-' } }; }
  function loadInto(html, settings, name, warnings) {
    ed.setContent(html, settings);
    $('#docName').value = name;
    $('#desk').scrollTop = 0;
    saveLocal(true);
    if (warnings && warnings.length) toast(warnings.join(' '), 7000);
    else toast('"' + name + '" 문서를 열었습니다.');
  }
  $('#bOpen').addEventListener('click', function () { $('#fileIn').click(); });
  $('#fileIn').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    f.arrayBuffer().then(function (buf) { openBytes(new Uint8Array(buf), f.name); });
  });
  // 파일을 창에 끌어다 놓기
  var dz = null, dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    if (!e.dataTransfer || !Array.prototype.some.call(e.dataTransfer.types, function (t) { return t === 'Files'; })) return;
    dragDepth++;
    if (!dz) { dz = document.createElement('div'); dz.className = 'dropzone'; dz.textContent = '여기에 놓으면 문서를 엽니다 (그림은 본문 위에 놓으세요)'; document.body.appendChild(dz); }
  });
  window.addEventListener('dragleave', function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth && dz) { dz.remove(); dz = null; } });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    dragDepth = 0; if (dz) { dz.remove(); dz = null; }
    if (e.defaultPrevented) return;
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f) return;
    if (/^image\//.test(f.type)) { ed.focus(); ed.insertImageFile(f); return; }
    f.arrayBuffer().then(function (buf) { openBytes(new Uint8Array(buf), f.name); });
  });

  /* ---------- 저장 ---------- */
  function rasterize(img, w, h) {
    return new Promise(function (resolve) {
      var c = document.createElement('canvas');
      var scale = 2;
      c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
      var g = c.getContext('2d');
      var im = new Image();
      im.onload = function () {
        try { g.drawImage(im, 0, 0, c.width, c.height); c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }); }, 'image/png'); }
        catch (e) { resolve(null); }
      };
      im.onerror = function () { resolve(null); };
      im.src = img.src;
    });
  }
  async function collectDoc() {
    ed.stripGaps();
    var doc;
    try { doc = NG.editorToDoc(ed.doc, ed.settings); }
    finally { ed.paginate(); }
    var ex = doc._exporter; delete doc._exporter;
    var els = ex.imgEls || {};
    var ids = Object.keys(els);
    for (var i = 0; i < ids.length; i++) {
      var img = els[ids[i]], ent = NG.imgs.get(img.getAttribute('data-img'));
      var d = ent ? { mime: ent.mime, data: ent.bytes } : NG.dataUrlToBytes(img.src);
      var ok = d && /^image\/(png|jpeg|gif|bmp)$/.test(d.mime);
      if (ok) doc.bins[ids[i]] = { mime: d.mime, ext: d.mime.split('/')[1].replace('jpeg', 'jpg'), data: d.data };
      else {
        var w = img.offsetWidth || img.naturalWidth || 100, h = img.offsetHeight || img.naturalHeight || 100;
        var png = await rasterize(img, w, h);
        if (png) doc.bins[ids[i]] = { mime: 'image/png', ext: 'png', data: png };
      }
    }
    // 원래 화소 크기(그림 정보에 기록)
    (function fix(bs) {
      bs.forEach(function (b) {
        if (b.runs) b.runs.forEach(function (r) { if (r.t === 'img' && els[r.bin]) { r.pxW = els[r.bin].naturalWidth || 0; r.pxH = els[r.bin].naturalHeight || 0; if (els[r.bin].getAttribute('data-shape')) { r.pxW = Math.round(r.w / 75 * 2); r.pxH = Math.round(r.h / 75 * 2); } } });
        if (b.blocks) fix(b.blocks);
        if (b.rows) b.rows.forEach(function (row) { row.forEach(function (c) { fix(c.blocks); }); });
      });
    })(doc.blocks);
    return doc;
  }
  function fileBase() { return ($('#docName').value || '문서').replace(/[\\/:*?"<>|]+/g, ' ').trim() || '문서'; }
  var downloadsP = null;
  function downloadsCap() {
    if (!window.claude || !window.claude.use) return Promise.resolve(null);
    if (!downloadsP) downloadsP = window.claude.use('downloads').catch(function () { return null; });
    return downloadsP;
  }
  async function deliver(filename, data, mime) {
    var dl = await downloadsCap();
    if (dl) {
      try { await dl.save({ filename: filename, data: new Blob([data], { type: mime }) }); toast('"' + filename + '" 파일을 내려받았습니다.'); return true; }
      catch (e) {
        var code = e && e.code;
        if (code === 'declined') return false;
        if (code === 'rejected_extension' || code === 'extension_not_enabled') throw { code: 'ext' };
        if (code === 'rate_limited') { toast('저장 창이 이미 열려 있습니다. 그 창을 먼저 닫아 주세요.'); return false; }
        if (code === 'too_large') { toast('파일이 너무 커서 이 화면에서 받을 수 없습니다. 그림 크기를 줄여 보세요.'); return false; }
      }
    }
    if (window.claude && !dl) { toast('이 화면에서는 파일 내려받기가 허용되지 않았습니다. 페이지의 권한 메뉴에서 다운로드를 허용해 주세요.', 6000); return false; }
    var url = URL.createObjectURL(new Blob([data], { type: mime }));
    var a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('"' + filename + '" 파일을 내려받았습니다.');
    return true;
  }
  async function saveAs(kind) {
    var base = fileBase();
    try {
      if (kind === 'pdf') { await savePdf(); return; }
      if (kind === 'html') { await deliver(base + '.html', htmlExport(base), 'text/html'); return; }
      busy('파일을 만드는 중…');
      var doc = await collectDoc();
      if (kind === 'hwpx') {
        var bytes = await NG.writeHwpx(doc, { title: base });
        busy(false);
        try { await deliver(base + '.hwpx', bytes, 'application/hwp+zip'); }
        catch (e) {
          if (e && e.code === 'ext') hwpxFallback(base, bytes); else throw e;
        }
      } else if (kind === 'docx') {
        var dx = await NG.writeDocx(doc, { title: base });
        busy(false);
        await deliver(base + '.docx', dx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
    } catch (err) {
      console.error(err);
      toast('파일을 만들다가 문제가 생겼습니다. 다시 한 번 시도해 주세요.', 5000);
    } finally { busy(false); }
  }
  function hwpxFallback(base, bytes) {
    dialog('한글 파일로 받기', '<p class="note">이 화면은 보안 때문에 <b>.hwpx</b> 이름의 파일을 바로 내려받을 수 없습니다. 아래 두 가지 중 하나를 고르세요.</p>' +
      '<p class="note"><b>1. 압축 파일로 받기</b> — "' + NG.esc(base) + '.hwpx.zip"으로 받아집니다. 받은 파일 이름 끝의 <b>.zip</b>만 지우면 한글에서 그대로 열립니다. (압축을 풀지 마세요.)</p>' +
      '<p class="note"><b>2. Word 파일로 받기</b> — 한글에서도 .docx를 열 수 있습니다. 모양이 조금 달라질 수 있습니다.</p>', [
      { label: '취소' },
      { label: 'Word(.docx)', fn: function () { setTimeout(function () { saveAs('docx'); }, 0); } },
      { label: '.hwpx.zip으로 받기', primary: true, fn: function () { deliver(base + '.hwpx.zip', bytes, 'application/zip'); } }
    ]);
  }
  function inlineImages(html) {
    var t = document.createElement('template'); t.innerHTML = html;
    t.content.querySelectorAll('img[data-img]').forEach(function (img) {
      var e = NG.imgs.get(img.getAttribute('data-img'));
      if (e) img.setAttribute('src', NG.bytesToDataUrl(e.bytes, e.mime));
    });
    var d = document.createElement('div'); d.appendChild(t.content); return d.innerHTML;
  }
  function htmlExport(title) {
    var s = ed.settings;
    var css = $('style').textContent.match(/\/\* 문서 본문[\s\S]*?(?=\n#overlay)/);
    var docCss = (css ? css[0] : '').replace(/#doc/g, '.ng-doc');
    var printCss = ($('#ng-print-css') || {}).textContent || '';
    var p = s.page, m = p.margin;
    var page = 'body{margin:0;background:#E5E8E6}.ng-doc{background:#fff;margin:24px auto;box-shadow:0 2px 12px rgba(0,0,0,.15);width:' + NG.huToPx(p.width).toFixed(1) + 'px;padding:' + NG.huToPx(m.top + m.header).toFixed(1) + 'px ' + NG.huToPx(m.right).toFixed(1) + 'px ' + NG.huToPx(m.bottom + m.footer).toFixed(1) + 'px ' + NG.huToPx(m.left).toFixed(1) + 'px;box-sizing:border-box;max-width:100%}@media print{body{background:#fff}.ng-doc{margin:0;box-shadow:none;width:auto;padding:0}}';
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + NG.esc(title) + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&display=swap">' +
      '<style>' + page + docCss.replace(/var\(--font-doc\)/g, '"함초롬바탕","Nanum Myeongjo",serif').replace(/var\(--accent\)/g, '#1E6B58') + printCss + '</style></head><body>' +
      '<div class="ng-doc" data-settings="' + NG.esc(JSON.stringify(s)) + '">' + inlineImages(ed.cleanHtml()) + '</div></body></html>';
  }
  /* PDF: 일반 브라우저는 인쇄 창(선명한 글자), 이 화면 안에서는 쪽마다 그림으로 */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  async function savePdf() {
    if (!IN_ARTIFACT) { printDoc(); return; }
    busy('PDF 준비 중…');
    var prevFit = ed.fit, prevZoom = ed.zoom;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      if (prevFit) setView(false);
      ed.clearImgSel(); ed.clearCellSel();
      ed.zoom = 1; ed.applyPageCss(); ed.paginate();
      document.body.classList.add('ng-exporting');
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var g = ed.geom(), n = ed.pages, p = ed.settings.page;
      var wmm = NG.huToMm(p.width), hmm = NG.huToMm(p.height);
      var pdf = new window.jspdf.jsPDF({ orientation: wmm > hmm ? 'l' : 'p', unit: 'mm', format: [wmm, hmm], compress: true });
      var holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:0;top:0;width:' + g.W + 'px;height:' + g.H + 'px;overflow:hidden;z-index:-5;background:#FFFFFF;pointer-events:none';
      var cl = ed.paper.cloneNode(true);
      cl.removeAttribute('id');
      cl.style.cssText = 'position:absolute;left:0;top:0;margin:0;width:' + g.W + 'px;height:' + ed.paper.style.height;
      var ov = cl.querySelector('#overlay'); if (ov) ov.remove();
      cl.querySelectorAll('.ng-guide, hr.ng-pb').forEach(function (x) { x.style.visibility = 'hidden'; });
      cl.querySelectorAll('[id]').forEach(function (x) { x.setAttribute('data-id', x.id); });
      holder.appendChild(cl);
      document.body.appendChild(holder);
      try {
        for (var i = 0; i < n; i++) {
          busy('PDF 만드는 중… ' + (i + 1) + ' / ' + n + '쪽');
          cl.style.top = (-i * g.step) + 'px';
          var canvas = await window.html2canvas(holder, { scale: 2, backgroundColor: '#FFFFFF', logging: false, width: g.W, height: g.H, windowWidth: Math.max(g.W, window.innerWidth), windowHeight: Math.max(g.H, window.innerHeight) });
          if (i > 0) pdf.addPage([wmm, hmm], wmm > hmm ? 'l' : 'p');
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wmm, hmm);
        }
      } finally { holder.remove(); }
      var out = pdf.output('arraybuffer');
      busy(false);
      await deliver(fileBase() + '.pdf', new Uint8Array(out), 'application/pdf');
    } catch (e) {
      console.error(e);
      toast('PDF를 만들지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.', 5000);
    } finally {
      document.body.classList.remove('ng-exporting');
      ed.zoom = prevZoom; ed.applyPageCss(); ed.paginate();
      if (prevFit) setView(true);
      busy(false);
    }
  }
  function printDoc() {
    var prevFit = ed.fit;
    if (prevFit) setView(false);
    ed.clearImgSel(); ed.clearCellSel();
    var z = ed.zoom; ed.zoom = 1; ed.applyPageCss(); ed.paginate();
    setTimeout(function () {
      window.print();
      ed.zoom = z; ed.applyPageCss(); ed.paginate();
      if (prevFit) setView(true);
    }, 50);
  }
  if (!IN_ARTIFACT) { $('#bPrint').hidden = false; $('#bPrint').addEventListener('click', printDoc); }
  $('#bSave').addEventListener('click', function () {
    pop(this, function (p) {
      menuItem(p, '한글 문서 (.hwpx)', '한글 2014 이상에서 열림', function () { saveAs('hwpx'); }, 'i-save');
      menuItem(p, 'Word 문서 (.docx)', '한글·Word·구글 문서에서 열림', function () { saveAs('docx'); }, 'i-save');
      menuItem(p, 'PDF', IN_ARTIFACT ? '쪽마다 그림으로 담음' : '인쇄 창에서 "PDF로 저장" 선택', function () { saveAs('pdf'); }, 'i-print');
      menuItem(p, '웹 문서 (.html)', '누리글에서 다시 열 수 있음', function () { saveAs('html'); }, 'i-save');
    });
  });

  /* ---------- 새 문서 ---------- */
  $('#bNew').addEventListener('click', function () {
    dialog('새 문서', '<p class="note">지금 문서를 닫고 빈 문서를 엽니다. 지금 문서를 파일로 남기려면 먼저 저장해 주세요.</p>', [
      { label: '취소' },
      { label: '빈 문서 열기', primary: true, fn: function () {
        ed.setContent('<p><br></p>', defaultSettings());
        $('#docName').value = '새 문서';
        saveLocal(true); ed.focus();
      } }
    ]);
  });

  /* ---------- 자동 저장 (이 브라우저에만) ---------- */
  var saveT, warnedQuota = false;
  function dirty() {
    $('#saveState').textContent = '고치는 중…';
    clearTimeout(saveT); saveT = setTimeout(function () { saveLocal(false); }, 900);
  }
  /* 그림 바이트는 IndexedDB에 따로 (localStorage는 작아서) */
  var idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (res) {
      try {
        var rq = indexedDB.open('nurigeul', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('imgs'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return idbP;
  }
  var persisted = new Set();
  function persistImages(ids) {
    return idb().then(function (db) {
      if (!db) return false;
      return new Promise(function (res) {
        try {
          var tx = db.transaction('imgs', 'readwrite'), st = tx.objectStore('imgs');
          ids.forEach(function (id) {
            if (persisted.has(id)) return;
            var e = NG.imgs.get(id); if (!e) return;
            st.put({ mime: e.mime, bytes: e.bytes }, id);
          });
          var keep = new Set(ids);
          var kr = st.getAllKeys();
          kr.onsuccess = function () { kr.result.forEach(function (k) { if (!keep.has(k)) st.delete(k); }); };
          tx.oncomplete = function () { ids.forEach(function (id) { persisted.add(id); }); res(true); };
          tx.onerror = tx.onabort = function () { res(false); };
        } catch (e) { res(false); }
      });
    });
  }
  function loadImages(ids) {
    return idb().then(function (db) {
      if (!db || !ids.length) return 0;
      return new Promise(function (res) {
        var n = 0;
        try {
          var tx = db.transaction('imgs', 'readonly'), st = tx.objectStore('imgs');
          ids.forEach(function (id) {
            var rq = st.get(id);
            rq.onsuccess = function () { if (rq.result) { NG.imgs.put(rq.result.bytes, rq.result.mime, id); persisted.add(id); n++; } };
          });
          tx.oncomplete = function () { res(n); };
          tx.onerror = function () { res(n); };
        } catch (e) { res(n); }
      });
    });
  }
  function saveLocal(quiet) {
    clearTimeout(saveT);
    var html = ed.cleanHtml();
    var ids = []; html.replace(/data-img="([^"]+)"/g, function (m, id) { ids.push(id); return m; });
    try {
      localStorage.setItem(STORE, JSON.stringify({ v: 2, name: $('#docName').value, settings: ed.settings, html: html, t: Date.now() }));
      $('#saveState').textContent = '이 브라우저에 자동 저장됨';
    } catch (e) {
      $('#saveState').textContent = '자동 저장 안 됨';
      if (!warnedQuota && !quiet) { warnedQuota = true; toast('문서가 커서 이 브라우저에 자동 저장하지 못했습니다. 파일로 저장해 두세요.', 6000); }
      return;
    }
    persistImages(ids).then(function (ok) {
      if (!ok && ids.length && !warnedQuota && !quiet) { warnedQuota = true; toast('그림은 이 브라우저에 자동 저장되지 않았습니다. 파일로 저장해 두세요.', 6000); }
    });
  }
  $('#docName').addEventListener('input', dirty);
  $('#docName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ed.focus(); } });

  /* ---------- 단축키 ---------- */
  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    var k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveAs('hwpx'); }
    else if (k === 'o') { e.preventDefault(); $('#fileIn').click(); }
    else if (k === 'f' || k === 'h') { e.preventDefault(); openFind(); }
    else if (k === 'p') { e.preventDefault(); saveAs('pdf'); }
  });

  /* ---------- 시작 ---------- */
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { }
  try { var z = parseFloat(localStorage.getItem('nurigeul.zoom')); if (z >= 0.3 && z <= 3) ed.zoom = z; } catch (e) { }
  if (narrow) { ed.fit = true; }
  if (saved && saved.html) {
    var sids = []; saved.html.replace(/data-img="([^"]+)"/g, function (m, id) { sids.push(id); return m; });
    var htmlNow = saved.html.replace(/(<img[^>]*?)src="blob:[^"]*"/g, '$1src="' + NG.placeholderImage('그림 불러오는 중').replace(/"/g, '&quot;') + '"');
    ed.setContent(htmlNow, saved.settings || defaultSettings());
    if (sids.length) loadImages(sids).then(function () { NG.internImages(ed.doc); ed.paginate(); });
    $('#docName').value = saved.name || '문서';
    $('#saveState').textContent = '이 브라우저에 자동 저장됨';
  } else {
    ed.setContent(NG.SAMPLE_HTML, NG.SAMPLE_SETTINGS);
    $('#saveState').textContent = '예시 문서';
  }
  setView(ed.fit);
  $('#zVal').textContent = Math.round(ed.zoom * 100) + '%';
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ed.paginate(); });
  window.addEventListener('beforeunload', function () { saveLocal(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveLocal(true); });
})(NG);
