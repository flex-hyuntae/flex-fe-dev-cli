#!/usr/bin/env bash
# install.sh — flex-fe-dev (Ink TUI) 를 ~/.local/bin 에 symlink + FLEX_ROOT 초기 설정.
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")" && pwd)"

# 1. symlink ----------------------------------------------------------------
mkdir -p "$HOME/.local/bin"

src="$repo_dir/bin/flex-fe-dev"
dst="$HOME/.local/bin/flex-fe-dev"
chmod +x "$src"
ln -sfn "$src" "$dst"
echo "✓ installed: $dst → $src"

echo ""

# 2. FLEX_ROOT 설정 ----------------------------------------------------------
# CLI 는 env FLEX_ROOT > 이 config 파일 > 기본값 순으로 읽는다 (src/core/config.ts).
# 셸 rc 를 건드리지 않으려고 값을 여기 저장한다.
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/flex-fe-dev"
config_file="$config_dir/config.json"

# 기존 설정이 있으면 그 값을, 없으면 표준 경로를 기본값으로 제시한다.
default_root="$HOME/Projects/flex"
if [ -f "$config_file" ]; then
  saved_root="$(sed -n 's/.*"flexRoot"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' "$config_file")"
  if [ -n "$saved_root" ]; then
    default_root="$saved_root"
  fi
fi

echo "flex 레포 루트(FLEX_ROOT)를 설정합니다 — 그 아래 flex-frontend-repositories 가 있는 디렉토리."
read -e -r -p "FLEX_ROOT [$default_root]: " input_root
input_root="${input_root:-$default_root}"
# 선행 ~ 를 $HOME 으로 확장 (read 는 틸드를 확장하지 않는다).
input_root="${input_root/#\~/$HOME}"

if [ ! -d "$input_root" ]; then
  echo "⚠  $input_root 가 아직 없습니다 — 나중에 클론/생성해도 됩니다."
elif [ ! -d "$input_root/flex-frontend-repositories" ]; then
  echo "⚠  $input_root 안에 flex-frontend-repositories 가 없습니다 — 경로를 확인하세요."
fi

mkdir -p "$config_dir"
printf '{\n  "flexRoot": "%s"\n}\n' "$input_root" >"$config_file"
echo "✓ 저장: $config_file (FLEX_ROOT=$input_root)"
echo "   바꾸려면 install.sh 재실행 또는 env FLEX_ROOT 로 일시 오버라이드."

echo ""

# 3. PATH 안내 --------------------------------------------------------------
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  echo "⚠  PATH 에 ~/.local/bin 이 없습니다. ~/.zshrc 에 아래 한 줄을 추가하세요:"
  echo ""
  echo '   export PATH="$HOME/.local/bin:$PATH"'
  echo ""
  echo "   추가 후: exec zsh"
else
  echo "✓ PATH 에 ~/.local/bin 잡혀있음 — 바로 사용 가능: flex-fe-dev"
fi
