/**
 * Docker Health Service Interface (Output Port)
 *
 * Defines the contract for checking Docker daemon availability.
 * Used as a prerequisite check before any cluster operation (NFR-3).
 */

export interface IDockerHealthService {
  /**
   * Check if the Docker daemon is running and accessible.
   *
   * @returns true if Docker is available, false otherwise
   */
  isAvailable(): Promise<boolean>;
}
