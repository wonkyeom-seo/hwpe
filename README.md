# 실제 한글파일 뷰어 (Node.js)

이 프로젝트는 **실제 한글 문서 포맷인 `.hwp`, `.hwpx`**를 웹에서 확인하기 위한 뷰어입니다.

## 실행

```bash
node server.js
```

브라우저에서 `http://localhost:8080` 접속.

## 지원 범위

- `.hwpx` (권장)
  - ZIP 내부 `Contents/section*.xml`를 읽어 섹션별 본문 렌더링
  - 문서 표시 후 브라우저에서 수정 가능(contenteditable)
  - HTML/TXT 저장 가능
- `.hwp`
  - OLE2 시그니처 검사 후, 바이너리에서 추출 가능한 텍스트 우선 표시
  - 복잡한 표/도형/스타일 100% 재현은 불가

## 제공 기능

- 업로드 후 즉시 렌더링
- 섹션 정보/포맷 정보 표시
- 확대/축소
- 문서 내 찾기/전체 치환
- HTML/TXT 저장

## 구현 포인트

- 외부 npm 의존성 없이 Node.js 내장 모듈(`http`, `fs`, `child_process`) 기반
- `unzip` 명령으로 HWPX 본문 XML 추출
- 멀티파트 업로드 파서를 서버 내 자체 구현
