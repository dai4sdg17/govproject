# PLAN — "딱맞는지원" 구현 계획

> 기준 문서: `PRD.md` (한 장짜리 MVP) · 작성일 2026-06-27
> 원칙: 순수 HTML/CSS/JS, 백엔드 없음, localStorage 저장, 샘플 JSON 데이터.

## 진행 현황 (2026-06-27)
- ✅ **Phase 1~4 구현 완료** — `data.js`, `index.html`, `style.css`, `script.js` 생성.
- ✅ **Phase 5.2 로직 검증** — cscript(JScript)로 지역/업력 필터·적합도 점수·정렬 8/8 PASS.
- ⏳ **Phase 5.3** — 브라우저에서 재방문/localStorage 유지 수동 확인 (사용자 환경에서 진행).
- 참고: "마감 지난 공고 흐리게" 대신 **자격 필터에서 제외**하는 방식으로 구현함.
- ✅ **데이터 실제화** — 샘플 상대날짜 → 기업마당/K-Startup 실제 공고 마감일(`period_end`)로 교체, `verified`·`checked_at` 추가. 날짜 검증 11/11 PASS.
- ✅ **신규 공고 diff** — `last_checked` 저장 → 접속 시 '마지막 확인 이후 새 공고' 배너·NEW 배지·'새 공고만 보기' 토글. 검증 7/7 PASS.
  - 신규 표시는 **A안(앱 열 때만 갱신)** 기반.
- ✅ **자동 수집(B안) 추가** — `update-data.ps1`(기업마당 Open API → `data.js` 재생성) + Windows 작업 스케줄러 매일 실행. `README-자동수집.md`에 설정 절차. node/python 불필요.
  - 검증: PowerShell 파싱 정상, 신청기간 파싱 4종 형식 통과(소진시까지→null 포함). 실제 호출은 사용자 인증키(`apikey.txt`) 필요.
  - 한계: API가 지역·업력·금액을 정형 제공하지 않아 해당 필드는 기본값(공고문 확인 권장).

## 0. 산출물(파일 구성)
```
govproject/
├── index.html   # 4개 화면 마크업 (SPA, 섹션 전환)
├── style.css    # 레이아웃·스타일
├── script.js    # 앱 로직 (상태·필터·스코어링·localStorage·렌더링)
├── data.js      # 정부지원사업 샘플 데이터 (const PROGRAMS = [...])
├── PRD.md / PLAN.md / CLAUDE.md
```
> `file://`에서 fetch CORS 회피를 위해 데이터는 `data.js`에 객체로 임베드.

---

## 1. 단계별 구현 (작은 단위로 검증하며 진행)

### Phase 1 — 데이터 & 뼈대
- [ ] **1.1** `data.js`에 샘플 공고 8~12건 작성 (IT/SW 분야 중심, 마감일·지역·업력 요건 다양하게)
  - 필드: `id, title, source, category, region, target_maxYears, amount, period_end, source_url, keywords[]`
- [ ] **1.2** `index.html` 골격 + 4개 섹션(`#input` `#results` `#detail` `#favorites`)과 탭 내비
- [ ] **1.3** `style.css` 기본 레이아웃·카드·반응형(모바일 폭 대응)

### Phase 2 — 조건 입력 & 저장 (핵심기능 ①)
- [ ] **2.1** 조건 입력 폼: 지역(셀렉트), 년차(숫자), 분야(다중 체크), 회사 특징(textarea)
- [ ] **2.2** [내 조건 저장] → `localStorage.user_conditions` 저장
- [ ] **2.3** 앱 로드 시 저장된 조건 자동 복원(재방문 유지)

### Phase 3 — 필터링·매칭·제시 (핵심기능 ②)
- [ ] **3.1** 자격 필터: 지역 일치(또는 전국), 년차 ≤ `target_maxYears`, 마감 미경과
- [ ] **3.2** 적합도 점수: 분야 일치 + 회사 특징 키워드 ↔ 공고 `keywords` 매칭 수(간이 스코어)
- [ ] **3.3** 결과 목록을 적합도 순 카드로 렌더 + 적합 배지/마감임박 배지
- [ ] **3.4** 결과 0건 시 **조건 완화 제안** 메시지 노출
- [ ] **3.5** 카드 클릭 → 상세(#detail): 요건 충족/미충족 표시, 원문 링크

### Phase 4 — 갱신 & 관심 저장 (핵심기능 ③④)
- [ ] **4.1** 앱 열 때 데이터 다시 읽어 재필터 + `last_updated` 표시
- [ ] **4.2** [관심 저장] 토글 → `localStorage.favorites`
- [ ] **4.3** 관심 목록 화면(#favorites): 저장 공고, 마감 임박 정렬

### Phase 5 — 마무리
- [ ] **5.1** 빈 상태/에러 처리, 마감 지난 공고 흐리게
- [ ] **5.2** cscript(JScript, UTF-16 저장)로 필터·스코어링 순수 로직 검증
- [ ] **5.3** 브라우저에서 재방문·새로고침 시 조건/관심 유지 수동 확인
- [ ] **5.4** CLAUDE.md에 실제 모듈 구조 반영

---

## 2. 데이터 흐름 (단방향)
```
localStorage ──load──▶ state{conditions, programs, favorites}
                          │
        입력/이벤트 ──────▶ filter() + score()  ──▶ render()
                          │
state 변경 ──save──▶ localStorage
```

## 3. 검증 기준 (PRD 성공 기준 대응)
- 조건 입력 → 즉시(체감 3초 내) 목록 제시
- 결과 0건 → 조건 완화 제안 노출
- 재방문/새로고침 → 조건·관심 유지

## 4. 범위 밖 (이번에 만들지 않음)
크롤링/Open API · AI 제안서 · 회원/서버/과금 · 푸시 알림 · HWP 처리.
(확장 비전은 `PRD-saas-full.md` 참조)

## 5. 권장 진행 순서
**Phase 1 → 2 → 3** 까지가 핵심 데모(조건 넣고 맞는 사업 보기). 4·5는 완성도.
각 Phase 끝에서 브라우저로 열어 동작 확인 후 다음으로 진행.
