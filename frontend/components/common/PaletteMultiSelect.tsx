'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import DownChevron from '@/components/ui/down-chevron';
import XIcon from '@/components/ui/x-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import PaintIcon from '@/components/ui/paint-icon';
import { usePaletteOptions, type PaletteOption } from './usePaletteOptions';
import type { PaletteId } from '@/lib/palettes';

interface PaletteMultiSelectProps {
  selected: Set<PaletteId>;
  onChange: (selected: Set<PaletteId>) => void;
  includeClassic?: boolean;
  onClassicChange?: (include: boolean) => void;
  showSearch?: boolean;
  className?: string;
  compact?: boolean;
}

function ColorSwatch({ colors }: { colors: Array<[number, number, number]> }) {
  return (
    <div className="flex gap-0.5">
      {colors.map((rgb) => (
        <div
          key={`${rgb[0]}-${rgb[1]}-${rgb[2]}`}
          className="size-3 rounded-sm"
          style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
        />
      ))}
    </div>
  );
}

export function PaletteMultiSelect({
  selected,
  onChange,
  includeClassic = true,
  onClassicChange,
  showSearch = true,
  className = '',
  compact = false,
}: PaletteMultiSelectProps) {
  const options = usePaletteOptions();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.description?.toLowerCase().includes(lower)
    );
  }, [options, search]);

  // Count selected (not including 'classic' which is tracked separately)
  const selectedCount = selected.size;
  const allSelected = selectedCount === options.length;

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      });
      // Focus search input when opening
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = useCallback(
    (id: PaletteId) => {
      const newSelected = new Set(selected);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      onChange(newSelected);
    },
    [selected, onChange]
  );

  const toggleAll = useCallback(() => {
    if (allSelected) {
      // Deselect all
      onChange(new Set());
    } else {
      // Select all
      const allIds = new Set(options.map((o) => o.id));
      onChange(allIds);
    }
  }, [allSelected, options, onChange]);

  const removeOption = useCallback(
    (id: PaletteId, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSelected = new Set(selected);
      newSelected.delete(id);
      onChange(newSelected);
    },
    [selected, onChange]
  );

  // Generate display text
  const displayText = useMemo(() => {
    const parts: string[] = [];
    if (includeClassic) parts.push('Classic');
    if (allSelected && selectedCount > 0) {
      parts.push(`All Additional (${selectedCount})`);
    } else if (selectedCount > 0) {
      parts.push(`${selectedCount} palette${selectedCount === 1 ? '' : 's'}`);
    }
    if (parts.length === 0) return 'None selected';
    return parts.join(' + ');
  }, [includeClassic, selectedCount, allSelected]);

  return (
    <>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-left text-sm transition hover:border-border ${className}`}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <PaintIcon size={16} className="text-muted-foreground" />
          {compact ? (
            <span className="text-foreground">{displayText}</span>
          ) : (
            <>
              {includeClassic && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  Classic
                </span>
              )}
              {selected.size > 0 && (
                <>
                  {Array.from(selected)
                    .slice(0, 3)
                    .map((id) => {
                      const opt = options.find((o) => o.id === id);
                      return (
                        <span
                          key={id}
                          className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-foreground"
                        >
                          {opt?.label ?? id}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => removeOption(id, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                removeOption(id, e as unknown as React.MouseEvent);
                              }
                            }}
                            className="cursor-pointer rounded-full hover:bg-primary/30"
                          >
                            <XIcon size={12} />
                          </span>
                        </span>
                      );
                    })}
                  {selected.size > 3 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      +{selected.size - 3} more
                    </span>
                  )}
                </>
              )}
              {!includeClassic && selected.size === 0 && (
                <span className="text-muted-foreground">Select palettes...</span>
              )}
            </>
          )}
        </div>
        <DownChevron
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown via portal */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed overflow-hidden rounded-lg border border-border/50 bg-card shadow-xl"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: 400,
              zIndex: 9999,
            }}
          >
            {/* Search input */}
            {showSearch && (
              <div className="border-b border-border/30 p-2">
                <div className="relative">
                  <MagnifierIcon size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search palettes..."
                    className="w-full rounded-md border border-border/40 bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            )}

            {/* Options list */}
            <div className="max-h-[320px] overflow-y-auto p-1">
              {/* Classic option (if handler provided) */}
              {onClassicChange && (
                <button
                  type="button"
                  onClick={() => onClassicChange(!includeClassic)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted"
                >
                  <div
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      includeClassic
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {includeClassic && <CheckedIcon size={12} />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Classic</div>
                    <div className="text-xs text-muted-foreground">
                      Original 19 ClanGen base colors
                    </div>
                  </div>
                </button>
              )}

              {/* Divider */}
              {onClassicChange && <div className="my-1 border-t border-border/30" />}

              {/* Select All option */}
              <button
                type="button"
                onClick={toggleAll}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted"
              >
                <div
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    allSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : selectedCount > 0
                        ? 'border-primary/50 bg-primary/20'
                        : 'border-border bg-background'
                  }`}
                >
                  {allSelected && <CheckedIcon size={12} />}
                  {!allSelected && selectedCount > 0 && (
                    <div className="size-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">All Additional Palettes</div>
                  <div className="text-xs text-muted-foreground">
                    {options.length} themed color palettes
                  </div>
                </div>
              </button>

              {/* Divider */}
              <div className="my-1 border-t border-border/30" />

              {/* Individual palettes */}
              {filteredOptions.map((opt) => {
                const isSelected = selected.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted"
                  >
                    <div
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background'
                      }`}
                    >
                      {isSelected && <CheckedIcon size={12} />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{opt.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          ({opt.colorCount})
                        </span>
                      </div>
                      {opt.description && (
                        <div className="truncate text-xs text-muted-foreground">
                          {opt.description}
                        </div>
                      )}
                    </div>
                    <ColorSwatch colors={opt.previewColors} />
                  </button>
                );
              })}

              {filteredOptions.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No palettes match &quot;{search}&quot;
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
