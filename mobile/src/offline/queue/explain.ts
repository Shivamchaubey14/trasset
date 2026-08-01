/**
 * Turning a refused action into something a person can act on.
 *
 * FR-14.27 says nothing may fail silently, but a queue entry showing
 * `409 Conflict` next to a UUID satisfies the letter of that and none of its
 * intent. What someone standing in a store room needs is three sentences: what
 * I tried to do, what happened, and what I can do about it.
 *
 * The third is the one that takes judgement, and it is why `retry` is not
 * offered on everything. **Re-sending a 409 is dishonest**: the asset is still
 * held by whoever took it, so the request will be refused identically and the
 * button would do nothing but move the item to the back of the queue. Those
 * actions offer a way to *look at the asset* instead, because the only real
 * next step is to see the current truth and decide again.
 *
 * Pure, so every branch can be checked without a device.
 */
import { isRetryable } from "./policy";
import type { QueuedMutation } from "./types";

export type ConflictAction = "retry" | "open" | "discard";

export type Explanation = {
  /** What the user was trying to do, in their words. */
  title: string;
  /** What the server said, or what we can infer. */
  happened: string;
  /** What to do next. */
  advice: string;
  /** Offered actions, in the order they should appear. */
  actions: ConflictAction[];
};

const KIND_TITLES: Record<string, string> = {
  assign: "Assign",
  checkin: "Check in",
  "report-issue": "Report an issue",
  request: "Raise a request",
  approve: "Approve a request",
  reject: "Reject a request",
  "stocktake-scans": "Send a stock take count",
  "stocktake-submit": "Close a stock take",
};

function subjectLabel(item: QueuedMutation): string {
  if (item.subject.label) return item.subject.label;
  if (item.subject.type === "asset") return `asset #${item.subject.id}`;
  if (item.subject.type === "stocktake") return `stock take #${item.subject.id}`;
  return `request #${item.subject.id}`;
}

export function explainFailure(item: QueuedMutation): Explanation {
  const what = KIND_TITLES[item.kind] ?? item.kind;
  const title = `${what} — ${subjectLabel(item)}`;
  const status = item.lastStatusCode ?? 0;
  const server = (item.lastError ?? "").trim();

  // An action held because something *before* it was refused. Its own send
  // never happened, so it has no server sentence of its own to show.
  if (item.status === "blocked") {
    return {
      title,
      happened: "Held back, because an earlier action on the same item was refused.",
      advice:
        "Deal with that one first. Sending this now could apply it to a state you did not intend.",
      actions: ["discard"],
    };
  }

  if (status === 409) {
    return {
      title,
      // The server's own sentence names the person and the asset, and is far
      // more useful than anything invented here.
      happened: server || "Someone else changed this before your action reached the server.",
      advice: "Open the asset to see where it stands now, then decide again.",
      actions: ["open", "discard"],
    };
  }

  if (status === 403) {
    return {
      title,
      happened: server || "You are not allowed to do this.",
      advice: "Your role may have changed since you queued it. Ask a manager, or discard it.",
      actions: ["discard"],
    };
  }

  if (status === 404) {
    return {
      title,
      happened: server || "That item no longer exists.",
      advice: "It was probably deleted after you queued this. There is nothing left to apply it to.",
      actions: ["discard"],
    };
  }

  if (status >= 400 && status < 500) {
    return {
      title,
      happened: server || "The server refused this action.",
      advice: "It will be refused the same way if sent again. Discard it, or redo it from the asset.",
      actions: ["open", "discard"],
    };
  }

  // Everything left is transient — a genuine outage, or attempts exhausted
  // against one. Retrying is honest here, because the request itself was fine.
  return {
    title,
    happened:
      status === 0
        ? "This never reached the server."
        : server || "The server had a problem handling this.",
    advice:
      item.attempts > 0
        ? `Tried ${item.attempts} ${item.attempts === 1 ? "time" : "times"}. You can try again now.`
        : "You can try again now.",
    actions: ["retry", "discard"],
  };
}

/** Whether an item is the queue's business or a person's. */
export function needsAttention(item: QueuedMutation): boolean {
  return item.status === "failed" || item.status === "blocked";
}

/**
 * A one-line summary for the entry point.
 *
 * Deliberately counts *actions*, not items: "2 actions need attention" is what
 * a person understands, where "2 queue entries" is what a developer does.
 */
export function attentionSummary(items: readonly QueuedMutation[]): string | null {
  const count = items.filter(needsAttention).length;
  if (count === 0) return null;
  return `${count} ${count === 1 ? "action needs" : "actions need"} attention`;
}

/** True when a failure is worth offering a retry for, given its status. */
export function canRetry(item: QueuedMutation): boolean {
  return item.status !== "blocked" && isRetryable(item.lastStatusCode ?? 0);
}
