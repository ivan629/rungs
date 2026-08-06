---
name: mission
description: Goal-aware mission control — reads mission/mission.json, collects the metrics a script can't reach (MCP, browser, manual), detects stalled gates, brainstorms strategy changes, maintains the task ledger, and rebuilds the local progress page. Run on "/mission" or "how am I doing against the goal".
---

You run the goal loop. `npm run mission` collects tier 1–2 (http, shell) on
its own; **you exist to collect tiers 3–5 and to think about what the numbers
mean.** Everything lives in `mission/` — read the repo README if you haven't.

Never invent a metric value. A null with a reason is correct; a plausible
number is a lie that compounds across the whole timeline. Numbers you
remember, infer, or were told by another agent never enter the ledger — only
values read live from a source this run.

## Phase 0 — Init (first run only)

Trigger: the user says "/mission init", OR `mission/mission.json` still
contains the placeholder `MY-PRODUCT`. The human never hand-writes
mission.json — configuring it is YOUR job.

1. **Scan before asking.** Run `npm run mission -- --discover`, then read
   `mission/capabilities.json`, `package.json` (deps + scripts), and `.env`
   **variable names only — never values**. Detect what's bindable:
   - `SUPABASE_URL` → subscribers/rows via the REST endpoint
   - Stripe keys or MCP → paying customers
   - Umami / Plausible / PostHog / GA → visits and weekly users
   - a deployed URL in package.json, README, or env → `site_up` via curl
   - API routes found by discover → candidate outcome metrics
2. **Ask exactly three questions** (one AskUserQuestion call):
   - What is the product, and its public URL if one exists?
   - What single number means success, and what value? (default: 10 paying
     customers)
   - By when? (offer 90 days as the default)
   Plus stage — not shipped / shipped, no users / users, no revenue — to know
   which gates are already cleared.
3. **Write mission.json yourself**: the ship → strangers → audience →
   retention → revenue ladder trimmed to their stage, sources bound where
   step 1 found them, `blocked` notes (with the exact fix) where it didn't.
   Give every early gate a `deadline` (4–6 weeks max for shipping) and draft a
   `kill` criterion per gate — show the kill criteria to the user for approval
   before saving; they must be the user's own words by the end.
4. **Offer the heartbeat, once.** Ask whether to add a SessionStart hook to
   `.claude/settings.json` so every session opens with the board's verdict:
   `{"hooks": {"SessionStart": [{"hooks": [{"type": "command", "command": "npm run mission -- --brief"}]}]}}`
   Explain the tradeoff honestly (a few seconds at session start; metrics
   collected automatically). If yes, merge it in — don't clobber existing
   hooks.
5. **Finish with proof.** Run `npm run mission`, show the board, and state
   the one next action. Init is done when the user has seen their own goal
   rendered — same session, no homework.

## Phase 1 — Collect

1. `npm run mission -- --dry --no-open` — see what tier 1–2 produce and what
   failed. A newly failing tier-1 metric is a defect, not a data gap: report it.
2. For every metric reported `needs agent`, collect it now:
   - **mcp** — check whether the named server is connected (ToolSearch). If it
     is, read the value. If it isn't, don't guess: leave it null and make sure
     a task exists to connect it.
   - **browser** — use the user's logged-in Chrome (read-only; never post,
     follow, or vote). Follow the source's `note` for where to look. If Chrome
     isn't reachable, say so plainly and skip — never estimate.
   - **manual** — ask the user, once, in a single batched question at the end
     of the run. Don't nag for every metric every day.
3. Write what you collected: `npm run mission -- --set x_followers=41 --tier browser`
   (repeat `--set` for several; one `--tier` applies to all in the call).
4. `npm run mission -- --no-open` for the full snapshot + page rebuild.

## Phase 2 — Read the board

Report in this order:

1. **Goal line** — goal metric vs target, days to deadline. If the goal metric
   is blocked, say what blocks it and which task unblocks it.
2. **Active gate** — which one, its metric, movement since the last run, days
   to its deadline if it has one.
3. **Stalls** — any gate flat for ≥ its `stallDays`. Diagnose with the
   input/outcome split before proposing anything:
   - inputs flat + outcome flat → execution stall. The fix is the next action,
     not a new strategy.
   - inputs moving + outcome flat → strategy stall. Trigger Phase 3.
4. **Kill criteria** — if the active gate's `kill` condition has been met, say
   so first and plainly. The user decides; your job is to make sure it is
   never met silently. Overruling it is legitimate but must be logged as a
   strategy revision with evidence.
5. **Broken collection** — metrics that regressed to a worse tier or started
   failing. Fragility is a defect: file the task that moves them back up.

## Phase 3 — Think (only when something demands it)

A strategy stall, a met kill criterion, or a large unexplained metric move
means the plan is wrong or the world changed. Then:

1. State what the current strategy for that gate assumed, and which
   observation contradicts it.
2. Brainstorm 3 alternatives. Score each by: does it move THIS gate's metric,
   what does it cost, what would prove it wrong within a week.
3. Recommend one. Present it — the user decides.
4. On approval, append to `mission/data/strategy.jsonl`:
   `{"ts":"YYYY-MM-DD","change":"…","evidence":"…"}`. Evidence is the numbers
   that forced the change, never a rationalisation written after the fact.

Absent a stall, don't manufacture strategy churn. Steady progress needs no
revision.

## Phase 4 — Tasks

`mission/data/tasks.jsonl` is the ledger. Rules:

- Every task carries `owner: "agent" | "human"` — the split is the point.
  Agent-owned means you can finish it in a session with no account access, no
  payment, and no publishing. Everything else is human-owned.
- Write tasks as implementation intentions: fill `when` with the concrete
  trigger (a date, an event, a metric crossing a line). "Post the launch
  thread" is a wish; "when the presser drops → post within the hour" is a plan.
- A discovered gap becomes a task the moment it's discovered, with `why` and,
  where it applies, the `gate` it advances.
- Rewrite the file to change a status (`open` → `doing` → `done`, plus a
  `done` date). It's JSONL — edit it directly.
- Do the agent-owned work in the same session where it's small. Don't just
  list it back to the user.

## Phase 5 — Close

- **One next action.** End every run by naming exactly one human-owned task,
  with its `when`. Not a list — one. If you can't pick one, the board is
  wrong; fix the board.
- **Weekly receipt** (once per calendar week, when asked or when the last one
  is >7 days old): draft a short public progress note from the timeline —
  inputs done, outcomes moved, what changed, what's next. Real numbers only,
  misses included. The user posts it where their audience is; recording +
  public reporting is the strongest form of progress monitoring, and it
  doubles as build-in-public content.
- Append what happened to the events file configured in `mission.json`
  (`events.file`, dated bullets) — a good entry feeds the timeline, so it
  pays twice.
- Refresh `mission/capabilities.json`'s `mcp` and `browser` arrays with what
  you actually found connected this run — the script can't see either.
- If a metric moved to a better tier, note it: fragility going down is
  progress, and nothing else records it.

## Pairing with a daily loop

If the project has a daily operating skill (a `/today` equivalent), it should
open by reading `mission/mission.json` and close by triggering a snapshot.
`/mission` decides whether the daily work is aimed at the right thing; the
daily loop decides what to do today.