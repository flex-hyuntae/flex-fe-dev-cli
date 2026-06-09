import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// install.sh 가 작성하는 설정 파일. 셸 rc 를 건드리지 않고 FLEX_ROOT 를 영속화한다.
// XDG 관례(~/.config/flex-fe-dev/config.json). env 가 항상 이 값을 덮어쓴다.
export const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  "flex-fe-dev",
  "config.json",
);

interface CliConfig {
  flexRoot?: string;
}

// config.json 을 읽어 flexRoot 만 추려낸다. 없거나 깨졌으면 빈 객체로 폴백.
// JSON.parse 는 any 를 내므로 unknown 으로 받아 type guard 로 좁힌다.
const readConfigFile = (): CliConfig => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "flexRoot" in parsed &&
      typeof parsed.flexRoot === "string"
    ) {
      return { flexRoot: parsed.flexRoot };
    }
  } catch {
    // 파일 부재 / 파싱 실패 — 기본값으로 진행한다.
  }
  return {};
};

// FLEX_ROOT 우선순위: env > config 파일 > 기본값.
// 기존 lib.sh 의 FLEX_ROOT / FLEX_PARENT_REPO env 우선순위는 그대로 유지된다.
export const FLEX_ROOT =
  process.env.FLEX_ROOT ??
  readConfigFile().flexRoot ??
  path.join(os.homedir(), "Projects/flex");

export const PARENT_REPO =
  process.env.FLEX_PARENT_REPO ??
  path.join(FLEX_ROOT, "flex-frontend-repositories");
