# flex-fe-dev-cli

flex frontend dev 런처. 작업할 앱과 브랜치를 고르면 worktree 를 해석/생성하고 dev 서버를 띄우거나(VS Code 로) 연다.

flex 프론트 레포는 부모 레포(`flex-frontend-repositories`) 아래 submodule 들로 묶여 있고, 작업은 각 submodule 의 worktree 에 격리한다. 이 도구는 그 흐름(앱 → 브랜치 → worktree → run/open)을 한 곳에서 처리한다.

## 두 가지 사용법

### 1. TUI — `flex-fe-dev`

계속 떠 있는 대화형 런처. 앱을 고르고 → 브랜치를 입력하고 → run/open 을 고른다.

```bash
flex-fe-dev
```

- **앱 선택**: 부모 레포 안 모든 submodule 의 `web-applications/{remotes-*, host}` 를 스캔해 목록으로 보여준다. 타이핑하면 즉시 필터링된다. `host` 는 MF host 앱(`@flex-apps/host`)으로 다룬다.
- **브랜치 입력**: default branch 면 submodule 본체를 그대로 쓰고, 그 외엔 체크아웃된 worktree 를 찾거나(없으면 origin 에서 자동 생성).
- **run**: `yarn install` → `.env.local` 보장 → `yarn turbo run dev --filter <workspace>` 를 foreground 로 실행.
- **open**: VS Code 로 해당 디렉토리를 연다 (TUI 는 그대로 유지).
- 단축키: 앱 선택에서 **타이핑 검색** · `↑↓` 이동 · `Enter` 선택 · `Esc` 뒤로(앱 단계에선 종료) · `Ctrl+C` 종료.

### 2. one-shot — `flex-fe-dev-run` / `flex-fe-dev-open` (legacy)

인자를 바로 주는 bash 스크립트. TUI 의 전신이며 `legacy/` 에 있다.

```bash
flex-fe-dev-run [--no-open] <app> <branch>   # worktree 진입 + code + dev 서버
flex-fe-dev-open <app> <branch>              # worktree 를 VS Code 로 열기만
```

`<app>` 은 remote 이름(`brain`, `ai`, `custom-page` …) 또는 `host`. `remotes-` / `@flex-apps/remotes-` 접두사를 붙여도 정규화된다.

## 설치

```bash
./install.sh
```

`~/.local/bin` 에 `flex-fe-dev`, `flex-fe-dev-run`, `flex-fe-dev-open` 을 symlink 한다.

## 환경변수

| 변수 | 기본값 | 의미 |
|---|---|---|
| `FLEX_ROOT` | `$HOME/Projects/flex` | flex 레포들의 루트 |
| `FLEX_PARENT_REPO` | `$FLEX_ROOT/flex-frontend-repositories` | submodule 들이 묶인 부모 레포 |

## 구조

```
bin/flex-fe-dev      TUI 진입점 (node --import tsx src/cli.tsx)
src/cli.tsx          render + run 핸드오프
src/ui/App.tsx       앱 → 브랜치 → run/open 상태 머신
src/core/apps.ts     submodule 스캔 → AppInfo 목록
src/core/worktree.ts worktree 해석/자동 생성
src/core/actions.ts  run(dev) / open(code) / .env.local 보장
legacy/              bash one-shot 스크립트 (TUI 전신)
```

TUI 와 legacy 는 동일한 해석 규칙(default branch → 본체, 그 외 → worktree, host 특수 케이스)을 따른다.
