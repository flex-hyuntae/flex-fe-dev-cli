#!/usr/bin/env bash
# install.sh — flex-fe-dev (Ink TUI) 를 ~/.local/bin 에 symlink.
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.local/bin"

src="$repo_dir/bin/flex-fe-dev"
dst="$HOME/.local/bin/flex-fe-dev"
chmod +x "$src"
ln -sfn "$src" "$dst"
echo "✓ installed: $dst → $src"

echo ""

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  echo "⚠  PATH 에 ~/.local/bin 이 없습니다. ~/.zshrc 에 아래 한 줄을 추가하세요:"
  echo ""
  echo '   export PATH="$HOME/.local/bin:$PATH"'
  echo ""
  echo "   추가 후: exec zsh"
else
  echo "✓ PATH 에 ~/.local/bin 잡혀있음 — 바로 사용 가능: flex-fe-dev"
fi
