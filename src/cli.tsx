import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { runDev } from "./core/actions";
import type { AppInfo } from "./core/apps";

const main = () => {
  const instance = render(
    <App
      onRun={(target: string, app: AppInfo) => {
        // TUI 를 정리하고 dev 서버에 터미널을 완전히 넘긴다.
        instance.unmount();
        runDev(target, app);
      }}
    />,
  );
};

main();
