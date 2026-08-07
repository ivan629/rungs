# Rungs

**Your coding agent already writes the code. Rungs makes it accountable for
the launch.**

Local-first, agent-native launch tracking for solo products. One goal, the
rungs between you and it, evidence-only metrics over time, and stall detection
that forces a strategy conversation — as a git-tracked folder and a single
HTML page. Nothing deploys, nothing is a service, nothing phones home.

![The Rungs board](https://raw.githubusercontent.com/ivan629/rungs/main/docs/assets/board.png)

The board answers three questions in the first screenful, in order: am I on
track, what's in the way, and what is my **one next action**. Everything else
— gates, metrics, tasks, timeline — is supporting detail below it.

## Install (in your product's repo)

```
npx create-rungs
```

That drops a single bundled file (`rungs/cli.mjs`, no dependencies added to
your repo), a starter `mission.json`, the method docs, and the `/rungs`
agent skill. Then:

1. `npm run rungs` — see the board immediately; it works before anything is
   wired (unmeasured metrics render as *null with a reason*, never zero).
2. In your agent: **`/rungs init`** — it scans the repo for bindable sources
   (Supabase, Stripe, Umami/Plausible, your own API routes), asks you three
   questions, and **writes `mission.json` for you**. You never hand-edit JSON
   unless you want to.
3. Say yes when it offers the SessionStart hook — every coding session then
   opens with the three-line verdict (goal, active gate, stall). The system
   that only speaks when invoked is governed by the same avoidance it exists
   to fight; the hook makes looking at progress the default, not a decision.

Not using Claude Code? The skill is plain markdown — point any agent
(Cursor, AGENTS.md-style setups) at `.claude/skills/rungs/SKILL.md`; the
CLI and files are agent-agnostic.

## Commands

```
npm run rungs                  # collect → append snapshot → render → open
npm run rungs -- --brief       # print 3-line verdict; skips collection if the
                                 # last snapshot is <12h old (safe as a hook)
npm run rungs -- --receipt     # draft the weekly build-in-public receipt
npm run rungs -- --render-only # rebuild the page from stored data (offline)
npm run rungs -- --dry         # show what collectors return, write nothing
npm run rungs -- --discover    # scan the host project for bindable sources
npm run rungs -- --set x_followers=41 --tier browser
```

The page is `rungs/out/index.html`; the receipt lands in
`rungs/out/receipt.md` — inputs done, outcomes moved (misses included),
what changed, one next action. Post it where your audience is: recording +
public reporting is the strongest form of progress monitoring, and it doubles
as build-in-public content.

## Why it's shaped this way

Solo products mostly die the same few deaths, and each part of this tool is
aimed at one of them:

- **No external forcing function** → gates carry hard `deadline`s. Projects
  with nobody expecting anything ship never.
- **Zombie mode** — too dead to grow, too alive to kill → gates carry a `kill`
  criterion written *in advance* (a state and a date), when you're still able
  to reason about it.
- **Lateral motion** — refactoring that feels like progress → metrics are
  marked `input` (work you control: posts, outreach) or `outcome` (users,
  revenue). A flat outcome with flat inputs means you stopped trying, not that
  the strategy failed. Code shipped is not an input metric; strangers reached
  is.
- **Intending ≠ doing** — the intention–behavior gap is one of the most
  replicated findings in goal psychology; if-then plans ("implementation
  intentions") close it with a medium-to-large effect (d ≈ .65, Gollwitzer &
  Sheeran meta-analysis). Tasks carry a `when` field: not "post on Reddit" but
  "when the Thursday thread opens → post the receipt".
- **Progress you don't look at** — monitoring progress measurably improves
  attainment, and the effect is larger when progress is *recorded* and
  *reported* (Harkin et al. 2016, 138 studies, N≈20k). Hence append-only
  `data/*.jsonl`, the rendered page, and the agent's weekly receipt (below).
- **Plausible numbers** — nothing is ever estimated. A metric that can't be
  read records `null` plus the reason, and the page renders the reason. A
  guessed number is a lie that compounds across the whole timeline.

## Source tiers

Every metric declares sources in order; the collector takes the first that
works and records which tier produced the value.

| tier | channel | who runs it |
|------|---------|-------------|
| `http` | own APIs, public JSON | the script |
| `shell` | npm scripts, git, CLI | the script |
| `mcp` | connected MCP servers | the agent |
| `browser` | logged-in surfaces via Chrome | the agent |
| `manual` | ask the human | the agent |

A node process cannot drive an MCP server or a logged-in browser, so tiers 3–5
are collected by the agent (the `/rungs` skill) and written back with
`--set`. Metrics stuck on tiers 4–5 should have a task to move them up.

## Writing a metric

```json
{
  "id": "subscribers",
  "label": "Email subscribers",
  "kind": "outcome",
  "target": 50,
  "direction": "up",
  "sources": [
    { "tier": "http", "url": "${SUPABASE_URL}/rest/v1/subscribers?select=email",
      "headers": { "apikey": "${SUPABASE_SERVICE_ROLE_KEY}" }, "expr": "d.length" },
    { "tier": "browser", "note": "where to look if the API dies" }
  ]
}
```

`${VAR}` expands from `process.env` and the host project's `.env`. `expr` is a
JS expression over `d` — parsed JSON for `http`, stdout text for `shell` — and
must produce a number. It's evaluated with `new Function`, so treat
`mission.json` as code: it's yours, don't paste expressions into it from
anywhere else.

## Writing a gate

```json
{
  "id": "users",
  "label": "10 strangers used it",
  "metric": "weekly_users",
  "target": 10,
  "stallDays": 7,
  "deadline": "2026-09-15",
  "kill": "under 10 after 30 distribution actions → the pitch or the pond is wrong"
}
```

Gates are the rungs of the ladder: sequential, and the first unmet one is
active. `stallDays` of no
movement declares the gate stalled — the signal that the *strategy* needs
revisiting, not that you need to try harder. The starter `mission.json` ships
a generic solo-product ladder (ship → strangers → audience → retention →
revenue); rewrite it for your product.

## Files

| file | what it is |
|------|-----------|
| `rungs/mission.json` | goal, gates, metric declarations, stall rules — **yours** |
| `rungs/data/metrics.jsonl` | one append-only snapshot per run |
| `rungs/data/tasks.jsonl` | task ledger, each with `owner: agent \| human` and an if-then `when` |
| `rungs/data/strategy.jsonl` | strategy revisions with the evidence that forced them |
| `rungs/capabilities.json` | generated by `--discover`; `mcp`/`browser` refreshed by the agent |
| `docs/journal.md` | dated-bullet journal; feeds the page's timeline |
| `docs/method.md` | the operating method and the research behind it |

`data/*.jsonl` is append-only by convention, not enforcement. Hand-edit
freely; `git log` gives you a second timeline for free.

## Developing this repo

The TypeScript source is `rungs/cli.ts` + `rungs/core/`; `npm run build`
bundles it to `dist/cli.mjs` (what the installer ships). `npm run rungs`
here runs the source via tsx; `npm test` runs the vitest suite. Requires
Node 20+.

**The extraction test:** nothing under `rungs/core/` may import from a host
project. If a metric needs project code, expose it as an npm script or an
HTTP route and declare a `shell`/`http` source instead.