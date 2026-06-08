import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { runDev } from "./core/actions";
import type { AppInfo } from "./core/apps";

interface RunChoice {
  target: string;
  app: AppInfo;
}

// 메뉴를 띄우고 사용자가 run 을 고르면 그 선택을, 종료(Esc/Ctrl+C)하면 null 을 반환한다.
// open 은 App 내부에서 처리되고 메뉴가 유지되므로 여기서 resolve 되지 않는다.
const askMenu = (): Promise<RunChoice | null> => {
  return new Promise((resolve) => {
    let choice: RunChoice | null = null;
    const instance = render(
      <App
        onRun={(target: string, app: AppInfo) => {
          choice = { target, app };
          instance.unmount();
        }}
      />,
    );
    instance.waitUntilExit().then(() => {
      resolve(choice);
    });
  });
};

// 메뉴 ↔ dev 루프. dev 를 Ctrl+C 로 끄면 runDev 가 resolve 되어 다시 메뉴로 돌아온다.
const main = async () => {
  for (;;) {
    const choice = await askMenu();
    if (!choice) {
      break;
    }
    await runDev(choice.target, choice.app);
    console.log("\n— dev 종료. 메뉴로 돌아갑니다 —\n");
  }
};

main();
