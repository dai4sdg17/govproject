# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**"딱맞는지원" — 나에게 맞는 정부지원사업 찾기 웹앱.**
내 조건(지역·년차·분야·회사 특징)을 입력하면 그에 맞는 정부지원사업을 자동으로
필터링해 제시하는 **백엔드 없는 클라이언트 웹앱**. 데이터는 브라우저 `localStorage`에
저장한다. 1차 타깃은 IT/SW 초기 스타트업.

- 제품 요구사항: **`PRD.md`** (한 장짜리 MVP — 이 프로젝트의 기준 문서)
- 구현 계획: **`PLAN.md`**
- 자동 수집(선택): **`README-자동수집.md`** + `update-data.ps1` (B안)
- 확장 비전(참조용): `PRD-saas-full.md` (크롤링·AI 제안서·SaaS — **현 범위 밖**)

> 코드가 생기면 실제 구조(모듈·데이터 흐름)를 이 문서에 반영해 갱신한다.

## 언어 및 커뮤니케이션 규칙

- 기본 응답 언어: 한국어
- 코드 주석: 한국어로 작성
- 커밋 메시지: 한국어로 작성
- 문서화: 한국어로 작성
- 변수명/함수명: 영어 (코드 표준 준수)

## 핵심 설계 제약 (PRD 기준)

- **순수 클라이언트**: 서버·DB·로그인·과금 없음. 외부 의존성 없는 바닐라 HTML/CSS/JS.
- **저장소는 localStorage만**:
  - `user_conditions` — 내 입력 조건(지역·년차·분야·회사 특징)
  - `favorites` — 관심 사업 목록
  - `last_updated` — 마지막 갱신 시각(표시용)
  - `last_checked` — 직전 접속일(YYYY-MM-DD). '마지막 확인 이후 새 공고' 판별 기준.
    앱 시작 시 직전 값을 읽어 신규 판별 후 오늘 날짜로 갱신한다.
- **공고 데이터는 샘플 JSON**(정적 번들). 실제 크롤링/Open API 연동은 범위 밖.
- **"주기적 서칭" = 앱 열 때 갱신**. 백그라운드 타이머·푸시 알림 없음.
- **범위 밖(만들지 말 것)**: 크롤링/API, AI 제안서 작성, 회원/멀티유저/서버, 푸시알림, HWP 처리.

## 실행 및 개발

- 실행: `index.html`을 브라우저에서 직접 열기 (빌드/설치 과정 없음).
  PowerShell: `Start-Process index.html`
- **이 환경 주의**: `node`, `python` 은 Windows 스토어 스텁이라 실행되지 않는다
  (호출 시 exit 49). npm·번들러·로컬 HTTP 서버·테스트 러너 사용 불가.
  → 외부 의존성 없는 순수 클라이언트 구현을 유지한다.
- 순수 JS 로직 검증이 필요하면 **cscript의 JScript(ES3)** 로 한다. cscript는 UTF-8을
  시스템 코드페이지로 오인하므로 테스트 스크립트를 **UTF-16(Unicode)로 저장한 뒤**
  실행한다. (절차: 형제 프로젝트 `../calcurator/CLAUDE.md` 참조.)
- `fetch`로 로컬 JSON을 읽을 때 `file://`에서 CORS 차단될 수 있으므로, 샘플 데이터는
  **JS 파일에 객체로 임베드**(예: `data.js`의 `const PROGRAMS = [...]`)하는 것을 우선 고려.

## 구조 방침

역할별 파일 분리 (워크스페이스 공통 패턴).

- `index.html` — 4개 화면(조건 입력 / 결과 목록 / 상세 / 관심 목록)의 마크업·구조.
- `style.css` — 레이아웃·시각 스타일.
- `script.js` — 앱 로직: localStorage 입출력, 필터·적합도 정렬, 화면 전환, 렌더링.
- `data.js` (또는 `data.json`) — 정부지원사업 샘플 데이터.

데이터 흐름은 **입력 → 상태(조건/공고/관심) → 필터·스코어링 → 렌더링**의 단방향을
유지한다. 상태는 한곳(예: `state` 객체)에 모으고, localStorage는 상태의 영속 계층으로만 쓴다.

## 데이터 모델 (`data.js`)

공고(program) 객체 핵심 필드:
`id, title, source(기관), category(분야), region, minYears/maxYears(업력 요건),
amount, period_start, period_end(실제 마감일 YYYY-MM-DD 또는 null=추후공지),
verified(실제공고 여부), checked_at(확인일), source_url, keywords[]`

- **마감일은 실제 날짜**(`period_end`)를 쓰고, `script.js`가 오늘 기준 D-day를 계산하며
  마감 지난 공고는 결과에서 제외한다. `null`이면 "마감일 추후공지"로 표시.
- **날짜 파싱은 `"YYYY-MM-DD".split('-')` 수동 분해**로 한다 (`new Date(isoString)`는
  cscript 등 ES3 엔진에서 NaN — 양쪽 호환 위해 수동 파싱 유지).
- 데이터는 **실제 공고 스냅샷**. 갱신 방법 2가지:
  1. **수동**: 실제 공고를 확인해 `data.js`를 직접 편집 (`checked_at`에 확인일 기록).
  2. **자동(B안)**: `update-data.ps1`이 기업마당 Open API를 호출해 `data.js`를 재생성,
     Windows 작업 스케줄러로 매일 실행. (`apikey.txt`에 인증키 필요. `README-자동수집.md` 참조)
- **주의**: `update-data.ps1`은 **UTF-8 BOM**으로 저장해야 PowerShell 5.1이 한글을 깨지 않는다.
  (Write/Edit 도구로 수정하면 BOM이 빠지므로, 수정 후 BOM으로 재인코딩할 것)
