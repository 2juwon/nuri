# 누리글 (nuri)

한글(.hwp · .hwpx) 문서를 웹 브라우저에서 열고, 쪽 모양 그대로 고치고, 다시 저장하는 무료 문서 편집기입니다. 설치나 회원 가입 없이 `index.html` 한 파일로 돌아갑니다.

- 바로 쓰기: GitHub Pages를 켜면 `https://2juwon.github.io/nuri/` (저장소 Settings → Pages → Branch `main` / `root`)
- claude.ai 버전: https://claude.ai/artifact/WLYfaSu23vYcQUnE9FiF44

## 할 수 있는 일

| 구분 | 내용 |
| --- | --- |
| 열기 | .hwp(한글 5.0 형식), .hwpx, .html(누리글이 저장한 것은 쪽 설정까지), .txt — 파일을 창에 끌어다 놓아도 열림 |
| 저장 | 한글 문서 .hwpx, Word .docx, PDF(인쇄 창에서 "PDF로 저장"), 웹 문서 .html |
| 글자·문단 | 글꼴·크기, 진하게·기울임·밑줄·취소선·위아래 첨자, 글자 색, 형광펜, 정렬 5가지, 줄 간격, 글머리표·번호, 들여/내어쓰기, 문단 모양 |
| 표 | 줄·칸 넣고 지우기, 셀 끌어서 고르기, 합치기, 나누기, 배경색, 테두리, 세로 정렬, 칸 경계 끌어 너비 조절, Tab으로 다음 칸 |
| 그림·도형 | 파일·붙여넣기·끌어 놓기, 모서리 끌어 크기 조절, 글자처럼 / 왼쪽·오른쪽 두르기 / 가운데, 도형 6가지 |
| 쪽 | 용지(A4·A3·B4·B5·레터·사용자 정의)와 방향, 여백, 머리말·꼬리말, 쪽 번호, 쪽 나누기(Ctrl+Enter) |
| 그 밖 | 되돌리기 200단계, 찾기·바꾸기, 쪽 보기 / 화면 맞춤 보기, 확대·축소, 이 브라우저에 자동 저장(그림은 IndexedDB) |

단축키: Ctrl+S 저장(.hwpx) · Ctrl+O 열기 · Ctrl+P 인쇄 · Ctrl+F 찾기 · Ctrl+Z / Ctrl+Y · Ctrl+B / I / U · Ctrl+Enter 쪽 나누기

## 알아 둘 점

- 암호를 건 문서와 배포용 문서는 열 수 없습니다.
- 수식·차트·글맵시는 글자나 빈 상자로 보입니다. 다단, 탭 위치, 문단 테두리는 아직 옮기지 않습니다.
- 쪽 전체에 깔린 배경 그림(글 뒤·글 앞 배치)은 빼고 엽니다. WMF·EMF 그림은 빈 상자로 바뀝니다.
- 저장한 .hwpx는 한컴 OWPML 스키마 검사와 [python-hwpx](https://pypi.org/project/python-hwpx/)의 열기 안전성 검사, 자바 [hwpxlib](https://github.com/neolord0/hwpxlib) 읽기로 확인했습니다. 실제 한컴오피스에서 열어 본 시험은 아직 하지 못했습니다.
- claude.ai 버전에서는 `.hwpx` 이름으로 내려받기가 막혀 있어 `.hwpx.zip`으로 받아집니다. 끝의 `.zip`만 지우면 됩니다. GitHub Pages 버전은 그대로 `.hwpx`로 받아집니다.

## 구조

외부 라이브러리는 CDN의 [JSZip](https://stuk.github.io/jszip/)(zip)과 [pako](https://github.com/nodeca/pako)(압축 풀기)만 씁니다. PDF는 claude.ai 안에서만 html2canvas·jsPDF를 그때그때 불러옵니다.

```
src/
  core.js            단위(HWPUNIT·mm·px), 글꼴 대체, 바이너리 읽기, CFB(복합 문서) 읽기
  hwp.js             .hwp(5.0 바이너리) → 문서 모델
  hwpx-read.js       .hwpx → 문서 모델
  hwpx-template.js   한컴 빈 문서 틀(header·section·content.hpf 등)
  hwpx-write.js      문서 모델 → .hwpx
  docx-write.js      문서 모델 → .docx
  dom.js             문서 모델 ↔ 편집 화면(HTML), 그림 보관함
  editor.js          편집기: 쪽 나누기 엔진, 되돌리기, 서식, 표, 그림·도형, 찾기
  sample.js          처음 보이는 예시 문서
  app.js             도구 모음, 대화 상자, 파일 열기·저장, 자동 저장
  ui.html            화면 틀과 스타일
build.js             src를 한 파일로 묶음 → index.html(Pages), dist/artifact.html(claude.ai)
```

공통 문서 모델은 `page`(용지·여백) / `header`·`footer` / `pageNum` / `blocks`(문단 `p`, 표 `table`, 글상자 `box`) / `bins`(그림 바이트)이고, 길이 단위는 HWPUNIT(1pt = 100, 1mm ≈ 283.46)입니다.

쪽 나누기는 편집 영역을 하나로 두고, 쪽 경계를 넘는 줄 앞에 높이를 가진 빈 칸(`.ng-gap`)을 끼우거나 문단 위 여백(`.ng-pushed`)을 늘려 다음 쪽으로 밀어내는 방식입니다. 표는 줄 단위로 나누고, 병합 셀이 걸치면 그 위에서 나눕니다. 인쇄할 때는 이 자리들이 강제 쪽 나눔이 되어 화면과 같은 쪽 구성이 나옵니다.

## 고치고 다시 만들기

```bash
npm install          # 시험용 라이브러리
# src/ 고치기
node build.js        # index.html, dist/artifact.html 다시 만듦
```

시험:

```bash
node test/dump.js 문서.hwp              # 문서 모델을 글로 펼쳐 보기
node test/roundtrip.js 문서.hwp 문서.hwpx  # 읽기 → hwpx 저장 → 다시 읽기 비교 (OUT=폴더)
python3 test/t4.py                      # 브라우저(Playwright)로 표·그림·쪽 설정·저장 왕복
```

브라우저 시험은 Playwright(Chromium)가 필요하고, CDN 요청을 `node_modules`의 같은 파일로 바꿔 끼워 오프라인에서도 돕니다.
