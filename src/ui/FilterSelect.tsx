import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface FilterSelectItem<T> {
  label: string;
  value: T;
  key?: string;
  group?: string; // 그룹 헤더로 묶는 기준 (예: 레포명)
  hint?: string; // 활성 항목에 흐리게 덧붙이는 부가정보 (예: workspace)
}

interface FilterSelectProps<T> {
  items: FilterSelectItem<T>[];
  onSelect: (item: FilterSelectItem<T>) => void;
  placeholder?: string;
  limit?: number;
}

type Row<T> =
  | { kind: "header"; group: string; count: number }
  | { kind: "item"; item: FilterSelectItem<T>; itemIndex: number };

const matches = <T,>(item: FilterSelectItem<T>, query: string): boolean => {
  const haystack = `${item.label} ${item.group ?? ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
};

// items 를 그룹 헤더 + 항목 row 로 펼친다. itemIndex 는 선택 이동의 기준(헤더 제외).
const buildRows = <T,>(items: FilterSelectItem<T>[]): Row<T>[] => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const group = item.group ?? "";
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  const rows: Row<T>[] = [];
  let lastGroup: string | undefined;
  items.forEach((item, itemIndex) => {
    const group = item.group ?? "";
    if (group !== lastGroup) {
      rows.push({ kind: "header", group, count: counts.get(group) ?? 0 });
      lastGroup = group;
    }
    rows.push({ kind: "item", item, itemIndex });
  });
  return rows;
};

// 선택 항목이 보이도록 row 윈도우를 자른다. 윈도우 맨 위가 항목이면 소속 그룹 헤더를 끌어와 맥락 유지.
const windowRows = <T,>(
  rows: Row<T>[],
  selected: number,
  limit: number,
): Row<T>[] => {
  const selectedRow = rows.findIndex(
    (row) => row.kind === "item" && row.itemIndex === selected,
  );
  const start = Math.max(
    0,
    Math.min(selectedRow - Math.floor(limit / 2), Math.max(0, rows.length - limit)),
  );
  let view = rows.slice(start, start + limit);
  const first = view[0];
  if (first && first.kind === "item") {
    const header = [...rows.slice(0, start)]
      .reverse()
      .find((row) => row.kind === "header");
    if (header) {
      view = [header, ...view].slice(0, limit);
    }
  }
  return view;
};

// 타이핑 검색 + ↑↓ 이동 + Enter 선택. group 이 있으면 레포 단위로 그룹 헤더를 보여준다.
export const FilterSelect = <T,>(props: FilterSelectProps<T>) => {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const limit = props.limit ?? 14;

  const filtered = props.items.filter((item) => {
    return matches(item, query);
  });
  const safeIndex = filtered.length === 0 ? 0 : Math.min(index, filtered.length - 1);

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex(Math.max(0, safeIndex - 1));
      return;
    }
    if (key.downArrow) {
      setIndex(Math.min(filtered.length - 1, safeIndex + 1));
      return;
    }
    if (key.return) {
      const selected = filtered[safeIndex];
      if (selected) {
        props.onSelect(selected);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setQuery(query.slice(0, -1));
      setIndex(0);
      return;
    }
    if (key.escape || key.ctrl || key.meta || key.tab) {
      return;
    }
    if (input) {
      setQuery(query + input);
      setIndex(0);
    }
  });

  const rows = windowRows(buildRows(filtered), safeIndex, limit);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="magenta">{"⌕ "}</Text>
        <Text>{query}</Text>
        {query ? (
          <Text color="magenta">▎</Text>
        ) : (
          <Text dimColor>{props.placeholder ?? "타이핑으로 필터"}</Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {filtered.length === 0 ? (
          <Text dimColor>  일치하는 항목 없음</Text>
        ) : (
          rows.map((row, position) => {
            if (row.kind === "header") {
              return (
                <Text key={`h:${row.group}:${position}`}>
                  <Text color="yellow" bold>
                    {row.group || "(기타)"}
                  </Text>
                  <Text dimColor> · {row.count}</Text>
                </Text>
              );
            }
            const isActive = row.itemIndex === safeIndex;
            return (
              <Text
                key={row.item.key ?? row.item.label}
                color={isActive ? "cyan" : undefined}
                bold={isActive}
              >
                {isActive ? "  ❯ " : "    "}
                {row.item.label}
                {isActive && row.item.hint ? (
                  <Text dimColor>  {row.item.hint}</Text>
                ) : null}
              </Text>
            );
          })
        )}
      </Box>

      <Text dimColor>
        {filtered.length > 0
          ? `  ${safeIndex + 1}/${filtered.length}${filtered.length > limit ? "  ↑↓ 스크롤" : ""}`
          : `  0/${props.items.length}`}
      </Text>
    </Box>
  );
};
