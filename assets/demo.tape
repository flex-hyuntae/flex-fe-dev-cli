# vhs tape — flex-fe-dev TUI 데모 캡처
# 실행: cd assets && vhs demo.tape
# 산출물: assets/demo.gif + 단계별 PNG 스틸

Output demo.gif

Set Shell "zsh"
Set FontSize 18
Set Width 1200
Set Height 760
Set Theme "Catppuccin Mocha"
Set Padding 20

# 메뉴 진입
Type "flex-fe-dev"
Enter
Sleep 2.5s
Screenshot app-select.png
Sleep 800ms

# 검색 — payroll 로 필터
Type "payroll"
Sleep 1500ms
Screenshot search.png
Sleep 500ms
Backspace 7
Sleep 500ms

# 앱 선택 → 브랜치(main=base) → 액션 메뉴
Type "home"
Sleep 800ms
Enter
Sleep 800ms
Type "main"
Sleep 500ms
Enter
Sleep 1500ms
Screenshot action.png
Sleep 800ms
