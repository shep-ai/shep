/**
 * ICoastsService Interface Type-Level Tests
 *
 * Validates that the interface and supporting types are correctly defined
 * with the expected shape and method signatures.
 *
 * TDD Phase: GREEN
 */

import { describe, it, expectTypeOf } from 'vitest';
import type {
  ICoastsService,
  PrerequisiteCheckResult,
  CoastInstance,
} from '@/application/ports/output/services/coasts-service.interface.js';

describe('PrerequisiteCheckResult', () => {
  it('has coastBinary boolean field', () => {
    expectTypeOf<PrerequisiteCheckResult>().toHaveProperty('coastBinary');
    expectTypeOf<PrerequisiteCheckResult['coastBinary']>().toBeBoolean();
  });

  it('has docker boolean field', () => {
    expectTypeOf<PrerequisiteCheckResult>().toHaveProperty('docker');
    expectTypeOf<PrerequisiteCheckResult['docker']>().toBeBoolean();
  });

  it('has coastdRunning boolean field', () => {
    expectTypeOf<PrerequisiteCheckResult>().toHaveProperty('coastdRunning');
    expectTypeOf<PrerequisiteCheckResult['coastdRunning']>().toBeBoolean();
  });

  it('has allMet boolean field', () => {
    expectTypeOf<PrerequisiteCheckResult>().toHaveProperty('allMet');
    expectTypeOf<PrerequisiteCheckResult['allMet']>().toBeBoolean();
  });

  it('has missingMessages string array field', () => {
    expectTypeOf<PrerequisiteCheckResult>().toHaveProperty('missingMessages');
    expectTypeOf<PrerequisiteCheckResult['missingMessages']>().toEqualTypeOf<string[]>();
  });
});

describe('CoastInstance', () => {
  it('has port number field', () => {
    expectTypeOf<CoastInstance>().toHaveProperty('port');
    expectTypeOf<CoastInstance['port']>().toBeNumber();
  });

  it('has url string field', () => {
    expectTypeOf<CoastInstance>().toHaveProperty('url');
    expectTypeOf<CoastInstance['url']>().toBeString();
  });
});

describe('ICoastsService', () => {
  it('has checkPrerequisites method accepting workDir and returning PrerequisiteCheckResult', () => {
    expectTypeOf<ICoastsService['checkPrerequisites']>().toEqualTypeOf<
      (workDir: string) => Promise<PrerequisiteCheckResult>
    >();
  });

  it('has build method accepting workDir and returning void', () => {
    expectTypeOf<ICoastsService['build']>().toEqualTypeOf<(workDir: string) => Promise<void>>();
  });

  it('has run method accepting workDir and returning CoastInstance', () => {
    expectTypeOf<ICoastsService['run']>().toEqualTypeOf<
      (workDir: string) => Promise<CoastInstance>
    >();
  });

  it('has stop method accepting workDir and returning void', () => {
    expectTypeOf<ICoastsService['stop']>().toEqualTypeOf<(workDir: string) => Promise<void>>();
  });

  it('has lookup method accepting workDir and returning CoastInstance or null', () => {
    expectTypeOf<ICoastsService['lookup']>().toEqualTypeOf<
      (workDir: string) => Promise<CoastInstance | null>
    >();
  });

  it('has isRunning method accepting workDir and returning boolean', () => {
    expectTypeOf<ICoastsService['isRunning']>().toEqualTypeOf<
      (workDir: string) => Promise<boolean>
    >();
  });

  it('has checkout method accepting workDir and returning void', () => {
    expectTypeOf<ICoastsService['checkout']>().toEqualTypeOf<(workDir: string) => Promise<void>>();
  });

  it('has getInstallationPrompt method with no parameters returning string', () => {
    expectTypeOf<ICoastsService['getInstallationPrompt']>().toEqualTypeOf<() => Promise<string>>();
  });

  it('has generateCoastfile method accepting workDir and returning string path', () => {
    expectTypeOf<ICoastsService['generateCoastfile']>().toEqualTypeOf<
      (workDir: string) => Promise<string>
    >();
  });

  it('has hasCoastfile method accepting workDir and returning boolean', () => {
    expectTypeOf<ICoastsService['hasCoastfile']>().toEqualTypeOf<
      (workDir: string) => Promise<boolean>
    >();
  });
});
