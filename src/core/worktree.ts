import fs from "node:fs";
import path from "node:path";
import type { AppInfo } from "./apps";
import { git, gitOk, gitTry } from "./git";

// worktree 해석 결과. UI 가 진행 로그를 그대로 표시할 수 있도록 log 를 동반한다.
export interface WorktreeResolution {
  target: string;
  isBase: boolean;
  created: boolean;
  log: string[];
}

const resolveDefaultBranch = (anchor: string): string => {
  const head = gitTry(anchor, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (!head) {
    return "main";
  }
  return head.replace(/^origin\//, "");
};

// `git worktree list --porcelain` 출력에서 branch 가 체크아웃된 worktree 경로를 찾는다.
const findWorktreeForBranch = (
  porcelain: string,
  branch: string,
): string | null => {
  let current = "";
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = line.slice("worktree ".length);
    } else if (line.startsWith("branch refs/heads/")) {
      const name = line.slice("branch refs/heads/".length);
      if (name === branch) {
        return current;
      }
    }
  }
  return null;
};

const createWorktree = (
  anchor: string,
  branch: string,
  log: string[],
): string => {
  // 명세: worktree 는 <submodule>/.claude/worktrees/<branch>/ 에 만든다
  // (flex-frontend-repositories/.claude/CLAUDE.md "### 2. worktree 진입")
  const worktreePath = path.join(anchor, ".claude/worktrees", branch);
  if (fs.existsSync(worktreePath)) {
    throw new Error(`worktree 경로 충돌: ${worktreePath} 가 이미 존재합니다.`);
  }
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  log.push(`origin/${branch} fetch 후 worktree 생성`);
  git(anchor, ["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`]);

  // 로컬에 같은 이름 브랜치가 있으면 그걸로, 없으면 origin 추적 브랜치 새로 생성.
  const hasLocalBranch = gitOk(anchor, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  if (hasLocalBranch) {
    git(anchor, ["worktree", "add", worktreePath, branch]);
  } else {
    git(anchor, ["worktree", "add", worktreePath, "-b", branch, `origin/${branch}`]);
  }
  return worktreePath;
};

// app/branch 를 작업 디렉토리로 해석한다. (lib.sh 의 resolve_worktree 포팅)
// - branch 가 default branch 면 submodule 본체를 그대로 사용.
// - 체크아웃된 worktree 가 있으면 그 경로.
// - 없고 origin 에 브랜치가 있으면 sibling worktree 를 자동 생성.
// - origin 에도 없으면 throw.
export const resolveWorktree = (
  app: AppInfo,
  branch: string,
): WorktreeResolution => {
  const anchor = app.submodule;
  const log: string[] = [];

  const defaultBranch = resolveDefaultBranch(anchor);
  if (branch === defaultBranch) {
    log.push(`'${branch}' 는 base branch — submodule 본체 사용`);
    return { target: anchor, isBase: true, created: false, log };
  }

  const porcelain = git(anchor, ["worktree", "list", "--porcelain"]);
  const existing = findWorktreeForBranch(porcelain, branch);
  if (existing) {
    return { target: existing, isBase: false, created: false, log };
  }

  const hasOriginBranch = gitOk(anchor, [
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    branch,
  ]);
  if (!hasOriginBranch) {
    throw new Error(
      `origin 에도 '${branch}' 가 없습니다 — 브랜치 이름을 확인하세요.`,
    );
  }

  const target = createWorktree(anchor, branch, log);
  return { target, isBase: false, created: true, log };
};

// anchor 의 로컬 + origin 브랜치 목록 (브랜치 입력 자동완성용).
export const listBranches = (anchor: string): string[] => {
  const raw = gitTry(anchor, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  const names = raw
    .split("\n")
    .map((line) => line.replace(/^origin\//, ""))
    .filter((name) => name.length > 0 && name !== "HEAD");
  return [...new Set(names)].sort();
};
