# Trasset — Progress Log

> **This file is the source of truth for where the build stands.**
> Say **"resume from last"** and work restarts from the *Next up* section below.
> Update this file at the end of every working session.

**Started:** 2026-07-27
**Last updated:** 2026-07-30
**Plan:** [`Trasset_Build_Plan.md`](Trasset_Build_Plan.md) · **Contract:** [`Trasset_SRS.md`](Trasset_SRS.md)

> **Scope now spans two releases.** v1.0 is the web app (Days 1–30, in progress).
> v1.1 is a React Native mobile app (Days 31–60), specified in SRS §12. Its
> backend groundwork (Phase 5, SRS §12.4) is **done**; the app itself has not
> been started and is waiting on the user's go-ahead.
**Repo:** https://github.com/Shivamchaubey14/trasset (public) · branches `main`, `dev`

---

## Status at a glance

| Phase | Days | Status |
|-------|------|--------|
| Phase 0 — Foundation | 1–5 | ✅ Complete |
| Phase 1 — Core Asset Engine | 6–12 | ✅ Complete (Days 6–12) |
| Phase 2 — Maintenance, Procurement, Reports | 13–18 | ✅ Complete (Days 13–18) |
| Phase 3 — Frontend | 19–26 | 🟡 Days 19–25 done · Day 26 done except browser QA |
| Phase 4 — Integration, Testing & Launch | 27–30 | 🟡 Days 27, 28 done · Days 29, 30 open |
| Hindi/English toggle (added on request) | — | 🟡 Engine + chrome done · page content pending |
| **Phase 5 — Mobile API groundwork** | 31–35 | ✅ Complete (Days 31–35) |
| **Phase 6 — Mobile app foundation** | 36–41 | ✅ Complete (Days 36–41) |
| **Phase 7 — Core journeys** | 42–47 | ✅ Complete (Days 42–47) |
| **Phase 8 — Offline & stock take** | 48–53 | 🟡 Days 48–52 done · Day 53 open |

**Backend test suite:** 719 tests, all passing · **Coverage:** 89.7% (target ≥ 70%, NFR-12)
**Performance:** every list endpoint under 400 ms at **10,000 assets**; worst p95 288 ms (NFR-1)
**Dependencies:** `pip-audit` clean — no known vulnerabilities
**OpenAPI schema:** 74 endpoints, 0 errors, 0 warnings (NFR-13)

> **Backend feature work is complete.** Every functional requirement in SRS §3
> has an implementation, except the `[L]`-priority printable label sheets
> (FR-9.3) and recurring maintenance schedules (FR-6.4), both deferred to v1.1.
**Query counts:** every list endpoint asserted flat — cost does not grow with rows (NFR-1)

> **Note on sequencing.** The plan runs backend-first (Days 1–18) then frontend
> (19–26). At the user's request the frontend was pulled forward once auth,
> users and masters were live, so those screens are real rather than mocked.
> Asset screens still wait on the Day 7 asset API.

---

## ▶ Next up — start here

> **From 2026-07-29 the mobile application is the main workstream**, at the
> user's direction. Deployment is incremental from here — "we will deploy as the
> things get done" — rather than the single Day 29 cutover the plan assumed.

**1. Phase 5 — mobile API groundwork (Days 31–35) is ✅ complete.** Every item in
SRS §12.4 now exists: BE-1 through BE-8. The backend is ready for a mobile
client — sessions that survive, replayable writes, cheap sync, one-call scans,
push, and the stock-take model.

**2. Phase 6 — mobile app foundation (Days 36–41).** Day 36 is done: `mobile/`
runs in Expo Go with the tab shell, both themes and both fonts. Next:

- **Day 37** — ✅ done: typed API client, generated from the schema.
- **Day 38** — ✅ done: authentication, biometric unlock, session persistence.
- **Day 39** — ✅ done: design system and component gallery.
- **Day 40** — ✅ done: scanning and manual entry.
- **Day 41** — ✅ done: asset detail with history and state/role-aware actions.
  **Phase 6 complete.**

**Phase 7 — core journeys (Days 42–47).** Day 42 is ✅ done.

- **Day 43** — ✅ done: assign and check in, with the conflict flow.
- **Day 44** — ✅ done: photo capture and report-an-issue.
- **Day 45** — ✅ done: requests and approvals, plus two schema lies fixed.
- **Day 46** — ✅ done: notifications, deep links, device registration. The one
  part of its DoD that needs a real handset is **still open** — see below.
- **Day 47** — ✅ done: profile and settings. Appearance override
  (System / Light / Dark, device-local), notification preferences honoured by
  the server, password change, sign-out and an about screen. **Phase 7
  complete.**
- **Day 48** — ✅ done: offline reads. The query cache is persisted to
  AsyncStorage and rehydrated at launch, every read screen has a real offline
  state instead of an endless spinner, cached content is dated, and signing out
  purges the cache from disk as well as memory.
- **Day 49** — ✅ done: the durable mutation queue. Survives a restart, keys
  minted at enqueue so a resend applies once, serial oldest-first drain on
  reconnect, exponential backoff, and refusals kept for a person rather than
  dropped.
- **Day 50** — ✅ done: the conflict screen. Refused actions are listed with
  what happened and what to do, retry is offered only where it could work, and
  a drain that fails says so at the time.
- **Day 51** — ✅ done: stock take, part 1. A session scoped to one location,
  the expected list downloaded up front, a continuous scan loop that never
  leaves the screen, running counts, and duplicates recognised rather than
  double-counted.
- **Day 52** — ✅ done: stock take, part 2. Counts survive a force-quit and
  resume, submission goes through the mutation queue so it lands on reconnect,
  and the reconciliation is honest while the count is still queued. Two real
  ordering bugs fixed on the way.
- **Day 53** — ⬅ **next**: offline hardening, and the last day of the phase.
  Signal lost mid-request, a token expiring while work is queued, clock skew,
  storage full, the app killed mid-drain; plus instrumenting queue depth and
  failures. Several of these already have partial answers — `wakeAll` and the
  per-subject hold landed here, `describeAge` already clamps a backwards clock,
  and every storage helper swallows its own failure — so the day is as much
  about proving them as writing them.

**Still needed from the user, and now actually blocking:**

1. **An Expo account / EAS project id.** Day 46 built the whole push path, but
   `getExpoPushTokenAsync` needs a project id and `app.json` has none, so no
   token can be minted and `registerForPush` returns `no-project`.
2. **A development build.** Expo Go dropped remote push in SDK 53, so push
   cannot be tested in it at all — `registerForPush` returns `expo-go`.
3. **Push credentials** (APNs key / FCM), without which Day 34's
   `ExpoPushBackend` still has never run against the real service.

None of these block Day 48, which is why it is next. The settings screen now
calls `registerForPush({ prompt: true })` when push is switched on, so each of
those three states surfaces to the user as its own explained sentence rather
than a silent no-op.

**Two things still needed from the user:** an **Expo account** for dev builds
(Expo Go needs none, so Days 36–39 are unblocked), and eventually **push
credentials**, without which Day 34's `ExpoPushBackend` cannot be exercised
against the real service.

The contract for Phase 6 is SRS §12; each day's Objective / Tasks / Definition
of Done is in `Trasset_Build_Plan.md`.

**3. Carried over from v1.0 — open, not abandoned, and not blocked on mobile:**

- **Day 29** deploy and **Day 30** docs + `v1.0` tag. Deploying is now
  incremental, so pull these forward whenever a piece is ready rather than
  waiting.
- **Browser QA of the whole web UI** — still nobody has driven it (see item 5).
- **Hindi page content** — the toggle works and the chrome is bilingual, but
  table headers, filters, modals, forms and the JS-built strings are still
  English. Detail in item 4.

**4. Finish the Hindi/English toggle** (user request, in progress — commit `b7977ef`).

Done and pushed: the translation engine `frontend/js/i18n.js` (`t`, `apply`,
`set`, `toggle`, `mount`, a Hindi dictionary, `localStorage` under
`trasset.lang`, and a `trasset:lang` event); the control mounted top-right on
the sign-in page and in the top bar of every app page; `html[lang="hi"]`
switching both font roles to Noto Sans Devanagari; the 180 ms fade on switch;
and `data-i18n` on the login page, the shell nav and top bar, and all 11 page
titles and subtitles.

What is left — the app is bilingual in its chrome but still English in its
content:
- Dynamic strings built in JavaScript: `js/ui.js` empty states, the pagination
  line, toasts and validation messages. Route them through `T.i18n.t()`.
- Per-page content on all 11 screens — table headers, filter and tab labels,
  modal titles, form labels, button text.
- Server-supplied display strings (status labels, role labels, category names).
  Role labels are already mapped through `role.*` keys; statuses need the same.
- Extend the dictionary in `js/i18n.js` as each of those lands.

Rule that keeps this safe: **the English stays in the markup as the fallback**,
so a missing key degrades to English, never to a raw key name.

**5. Browser QA — Day 26's one remaining blocker: somebody opening the app in a
browser.** The Hindi switch is now part of what needs looking at.

Everything on Day 26 that could be done without a browser is done (see below).
What remains needs a human at a screen:

1. **Click through the whole app.** The standing gap. Every script is
   syntax-checked and every API call each page makes has been exercised, but
   nobody has driven the UI. This will generate the real punch list, and it
   should happen before Phase 4 rather than after.
2. **Responsive check down to 768px** (NFR-9). The breakpoints are written and
   the layout is built for it, but it has never been resized.
3. **Screen-reader spot check.** The structural work is done — focus trap,
   `aria-sort`, labelled controls, tablists — but no assistive technology has
   actually been pointed at it.

Run both servers, open `http://127.0.0.1:5500`, and note anything that looks
wrong. Small visual fixes are cheap now and get more expensive once Phase 4
starts.

**6. The rest of Phase 4:**
- **Day 27** — ✅ done: every journey walked per role against SRS §11.4.
- **Day 28** — ✅ done: SRS §9 security checklist, list endpoints load-tested at
  10,000 assets, `pip-audit` clean.
- **Day 29** — deploy: Nginx, Gunicorn, MySQL, Redis, Celery worker and beat,
  TLS, nightly backups. Now incremental — stand the environment up early and
  ship to it as pieces finish.
- **Day 30** — docs, seed real master data, tag v1.0.

Reusable groundwork: `BaseModelViewSet`, the envelope, the table/toolbar/modal
patterns in `js/masters.js`, `js/assets.js`, `js/audit.js` and `js/requests.js`,
`js/asset-form.js` for any dialog that mutates an asset, and
`audit.services.domain_action()` / `record()` to give a new business verb its own
audit row.

---

## Completed

### Day 52 — Stock take, part 2 ✅

Full offline operation, submit on reconnect, reconciliation, and resume.

- **The count is written on every scan.** A stock take is an hour of somebody's
  afternoon walking a room; losing it to a low-memory kill is not a degraded
  experience, it is the whole job again — and the second count will not match
  the first. Resuming is checked properly: a label counted before the crash is
  still a duplicate after it, or a resumed count double-counts everything that
  came before.
- **An unreadable session is discarded, not half-read** — the opposite of the
  rule the mutation queue follows, deliberately. A queued action is something
  the user believes they performed, so it must survive to be shown. A
  half-finished count promises nobody anything, and resuming it with fields this
  build cannot read would produce a *wrong* count, which is worse than an honest
  recount.
- **Submission goes through the mutation queue**, not the network. That is what
  makes "completed entirely offline" true rather than aspirational: the queue
  already survives a force-quit, drains on reconnect, backs off, and keeps a
  refusal for a person. None of it was worth building twice.
- **The reconciliation screen is honest before the count has been sent.**
  Showing zeros would be a lie and a spinner would suggest something is in
  progress; it says the count is safe, has not been sent yet, and points at
  where to watch it go.

**Two real ordering bugs, both found by running it rather than reading it.**

The first: submitting a stock take enqueues two calls in the same millisecond,
and `drainOrder` tie-broke on a random UUID. A submit reconciles *what the
server has*, so a submit that overtook its own scans would close the session
having received nothing. Fixed with a monotonic `seq` assigned at enqueue.

The second was worse and only appeared end to end. The scan batch fails once
with no signal and goes into backoff. On reconnect it is not *ready*, so
`nextReady` skipped it and took the submit — which had never been attempted and
so had no backoff. The session closed with **found 0, missing 15**: every asset
in the room written off, from a count that had all of them. Fixed by making an
item wait for anything queued before it **on the same subject**, even when the
predecessor is only backing off. Unrelated subjects still drain past it.

That fix exposed a third, smaller thing: holding the successor correctly meant
nothing sent at all until the backoff expired. So a reconnect now calls
`queue.wake()` first — the backoff was waiting out an outage that has
demonstrably ended, and waiting anyway means a user who has walked back into
signal watches their count sit there. Attempt counts are left alone, so a
genuinely broken action still cannot retry for ever.

**Verification:** `verify:stocktake-offline` **21/0**, reproducing the DoD
rather than approximating it — the session opens online, the sender is then
replaced with one that fails exactly as an offline client does, the room is
counted with a force-quit taken mid-room, the finished count is queued, a drain
with no network loses nothing, the app is killed again, and only then does the
signal return. The server's own reconciliation is read back and matched against
what the phone showed: **found 14, missing 1, unexpected 1** on both sides. A
replayed submit leaves it unchanged.

Backend **719/719**. `tsc` clean. Mobile suite now 321 checks across thirteen
scripts.

**Not covered without a handset:** literal aeroplane mode and a literal
force-quit.

---

### Day 51 — Stock take, part 1 ✅

The DoD is a hundred assets scanned in sequence **without leaving the screen**,
and nearly every decision here follows from that one sentence.

- **The expected list is downloaded before counting starts, not during.** A
  session that discovers page three is missing halfway round a store room is
  worse than one that refused to open — by then the person has counted things
  they will have to count again. It also means the loop works with no signal,
  which is the only condition a store room reliably offers.
- **No request per scan.** Reconciliation happens on the phone against that
  list, so the loop runs at the speed of the camera rather than the network. A
  hundred scans is **one** call at the end, not a hundred. Verified: 14 scans,
  1 request.
- **Duplicates are recognised, not counted.** A camera reads the same label
  thirty times a second while it is held in frame. The session returns its state
  **unchanged by reference** for a repeat, so React does no work for the
  commonest event on the screen, and a cheap time guard stops the store being
  touched at all. Case and stray whitespace normalise to the same key —
  otherwise one shelf is counted twice and its twin reported missing, which are
  the two worst outcomes this screen can produce, from a single scan.
- **`missing` is derived, never recorded.** It is expected-minus-found, so it
  falls as the count rises. Recording it during the session would mean every
  asset was "missing" until the moment somebody happened to reach it.
- **An asset from another room counts as unexpected rather than being
  discarded.** It is physically in the counter's hand; refusing it would throw
  away a real finding — and unexpected deliberately does not reduce this room's
  `missing`, because it belongs to a different room's tally.
- **Three haptics for three meanings**, because the user is looking at a shelf
  and not at the phone (SRS §12.6): a tick for a hit, a warning for something
  that does not belong here, and **silence for a repeat** — which is the correct
  answer to "you already have that one".
- **The counting screen has no header and no back gesture.** A back arrow above
  a live count invites leaving it by accident, and the session is not yet
  persisted.

**A real bug the verification caught.** `startStockTake` posted `location`; the
create serializer takes `location_id` and maps it with `source="location"`.
The app would have failed to open a single session. Nothing but a round trip
against the real server would have found it — the field name is right there in
the OpenAPI schema and still went unnoticed.

**Verification:** `verify:stocktake` **23/0**. A hundred scans really are run in
sequence and the tally checked exactly; one label read thirty times counts once
(29 of 30 recognised as repeats); and against the real server the phone's
arithmetic and the server's reconciliation agree on all three numbers —
found 13, missing 1, unexpected 1. If those two ever disagree, the person
counting has been lied to by one of them.

Backend **719/719**. `tsc` clean. Mobile suite now 300 checks across twelve
scripts.

**Not covered without a handset:** the camera and the haptics.

**Deliberately left for the next day:** the session lives in memory, so a
force-quit still loses it, and submitting needs a connection at the end.

---

### Day 50 — Conflicts ✅

The queue already kept refused actions rather than dropping them. This is where
a person finally sees them, and the only place they can be resolved.

- **Three sentences per row: what you tried, what happened, what to do.** A
  status code next to an identifier satisfies the letter of FR-14.27 and none of
  its intent — it tells a developer everything and a store keeper nothing. What
  happened uses the **server's own sentence**, which names the asset and the
  person who took it, and is far more useful than anything invented on the
  client.
- **Retry is not offered on a 409, deliberately.** Re-sending would be refused
  identically; the button would do nothing but move the item to the back of the
  queue while looking like progress. Those rows offer *Open the asset* instead,
  because the only honest next step is to see where it stands now and decide
  again. A network failure or a 5xx does get a retry — there the request itself
  was fine.
- **Every refusal reason gets its own advice.** 403 says your role may have
  changed; 404 says the thing is gone; a blocked action explains it is waiting on
  an earlier one and warns that sending it now could apply it to a state you did
  not intend.
- **Discard is the only way work leaves without being applied**, it is never
  automatic, and it confirms while naming what is being thrown away. It is the
  one irreversible action on the screen and the thing being discarded is work
  the user believes they did.
- **A refusal is announced when it happens**, not left to be discovered. The
  drain raises a toast pointing at the screen. A failure that surfaces only if
  you happen to open the right screen is, from the user's side, indistinguishable
  from having been dropped.
- **The entry point is always present, even at zero.** A route that appears only
  when something is wrong is one nobody knows exists when it matters. The badge
  separates *pending* from *needs you* — collapsing them into one number would
  bury refusals behind work that is going to succeed anyway.

**Verification:** `verify:conflicts` **23/0**. The DoD is produced for real
rather than simulated: an assign is queued while "offline", a second session
takes the same asset, the queue drains and is refused. Then the three claims are
checked separately, because a screen can satisfy one and fail the others — the
action is still there, the explanation carries the server's words
("TRA-2026-000004 is already assigned to Karan Verma. Check it in before
assigning it again."), and the offered actions are *open · discard* with no
retry among them.

Backend **719/719**. `tsc` clean. Mobile suite now 277 checks across eleven
scripts.

**Not covered without a handset:** the OS confirmation dialog on discard. What
it guards — that nothing leaves the queue except through an explicit discard —
is checked.

---

### Day 49 — Mutation queue ✅

The DoD is: check an asset in with no signal, force-quit, reconnect, and it
syncs **exactly once**. Every clause of that sentence is a separate problem.

- **A queued action is a description of a request, never a closure.** Method,
  path, body and key are data, because a closure cannot be written to disk and
  surviving the process being killed is the entire point.
- **The idempotency key is minted when the user commits, not when the request is
  sent.** This one decision is where "exactly once" is actually won. A key
  generated at send time would be new on every retry, the server would see each
  attempt as a different action, and a check-in resent after a crash would apply
  twice. Every retry — in this process or one three days later — carries the
  same key.
- **Anything left `sending` at launch becomes `pending` again.** A `sending`
  item is one the app died in the middle of; it may or may not have reached the
  server, and nothing on the device can tell. Resending is the only option, and
  it is *safe* only because the key came back with it.
- **The queue is written to disk before the request goes out.** Coalescing those
  writes would open precisely the window this exists to close: a crash after the
  server acted but before the record existed.
- **Serial, oldest first.** Concurrency here would be faster and wrong — two
  actions on one asset would race and the loser would apply to a state that no
  longer exists.
- **409 is not retryable.** It means someone else took the asset; repeating the
  request cannot fix that, so it needs a person. A refused action is marked
  `failed` and kept with the server's own sentence, and **later actions on the
  same asset are blocked rather than applied out of order** — assigning after a
  refused check-in would put an asset somewhere nobody asked for. Unrelated
  assets are untouched.
- **Nothing is ever silently dropped** (FR-14.27). Not on refusal, not at the
  attempt limit, not even when the stored queue comes from a version this build
  does not understand — those surface as `failed` with an explanation instead of
  vanishing. An action retried forever would be indistinguishable from one that
  is stuck, and the user can see neither.
- **A drain halts on an outage** rather than grinding through forty items to
  collect forty identical failures and pushing them all towards the attempt
  limit for one lost signal.
- **"Queued" is never reported as "done".** Offline, the check-in screen says it
  *will* check in when back online. Telling someone it is done when nothing has
  reached the server is the exact lie FR-14.27 exists to prevent.
- **Sign-out clears the queue** as well as the cache, and for a sharper reason:
  a queued action carries no identity of its own, so anything left would be sent
  under whichever account signs in next.

**Verification:** `verify:queue` **41/0**, most of it against the real server.
The one that matters: an action is queued offline, the in-memory queue is thrown
away and rebuilt from its bytes — which is what a relaunch does — it drains and
the asset changes, and then **the same item is sent a second time**, the crash
window where the app dies after the server acted but before recording it. The
server recognised the key and the asset's history went 5 rows → 5 rows. Two
sends, one effect, proven by the history rather than by trusting a 2xx.

Backend **719/719**. `tsc` clean. Full mobile suite 254 checks across ten
scripts.

**Not covered without a handset:** a literal force-quit and literal aeroplane
mode.

---

### Day 48 — Offline reads ✅

The DoD is "in aeroplane mode, recently viewed assets and my assets still open".
Almost none of the work is about the radio.

- **The cache is persisted, not merely kept.** `gcTime` already held data for a
  day, but that dies with the process — so the client is dehydrated into
  AsyncStorage and rehydrated at launch. That is the difference between "opens
  offline" and "opens offline until you close the app".
- **A spinner is a promise that something is happening.** With no network
  nothing is happening, so an offline screen with nothing cached shows an
  offline state with a retry, never a skeleton. This was the single most
  common bug the day existed to prevent, and it is now impossible by
  construction: `offlineRead` decides it once for every screen.
- **Offline is checked before error, everywhere.** A request made with no signal
  also fails, so a screen that reports the error blames the server for the
  aeroplane mode the user turned on. "It may have been removed" about an asset
  that is simply out of reach is a lie the old code told.
- **Connected is not reachable.** A handset on a café captive portal, or behind
  a router whose uplink is down, is connected to something and can reach
  nothing. `isInternetReachable` wins whenever it has an opinion; when it has
  none — which is what Android reports while probing — the fallback is
  `isConnected`, and a wholly unknown state is treated as **online**. Guessing
  offline would suppress the first fetch of every screen; guessing online costs
  one request that fails and retries.
- **One source of truth for connectivity.** Everything reads TanStack's
  `onlineManager`, so a screen cannot show "Offline" while a request of its own
  is in flight.
- **Age travels with the data.** `describeAge` is deliberately coarse — "3 min
  ago" is a claim about freshness, not a clock — and clamps a backwards clock so
  it can never say "in 3 minutes". `dataUpdatedAt` of 0 means never fetched, not
  1970, so no age is invented for data that does not exist.

**The security consequence of persisting, handled.** The cache holds one
person's assets, requests and notifications. Signing out now purges it from
memory *and* disk; on a shared handset, rehydrating the previous user's cache
into the next user's session would be a leak, and a silent one, because every
screen would look entirely normal. `forgetSession` purges for the same reason.
Session *expiry* deliberately does not — it is the same person signing back in,
and Day 49's queue must survive it.

**Mutations are never persisted.** Replaying a write from a restored cache would
apply it twice. The durable queue owns replay, because only it holds the
idempotency key that makes it safe (BE-4).

**A boundary re-drawn.** The first cut put the pure decisions in the same files
as the platform imports, and the verification could not even load — `tsx` pulls
in `react-native` and fails on its Flow types. Split as the codebase already
does elsewhere: `reachability.ts`, `read.ts` and `policy.ts` hold the decisions
and import nothing from the platform; `online.ts` and `persist.ts` hold the
wiring. The rule earns itself twice — the logic is testable, and the split is
what made the failure obvious.

**Verification:** `verify:offline` **30/0**, without a phone — every combination
of (online, cached, loading, error), the captive-portal case, the age
boundaries including a backwards clock, what is allowed onto disk, and a real
`QueryClient` round-tripped through dehydrate → JSON → hydrate with its
`dataUpdatedAt` intact. Backend **719/719**. `tsc` clean.

**Not covered without a handset:** the OS actually reporting aeroplane mode, and
AsyncStorage surviving a real force-quit.

---

### Day 47 — Profile & settings ✅

Phase 7 closes. The DoD — "preferences persist and are honoured by the server" —
is two claims, and separating them was most of the work.

- **Two kinds of preference, deliberately not treated alike.** Appearance is
  **device-local** and never leaves the phone: theme belongs to the screen you
  are looking at, not to the account, and the same person can reasonably want
  dark on a phone in a dim stock room and light on a tablet at a desk. The
  server has no theme column for that reason. Notification preferences are
  **account-wide** and go straight to `PATCH /auth/me/`, applied optimistically
  and rolled back if the server refuses — a switch left sitting in the wrong
  position after a failure is worse than one that moves back and says why.
- **Three appearance states, not two.** A plain light/dark switch has to be set
  once and then *stays* set, so anyone following the OS — which is most people,
  and everyone at dusk if the OS schedules it — has no way back once they touch
  the control. So "System" is a real option, it is the default, and an unset
  preference reads as it. `resolveScheme` is a pure function of (preference, OS
  scheme), which is why the whole decision is verifiable without a device.
- **The OS reporting `null` is the case that bites.** Android can return no
  scheme at all, and briefly does on both platforms during a cold start. It
  resolves to light, because the light palette is the one every colour in
  `tokens.ts` was measured against first.
- **No white flash on launch for dark-mode users.** The provider holds render
  until the stored preference is read, which is invisible because the splash is
  still up — rendering the OS scheme and correcting it a frame later is exactly
  what that avoids. Nested providers with a forced `scheme` skip storage
  entirely and inherit the real preference, so the gallery cannot write to it.
- **The flags gate dispatch, and nothing else.** This is the part a settings
  screen gets wrong. `apps/notifications/services.py` gates `queue_email` and
  `queue_push` only — the in-app record is always written. Verified end to end:
  with **both** flags off, an assignment still lands in the recipient's Alerts
  list. Muting delivery must not also hide the record, because the list is how
  someone catches up on what they muted.
- **Password errors are placed on the field the server named.** Django's
  validators produce genuinely useful sentences — too short, too common, too
  similar to your email — and collapsing them into one banner throws away which
  input to fix. The session deliberately survives the change, since the person
  made it themselves on this device.
- **An about screen support can actually use.** Version, build, runtime,
  platform, device, server URL and whether *this* handset can receive push —
  selectable, so it can be pasted into a message. "I am not getting
  notifications" has several causes that look identical from outside.

**A trap found while writing the verification.** The first version changed a
demo account's password and tried to change it back — and could not.
`Trasset@2026` cannot be *set* through `/auth/password/change/` on any
`@trasset.local` address, because Django's `UserAttributeSimilarityValidator`
rejects it as too similar to the email. The seeded accounts only hold it because
`bootstrap` calls `set_password` directly, which runs no validators. A script
written that way signs in happily, then leaves every other verify script on the
machine locked out. It now creates and stands down its own throwaway account and
never touches a fixture. (`employee@trasset.local` was restored via the ORM.)

**Also learned:** `DELETE /users/{id}/` deactivates rather than deletes, since
someone who has held an asset must stay attributable in its history — so the
cleanup asserts "cannot sign in", not "row is gone", and re-runs reactivate the
same subject rather than colliding with the unique email.

**Verification:** `verify:settings` **24/0** — including the preference
round-trip, the dispatch-gating proof, all four password refusals with the
server's own sentences, and a real change verified by signing in with the new
password and being refused with the old. Backend **719/719**. `tsc` clean.

**One measured finding, left alone deliberately.** White on Nest Green is
**2.54:1** in light, against the 4.5:1 NFR-9 requires. It is the
`onPrimary`-on-`primary` pairing already used by every primary `Button` label,
every selected `Chip` and the `Avatar` initials — so it predates this work.
Dark is fine at 7.25:1. No existing token fixes it: Ink on Nest Green is 4.45:1,
still short. Only darkening the brand green would, which is a design decision
affecting the web app too. Recorded by the verify script rather than patched.

---

### Day 46 — Notifications & deep links ✅

Every tab now has a real screen; the last placeholder went with this day.

- **Three arrival states, three code paths**, because they are genuinely
  different problems. Foreground: the app is open and the OS would stay silent,
  so the banner is shown deliberately *and* the badge and lists are refreshed,
  so the state behind it is not stale the moment it is dismissed. Background: a
  tap fires the response listener with the navigator already mounted. **Cold
  start: the tap launched the app, so no listener exists yet** — it is read back
  with `getLastNotificationResponseAsync`, and because the navigator may still be
  mounting, the route is held and replayed until the ref is ready. That last one
  is what the DoD names and the one that silently does nothing if you rely on the
  listener alone.
- **Routing is a pure function** (`routeForPayload`), which is why it could be
  verified without a phone at all. The server sends three candidate fields and
  they are not interchangeable: `deep_link` is native and preferred;
  `related_object_type` + `related_object_id` is what the REST list actually
  exposes, so an in-app row must use it; and `link` is a *web* path that is
  never routed on. Both of the first two are supported, and an in-app tap and a
  push tap therefore cannot disagree about where a notification leads.
- **Unrecognised targets fall back to the Alerts list, not a crash.**
  Maintenance records and purchase orders have deep links server-side but no
  phone screen (desk work, §12.8). Falling back shows the message that was
  tapped, and a new `related_object_type` added later degrades instead of
  throwing.
- **Permission priming.** iOS gives an app one chance to ask; once denied the
  dialog never returns. So launch runs `registerForPush({ prompt: false })`,
  which picks up an existing grant without spending the ask, and the explicit
  request belongs behind Day 47's settings screen. `denied` and `blocked` are
  separate outcomes — the difference between a button and a link to Settings.
- **Every outcome is a value, never an exception.** A token cannot be obtained on
  a simulator, in Expo Go, or without an EAS project id, and none of those is a
  fault to throw about — each needs its own sentence. `explainOutcome` keeps
  those sentences next to the outcomes so a new one is a compile error rather
  than an empty string in the UI.
- **Registration is an upsert** called on every launch (BE-2). Verified that
  re-registering the same token updates the row rather than adding one — two
  rows for one handset means two pushes for one event.
- **Signing out deregisters the handset in the same call** that blacklists the
  refresh token, closing the `TODO(Day 46)` left in `AuthContext`. The token is
  cached in module scope *only after the server has it*: remembering a token
  whose registration failed would have sign-out ask the server to forget
  something it never knew.
- Tapping a row marks it read **and** opens the record. Marking read separately
  would be busywork — reading it is the act of reading it. Unread is a dot plus
  a weight change, never colour alone (NFR-9).
- The tab badge comes from `/notifications/count/`, which exists so the badge
  does not have to page the list. Polled on an interval as well as invalidated
  by the push listener, because on a build that cannot receive push at all the
  poll is the only thing keeping it honest.

**What is NOT done, and cannot be here.** The DoD's "a push arrives on a real
device" is unmet: Expo Go dropped remote push in SDK 53, and `app.json` has no
EAS project id, so no token can be minted. **This needs a development build, an
Expo account and push credentials** — the two outstanding asks. Everything up to
the dispatch is built and verified; `ExpoPushBackend` (Day 34) has still never
run against the real service.

**Verified:** `npm run verify:push` — 30 checks, all passing: the routing
resolver against ten payload shapes *and* against every real notification on the
account (25 of 25 resolved to a screen), the registration upsert, per-user device
ownership, an auditor registering despite the read-only guard, the read
transitions and badge arithmetic, and one notification raised end to end — an
assignment notified the recipient and its payload resolved to that very asset
(#45 → #45).

All eight suites green — 170 checks: `api` 18 · `scan` 18 · `detail` 22 ·
`list` 15 · `lifecycle` 16 · `photos` 11 · `requests` 40 · `push` 30. Backend
**719 passing**; `npm run tsc` clean.

**Dependency note.** `expo-notifications@~0.32.17` (the SDK 54 match) adds no new
root advisory — `npm audit` flags it only *via* `expo-constants`, which was
already present. The four roots (`brace-expansion`, `js-yaml`, `postcss`,
`uuid`) are pre-existing transitive build tooling; the offered "fix" is
expo-notifications 57, a different SDK major, which is not a Day 46 decision.

### Day 45 — Requests & approvals ✅

The workflow now runs end to end from a phone: an employee asks, an approver
decides, and the asset changes hands.

- **One screen, read two ways.** An employee gets their own requests and a
  pinned button to raise another. An approver gets a second mode — decisions
  waiting on them — and lands on it first, because someone opening this tab with
  an approver's role is almost always answering something rather than browsing
  their own history. The mode switch is *absent* for a role that cannot decide,
  not shown-and-disabled: a control that is visible but never usable invites a
  tap and then explains why not.
- **Pending is the inbox default**, not a filter to apply. A settled request is
  history, and history is not what an inbox is for.
- **Scoping stays on the server.** `AssetRequestViewSet.get_queryset` decides
  who sees what — employees their own, a department head their department,
  managers everything. The client sends no `?requester=` for the inbox, because
  a scope the client sends is a scope the client can lift.
- **Approving a category request picks the asset inline.** "Any Laptop" cannot
  be approved without saying which laptop; the server refuses with a 409 and a
  sentence saying so, so the picker sits in the decision rather than letting
  someone press Approve into a guaranteed error.
- **A 409 on a decision gets the conflict sheet**, as a contested assign does.
  Between raising and deciding, someone may have taken the asset — the approval
  then rolls back whole and the request stays pending, which is a different
  thing from a failure the approver caused.
- **No optimistic update on a decision**, unlike the asset lifecycle. The
  lifecycle mutations can guess because their outcome follows from the input; an
  approval's does not, and an optimistic "Approved" that the server then rolls
  back is a lie on screen.
- **Decisions are online-only** (§12.5) and the screen says so, rather than
  letting someone believe a tap will apply hours later.
- **"Needed by" is relative choices, not a calendar.** The question is *how
  soon*; a date picker to express "next week" is three taps and a mental date
  calculation for something the app can work out — and it keeps a native
  date-picker dependency out of the build.
- Requesting is reachable from an asset's own screen too, prefilled — a
  non-manager looking at a thing they want is the natural moment. Managers get
  no Request button, because they can simply assign it.
- `trasset://requests/:id` is registered now rather than on Day 46: the server
  already emits it (`DEEP_LINK_TARGETS`), and an unregistered path silently
  lands on the tab instead of the record.

**Two lying schemas, found and fixed.** Both were silent under
`--fail-on-warn`, which is what makes this class of bug expensive:

1. **`AssetRequest.status` was generated as `AssetStatusEnum`** — a mobile
   client reading a request's status was typed against
   `available`/`assigned`/… instead of `pending`/`approved`/`rejected`/
   `cancelled`. Cause: `ENUM_NAME_OVERRIDES` named only *some* choice sets, and
   an unlisted set colliding on field name (`status`) resolves to a listed one
   rather than getting its own name. Every choice set reachable from a
   serializer now has an entry. Audited the rest: 26 enum-backed properties, one
   flagged (`RetireRequest.status`, narrowed to the three terminal statuses on
   purpose), no other lies.
2. **Every create/update response was documented as the *write* shape.** Six
   write serializers return their read counterpart from `to_representation`, so
   `POST /asset-requests/` hands back the whole record — status, requester,
   `target_label` and all — but the schema said it returned only the fields
   submitted. drf-spectacular cannot see through `to_representation`.
   `common/schema.write_responses` now states the real response once per
   viewset; applied to assets, requests, maintenance, purchase orders and users.
   (`ProfileUpdateSerializer` was already correct at its call site.)

This is the same failure mode as Day 43's `assign` schema: the generated client
is only as honest as the schema, and a schema that lies quietly is worse than
one that fails loudly.

**A third divergence, found by the Day 41 verification and fixed.** Adding the
Request button surfaced that an **auditor was being offered write buttons it can
never use**. `AssetRequestViewSet` declares `write_roles = Roles.ALL`, which
reads as "everyone" — but `HasRolePermission` refuses every unsafe method for a
read-only role *before* it consults what the view declares. Reading
`write_roles` alone and concluding an auditor may post is exactly the wrong
inference, and it was already live: since Day 41 an auditor saw **"Report an
issue"**, which the server would have refused with 403.

`availableActions` now returns **nothing at all** for a read-only role, rather
than a shorter list. Role logic moved to `src/auth/roles.ts`, mirroring
`common/roles.py`, because the rules that matter are *combinations* of roles and
they had started being spelled out per feature — `assets/actions.ts` knew about
managers, `requests/actions.ts` about approvers, and neither knew about the
read-only guard that overrides both. `verify-detail` now asserts the empty list
*and* that the server refuses both writes, so the emptiness is agreement rather
than a guess.

**Verified:** `npm run verify:requests` — 40 checks, all passing, including the
DoD end to end (employee raises → manager approves → asset is assigned to the
requester), both schema fixes, the role scoping, the 403/409 boundaries, the
idempotent replay, and the validation messages the forms mirror.

Every earlier script re-run green, so none of the above regressed an earlier day:
`verify:api` 18 · `verify:scan` 18 · `verify:detail` 22 · `verify:list` 15 ·
`verify:lifecycle` 16 · `verify:photos` 11 · `verify:requests` 40. Backend suite
**719 passing**; `npm run tsc` clean.

> `verify:photos` needs a real JPEG: `PROBE_JPEG=/path/to/photo.jpg npm run
> verify:photos`. It exits 1 with a one-line message otherwise, which reads like
> a failure in a batch run — it is not.

**Not done:** substituting a different asset on a *specific-asset* request. The
API supports it; it is a judgement call made while comparing inventory, which is
desk work (§12.8).

### Day 44 — Photos & issue reporting ✅

- **Every photo is resized before it leaves the phone.** A modern camera makes
  a 12 MP JPEG of 4–8 MB; sending that from a stock room is slow enough to look
  broken, expensive for whoever pays for the connection, and pointless — the
  picture exists to show a scratch on a lid, and 1600px does that as well as
  4032px. It would also start bouncing off the API's own 10 MB ceiling (SEC-8).
  Measured in the verification: 32 KB against a 10 MB limit.
- **EXIF is stripped on capture.** There is no reason to ship GPS coordinates
  of where an asset was photographed to the server, and MNFR-8 is explicit
  about what may sit at rest.
- **A failed resize falls back to the original** rather than throwing — a photo
  that is too big is better than no photo, and the server's limit is the
  backstop.
- Capture is offered to managers only, matching the API (`write_roles =
  MANAGERS` on attachments); everyone can *see* the photos, because a picture
  of the damage is exactly what the person holding the asset wants to check
  against.

**A gap between the SRS and the implementation, closed.** SRS §2.3 gives the
Employee role "reports issues" and FR-14.14 requires it from the phone — but
`MaintenanceViewSet` was `write_roles = MANAGERS`, so the button Day 41 showed
every role would have been refused for most of them. That is exactly the
client/server drift the Day 41 verification was built to catch, and it was
caught here rather than by a user.

Creating a maintenance record is now open to any role, then narrowed in
`perform_create`:

- a non-manager may only report on **an asset they are currently holding** —
  otherwise "report an issue" quietly becomes "book work on anything";
- `start_now` is forced off, because taking an asset out of service is a
  scheduling decision, not part of noticing a fault;
- technician, vendor and cost estimate are **dropped rather than rejected** for
  a reporter — the reporter did not put them there, a crafted request did;
- everything after the report — start, complete, cancel — stays with managers.

Auditors are still excluded: the read-only guard in `HasRolePermission` applies
to every unsafe method regardless of what a view declares. 9 backend tests
cover it; the suite is now **719**.

**Verified:** `npm run verify:photos` — 11 checks, all passing, including the
DoD end to end: a multipart upload lands and then appears on the asset record
the web app reads. Plus `npm run verify:lifecycle` and the rest still green.

**One thing to know if the app misbehaves after a dependency is added:** Metro
caches its module map, so a newly installed package can fail to resolve until
the bundler is restarted with `--clear`. That happened here with
`expo-image-picker` and cost ten minutes chasing a "missing" file that was on
disk the whole time.

### Day 43 — Assign & check in ✅
The buttons from Day 41 now act.

- **A 409 is not an error the user caused.** Someone else issued the asset
  while they were choosing a holder; they did nothing wrong, the world moved.
  So it gets its own path — a sheet headed "Someone got there first", coloured
  **Cream Yolk rather than Coral**, showing the server's own sentence (which
  already names who has it and what to do), and whose only way out refreshes.
  Dismissing back onto a form for an asset somebody else now holds would be
  worse than the error.
- **One idempotency key per submission** (BE-4), generated when the form opens
  and reused for every retry of that attempt. Regenerating per retry would
  defeat the mechanism entirely — the server would see two different actions.
  Proven: replaying an assign returns the same answer and produces one history
  row, not two.
- **Rollback restores the exact previous value, not a refetch.** A refetch on
  failure is another request that can also fail, leaving the UI showing a state
  that never existed.
- Check-in leads with **condition notes**, because nobody will ever be closer
  to that fact than the person holding the thing right now, and offers an
  optional return location since equipment routinely comes back to a different
  room.

**Two real bugs this caught, both in code from earlier days.**

**1. The OpenAPI schema was lying about nullability.** `assigned_to`,
`location`, `department`, `vendor` and `created_by` are all `null=True` on the
model but were declared as plain nested serializers, so the generated schema
claimed they are always present — and the mobile client, generated from that
schema (SRS §12.2), inherited the lie. `asset.assigned_to.full_name` type-checks
and then explodes on the first unassigned asset. Fixed with `allow_null=True`
on the read-only nested fields, which changes nothing at runtime and everything
about the contract. Types regenerated; 710 backend tests still pass, schema
still 0 warnings.

**2. The Day 41 history timeline read fields that do not exist.** Assignment
history is an append-only list of *events* (`action`, `user`, `assigned_by`,
`created_at`, `days_held`), not date-range records — but the timeline rendered
`assigned_at` / `returned_at`, so every row would have shown "—" and "still
held". Day 41's verification only asserted that history *returned a list*,
which is why it passed. It now asserts the field shape.

**Verified:** `npm run verify:lifecycle` — 16 checks, all passing: the exact
requests the mutations issue, the idempotent replay, the 409's wording, and
that a 403 is deliberately *not* routed to the conflict sheet, because "you may
not" and "somebody beat you to it" need different words.

### Day 42 — My assets & register search ✅
- **Two modes, one screen.** "My assets" and "Register" are versions of the
  same question — *what am I holding* and *where is that thing* — and people
  switch between them constantly, so a segmented control beats two tabs.
- **The filter set is deliberately narrower than the web's** (FR-14.15). The
  web offers status, category, location, warranty state, value band and date
  ranges; this has search, status and location. Those are the two facts that
  matter standing in a room. Category and warranty are *reporting* filters, and
  a phone is not where reports get built (§12.8).
- **Rows carry three facts, not seven columns.** A seven-column table is
  unreadable at 375px. And when an asset is assigned the row leads with *who
  holds it* rather than its location — if somebody has it, the location is
  where the register thinks it is, not where it is.
- Infinite scroll rather than a pagination footer, fetching at 40% from the
  bottom so a fast scroller does not meet a spinner; pull-to-refresh throughout.
- **Three distinct empty states** — nothing held, nothing matched, or the
  request failed — reusing the tones from Day 39. Offline says so and points at
  the cache rather than reading as an error.

**Verified:** `npm run verify:list` — 15 checks against the live API, all
passing. It issues the *exact* URLs the screen builds (repeated `?status=`
included, since that cannot be expressed as a plain object) and proves what the
list assumes: pages that do not overlap, `total_pages` that stops the infinite
scroll, filters that genuinely narrow, and both halves of the DoD — finding an
asset by tag, name and serial, and `assigned_to` returning only that person's
assets.

### Day 41 — Asset detail ✅ — *Phase 6 complete*
What you need while standing in front of the thing.

- **Not a port of the web's tabs.** The web has room for Overview, History,
  Specifications and Depreciation side by side; a phone does not, and hiding
  history behind a tab costs a tap in exactly the moment somebody is asking
  "who had this last?". One scroll, ordered by what a person at a shelf needs
  first: what it is, who has it, then the detail. Depreciation is deliberately
  absent — a valuation schedule is a desk task (§12.8) and the current value is
  already on screen.
- **Actions are surfaced by state and role**, mirroring
  `frontend/js/asset-detail.js` exactly: assign only from Available, check in
  only from Assigned, retire only while not terminal, nothing at all for a role
  that cannot write. Deliberately narrower than the web — no Edit, no Delete
  (§12.8). Retire is flagged `onlineOnly`, since §12.5 excludes it from the
  offline queue.
- **Reporting an issue is available to everyone, not just managers.** An
  employee holding a broken laptop is who notices first, and making that
  manager-only means it never gets reported (FR-14.14).
- **A state with no action explains itself.** "Under maintenance" is not a
  failure and should not read like one, so the screen says why the asset cannot
  be assigned rather than just omitting the button.
- **Assignment history is a timeline**, with the current holder open-ended
  rather than shown with a fabricated end date.
- **The deep-link id is normalised.** `trasset://assets/12` supplies `id` as a
  *string* from the URL while a scan supplies a number — without `Number()` the
  same asset caches twice under `"12"` and `12`.

**Verified:** `npm run verify:detail` — 19 checks, all passing. The valuable
ones are in part 2: rather than testing the action rules against my own idea of
the server, it asks the client what it would show and the *server* what it
would allow, for each role, and fails on disagreement. A manager is offered
assign and the server permits it; an employee is not offered it and the server
returns 403. That is the property that matters — a hidden button is a courtesy,
and the two must not drift.

**Outstanding:** the buttons appear but do not act yet — assign and check in are
Day 43 (they need the user picker and the conflict flow), report-an-issue is
Day 44. Tapping one says so rather than failing silently. And the DoD's "on a
real device" is still yours to confirm.

### Day 40 — Scanning ✅
The reason the app exists (SRS §12.1).

- **Both label kinds, one pipeline.** `parseScan` recognises the printed QR
  (which encodes a *detail URL*, `…/asset-detail.html?tag=TRA-…`), a bare tag
  someone wrote on a replacement sticker, and — falling through — a
  manufacturer barcode, which is tried as a serial (FR-14.6, FR-14.7). Nothing
  is rejected before the server has looked.
- **One request on the happy path.** `GET /assets/by-tag/` (BE-6) exists for
  exactly this and returns the detail shape, so a scan needs no follow-up call.
  Measured at **38 ms** against MNFR-2's 2-second budget.
- **The serial fallback is deliberately strict.** It searches, then requires an
  *exact* serial match client-side. A search for `SN-4471` will happily return
  three assets whose serials merely contain it, and opening the wrong asset is
  worse than saying "not recognised". Proven: a partial serial resolves to
  nothing rather than to something plausible.
- **Haptics fire before the lookup, not after.** The user is holding the phone
  at a shelf looking at the *asset*, not the screen (§12.6). The buzz confirms
  the scan registered; whether it resolves is a separate signal (success vs
  warning notification).
- **Scanning is locked while one resolves**, via a ref rather than state. A
  camera fires the same code many times a second and React re-renders too
  slowly to gate it — without the lock one label launches a dozen requests and
  pushes a dozen screens.
- **The permission flow distinguishes "not asked yet" from "already refused".**
  They look identical in the API but need opposite actions: one shows the OS
  dialog, the other must send the user to Settings, because the OS will never
  show that dialog again. A button that silently does nothing is the failure
  being avoided.
- **Every failure is a state with a way out** — unknown tag, unrecognised
  barcode, ambiguous serial and offline all say something different, and each
  offers "Scan again" and "Enter by hand". A scanner that quietly ignores a
  label leaves the user unable to tell whether it even saw it.
- **The camera unmounts when the tab loses focus.** Left running it drains the
  battery and, on some Android devices, holds the sensor so other apps cannot
  use it.
- Manual entry (FR-14.8) goes through the *same* resolver, so there is one set
  of answers rather than two implementations that drift.

**Verified:** `npm run verify:scan` — 18 checks against the live API, all
passing: every parse case, the QR round trip, exact-vs-partial serial matching,
junk and unrelated barcodes reported as not-found rather than errors, and a
soft-deleted asset refusing to resolve.

**Needs the handset, honestly outstanding:** the camera itself, the haptics,
and the permission dialogs. Everything downstream of the camera is proven; the
camera is not.

### Day 39 — Design system ✅
Brand-consistent primitives, before screens start improvising.

`Button · Card · StatusPill · Avatar · TextField · EmptyState · OfflineBanner ·
Skeleton · Toast`, all exported from `@/components`, plus a gallery screen
rendering every one in **light and dark on the same screen** (the day's DoD).
The gallery works by nesting `ThemeProvider` with a forced scheme — the same
mechanism the in-app theme override will use on Day 47, so it was worth
building into the provider now rather than reworking it then.

**A real accessibility bug the gallery caught immediately.** `StatusPill` first
put the status colour as *text* on a 13% tint of itself. Measured: **1.45:1 for
Under maintenance** on light, against the 4.5:1 NFR-9 requires — roughly
white-on-white. Available was 2.25:1. Only *Assigned* passed, and only because
Ink is dark to begin with.

The failure is structural rather than a bad colour pick: a tint of a colour is
by definition close to that colour, so every light or warm hue fails the same
way. Fixed by moving the colour off the text — the tint and dot carry it as
decoration, the label uses the normal text colour. **Worst case across both
themes and both surfaces went from 1.45:1 to 8.59:1.** Written up as a worked
example in `Trasset_Design_Tokens.md` §5, because the mistake is an easy one to
repeat.

Decisions worth keeping:

- **Card elevation is carried by value, not shadow.** The web separates a card
  from the page with a soft shadow; that cue is much weaker on a dark surface,
  so there are three surface values and the shadow is a light-mode extra.
- **Toasts sit at the bottom**, not top-right as on the web — within thumb
  reach, and above the tab bar rather than over it. **Errors do not
  auto-dismiss**: a success can be missed harmlessly, but a failure the user
  never saw is how work gets silently lost (FR-14.27).
- **Skeletons honour reduce-motion.** A pulsing screen is genuinely unpleasant
  for some people, and the skeleton communicates fine without the animation.
- **`EmptyState` has three tones**, because "empty" is three conditions —
  nothing yet, nothing matched, or the request failed — and they need different
  words. A "Clear filters" button on a screen that failed to load is worse than
  useless.
- **`OfflineBanner` distinguishes offline from offline-with-queued-work.** The
  second is the one that matters: someone who checked an asset in with no
  signal must see that it has not happened yet.
- **`Avatar` falls back to initials, not a silhouette** — a list of identical
  grey figures tells the reader nothing.

`OfflineBanner` is presentational for now; real connectivity detection lands
with Day 48 and the queue count with Day 49.

### Day 38 — Mobile authentication ✅
Sign in, stay in, sign out cleanly.

- **Four session states, not two.** `starting · signedOut · locked · signedIn`.
  The one a web app has no equivalent of is `locked`: a phone gets picked up by
  other people, and the alternative — signing out whenever the app is
  backgrounded — would make the offline queue worthless.
- **The splash is held until fonts *and* the session resolve.** Without it the
  app shows a frame of the sign-in screen before the restored session lands,
  which reads to the user as having been signed out.
- **Biometrics are a lock on the door, not the key.** What authenticates
  against the API is the refresh token in the Keychain; a fingerprint only
  decides whether the app will use it right now. So **the password fallback
  always works** (FR-14.4), the escape hatch is shown rather than hidden behind
  a failure count, and a cancel stops the prompt rather than re-asking — an app
  that re-prompts on cancel is an app people uninstall.
- **Enabling biometric unlock is confirmed with the biometric itself.** Turning
  on a lock the user then cannot open is the worst available outcome, so the
  toggle proves it works before it is stored.
- **Two ways the gate self-clears rather than stranding anyone:** if enrolment
  was removed since opting in, the unlock screen detects it and offers the
  password route; and signing out clears the flag, so the next person does not
  meet an unlock screen with no session behind it.
- **Session expiry drops the tokens and nothing else.** Anything queued offline
  survives to be replayed after signing back in (Day 49) — a token expiring is
  the worst possible moment to also lose a user's queued work.
- **Auth and app are exclusive navigator branches**, not a modal over the tabs,
  so signing out unmounts the whole app tree rather than leaving screens alive
  behind a login sheet holding the previous user's data.
- Minimal `Button` and `TextField` primitives were needed for the form; Day 39
  should fold them into the design system rather than duplicate them.

**Verified:** `npm run verify:api` still 18/18, including the session-restore
path that *is* the force-quit case — access token gone, refresh token traded in
for a new one — and sign-out leaving nothing behind. Type-check clean, bundle
builds at 6.79 MB.

**Not verifiable off-device, and honestly outstanding:** the literal DoD
("sign in, force-quit, reopen — still signed in") and the biometric prompt
itself both need a real handset. The logic underneath each is covered, but
neither has been driven on hardware yet.

**Splash artwork and app icon added** (pulled forward from Day 58, since the
splash-holding logic was meaningless without something to show). Generated from
`frontend/assets/favicon.svg` and `logo.svg` so the app icon is *the same mark*
as the website's rather than a lookalike, and set in real Quicksand Bold from
the font package the app already bundles. Two details worth keeping:
the Android adaptive foreground is drawn at 34% so a round-icon launcher
mask cannot clip it; and the splash wordmark is **white + green, not the web's
ink + green**, because Ink on an Ink background is invisible — the same reason
Ink stops being text in the dark theme.

### Day 37 — Mobile API client ✅
Typed access to the API, generated rather than hand-written.

- **6,619 lines of types generated from `/api/schema/`** covering all 74
  endpoints, by `npm run gen:api`. This is the return on keeping the schema at
  0 warnings since Day 2 — the client cannot drift from the API, because it is
  not written by hand. `src/api/types.ts` gives friendly aliases (`Asset`,
  `User`) so a server-side rename surfaces as one compile error rather than
  thirty.
- **The request layer mirrors `frontend/js/api.js`**, which had already solved
  envelope unwrapping, single-flight refresh and error normalisation. Three
  things differ because this is a phone:
  - **Every request has a timeout.** `fetch` has none, and on bad signal a call
    hangs indefinitely — the never-resolving spinner §12.6 calls the signature
    failure of a mobile app. A hang now surfaces as a network error the UI can
    show an offline state for.
  - **`X-Client: mobile` on every request**, which is what earns the 30-day
    refresh rather than the web's 7 (BE-1).
  - **`Idempotency-Key` is supported but never auto-generated** (BE-4). A fresh
    key per attempt would defeat the mechanism entirely, so it has to come from
    whoever owns the retry — the durable queue on Day 49.
- **Refresh tokens go to the Keychain / Keystore, never AsyncStorage**
  (FR-14.2). The web client accepts localStorage as a documented trade-off
  because a browser has nothing better; a phone does, so that trade-off is not
  inherited.
- **The API layer holds no platform imports.** The base URL and the secure
  store are injected once in `App.tsx`. That is not architecture for its own
  sake — it is what let the client be run against the real server without a
  device, which is how the day's DoD was actually verified.
- **Offline is not an expired session.** A refresh that fails on the network
  keeps the token and returns false; only a refusal from the server signs the
  user out. Otherwise a tunnel ride would log everybody off.
- **Mutations are never retried automatically** in TanStack Query — a blind
  retry can apply an action twice. Queries retry only network errors and 5xx;
  retrying a 4xx just repeats an answer the server already gave, and retrying a
  409 would hide a conflict the user needs to resolve (§12.5).

**Verified against the live server, not by type-check alone.**
`npm run verify:api` runs the real client against the real API — 18 checks, all
passing: unwrapped data from typed calls, field-level errors preserved, session
restore and sign-out, and both halves of the DoD. The single-flight proof is
worth naming: four parallel calls are made with a deliberately broken access
token, and because refresh rotation is on (SEC-2), a second concurrent refresh
would have presented an already-blacklisted token and failed. Surviving that
*is* the proof.

### Day 36 — Mobile project setup ✅
`mobile/` exists and runs in Expo Go with the tab shell, both themes and both
brand fonts.

- **Expo SDK 54**, React Native 0.81.5, React 19.1.0, TypeScript strict.
  Pinned to match the user's milkkart app, which is a known-good configuration
  on this machine, rather than taking the newest template — SDK 57 was what
  `create-expo-app` produced and was deliberately discarded.
- **React Navigation, not expo-router.** SRS §12.2 names React Navigation;
  Day 36 of the build plan says expo-router. The SRS is the contract, so the
  plan line is the error. Recorded here so nobody "fixes" it later.
- **Bottom tabs per §12.6** — Scan · Assets · Requests · Notifications ·
  Profile, Scan centred and oversized as the primary action.
- **Asset detail is routed at the root, not inside a tab.** It is reached from
  a scan, a search result, an approval and a push deep link; nesting it in one
  tab would mean either four copies or deep links landing in the wrong tab.
  `trasset://` linking is wired for the same reason (FR-14.23).
- **Both themes from the first screen**, following the OS setting.
  `src/theme/tokens.ts` carries light and dark; `docs/Trasset_Design_Tokens.md`
  documents every value with its measured contrast.
- **Fonts are bundled, not fetched** — `@expo-google-fonts` for Quicksand and
  Lexend, held until loaded so the first frame is not system font that reflows.
- **The API URL is derived from the packager host**, because a phone cannot
  reach `127.0.0.1` — that address is the phone itself. The commonest first-day
  mobile failure, avoided by construction rather than documentation.
- `@/` path alias through babel-module-resolver and tsconfig paths.

**Verified:** `tsc --noEmit` clean, and the Android bundle actually builds
(5.7 MB dev bundle, HTTP 200 from Metro) — the type check alone would not have
caught a bad Babel alias.

**Not yet done from Day 36's task list:** ESLint and Prettier configuration,
and EAS build profiles. EAS needs an Expo account, which the user has not
supplied yet; Expo Go needs none, so Days 37–39 are not blocked.

### Day 35 — Stock take API ✅ — *Phase 5 complete*
BE-7, and the feature SRS §12.3 calls the one that most justifies a native app.
A session opens, takes a batch of scans, and submits a reconciliation of found,
missing and unexpected — the day's DoD, asserted in one test and walked against
the live server.

- **Its own app, `apps/stocktake/`**, following how maintenance and procurement
  are organised: a distinct workflow with its own rules and vocabulary rather
  than more weight on `assets`. An extension to the §10.2 layout, consistent
  with the pattern already there.
- **The report is written down, never recomputed.** A stock take is a
  point-in-time claim about what was physically present. If "missing" were
  derived live from current asset locations, then somebody moving an asset next
  week would silently rewrite last week's count — and a report that changes
  after the fact is worse than no report. Missing entries are materialised at
  submit, and `expected_location` is snapshotted so the row keeps saying where
  the asset was *supposed* to be even after the finding is acted on. Tested by
  moving an asset after submit and asserting the report does not move.
- **Submit is idempotent in its own right**, not only through BE-4. An offline
  client replays it, and the reply is exactly what a flaky link loses. A second
  submit returns the existing reconciliation rather than writing a second set
  of missing entries. The idempotency-key path covers the scan endpoint too,
  and there is a test for that.
- **A batch answers per scan, never whole.** One stray label from another
  system must not reject an afternoon's counting, so an unknown tag is reported
  against that scan and the rest are recorded — the Day 17 import report
  pattern. Duplicates are absorbed as duplicates: scanning the same shelf twice
  is ordinary behaviour, and the first scan's time stands.
- **Scan times come from the client.** An offline session is submitted hours
  later, and the server clock would claim the whole count happened in one
  second (FR-14.21).
- **Two open sessions for one location are refused** — two people counting one
  store room produce two contradictory reports and no way to tell which is
  right. Cancelling frees the location again.
- **Terminal assets are not expected.** Nobody should be sent looking for
  something that was disposed of; the live check bore this out, a 12-asset
  location expecting 10.
- **The status is not directly writable** (no PUT/PATCH route): a session
  becomes *submitted* by reconciling, not by assertion — the same reasoning
  that keeps `Asset.status` out of the asset serializer.
- **Read is narrower than usual**: managers and auditors only. Reconciling the
  register against reality is exactly the evidence an auditor wants, and the
  read-only guard still stops them writing. Tested in both directions.
- `tests/test_stocktake.py` — 39 tests; the app is at 100% coverage bar nothing.

**Phase 5 is complete.** Every item in SRS §12.4 exists: BE-1 client-aware
sessions, BE-2 device registry, BE-3 push, BE-4 idempotency, BE-5 delta sync,
BE-6 tag lookup, BE-7 stock take, BE-8 per-device throttle.

### Day 34 — Push dispatch ✅
BE-3. An assignment now produces an in-app record, an email **and** a push to
every registered device — one test asserts exactly that, being the day's DoD.

- **Extended the existing dispatch point, not a parallel path.** Push is queued
  inside `notify()` next to email, so it inherits every rule already proved
  there: nobody is notified about their own action, and a rolled-back action
  pushes nothing (`transaction.on_commit`).
- **A pluggable backend, the way Django does email.** `PUSH_BACKEND` names the
  class; console for development, in-memory for tests, Expo for production
  (SRS §12.2 — Expo fronts APNs and FCM so the server handles neither).
  Calling the provider inline would have made the whole notification path
  untestable without a network and pinned the app to one vendor.
- **One Celery task per device, not per notification.** A single task looping
  over devices would, on retry after a partial failure, re-send to the handsets
  that already got it — and one dead device would hold up the rest. Separate
  tasks retry and back off independently.
- **A dead token is pruned, not retried.** Expo reports `DeviceNotRegistered`
  when the app has been uninstalled or the token rotated; no amount of backoff
  fixes that, so the row is deleted. Every other error raises so the task
  retries.
- **Deep links (FR-14.23).** `link` could not serve for this — it holds a web
  path like `asset-detail.html?id=12`, meaningless to a native app. The target
  is derived from the related object instead: `trasset://assets/12`. An
  unmapped or missing target falls back to the notification list rather than
  producing a link that goes nowhere.
- **Push goes out for every type, unlike email.** The reasoning differs: an
  email per check-in would train people to ignore Trasset's mail, but a push is
  the whole reason the app is on the phone, and the OS offers its own mute.
- **`queue_push` cannot raise.** It runs from `on_commit`, which fires while
  the action that caused it is still completing, so anything escaping would
  fail the check-out it was only meant to report on. Tested by making the
  backend explode and asserting the assign still returns 200 with the asset
  moved.
- `tests/test_push.py` — 33 tests.

**Deviation from the day's task list, flagged deliberately.** The plan said
"respect the existing per-user notification preference", which would have meant
reusing `email_notifications`. Added a separate `push_notifications` field
instead: they are different consents wanted in different places — email at a
desk, push in a stock room — and one flag would mean somebody who muted email
digests silently stopped receiving the alerts the mobile app exists to deliver.
Both directions are tested. Say the word if you would rather they were one
switch.

**Not verified against the real Expo service.** The console backend was
exercised end to end on the live server (an assignment produced the in-app
record and a logged push carrying `trasset://assets/48`), and the ticket parser
is unit-tested against Expo's documented success, `DeviceNotRegistered` and
rate-limit replies. But `ExpoPushBackend.send` itself has never made a real
call — that needs an Expo account and a physical device, which arrives with
Phase 6.

### Day 33 — Delta sync, tag lookup & per-device throttle ✅

**BE-5 — `?updated_since=` on the asset, request, maintenance and notification
lists.** One `DeltaSyncMixin` in `common/sync.py` rather than four
implementations. Three details decide whether this works in practice:

- **Deleted rows are included while syncing.** A client that only hears about
  live rows never learns anything went away, so a disposed asset would sit on
  the phone for ever. The delta widens to `all_objects` and returns the row
  with `is_deleted: true` for the client to drop.
- **Only on `list`.** Honouring the parameter on a detail route would let a
  crafted query string reach a soft-deleted record — exactly what the Day 28
  bypass tests assert is impossible. There is a test that the detail route
  still 404s with the parameter attached.
- **Ordered oldest-change-first, and inclusive.** The client checkpoints on the
  `updated_at` of the last row it saw, so the order has to be the one the
  checkpoint comes from; `pk` breaks ties, since a bulk update can hand
  hundreds of rows the same timestamp. The comparison is `>=` rather than `>`:
  that repeats the boundary row, which a client applying changes by id absorbs
  harmlessly, where `>` would silently drop a change written in the same
  microsecond as the checkpoint. Losing a row is worse than repeating one.

Accepts an ISO-8601 timestamp or a plain date; nonsense gets a 400 naming the
formats. Two serializer fields were added to make it usable at all:
`is_deleted` on the asset list and `updated_at` on notifications — without the
latter a client has nothing to checkpoint on.

**BE-6 — `GET /assets/by-tag/{tag}/`.** Exact, single-result, case-insensitive
(a tag can arrive from a barcode reader, a hand-typed box, or a URL something
has lowercased). Returns the detail shape, because scanning is how the app
opens an asset. A soft-deleted asset still 404s.

**BE-8 — per-device throttling.** `DeviceScopedRateThrottle` buckets the
existing scopes per device, so a phone draining its offline queue cannot lock
the same person out of the browser session they are sitting in front of.

- **The device is identified by the access token's `jti`, not by a header.**
  Each device holds its own token chain, so nothing is client-supplied and
  there is nothing to forge. A header would have let any caller mint itself
  unlimited budget by varying a value it controls.
- **Anonymous callers are never split.** This is the security-relevant half:
  `/auth/login/` is exactly where an unauthenticated request is throttled, and
  keying that on anything the caller sends would hand an attacker unlimited
  sign-in attempts. There is a test that varying the client header across
  failed logins still trips the limit.
- The trade-off is that a token rotation resets that device's counter. Refresh
  is itself throttled under `auth`, so gaming it costs auth budget.
- Test settings now name the **same throttle class production uses** — a test
  exercising a different class from the deployed one proves nothing about the
  deployed one, which is the Day 12 lesson restated.

**Known limitation, deliberate:** only assets soft-delete. A hard-deleted
request, maintenance record or notification cannot propagate through a delta,
because there is no tombstone to send. Notifications are purged on a schedule
anyway and are safe to treat as ephemeral; the other two are rare admin-only
deletions. If that ever matters, it needs a tombstone table, not a patch here.

`tests/test_delta_sync.py` — 28 tests. BE-8 is proved by test rather than by a
live check: tripping a real 120/min limit against the dev server is not a
useful thing to do by hand.

### Day 32 — Idempotency keys ✅
BE-4, which SRS §12.4 calls the single most important backend change for
offline support. `Idempotency-Key: <uuid>` on an unsafe request; the response
is stored against the key and replayed to anyone sending it again.

- **The failure this fixes is not double-execution — it is a lie.** A phone
  draining its offline queue often cannot tell whether a request landed,
  because it is the *response* that went missing. It retries, and the Day 8
  guards answer **409 "already assigned to Karan Verma"**: the check-out
  worked, the user did nothing wrong, and they are shown an error. With a key
  the retry now returns the original 200. Both halves of that contrast are in
  the verified-working list below.
- **A mixin, not middleware.** Keys are scoped per user, and DRF authenticates
  *inside* the view — `request.user` at middleware time is the anonymous
  session user. Day 10 hit exactly this with the audit middleware and worked
  around it by resolving the user lazily; sitting at the DRF layer avoids the
  problem rather than re-solving it. Applied on `BaseModelViewSet`, so every
  write endpoint including the lifecycle actions gets it, and a request with no
  header behaves exactly as before at zero extra queries.
- **The unique constraint on (user, key) is the concurrency control.** Two
  copies of the same queued action racing on reconnect both try to insert and
  the database picks the winner; the loser is told the first is still running.
- **The row is a lease, not just a cache.** A worker dying mid-request would
  otherwise hold the key until the daily purge — which for an offline queue
  means a stuck item the user cannot clear. Past
  `IDEMPOTENCY_LEASE_SECONDS` (60) another attempt takes the key over, via a
  conditional `UPDATE` so that exactly one of several waiters wins.
- **A key reused with a different payload is 409.** The fingerprint covers
  method, path and body, so one key cannot be spent on two different actions.
- **5xx is never cached**; the record is deleted so the client can genuinely
  retry. 4xx is cached, being deterministic.
- Keys expire after 24 hours, purged by `common.tasks.purge_idempotency_keys`
  on the beat schedule at 03:00 — the retention policy the audit trail still
  lacks.
- `common` became an installed app, since the ledger belongs to no single
  domain and a model has to live somewhere. `Idempotency-Key` added to
  `CORS_ALLOW_HEADERS` for the same reason as `X-Client`.
- `tests/test_idempotency.py` — 24 tests.

**A real bug the live check caught, which the tests did not.** The stored
envelope was originally a `JSONField`, and every test passed because
`assertJSONEqual` compares parsed structures. Against the real server the
replayed body came back **the same length but with different key order**:
MySQL's native JSON type normalises object key order, so the retry received the
same data in a different shape from the response it was retrying. Now stored as
`TextField` and returned verbatim, with a test that asserts the bytes are
identical rather than merely equivalent.

### Day 31 — Mobile sessions & device registry ✅
First day of Release 2. Both changes are backend-only and change nothing for
the web client.

- **BE-1 — the refresh lifetime now follows the client.** A phone signing in
  with `X-Client: mobile` gets 30 days; a browser keeps 7. The value is
  configurable (`JWT_MOBILE_REFRESH_DAYS`) and lives in `common/clients.py`.
- **The client is stamped into the token as a claim, not just read off the
  header.** That matters at rotation: SimpleJWT re-derives the expiry on every
  refresh, so a mobile session would have silently dropped back to 7 days the
  first time it refreshed. `ClientAwareRefreshToken.set_exp()` reads the
  lifetime from the token's own claim, which means rotation needs no header at
  all and a proxy stripping `X-Client` cannot demote a phone to a weekly
  logout. Overriding that one method also meant leaving SimpleJWT's rotation
  and blacklisting code untouched.
- **An unrecognised `X-Client` value is treated as web**, so a guessed or
  mistyped header cannot buy the longer session. Only the *refresh* is
  client-aware — the access token stays at 15 minutes for everyone, since a
  long-lived access token widens the window an intercepted one is useful for.
- **BE-2 — `Device` model** (user, platform, push token, name, app version,
  last seen) with `POST /auth/devices/`, `GET /auth/devices/` and
  `DELETE /auth/devices/{id}/`.
- **Registration is an upsert.** An app registers on every launch, so a repeat
  `push_token` updates the row and returns 200 rather than creating a second
  one — two rows for one handset means two pushes for one event. Done through
  `update_or_create`, which survives the unique-constraint race two
  simultaneous launches can provoke.
- **A push token is globally unique, not unique per user**, so a handset that
  changes hands *moves* to the new owner. Leaving it pointed at the previous
  owner would send them notifications about somebody else's assets.
- **Devices deliberately sit outside the role matrix.** `HasRolePermission`
  makes auditors read-only everywhere, which would have stopped an auditor from
  ever registering a phone. Registering a device is not a business write;
  ownership is enforced by scoping the queryset instead, so another user's
  device returns 404 rather than 403 — it does not exist as far as that caller
  is concerned.
- Signing out takes the device with it: `/auth/logout/` accepts an optional
  `push_token`, scoped to the caller, alongside the explicit `DELETE`.
- `x-client` added to `CORS_ALLOW_HEADERS` — a browser will not send a custom
  header that is not on the allow-list, and the preflight just fails.
- `tests/test_mobile_sessions.py` — 27 tests: the two lifetimes differ and
  survive repeated rotation, an unknown client falls back to web, the old token
  is still blacklisted on rotation (SEC-2), a re-registered token updates
  rather than duplicates, a handset moves owner, and every role including
  auditor can register.

**Correction to this file:** the *Next up* list had the BE numbers scrambled
against SRS §12.4 (it credited Day 32 with BE-3 and Day 34 with BE-6, when
idempotency is BE-4 and push is BE-3). The build plan's per-day tasks were
right; only the summary here was wrong. Realigned above.

### Day 1 — Project setup & environment ✅
- Directory tree at `D:\trasset` (`backend/`, `frontend/`, `docs/`).
- Python 3.13 virtualenv at `backend/venv`; dependencies pinned in `requirements.txt`.
- Django project with split settings — `config/settings/{base,dev,prod,test}.py`,
  all secrets read from `.env` via `django-environ` (SEC-10).
- MySQL database `trasset` created (utf8mb4) and connected.
- All eight app packages scaffolded per SRS §10.2 plus `common/` and `tests/`.
- `.gitignore`, `README.md`, `.env.example`.

**Note:** `mysqlclient` has no wheel for Python 3.13 on Windows, so
`config/__init__.py` falls back to PyMySQL via `install_as_MySQLdb()`.
`requirements.txt` still installs `mysqlclient` on Linux for production.

### Day 2 — Common layer & conventions ✅
- `common/renderers.py` — `EnvelopeJSONRenderer` wraps every response in
  `{success, message, data, errors}` (SRS §5.1), deriving the message from the
  view + HTTP method, overridable per response.
- `common/exceptions.py` — envelope error handler plus `Conflict` (409),
  `UnprocessableEntity` (422), `ServiceError`; unhandled errors are logged
  server-side and return a generic body (NFR-8).
- `common/pagination.py` — `StandardPagination` (25 default, 200 max) returning
  `count / page / page_size / total_pages / next / previous / results`.
- `common/permissions.py` + `common/roles.py` — role matrix driven by
  `read_roles` / `write_roles` / `action_roles` on each view (SEC-3).
- `common/models.py` — `TimeStampedModel`, `SoftDeleteModel`.
- `common/validators.py` — upload type/size validation (SEC-8), hex colour validator.
- `common/viewsets.py` — `BaseModelViewSet` / `BaseReadOnlyViewSet` with write throttling.
- `drf-spectacular` at `/api/schema/`, `/api/docs/`, `/api/redoc/`.
- `GET /api/v1/health/` liveness probe.

### Day 3 — Accounts: models & auth ✅
- Custom `User` (email login, one role, department, avatar, timezone,
  notification preference, lockout counters) and `Role`.
- Five roles seeded by data migration `accounts/0003_seed_roles.py`.
- Argon2 password hashing (SEC-1).
- `/auth/login/`, `/auth/refresh/`, `/auth/logout/` (blacklist), `/auth/me/`
  (GET + PATCH), `/auth/password/change/`, `/auth/password/reset/`,
  `/auth/password/reset/confirm/`.
- Login returns the token pair **and** the profile, so the UI paints in one round trip.
- Password reset answers identically for known and unknown emails — no account enumeration.

### Day 4 — RBAC & user management ✅
- `HasRolePermission` enforces the SRS §2.3 matrix server-side; the auditor
  read-only guard applies everywhere regardless of what a view declares.
- `UserViewSet` (Super Admin only); `DELETE` deactivates rather than destroys,
  self-deactivation returns 422.
- `POST /users/{id}/activate/`, `POST /users/{id}/unlock/`.
- `RoleViewSet` — read-only, pagination disabled (returns a bare array).
- Account lockout after 5 failed logins for 15 minutes (FR-1.5).
- Throttle scopes: `auth` on auth endpoints, `write` on all unsafe methods (SEC-7).

### Day 5 — Master data models & APIs ✅
- `Category` (icon, hex colour, `custom_fields` JSON), `Location` (address + geo),
  `Department` (head user, code), `Vendor`.
- CRUD ViewSets with search, filter, ordering and live `asset_count`; departments
  also report `member_count`.
- `custom_fields` validated and normalised on write (FR-3.8).
- Master deletion restricted to Super Admin; protected FKs surface as 409.
- `manage.py bootstrap --demo` seeds users, masters and 42 demo assets.

### Day 6 — Asset model & tag generation ✅
- `Asset` per SRS §4.1 with the composite indexes from §4.3.
- `AssetTagCounter` + `next_asset_tag()` produce `TRA-YYYY-000001` sequentially,
  restarting each year, with `SELECT … FOR UPDATE` against concurrent creates.
- `Attachment` model with type/size validation (FR-3.7).
- State-machine and warranty helper properties.

### Day 7 — Asset CRUD API ✅
- `AssetListSerializer` (flat, cheap) vs `AssetDetailSerializer` (nested
  category / location / department / vendor / assignee / attachments).
- `AssetWriteSerializer` takes `*_id` fields per SRS §5.3 and returns the nested
  detail shape; validates duplicate tag and serial, salvage ≤ cost, warranty ≥
  purchase date, and a category's **required custom fields** (FR-3.8).
- Status is not directly writable — the serializer redirects callers to the
  assign / checkin / retire endpoints so history can't be bypassed.
- `AssetFilter`: multi-select status, category, location, department, vendor,
  assignee, `unassigned`, purchase/created/warranty date ranges, value band, a
  derived `warranty` filter (expiring / expired / active / none) and `active_only`.
- Search across tag, name, serial, model and manufacturer; ordering on 8 columns.
- `GET /assets/stats/` returns the summary cards and respects the active filters.
- `AttachmentViewSet` with type/size validation; deleting drops the stored file.
- A list page costs a flat 4 queries regardless of row count (asserted in tests).

### Day 8 — Assignment (check-out / check-in) ✅
- `AssetAssignment` model — immutable by construction: `save()` refuses updates
  and `delete()` raises, so history can only ever be appended (FR-4.3).
- `services/assignment.py` runs every transition in a transaction and re-reads
  the asset with `SELECT … FOR UPDATE`, so two managers racing on the same asset
  can't both win.
- `POST /assets/{id}/assign/` · `/checkin/` · `/retire/`, all returning the
  updated asset; `GET /assets/{id}/history/` returns the timeline.
- Guards return **409 Conflict** with a sentence that says what to do:
  already assigned, under maintenance, terminal status, not currently assigned,
  already retired, deleting while still assigned.
- Retiring an assigned asset auto-closes the assignment so no dangling holder
  is left behind.
- Check-in records `days_held` and can move the asset to a new location.

### Day 9 — Depreciation engine ✅
- `apps/assets/services/depreciation.py` — straight-line and declining balance
  per SRS §11.1, in `Decimal`, floored at salvage.
- `Asset.current_value` recomputed on save; `GET /assets/{id}/depreciation/`
  returns the year-by-year schedule.
- Verified against hand calculations: ₹78,000 cost / ₹8,000 salvage / 4 years
  gives ₹17,500 a year and lands exactly on salvage.
- **Still pending:** the monthly recalculation Celery task (Day 18).

### Day 28 — Security & performance hardening ✅
- **Dependency audit had never been run.** `pip-audit` found **17 known
  vulnerabilities**: 5 in Django 5.1.6, 1 in simplejwt 5.4.0, and 11 in Pillow
  11.1.0. Upgraded to Django 5.1.15, simplejwt 5.5.1 and Pillow 12.3.0 — audit
  now clean, all tests still passing. `requirements.txt` records that these are
  **security floors, not preferences**.
- `tests/test_security_checklist.py` — 32 tests asserting the SRS §9
  configuration itself, including production settings loaded directly so a
  regression in `prod.py` fails here rather than during a deploy: DEBUG off,
  HSTS, secure cookies, CORS not wildcarded, Argon2 (checked against *base*
  settings, since test settings swap in MD5), token rotation and blacklisting,
  upload allowlist excluding executables, throttling, bounded pagination.
- Bypass attempts, since Day 28 asks explicitly: a soft-deleted asset cannot be
  read, listed, reported or acted on; role escalation via `PATCH /auth/me/` is
  ignored; a scoped queryset cannot be widened by a crafted filter; a
  blacklisted refresh token cannot be reused; and a 500 leaks neither the
  exception message nor a traceback.
- **NFR-1 measured at the specified scale**, not at demo scale. Seeded 10,000
  assets and measured median and p95 over 10 runs per endpoint. Everything
  passed — worst p95 288 ms on the asset list, dashboard 229 ms, register
  report 205 ms. The seed data was removed afterwards.

**A real bug this uncovered:** `Asset.all_objects.filter(...).delete()`
soft-deletes rather than purging *and* returned a bare integer instead of
Django's `(count, {label: count})`. Any caller written the normal way —
`deleted, _ = qs.delete()` — crashes with a confusing unpacking error a long
way from the cause. It bit the cleanup step of the performance script. Fixed to
return Django's shape, documented that delete means soft-delete everywhere
including `all_objects`, and covered by tests.

### Day 27 — End-to-end journeys ✅
- `tests/test_journeys.py` — 27 tests walking whole tasks the way a person
  performs them, rather than endpoints in isolation.
- **Asset manager:** create → issue → breaks → maintenance → returns to the
  same holder → check in → dispose, then asserting the system agrees with
  itself afterwards: history has exactly the right two rows, the audit trail
  carries all four verbs, and the recipient was notified.
- **Employee:** request → approval → the asset actually moves → it appears in
  their own list. Plus: an employee is 403 on six manager-only endpoints, and
  sees zero of another person's requests or notifications.
- **Department head:** approves within their department, sees nothing from
  another one, cannot create assets.
- **Auditor:** reads the whole estate and exports all four reports in both
  formats, yet is 403 on seven distinct write attempts.
- **Super admin:** stands up categories, locations and a user who can then sign
  in; deactivating a holder keeps their assignment history.
- **Procurement:** order → place → receive → three tagged assets exist and one
  can be issued immediately.
- **SRS §11.4 reconciliation**, which had never been tested: the dashboard KPIs
  are computed by entirely separate code from the asset register report. Six
  tests assert they agree — on count, book value, purchase value, the status
  breakdown summing to the total, and after a soft delete moves both numbers
  together. If they disagreed, one of them was lying to somebody making a
  decision.
- Cross-cutting invariants: a failed 409 leaves no history, audit or
  notification behind; an assignment is visible from all five angles; every
  error uses the standard envelope; pagination is uniform across eight lists.

### Day 26 (partial) — Documents tab & accessibility ✅
Everything on Day 26 that does not require a browser.

- **Documents tab on asset detail (FR-3.7).** The attachment API and its
  upload validation had been done since Day 7 with no UI at all. Now: list with
  type icon, size, uploader and age; open in a new tab; delete with the file
  removed from storage as well as the row; drag-and-drop or click-to-choose,
  multi-file, uploaded one at a time so a single rejection does not lose the
  batch; per-file errors reported by name. Write controls hidden for
  non-managers, and the API refuses them independently.
- **Modal focus trap.** Tab and Shift+Tab now cycle inside an open dialog.
  Without it a keyboard user tabbed straight past the last control into the page
  behind — still live, still interactive, invisible behind the backdrop. This
  was the most serious accessibility defect in the app.
- **`aria-sort` on every sortable column.** The arrow told a sighted user which
  column was sorted and which way; a screen-reader user got nothing. Wired
  through all seven tables plus the dynamically-built masters header.
- **Arrow-key navigation between tabs** on asset detail, with `aria-selected`
  kept in step — a tablist should be operable from the keyboard.
- Audited every icon-only control for an accessible name: **all named**.

**Correction:** PROGRESS previously claimed the settings screen was missing the
notification-preference toggle. It was not — the control and the serializer
field both existed. The note was stale, not the code.

### Day 18 — Notifications & scheduled jobs ✅
- `Notification` model with type-driven icon and colour, so the UI has no
  mapping table of its own. The related object is stored as plain type/id
  rather than a generic FK — a notification must outlive the thing it refers
  to, and must never keep a row alive by pointing at it.
- Wired into the events that already existed: asset assigned, asset checked in,
  request submitted (to the right approvers), request approved, request
  rejected, maintenance started, maintenance completed.
- **Nobody is notified about their own action.** A manager assigning to
  themselves does not need telling.
- **Notifying never breaks the action.** Failures are logged and swallowed —
  nobody should fail to issue a laptop because the mail server is down. There
  is a test that patches the notification layer to explode and asserts the
  assignment still succeeds.
- Approvers are resolved by scope: managers hear about every request, a
  department head only about their own department's.
- Email (FR-12.2) goes out for the events that warrant it, not all of them — an
  email per check-in would train people to ignore Trasset's mail. Respects
  `User.email_notifications`, which existed but was never read until now.
- Emails are queued with `transaction.on_commit`, so a rolled-back action
  cannot leave someone holding mail about something that never happened.
  Delivery is idempotent via `emailed_at`, so a retried task cannot double-send.
- Celery tasks, all three named by the existing beat schedule:
  `recalculate_all_depreciation` (monthly, FR-8.4), `scan_expiring_warranties`
  (daily, FR-7.3), `scan_due_maintenance` (daily, FR-6.5), plus a
  `purge_read_notifications` housekeeping task.
- The scans are **safe to run twice** — they check whether the same reminder
  already went out today. Beat firing twice does not spam anyone.
- Depreciation recalculation skips rows whose value has not moved and runs with
  auditing suspended, so a monthly job does not rewrite the whole table or bury
  the audit trail under thousands of machine updates.
- Notifications dropdown wired: unread badge, 60-second poll, mark-one-read on
  click-through, mark-all-read.

**Verified against real Redis**, not just eager mode: worker connected,
all five tasks registered, scans dispatched through the broker, notifications
created, and the resulting email tasks queued and delivered.

### Day 17 — Bulk import ✅
- `POST /assets/import/` takes CSV or XLSX and returns a **per-row report**:
  which rows are ready, which failed, and why, keyed by spreadsheet column and
  numbered to match the actual row in the file (row 2 is the first data row).
- **Validation is not duplicated.** Rows go through `AssetWriteSerializer`, the
  same serializer the API uses, so import rules and API rules cannot drift.
  Salvage-above-cost is rejected on import because it is rejected by the API.
- **Masters are matched by name**, case-insensitively — nobody types database
  ids into a spreadsheet. An unknown name is a row error that says what was not
  found and what to do about it.
- Three safety levels: `dry_run` writes nothing, the default aborts the whole
  file if any row is bad (returning **422** with the report), and `partial=true`
  imports the good rows and reports the rest.
- Tolerates what spreadsheets actually contain: a UTF-8 BOM from Excel,
  `₹1,78,000.00` in a cost column, `15/01/2026` as well as ISO dates, blank
  spacer rows in XLSX, and unknown extra columns (ignored, not fatal).
- Catches duplicates **within the file**, which the serializer cannot see
  because it only checks the database.
- `GET /assets/import/template/` builds its example row from **this
  installation's** master data, preferring a name matching the column's own
  example — so the row you download actually imports, filed under Laptops
  rather than whichever category sorts first.
- `GET /assets/import/columns/` exposes the column reference so the wizard can
  explain itself without hard-coding the schema.
- Import wizard on the assets screen: choose file → read the report → commit.
  The dry run is not optional; nobody should discover what an import does by
  running it.
- `MAX_ROWS` caps a file at 5000.

**Known cost:** a committed row is about ten queries — four foreign-key checks
from the serializer, three for tag generation, the insert, and two for the audit
record. That is the price of reusing the API's validation, and `MAX_ROWS` bounds
the total, but a materially larger import belongs in a Celery job. Pinned by a
test so it cannot quietly get worse.

### Day 16 — Reports & exports ✅
- Four reports — asset register, depreciation, maintenance cost, assignment —
  each a class in `apps/reports/reports.py` declaring its queryset, columns and
  totals. Everything else (filtering, pagination, CSV, XLSX) is shared, so a
  fifth report is a class, not another endpoint.
- All four accept `date_from`, `date_to`, `department`, `location` and
  `category` (FR-11.4). Each report maps those onto its own field paths, so
  filtering maintenance by department reaches through to the asset.
- **The frontend is report-agnostic.** The table is built from the column
  metadata the API returns, so adding a report on the backend makes it appear in
  the UI with no frontend change.
- Exports (FR-10.2): **CSV streams** row by row via `StreamingHttpResponse` —
  nothing larger than one row is ever held. **XLSX** uses openpyxl's
  `write_only` workbook, which flushes to a temp file as rows are appended;
  memory stays flat for a 100k-row register (NFR-5).
- CSV carries a UTF-8 BOM so Excel on Windows doesn't mangle the rupee sign and
  accented names. XLSX gets real dates and numbers with formats, and totals go
  on a **separate Summary sheet** as numbers, so they can be summed and can't be
  mistaken for a data row.
- The `export` throttle scope — configured since Day 2 but never used — is now
  applied to download requests.
- **PDF is deferred to v1.1** by decision. `?export=pdf` returns a 400 naming
  the valid choices rather than silently handing back CSV; there is a test for it.

**Note on the query parameter:** it is `?export=csv`, not `?format=csv`. DRF
reserves `format` for content negotiation and returns **404** when no renderer
matches the value — which is exactly what happened first time, across 19 tests.

### Day 14 — Procurement (purchase orders) ✅
- `PurchaseOrder` + `PurchaseOrderItem` with `PO-2026-000001` numbering. The
  sequence generator in `apps/assets/services/tagging.py` was generalised into
  `next_sequence(prefix, year)` so PO numbers reuse the same locked-counter
  mechanism as asset tags — one implementation, separate sequences per prefix
  (asserted by test).
- **`total_amount` is derived from the line items, never accepted from the
  client** — a caller claiming an order is worth ₹1 is ignored. Tested.
- **Receiving creates one asset per unit (FR-7.2).** Quantity 3 of "Dell
  Latitude 5440" becomes three separate asset records, each with its own tag,
  because they are three physical things that get assigned and maintained
  independently. Assets inherit the order's vendor, location, department and
  unit cost, and the order's `warranty_months` is stamped as an expiry date
  (FR-7.3).
- **Partial receipt is a real state.** Suppliers ship part of an order, so
  `receive` takes per-line quantities and the order sits in *Partially received*
  with the outstanding balance visible. Omitting `lines` receives everything left.
- Lines can be flagged `create_assets=False` for consumables — 20 HDMI cables
  are received without polluting the asset register.
- Guards: can't receive against a draft or a closed order, can't receive more
  than outstanding, can't edit line items once goods have arrived (it would lose
  the received quantities), can't delete an order with receipts against it.
- `.distinct()` on the queryset because search spans line items, which would
  otherwise return an order once per matching line.
- Procurement screen with an inline line-item editor that totals as you type,
  expandable line detail per order, and a receive dialog that says up front how
  many assets it will create.

### Day 13 — Maintenance management ✅
- `MaintenanceRecord` with type, schedule, technician/vendor, cost estimate vs
  actual, and notes (FR-6.1).
- **Scheduling does not take the asset out of service.** An asset booked for
  next Tuesday is still usable today; it only moves to `Under Maintenance` when
  the work actually starts (FR-6.2). A `start_now` flag books and starts in one
  call for same-day work.
- **`asset_status_before` is the field that matters.** Completing restores the
  asset to where it came from, so a laptop that was *Assigned* when it went in
  for a screen repair goes back to its holder rather than into the Available
  pool — which is what a naive "restore to Available" would do (FR-6.3). Two
  edge cases handled: if the holder was cleared while it sat in the workshop it
  falls back to Available, and if something else moved the asset meanwhile the
  completion leaves that alone rather than overwriting it.
- Guards: can't double-book an asset (one open record at a time), can't
  complete work that never started, can't start/complete/cancel a settled
  record — all 409 with a sentence saying what to do.
- Cancelling in-progress work puts the asset straight back into service.
- Filters for status, type, vendor, category, date range, `open_only` and
  `overdue`; stats endpoint reports actual vs estimated spend.
- Maintenance screen with overdue rows marked in Coral, in-progress in Cream
  Yolk, and cost variance shown against the estimate. The complete dialog states
  where the asset will end up, since that is the non-obvious part.
- Everyone can read maintenance — an employee holding a laptop should see it is
  going in on Tuesday — but only managers can book, start, complete or cancel.

### Day 12 — Backend test & hardening pass ✅
Not a paperwork exercise — it found three real problems.

- **N+1 on `/asset-requests/`.** `AssetRequestSerializer` nests a full
  `AssetListSerializer` for both `asset` and `fulfilled_asset`, each reaching
  category, location, department and assignee, but only some were joined.
  Measured 6 queries at 1 row growing to 15 — now flat.
- **The throttle tests were testing nothing.** DRF binds `throttle_classes` and
  `SimpleRateThrottle.THROTTLE_RATES` at *import* time, so `override_settings`
  never reaches views that are already imported. The first version of the test
  file "passed" while no throttling was active at all. Test settings now keep
  the throttle class wired with `None` rates (DRF treats that as unlimited) and
  the tests patch `THROTTLE_RATES` directly. 429 is now genuinely observed on
  the `auth` and `write` scopes, including the asset lifecycle actions.
- **Three dead permission classes removed** — `IsAssetManager`,
  `IsManagerOrReadOnly` and `IsOwnerOrManager` were defined but never used.
  `IsOwnerOrManager` was the risky one: it only implemented
  `has_object_permission`, so used alone it would have left list endpoints
  returning everyone's rows. A comment now records why per-owner access is done
  by narrowing `get_queryset` instead.

Also added:
- `tests/test_performance.py` — every list endpoint asserts its query count does
  **not grow with row count**, which is the invariant that actually regresses.
  Exact-count assertions were deliberately avoided as too brittle.
- `tests/test_validators.py` — upload validation (SEC-8) went from 0 tests to
  27, covering executables, double extensions (`invoice.pdf.exe`), SVG,
  content-type mismatch, and the size ceiling at and over the limit.
  `common/validators.py` 56% → **100%**.
- `tests/test_permission_internals.py` — anonymous and role-less users, the
  per-action override, and the auditor read-only guard holding even when a view
  declares `write_roles = ALL`. `common/permissions.py` 66% → **100%**.
- All SRS §4.3 indexes verified present in the live MySQL schema by reading
  `INFORMATION_SCHEMA`, not just trusting the model `Meta`.

Coverage 83.3% → **85.1%**; 224 → **292 tests**.

### Day 11 — Asset requests & approvals ✅
- `AssetRequest` names **either** a specific asset or a category, so someone can
  ask for "a laptop" without first browsing the register (FR-4.4).
- Approval delegates to the existing `assignment.assign()` **inside the same
  transaction**. If the asset was taken between the request and the decision,
  `assign` raises 409 and the whole approval rolls back — the request stays
  pending rather than being marked approved with nothing handed over. Covered by
  a test.
- Approving a category request requires the approver to choose the asset; they
  can also substitute an equivalent item, recorded as `fulfilled_asset`.
- Guards: a decided request can't be decided again (409); only the requester can
  withdraw one; a reason is required to reject.
- **Visibility is scoped in `get_queryset`, not by a client filter** — employees
  see only their own, department heads see their department's, managers see
  everything. Tested that a crafted `?requester=` can't widen it.
- The requester is taken from the token, never the payload.
- Duplicate pending requests for the same asset are refused.
- `AssetRequest` is deliberately **not** in `TRACKED_MODELS`: every transition is
  a named business event, so Requested / Approved / Rejected / Cancelled are
  recorded explicitly rather than as generic Created-then-Updated pairs.
- Requests screen reads as "My requests" for employees and "Approvals" for
  approvers, with pending rows marked in Cream Yolk.
- Demo users now sit in departments — the head and employee share one, so the
  department-head approval path is actually demonstrable in the seeded data.

### Day 10 — Audit logging ✅
- `AuditLog` per SRS §4.1, append-only by construction: `save()` refuses updates
  and `delete()` raises, and the viewset exposes no write routes (405 on
  POST/PATCH/DELETE). Application-level guarantee — production should also
  restrict DB grants on the table.
- `AuditContextMiddleware` binds the request; the **user is resolved lazily**
  rather than cached, because DRF authenticates inside the view and
  `request.user` at middleware time would be the anonymous session user.
- `pre_save` snapshots the stored row so `post_save` can diff it. One extra
  SELECT per update on tracked models; nothing on create.
- Foreign keys are logged by display name, so a row reads
  `location: Head Office → Store Room` rather than `2 → 4`.
- `domain_action()` context manager gives a save a business verb, so assigning
  writes one **Assigned** row instead of a generic Updated — used by
  `assignment.assign/checkin/retire`.
- Soft deletes are translated into a Deleted row rather than an `is_deleted`
  field change.
- Auth events recorded too (SEC-9): sign-in, **failed sign-in** (no actor, email
  only), sign-out, password change and reset. Passwords are in `EXCLUDED_FIELDS`
  and asserted absent from the trail by test.
- Saves that change nothing write no row.
- `suspend()` context manager keeps seeding and migrations out of the trail;
  `bootstrap` uses it.
- `GET /audit-logs/` (Admin + Auditor only) with filters for action, entity type,
  entity id, user and date range, plus search and `/summary/` counts.
- Audit screen with expandable per-row diffs, action pills coloured from the
  palette, and summary cards.

### Day 9.1 — QR codes ✅ (pulled forward)
- `GET /assets/{id}/qr/` returns a PNG encoding the asset's detail URL
  (FR-9.1), cacheable for a day since tags never change.
- `asset-detail.html?tag=TRA-…` resolves a scanned tag to the asset (FR-9.2).

### Day 15 — Dashboard stats API ✅
- `GET /dashboard/stats/` returns every KPI and chart dataset in one call:
  totals, book value, accumulated depreciation, status counts, warranty windows,
  by-category breakdown, 12-month cumulative value, monthly additions, recent
  assets and expiring warranties.
- Built from database aggregates, not per-row Python (NFR-1).
- Readable by every role — auditors and employees see the same figures.

### Day 19 — Design system & shell ✅
- `css/variables.css` — the full brand palette, type scale, 8px spacing,
  elevation, motion and layout tokens. Nothing else hard-codes a colour.
- `css/base.css` — reset, focus-visible rings, skip link, utilities.
- `css/components.css` — buttons (5 variants), cards, KPI tiles, status pills,
  avatars, forms with inline validation, tables (zebra + sticky header + hover
  actions + sortable), pagination, tabs, modals, toasts, skeletons, empty
  states, dropdowns.
- `css/layout.css` — 240px Ink sidebar with green active state, sticky top bar
  with global search, responsive drawer below 1024px, print styles.
- `js/shell.js` renders the sidebar and top bar on every page from one nav model.
  Screens not built yet appear greyed with a "soon" badge rather than 404-ing.
- Quicksand + Lexend from Google Fonts; jQuery and Chart.js vendored locally so
  the app works offline.

### Day 20 — API client & auth flow ✅
- `js/api.js` — attaches the JWT, unwraps the envelope, refreshes on 401 with a
  single-flight promise so parallel 401s trigger one refresh, and normalises
  errors into `ApiError` with field-level detail.
- Access token in memory only; refresh token in `localStorage` so a reload keeps
  the session. Trade-off documented in the file.
- `js/auth.js` — route guard, session helpers (`isManager`, `isAdmin`,
  `canWrite`), logout, and redirect-if-already-signed-in.
- `index.html` — split-panel login with brand aside, inline validation,
  show/hide password, session-expiry notice, and click-to-fill demo accounts.

### Day 21 — Dashboard UI ✅
- Six KPI tiles in Quicksand numerals, each colour-coded to the palette.
- Four Chart.js charts: cumulative value line with gradient fill, status
  doughnut, category bar, monthly additions bar — all reading their colours from
  the CSS custom properties.
- Recently-added and warranty-expiring tables; warranties under 7 days flip from
  Cream Yolk to Coral.
- Skeleton loaders on first paint, empty states, and a refresh action.

### Day 25 (partial) — Masters & users UI ✅
- `masters.html` / `js/masters.js` — one tabbed screen covering categories,
  locations, departments and vendors. Table, search, state filter, sorting,
  pagination and a modal form are all driven by a per-entity config, so adding a
  master means adding a config entry, not another screen.
- Colour picker paired with a hex field for categories; user picker for
  department heads.
- `users.html` / `js/users.js` — role summary tiles, user table with avatars and
  relative last-sign-in, create/edit modal, deactivate/reactivate. Non-admins get
  a plain "Super Admin only" panel instead of a bare 403.
- `settings.html` — profile editing and password change, both wired to the API.
- Write controls are hidden for auditors and employees; the API enforces the same
  rules independently (SEC-3).

**Still to do on Day 25:** asset request flow, approvals inbox, and the
notifications dropdown (needs the Day 11 and Day 18 backends).

### Day 22 — Asset list UI ✅
- Six summary cards that re-aggregate as filters change, so the numbers always
  describe what's on screen.
- Table with sortable columns, status pills, category colour dots, assignee
  avatars and warranty pills that turn Cream Yolk near expiry and Slate once past.
- Filters for status, category, location and warranty state, plus debounced
  search and a "Clear filters" button that only appears when something is set.
- Row actions adapt to state: Available offers Assign, Assigned offers Check in.
- Add/Edit modal in `js/asset-form.js`, shared with the detail page.
- **Category-driven custom fields** — changing category swaps the extra inputs
  live and preserves whatever was already typed (FR-3.8).
- Top-bar global search now hands off here via `assets.html?q=…`.

### Day 23 — Asset detail UI ✅
- Header with live status pill and state-aware actions (Assign / Check in /
  Edit / Retire / Delete), each hidden unless the role permits it.
- Overview panel, valuation card with a retained-value progress bar, and an
  assignment card showing the holder and how long they've had it.
- Tabs: **History** as a timeline with check-out/check-in dots, actor, notes and
  days held; **Specifications** rendering custom fields against their category
  labels; **Depreciation** with a Chart.js book-value curve against a dashed
  salvage floor, plus the year-by-year table.
- QR label fetched with the bearer token and inlined as a blob, with a print
  action and print CSS that strips the chrome.

---

## Verified working

**Backend** (live server, real requests)
```
GET  /api/v1/health/                          → 200 enveloped
POST /api/v1/auth/login/                      → 200 tokens + profile
GET  /api/v1/auth/me/                         → 200 profile
GET  /api/v1/dashboard/stats/                 → 200 KPIs + 4 chart datasets
GET  /api/v1/categories/?page=1&page_size=15  → 200 paginated, asset_count annotated
GET  /api/v1/roles/                           → 200 bare array (pagination off)
POST /api/v1/categories/  (manager)           → 201
PATCH/DELETE category                          → 200 / 200
DELETE category with 12 assets                 → 409 (PROTECT honoured)
POST /api/v1/categories/  (auditor/employee)  → 403
GET  /api/v1/users/       (employee → admin)  → 403 / 200
GET  /api/v1/categories/  (no token)          → 401
POST bad colour / bad custom_fields            → 400 with field-level errors
OPTIONS preflight from :5500                   → 200, CORS headers present

GET  /api/v1/assets/?page_size=3               → 200, 42 assets, 14 pages
GET  /api/v1/assets/?status=available&warranty=expiring → 200, filters compose
GET  /api/v1/assets/?search=latitude           → 200, 3 matches
GET  /api/v1/assets/stats/                     → 200, cards match the table
POST /api/v1/assets/  (SRS §5.3 payload)       → 201, tag TRA-2026-000014 generated
POST /assets/{id}/assign/                      → 200 "assigned to Karan Verma"
POST /assets/{id}/assign/  again               → 409 "already assigned to …"
POST /assets/{id}/assign/  as employee         → 403
POST /assets/{id}/checkin/                     → 200
POST /assets/{id}/checkin/  again              → 409 "not currently assigned"
POST /assets/{id}/retire/  {status: disposed}  → 200
POST /assets/{id}/assign/  after disposal      → 409
DELETE assigned asset as admin                 → 409 "still assigned to …"
GET  /assets/{id}/history/                     → 200, 2 immutable rows
GET  /assets/{id}/depreciation/                → 200, ends exactly at salvage
GET  /assets/{id}/qr/                          → 200 image/png, 895 bytes

GET  /api/v1/audit-logs/  (auditor / admin)    → 200
GET  /api/v1/audit-logs/  (manager / employee) → 403 "Only Super Admins and Auditors…"
POST/PATCH/DELETE /audit-logs/                 → 405, no write route exists
GET  /audit-logs/summary/                      → 200 totals + per-action counts
assign → one "Assigned" row, FK diff by name, _context carries notes
failed login → "Sign-in failed" row, no actor, attempted password absent

POST /asset-requests/  (employee)              → 201
POST /asset-requests/  duplicate pending       → 400
POST /asset-requests/  no asset and no category→ 400
POST /asset-requests/  (auditor)               → 403 read-only
POST /asset-requests/{id}/approve/ (employee)  → 403
POST /asset-requests/{id}/approve/ (dept head) → 200, asset assigned
POST approve a category request with no choice → 409 "Choose which asset…"
POST approve/reject an already-decided one     → 409
list scoping: employee 3 · head 3 · manager 3 · auditor 0
audit trail reads: Requested → Approved

POST /auth/login/                              → refresh 7 days,  client=web
POST /auth/login/   X-Client: mobile           → refresh 30 days, client=mobile
POST /auth/refresh/ (mobile token, no header)  → refresh 30 days, client=mobile
POST /auth/login/   X-Client: sneaky           → refresh 7 days,  client=web
POST /auth/devices/                            → 201 "Device registered successfully"
POST /auth/devices/  same push_token           → 200 same id, name and version updated
GET  /auth/devices/                            → 200, 1 row
POST /auth/devices/  platform=blackberry       → 400 "…is not a valid choice."
POST /auth/devices/  no token                  → 401
DELETE /auth/devices/{id}/                     → 200, list empty; repeat → 404

POST /assets/{id}/assign/  Idempotency-Key: K  → 200 "TRA-2026-000019 assigned to Karan Verma"
POST  same request, same key                   → 200 identical bytes, Idempotent-Replay: true
POST  same key, different payload              → 409 "…already been used for a different request"
POST  same request, NO key  (the contrast)     → 409 "…is already assigned to Karan Verma"

GET  /assets/?updated_since=<5 min ahead>      → 0 rows
GET  /assets/?updated_since=<checkpoint>       → 1 row, just the asset created after it
GET  /assets/by-tag/TRA-2026-000020/           → 200, single object (no results array)
GET  /assets/by-tag/tra-2026-000020/           → 200 (case-insensitive)
GET  /assets/by-tag/TRA-2026-999999/           → 404 "No asset carries the tag …"
DELETE the asset, then the same delta          → 1 row, is_deleted: true
    …while the normal list                     → no longer contains it
    …and by-tag                                → 404
GET  /assets/?updated_since=last%20tuesday     → 400 naming the accepted formats

POST /auth/devices/  (employee, mobile)        → 201, push_notifications: true
POST /assets/19/assign/  (manager → employee)  → 200
     in-app notifications                      → 6 → 7
     server log                                → PUSH to ExponentPush… with
                                                 data.deep_link trasset://assets/48
PATCH /auth/me/ {push_notifications: false}    → 200, preference honoured

POST /stock-takes/  {location_id}              → 201, expected 10 of 12 (2 terminal, excluded)
POST /stock-takes/  same location again        → 409 "…already in progress, started by …"
POST /stock-takes/1/scan/  batch of 5          → 200 "3 of 5 scans recorded"
     …one real, one real, repeat, stray, junk  → recorded · recorded · duplicate ·
                                                 recorded(unexpected) · unknown
     live counts                               → found 2, missing 8, unexpected 1
POST /stock-takes/1/submit/                    → 200 "2 found, 8 missing, 1 unexpected"
POST /stock-takes/1/submit/  again             → 200, identical counts (idempotent)
POST /stock-takes/1/scan/   after submit       → 409 "…already submitted"
GET  /stock-takes/1/report/                    → found 2 · missing 8 · unexpected 1
```

**Frontend** — all 21 files serve over HTTP; every JS file and inline block
passes a syntax check. Not yet clicked through in a browser (see below).

---

## Deferred / known gaps

- **Browser click-through not done.** The pages were verified by serving them,
  syntax-checking every script, and exercising the exact API calls each page
  makes — but nobody has driven the real UI yet. Expect small visual fixes on
  first run.
- Audit rows are written but never pruned. A busy register will grow this table
  indefinitely — worth a retention policy (archive or partition by month) before
  production. `purge_read_notifications` shows the shape; audit needs its own,
  and needs deciding rather than defaulting, since an audit trail is usually
  kept for a stated period.
- The audit trail is append-only at the application layer. A DB superuser can
  still edit the table, so production should restrict grants on `audit_logs`.
- The asset form has no image upload control yet; `image` is accepted by the API.
  The Documents tab covers attachments, but the asset's own photo still cannot
  be set from the UI.
- Redis is installed and running locally; Celery worker and beat have been
  verified against it. Dev still defaults to eager execution so the app runs
  without a broker.
- `value_over_time` is built from purchase dates (how the register grew), not a
  historical revaluation. Worth revisiting if finance wants true month-end book values.

---

## Local environment

| Item | Value |
|------|-------|
| Project root | `D:\trasset` |
| Python | 3.13.9 (`backend\venv`) |
| MySQL | 8.0.44 on `127.0.0.1:3306`, database `trasset` |
| Django | 5.1.6 · DRF 3.15.2 |
| API | `http://127.0.0.1:8000/api/v1/` |
| Swagger | `http://127.0.0.1:8000/api/docs/` |
| Admin | `http://127.0.0.1:8000/admin/` |
| Frontend | `http://127.0.0.1:5500/` |

**Run both servers**
```
cd D:\trasset\backend  && venv\Scripts\python.exe manage.py runserver
cd D:\trasset\frontend && python -m http.server 5500
```

**Test**
```
cd D:\trasset\backend && venv\Scripts\python.exe manage.py test tests
```

Demo logins — all use `Trasset@2026`:
`admin@` · `manager@` · `head@` · `employee@` · `auditor@` `trasset.local`
