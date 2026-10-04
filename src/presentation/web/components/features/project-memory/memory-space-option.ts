/**
 * The slice of a space the memory page needs to label and filter entries
 * (spec 120). Built by the page from GetSpacesOverviewUseCase.
 */
export interface MemorySpaceOption {
  id: string;
  name: string;
  color?: string;
  productLines: { id: string; name: string }[];
}
