import { describe, it, expect } from 'vitest';
import { errorClassOf, topStackFrame } from '@/domain/shared/telemetry/telemetry-error-source.js';

describe('topStackFrame', () => {
  it('keeps the function, file basename and line of the first frame, never the directory', () => {
    const stack = [
      'Error: secret message about /home/alice/project',
      '    at loadThing (/home/alice/.npm/shep/dist/load-thing.js:42:13)',
      '    at main (/home/alice/.npm/shep/dist/index.js:9:1)',
    ].join('\n');
    expect(topStackFrame(stack)).toBe('loadThing@load-thing.js:42');
  });

  it('reduces Windows paths to the basename', () => {
    const stack = 'TypeError: x\n    at run (C:\\Users\\bob\\shep\\dist\\run.js:7:3)';
    expect(topStackFrame(stack)).toBe('run@run.js:7');
  });

  it('handles anonymous frames and file URLs', () => {
    expect(topStackFrame('Error\n    at file:///opt/shep/dist/a.js:3:9')).toBe(
      '<anonymous>@a.js:3'
    );
  });

  it('skips node internals when a user frame follows', () => {
    const stack =
      'Error\n    at internalThing (node:internal/process/task_queues:95:5)\n    at go (/x/go.js:1:1)';
    expect(topStackFrame(stack)).toBe('go@go.js:1');
  });

  it('returns null without a parsable frame', () => {
    expect(topStackFrame(undefined)).toBeNull();
    expect(topStackFrame('Error: only a message')).toBeNull();
  });
});

describe('errorClassOf', () => {
  it('names the constructor, never the message', () => {
    expect(errorClassOf(new TypeError('private'))).toBe('TypeError');
    class CustomFailure extends Error {}
    expect(errorClassOf(new CustomFailure('x'))).toBe('CustomFailure');
  });

  it('labels non-errors by type', () => {
    expect(errorClassOf('a string')).toBe('NonError:string');
    expect(errorClassOf(null)).toBe('NonError:null');
  });
});
