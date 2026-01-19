'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, Palette } from 'lucide-react';
import { usePaletteOptions } from './usePaletteOptions';

// PaletteMode is 'off' (classic) or one of the additional palette IDs
export type PaletteMode = 'off' | 'mood' | 'bold' | 'darker' | 'blackout' | 'mononoke' | 'howl' | 'demonslayer' | 'titanic' | 'deathnote' | 'slime' | 'ghostintheshell' | 'mushishi' | 'chisweethome' | 'fma';

interface PaletteSingleSelectProps {
  value: PaletteMode;
  onChange: (value: PaletteMode) => void;
  showSearch?: boolean;
  className?: string;
  label?: string;
}

function ColorSwatch({ colors }: { colors: Array<[number, number, number]> }) {
  return (
    <div className="flex gap-0.5">
      {colors.map((rgb, i) => (
        <div
          key={i}
          className="size-3 rounded-sm"
          style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
        />
      ))}
    </div>
  );
}

export function PaletteSingleSelect({
  value,
  onChange,
  showSearch = true,
  className = '',
  label,
}: PaletteSingleSelectProps) {
  const additionalOptions = usePaletteOptions();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Build full options list with Classic first
  const allOptions = useMemo(() => {
    return [
      {
        id: 'off' as PaletteMode,
        label: 'Classic',
        description: 'Original 19 ClanGen base colors',
        colorCount: 19,
        previewColors: [] as Array<[number, number, number]>,
      },
      ...additionalOptions.map(opt => ({
        ...opt,
        id: opt.id as PaletteMode,
      })),
    ];
  }, [additionalOptions]);

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return allOptions;
    const lower = search.toLowerCase();
    return allOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.description?.toLowerCase().includes(lower)
    );
  }, [allOptions, search]);

  // Get currently selected option
  const selectedOption = useMemo(() => {
    return allOptions.find(opt => opt.id === value) ?? allOptions[0];
  }, [allOptions, value]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const dropdownHeight = 360;

      // Position above if not enough space below
      const top = spaceBelow < dropdownHeight && rect.top > dropdownHeight
        ? rect.top - dropdownHeight - 4
        : rect.bottom + 4;

      setDropdownPosition({
        top,
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

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectOption = useCallback(
    (id: PaletteMode) => {
      onChange(id);
      setIsOpen(false);
      setSearch('');
    },
    [onChange]
  );

  return (
    <>
      {/* Label if provided */}
      {label && (
        <span className="mr-2 text-sm font-semibold text-neutral-300">{label}</span>
      )}

      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex min-h-[36px] items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-1.5 text-left text-sm transition hover:border-slate-600 ${className}`}
      >
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-slate-400" />
          <span className="font-medium text-slate-100">{selectedOption.label}</span>
          {selectedOption.previewColors.length > 0 && (
            <ColorSwatch colors={selectedOption.previewColors} />
          )}
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown via portal */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900 shadow-xl"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: 360,
              zIndex: 9999,
            }}
          >
            {/* Search input */}
            {showSearch && (
              <div className="border-b border-slate-700/30 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search palettes..."
                    className="w-full rounded-md border border-slate-700/40 bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/50"
                  />
                </div>
              </div>
            )}

            {/* Options list */}
            <div className="max-h-[300px] overflow-y-auto p-1">
              {filteredOptions.map((opt) => {
                const isSelected = value === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => selectOption(opt.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-slate-800 ${
                      isSelected ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    <div
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500 text-slate-900'
                          : 'border-slate-600 bg-slate-800'
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm font-medium ${isSelected ? 'text-amber-100' : 'text-slate-100'}`}>
                          {opt.label}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          ({opt.colorCount})
                        </span>
                      </div>
                      {opt.description && (
                        <div className="truncate text-xs text-slate-400">
                          {opt.description}
                        </div>
                      )}
                    </div>
                    {opt.previewColors.length > 0 && (
                      <ColorSwatch colors={opt.previewColors} />
                    )}
                  </button>
                );
              })}

              {filteredOptions.length === 0 && (
                <div className="py-4 text-center text-sm text-slate-500">
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
