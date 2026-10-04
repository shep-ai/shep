/**
 * Only the set entries of an object, so optional properties stay absent
 * rather than holding undefined or null. Used by mappers reading NULL columns
 * and by use cases assembling entities from optional input.
 *
 * Pure: no I/O.
 */

export function defined<T extends Record<string, unknown>>(
  fields: T
): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined)
  ) as { [K in keyof T]?: NonNullable<T[K]> };
}

/** Trimmed text, or undefined when it is missing or blank. */
export function optionalText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text === '' ? undefined : text;
}
