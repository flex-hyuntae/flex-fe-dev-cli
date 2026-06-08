#!/usr/bin/env bash
# install.sh — flex-fe-dev (Ink TUI) + legacy one-shot 스크립트를 ~/.local/bin 에 symlink.
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.local/bin"

# command 이름 → 소스 경로
link() {
  local name="$1"
  local src="$2"
  local dst="$HOME/.local/bin/$name"
  chmod +x "$src"
  ln -sfn "$src" "$dst"
  echo "✓ installed: $dst → $src"
}

link flex-fe-dev "$repo_dir/bin/flex-fe-dev"
link flex-fe-dev-run "$repo_dir/legacy/flex-fe-dev-run"
link flex-fe-dev-open "$repo_dir/legacy/flex-fe-dev-open"

echo ""

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  echo "⚠  PATH 에 ~/.local/bin 이 없습니다. ~/.zshrc 에 아래 한 줄을 추가하세요:"
  echo ""
  echo '   export PATH="$HOME/.local/bin:$PATH"'
  echo ""
  echo "   추가 후: exec zsh"
else
  echo "✓ PATH 에 ~/.local/bin 잡혀있음 — 바로 사용 가능:"
  echo "    flex-fe-dev            (TUI)"
  echo "    flex-fe-dev-run <app> <branch>   (one-shot)"
  echo "    flex-fe-dev-open <app> <branch>  (one-shot)"
fi
