import fs from "node:fs";
import path from "node:path";
import { listApps, type AppInfo } from "./apps";
import { readMfConfig } from "./mfConfig";

// host(:3000) 와 함께 띄울 때 remote 를 프록시하려면 host .env.local 에
//   MF_REMOTES_<NAME>_BASE_URL=http://localhost:<port>
// 가 활성화돼 있어야 한다. name/port 는 remote 의 mf.config.ts 가 단일 출처(readMfConfig).
// (키 규칙 출처: @flex-packages/podo RemoteBaseUrls — MF_REMOTES_<X>_BASE_URL,
//  X = name 의 '-'→'_' 대문자화. 예: time-tracking → MF_REMOTES_TIME_TRACKING_BASE_URL)

const REMOTE_SECTION_MARKER = "Remotes App dev proxy URLs";

interface RemoteProxy {
  envKey: string; // MF_REMOTES_<NAME>_BASE_URL
  url: string; // http://localhost:<port>
  name: string; // mf.config 의 name
}

// mf.config 의 name/port 를 host 프록시 키/URL 로 환산한다. 못 읽으면 null.
const readRemoteProxy = (remoteTarget: string, app: AppInfo): RemoteProxy | null => {
  const config = readMfConfig(remoteTarget, app);
  if (!config) {
    return null;
  }
  const envKey = `MF_REMOTES_${config.name.replaceAll("-", "_").toUpperCase()}_BASE_URL`;
  return { envKey, url: `http://localhost:${config.port}`, name: config.name };
};

// flexHost(:3000) 의 .env.local 경로. host 앱이 없거나 .env.local 이 없으면 null.
const findHostEnvLocal = (): string | null => {
  const host = listApps().find((app) => app.appSubdir === "host");
  if (!host) {
    return null;
  }
  const envLocal = path.join(host.submodule, "web-applications", "host", ".env.local");
  return fs.existsSync(envLocal) ? envLocal : null;
};

// .env.local 텍스트에서 envKey 라인을 활성/주석 토글한다. 변경 없으면 입력과 동일 문자열 반환.
const toggleLine = (
  content: string,
  proxy: RemoteProxy,
  enabled: boolean,
): string => {
  const lines = content.split("\n");
  // 주석(#) 유무와 관계없이 같은 키 라인을 잡는다.
  const lineRegExp = new RegExp(`^#?\\s*${proxy.envKey}\\s*=`);
  const desired = enabled
    ? `${proxy.envKey}=${proxy.url}`
    : `# ${proxy.envKey}=${proxy.url}`;

  const index = lines.findIndex((line) => lineRegExp.test(line));
  if (index >= 0) {
    lines[index] = desired;
    return lines.join("\n");
  }

  // 라인이 없는데 끄는 동작이면 추가할 필요가 없다.
  if (!enabled) {
    return content;
  }

  // 추가: remotes 프록시 섹션 바로 뒤에, 섹션이 없으면 파일 끝에 새로 만든다.
  const block = ["", `## ${proxy.name}`, desired];
  const markerIndex = lines.findIndex((line) => line.includes(REMOTE_SECTION_MARKER));
  if (markerIndex >= 0) {
    lines.splice(markerIndex + 1, 0, ...block);
  } else {
    lines.push("", `# ${REMOTE_SECTION_MARKER}`, ...block);
  }
  return lines.join("\n");
};

// host(:3000) .env.local 에 remote 프록시를 활성화(주석 해제/추가)하거나 다시 주석 처리한다.
// remote 가 아니거나 host/.env.local·mf.config 를 못 읽으면 dev 흐름을 막지 않고 안내 메시지만 돌려준다.
// 빈 문자열을 반환하면 호출 측은 로그를 남기지 않는다.
export const setHostRemoteEnabled = (
  remoteTarget: string,
  app: AppInfo,
  enabled: boolean,
): string => {
  // host 자신을 띄울 때나 remote 가 아닌 경우는 대상이 아니다.
  if (!app.appSubdir.startsWith("remotes-")) {
    return "";
  }

  let envPath: string | null;
  try {
    envPath = findHostEnvLocal();
  } catch {
    // listApps 가 부모 레포 부재 등으로 throw 해도 dev 는 진행시킨다.
    envPath = null;
  }
  if (!envPath) {
    return "⚠ host(:3000) .env.local 을 찾지 못해 remote 프록시 등록을 건너뜀";
  }

  const proxy = readRemoteProxy(remoteTarget, app);
  if (!proxy) {
    return `⚠ ${app.name} 의 mf.config.ts 에서 name/port 를 읽지 못해 프록시 등록을 건너뜀`;
  }

  const before = fs.readFileSync(envPath, "utf8");
  const after = toggleLine(before, proxy, enabled);
  if (after === before) {
    return enabled
      ? `✓ host .env.local: ${proxy.envKey} 이미 활성`
      : `✓ host .env.local: ${proxy.envKey} 이미 주석`;
  }

  fs.writeFileSync(envPath, after);
  return enabled
    ? `✓ host .env.local: ${proxy.envKey}=${proxy.url} 활성화`
    : `✓ host .env.local: ${proxy.envKey} 주석 처리`;
};
