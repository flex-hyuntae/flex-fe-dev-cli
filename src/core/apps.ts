import fs from "node:fs";
import path from "node:path";
import { PARENT_REPO } from "./config";

// 앱 하나의 디렉토리/워크스페이스 레이아웃.
//   - 도메인 remote : web-applications/remotes-<name>, 워크스페이스 @flex-apps/remotes-<name>
//   - host          : web-applications/host,           워크스페이스 @flex-apps/host
// (lib.sh 의 resolve_app_layout 을 데이터로 끌어올린 형태)
export interface AppInfo {
  name: string;
  submodule: string; // 부모 레포 안 submodule 본체 절대경로 (worktree anchor)
  appSubdir: string; // web-applications 하위 디렉토리명
  workspace: string; // turbo --filter 에 쓰는 워크스페이스명
}

const toAppInfo = (submodule: string, appSubdir: string): AppInfo | null => {
  if (appSubdir === "host") {
    return {
      name: "host",
      submodule,
      appSubdir,
      workspace: "@flex-apps/host",
    };
  }
  if (appSubdir.startsWith("remotes-")) {
    return {
      name: appSubdir.slice("remotes-".length),
      submodule,
      appSubdir,
      workspace: `@flex-apps/${appSubdir}`,
    };
  }
  return null;
};

// 부모 레포 안 모든 submodule 의 web-applications/{remotes-*, host} 를 스캔한다.
// init 안 된 submodule 은 web-applications 가 없어 자연히 제외된다 (lazy init 전제).
export const listApps = (): AppInfo[] => {
  const submodules = fs
    .readdirSync(PARENT_REPO, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("flex-frontend"),
    );

  const apps: AppInfo[] = [];
  for (const submodule of submodules) {
    const submodulePath = path.join(PARENT_REPO, submodule.name);
    const webApplications = path.join(submodulePath, "web-applications");
    if (!fs.existsSync(webApplications)) {
      continue;
    }
    for (const entry of fs.readdirSync(webApplications, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const app = toAppInfo(submodulePath, entry.name);
      if (app) {
        apps.push(app);
      }
    }
  }

  return apps.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });
};
