import posthog from "posthog-js";

// ============================================================================
// Event Type Definitions
// ============================================================================

// Cat Generation & Builders
type SingleCatGeneratedProps = {
  mode: "flashy" | "calm";
  accessories: boolean;
  scars: boolean;
  torties: boolean;
  afterlife: boolean;
  speed: number;
};

type SingleCatModeChangedProps = {
  mode: "flashy" | "calm";
};

type SingleCatExportedProps = {
  format: string;
};

type VisualBuilderTraitSelectedProps = {
  trait_type: string;
  value: string;
};

type VisualBuilderAccessoryProps = {
  accessory: string;
};

type VisualBuilderExportedProps = {
  format: string;
};

type VisualBuilderOpenedProps = {
  from_share: boolean;
};

type GuidedBuilderStepCompletedProps = {
  step_name: string;
  step_number: number;
};

type GuidedBuilderResetProps = {
  at_step: number;
};

type GuidedBuilderCompletedProps = {
  has_name: boolean;
  has_creator: boolean;
};

// Adoption Generator
type AdoptionRoundStartedProps = {
  cat_count: number;
  round_number: number;
};

type AdoptionCatActionProps = {
  round_number: number;
};

type AdoptionFinalizedProps = {
  cat_count: number;
  total_rounds: number;
};

type AdoptionSharedProps = {
  cat_count: number;
};

// Wheel
type WheelSpinCompletedProps = {
  prize_name: string;
  was_forced: boolean;
};

// Catdex
type CatdexSearchedProps = {
  query_type: "text" | "number_range";
};

type CatdexFilteredProps = {
  filter_type: string;
  value: string;
};

type CatdexSortedProps = {
  sort_by: string;
  direction: "asc" | "desc";
};

type CatdexCardViewedProps = {
  card_number: number;
  season: string;
  rarity: string;
};

type CatdexImageVariantToggledProps = {
  variant: "default" | "custom";
};

type CatdexCardSubmittedProps = {
  season: string;
  rarity: string;
  has_custom_art: boolean;
};

type CatdexMassUploadSubmittedProps = {
  card_count: number;
};

// Coinflip
type CoinflipCallMadeProps = {
  call: "heads" | "tails";
};

type CoinflipWonProps = {
  streak: number;
};

type CoinflipLostProps = {
  final_streak: number;
};

type CoinflipScoreSubmittedProps = {
  score: number;
  name_length: number;
};

// Perfect Cat Finder
type PerfectCatInspectedProps = {
  from: "matchup" | "leaderboard";
};

// Palette Tools
type PaletteSpinnerRangeChangedProps = {
  range_type: string;
};

type PaletteCreatorExportedProps = {
  format: string;
};

// Ancestry Tree
type AncestryTreeCreatedProps = {
  method: "random" | "history";
};

type AncestryParentsSelectedProps = {
  source: string;
};

type AncestryOffspringGeneratedProps = {
  count: number;
  generation: number;
};

type AncestryCatEditedProps = {
  edit_type: string;
};

type AncestryTreeSavedProps = {
  has_name: boolean;
  has_creator: boolean;
};

// Streamer Tools
type StreamSessionCreatedProps = {
  is_host: boolean;
};

type StreamSignupsToggledProps = {
  enabled: boolean;
};

type StreamVotingToggledProps = {
  enabled: boolean;
};

type StreamVoteCastProps = {
  is_streamer: boolean;
};

type StreamSessionFinalizedProps = {
  participant_count: number;
};

// History
type HistoryFilteredProps = {
  filter_type: string;
};

// Navigation & General
type ProjectHubClickedProps = {
  hub: "gacha" | "warrior" | "artist" | "games";
};

type SocialLinkClickedProps = {
  platform: string;
};

type ShareLinkViewedProps = {
  type: string;
};

// ============================================================================
// Event Map
// ============================================================================

type AnalyticsEventMap = {
  // Cat Generation & Builders
  single_cat_generated: SingleCatGeneratedProps;
  single_cat_mode_changed: SingleCatModeChangedProps;
  single_cat_shared: Record<string, never>;
  single_cat_exported: SingleCatExportedProps;
  visual_builder_opened: VisualBuilderOpenedProps;
  visual_builder_trait_selected: VisualBuilderTraitSelectedProps;
  visual_builder_accessory_added: VisualBuilderAccessoryProps;
  visual_builder_accessory_removed: VisualBuilderAccessoryProps;
  visual_builder_exported: VisualBuilderExportedProps;
  visual_builder_shared: Record<string, never>;
  guided_builder_started: Record<string, never>;
  guided_builder_step_completed: GuidedBuilderStepCompletedProps;
  guided_builder_reset: GuidedBuilderResetProps;
  guided_builder_completed: GuidedBuilderCompletedProps;
  guided_builder_exported: Record<string, never>;

  // Adoption Generator
  adoption_round_started: AdoptionRoundStartedProps;
  adoption_cat_kept: AdoptionCatActionProps;
  adoption_cat_discarded: AdoptionCatActionProps;
  adoption_finalized: AdoptionFinalizedProps;
  adoption_shared: AdoptionSharedProps;

  // Wheel
  wheel_spin_started: Record<string, never>;
  wheel_spin_completed: WheelSpinCompletedProps;

  // Catdex
  catdex_searched: CatdexSearchedProps;
  catdex_filtered: CatdexFilteredProps;
  catdex_sorted: CatdexSortedProps;
  catdex_card_viewed: CatdexCardViewedProps;
  catdex_image_variant_toggled: CatdexImageVariantToggledProps;
  catdex_submit_modal_opened: Record<string, never>;
  catdex_card_submitted: CatdexCardSubmittedProps;
  catdex_mass_upload_triggered: Record<string, never>;
  catdex_mass_upload_submitted: CatdexMassUploadSubmittedProps;

  // Coinflip
  coinflip_call_made: CoinflipCallMadeProps;
  coinflip_won: CoinflipWonProps;
  coinflip_lost: CoinflipLostProps;
  coinflip_score_submitted: CoinflipScoreSubmittedProps;
  coinflip_leaderboard_viewed: Record<string, never>;

  // Perfect Cat Finder
  perfect_cat_matchup_loaded: Record<string, never>;
  perfect_cat_vote: Record<string, never>;
  perfect_cat_inspected: PerfectCatInspectedProps;
  perfect_cat_copied: Record<string, never>;
  perfect_cat_downloaded: Record<string, never>;
  perfect_cat_opened_in_builder: Record<string, never>;

  // Palette Tools
  palette_spinner_spun: Record<string, never>;
  palette_spinner_range_changed: PaletteSpinnerRangeChangedProps;
  palette_creator_image_uploaded: Record<string, never>;
  palette_creator_color_picked: Record<string, never>;
  palette_creator_exported: PaletteCreatorExportedProps;
  palette_color_copied: Record<string, never>;

  // Ancestry Tree
  ancestry_tree_created: AncestryTreeCreatedProps;
  ancestry_parents_selected: AncestryParentsSelectedProps;
  ancestry_offspring_generated: AncestryOffspringGeneratedProps;
  ancestry_cat_edited: AncestryCatEditedProps;
  ancestry_tree_saved: AncestryTreeSavedProps;
  ancestry_tree_exported: Record<string, never>;

  // Streamer Tools
  stream_session_created: StreamSessionCreatedProps;
  stream_viewer_link_copied: Record<string, never>;
  stream_signups_toggled: StreamSignupsToggledProps;
  stream_voting_toggled: StreamVotingToggledProps;
  stream_vote_cast: StreamVoteCastProps;
  stream_coinflip_used: Record<string, never>;
  stream_session_finalized: StreamSessionFinalizedProps;
  stream_viewer_joined: Record<string, never>;

  // History & Collections
  history_viewed: Record<string, never>;
  history_item_clicked: Record<string, never>;
  history_item_deleted: Record<string, never>;
  history_searched: Record<string, never>;
  history_filtered: HistoryFilteredProps;

  // Navigation & General
  project_hub_clicked: ProjectHubClickedProps;
  social_link_clicked: SocialLinkClickedProps;
  share_link_viewed: ShareLinkViewedProps;
};

// ============================================================================
// Track Function
// ============================================================================

/**
 * Type-safe analytics tracking function.
 *
 * Call this wherever user interactions occur that we want to measure.
 * See PostHogProvider configuration for environment-specific behavior.
 *
 * @example
 * track("single_cat_generated", { mode: "flashy", accessories: true, ... })
 * track("wheel_spin_started", {})
 */
export function track<K extends keyof AnalyticsEventMap>(
  event: K,
  properties: AnalyticsEventMap[K]
): void {
  try {
    if (typeof posthog?.capture === "function") {
      posthog.capture(event, properties);
    }
  } catch (error) {
    // Analytics failures should never crash the app
    if (process.env.NODE_ENV === "development") {
      console.warn(`[Analytics] Failed to track "${event}":`, error);
    }
  }
}

// Export event types for external use if needed
export type { AnalyticsEventMap };
