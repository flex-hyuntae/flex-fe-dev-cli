import React from "react";
import { Box, Text } from "ink";
import { groupSlots, type AppStatus, type RunningApp, type Slot } from "../core/processManager";

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
  parked: { symbol: "⏸", color: "blue", label: "parked" },
  exited: { symbol: "○", color: "gray", label: "exited" },
  failed: { symbol: "✖", color: "red", label: "failed" },
};

const isLiveStatus = (status: AppStatus): boolean => {
  return status === "running" || status === "installing";
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
  const liveRemotes = props.apps.filter(
    (app) => app.app.appSubdir.startsWith("remotes-") && isLiveStatus(app.status),
  );
  const proxies = liveRemotes.map((app) => app.app.name).join(", ");
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

// 같은 remote 의 브랜치 후보들을 가로 칩으로. live ● / parked ⏸ / 커서(focused) 강조.
const BranchTabs = (props: { members: RunningApp[]; focusedId: string | null }) => {
  return (
    <Text wrap="truncate-end">
      {"  "}
      {props.members.map((member, index) => {
        const display = STATUS_DISPLAY[member.status];
        const cursor = member.id === props.focusedId;
        return (
          <Text key={member.id}>
            {index > 0 ? <Text dimColor>{"  "}</Text> : null}
            <Text color={cursor ? "cyan" : display.color} bold={cursor}>
              {cursor ? "▸" : " "}
              {member.branch} {display.symbol}
            </Text>
          </Text>
        );
      })}
    </Text>
  );
};

// 슬롯(포트) 하나 = 패널 하나. 헤더 + (멀티 브랜치면) 탭 strip + live 멤버 로그.
const SlotPane = (props: {
  slot: Slot;
  focused: boolean;
  focusedId: string | null;
  logRows: number;
}) => {
  const { slot, focused, focusedId, logRows } = props;
  const multi = slot.members.length > 1;
  // 로그는 포트를 점유한 live 멤버 기준(없으면 focused/첫 멤버).
  const display =
    slot.live ??
    slot.members.find((member) => member.id === focusedId) ??
    slot.members[0];
  if (!display) {
    return null;
  }
  const lines = display.log.tail(logRows);
  const gutter = focused ? "┃ " : "│ ";
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={focused ? "cyan" : undefined} bold={focused}>
          {focused ? "❯ " : "  "}
          {display.app.name}
        </Text>
        {multi ? null : <Text dimColor>{`  ${display.branch}`}</Text>}
        {display.port !== null ? (
          <Text dimColor>{`  :${display.port}  `}</Text>
        ) : (
          <Text dimColor>{"  "}</Text>
        )}
        <StatusBadge status={display.status} />
        {display.status === "running" && display.port !== null ? (
          <Text color="cyan">{`  localhost:${display.port}`}</Text>
        ) : null}
      </Text>
      {multi ? <BranchTabs members={slot.members} focusedId={focusedId} /> : null}
      {lines.map((line, index) => (
        <Text
          key={`${display.id}:${index}`}
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

// 실행 중인 dev 서버들을 슬롯(포트) 단위 분할 패널로 동시에 보여준다(focused 가 더 큰 비중).
// 같은 remote 의 여러 브랜치는 한 패널 안 탭으로. 입력 처리는 App 단독.
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

  const slots = groupSlots(apps);
  const focusedSlotIndex = Math.max(
    0,
    slots.findIndex((slot) => slot.members.some((member) => member.id === focusedId)),
  );

  // chrome: 요약 1 + 푸터 2 + 안전여백 1. 나머지를 (패널 제목 + 로그)에 나눈다.
  // 멀티-브랜치 슬롯은 탭 strip 한 줄을 더 쓰므로 제목 행에 합산한다.
  const titleRows = slots.reduce(
    (sum, slot) => sum + (slot.members.length > 1 ? 2 : 1),
    0,
  );
  const available = Math.max(6, rows - 4);
  const logBudget = Math.max(0, available - titleRows);
  const logRowCounts = distributeLogRows(slots.length, focusedSlotIndex, logBudget);

  return (
    <Box flexDirection="column">
      <Summary apps={apps} hostNeedsRestart={hostNeedsRestart} />
      <Box flexDirection="column" marginTop={1}>
        {slots.map((slot, index) => (
          <SlotPane
            key={slot.key}
            slot={slot}
            focused={index === focusedSlotIndex}
            focusedId={focusedId}
            logRows={logRowCounts[index] ?? 0}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          a 추가 · ↑↓ 슬롯 · ←→ 브랜치 · Enter 전환 · r 재시작 · x 끄기 · o 브라우저 · ^C 종료
        </Text>
      </Box>
    </Box>
  );
};
