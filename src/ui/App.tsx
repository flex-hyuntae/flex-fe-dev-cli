import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { listApps, type AppInfo } from "../core/apps";
import { openEditor } from "../core/actions";
import { resolveWorktree } from "../core/worktree";
import { FilterSelect, type FilterSelectItem } from "./FilterSelect";

type Step = "app" | "branch" | "action" | "opened" | "error";

interface AppProps {
  // run 선택 시 호출 — 호출 측이 Ink 를 unmount 하고 dev 서버를 foreground 로 띄운다.
  onRun: (target: string, app: AppInfo) => void;
  // 직전에 run 한 앱. 있으면 앱 선택을 건너뛰고 브랜치 입력부터 시작한다(앱 고정 + 브랜치만 교체).
  initialApp?: AppInfo;
}

// 상단 제목 + 진행 경로(앱 → 브랜치) 표시.
const Header = (props: { app: AppInfo | null; branch: string; step: Step }) => {
  const crumb = (label: string, value: string, active: boolean) => {
    return (
      <Text>
        <Text dimColor>{label} </Text>
        <Text color={value ? "cyan" : "gray"} bold={active}>
          {value || "—"}
        </Text>
      </Text>
    );
  };
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="cyan" bold>
          ⚡ flex-fe-dev
        </Text>
        <Text dimColor>  flex frontend dev 런처</Text>
      </Text>
      <Box>
        {crumb("app", props.app?.name ?? "", props.step === "app")}
        <Text dimColor>{"   ›   "}</Text>
        {crumb("branch", props.branch, props.step === "branch")}
      </Box>
    </Box>
  );
};

const FooterHint = (props: { children: string }) => {
  return (
    <Box marginTop={1}>
      <Text dimColor>{props.children}</Text>
    </Box>
  );
};

export const App = (props: AppProps) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const apps = useMemo(() => {
    return listApps();
  }, []);

  // 출력 전체가 터미널 높이를 넘으면 Ink 가 이전 프레임을 못 지워 잔상이 쌓인다.
  // 리스트 줄 수를 터미널 행 수에 맞춰 제한해 항상 한 화면에 들어오게 한다.
  // (chrome: 헤더3 + 제목1 + 검색1 + 여백1 + 카운트1 + 힌트2 ≈ 9, 안전여백 포함 12)
  const terminalRows = stdout?.rows ?? 24;
  const listLimit = Math.max(5, terminalRows - 12);

  // initialApp 이 있으면 그 앱으로 고정한 채 브랜치 단계부터 시작. 앱을 바꾸려면 브랜치에서 Esc.
  const [step, setStep] = useState<Step>(props.initialApp ? "branch" : "app");
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(props.initialApp ?? null);
  const [branch, setBranch] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // run 시 VS Code 도 함께 열지 여부. action 단계에서 Space 로 토글, 기본 켜짐.
  const [openEditorOnRun, setOpenEditorOnRun] = useState(true);

  const resetToStart = () => {
    setSelectedApp(null);
    setBranch("");
    setBranchDraft("");
    setMessage("");
    setError("");
    setStep("app");
  };

  // Esc: 한 단계 뒤로 (app 단계에선 종료). 종료는 Esc(app) 또는 Ctrl+C.
  // app 단계는 검색 타이핑을 받으므로 q 같은 문자 단축키를 두지 않는다.
  // action 단계에선 Space 로 'VS Code 열기' 체크박스를 토글한다.
  useInput((input, key) => {
    if (key.escape) {
      if (step === "app") {
        exit();
      } else if (step === "branch") {
        setStep("app");
      } else if (step === "action") {
        setStep("branch");
      } else if (step === "error" || step === "opened") {
        resetToStart();
      }
      return;
    }
    if (step === "action" && input === " ") {
      setOpenEditorOnRun((prev) => !prev);
    }
  });

  const appItems: FilterSelectItem<AppInfo>[] = apps.map((app) => {
    return {
      label: `${app.name}${app.name === "host" ? "  ⟨MF host⟩" : ""}`,
      value: app,
      key: app.workspace,
      group: app.repoLabel,
      hint: app.workspace,
    };
  });

  const handleAppSelect = (item: FilterSelectItem<AppInfo>) => {
    setSelectedApp(item.value);
    setStep("branch");
  };

  const handleBranchSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setBranch(trimmed);
    setStep("action");
  };

  const actionItems = [
    { label: "▶  run   — dev 서버 실행 (Ctrl+C 로 끄면 브랜치 단계로 복귀, 앱 유지)", value: "run", key: "run" },
    { label: "↗  open  — VS Code 로만 열기 (dev 없이)", value: "open", key: "open" },
  ];

  const handleActionSelect = (item: { value: string }) => {
    if (!selectedApp) {
      return;
    }
    try {
      const resolution = resolveWorktree(selectedApp, branch);
      if (item.value === "run") {
        // 체크박스가 켜져 있으면 VS Code 를 먼저 열고(분리 실행 — 터미널 점유 안 함),
        // 그다음 Ink 를 벗어나 dev 서버에 터미널을 넘긴다. 에디터는 install/dev 동안 떠 있다.
        if (openEditorOnRun) {
          openEditor(resolution.target);
        }
        props.onRun(resolution.target, selectedApp);
        return;
      }
      openEditor(resolution.target);
      setMessage(`✓ VS Code 로 열림: ${resolution.target}`);
      setStep("opened");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStep("error");
    }
  };

  return (
    <Box flexDirection="column">
      <Header app={selectedApp} branch={branch} step={step} />

      {step === "app" ? (
        <Box flexDirection="column">
          <Text bold>어떤 앱을 띄울까요?</Text>
          <FilterSelect
            items={appItems}
            limit={listLimit}
            placeholder="앱·레포 이름으로 검색 (예: brain, payroll, host)"
            onSelect={handleAppSelect}
          />
          <FooterHint>타이핑 검색 · ↑↓ 이동 · Enter 선택 · Esc 종료</FooterHint>
        </Box>
      ) : null}

      {step === "branch" ? (
        <Box flexDirection="column">
          <Text bold>브랜치 이름</Text>
          <Box marginTop={1}>
            <Text color="green">{"❯ "}</Text>
            <TextInput
              value={branchDraft}
              onChange={setBranchDraft}
              onSubmit={handleBranchSubmit}
              placeholder="feature/... (default branch 면 본체, 없으면 worktree 자동 생성)"
            />
          </Box>
          <FooterHint>Enter 확정 · Esc 앱 다시 고르기</FooterHint>
        </Box>
      ) : null}

      {step === "action" ? (
        <Box flexDirection="column">
          <Text bold>무엇을 할까요?</Text>
          <Box marginTop={1} flexDirection="column">
            <SelectInput items={actionItems} onSelect={handleActionSelect} />
          </Box>
          <Box marginTop={1}>
            <Text color={openEditorOnRun ? "green" : "gray"}>
              {openEditorOnRun ? "[✓]" : "[ ]"} run 시 VS Code 도 함께 열기
            </Text>
          </Box>
          <FooterHint>Enter 선택 · Space VS Code 열기 토글 · Esc 뒤로</FooterHint>
        </Box>
      ) : null}

      {step === "opened" ? (
        <Box flexDirection="column">
          <Text color="green">{message}</Text>
          <Box marginTop={1} flexDirection="column">
            <SelectInput
              items={[{ label: "↺  처음으로", value: "back", key: "back" }]}
              onSelect={resetToStart}
            />
          </Box>
          <FooterHint>Enter/Esc 로 처음으로 · Ctrl+C 종료</FooterHint>
        </Box>
      ) : null}

      {step === "error" ? (
        <Box flexDirection="column">
          <Text color="red">✖ {error}</Text>
          <Box marginTop={1} flexDirection="column">
            <SelectInput
              items={[{ label: "↺  처음으로", value: "back", key: "back" }]}
              onSelect={resetToStart}
            />
          </Box>
          <FooterHint>Enter/Esc 로 처음으로 · Ctrl+C 종료</FooterHint>
        </Box>
      ) : null}
    </Box>
  );
};
