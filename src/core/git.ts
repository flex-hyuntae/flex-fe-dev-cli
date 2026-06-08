import { execFileSync } from "node:child_process";

// cwd 에서 git 명령을 실행하고 stdout 을 trim 해 반환한다. 실패 시 throw.
export const git = (cwd: string, args: string[]): string => {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
};

// 성공 여부만 필요한 git 명령. stderr/실패를 삼키고 boolean 으로 환원한다.
export const gitOk = (cwd: string, args: string[]): boolean => {
  try {
    execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
};

// 실패해도 throw 하지 않고 빈 문자열을 반환하는 조회용.
export const gitTry = (cwd: string, args: string[]): string => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};
