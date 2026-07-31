/**
 * Verification — refused actions are explained, not swallowed.
 *
 * The DoD is: *a queued assign for an asset someone else took is explained, not
 * swallowed*. That is produced here for real, not simulated — one session
 * assigns an asset, a second session's queued assign for the same asset drains
 * afterwards and is refused, and the refusal is then put through the same
 * explanation the screen renders.
 *
 * "Explained" is checked as three separate claims, because a screen can satisfy
 * one and fail the others:
 *
 *   * the action is **still there** after being refused (swallowing it is the
 *     failure FR-14.27 names);
 *   * the explanation names **what happened**, using the server's own sentence
 *     rather than a status code;
 *   * the explanation offers **something that would actually help** — and
 *     specifically does *not* offer a retry on a 409, because re-sending would
 *     be refused identically and the button would be a lie.
 *
 *   cd mobile && npx tsx scripts/verify-conflicts.ts
 */
import { api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Page, User } from "../src/api";
import { createQueue } from "../src/offline/queue/engine";
import {
  attentionSummary,
  canRetry,
  explainFailure,
  needsAttention,
} from "../src/offline/queue/explain";
import { onFailure } from "../src/offline/queue/policy";
import { decodeQueue, encodeQueue } from "../src/offline/queue/serialise";
import type { QueuedMutation } from "../src/offline/queue/types";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";

const memoryStore = (() => {
  const values = new Map<string, string>();
  return {
    async getItemAsync(k: string) { return values.get(k) ?? null; },
    async setItemAsync(k: string, v: string) { values.set(k, v); },
    async deleteItemAsync(k: string) { values.delete(k); },
  };
})();

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const uuid = () => globalThis.crypto.randomUUID();

function makeItem(over: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: uuid(),
    idempotencyKey: uuid(),
    method: "POST",
    path: "/assets/1/assign/",
    body: {},
    kind: "assign",
    subject: { type: "asset", id: 1, label: "TRA-2026-000019" },
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
    lastError: null,
    lastStatusCode: null,
    ...over,
  };
}

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  // =======================================================================
  console.log("\n1. Each kind of refusal gets its own explanation");

  const conflict = explainFailure(
    makeItem({
      status: "failed",
      lastStatusCode: 409,
      lastError: "TRA-2026-000019 is already assigned to Karan Verma.",
    }),
  );
  check(
    "a 409 shows the server's own sentence, not a status code",
    conflict.happened.includes("Karan Verma"),
    conflict.happened,
  );
  check(
    "and does NOT offer a retry",
    !conflict.actions.includes("retry"),
    "re-sending would be refused identically — the button would be a lie",
  );
  check(
    "it offers a way to see the current truth instead",
    conflict.actions.includes("open") && conflict.actions.includes("discard"),
    conflict.actions.join(" · "),
  );
  check("its advice says what to do", /open the asset/i.test(conflict.advice), conflict.advice);

  const outage = explainFailure(
    makeItem({ status: "failed", lastStatusCode: 0, lastError: "Network request failed", attempts: 8 }),
  );
  check(
    "an outage DOES offer a retry — the request itself was fine",
    outage.actions.includes("retry"),
    outage.advice,
  );
  check("and says how many times it tried", outage.advice.includes("8"), outage.advice);

  const forbidden = explainFailure(
    makeItem({ status: "failed", lastStatusCode: 403, lastError: "You do not have permission." }),
  );
  check(
    "a 403 explains the role changed rather than offering a pointless retry",
    !forbidden.actions.includes("retry") && /role/i.test(forbidden.advice),
    forbidden.advice,
  );

  const gone = explainFailure(makeItem({ status: "failed", lastStatusCode: 404 }));
  check(
    "a 404 says the thing is gone",
    !gone.actions.includes("retry") && /no longer exists/i.test(gone.happened),
    gone.happened,
  );

  const blocked = explainFailure(makeItem({ status: "blocked" }));
  check(
    "a blocked action explains it is waiting on an earlier one",
    /earlier action/i.test(blocked.happened) && !blocked.actions.includes("retry"),
    blocked.happened,
  );
  check(
    "and warns that sending it now could apply it to the wrong state",
    /did not intend/i.test(blocked.advice),
    blocked.advice,
  );

  check(
    "retry is offered only where it could work",
    canRetry(makeItem({ lastStatusCode: 0 })) &&
      canRetry(makeItem({ lastStatusCode: 503 })) &&
      !canRetry(makeItem({ lastStatusCode: 409 })) &&
      !canRetry(makeItem({ status: "blocked", lastStatusCode: 0 })),
  );

  check(
    "the entry point counts actions, not jargon",
    attentionSummary([makeItem({ status: "failed" })]) === "1 action needs attention" &&
      attentionSummary([makeItem({ status: "failed" }), makeItem({ status: "blocked" })]) ===
        "2 actions need attention",
    attentionSummary([makeItem({ status: "failed" })]) ?? "",
  );
  check(
    "and says nothing when there is nothing to say",
    attentionSummary([makeItem({ status: "pending" })]) === null,
    "a badge that is always lit is one nobody reads",
  );

  // =======================================================================
  console.log("\n2. The refusal survives a restart — it is not lost with the process");

  const refused = onFailure(
    [makeItem({ id: "x", status: "sending" })],
    "x",
    409,
    "Already assigned.",
    Date.now(),
  );
  const reloaded = decodeQueue(encodeQueue(refused));
  check(
    "a refused action is still there after a relaunch",
    reloaded.length === 1 && reloaded[0].status === "failed",
    "and is still marked failed, not quietly reset to pending",
  );
  check(
    "with the server's sentence intact",
    reloaded[0].lastError === "Already assigned." && reloaded[0].lastStatusCode === 409,
    `${reloaded[0].lastStatusCode}: ${reloaded[0].lastError}`,
  );
  check("and it is flagged as needing a person", needsAttention(reloaded[0]));

  // =======================================================================
  console.log("\n3. The DoD, produced for real against the server");

  await login("admin@trasset.local", PASSWORD);
  const people = await api.get<Page<User>>("/users/", { page_size: 50, is_active: true });
  const [first, second] = people.results.filter((u) => u.role_name === "employee");
  const spare = (
    await api.get<Page<Asset>>("/assets/", { status: "available", page_size: 1 })
  ).results[0];

  if (!first || !spare) {
    console.log("  SKIP  needs an employee and an available asset");
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  const disk = (() => {
    let bytes: string | null = null;
    return {
      async load() { return decodeQueue(bytes); },
      async save(items: readonly QueuedMutation[]) { bytes = encodeQueue(items); },
    };
  })();

  const q = createQueue({
    load: disk.load,
    save: disk.save,
    send: (item) => api.post(item.path, item.body, { idempotencyKey: item.idempotencyKey }),
    now: () => Date.now(),
    jitter: () => 0,
  });
  await q.load();

  // Queued while "offline": assign this asset to someone.
  await q.enqueue(
    makeItem({
      path: `/assets/${spare.id}/assign/`,
      body: { user_id: first.id, notes: "queued while offline" },
      subject: { type: "asset", id: spare.id, label: spare.asset_tag },
    }),
  );

  // Meanwhile, somebody else takes it.
  await api.post(
    `/assets/${spare.id}/assign/`,
    { user_id: (second ?? first).id, notes: "taken by someone else first" },
    { idempotencyKey: uuid() },
  );

  // Now the phone reconnects and drains.
  const report = await q.drain();
  const stuck = q.getItems()[0];

  check(
    "the queued assign was refused",
    report.failed === 1 && report.sent === 0,
    `sent ${report.sent}, failed ${report.failed}`,
  );
  check(
    "it was NOT swallowed — it is still in the queue",
    Boolean(stuck) && needsAttention(stuck),
    `status: ${stuck?.status}`,
  );

  const shown = stuck ? explainFailure(stuck) : null;
  check(
    "the screen would name what the user tried to do",
    Boolean(shown && shown.title.includes(spare.asset_tag)),
    shown?.title ?? "",
  );
  check(
    "and explain what happened, in the server's words",
    Boolean(shown && shown.happened.length > 20 && !/^\d+$/.test(shown.happened)),
    shown?.happened ?? "",
  );
  check(
    "and offer something that would actually help",
    Boolean(shown && shown.actions.includes("open") && !shown.actions.includes("retry")),
    shown?.actions.join(" · ") ?? "",
  );

  // --- discard is the only way work leaves without being applied ---------
  if (stuck) {
    await q.discard(stuck.id);
    check(
      "discarding is what removes it — and only that",
      q.getItems().length === 0,
      "never automatic; the screen confirms and names it first",
    );
  }

  // Leave the fixture as it was found.
  await api.post(`/assets/${spare.id}/checkin/`, {}, { idempotencyKey: uuid() });
  const restored = await api.get<Asset>(`/assets/${spare.id}/`);
  check("the asset is put back", restored.status === "available", `${spare.asset_tag} → ${restored.status}`);

  await logout();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: the Alert confirming a discard, which is an OS dialog\n" +
    "and needs a handset. What it guards — that nothing leaves the queue except\n" +
    "through an explicit discard — is checked above.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
