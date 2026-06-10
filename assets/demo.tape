# vhs tape — flex-fe-dev 대시보드 데모 캡처
# 실행: cd assets && vhs demo.tape
# 산출물: assets/demo.gif + 단계별 PNG 스틸
#
# 데모 모드(FLEX_FE_DEV_DEMO=1)로 띄운다 — 실제 yarn/dev/git 부작용 없이
# 가짜 앱이 합성 로그를 스트리밍하므로 빠르고 재현 가능하다.

Output demo.gif

Set Shell "zsh"
Set FontSize 16
Set Width 1280
Set Height 860
Set Theme "Catppuccin Mocha"
Set Padding 24

# ── 진입: 앱 선택(검색) ──
Type "FLEX_FE_DEV_DEMO=1 flex-fe-dev"
Enter
Sleep 2.5s
Screenshot app-select.png
Sleep 700ms

# ── host 추가: 검색 → 선택 → 브랜치 → run ──
Type "host"
Sleep 1.2s
Screenshot search.png
Sleep 400ms
Enter
Sleep 700ms
Type "main"
Sleep 500ms
Enter
Sleep 800ms
Screenshot action.png
Sleep 600ms
Enter
Sleep 2.4s

# ── ai(remote) main 추가 → 분할 로그(host + ai) ──
Type "a"
Sleep 700ms
Type "ai"
Sleep 1s
Enter
Sleep 700ms
Type "main"
Sleep 500ms
Enter
Sleep 700ms
Enter
Sleep 2.6s

# ── 같은 ai 의 다른 브랜치 추가 → parked 탭으로 (단일-포트 스왑) ──
Type "a"
Sleep 600ms
Type "ai"
Sleep 900ms
Enter
Sleep 600ms
Type "feat/login"
Sleep 600ms
Enter
Sleep 600ms
Enter
Sleep 1.8s
Screenshot dashboard.png

# ── Enter 로 parked 브랜치를 :3022 에 전환(스왑) ──
Sleep 1.2s
Enter
Sleep 2.6s

# ── x 로 focused 브랜치 끄기 ──
Type "x"
Sleep 1.6s

# ── Ctrl+C 로 전체 종료(고아 정리) ──
Ctrl+C
Sleep 1s
