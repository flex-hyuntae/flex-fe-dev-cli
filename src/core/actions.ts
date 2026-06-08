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

// dev 서버를 foreground 로 실행하고, 서버가 종료될 때까지 기다린다 (Promise).
// 호출 전에 Ink 를 unmount 해야 터미널이 dev 서버로 넘어간다.
// yarn install → .env.local 보장 → yarn turbo run dev --filter <workspace> 순서.
//
// NOTE: 부모(node)에 no-op SIGINT 리스너를 달아 둔다. Ctrl+C 는 포그라운드 프로세스
//       그룹 전체에 전달되는데, 이 리스너가 없으면 부모도 함께 죽어 TUI 가 사라진다.
//       리스너 덕에 부모는 살고 자식(dev)만 종료 → resolve 후 호출 측이 메뉴로 복귀한다.
export const runDev = (target: string, app: AppInfo): Promise<void> => {
  return new Promise((resolve) => {
    const ignoreSigint = () => {};
    process.on("SIGINT", ignoreSigint);
    const cleanup = () => {
      process.removeListener("SIGINT", ignoreSigint);
    };

    console.log(`\n→ yarn install (${target})`);
    const install = spawn("yarn", ["install"], { cwd: target, stdio: "inherit" });

    install.on("exit", (installCode) => {
      if (installCode !== 0) {
        console.error(`\n❌ yarn install 실패 (exit ${installCode}) — 메뉴로 복귀`);
        cleanup();
        resolve();
        return;
      }

      console.log(`\n${ensureEnvLocal(target, app)}`);
      console.log(`\n→ yarn turbo run dev --filter=${app.workspace}`);
      console.log("  (Ctrl+C 로 dev 종료 → 메뉴로 복귀)\n");

      const dev = spawn(
        "yarn",
        ["turbo", "run", "dev", "--filter", app.workspace],
        { cwd: target, stdio: "inherit" },
      );
      dev.on("exit", () => {
        cleanup();
        resolve();
      });
    });
  });
};
