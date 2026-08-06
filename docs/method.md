# The method

The tool is a folder of TypeScript; the method is why it works. Each rule
below exists because of a documented failure mode of solo projects or a
replicated finding in goal-pursuit research — not taste.

## 1. One goal, sequential gates

A mission has exactly one goal metric and a ladder of gates to it. The first
unmet gate is the only one that matters this week. Working on a later gate
while an earlier one is open (building the paid tier before anyone returns) is
the most expensive form of procrastination.

The starter ladder — ship → strangers → audience → retention → revenue — is
the generic shape of a solo product. Rewrite the labels, keep the ordering
logic: each gate is evidence the next one is worth building.

## 2. Deadlines are external forcing functions

Side projects ship when someone is expecting something; work projects ship
because deadlines and stakeholders exist. A solo project has neither, so the
gate `deadline` substitutes for the stakeholder. 4–6 weeks to a live URL, not
4–6 months. A missed deadline is information, not shame: the scope was wrong —
halve it and re-set the date.

## 3. Kill criteria are written in advance

Decide *when you would quit or pivot* while you're still objective — a state
and a date ("under 10 users after 30 distribution actions"), recorded on the
gate itself. When the moment comes you don't re-litigate with sunk-cost
feelings; you read what past-you decided and either act on it or consciously
overrule it in a logged strategy revision. Zombie projects — too dead to grow,
too alive to kill — are what this field kills.

## 4. Inputs and outcomes are different metrics

`kind: "input"` — work you control: posts published, replies sent, emails
mailed, demos given. `kind: "outcome"` — what the world does back: users,
subscribers, revenue.

The stall diagnosis reads them together:

- inputs flat + outcome flat → you stopped trying. Not a strategy problem.
- inputs moving + outcome flat → the strategy is wrong. Revise it.
- inputs moving + outcome moving → nothing to fix. Don't churn strategy.

Writing code is not an input metric. Code that no stranger can encounter
moves nothing; the input metrics are the ones that put the work in front of
people.

## 5. Tasks are if-then plans

"Post the launch thread" sits open forever. "When Iraola's first presser drops
→ post the calls thread within the hour" executes itself. The meta-analytic
evidence for implementation intentions is unusually strong (d ≈ .65 across 94
tests — Gollwitzer & Sheeran). Every task that can carry a `when` should:
the trigger is a date, an event, or a metric crossing a line.

The agent's job at the end of every run: leave the human exactly **one** next
action with a `when`. A list of ten tasks is a decision the human still has to
make, and decision-avoidance in depleted evening hours is how weeks disappear.

## 6. Progress is recorded, and reported

Monitoring progress improves goal attainment, and the effect strengthens when
progress is physically recorded and publicly reported (Harkin et al. 2016 —
138 experiments, N ≈ 19,951). The tool records (append-only JSONL, the page).
Reporting is on you, and it compounds with distribution: the weekly receipt —
"week N: inputs, outcomes, what changed, what's next" — drafted by the agent
from the timeline, posted where your audience is, is simultaneously the
public-monitoring intervention *and* build-in-public content. One artifact,
both jobs.

## 7. Numbers are evidence or they are null

Never estimate. Never let the agent estimate. A `null` with a reason ("Umami
key not set", "needs logged-in browser") is a correct reading; a plausible
number is a lie that compounds down the whole timeline and poisons every stall
calculation. Corollary for agent users: an agent's remembered or inferred
number never enters the ledger — only values read live from a source, with the
tier recorded.

## 8. Strategy changes need evidence, and stalls demand them

`strategy.jsonl` entries carry the numbers that forced the change — never a
rationalisation written after the fact. The two failure modes it prevents are
mirror images: churning strategy while steady progress needed none, and
grinding a dead strategy because nothing forced the question. `stallDays` is
what forces the question.

## Sources

- Harkin et al. 2016, *Does Monitoring Goal Progress Promote Goal Attainment?*
  — Psychological Bulletin, 138 studies. Monitoring works; recording and
  public reporting strengthen it.
- Gollwitzer & Sheeran 2006, *Implementation Intentions and Goal Achievement*
  — meta-analysis, 94 tests, d ≈ .65.
- Sheeran 2002 on the intention–behavior gap: medium-to-large changes in
  intention produce small-to-medium changes in behavior — intending is not a
  plan.
- Oettingen's mental contrasting (MCII/WOOP): pairing the wish with the
  obstacle outperforms positive visualization — the reason `kill` criteria
  and `evidence` fields ask you to write the obstacle down.