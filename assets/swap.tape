# vhs tape — 같은 ai 여러 브랜치 단일-포트 스왑 데모
# 실행: cd assets && vhs swap.tape  → 산출물: assets/swap.gif
# 데모 모드(FLEX_FE_DEV_DEMO=1): 실제 yarn/dev/git 부작용 없이 가짜 앱이 합성 로그를 스트리밍.

Output swap.gif

Set Shell "zsh"
Set FontSize 20
Set Width 1120
Set Height 700
Set Theme "Catppuccin Mocha"
Set Padding 20

Type "FLEX_FE_DEV_DEMO=1 flex-fe-dev"
Enter
Sleep 2s

# ai main 띄우기
Type "ai"
Sleep 900ms
Enter
Sleep 500ms
Type "main"
Sleep 400ms
Enter
Sleep 600ms
Enter
Sleep 2.6s

# 같은 ai 의 다른 브랜치 추가 → parked 탭으로 등록
Type "a"
Sleep 500ms
Type "ai"
Sleep 800ms
Enter
Sleep 500ms
Type "feat/login"
Sleep 500ms
Enter
Sleep 500ms
Enter
Sleep 2.2s

# Enter — parked(feat/login)를 :3022 에 전환 → main 은 parked 로
Enter
Sleep 3s

# ← 로 main 탭 선택 후 Enter — 다시 main 으로 전환(같은 포트)
Left
Sleep 1.2s
Enter
Sleep 3s
Sleep 1s
