/**
 * The seven builtin harness tools (spec 119, V0 minimum capabilities).
 * Each returns raw output; the runtime persists it as a chunk before any
 * rendering.
 */
import type { IToolExecutor } from '../../../../application/ports/output/harness/index.js';
import { ListFilesTool } from './list-files.tool.js';
import { SearchSourceTool } from './search-source.tool.js';
import { ReadFileTool } from './read-file.tool.js';
import { GitInspectTool } from './git-inspect.tool.js';
import { RunCommandTool } from './run-command.tool.js';
import { RunTestsTool } from './run-tests.tool.js';
import { ApplyPatchTool } from './apply-patch.tool.js';

export {
  ListFilesTool,
  SearchSourceTool,
  ReadFileTool,
  GitInspectTool,
  RunCommandTool,
  RunTestsTool,
  ApplyPatchTool,
};
export { detectTestCommand } from './run-tests.tool.js';

export function createBuiltinTools(): IToolExecutor[] {
  return [
    new ListFilesTool(),
    new SearchSourceTool(),
    new ReadFileTool(),
    new GitInspectTool(),
    new RunCommandTool(),
    new RunTestsTool(),
    new ApplyPatchTool(),
  ];
}
