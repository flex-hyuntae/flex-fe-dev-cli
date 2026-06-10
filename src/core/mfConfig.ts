import fs from "node:fs";
import path from "node:path";
import type { AppInfo } from "./apps";

// 각 앱의 mf.config.ts 가 name/port 의 단일 출처다.
//   - remote : { layer:'remote', name:'digicon', port:3006, ... }
//   - host   : { layer:'host',   name:'flexHost', port:3000, ... }
// host .env.local 프록시 키, 대시보드 포트 표시, Phase 2 포트 슬롯 키가 모두 이 값을 쓴다.
export interface MfConfig {
  name: string;
  port: number;
}

// mf.config.ts 는 TS 모듈이라 require 할 수 없다 — name/port 만 정규식으로 뽑는다.
// 줄 단위(name: 'x',)든 인라인({ name: 'x', port: 3009 })이든 잡되 'APP_NAME'·export 같은
// 단어 일부와 겹치지 않게 \b 경계로 묶는다. name 은 따옴표 값까지 요구해 오매칭을 줄인다.
// (global 플래그를 쓰지 않아 lastIndex 부작용 없음 — 모듈 스코프에 hoist)
const NAME_REGEXP = /\bname:\s*'([^']+)'/;
const PORT_REGEXP = /\bport:\s*(\d+)/;

// target(worktree/본체) 안 앱의 mf.config.ts 를 읽어 name/port 를 돌려준다.
// 파일이 없거나 두 값을 못 뽑으면 null (호출 측이 폴백 처리).
export const readMfConfig = (target: string, app: AppInfo): MfConfig | null => {
  const mfConfigPath = path.join(
    target,
    "web-applications",
    app.appSubdir,
    "mf.config.ts",
  );
  let source: string;
  try {
    source = fs.readFileSync(mfConfigPath, "utf8");
  } catch {
    return null;
  }

  const name = source.match(NAME_REGEXP)?.[1];
  const port = source.match(PORT_REGEXP)?.[1];
  if (name === undefined || port === undefined) {
    return null;
  }
  return { name, port: Number(port) };
};
