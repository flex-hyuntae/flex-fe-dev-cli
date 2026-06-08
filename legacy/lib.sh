# lib.sh — flex-fe-dev-* 공용: remote 정규화 + 레이아웃 해석 + worktree 해석
#
# 사용처에서 source 한 뒤:
#   remote=$(normalize_remote "$1")
#   branch="$2"
#   resolve_app_layout            # 전역 app_subdir / workspace 채움
#   target=$(resolve_worktree)    # 실패 시 비정상 종료 (set -e 전제)

FLEX_ROOT="${FLEX_ROOT:-$HOME/Projects/flex}"
PARENT_REPO="${FLEX_PARENT_REPO:-$FLEX_ROOT/flex-frontend-repositories}"

normalize_remote() {
  local name="$1"
  name="${name#@flex-apps/}"
  name="${name#remotes-}"
  printf '%s' "$name"
}

# remote 전역을 읽어 디렉토리/워크스페이스 레이아웃을 전역 app_subdir / workspace 로 채운다.
#   - 도메인 remote : web-applications/remotes-<name>, 워크스페이스 @flex-apps/remotes-<name>
#   - host          : web-applications/host,           워크스페이스 @flex-apps/host
#     (host 는 MF host 앱이라 'remotes-' 접두사 경로 규칙을 따르지 않는다)
# NOTE: resolve_worktree 가 command substitution(subshell)으로 실행돼 그 안의 전역 set 은
#       부모로 전파되지 않는다. 이 함수는 반드시 호출하는 쪽(부모 셸)에서 먼저 실행해야
#       subshell 과 이후 단계가 모두 app_subdir 를 상속받는다.
resolve_app_layout() {
  case "$remote" in
    host)
      app_subdir="host"
      workspace="@flex-apps/host"
      ;;
    *)
      app_subdir="remotes-$remote"
      workspace="@flex-apps/remotes-$remote"
      ;;
  esac
}

# app_subdir / branch 전역을 읽어 작업 디렉토리 경로를 stdout 으로 출력한다.
# - branch 가 base(default) branch 면 submodule 본체를 그대로 반환한다.
# - worktree 가 없고 origin 에 브랜치가 있으면 sibling worktree 를 자동 생성한다.
resolve_worktree() {
  # 1. 앱이 속한 submodule 본체 찾기 (부모 레포 안)
  #    submodule 본체에서 worktree list 를 돌리면 그 submodule 의 sibling worktree 들이 모두 잡힌다.
  local match
  match=$(find "$PARENT_REPO" -mindepth 3 -maxdepth 3 -type d -name "$app_subdir" 2>/dev/null | head -1)

  if [[ -z "$match" ]]; then
    echo "❌ web-applications/$app_subdir 를 가진 submodule 을 찾을 수 없습니다." >&2
    echo "   탐색 경로: $PARENT_REPO/*/web-applications/$app_subdir" >&2
    echo "   submodule 이 init 안 됐을 수 있습니다. 부모 레포에서:" >&2
    echo "     git submodule update --init <submodule>" >&2
    return 1
  fi

  # match = .../<sub>/web-applications/<app_subdir>
  local anchor
  anchor=$(dirname "$(dirname "$match")")

  # 2. base(default) branch 면 worktree 가 아니라 submodule 본체를 그대로 사용한다.
  #    /sync 가 본체를 default branch 로 정렬하므로 본체가 곧 base 형상이고,
  #    본체는 detached HEAD 라 아래 worktree 목록 매칭에 걸리지 않는다.
  local default_branch
  default_branch=$(git -C "$anchor" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)
  default_branch="${default_branch#origin/}"
  default_branch="${default_branch:-main}"

  if [[ "$branch" == "$default_branch" ]]; then
    echo "→ '$branch' 는 base branch — worktree 대신 submodule 본체 사용: $anchor" >&2
    printf '%s' "$anchor"
    return 0
  fi

  # 3. anchor 의 git worktree 목록에서 <branch> 가 체크아웃된 경로 찾기
  local target
  target=$(
    git -C "$anchor" worktree list --porcelain | awk -v want="$branch" '
      /^worktree / { path = substr($0, 10) }
      /^branch refs\/heads\// {
        name = substr($0, 19)
        if (name == want) { print path; exit }
      }
    '
  )

  if [[ -z "$target" ]]; then
    # worktree 미존재 → origin 에 브랜치가 있는지 확인하고, 있으면 sibling worktree 자동 생성
    echo "→ '$branch' 가 체크아웃된 worktree 없음. origin 확인 중..." >&2

    if ! git -C "$anchor" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
      echo "❌ origin 에도 '$branch' 가 없습니다 — 브랜치 이름을 확인하세요." >&2
      echo "" >&2
      echo "현재 worktree 목록 ($(basename "$anchor")):" >&2
      git -C "$anchor" worktree list >&2
      return 1
    fi

    echo "✓ origin/$branch 발견. fetch 후 worktree 생성..." >&2
    git -C "$anchor" fetch origin "$branch:refs/remotes/origin/$branch" >&2

    # 명세: worktree 는 <submodule>/.claude/worktrees/<branch>/ 에 만든다
    # (flex-frontend-repositories/.claude/CLAUDE.md "### 2. worktree 진입")
    local worktree_path="$anchor/.claude/worktrees/$branch"

    if [[ -e "$worktree_path" ]]; then
      echo "❌ worktree 경로 충돌: $worktree_path 가 이미 존재합니다." >&2
      return 1
    fi

    mkdir -p "$(dirname "$worktree_path")"

    # 로컬에 같은 이름의 브랜치가 있으면 그걸로, 없으면 origin 추적 브랜치 새로 생성
    if git -C "$anchor" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then
      git -C "$anchor" worktree add "$worktree_path" "$branch" >&2
    else
      git -C "$anchor" worktree add "$worktree_path" -b "$branch" "origin/$branch" >&2
    fi

    echo "✓ worktree 생성: $worktree_path" >&2
    target="$worktree_path"
  fi

  if [[ ! -d "$target/web-applications/$app_subdir" ]]; then
    echo "❌ '$target' 안에 web-applications/$app_subdir 가 없습니다 (worktree 구조 이상)." >&2
    return 1
  fi

  printf '%s' "$target"
}
