# 매일 자동 수집 설정 (B안: PowerShell + Windows 작업 스케줄러)

브라우저 앱은 닫혀 있으면 동작하지 못하므로, **PowerShell이 매일 기업마당 Open API를 호출해 `data.js`를 갱신**하고, 사용자는 앱을 열 때 "마지막 확인 이후 새 공고"를 보게 됩니다. (Node/Python 불필요)

```
[작업 스케줄러] --매일--> [update-data.ps1] --API 호출--> [data.js 갱신]
                                                              │
                                          사용자가 index.html 열기 → 새 공고 표시
```

## 1단계 — 인증키(crtfcKey) 발급
1. https://www.bizinfo.go.kr 회원가입 후 로그인
2. **[활용정보] > [정책정보 개방] > '지원사업정보 API'** 메뉴에서 인증키 신청
3. 발급받은 키 문자열을 복사

> 기업마당 자체 인증키라 data.go.kr 별도 등록은 필요 없습니다. (발급은 보통 즉시~수일)

## 2단계 — 키 저장
프로젝트 폴더에 **`apikey.txt`** 파일을 만들고 키를 **한 줄**로 저장:
```
C:\Users\dream\my-work\govproject\apikey.txt
```
> ⚠️ `apikey.txt`는 개인 키이므로 외부에 공유/업로드하지 마세요.

## 3단계 — 수동 실행 테스트
PowerShell에서:
```powershell
cd C:\Users\dream\my-work\govproject
powershell -NoProfile -ExecutionPolicy Bypass -File .\update-data.ps1
```
- 성공 시: `data.js 갱신 완료: N건` 출력, `data.js.bak`(백업)과 `last_raw.json`(원본 응답) 생성.
- **첫 실행 후 `last_raw.json`을 열어** 실제 응답 필드명이 스크립트 매핑과 맞는지 확인하세요.
  (필드명이 다르면 `update-data.ps1`의 `$it.pblancNm` 등 키 이름만 조정)

옵션:
```powershell
.\update-data.ps1 -Count 200            # 더 많이 가져오기
.\update-data.ps1 -Keyword "AI,SaaS"    # 해시태그 필터
```

## 4단계 — 매일 자동 실행 등록 (작업 스케줄러)
관리자 PowerShell에서 한 줄로 등록 (매일 오전 9시):
```powershell
schtasks /Create /SC DAILY /ST 09:00 /TN "GovProject-공고갱신" /F /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Users\dream\my-work\govproject\update-data.ps1\""
```
확인 / 즉시 실행 / 삭제:
```powershell
schtasks /Query /TN "GovProject-공고갱신"     # 등록 확인
schtasks /Run   /TN "GovProject-공고갱신"     # 지금 한 번 실행
schtasks /Delete /TN "GovProject-공고갱신" /F  # 삭제
```

> ⚠️ **git 인증 주의**: 스크립트는 변경 시 자동으로 `git push` 합니다. 이 푸시는 Windows
> 자격증명 관리자에 저장된 GitHub 토큰을 사용하므로, 작업을 **현재 로그인 사용자로,
> "사용자가 로그온할 때만 실행"** 설정으로 등록해야 인증이 됩니다. (다른 계정/로그오프
> 상태로 돌리면 자격증명을 못 찾아 푸시가 실패할 수 있습니다.) 푸시 없이 로컬만 갱신하려면
> 스케줄 명령 끝에 `-NoPush` 를 붙이세요.

## 동작 결과 (자동 배포까지)
1. 매일 09:00 스크립트가 기업마당 API 호출 → 공고 내용이 **바뀐 경우에만** `data.js` 갱신.
2. 변경 시 자동으로 `git commit` + `git push origin main`.
3. GitHub Pages가 자동 재빌드(~1분) → **https://dai4sdg17.github.io/govproject/** 에 즉시 반영.
4. 사용자가 사이트를 열면 **"마지막 확인 이후 새 공고 N건"** 배너 + `✦ NEW` 배지가 실제로 의미를 갖습니다.

> 변경이 없으면 "변경 없음 — 커밋 생략"으로 끝나 불필요한 커밋이 쌓이지 않습니다.

## 한계 (정직하게)
- 기업마당 API는 **지역·업력 요건·지원금액을 정형 데이터로 주지 않습니다.**
  → 스크립트는 `region="전국"`, `minYears=0/maxYears=99`, `amount="공고문 참조"` 기본값을 넣습니다.
  → 즉 **지역·업력 필터의 정밀도는 떨어집니다**(분야·키워드 매칭은 정상). 정확한 요건은 공고문 확인 필요.
- API 응답 필드명이 변경되면 `last_raw.json`을 보고 매핑을 조정해야 합니다.
- 더 정밀한 지역/업력 필터가 필요하면 공고 상세 파싱이 필요하고, 이는 백엔드(C안) 영역입니다.
