// ============================================================================
// SHELF FIELDS
// ============================================================================
//
// The metadata block shared by shelf records (book, movie, show, music) in both the
// create and edit forms: rating, status, date finished, release year, and the
// optional cover/poster. Fully controlled — the parent form owns the state and
// does the upload on submit. Wording comes from SHELF_META per type.
// ============================================================================

"use client";

import {
  SHELF_META,
  SHELF_STATUSES,
  type ShelfStatus,
  type ShelfType,
} from "@/lib/validations/records";
import { CoverImageInput } from "@/components/cover-image-input";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400";

const labelClass =
  "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

const optional = <span className="font-normal text-gray-400">(optional)</span>;

export type ShelfValues = {
  rating: number | null;
  shelfStatus: ShelfStatus | "";
  dateFinished: string;
  releaseYear: number | null;
  // Rendered by the parent form next to Title (books only, see
  // SHELF_META.hasSubtitle), but held here so it travels with the shelf state.
  subtitle: string;
};

// Turns a number input's raw value into number | null ("" → null).
function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

export default function ShelfFields({
  type,
  idPrefix = "",
  values,
  onChange,
  fieldErrors,
  cover,
}: {
  type: ShelfType;
  // Prefix for input ids so create and edit forms don't collide ("edit-").
  idPrefix?: string;
  values: ShelfValues;
  onChange: (patch: Partial<ShelfValues>) => void;
  fieldErrors?: Record<string, string[]>;
  cover: {
    existingUrl: string | null;
    file: File | null;
    onSelect: (file: File) => void;
    onClear: () => void;
    onError: (message: string) => void;
    disabled?: boolean;
  };
}) {
  const meta = SHELF_META[type];
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <div className="space-y-6 rounded-md border border-gray-200 p-4 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={id("rating")} className={labelClass}>
            Rating{" "}
            <span className="font-normal text-gray-400">(0–5)</span>
          </label>
          <input
            id={id("rating")}
            type="number"
            inputMode="decimal"
            min={0}
            max={5}
            step="any"
            value={values.rating ?? ""}
            onChange={(e) => onChange({ rating: numberOrNull(e.target.value) })}
            placeholder="e.g. 4.25"
            className={inputClass}
          />
          {fieldErrors?.rating && (
            <p className="mt-1 text-sm text-red-500">{fieldErrors.rating[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor={id("releaseYear")} className={labelClass}>
            Year {optional}
          </label>
          <input
            id={id("releaseYear")}
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            step={1}
            value={values.releaseYear ?? ""}
            onChange={(e) =>
              onChange({ releaseYear: numberOrNull(e.target.value) })
            }
            placeholder="e.g. 2021"
            className={inputClass}
          />
          {fieldErrors?.releaseYear && (
            <p className="mt-1 text-sm text-red-500">
              {fieldErrors.releaseYear[0]}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={id("shelfStatus")} className={labelClass}>
          Status {optional}
        </label>
        <select
          id={id("shelfStatus")}
          value={values.shelfStatus}
          onChange={(e) =>
            onChange({ shelfStatus: e.target.value as ShelfStatus | "" })
          }
          className={inputClass}
        >
          <option value="">—</option>
          {SHELF_STATUSES.map((s) => (
            <option key={s} value={s}>
              {meta.statusLabels[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={id("dateFinished")} className={labelClass}>
          {meta.dateLabel} {optional}
        </label>
        <input
          id={id("dateFinished")}
          type="date"
          value={values.dateFinished}
          onChange={(e) => onChange({ dateFinished: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>
          {meta.imageLabel} {optional}
        </label>
        <CoverImageInput
          noun={meta.imageLabel.toLowerCase()}
          existingUrl={cover.existingUrl}
          file={cover.file}
          onSelect={cover.onSelect}
          onClear={cover.onClear}
          onError={cover.onError}
          disabled={cover.disabled}
        />
      </div>
    </div>
  );
}
