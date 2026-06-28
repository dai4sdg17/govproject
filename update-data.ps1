# update-data.ps1 — 기업마당 Open API로 data.js 자동 갱신 (B안: 매일 자동 수집)
# 실행: powershell -NoProfile -ExecutionPolicy Bypass -File update-data.ps1
# 사전 준비: bizinfo.go.kr 인증키(crtfcKey)를 apikey.txt 에 한 줄로 저장.
# Node/Python 불필요 — PowerShell이 직접 공개 API를 호출(브라우저 아님 → CORS 무관).

param(
  [int]$Count = 100,                              # 가져올 공고 수
  [string]$Keyword = "",                          # 해시태그/키워드 필터(선택)
  [string]$KeyFile = "$PSScriptRoot\apikey.txt",  # 인증키 파일
  [string]$OutFile = "$PSScriptRoot\data.js"      # 출력 파일
)
$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "GovProject 공고 자동 갱신"

# ── 1. 인증키 로드 ───────────────────────────────────────────
if (-not (Test-Path $KeyFile)) {
  Write-Host "[안내] 인증키 파일이 없습니다: $KeyFile"
  Write-Host "  1) https://www.bizinfo.go.kr 회원가입 후 로그인"
  Write-Host "  2) [활용정보] > [정책정보 개방] > '지원사업정보 API' 에서 인증키(crtfcKey) 발급"
  Write-Host "  3) 발급받은 키를 다음 파일에 한 줄로 저장: $KeyFile"
  exit 1
}
$crtfcKey = (Get-Content $KeyFile -Raw).Trim()
if (-not $crtfcKey) { Write-Host "[오류] apikey.txt 가 비어 있습니다."; exit 1 }

# ── 2. API 호출 ──────────────────────────────────────────────
$base = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
$url  = "$base`?crtfcKey=$crtfcKey&dataType=json&searchCnt=$Count"
if ($Keyword) { $url += "&hashtags=" + [uri]::EscapeDataString($Keyword) }
Write-Host "[1/4] API 호출 중..."
try {
  $resp = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
} catch {
  Write-Host "[오류] API 호출 실패: $($_.Exception.Message)"; exit 1
}

# ── 3. 항목 추출 (응답 구조 방어) ────────────────────────────
$items = $resp.jsonArray
if (-not $items) {
  $raw = Join-Path $PSScriptRoot "last_raw.json"
  $resp | ConvertTo-Json -Depth 8 | Out-File $raw -Encoding utf8
  Write-Host "[오류] 응답에 jsonArray가 없습니다. 원본을 저장했습니다: $raw"
  Write-Host "       이 파일에서 실제 필드명을 확인해 매핑을 조정하세요."
  exit 1
}
# 첫 실행 검증용 원본 덤프
$resp | ConvertTo-Json -Depth 8 | Out-File (Join-Path $PSScriptRoot "last_raw.json") -Encoding utf8
Write-Host "[2/4] 수신 공고 수: $($items.Count)"

# ── 4. 변환 헬퍼 ─────────────────────────────────────────────
# 신청기간 문자열 → period_start / period_end (YYYY-MM-DD). 날짜 아닌 표현은 null.
function Parse-Period([string]$s) {
  $res = @{ start = $null; end = $null }
  if (-not $s) { return $res }
  $parts = $s -split "~"
  $norm = {
    param($x)
    if (-not $x) { return $null }
    $x = $x.Trim()
    # 20260301 또는 2026-03-01 또는 2026.03.01 형태만 추출
    $m = [regex]::Match($x, '(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})')
    if ($m.Success) { return "$($m.Groups[1].Value)-$($m.Groups[2].Value)-$($m.Groups[3].Value)" }
    return $null   # '소진시까지', '예산소진시', '추후공지' 등 → null
  }
  $res.start = & $norm $parts[0]
  if ($parts.Count -gt 1) { $res.end = & $norm $parts[1] }
  return $res
}

# 지원분야 대분류명 → 앱 카테고리
function Map-Category([string]$c) {
  if (-not $c) { return "기타" }
  if ($c -match "금융|자금|융자") { return "자금" }
  if ($c -match "기술|R&D|연구") { return "R&D" }
  if ($c -match "창업")          { return "창업" }
  if ($c -match "인력|고용")      { return "인력" }
  if ($c -match "수출|판로|내수|글로벌") { return "판로" }
  return "기타"
}

# 등록일시 → YYYY-MM-DD
function Parse-Posted([string]$s) {
  if (-not $s) { return $null }
  $m = [regex]::Match($s, '(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})')
  if ($m.Success) { return "$($m.Groups[1].Value)-$($m.Groups[2].Value)-$($m.Groups[3].Value)" }
  return $null
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$programs = @()
foreach ($it in $items) {
  $period = Parse-Period ([string]$it.reqstBeginEndDe)
  $url2 = [string]$it.pblancUrl
  if ($url2 -and $url2.StartsWith("/")) { $url2 = "https://www.bizinfo.go.kr$url2" }

  $kw = @()
  if ($it.hashtags) { $kw = ([string]$it.hashtags) -split "[,\s]+" | Where-Object { $_ } }

  $programs += [ordered]@{
    id           = [string]$it.pblancId
    title        = [string]$it.pblancNm
    source       = [string]$it.jrsdInsttNm
    category     = Map-Category ([string]$it.pldirSportRealmLclasCodeNm)
    region       = "전국"          # API가 지역을 정형 제공하지 않음 → 기본 전국 (한계)
    minYears     = 0
    maxYears     = 99              # API가 업력 요건을 정형 제공하지 않음 → 미제한 (한계)
    amount       = "공고문 참조"
    period_start = $period.start
    period_end   = $period.end
    posted_at    = Parse-Posted ([string]$it.creatPnttm)
    verified     = $true
    checked_at   = $today
    source_url   = $url2
    keywords     = $kw
  }
}

# ── 5. data.js 생성 (기존 백업) ──────────────────────────────
if (Test-Path $OutFile) { Copy-Item $OutFile "$OutFile.bak" -Force }

# 1건이어도 배열로 직렬화
$json = ConvertTo-Json @($programs) -Depth 5
$header = "// 자동 생성: update-data.ps1 (기업마당 지원사업정보 API)`r`n" +
          "// 생성 시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · 공고 $($programs.Count)건`r`n" +
          "// region/minYears/maxYears/amount 는 API 미제공 항목 → 기본값(공고문 확인 권장)`r`n"
$content = $header + "const PROGRAMS = " + $json + ";`r`n"

# UTF-8 (BOM 없이) 저장 — 브라우저 <script> 호환
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutFile, $content, $enc)

Write-Host "[3/4] data.js 갱신 완료: $($programs.Count)건"
Write-Host "[4/4] 백업: $OutFile.bak | 원본응답: last_raw.json"
Write-Host "완료. 브라우저에서 index.html 을 새로고침하세요."
