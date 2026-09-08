#!/usr/bin/env sh
# Make Node/npm/npx available to git hooks regardless of how git is launched.
#
# GUI git clients (Sourcetree, GitHub Desktop, Fork, the VS Code/JetBrains
# built-in git, etc.) run hooks with a minimal, non-login shell that never
# sources ~/.zshrc / ~/.bashrc, so an nvm/fnm/Homebrew-managed Node ends up
# missing from PATH and `npx: command not found` (exit 127) results.
#
# This script is sourced by each hook BEFORE it calls npx. It:
#   1. loads nvm (respecting the repo's Node version if nvm can resolve it),
#   2. loads fnm if present,
#   3. otherwise prepends common Node install locations to PATH.
# It is intentionally quiet and side-effect-free beyond exporting PATH.

# --- nvm -------------------------------------------------------------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh" --no-use >/dev/null 2>&1
  # Prefer the version pinned by .nvmrc/engines if resolvable, else the default.
  nvm use >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

# --- fnm -------------------------------------------------------------------
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)" >/dev/null 2>&1 || true
fi

# --- Fallbacks: prepend known Node locations if npx still isn't found ------
if ! command -v npx >/dev/null 2>&1; then
  # Newest nvm-managed version (if the sourcing above didn't set PATH).
  if [ -d "$NVM_DIR/versions/node" ]; then
    _latest_node="$(ls -1 "$NVM_DIR/versions/node" 2>/dev/null | sort -V | tail -1)"
    [ -n "$_latest_node" ] && PATH="$NVM_DIR/versions/node/$_latest_node/bin:$PATH"
  fi
  # Homebrew (Apple Silicon + Intel) and system-wide installs.
  for _dir in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
    [ -d "$_dir" ] && PATH="$_dir:$PATH"
  done
  export PATH
fi
