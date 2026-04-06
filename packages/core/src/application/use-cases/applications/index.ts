/**
 * Application Use Cases Module
 *
 * Exports use cases for Application entity operations.
 */

export { CreateApplicationUseCase } from './create-application.use-case.js';
export type {
  CreateApplicationInput,
  CreateApplicationResult,
} from './create-application.use-case.js';
export { ListApplicationsUseCase } from './list-applications.use-case.js';
export { GetApplicationUseCase } from './get-application.use-case.js';
export { DeleteApplicationUseCase } from './delete-application.use-case.js';
export { UpdateApplicationUseCase } from './update-application.use-case.js';
export type { UpdateApplicationFields } from './update-application.use-case.js';
