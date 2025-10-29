const pollers = new Map();
let pollCounter = 0;

export function startPoll(fetcher, callback, { intervalMs = 3500, keyPrefix = "poll" } = {}) {
  const key = `${keyPrefix}:${++pollCounter}`;
  stopPoll(key);

  let lastSignature = null;
  const run = async () => {
    try {
      const payload = await fetcher();
      const signature = JSON.stringify(payload);
      if (signature !== lastSignature) {
        lastSignature = signature;
        callback(payload);
      }
    } catch (error) {
      console.warn("Convex poll error:", error);
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  pollers.set(key, timer);
  return { key };
}

export function stopPoll(handleOrKey) {
  const key = typeof handleOrKey === "string" ? handleOrKey : handleOrKey?.key;
  if (!key) return;
  const timer = pollers.get(key);
  if (timer) {
    clearInterval(timer);
    pollers.delete(key);
  }
}
