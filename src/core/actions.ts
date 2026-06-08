import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AppInfo } from "./apps";

// .env.local 을 보장한다 (없으면 .env.example 복사). 진행 메시지를 반환.
export const ensureEnvLocal = (target: string, app: AppInfo): string => {
  const appDir = path.join(target, "web-applications", app.appSubdir);
  const envLocal = path.join(appDir, ".env.local");
  const envExample = path.join(appDir, ".env.example");

  if (fs.existsSync(envLocal)) {
    return "✓ .env.local 이미 존재 — 유지";
  }
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envLocal);
    return "✓ .env.example → .env.local 복사";
  }
  return "⚠ .env.example 도 .env.local 도 없음 — env 없이 진행";
};

// VS Code 로 연다 (비동기, 분리 실행 — TUI 루프 유지).
export const openEditor = (target: string): void => {
  const child = spawn("code", [target], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
};

// dev 서버를 foreground 로 실행한다. 터미널을 넘겨받으므로 호출 전에 Ink 를 unmount 해야 한다.
// yarn install → .env.local 보장 → yarn turbo run dev --filter <workspace> 순서.
export const runDev = (target: string, app: AppInfo): void => {
  console.log(`\n→ yarn install (${target})`);
  const install = spawn("yarn", ["install"], { cwd: target, stdio: "inherit" });

  install.on("exit", (installCode) => {
    if (installCode !== 0) {
      console.error(`\n❌ yarn install 실패 (exit ${installCode})`);
      process.exit(installCode ?? 1);
    }

    console.log(`\n${ensureEnvLocal(target, app)}`);
    console.log(`\n→ yarn turbo run dev --filter=${app.workspace}\n`);

    const dev = spawn(
      "yarn",
      ["turbo", "run", "dev", "--filter", app.workspace],
      { cwd: target, stdio: "inherit" },
    );
    dev.on("exit", (devCode) => {
      process.exit(devCode ?? 0);
    });
  });
};
