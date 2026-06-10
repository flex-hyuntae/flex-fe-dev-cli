import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { listApps, type AppInfo } from "../core/apps";
import { openBrowser, openEditor } from "../core/actions";
import { makeRunId, processManager } from "../core/processManager";
import { isDemoMode } from "../core/demo";
import { resolveWorktree } from "../core/worktree";
import {
  checkFlexRoot,
  getFlexRoot,
  isFlexRootFromEnv,
  readSavedFlexRoot,
  writeFlexRoot,
} from "../core/config";
import { FilterSelect, type FilterSelectItem } from "./FilterSelect";
import { Dashboard } from "./Dashboard";

// dashboard: 실행 중 앱 대시보드(메인). app-select→branch→action: 새 앱 추가 흐름.
// settings: FLEX_ROOT. error: worktree 해석 실패.
type Mode = "dashboard" | "app-select" | "branch" | "action" | "settings" | "error";

// FLEX_ROOT 가 가리키는 곳에 부모 레포가 아직 없을 수 있다 → throw 대신 빈 목록으로 떨어뜨려
// 사용자가 Tab→설정으로 경로를 고칠 수 있게 한다.
const loadApps = (): AppInfo[] => {
  try {
    return listApps();
  } catch {
    return [];
  }
};

// processManager 의 update 이벤트를 구독해 ~120ms 간격으로만 re-render 한다.
// 고빈도 로그가 매 청크마다 render 를 트리거하지 않도록 dirty 플래그(useRef)로 coalesce.
const useManagerSubscription = (): void => {
  const [, setTick] = useState(0);
  const dirtyRef = useRef(false);
  useEffect(() => {
    const handleUpdate = () => {
      dirtyRef.current = true;
    };
    processManager.onUpdate(handleUpdate);
    const interval = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        setTick((value) => value + 1);
      }
    }, 120);
    return () => {
      processManager.offUpdate(handleUpdate);
      clearInterval(interval);
    };
  }, []);
};

// 선택 흐름(app-select/branch/action/settings)에서만 보이는 상단 제목 + 진행 경로.
const Header = (props: { app: AppInfo | null; branch: string; mode: Mode }) => {
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
        <Text dimColor>  앱 추가</Text>
      </Text>
      <Box>
        {crumb("app", props.app?.name ?? "", props.mode === "app-select")}
        <Text dimColor>{"   ›   "}</Text>
        {crumb("branch", props.branch, props.mode === "branch")}
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

export const App = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  useManagerSubscription();

  const terminalRows = stdout?.rows ?? 24;
  const listLimit = Math.max(5, terminalRows - 12);

  // FLEX_ROOT 를 바꾸면 재스캔해야 하므로 state 로 들고 있는다.
  const [apps, setApps] = useState<AppInfo[]>(loadApps);
  // 0개면 추가 흐름부터, 아니면 대시보드. (재시작 사이 싱글톤이 살아 있을 수 있어 list 로 판단)
  const [mode, setMode] = useState<Mode>(() =>
    processManager.list().length > 0 ? "dashboard" : "app-select",
  );
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);
  const [branch, setBranch] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const [error, setError] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // run 시 VS Code 도 함께 열지. action 단계에서 Space 토글, 기본 켜짐.
  const [openEditorOnRun, setOpenEditorOnRun] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState("");

  // tick 으로 매 render 새로 읽는 실행 목록.
  const runningApps = processManager.list();
  const hostNeedsRestart = processManager.hostNeedsRestart();

  const enterSettings = () => {
    setSettingsDraft(readSavedFlexRoot() ?? getFlexRoot());
    setMode("settings");
  };

  const backToBase = () => {
    setMode(processManager.list().length > 0 ? "dashboard" : "app-select");
  };

  const moveFocus = (delta: number) => {
    const list = processManager.list();
    if (list.length === 0) {
      return;
    }
    const currentIndex = Math.max(
      0,
      list.findIndex((app) => app.id === focusedId),
    );
    const next = list[(currentIndex + delta + list.length) % list.length];
    if (next) {
      setFocusedId(next.id);
    }
  };

  const handleRemoveFocused = () => {
    if (!focusedId) {
      return;
    }
    const before = processManager.list();
    const removedIndex = before.findIndex((app) => app.id === focusedId);
    processManager.remove(focusedId);
    const after = processManager.list();
    if (after.length === 0) {
      setFocusedId(null);
      setMode("app-select");
      return;
    }
    const neighbor = after[Math.min(removedIndex, after.length - 1)];
    setFocusedId(neighbor ? neighbor.id : null);
  };

  const handleOpenBrowserForFocused = () => {
    if (!focusedId) {
      return;
    }
    const runningApp = processManager.get(focusedId);
    if (runningApp && runningApp.status === "running" && runningApp.port !== null) {
      openBrowser(`http://localhost:${runningApp.port}`);
    }
  };

  useInput((input, key) => {
    // 어느 모드든 Ctrl+C 는 모든 dev 서버를 정리하고 종료한다.
    if (key.ctrl && input === "c") {
      processManager.stopAll();
      exit();
      return;
    }

    if (mode === "app-select") {
      if (key.tab) {
        enterSettings();
        return;
      }
      if (key.escape) {
        if (processManager.list().length > 0) {
          setMode("dashboard");
        } else {
          processManager.stopAll();
          exit();
        }
      }
      return; // 글자 입력은 FilterSelect 의 검색으로 전달.
    }

    if (mode === "branch") {
      if (key.escape) {
        setMode("app-select");
      }
      return; // 타이핑은 TextInput.
    }

    if (mode === "action") {
      if (key.escape) {
        setMode("branch");
        return;
      }
      if (input === " ") {
        setOpenEditorOnRun((prev) => !prev);
      }
      return; // 화살표/Enter 는 SelectInput.
    }

    if (mode === "settings") {
      if (key.escape) {
        backToBase();
      }
      return; // 타이핑은 TextInput.
    }

    if (mode === "error") {
      if (key.escape || key.return) {
        backToBase();
      }
      return;
    }

    // mode === "dashboard"
    if (key.tab || key.downArrow) {
      moveFocus(1);
      return;
    }
    if (key.upArrow) {
      moveFocus(-1);
      return;
    }
    if (input === "a") {
      setSelectedApp(null);
      setBranch("");
      setBranchDraft("");
      setMode("app-select");
      return;
    }
    if (input === "r" && focusedId) {
      processManager.restart(focusedId);
      return;
    }
    // x = 끄기: focused 앱(remote/host)을 프로세스 그룹째 종료하고 대시보드에서 제거한다.
    // 개별 종료는 x 로 통일 — Ctrl+C 는 CLI 전체 종료에만 쓴다(터미널 관습과 일치).
    if (input === "x") {
      handleRemoveFocused();
      return;
    }
    if (input === "o") {
      handleOpenBrowserForFocused();
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
    setMode("branch");
  };

  const handleBranchSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setBranch(trimmed);
    setMode("action");
  };

  const actionItems = [
    { label: "▶  run   — dev 서버를 대시보드에 추가 (백그라운드 실행)", value: "run", key: "run" },
    { label: "↗  open  — VS Code 로만 열기 (dev 없이)", value: "open", key: "open" },
  ];

  const handleActionSelect = (item: { value: string }) => {
    if (!selectedApp) {
      return;
    }
    try {
      // 데모 모드는 git worktree 해석/생성을 건너뛰고 submodule 경로만 쓴다(부작용 0).
      const target = isDemoMode()
        ? selectedApp.submodule
        : resolveWorktree(selectedApp, branch).target;
      if (item.value === "run") {
        if (openEditorOnRun && !isDemoMode()) {
          openEditor(target);
        }
        setFocusedId(makeRunId(selectedApp.workspace, branch));
        void processManager.start({ app: selectedApp, target, branch });
        setMode("dashboard");
        return;
      }
      if (!isDemoMode()) {
        openEditor(target);
      }
      backToBase();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setMode("error");
    }
  };

  const handleSettingsSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      backToBase();
      return;
    }
    writeFlexRoot(trimmed);
    setApps(loadApps());
    setSelectedApp(null);
    setMode("app-select");
  };

  const settingsCheck = mode === "settings" ? checkFlexRoot(settingsDraft) : null;

  if (mode === "dashboard") {
    return (
      <Dashboard
        apps={runningApps}
        focusedId={focusedId}
        rows={terminalRows}
        hostNeedsRestart={hostNeedsRestart}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header app={selectedApp} branch={branch} mode={mode} />

      {mode === "app-select" ? (
        <Box flexDirection="column">
          <Text bold>어떤 앱을 띄울까요?</Text>
          <FilterSelect
            items={appItems}
            limit={listLimit}
            placeholder="앱·레포 이름으로 검색 (예: brain, payroll, host)"
            onSelect={handleAppSelect}
          />
          <FooterHint>
            {runningApps.length > 0
              ? "타이핑 검색 · ↑↓ 이동 · Enter 선택 · Tab 설정 · Esc 대시보드"
              : "타이핑 검색 · ↑↓ 이동 · Enter 선택 · Tab 설정 · Esc 종료"}
          </FooterHint>
        </Box>
      ) : null}

      {mode === "branch" ? (
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

      {mode === "action" ? (
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

      {mode === "settings" ? (
        <Box flexDirection="column">
          <Text bold>설정 — FLEX_ROOT</Text>
          <Box marginTop={1}>
            <Text dimColor>
              현재: {getFlexRoot()}
              {isFlexRootFromEnv() ? "  (env FLEX_ROOT 로 고정)" : ""}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="green">{"❯ "}</Text>
            <TextInput
              value={settingsDraft}
              onChange={setSettingsDraft}
              onSubmit={handleSettingsSubmit}
              placeholder="~/Projects/flex (그 아래 flex-frontend-repositories 가 있는 곳)"
            />
          </Box>
          {settingsCheck !== null && settingsDraft.trim().length > 0 ? (
            <Box marginTop={1}>
              {!settingsCheck.exists ? (
                <Text dimColor>⚠ 경로 없음 — 나중에 만들어도 됩니다.</Text>
              ) : !settingsCheck.hasParentRepo ? (
                <Text dimColor>
                  ⚠ flex-frontend-repositories 가 없습니다 — 경로를 확인하세요.
                </Text>
              ) : (
                <Text color="green">✓ flex-frontend-repositories 확인됨</Text>
              )}
            </Box>
          ) : null}
          {isFlexRootFromEnv() ? (
            <Box marginTop={1}>
              <Text color="yellow">
                ⚠ env FLEX_ROOT 가 설정돼 있어 저장해도 즉시 반영되지 않습니다. 영구 적용하려면 env 를 해제하고 다시 실행하세요.
              </Text>
            </Box>
          ) : null}
          <FooterHint>Enter 저장 후 재스캔 · Esc 취소</FooterHint>
        </Box>
      ) : null}

      {mode === "error" ? (
        <Box flexDirection="column">
          <Text color="red">✖ {error}</Text>
          <FooterHint>Enter/Esc 로 돌아가기 · Ctrl+C 종료</FooterHint>
        </Box>
      ) : null}
    </Box>
  );
};
