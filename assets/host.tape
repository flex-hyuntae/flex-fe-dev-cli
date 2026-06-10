# vhs tape — host 띄우기 데모
# 실행: cd assets && vhs host.tape  → 산출물: assets/host.gif
# 데모 모드(FLEX_FE_DEV_DEMO=1): 실제 yarn/dev/git 부작용 없이 가짜 앱이 합성 로그를 스트리밍.

Output host.gif

Set Shell "zsh"
Set FontSize 20
Set Width 1120
Set Height 640
Set Theme "Catppuccin Mocha"
Set Padding 20

Type "FLEX_FE_DEV_DEMO=1 flex-fe-dev"
Enter
Sleep 2s

# host 검색 → 선택
Type "host"
Sleep 1s
Enter
Sleep 600ms

# 브랜치 → run
Type "main"
Sleep 500ms
Enter
Sleep 700ms
Enter
Sleep 4s

# 잠깐 더 스트리밍을 보여주고 종료
Sleep 1.5s
