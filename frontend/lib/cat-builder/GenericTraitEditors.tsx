"use client";

import { useEffect, useMemo, useState } from "react";
import type { TraitEditorDefinition } from "@/lib/cat-system";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  clearBuilderTraitValue,
  getBuilderTraitValue,
  setBuilderTraitValue,
} from "./genericTraitEditor";

export interface GenericTraitEditorsProps {
  definitions: readonly TraitEditorDefinition[];
  params: CatParams;
  onParamsChange: (
    params: CatParams,
    definition: TraitEditorDefinition,
  ) => void;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "This value is not valid.";
}

type TraitFieldProps = {
  definition: TraitEditorDefinition;
  value: unknown;
  onCommit: (value: unknown) => void;
  onClear: () => void;
};

function ToggleEditor({ definition, value, onCommit }: TraitFieldProps) {
  const inputId = `generic-trait-${definition.traitId}`;
  return (
    <label
      htmlFor={inputId}
      className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-3"
    >
      <span className="text-sm text-neutral-200">
        {value ? "Enabled" : "Disabled"}
      </span>
      <input
        id={inputId}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onCommit(event.currentTarget.checked)}
        className="size-4 accent-amber-400"
      />
    </label>
  );
}

function SelectEditor({
  definition,
  value,
  onCommit,
  onClear,
}: TraitFieldProps) {
  const stringValue = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState(stringValue);
  useEffect(() => setDraft(stringValue), [stringValue]);

  const options = useMemo(() => {
    if (
      !stringValue ||
      definition.options.some((option) => option.id === stringValue)
    ) {
      return definition.options;
    }
    return [
      { id: stringValue, label: humanize(stringValue) },
      ...definition.options,
    ];
  }, [definition.options, stringValue]);

  if (options.length > 0) {
    return (
      <select
        id={`generic-trait-${definition.traitId}`}
        value={stringValue}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (!next && !definition.required) onClear();
          else onCommit(next);
        }}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
      >
        {!definition.required && <option value="">None</option>}
        {definition.required && !stringValue && (
          <option value="" disabled>
            Choose a value
          </option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label || humanize(option.id)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        id={`generic-trait-${definition.traitId}`}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        placeholder={`Enter ${definition.label.toLowerCase()}`}
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
      />
      <button
        type="button"
        disabled={!draft.trim()}
        onClick={() => onCommit(draft.trim())}
        className="rounded-lg border border-amber-400/70 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Apply
      </button>
      {!definition.required && stringValue && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-neutral-200 hover:border-amber-300/70"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function ListEditor({ definition, value, onCommit }: TraitFieldProps) {
  const selected = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
  const [candidate, setCandidate] = useState("");
  const [customValue, setCustomValue] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const available = definition.options.filter(
    (option) => !selectedSet.has(option.id),
  );
  const atLimit =
    definition.maxItems !== undefined && selected.length >= definition.maxItems;

  const addValue = (nextValue: string) => {
    const normalized = nextValue.trim();
    if (!normalized || selectedSet.has(normalized) || atLimit) return;
    onCommit([...selected, normalized]);
    setCandidate("");
    setCustomValue("");
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 ? (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-700/70 bg-slate-950/70">
          {selected.map((entry) => {
            const label =
              definition.options.find((option) => option.id === entry)?.label ||
              humanize(entry);
            return (
              <li
                key={entry}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-neutral-200">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onCommit(
                      selected.filter((candidate) => candidate !== entry),
                    )
                  }
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-neutral-300 hover:border-amber-300/70 hover:text-amber-100"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-neutral-400">No values selected.</p>
      )}

      {definition.options.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            id={`generic-trait-${definition.traitId}`}
            value={candidate}
            disabled={atLimit || available.length === 0}
            onChange={(event) => setCandidate(event.currentTarget.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50"
          >
            <option value="">Choose a value</option>
            {available.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label || humanize(option.id)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!candidate || atLimit}
            onClick={() => addValue(candidate)}
            className="rounded-lg border border-amber-400/70 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`generic-trait-${definition.traitId}`}
            type="text"
            value={customValue}
            disabled={atLimit}
            onChange={(event) => setCustomValue(event.currentTarget.value)}
            placeholder="Enter a value"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!customValue.trim() || atLimit}
            onClick={() => addValue(customValue)}
            className="rounded-lg border border-amber-400/70 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      {definition.maxItems !== undefined && (
        <p className="text-xs text-neutral-400">
          {selected.length} of {definition.maxItems} selected
        </p>
      )}
    </div>
  );
}

function CompoundListEditor({ definition, value, onCommit }: TraitFieldProps) {
  const serialized = JSON.stringify(Array.isArray(value) ? value : [], null, 2);
  const [draft, setDraft] = useState(serialized);
  const [parseError, setParseError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(serialized);
    setParseError(null);
  }, [serialized]);

  return (
    <div className="space-y-2">
      <textarea
        id={`generic-trait-${definition.traitId}`}
        value={draft}
        rows={6}
        spellCheck={false}
        onChange={(event) => setDraft(event.currentTarget.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-neutral-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
      />
      <button
        type="button"
        onClick={() => {
          try {
            const parsed = JSON.parse(draft) as unknown;
            if (!Array.isArray(parsed)) throw new Error("Enter a JSON array.");
            onCommit(parsed);
            setParseError(null);
          } catch (error) {
            setParseError(errorMessage(error));
          }
        }}
        className="rounded-lg border border-amber-400/70 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100"
      >
        Apply JSON
      </button>
      {parseError && (
        <p role="alert" className="text-xs text-red-300">
          {parseError}
        </p>
      )}
    </div>
  );
}

function GenericTraitField({
  definition,
  params,
  onParamsChange,
}: {
  definition: TraitEditorDefinition;
  params: CatParams;
  onParamsChange: GenericTraitEditorsProps["onParamsChange"];
}) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const value = getBuilderTraitValue(params, definition.traitId);
  const commit = (nextValue: unknown) => {
    try {
      const next = setBuilderTraitValue(params, definition.traitId, nextValue);
      onParamsChange(next, definition);
      setValidationError(null);
    } catch (error) {
      setValidationError(errorMessage(error));
    }
  };
  const clear = () => {
    try {
      const next = clearBuilderTraitValue(params, definition.traitId);
      onParamsChange(next, definition);
      setValidationError(null);
    } catch (error) {
      setValidationError(errorMessage(error));
    }
  };
  const editorProps: TraitFieldProps = {
    definition,
    value,
    onCommit: commit,
    onClear: clear,
  };

  return (
    <fieldset className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
      <legend className="px-1 text-sm font-semibold text-white">
        {definition.label}
      </legend>
      {definition.description && (
        <p className="mb-3 text-xs leading-5 text-neutral-400">
          {definition.description}
        </p>
      )}
      {definition.kind === "toggle" && <ToggleEditor {...editorProps} />}
      {definition.kind === "select" && <SelectEditor {...editorProps} />}
      {definition.kind === "list" && <ListEditor {...editorProps} />}
      {definition.kind === "compoundList" && (
        <CompoundListEditor {...editorProps} />
      )}
      {validationError && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {validationError}
        </p>
      )}
    </fieldset>
  );
}

export function GenericTraitEditors({
  definitions,
  params,
  onParamsChange,
}: GenericTraitEditorsProps) {
  if (definitions.length === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {definitions.map((definition) => (
        <GenericTraitField
          key={definition.traitId}
          definition={definition}
          params={params}
          onParamsChange={onParamsChange}
        />
      ))}
    </div>
  );
}
