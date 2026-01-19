"use client";

import { useCallback, useState, useEffect, useRef, useId } from "react";

interface SliderWithInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  description?: string;
}

export function SliderWithInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  description,
}: SliderWithInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueOnFocusRef = useRef<number>(value);
  const inputId = useId();
  const sliderId = useId();
  const labelId = useId();

  // Sync input value when external value changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional sync of controlled input
      setInputValue(String(value));
    }
  }, [value, isEditing]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      // Clamp and snap to step
      const clamped = Math.max(min, Math.min(max, parsed));
      const snapped = Math.round(clamped / step) * step;
      onChange(snapped);
      setInputValue(String(snapped));
    } else {
      setInputValue(String(value));
    }
  }, [inputValue, min, max, step, onChange, value]);

  const handleInputFocus = useCallback(() => {
    setIsEditing(true);
    valueOnFocusRef.current = value;
    // Select all text on focus for easy replacement
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      // Restore the value from when focus started
      setInputValue(String(valueOnFocusRef.current));
      setIsEditing(false);
      inputRef.current?.blur();
    }
  }, []);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label id={labelId} htmlFor={inputId} className="text-sm text-muted-foreground">{label}</label>
        <div className="flex items-center gap-1">
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            aria-labelledby={labelId}
            className="w-14 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-right text-sm font-medium tabular-nums transition-colors focus:border-amber-500 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      <input
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        aria-labelledby={labelId}
        className="slider-amber w-full"
      />
      {description && (
        <p className="text-xs text-muted-foreground/70">{description}</p>
      )}
    </div>
  );
}
