/**
 * Minimal type declaration stub for 'croner'.
 * The real package must be installed for runtime use.
 */
declare module 'croner' {
  interface CronOptions {
    paused?: boolean;
    timezone?: string;
    [key: string]: unknown;
  }

  class Cron {
    constructor(expression: string, options?: CronOptions);
    nextRun(referenceDate?: Date): Date | null;
    stop(): void;
    start(): void;
  }

  export { Cron };
  export default Cron;
}
