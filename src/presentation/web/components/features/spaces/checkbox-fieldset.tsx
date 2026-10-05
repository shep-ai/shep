'use client';

/**
 * CheckboxFieldset — a titled set of checkboxes choosing several values of
 * one kind, such as the agents a space allows (spec 121) or the runtime
 * actions it runs on incidents without asking (spec 129).
 */

export interface CheckboxChoice<T extends string> {
  value: T;
  label: string;
}

export interface CheckboxFieldsetProps<T extends string> {
  legend: string;
  hint: string;
  choices: readonly CheckboxChoice<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** Each checkbox's test id is `${testIdPrefix}-${value}`. */
  testIdPrefix: string;
}

export function CheckboxFieldset<T extends string>({
  legend,
  hint,
  choices,
  selected,
  onToggle,
  testIdPrefix,
}: CheckboxFieldsetProps<T>) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs">{legend}</legend>
      <p className="text-muted-foreground text-[11px]">{hint}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {choices.map((choice) => (
          <label key={choice.value} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(choice.value)}
              onChange={() => onToggle(choice.value)}
              data-testid={`${testIdPrefix}-${choice.value}`}
            />
            {choice.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** `values` with `value` added, or removed when already there. */
export function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
