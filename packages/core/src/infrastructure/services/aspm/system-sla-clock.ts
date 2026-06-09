/**
 * System SLA Clock Adapter
 *
 * Feature 098, phase 6 (task-32). Concrete {@link ISlaClockPort} backed by
 * `new Date()`. Production-only — tests inject a deterministic fake.
 *
 * Intentionally NOT marked `@injectable()`: the class has no constructor
 * params and is registered via factory in `register-aspm.ts`. Avoiding the
 * decorator keeps the adapter a tiny POJO so it remains trivially
 * unit-testable without tsyringe metadata.
 */

import type { ISlaClockPort } from '../../../application/ports/output/services/sla-clock-port.interface.js';

export class SystemSlaClock implements ISlaClockPort {
  now(): Date {
    return new Date();
  }
}
