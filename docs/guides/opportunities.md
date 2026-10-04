# Opportunities: deciding what to build

Shep's agents can build far more than a team can review. The scarce resource is the people who
read and merge the result. The **Opportunities** page, and `shep signal` / `shep opportunity`,
help you spend that review time on the bets worth most.

## Signals: the evidence

A **signal** is one piece of evidence that users need something: a customer request, a
production incident, a tracker issue, an agent's finding, or your own note. It can name the
**customer** behind it, the **revenue per month** at stake for that customer, and whether it is
**urgent**.

```bash
shep signal add "Guest checkout times out" --space acme \
  --kind feedback --customer Globex --revenue 4000 --urgent \
  --url https://support.acme.com/t/812
shep signal ls --space acme --unlinked
```

On the page, record signals with the form under the list. Signals that do not support an
opportunity yet wait in **Signals to link**.

## Opportunities: the bets

An **opportunity** is a bet worth building. It has an estimate in **review hours** (how long
people will spend reviewing and merging it), a **confidence** from 0 to 1, and can be marked
**strategic**.

```bash
shep opportunity add "Faster guest checkout" --hours 6 --confidence 0.7 --space acme \
  --problem "Guests abandon checkout when it times out"
shep opportunity link <signal> <opportunity>
```

## The score

Each space has **weights** and a **weekly review capacity**:

| Weight | Counts |
| ------ | ------ |
| reach | each customer behind the opportunity (a signal without a customer counts as one) |
| revenue | each 1,000 a month at stake (per customer, the largest amount any signal named) |
| urgency | each urgent signal |
| strategic | once, if the opportunity is strategic |

```
value = reach × customers + revenue × revenue at stake ÷ 1,000 + urgency × urgent + strategic
score = value × confidence ÷ review hours
```

The score is **value per review hour**. Defaults are reach 1, revenue 2, urgency 3, strategic 5
and 20 review hours a week; change them for a space:

```bash
shep opportunity weights --space acme --urgency 5 --capacity 12
```

## The line

`shep opportunity ls` (and the page) ranks open opportunities by score and draws **the line**:
work already building holds its hours first, then accepted opportunities join best-first while
their hours fit the week's capacity. The rest wait. The capacity bar shows how full the week is.

## Decisions

```bash
shep opportunity accept <opportunity>                       # competes for capacity
shep opportunity drop <opportunity> --reason "Covered by the new PSP"
shep opportunity build <opportunity> --project pay          # becomes a work item
```

**Build** creates a work item in the project whose description carries the problem, the numbers
behind the decision and the signals, so the agents that plan and build it know why it matters.
The opportunity moves to **Building**. A dropped opportunity can be accepted again later.

## Good to know

- Signals and opportunities belong to a space; a signal links only to an opportunity of its own
  space.
- Revenue is entered on signals for now; feedback, incident and discovery loops will record
  signals for you.
