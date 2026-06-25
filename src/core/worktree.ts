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

// worktree 생성/재사용 결과. 재사용된 경우 created=false 로 호출부가 구분한다.
interface CreateOutcome {
  path: string;
  created: boolean;
}

// 작업 디렉토리가 사라진 stale 관리 엔트리를 git 내부에서 제거한다.
// prune 은 디렉토리가 멀쩡한 worktree 는 건드리지 않으므로 항상 안전하다.
const pruneStaleWorktrees = (anchor: string, log: string[]): void => {
  const pruned = gitTry(anchor, ["worktree", "prune", "-v"]);
  if (pruned) {
    log.push(`stale worktree 정리: ${pruned.replace(/\n/g, ", ")}`);
  }
};

const createWorktree = (
  anchor: string,
  branch: string,
  log: string[],
): CreateOutcome => {
  // 명세: worktree 는 <submodule>/.claude/worktrees/<branch>/ 에 만든다
  // (flex-frontend-repositories/.claude/CLAUDE.md "### 2. worktree 진입")
  const worktreePath = path.join(anchor, ".claude/worktrees", branch);

  // 경로를 막는 잔여 디렉토리 처리. git 에 등록된 worktree 라면 이 함수에 도달하기 전
  // resolveWorktree 에서 재사용됐어야 하므로, 여기 남은 디렉토리는 이전 실패의
  // orphan 으로 보고 비운다.
  if (fs.existsSync(worktreePath)) {
    const registered = findWorktreeForBranch(
      git(anchor, ["worktree", "list", "--porcelain"]),
      branch,
    );
    if (registered === worktreePath) {
      log.push(`'${branch}' worktree 가 이미 ${worktreePath} 에 있음 — 재사용`);
      return { path: worktreePath, created: false };
    }
    log.push(`등록되지 않은 잔여 디렉토리 제거: ${worktreePath}`);
    fs.rmSync(worktreePath, { recursive: true, force: true });
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
  const addArgs = hasLocalBranch
    ? ["worktree", "add", worktreePath, branch]
    : ["worktree", "add", worktreePath, "-b", branch, `origin/${branch}`];

  try {
    git(anchor, addArgs);
  } catch {
    // 브랜치가 다른 worktree 에 이미 물려 있어 add 가 거부된 경우.
    // 그 경로가 디스크에 살아 있으면 새로 만들지 않고 재사용한다
    // (옛 flat 네이밍 ↔ 새 nested 네이밍 충돌을 여기서 흡수).
    const claimedBy = findWorktreeForBranch(
      git(anchor, ["worktree", "list", "--porcelain"]),
      branch,
    );
    if (claimedBy && fs.existsSync(claimedBy)) {
      log.push(`'${branch}' 는 이미 ${claimedBy} 에 체크아웃됨 — 그 worktree 재사용`);
      return { path: claimedBy, created: false };
    }
    // 디렉토리가 사라진 stale 점유였다면 prune 후 1회만 재시도한다.
    pruneStaleWorktrees(anchor, log);
    git(anchor, addArgs);
  }
  return { path: worktreePath, created: true };
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

  const existing = findWorktreeForBranch(
    git(anchor, ["worktree", "list", "--porcelain"]),
    branch,
  );
  // 등록된 worktree 가 있고 디렉토리도 살아 있으면 그대로 재사용.
  if (existing && fs.existsSync(existing)) {
    log.push(`'${branch}' 는 이미 ${existing} 에 체크아웃됨 — 재사용`);
    return { target: existing, isBase: false, created: false, log };
  }
  // 등록은 됐지만 디렉토리가 사라진 stale 엔트리면 prune 으로 정리해야
  // 뒤이은 worktree add 가 'branch already used' 로 거부되지 않는다.
  if (existing) {
    pruneStaleWorktrees(anchor, log);
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

  const outcome = createWorktree(anchor, branch, log);
  return { target: outcome.path, isBase: false, created: outcome.created, log };
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
