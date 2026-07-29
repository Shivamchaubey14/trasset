import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent rather than an AppEntry shim — it works the same across
// SDK upgrades, which is the point of failure this file most often becomes.
registerRootComponent(App);
