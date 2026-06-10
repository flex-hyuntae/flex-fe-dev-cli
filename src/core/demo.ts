// 데모 모드 — README GIF 캡처/UI 미리보기용. FLEX_FE_DEV_DEMO=1 일 때만 켜진다.
// 실제 yarn install / dev spawn / host .env.local 쓰기 / git worktree 생성을 전혀 하지 않고,
// 대시보드에 가짜 앱을 띄워 합성 로그를 흘려보낸다(부작용 0, 재현 가능, 빠름).

export const isDemoMode = (): boolean => process.env.FLEX_FE_DEV_DEMO === "1";

// installing 단계에서 잠깐 흘릴 yarn 류 출력.
export const demoInstallLines = (): string[] => [
  "→ yarn install",
  "➤ YN0000: ┌ Resolution step",
  "➤ YN0000: └ Completed in 0.4s",
  "➤ YN0000: ┌ Fetch step",
  "➤ YN0000: └ Completed in 0.9s",
];

// running 단계에서 반복 스트리밍할 dev 서버 류 출력. host/remote 별로 다르게.
export const demoDevLines = (params: {
  name: string;
  port: number | null;
  isHost: boolean;
}): string[] => {
  const portText = params.port !== null ? String(params.port) : "?";
  if (params.isHost) {
    return [
      "→ yarn turbo run dev --filter @flex-apps/host",
      `host:dev: ▲ Next.js 14.2 · Local: http://localhost:${portText}`,
      "host:dev: ✓ Ready in 2.4s",
      "host:dev: ○ Compiling /(main)...",
      "host:dev: ✓ Compiled /(main) in 1620ms (2841 modules)",
      "host:dev: GET / 200 in 58ms",
      "host:dev: ✓ proxy → remotes ok",
      "host:dev: ○ Compiling /(main)/dashboard...",
      "host:dev: ✓ Compiled in 740ms (312 modules)",
    ];
  }
  return [
    `→ yarn turbo run dev --filter @flex-apps/remotes-${params.name}`,
    `${params.name}:dev: podo dev → remote on :${portText}`,
    `${params.name}:dev: exposes ./routes`,
    `${params.name}:dev: ✓ Ready · waiting for host`,
    `${params.name}:dev: ✓ Compiled ./routes in 880ms`,
    `${params.name}:dev: GET /routes 200`,
    `${params.name}:dev: ↻ hmr update accepted`,
  ];
};
