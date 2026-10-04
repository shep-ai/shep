/** Shapes shared by the Opportunities page components (spec 126). */

export interface OpportunityPageOptions {
  spaces: { id: string; name: string; slug: string }[];
  /** Product lines of the board's space. */
  productLines: { id: string; name: string }[];
  /** Projects an opportunity can be built into. */
  projects: { id: string; name: string }[];
}
