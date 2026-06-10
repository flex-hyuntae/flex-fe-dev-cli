import { stripVTControlCharacters } from "node:util";

// dev 서버 stdout/stderr 를 라인 단위로 모으는 링버퍼.
// - 자식 stdio 가 파이프라 청크 경계가 라인과 안 맞는다 → 미완성 끝 줄(pendingRaw)을 보류했다 이어붙인다.
// - ANSI escape 를 strip 한다: 파이프라 색이 안 꺼지는 도구가 있고, Ink 가 escape 가 섞인 문자열의
//   폭을 잘못 재 레이아웃이 깨진다. (Node 내장 stripVTControlCharacters 사용)
// - progress bar 의 캐리지리턴(\r) 갱신은 마지막 \r 이후만 남겨 한 줄로 collapse 한다.
const DEFAULT_MAX_LINES = 1000;
// 매 push 마다 slice 하지 않으려고 초과분이 이 여유를 넘을 때만 compact 한다.
const COMPACT_SLACK = 256;

export class LogBuffer {
  private lines: string[] = [];
  private pendingRaw = "";
  private readonly maxLines: number;

  constructor(maxLines: number = DEFAULT_MAX_LINES) {
    this.maxLines = maxLines;
  }

  // escape sequence 제거 후 마지막 \r 이후만 남긴다(progress 갱신 collapse).
  private clean(segment: string): string {
    const stripped = stripVTControlCharacters(segment);
    const carriageReturn = stripped.lastIndexOf("\r");
    return carriageReturn >= 0 ? stripped.slice(carriageReturn + 1) : stripped;
  }

  private compact(): void {
    if (this.lines.length > this.maxLines + COMPACT_SLACK) {
      this.lines = this.lines.slice(this.lines.length - this.maxLines);
    }
  }

  push(chunk: string): void {
    const text = this.pendingRaw + chunk;
    const segments = text.split("\n");
    // 마지막 조각은 개행으로 끝나지 않은 미완성 줄 — 다음 청크와 이어붙인다.
    this.pendingRaw = segments.pop() ?? "";
    for (const segment of segments) {
      this.lines.push(this.clean(segment));
    }
    this.compact();
  }

  // 빈 줄(구분선 등)을 직접 추가한다 — restart 마커 등 매니저가 쓰는 용도.
  pushLine(line: string): void {
    this.lines.push(line);
    this.compact();
  }

  // 하단 n줄. 진행 중인 미완성 줄(pendingRaw)이 있으면 마지막에 라이브로 덧붙인다.
  tail(n: number): string[] {
    if (n <= 0) {
      return [];
    }
    const pendingLine = this.pendingRaw.length > 0 ? this.clean(this.pendingRaw) : null;
    const total = this.lines.length + (pendingLine !== null ? 1 : 0);
    const start = Math.max(0, total - n);
    const result: string[] = [];
    for (let index = start; index < this.lines.length; index += 1) {
      const line = this.lines[index];
      if (line !== undefined) {
        result.push(line);
      }
    }
    if (pendingLine !== null && result.length < n) {
      result.push(pendingLine);
    }
    return result;
  }
}
