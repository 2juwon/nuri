/* 처음 열었을 때 보이는 예시 문서 (누리글 사용 안내) */
(function (NG) {
  var C = 'border:0.12mm solid #000000;vertical-align:middle';
  var H = 'border:0.12mm solid #000000;border-bottom:0.5mm double #000000;vertical-align:middle;background-color:#E2EEE9';
  function row(a, b, c, extra) {
    return '<tr><td style="' + C + '"><p style="text-align:center">' + a + '</p></td><td style="' + C + '"><p style="text-align:center">' + b + '</p></td>' + (c === null ? '' : '<td style="' + C + '"' + (extra || '') + '><p>' + c + '</p></td>') + '</tr>';
  }
  NG.SAMPLE_HTML =
    '<p style="text-align:right;font-size:9pt;color:#555555">예시 문서 · 마음껏 고쳐 보세요</p>' +
    '<h1 style="text-align:center">누리글 사용 안내</h1>' +
    '<p style="text-align:center;margin-bottom:12px"><span style="color:#1E6B58">한글 문서를 웹에서 열고, 고치고, 저장합니다</span></p>' +
    '<p style="text-indent:13.33px">누리글은 한글(HWP·HWPX) 문서를 웹 브라우저에서 바로 다루는 무료 문서 편집기입니다. 프로그램을 설치하거나 회원 가입을 하지 않아도 됩니다. 지금 보이는 글은 <b>예시 문서</b>이니 글자를 지우거나 고쳐 보세요. 위쪽의 [새 문서]를 누르면 빈 문서가 열리고, [열기]로 가지고 있는 한글 파일을 불러올 수 있습니다.</p>' +
    '<h2>1. 할 수 있는 일</h2>' +
    '<ul><li><b>한글 파일 열기</b>: .hwp(한글 2002 이후 문서)와 .hwpx 파일의 글자, 문단 모양, 표, 그림, 머리말·꼬리말을 불러옵니다.</li>' +
    '<li><b>저장하기</b>: 한글 문서(.hwpx), Word 문서(.docx), PDF, 웹 문서(.html)로 저장합니다. 한글 2014 이후 버전은 .hwpx를 그대로 엽니다.</li>' +
    '<li><b>글자·문단</b>: 글꼴, 크기, 진하게, 밑줄, 글자 색, <span style="background-color:#FFE45C">형광펜</span>, 정렬, 줄 간격, 들여쓰기, 글머리표를 씁니다.</li>' +
    '<li><b>표·그림·도형</b>: 표를 만들고 셀을 합치거나 나눕니다. 그림은 끌어다 놓거나 붙여 넣고, 모서리를 끌어 크기를 바꿉니다.</li>' +
    '<li><b>쪽</b>: 용지 크기와 여백, 머리말·꼬리말, 쪽 번호를 정하고 Ctrl+Enter로 쪽을 나눕니다.</li></ul>' +
    '<h2>2. 자주 쓰는 단축키</h2>' +
    '<table class="ng-table" style="width:566px;margin-left:auto;margin-right:auto"><colgroup><col style="width:170px"><col style="width:140px"><col style="width:256px"></colgroup><tbody>' +
    '<tr><td style="' + H + '"><p style="text-align:center"><b>기능</b></p></td><td style="' + H + '"><p style="text-align:center"><b>단축키</b></p></td><td style="' + H + '"><p style="text-align:center"><b>설명</b></p></td></tr>' +
    row('한글 파일로 저장', 'Ctrl + S', '.hwpx 파일로 내려받습니다.') +
    row('파일 열기', 'Ctrl + O', '.hwp, .hwpx, .html, .txt') +
    row('되돌리기 / 다시 실행', 'Ctrl + Z / Ctrl + Y', '고친 내용을 한 단계씩 되돌립니다.') +
    row('진하게 · 기울임 · 밑줄', 'Ctrl + B · I · U', '편집할 때 가장 많이 쓰는 키입니다. 글자를 고른 뒤 누르세요.', ' rowspan="2"') +
    row('쪽 나누기', 'Ctrl + Enter', null) +
    row('찾기 · 바꾸기', 'Ctrl + F', '바꿀 말을 넣고 [모두]를 누르면 한꺼번에 바뀝니다.') +
    row('다음 칸으로', 'Tab', '표 안에서 다음 셀로 갑니다. 마지막 칸에서는 줄이 늘어납니다.') +
    '</tbody></table>' +
    '<h2>3. 표 다루기</h2>' +
    '<p style="text-indent:13.33px">표 안을 누르면 위에 <b>[표]</b> 도구 줄이 나타납니다. 셀 여러 개를 마우스로 끌어서 고른 뒤 [합치기]를 누르면 하나로 합쳐지고, [나누기]로 다시 나눌 수 있습니다. 칸 사이의 세로선을 끌면 칸 너비가 바뀝니다.</p>' +
    '<h2>4. 알아 두실 점</h2>' +
    '<ol><li>고친 내용은 이 브라우저에만 자동 저장됩니다. 다른 기기에서 이어서 쓰려면 파일로 저장해 옮겨 주세요.</li>' +
    '<li>암호를 건 문서와 배포용 문서는 열 수 없습니다. 한글에서 해제한 뒤 다시 저장해 주세요.</li>' +
    '<li>수식, 차트, 글맵시 같은 특수 개체는 글자나 빈 상자로 보일 수 있습니다.</li>' +
    '<li>글꼴은 이 컴퓨터에 깔린 글꼴을 쓰고, 없으면 나눔명조·나눔고딕으로 대신 보여 줍니다. 저장할 때는 원래 글꼴 이름이 그대로 남습니다.</li></ol>' +
    '<p><br></p>' +
    '<p style="text-align:right">2026. 10. 14.</p>' +
    '<p style="text-align:right"><b>누리글</b></p>';
  NG.SAMPLE_SETTINGS = {
    page: NG.defaultPage(),
    header: { text: '누리글 사용 안내', align: 'right' },
    footer: null,
    pageNum: { pos: 'BOTTOM_CENTER', side: '-' }
  };
})(NG);
