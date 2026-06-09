import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// install.sh 와 인앱 설정(App 의 settings 스텝)이 함께 쓰는 설정 파일.
// 셸 rc 를 건드리지 않고 FLEX_ROOT 를 영속화한다.
// XDG 관례(~/.config/flex-fe-dev/config.json). env 가 항상 이 값을 덮어쓴다.
export const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  "flex-fe-dev",
  "config.json",
);

const DEFAULT_FLEX_ROOT = path.join(os.homedir(), "Projects/flex");

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

// 선행 ~ / ~/... 를 홈 디렉토리로 확장 (install.sh 의 ${input/#~/$HOME} 와 동일 동작).
export const expandHome = (input: string): string => {
  if (input === "~" || input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
};

// FLEX_ROOT 우선순위: env > config 파일 > 기본값.
// 런타임에 config 가 바뀌어도 즉시 반영되도록 const 가 아닌 함수로 계산한다(설정 화면에서 재스캔).
export const getFlexRoot = (): string => {
  return process.env.FLEX_ROOT ?? readConfigFile().flexRoot ?? DEFAULT_FLEX_ROOT;
};

export const getParentRepo = (): string => {
  return (
    process.env.FLEX_PARENT_REPO ??
    path.join(getFlexRoot(), "flex-frontend-repositories")
  );
};

// env FLEX_ROOT 가 잡혀 있으면 config 저장이 즉시 반영되지 않는다 — 설정 화면 경고용.
export const isFlexRootFromEnv = (): boolean => {
  return process.env.FLEX_ROOT !== undefined;
};

// config 파일에 저장된 값만(env/기본값 무시). 설정 입력창의 프리필 기본값 표시에 쓴다.
export const readSavedFlexRoot = (): string | undefined => {
  return readConfigFile().flexRoot;
};

// FLEX_ROOT 를 config.json 에 저장한다(install.sh 와 동일 포맷). 확장된 절대경로를 돌려준다.
export const writeFlexRoot = (input: string): string => {
  const expanded = expandHome(input.trim());
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify({ flexRoot: expanded }, null, 2)}\n`);
  return expanded;
};

export interface FlexRootCheck {
  expanded: string;
  exists: boolean;
  hasParentRepo: boolean;
}

// 입력값을 저장 전에 라이브 검증한다 — install.sh 가 경고로 알려주던 두 조건을 동일하게 본다.
// fs 접근을 core 에 가두고 UI 는 결과만 렌더한다.
export const checkFlexRoot = (input: string): FlexRootCheck => {
  const expanded = expandHome(input.trim());
  return {
    expanded,
    exists: fs.existsSync(expanded),
    hasParentRepo: fs.existsSync(path.join(expanded, "flex-frontend-repositories")),
  };
};
