import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

function runWorkspace(workspace) {
  if (isWindows) {
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm run dev --workspace ${workspace}`], {
      stdio: "inherit"
    });
  }
  return spawn("npm", ["run", "dev", "--workspace", workspace], { stdio: "inherit" });
}

const children = [runWorkspace("apps/server"), runWorkspace("apps/web")];

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}
