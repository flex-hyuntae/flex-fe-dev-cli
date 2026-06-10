import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { AppInfo } from "./apps";
import { ensureEnvLocal } from "./actions";
import { setHostRemoteEnabled } from "./hostEnv";
import { readMfConfig } from "./mfConfig";
import { LogBuffer } from "./logBuffer";
import { demoDevLines, demoInstallLines } from "./demo";

// 멀티-앱 supervisor. 기존 단일-포그라운드(runDev)를 대체한다.
// 각 dev 서버를 detached 자식 프로세스로 띄워 로그를 LogBuffer 로 모으고,
// 상태가 바뀔 때마다 "update" 이벤트를 쏜다(UI 가 구독해 throttle 렌더).

// parked = 단일-포트 스왑에서 포트를 sibling 에 양보하고 대기 중(프로세스 없음, 후보로 등록됨).
export type AppStatus = "installing" | "running" | "parked" | "exited" | "failed";

// 대시보드 엔트리 id. app(workspace) + branch 조합. UI 가 포커스를 즉시 잡을 때도 쓴다.
export const makeRunId = (workspace: string, branch: string): string => {
  return `${workspace}@${branch}`;
};

const isLive = (status: AppStatus): boolean => {
  return status === "running" || status === "installing";
};

// 같은 remote 의 여러 브랜치를 한 포트 슬롯으로 묶은 것. 한 번에 하나만 live(포트 점유).
export interface Slot {
  key: string; // app.workspace — 포트가 app 마다 유일하므로 슬롯 키로 충분
  members: RunningApp[]; // 등록된 브랜치 후보들(추가 순)
  live: RunningApp | null; // 현재 포트를 점유한 멤버(없으면 전부 parked)
}

// 평평한 실행 목록을 워크스페이스(슬롯) 단위로 묶는다. 멤버는 추가 순서를 유지한다.
export const groupSlots = (apps: RunningApp[]): Slot[] => {
  const byKey = new Map<string, RunningApp[]>();
  for (const app of apps) {
    const members = byKey.get(app.app.workspace) ?? [];
    members.push(app);
    byKey.set(app.app.workspace, members);
  }
  const slots: Slot[] = [];
  for (const [key, members] of byKey) {
    const live = members.find((member) => isLive(member.status)) ?? null;
    slots.push({ key, members, live });
  }
  return slots;
};

// UI 에 노출하는 읽기 전용 뷰. child/타이머 등 내부 상태는 ProcessHandle 에 가둔다.
export interface RunningApp {
  id: string; // `${app.workspace}@${branch}`
  app: AppInfo;
  branch: string;
  target: string;
  port: number | null; // mf.config 의 port (못 읽으면 null)
  status: AppStatus;
  log: LogBuffer;
  seq: number; // 기동 순서 — host 와의 선후 비교(프록시 dirty 판단)에 쓴다
}

interface ProcessHandle {
  child: ChildProcess | null;
  stopping: boolean; // SIGTERM 으로 의도적으로 끄는 중 → exit 를 exited 로 분류
  restartRequested: boolean; // exit 후 곧바로 재기동할지
  parkRequested: boolean; // exit 후 parked 로 두고(스왑) 포트를 양보할지
  pendingSwitchId: string | null; // park 후 곧바로 live 로 띄울 형제 id(전환 대상)
  killTimer: ReturnType<typeof setTimeout> | null; // SIGTERM 후 강제 종료 타이머
}

const KILL_GRACE_MS = 4000;
const UPDATE_EVENT = "update";

class ProcessManager extends EventEmitter {
  private readonly apps = new Map<string, RunningApp>();
  private readonly handles = new Map<string, ProcessHandle>();
  // 같은 worktree(target) 의 중복 yarn install 방지 — 진행/완료 promise 를 공유한다.
  private readonly installs = new Map<string, Promise<boolean>>();
  // 진행 중인 install 자식 프로세스 — 종료 시 dev 자식과 함께 정리해야 고아가 안 남는다.
  private readonly installChildren = new Map<string, ChildProcess>();
  private seqCounter = 0;
  // host 가 떠 있는 상태에서 새 remote 프록시가 켜졌는지 — true 면 host 재시작이 필요하다.
  private hostProxyDirty = false;
  // 데모 모드(FLEX_FE_DEV_DEMO) — start() 가 실제 spawn 대신 가짜 스트리밍 앱을 띄운다.
  private demoMode = false;
  private readonly demoTimers = new Map<string, Array<ReturnType<typeof setInterval>>>();
  // 종료 시퀀스 진입 후 true. 진행 중인 async start() 의 await 가 늦게 resolve 되어
  // forceKillAll 이후 새 dev 그룹을 spawn → 정리 안 되는 고아가 되는 race 를 막는다.
  // (spawn 과 kill 사이의 상호배제)
  private shuttingDown = false;

  enableDemoMode(): void {
    this.demoMode = true;
  }

  list(): RunningApp[] {
    return [...this.apps.values()];
  }

  get(id: string): RunningApp | undefined {
    return this.apps.get(id);
  }

  has(id: string): boolean {
    return this.apps.has(id);
  }

  // host 가 실행 중인데 그 뒤로 켜진 remote 프록시가 있어 host 재시작이 필요한 상태인가.
  hostNeedsRestart(): boolean {
    return this.hostProxyDirty && this.isHostRunning();
  }

  onUpdate(listener: () => void): void {
    this.on(UPDATE_EVENT, listener);
  }

  offUpdate(listener: () => void): void {
    this.off(UPDATE_EVENT, listener);
  }

  private emitUpdate(): void {
    this.emit(UPDATE_EVENT);
  }

  private isHostRunning(): boolean {
    for (const runningApp of this.apps.values()) {
      if (runningApp.app.appSubdir === "host" && runningApp.status === "running") {
        return true;
      }
    }
    return false;
  }

  private newHandle(): ProcessHandle {
    return {
      child: null,
      stopping: false,
      restartRequested: false,
      parkRequested: false,
      pendingSwitchId: null,
      killTimer: null,
    };
  }

  // 같은 슬롯(workspace)에서 현재 포트를 점유한(live) 멤버 id. excludeId 는 제외.
  private liveSiblingId(workspace: string, excludeId: string): string | null {
    for (const app of this.apps.values()) {
      if (app.app.workspace === workspace && app.id !== excludeId && isLive(app.status)) {
        return app.id;
      }
    }
    return null;
  }

  // app/branch 를 대시보드에 추가한다. 슬롯에 이미 live 가 있으면 parked 로 등록(Enter 로 전환),
  // 없으면 곧바로 live 로 띄운다(install → dev). 이미 있으면 그 id 만 돌려준다.
  async start(params: { app: AppInfo; target: string; branch: string }): Promise<string> {
    const { app, target, branch } = params;
    const id = makeRunId(app.workspace, branch);
    // 종료 중이면 새 앱을 받지 않는다(kill 스윕 이후 spawn 방지).
    if (this.shuttingDown || this.apps.has(id)) {
      return id;
    }

    const config = readMfConfig(target, app);
    this.seqCounter += 1;
    const log = new LogBuffer();
    // 슬롯에 이미 live 가 있으면 같은 포트를 못 쓰므로 parked 로 등록(단일-포트 스왑).
    const hasLiveSibling = this.liveSiblingId(app.workspace, id) !== null;
    const runningApp: RunningApp = {
      id,
      app,
      branch,
      target,
      port: config ? config.port : null,
      status: hasLiveSibling ? "parked" : "installing",
      log,
      seq: this.seqCounter,
    };
    this.apps.set(id, runningApp);
    this.handles.set(id, this.newHandle());
    this.emitUpdate();

    if (hasLiveSibling) {
      const portText = runningApp.port !== null ? `:${runningApp.port}` : "포트";
      log.pushLine(`⏸ parked — ${app.name} 슬롯에 등록됨 (Enter 로 ${portText} 전환)`);
      this.emitUpdate();
      return id;
    }

    await this.goLive(runningApp);
    return id;
  }

  // 기존 엔트리를 포트에 live 로 올린다(install → dev). 데모면 합성 스트림으로 대체.
  private async goLive(runningApp: RunningApp): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    if (this.demoMode) {
      this.streamDemo(runningApp);
      return;
    }
    const { app, target, log } = runningApp;
    runningApp.status = "installing";
    this.emitUpdate();

    log.pushLine(ensureEnvLocal(target, app));
    this.emitUpdate();

    const installed = await this.ensureInstall(target, log);
    // install 도중 제거됐거나 종료 시퀀스가 시작됐으면 dev 를 띄우지 않는다(고아 race 차단).
    if (!this.apps.has(runningApp.id) || this.shuttingDown) {
      return;
    }
    if (!installed) {
      runningApp.status = "failed";
      log.pushLine("❌ yarn install 실패 — x 로 제거 후 다시 시도하세요.");
      this.emitUpdate();
      return;
    }

    this.spawnDev(runningApp);
  }

  // target 당 install 1회. 진행 중이면 기존 promise 를 공유. 실패하면 캐시를 비워 재시도 가능하게 한다.
  private ensureInstall(target: string, log: LogBuffer): Promise<boolean> {
    const existing = this.installs.get(target);
    if (existing) {
      log.pushLine("→ yarn install (같은 worktree — 진행 중인 설치 대기)");
      return existing;
    }

    const promise = new Promise<boolean>((resolve) => {
      log.pushLine("→ yarn install");
      // detached: dev 자식과 동일하게 프로세스 그룹을 분리해 종료 시 그룹째 정리한다.
      const install = spawn("yarn", ["install"], {
        cwd: target,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.installChildren.set(target, install);
      install.stdout?.on("data", (chunk: Buffer) => {
        log.push(chunk.toString());
        this.emitUpdate();
      });
      install.stderr?.on("data", (chunk: Buffer) => {
        log.push(chunk.toString());
        this.emitUpdate();
      });
      install.on("exit", (code) => {
        this.installChildren.delete(target);
        if (code !== 0) {
          this.installs.delete(target);
        }
        resolve(code === 0);
      });
      install.on("error", (error) => {
        this.installChildren.delete(target);
        this.installs.delete(target);
        log.pushLine(`yarn install 실행 실패: ${error.message}`);
        resolve(false);
      });
    });
    this.installs.set(target, promise);
    return promise;
  }

  // 데모 전용: 기존 엔트리를 실제 프로세스 없이 live 로 올려 합성 로그를 스트리밍한다.
  // installing(짧게) → running 전환 후 dev 로그를 반복 흘려보낸다. fs/spawn/git 부작용 없음.
  private streamDemo(runningApp: RunningApp): void {
    if (this.shuttingDown) {
      return;
    }
    this.clearDemoTimers(runningApp.id); // 재-go-live(전환) 시 이전 스트림 정리
    const { app, log } = runningApp;
    const isHost = app.appSubdir === "host";
    runningApp.status = "installing";
    for (const line of demoInstallLines()) {
      log.pushLine(line);
    }
    this.emitUpdate();

    const timers: Array<ReturnType<typeof setInterval>> = [];
    const transition = setTimeout(() => {
      runningApp.status = "running";
      const devLines = demoDevLines({ name: app.name, port: runningApp.port, isHost });
      let index = 0;
      const stream = setInterval(() => {
        const line = devLines[index % devLines.length];
        if (line !== undefined) {
          log.pushLine(line);
        }
        index += 1;
        this.emitUpdate();
      }, 450);
      timers.push(stream);
      this.emitUpdate();
    }, 1300);
    timers.push(transition);
    this.demoTimers.set(runningApp.id, timers);
  }

  // setTimeout/setInterval 핸들 모두 clearInterval 로 정리 가능(Node 에서 동일 객체).
  private clearDemoTimers(id: string): void {
    const timers = this.demoTimers.get(id);
    if (timers) {
      for (const timer of timers) {
        clearInterval(timer);
      }
      this.demoTimers.delete(id);
    }
  }

  private clearAllDemoTimers(): void {
    for (const timers of this.demoTimers.values()) {
      for (const timer of timers) {
        clearInterval(timer);
      }
    }
    this.demoTimers.clear();
  }

  private spawnDev(runningApp: RunningApp): void {
    // 종료 중에는 새 dev 그룹을 절대 띄우지 않는다(start 의 await 갭 / restart 재기동 race 차단).
    if (this.shuttingDown) {
      return;
    }
    const handle = this.handles.get(runningApp.id);
    if (!handle) {
      return;
    }
    const { app, target, log } = runningApp;

    // remote 면 host(:3000) 프록시 라인을 켠다. host 가 이미 떠 있으면 재시작이 필요해진다.
    if (app.appSubdir.startsWith("remotes-")) {
      const message = setHostRemoteEnabled(target, app, true);
      if (message) {
        log.pushLine(message);
      }
      if (this.isHostRunning()) {
        this.hostProxyDirty = true;
      }
    }
    // host 가 (재)기동되면 현재 켜진 모든 remote 프록시를 새로 읽으므로 dirty 가 해소된다.
    if (app.appSubdir === "host") {
      this.hostProxyDirty = false;
    }

    log.pushLine(`→ yarn turbo run dev --filter ${app.workspace}`);
    // detached: true 로 자식이 독립 프로세스 그룹의 리더가 된다 → kill(-pid) 로 turbo→podo→next
    // 자식 트리 전체를 한 번에 종료할 수 있다(고아 프로세스가 포트를 점유하는 최악 회피).
    const child = spawn("yarn", ["turbo", "run", "dev", "--filter", app.workspace], {
      cwd: target,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    handle.child = child;
    handle.stopping = false;
    runningApp.status = "running";
    this.emitUpdate();

    child.stdout?.on("data", (chunk: Buffer) => {
      log.push(chunk.toString());
      this.emitUpdate();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      log.push(chunk.toString());
      this.emitUpdate();
    });
    child.on("exit", (code) => {
      if (handle.killTimer) {
        clearTimeout(handle.killTimer);
        handle.killTimer = null;
      }
      handle.child = null;

      const parking = handle.parkRequested;
      // remote 프록시: 파킹(브랜치 스왑)이면 같은 포트를 다음 브랜치가 이어 쓰므로 끄지 않는다.
      // 실제로 떠나는(중지/제거/종료) 경우에만 주석 처리한다.
      if (app.appSubdir.startsWith("remotes-") && !parking) {
        const message = setHostRemoteEnabled(target, app, false);
        if (message) {
          log.pushLine(message);
        }
      }

      if (handle.restartRequested) {
        handle.restartRequested = false;
        log.pushLine("── restarting ──");
        this.emitUpdate();
        this.spawnDev(runningApp);
        return;
      }

      // 단일-포트 스왑: 포트를 양보하고 parked 로 둔 뒤, 대기 중인 전환 대상을 live 로 올린다.
      if (parking) {
        handle.parkRequested = false;
        handle.stopping = false;
        runningApp.status = "parked";
        log.pushLine("⏸ parked (포트 양보)");
        const switchId = handle.pendingSwitchId;
        handle.pendingSwitchId = null;
        this.emitUpdate();
        if (switchId) {
          const next = this.apps.get(switchId);
          if (next) {
            void this.goLive(next);
          }
        }
        return;
      }

      // 의도된 중지(SIGTERM)는 exited. 그 외 0/null 은 정상 종료, 비정상 코드는 failed.
      const intentional = handle.stopping;
      handle.stopping = false;
      runningApp.status = intentional || code === 0 || code === null ? "exited" : "failed";
      this.emitUpdate();
    });
    child.on("error", (error) => {
      log.pushLine(`dev 실행 실패: ${error.message}`);
      runningApp.status = "failed";
      this.emitUpdate();
    });
  }

  // 프로세스 그룹 전체에 시그널. 그룹 kill 이 실패하면 개별 pid 로 폴백.
  private killGroup(pid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // 이미 종료됨 — 무시.
      }
    }
  }

  private terminate(handle: ProcessHandle): void {
    const child = handle.child;
    if (!child || child.pid === undefined) {
      return;
    }
    const pid = child.pid;
    handle.stopping = true;
    this.killGroup(pid, "SIGTERM");
    // SIGTERM 을 무시하는 자식이 있으면 유예 후 강제 종료.
    handle.killTimer = setTimeout(() => {
      if (handle.child && handle.child.pid !== undefined) {
        this.killGroup(handle.child.pid, "SIGKILL");
      }
    }, KILL_GRACE_MS);
  }

  restart(id: string): void {
    const runningApp = this.apps.get(id);
    const handle = this.handles.get(id);
    if (!runningApp || !handle) {
      return;
    }
    // 돌고 있으면 끄고 exit 후 재기동, 아니면(parked/exited/failed) install 부터 다시 올린다.
    if (handle.child && handle.child.pid !== undefined) {
      handle.restartRequested = true;
      this.terminate(handle);
    } else {
      void this.goLive(runningApp);
    }
    this.emitUpdate();
  }

  // 단일-포트 스왑: 슬롯의 현재 live 를 parked 로 내리고 id 를 같은 포트에 live 로 올린다.
  // 실제 dev 가 도는 경우엔 SIGTERM 으로 끈 뒤(포트 free) exit 핸들러가 전환 대상을 띄운다.
  switchTo(id: string): void {
    const target = this.apps.get(id);
    if (!target || isLive(target.status)) {
      return; // 없거나 이미 live.
    }
    const liveId = this.liveSiblingId(target.app.workspace, id);
    if (liveId) {
      const liveHandle = this.handles.get(liveId);
      const liveApp = this.apps.get(liveId);
      if (liveHandle && liveHandle.child && liveHandle.child.pid !== undefined) {
        // 실제 dev 가 도는 sibling → 끄고 exit 후 target 기동(포트 free 후).
        liveHandle.parkRequested = true;
        liveHandle.pendingSwitchId = id;
        this.terminate(liveHandle);
        this.emitUpdate();
        return;
      }
      // 데모이거나 이미 안 도는 sibling → 즉시 parked 처리.
      if (liveApp) {
        liveApp.status = "parked";
      }
      this.clearDemoTimers(liveId);
    }
    void this.goLive(target);
    this.emitUpdate();
  }

  remove(id: string): void {
    const handle = this.handles.get(id);
    if (handle) {
      if (handle.killTimer) {
        clearTimeout(handle.killTimer);
        handle.killTimer = null;
      }
      this.terminate(handle);
    }
    this.clearDemoTimers(id);
    this.apps.delete(id);
    this.handles.delete(id);
    this.emitUpdate();
  }

  // 아직 살아 있는 자식이 하나라도 있는가(dev + install). 종료 시퀀스의 폴링 종료 조건.
  hasLiveChildren(): boolean {
    for (const handle of this.handles.values()) {
      if (handle.child && handle.child.pid !== undefined) {
        return true;
      }
    }
    for (const install of this.installChildren.values()) {
      if (install.pid !== undefined) {
        return true;
      }
    }
    return false;
  }

  // CLI 종료 1단계: 모든 자식 그룹에 SIGTERM(graceful)을 보내고 host 프록시 라인을 정리한다.
  // 동기 — process exit 핸들러에서도 안전하게 호출된다.
  stopAll(): void {
    // 이후 어떤 경로로든 새 spawn 을 막는다(start await / restart 재기동 race 차단).
    this.shuttingDown = true;
    this.clearAllDemoTimers();
    for (const handle of this.handles.values()) {
      if (handle.killTimer) {
        clearTimeout(handle.killTimer);
        handle.killTimer = null;
      }
      const child = handle.child;
      if (child && child.pid !== undefined) {
        handle.stopping = true;
        this.killGroup(child.pid, "SIGTERM");
      }
    }
    // 진행 중인 install 자식도 SIGTERM.
    for (const install of this.installChildren.values()) {
      if (install.pid !== undefined) {
        this.killGroup(install.pid, "SIGTERM");
      }
    }
    for (const runningApp of this.apps.values()) {
      if (runningApp.app.appSubdir.startsWith("remotes-")) {
        try {
          setHostRemoteEnabled(runningApp.target, runningApp.app, false);
        } catch {
          // .env.local 정리 실패는 종료를 막지 않는다.
        }
      }
    }
  }

  // CLI 종료 2단계: SIGTERM 을 무시하고 살아남은 자식 그룹을 SIGKILL 로 강제 종료한다.
  // stopAll 후 유예(자식들이 자발 종료할 시간)를 두고 호출해 고아가 절대 남지 않게 한다.
  forceKillAll(): void {
    for (const handle of this.handles.values()) {
      if (handle.killTimer) {
        clearTimeout(handle.killTimer);
        handle.killTimer = null;
      }
      const child = handle.child;
      if (child && child.pid !== undefined) {
        this.killGroup(child.pid, "SIGKILL");
      }
    }
    for (const install of this.installChildren.values()) {
      if (install.pid !== undefined) {
        this.killGroup(install.pid, "SIGKILL");
      }
    }
  }
}

// 모듈 싱글톤 — cli.tsx 와 UI 컴포넌트가 같은 인스턴스를 공유한다.
export const processManager = new ProcessManager();
