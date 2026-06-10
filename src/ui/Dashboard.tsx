import React from "react";
import { Box, Text } from "ink";
import type { AppStatus, RunningApp } from "../core/processManager";

interface DashboardProps {
  apps: RunningApp[];
  focusedId: string | null;
  rows: number;
  hostNeedsRestart: boolean;
}

// 상태별 표시(기호·색·라벨). enum 대신 union + Record (ts-enum-vs-union).
const STATUS_DISPLAY: Record<
  AppStatus,
  { symbol: string; color: string; label: string }
> = {
  installing: { symbol: "◐", color: "yellow", label: "installing" },
  running: { symbol: "●", color: "green", label: "running" },
  exited: { symbol: "○", color: "gray", label: "exited" },
  failed: { symbol: "✖", color: "red", label: "failed" },
};

// 로그 행 예산을 패널에 분배한다. focused 가 가중치 2, 나머지 1.
// 나머지(remainder)는 focused 부터 라운드로빈으로 1씩 더한다.
const distributeLogRows = (
  count: number,
  focusedIndex: number,
  budget: number,
): number[] => {
  if (count <= 0) {
    return [];
  }
  if (budget <= 0) {
    return new Array<number>(count).fill(0);
  }
  if (count === 1) {
    return [budget];
  }
  const focusWeight = 2;
  const totalWeight = count - 1 + focusWeight;
  const counts = Array.from({ length: count }, (_unused, index) => {
    const weight = index === focusedIndex ? focusWeight : 1;
    return Math.floor((budget * weight) / totalWeight);
  });

  let remainder = budget - counts.reduce((sum, value) => sum + value, 0);
  let cursor = focusedIndex >= 0 ? focusedIndex : 0;
  while (remainder > 0) {
    counts[cursor] = (counts[cursor] ?? 0) + 1;
    remainder -= 1;
    cursor = (cursor + 1) % count;
  }
  return counts;
};

const StatusBadge = (props: { status: AppStatus }) => {
  const display = STATUS_DISPLAY[props.status];
  return (
    <Text color={display.color}>
      {display.symbol} {display.label}
    </Text>
  );
};

// 실행 중 앱 한 줄 요약 + host 프록시 대상 + 재시작 필요 경고.
const Summary = (props: { apps: RunningApp[]; hostNeedsRestart: boolean }) => {
  const host = props.apps.find((app) => app.app.appSubdir === "host");
  const remotes = props.apps.filter((app) =>
    app.app.appSubdir.startsWith("remotes-"),
  );
  const proxies = remotes.map((app) => app.app.name).join(", ");
  return (
    <Text>
      <Text color="cyan" bold>
        ⚡ flex-fe-dev
      </Text>
      <Text dimColor>{`  ·  ${props.apps.length} apps`}</Text>
      {host && host.port !== null ? (
        <Text dimColor>{`  ·  host :${host.port} → ${proxies || "—"}`}</Text>
      ) : null}
      {props.hostNeedsRestart ? (
        <Text color="yellow">{"  ·  host 재시작 필요 (host focus → r)"}</Text>
      ) : null}
    </Text>
  );
};

const AppPane = (props: {
  runningApp: RunningApp;
  focused: boolean;
  logRows: number;
}) => {
  const { runningApp, focused, logRows } = props;
  const lines = runningApp.log.tail(logRows);
  const gutter = focused ? "┃ " : "│ ";
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={focused ? "cyan" : undefined} bold={focused}>
          {focused ? "❯ " : "  "}
          {runningApp.app.name}
        </Text>
        <Text dimColor>{`  ${runningApp.branch}`}</Text>
        {runningApp.port !== null ? (
          <Text dimColor>{`  :${runningApp.port}  `}</Text>
        ) : (
          <Text dimColor>{"  "}</Text>
        )}
        <StatusBadge status={runningApp.status} />
        {runningApp.status === "running" && runningApp.port !== null ? (
          <Text color="cyan">{`  localhost:${runningApp.port}`}</Text>
        ) : null}
      </Text>
      {lines.map((line, index) => (
        <Text
          key={`${runningApp.id}:${index}`}
          dimColor={!focused}
          wrap="truncate-end"
        >
          {gutter}
          {line.length > 0 ? line : " "}
        </Text>
      ))}
    </Box>
  );
};

// 실행 중인 dev 서버들을 분할 패널로 동시에 보여준다(focused 가 더 큰 비중).
// 입력 처리는 App 이 단독으로 맡는다 — 여긴 순수 표시 컴포넌트.
export const Dashboard = (props: DashboardProps) => {
  const { apps, focusedId, rows, hostNeedsRestart } = props;

  if (apps.length === 0) {
    return (
      <Box flexDirection="column">
        <Summary apps={apps} hostNeedsRestart={hostNeedsRestart} />
        <Box marginTop={1}>
          <Text dimColor>실행 중인 앱이 없습니다 — </Text>
          <Text color="cyan">a</Text>
          <Text dimColor> 로 앱을 추가하세요.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>a 추가 · ^C 종료(전체)</Text>
        </Box>
      </Box>
    );
  }

  const focusedIndex = Math.max(
    0,
    apps.findIndex((app) => app.id === focusedId),
  );

  // chrome: 요약 1 + 푸터 2 + 안전여백 1. 나머지를 (패널 제목 + 로그)에 나눈다.
  const available = Math.max(6, rows - 4);
  const logBudget = Math.max(0, available - apps.length);
  const logRowCounts = distributeLogRows(apps.length, focusedIndex, logBudget);

  return (
    <Box flexDirection="column">
      <Summary apps={apps} hostNeedsRestart={hostNeedsRestart} />
      <Box flexDirection="column" marginTop={1}>
        {apps.map((runningApp, index) => (
          <AppPane
            key={runningApp.id}
            runningApp={runningApp}
            focused={index === focusedIndex}
            logRows={logRowCounts[index] ?? 0}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          a 추가 · r 재시작 · x 끄기 · o 브라우저 · ↑↓/Tab 포커스 · ^C 종료(전체)
        </Text>
      </Box>
    </Box>
  );
};
