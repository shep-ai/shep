import yaml from 'js-yaml';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type MessageLevel = 'error' | 'warning' | 'info';
type ValidationCategory = 'completeness' | 'architecture' | 'consistency';
type ValidationStatus = 'pass' | 'warn' | 'fail';

interface ValidationMessage {
  level: MessageLevel;
  message: string;
}

export interface ValidationResult {
  category: ValidationCategory;
  status: ValidationStatus;
  messages: ValidationMessage[];
}

type YamlData = Record<string, unknown>;

function loadYaml(filePath: string): YamlData | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content);
  if (typeof parsed !== 'object' || parsed === null) return null;
  return parsed as YamlData;
}

const REQUIRED_FILES = ['spec.yaml', 'research.yaml', 'plan.yaml', 'tasks.yaml', 'feature.yaml'];

const REQUIRED_KEYS: Record<string, string[]> = {
  'spec.yaml': [
    'name',
    'number',
    'branch',
    'oneLiner',
    'summary',
    'phase',
    'sizeEstimate',
    'content',
  ],
  'research.yaml': ['name', 'summary', 'decisions', 'content'],
  'plan.yaml': ['name', 'summary', 'phases', 'filesToCreate', 'filesToModify', 'content'],
  'tasks.yaml': ['name', 'summary', 'tasks', 'totalEstimate', 'content'],
};

export function validateCompleteness(specDir: string): ValidationResult {
  const messages: ValidationMessage[] = [];

  // Check required files exist
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(specDir, file))) {
      messages.push({ level: 'error', message: `Required file missing: ${file}` });
    }
  }

  // Check required keys in each file
  for (const [file, keys] of Object.entries(REQUIRED_KEYS)) {
    const filePath = join(specDir, file);
    const data = loadYaml(filePath);
    if (!data) continue;

    for (const key of keys) {
      if (!(key in data)) {
        messages.push({ level: 'error', message: `Missing required key '${key}' in ${file}` });
      }
    }

    // Check openQuestions for unresolved items
    if (Array.isArray(data.openQuestions)) {
      const unresolved = data.openQuestions.filter(
        (q: { resolved?: boolean }) => q?.resolved === false
      );
      if (unresolved.length > 0) {
        messages.push({
          level: 'error',
          message: `${file} has ${unresolved.length} unresolved open question(s)`,
        });
      }
    }
  }

  const hasErrors = messages.some((m) => m.level === 'error');
  return {
    category: 'completeness',
    status: hasErrors ? 'fail' : 'pass',
    messages,
  };
}

export function validateArchitecture(specDir: string): ValidationResult {
  const messages: ValidationMessage[] = [];
  const planPath = join(specDir, 'plan.yaml');
  const data = loadYaml(planPath);

  if (!data) {
    messages.push({
      level: 'warning',
      message: 'plan.yaml not found, cannot validate architecture',
    });
    return { category: 'architecture', status: 'warn', messages };
  }

  const content = typeof data.content === 'string' ? data.content : '';

  const hasTdd = /RED/i.test(content) && /GREEN/i.test(content) && /REFACTOR/i.test(content);
  if (!hasTdd) {
    messages.push({
      level: 'warning',
      message: 'Plan content missing TDD references (RED-GREEN-REFACTOR)',
    });
  }

  const hasCleanArch = /clean\s+architecture/i.test(content);
  if (!hasCleanArch) {
    messages.push({
      level: 'warning',
      message: 'Plan content missing Clean Architecture references',
    });
  }

  const hasWarnings = messages.some((m) => m.level === 'warning');
  return {
    category: 'architecture',
    status: hasWarnings ? 'warn' : 'pass',
    messages,
  };
}

interface TaskEntry {
  id: string;
  dependencies?: string[];
}

function getDeps(task: TaskEntry): string[] {
  return Array.isArray(task.dependencies) ? task.dependencies : [];
}

export function validateConsistency(specDir: string): ValidationResult {
  const messages: ValidationMessage[] = [];

  const planData = loadYaml(join(specDir, 'plan.yaml'));
  const tasksData = loadYaml(join(specDir, 'tasks.yaml'));

  if (!planData || !tasksData) {
    messages.push({
      level: 'error',
      message: 'Cannot validate consistency: plan.yaml or tasks.yaml missing',
    });
    return { category: 'consistency', status: 'fail', messages };
  }

  const tasks: TaskEntry[] = Array.isArray(tasksData.tasks) ? tasksData.tasks : [];
  const taskIds = new Set<string>(tasks.map((t) => t.id));
  const taskById = new Map<string, TaskEntry>(tasks.map((t) => [t.id, t]));

  // Check plan phase taskIds reference valid tasks
  const phases = Array.isArray(planData.phases) ? planData.phases : [];
  for (const phase of phases) {
    const phaseTaskIds = Array.isArray(phase.taskIds) ? phase.taskIds : [];
    for (const tid of phaseTaskIds) {
      if (!taskIds.has(tid)) {
        messages.push({
          level: 'error',
          message: `Phase '${phase.id}' references non-existent task: ${tid}`,
        });
      }
    }
  }

  // Check task dependencies reference valid tasks
  for (const task of tasks) {
    for (const dep of getDeps(task)) {
      if (!taskIds.has(dep)) {
        messages.push({
          level: 'error',
          message: `Task '${task.id}' depends on non-existent task: ${dep}`,
        });
      }
    }
  }

  // Detect circular dependencies via single-pass DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(taskId: string): boolean {
    if (inStack.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    inStack.add(taskId);
    const task = taskById.get(taskId);
    if (task) {
      for (const dep of getDeps(task)) {
        if (taskIds.has(dep) && hasCycle(dep)) return true;
      }
    }
    inStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (hasCycle(task.id)) {
      messages.push({
        level: 'error',
        message: `Circular dependency detected involving task: ${task.id}`,
      });
      break;
    }
  }

  const hasErrors = messages.some((m) => m.level === 'error');
  return {
    category: 'consistency',
    status: hasErrors ? 'fail' : 'pass',
    messages,
  };
}

export function validateSpec(specDir: string): ValidationResult[] {
  return [
    validateCompleteness(specDir),
    validateArchitecture(specDir),
    validateConsistency(specDir),
  ];
}

// CLI entry point

if (typeof process !== 'undefined' && process.argv[1]?.includes('spec-validate')) {
  const args = process.argv.slice(2);
  const specDir = args[0];
  if (!specDir) {
    console.error('Usage: spec-validate <spec-dir>');
    process.exit(1);
  }
  const results = validateSpec(specDir);

  for (const result of results) {
    const icon = result.status === 'pass' ? 'PASS' : result.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`[${icon}] ${result.category}`);
    for (const msg of result.messages) {
      console.log(`  ${msg.level}: ${msg.message}`);
    }
  }

  const hasFail = results.some((r) => r.status === 'fail');
  if (hasFail) process.exit(1);
}
