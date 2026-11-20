// Runs once when the server starts. Schedules background jobs (reminders, change digests).
declare global {
  var __portalJobs: ReturnType<typeof setInterval> | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || globalThis.__portalJobs) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { runAllJobs } = await import("./lib/jobs");
  const EVERY = 10 * 60 * 1000; // 10 minutes
  setTimeout(runAllJobs, 30_000); // shortly after start
  globalThis.__portalJobs = setInterval(runAllJobs, EVERY);
}
