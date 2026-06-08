import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { listApps, type AppInfo } from "../core/apps";
import { openEditor } from "../core/actions";
import { resolveWorktree } from "../core/worktree";
import { FilterSelect } from "./FilterSelect";

type Step = "app" | "branch" | "action" | "opened" | "error";

interface AppProps {
  // run 선택 시 호출 — 호출 측이 Ink 를 unmount 하고 dev 서버를 foreground 로 띄운다.
  onRun: (target: string, app: AppInfo) => void;
}

interface Item<T> {
  label: string;
  value: T;
  key?: string;
}

const Header = (props: { app: AppInfo | null; branch: string }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        flex-fe-dev
      </Text>
      {props.app ? (
        <Text dimColor>
          app: {props.app.name} ({props.app.workspace})
          {props.branch ? `  ·  branch: ${props.branch}` : ""}
        </Text>
      ) : null}
    </Box>
  );
};

export const App = (props: AppProps) => {
  const { exit } = useApp();
  const apps = useMemo(() => {
    return listApps();
  }, []);

  const [step, setStep] = useState<Step>("app");
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);
  const [branch, setBranch] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    }
  });

  const appItems: Item<AppInfo>[] = apps.map((app) => {
    return {
      label: `${app.name}${app.name === "host" ? "  (MF host)" : ""}`,
      value: app,
      key: app.workspace,
    };
  });

  const handleAppSelect = (item: Item<AppInfo>) => {
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

  const actionItems: Item<"run" | "open">[] = [
    { label: "run   — dev 서버 실행 (foreground)", value: "run", key: "run" },
    { label: "open  — VS Code 로 열기", value: "open", key: "open" },
  ];

  const handleActionSelect = (item: Item<"run" | "open">) => {
    if (!selectedApp) {
      return;
    }
    try {
      const resolution = resolveWorktree(selectedApp, branch);
      if (item.value === "run") {
        // Ink 를 벗어나 dev 서버에 터미널을 넘긴다.
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
      <Header app={selectedApp} branch={branch} />

      {step === "app" ? (
        <Box flexDirection="column">
          <Text>앱을 고르세요 (타이핑 검색 · ↑↓ 이동 · Enter 선택 · Esc 종료):</Text>
          <FilterSelect
            items={appItems}
            limit={12}
            placeholder="앱 이름 검색 (예: brain, host)"
            onSelect={handleAppSelect}
          />
        </Box>
      ) : null}

      {step === "branch" ? (
        <Box flexDirection="column">
          <Text>
            브랜치 이름 (Enter 확정, Esc 뒤로). default branch 면 submodule 본체,
            없으면 worktree 자동 생성:
          </Text>
          <Box>
            <Text color="green">{"❯ "}</Text>
            <TextInput
              value={branchDraft}
              onChange={setBranchDraft}
              onSubmit={handleBranchSubmit}
              placeholder="feature/..."
            />
          </Box>
        </Box>
      ) : null}

      {step === "action" ? (
        <Box flexDirection="column">
          <Text>무엇을 할까요? (Esc 뒤로):</Text>
          <SelectInput items={actionItems} onSelect={handleActionSelect} />
        </Box>
      ) : null}

      {step === "opened" ? (
        <Box flexDirection="column">
          <Text color="green">{message}</Text>
          <Text dimColor>Enter/Esc 로 처음으로, q 로 종료</Text>
          <SelectInput
            items={[{ label: "처음으로", value: "back", key: "back" }]}
            onSelect={resetToStart}
          />
        </Box>
      ) : null}

      {step === "error" ? (
        <Box flexDirection="column">
          <Text color="red">❌ {error}</Text>
          <Text dimColor>Enter/Esc 로 처음으로, q 로 종료</Text>
          <SelectInput
            items={[{ label: "처음으로", value: "back", key: "back" }]}
            onSelect={resetToStart}
          />
        </Box>
      ) : null}
    </Box>
  );
};
