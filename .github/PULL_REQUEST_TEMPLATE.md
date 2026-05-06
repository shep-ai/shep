<!--
Thanks for contributing to Shep! Fill in each section. The grooming agent and
reviewers use these fields directly — keep them short, concrete, and honest.
-->

## What

<!-- One or two sentences describing the change. What does this PR do? -->

## Why

<!--
Why is this change needed? Link the issue it closes ("Closes #123") or the spec
it implements ("Implements specs/097-ai-native-contributor-onboarding/").
For bug fixes, describe the user-visible symptom.
-->

## Screenshots / Recording

<!--
Required for any UI change. Drag-drop a screenshot, GIF, or short video.
For non-UI changes, replace this section with `N/A — non-UI change.`
-->

## Testing

<!--
How did you verify this works? List the commands you ran and the scenarios you
exercised. For new use cases, link the test file. For UI, list the Storybook
states you covered (Default / Loading / Empty / Error).
-->

## Checklist

<!-- Tick everything that applies; remove items that genuinely don't. -->

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test:unit` and `pnpm test:int` pass
- [ ] `pnpm build` succeeds
- [ ] (UI only) `pnpm build:storybook` succeeds and every new component has a colocated `.stories.tsx` covering Default / Loading / Empty / Error
- [ ] (Domain changes) `pnpm tsp:compile` ran and `packages/core/src/domain/generated/output.ts` is committed
- [ ] (New use case) Tests landed RED-first per the [TDD guide](./docs/development/tdd-guide.md)
- [ ] No `application/` or `presentation/` file imports anything from `infrastructure/`
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) — releasing types (`feat`, `fix`) used for user-visible changes
- [ ] Updated [LESSONS.md](./LESSONS.md) if I learned something a future contributor should know
