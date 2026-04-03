"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SingleCatPortableSettings } from "@/lib/portable-settings";
import { encodePortableSettings } from "@/lib/portable-settings";
import { cn } from "@/lib/utils";
import type {
  AfterlifeOption,
  ExtendedMode,
  LayerRange,
} from "@/utils/singleCatVariants";
import { DEFAULT_SINGLE_CAT_SETTINGS } from "@/utils/singleCatVariants";
import { AccessoriesStep } from "./wizard-steps/AccessoriesStep";
import { AfterlifeStep } from "./wizard-steps/AfterlifeStep";
import { PalettesStep } from "./wizard-steps/PalettesStep";
import { ScarsStep } from "./wizard-steps/ScarsStep";
import { SummaryStep } from "./wizard-steps/SummaryStep";
import { TortieStep } from "./wizard-steps/TortieStep";
import type { WizardStepProps } from "./wizard-steps/types";
import { WIZARD_STEPS } from "./wizard-steps/types";
import { WelcomeStep } from "./wizard-steps/WelcomeStep";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: SingleCatPortableSettings = {
  accessoryRange: { ...DEFAULT_SINGLE_CAT_SETTINGS.accessoryRange },
  scarRange: { ...DEFAULT_SINGLE_CAT_SETTINGS.scarRange },
  tortieRange: { ...DEFAULT_SINGLE_CAT_SETTINGS.tortieRange },
  exactLayerCounts: DEFAULT_SINGLE_CAT_SETTINGS.exactLayerCounts,
  afterlifeMode: DEFAULT_SINGLE_CAT_SETTINGS.afterlifeMode,
  includeBaseColours: DEFAULT_SINGLE_CAT_SETTINGS.includeBaseColours,
  extendedModes: [...DEFAULT_SINGLE_CAT_SETTINGS.extendedModes],
};

// ---------------------------------------------------------------------------
// Step components array (indexed by step number)
// ---------------------------------------------------------------------------

const STEP_COMPONENTS: React.ComponentType<WizardStepProps>[] = [
  WelcomeStep,
  AccessoriesStep,
  ScarsStep,
  TortieStep,
  AfterlifeStep,
  PalettesStep,
  SummaryStep,
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GuidedSettingsWizardProps {
  initialSettings: SingleCatPortableSettings | null;
  hasInitialCode: boolean;
}

export function GuidedSettingsWizard({
  initialSettings,
  hasInitialCode,
}: GuidedSettingsWizardProps) {
  const init = initialSettings ?? DEFAULTS;

  // ─── Settings state ───
  const [accessoryRange, setAccessoryRange] = useState<LayerRange>(
    init.accessoryRange,
  );
  const [scarRange, setScarRange] = useState<LayerRange>(init.scarRange);
  const [tortieRange, setTortieRange] = useState<LayerRange>(init.tortieRange);
  const [exactLayerCounts] = useState(init.exactLayerCounts);
  const [afterlifeMode, setAfterlifeMode] = useState<AfterlifeOption>(
    init.afterlifeMode,
  );
  const [includeBaseColours, setIncludeBaseColours] = useState(
    init.includeBaseColours,
  );
  const [extendedModes, setExtendedModes] = useState<ExtendedMode[]>(
    init.extendedModes,
  );

  // ─── Navigation state ───
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // ─── Derived values ───
  const currentSettings = useMemo<SingleCatPortableSettings>(
    () => ({
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      includeBaseColours,
      extendedModes,
    }),
    [
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      includeBaseColours,
      extendedModes,
    ],
  );

  const liveCode = useMemo(
    () => encodePortableSettings(currentSettings),
    [currentSettings],
  );

  // Sync URL with live code whenever settings change (replaceState to avoid history bloat)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("code", liveCode);
    window.history.replaceState(null, "", url.toString());
  }, [liveCode]);

  // ─── Navigation handlers ───
  const goNext = useCallback(() => {
    setActiveStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setActiveStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < WIZARD_STEPS.length) {
      setActiveStepIndex(index);
    }
  }, []);

  // ─── Build step props ───
  const stepProps: WizardStepProps = {
    settings: currentSettings,
    setAccessoryRange,
    setScarRange,
    setTortieRange,
    setAfterlifeMode,
    setIncludeBaseColours,
    setExtendedModes,
    onNext: goNext,
    onBack: goBack,
    hasInitialCode,
    liveCode,
  };

  const StepComponent = STEP_COMPONENTS[activeStepIndex];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* ─── Sidebar (desktop) / Top dots (mobile) ─── */}
      <nav className="shrink-0 lg:w-52" aria-label="Wizard steps">
        {/* Mobile: horizontal step dots */}
        <div className="flex items-center justify-center gap-2 lg:hidden">
          {WIZARD_STEPS.map((step, i) => (
            <button
              key={step.label}
              type="button"
              onClick={() => goToStep(i)}
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition",
                i === activeStepIndex
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : i < activeStepIndex
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/30 text-muted-foreground/50 hover:text-muted-foreground",
              )}
              aria-current={i === activeStepIndex ? "step" : undefined}
              title={step.label}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Mobile: current step name */}
        <p className="mt-2 text-center text-xs text-muted-foreground/70 lg:hidden">
          Step {activeStepIndex + 1}: {WIZARD_STEPS[activeStepIndex]?.label}
        </p>

        {/* Desktop: vertical step pills */}
        <div className="hidden lg:block lg:sticky lg:top-24">
          <div className="space-y-1">
            {WIZARD_STEPS.map((step, i) => (
              <button
                key={step.label}
                type="button"
                onClick={() => goToStep(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  i === activeStepIndex
                    ? "bg-primary/10 font-semibold text-foreground"
                    : i < activeStepIndex
                      ? "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                      : "text-muted-foreground/50 hover:text-muted-foreground",
                )}
                aria-current={i === activeStepIndex ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    i === activeStepIndex
                      ? "bg-primary text-primary-foreground"
                      : i < activeStepIndex
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/30 text-muted-foreground/50",
                  )}
                >
                  {i < activeStepIndex ? (
                    <svg
                      aria-hidden="true"
                      className="size-3.5"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M3 6l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span>{step.label}</span>
              </button>
            ))}
          </div>

          {/* Live code preview in sidebar */}
          {activeStepIndex > 0 && (
            <div className="mt-6 rounded-lg border border-border/30 bg-background/40 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                Current Code
              </div>
              <code className="mt-1 block break-all font-mono text-xs text-foreground/80">
                {liveCode}
              </code>
            </div>
          )}
        </div>
      </nav>

      {/* ─── Main content ─── */}
      <div className="min-w-0 flex-1">
        {StepComponent && <StepComponent {...stepProps} />}
      </div>
    </div>
  );
}
