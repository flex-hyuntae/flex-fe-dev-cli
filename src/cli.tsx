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
// initialApp 을 넘기면 앱 선택을 건너뛰고 그 앱의 브랜치 입력부터 시작한다.
const askMenu = (initialApp?: AppInfo): Promise<RunChoice | null> => {
  return new Promise((resolve) => {
    let choice: RunChoice | null = null;
    const instance = render(
      <App
        initialApp={initialApp}
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
// 직전 앱을 다음 메뉴로 넘겨 앱을 고정한 채 브랜치만 바꿔가며 반복할 수 있게 한다(앱 변경은 브랜치 단계에서 Esc).
const main = async () => {
  let lastApp: AppInfo | undefined = undefined;
  for (;;) {
    const choice = await askMenu(lastApp);
    if (!choice) {
      break;
    }
    lastApp = choice.app;
    await runDev(choice.target, choice.app);
    console.log("\n— dev 종료. 같은 앱으로 브랜치 다시 고르기 (앱 바꾸려면 Esc) —\n");
  }
};

main();
