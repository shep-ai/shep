/**
 * Builtin eval suites (spec 119, task 33). `smoke` is small and self-checking
 * (plain Node, no dependencies), so `shep harness eval run smoke` works in any
 * environment with a model backend configured.
 */
import type { HarnessEvalSuiteDef } from '../../../../application/ports/output/harness/index.js';

const SMOKE: HarnessEvalSuiteDef = {
  id: 'smoke',
  description: 'Three small Node tasks: an edit, a failing test to fix, a new module',
  cases: [
    {
      id: 'trim-token',
      task: 'Make refresh() in src/refresh.js trim surrounding whitespace from the token before returning it.',
      files: {
        'src/refresh.js':
          'function refresh(token) {\n  return token;\n}\n\nmodule.exports = { refresh };\n',
        'README.md': '# Tokens\n\nRefresh helpers.\n',
      },
      check:
        "node -e \"const { refresh } = require('./src/refresh.js'); process.exit(refresh('  abc ') === 'abc' ? 0 : 1)\"",
      requiredEvidence: ['src/refresh.js'],
    },
    {
      id: 'fix-sum',
      task: 'The tests in test/sum.test.js fail. Fix the bug in src/sum.js so they pass.',
      files: {
        'src/sum.js':
          'function sum(values) {\n  let total = 0;\n  for (let i = 1; i < values.length; i++) total += values[i];\n  return total;\n}\n\nmodule.exports = { sum };\n',
        'test/sum.test.js':
          "const assert = require('node:assert');\nconst { sum } = require('../src/sum.js');\nassert.strictEqual(sum([1, 2, 3]), 6);\nassert.strictEqual(sum([]), 0);\nconsole.log('2 passed');\n",
      },
      testCommand: 'node test/sum.test.js',
      check: 'node test/sum.test.js',
      requiredEvidence: ['src/sum.js', 'test/sum.test.js'],
    },
    {
      id: 'add-greet',
      task: 'Add src/greet.js exporting greet(name) that returns "Hello, <name>!", following the style of src/farewell.js.',
      files: {
        'src/farewell.js':
          'function farewell(name) {\n  return `Goodbye, ${name}!`;\n}\n\nmodule.exports = { farewell };\n',
      },
      check:
        "node -e \"const { greet } = require('./src/greet.js'); process.exit(greet('Ada') === 'Hello, Ada!' ? 0 : 1)\"",
      requiredEvidence: ['src/farewell.js'],
    },
  ],
};

export const BUILTIN_EVAL_SUITES: Readonly<Record<string, HarnessEvalSuiteDef>> = { smoke: SMOKE };
