import os from "node:os";
import path from "node:path";

// 기존 lib.sh 의 FLEX_ROOT / FLEX_PARENT_REPO 와 동일한 기본값·env 우선순위.
export const FLEX_ROOT =
  process.env.FLEX_ROOT ?? path.join(os.homedir(), "Projects/flex");

export const PARENT_REPO =
  process.env.FLEX_PARENT_REPO ??
  path.join(FLEX_ROOT, "flex-frontend-repositories");
