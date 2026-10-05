# Discovery: let an agent shape the next bets

Signals pile up faster than people turn them into opportunities. **Discovery** hands a space's
loose evidence to an agent and gets back a few proposed opportunities, each tied to the signals
behind it. You still decide: discovered opportunities wait as **Proposed** and rank like any
other (see [Opportunities](./opportunities.md)).

## Run it

```bash
shep discovery run --space acme
```

Or press **Discover now** on the Opportunities page. The agent reads:

- the space's signals not linked to any opportunity (the newest 60),
- the themes among them ([Customer feedback](./feedback.md)),
- the titles of the space's open opportunities, so it does not repeat them,
- the titles of the space's team knowledge documents ([Team knowledge](./knowledge.md)).

It answers with up to five proposals: a title, the problem, an outline of what to build, why
now, a review-hour estimate, a confidence, and the signals it rests on. Shep keeps a proposal
only when it cites signals that really are loose in this space and its title is new; kept
proposals become opportunities marked **Discovered**, with the outline as their brief and their
signals linked. The agent gets no tools and sees nothing outside the space.

## Schedule it

```bash
shep discovery schedule --space acme --every 24     # daily
shep discovery schedule --space acme --off
```

On the page, pick a schedule next to **Discover now**. The shep daemon (`shep start`, or
`shep ui` while it runs) starts due runs. Discovery is off until you schedule it.

## History

```bash
shep discovery ls --space acme
```

Each run records how many signals it read, how many opportunities it proposed, how many
proposals it dropped, and why it failed if it did. Only one run per space happens at a time.

## Which agent

Discovery uses the space's agent rules: a space limited to some agents uses the first of them
unless `--agent` names another allowed one, and the space's accounts and config directories
apply to the run.
