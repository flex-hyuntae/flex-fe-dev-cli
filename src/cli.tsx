import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { processManager } from "./core/processManager";
import { isDemoMode } from "./core/demo";

// 대시보드 모델: Ink 를 한 번만 mount 하고 dev 서버들은 processManager 가 백그라운드로
// supervise 한다. (기존 menu↔foreground-dev 루프는 제거됨)
//
// exitOnCtrlC: false — Ctrl+C 를 App 이 직접 받아 exit() 한다. Ink 기본 동작에 맡기면
// raw mode 에서 SIGINT 가 안 떠 자식 정리가 누락될 수 있다.
// 데모 모드면 start() 가 실제 spawn 대신 가짜 스트리밍 앱을 띄운다(README GIF 캡처용).
if (isDemoMode()) {
  processManager.enableDemoMode();
}

const instance = render(<App />, { exitOnCtrlC: false });

// 종료 시퀀스: Ctrl+C 로 CLI 가 닫히면 떠 있는 dev 서버가 "하나도" 남으면 안 된다.
//   1) SIGTERM 으로 graceful 종료 요청 + host .env.local 프록시 라인 원복
//   2) 자식이 다 죽을 때까지 100ms 간격 폴링(보통 수백 ms 내 종료 → 즉시 빠져나감)
//   3) 2초 안에 안 죽은 자식(SIGTERM 무시)은 SIGKILL 로 강제 종료
//   4) 그제서야 프로세스 종료
const FORCE_KILL_DEADLINE_MS = 2000;
const POLL_INTERVAL_MS = 100;

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  processManager.stopAll();
  let waited = 0;
  const poll = setInterval(() => {
    waited += POLL_INTERVAL_MS;
    if (!processManager.hasLiveChildren() || waited >= FORCE_KILL_DEADLINE_MS) {
      clearInterval(poll);
      processManager.forceKillAll();
      process.exit(0);
    }
  }, POLL_INTERVAL_MS);
};

// 최후 보루(동기): 크래시/예외 종료 경로에서도 SIGTERM→SIGKILL 로 자식을 확실히 정리한다.
process.on("exit", () => {
  processManager.stopAll();
  processManager.forceKillAll();
});
// 외부 신호로 종료될 때도 escalation 시퀀스를 탄다.
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// App 이 Ctrl+C → exit() 하면 Ink 가 unmount 되고 여기서 정리 후 프로세스를 닫는다.
instance.waitUntilExit().then(shutdown);
