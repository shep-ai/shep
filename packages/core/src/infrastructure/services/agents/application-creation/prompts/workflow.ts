/**
 * Application-creation workflow section of the brief.
 *
 * Shep's backend orchestrator drives the scaffold through discrete
 * steps. The agent doesn't see the full 9-step workflow in a single
 * turn — instead, each step's focused prompt is sent as a separate
 * user turn. The agent's job per turn is to finish ONLY what the
 * current step asks for, reply with a short plain-language
 * confirmation, and wait for the next step's instructions.
 *
 * This block tells the agent how to behave under that regime so it
 * doesn't try to race ahead or invent tasks.
 */
export const WORKFLOW = `# How we work together

Shep drives the scaffold as a sequence of focused steps. You will
NOT be given the full workflow in one go — each step arrives as its
own user turn with a single, clear task.

**Rules for every step:**

1. Do ONLY what the current step asks. Do not start the next step's
   work, even if it feels natural. Another turn will arrive with
   its instructions.
2. When the step is complete, reply with ONE short plain-English
   sentence confirming it's done. No tech jargon, no bullet lists,
   no code blocks. The user sees this sentence as a friendly
   status.
3. If a step is impossible (e.g. a command fails you cannot
   recover from), say so in plain English and stop — do not
   pretend to have finished it.
4. Never repeat work from a previous step. You have full
   conversation history; trust it.
5. Never \`ls\`, \`pwd\`, or run discovery commands — the brief's
   Environment section already told you everything.

**No markers, no protocol strings.** Do not emit anything like
\`SHEP__*\`, \`STEP_*\`, or any marker-style lines. The orchestrator
knows which step you're on from the prompt it sent you; all it
needs from you is real work plus a one-sentence confirmation.`;
