import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface FilterSelectItem<T> {
  label: string;
  value: T;
  key?: string;
}

interface FilterSelectProps<T> {
  items: FilterSelectItem<T>[];
  onSelect: (item: FilterSelectItem<T>) => void;
  placeholder?: string;
  limit?: number;
}

// 타이핑으로 필터링하면서 ↑↓ 이동 / Enter 선택하는 리스트.
// TextInput + SelectInput 을 함께 쓰면 Enter 입력이 충돌하므로 단일 useInput 으로 직접 처리한다.
export const FilterSelect = <T,>(props: FilterSelectProps<T>) => {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const limit = props.limit ?? 12;

  const filtered = props.items.filter((item) => {
    return item.label.toLowerCase().includes(query.toLowerCase());
  });

  // query 변경 등으로 index 가 범위를 벗어나면 화면 표시 직전에 보정.
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
    // Esc 등 상위에서 다루는 키와 제어키는 검색어로 받지 않는다.
    if (key.escape || key.ctrl || key.meta || key.tab) {
      return;
    }
    if (input) {
      setQuery(query + input);
      setIndex(0);
    }
  });

  const windowStart = Math.max(
    0,
    Math.min(safeIndex - Math.floor(limit / 2), filtered.length - limit),
  );
  const visible = filtered.slice(windowStart, windowStart + limit);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">{"검색 ❯ "}</Text>
        <Text>{query}</Text>
        <Text dimColor>
          {query ? "" : (props.placeholder ?? "타이핑으로 필터")}
        </Text>
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>일치하는 항목 없음</Text>
      ) : (
        visible.map((item, offset) => {
          const absolute = windowStart + offset;
          const isActive = absolute === safeIndex;
          return (
            <Text key={item.key ?? item.label} color={isActive ? "cyan" : undefined}>
              {isActive ? "❯ " : "  "}
              {item.label}
            </Text>
          );
        })
      )}
      <Text dimColor>
        {filtered.length > 0
          ? `${safeIndex + 1}/${filtered.length}${filtered.length > limit ? "  (스크롤)" : ""}`
          : `0/${props.items.length}`}
      </Text>
    </Box>
  );
};
