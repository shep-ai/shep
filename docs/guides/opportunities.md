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

## After it ships

When the work item behind a **Building** opportunity reaches a done state, shep marks the
opportunity **Shipped** within the hour; if the work item is cancelled, the opportunity goes
back to **Accepted**. Work done outside a work item can be marked shipped by hand:

```bash
shep opportunity ls                       # find the id
shep outcome ship <opportunity>           # or Mark shipped on the page
```

Each shipped opportunity has an **outcome**. Fourteen days after shipping, shep counts the
space's signals that read like it — linked to it, or sharing enough words with its title, problem
or linked signals — in the 14 days before and the 14 days after shipping. Half as many after, or
fewer, is **Solved**; more is **Persisting**, a sign the bet missed.

```bash
shep outcome ls --space acme              # verdicts, before → after, customers to tell
shep outcome check                        # ship and judge now instead of waiting for the hour
shep outcome tell <opportunity>           # the customers behind it and a note to send
shep outcome tell <opportunity> --done    # mark them told
shep outcome hours <opportunity> 9        # the review hours it really took
```

The **Outcomes** panel on the Opportunities page shows the same, with **Mark told** and a review
hours field on each. Its first line is the space's **calibration**: actual review hours against
the estimates (over outcomes with hours recorded) and how many judged outcomes were solved. If
your bets take 1.4× the hours you estimate, estimate bigger.

## Good to know

- Signals and opportunities belong to a space; a signal links only to an opportunity of its own
  space.
- Revenue is entered on signals; tools can post feedback signals for you (see
  [Customer feedback](./feedback.md)).
