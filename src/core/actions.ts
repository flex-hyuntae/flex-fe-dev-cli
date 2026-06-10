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
// `code` CLI 대신 `open -a` 로 띄운다: code 는 LaunchServices 를 거치지 않고
// 번들 바이너리를 직접 exec 해서, dock 에 핀 고정된 앱과 매칭되지 않는 별도 임시
// 아이콘이 뜬다. open 은 LaunchServices 경유라 핀 고정된 번들을 그대로 재사용한다.
export const openEditor = (target: string): void => {
  const child = spawn("open", ["-a", "Visual Studio Code", target], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
};

// 기본 브라우저로 URL 을 연다 (대시보드의 'o' — localhost:<port>). 분리 실행.
export const openBrowser = (url: string): void => {
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.unref();
};
