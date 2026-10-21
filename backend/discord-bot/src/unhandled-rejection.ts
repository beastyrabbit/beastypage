// Keep the bot alive even when monitoring is disabled. Sentry's own listener
// captures rejections when initialized; logging here must not report them twice.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
