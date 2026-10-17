import "server-only";

import { LiveEventListener } from "@/server/live/listener";

void (async () => {
  const topic = process.env.LIVE_REPLICA_TOPIC ?? "test/replica";
  const targetRevision = Number(process.env.LIVE_REPLICA_TARGET ?? "1");
  let stopped = false;
  const listener = new LiveEventListener();

  listener.subscribe(topic, (event) => {
    if (stopped || event.revision < targetRevision) return;
    stopped = true;
    process.stdout.write(
      `${JSON.stringify({ type: "received", at: Date.now(), revision: event.revision })}\n`,
    );
    void listener.stop().finally(() => process.exit(0));
  });

  void listener.waitUntilReady().then(() => {
    process.stdout.write(`${JSON.stringify({ type: "ready" })}\n`);
  });

  setTimeout(() => {
    if (stopped) return;
    process.stderr.write("replica worker timed out\n");
    process.exit(1);
  }, 15_000).unref();
})();
