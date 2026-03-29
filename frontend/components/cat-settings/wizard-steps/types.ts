import type { SingleCatPortableSettings } from "@/lib/portable-settings";
import type { AfterlifeOption, ExtendedMode, LayerRange } from "@/utils/singleCatVariants";

/**
 * Props shared by every wizard step component.
 *
 * The orchestrator (GuidedSettingsWizard) owns all state and passes granular
 * setters so each step can update only the fields it cares about.
 */
export interface WizardStepProps {
  // Current settings (read-only snapshot)
  settings: SingleCatPortableSettings;

  // Granular setters
  setAccessoryRange: (range: LayerRange) => void;
  setScarRange: (range: LayerRange) => void;
  setTortieRange: (range: LayerRange) => void;
  setAfterlifeMode: (mode: AfterlifeOption) => void;
  setIncludeBaseColours: (include: boolean) => void;
  setExtendedModes: (modes: ExtendedMode[]) => void;

  // Navigation
  onNext: () => void;
  onBack: () => void;

  // Whether a ?code= param was provided on initial load
  hasInitialCode: boolean;

  // Live settings code (for summary step)
  liveCode: string;
}

/** Metadata for rendering the step sidebar / dots */
export interface StepMeta {
  label: string;
  shortLabel: string;
}

export const WIZARD_STEPS: StepMeta[] = [
  { label: "Welcome", shortLabel: "Start" },
  { label: "Accessories", shortLabel: "Acc" },
  { label: "Scars", shortLabel: "Scar" },
  { label: "Tortie Layers", shortLabel: "Tort" },
  { label: "Afterlife", shortLabel: "After" },
  { label: "Colour Palettes", shortLabel: "Color" },
  { label: "Summary", shortLabel: "Done" },
];
