/**
 * Feature flags for the upgrade phases.
 *
 * Declared in Phase 0 so later phases can hide work in progress behind a flag
 * rather than deleting reusable code. Nothing reads these yet: Phase 0 changes
 * no behaviour. A phase that starts using a flag must also state, in
 * docs/upgrade/PROGRESS.md, what changes when it is turned on.
 *
 * `scanBadgeLogin` is true, which departs from Phase 5's suggested default.
 * The badge scanner is the sign-in the owner uses, and the instruction for this
 * work is that the login page is not to be disturbed. Turning it off is a
 * decision for the owner, not a default. See PROGRESS.md, "Decisions log".
 */
export interface FeatureFlags {
  /** The jury demo panel and its deterministic demo data (Phase 4). */
  juryDemo: boolean;
  /** Voice input and playback inside Ask Sahayak (Phase 8). */
  voice: boolean;
  /** The in-browser helpline simulator (Phase 8). */
  helplineSim: boolean;
  /** Document upload and analysis (Phase 9). */
  documentIntel: boolean;
  /** The Ministry insight dashboard (Phase 9). */
  adminInsights: boolean;
  /** Badge scanning on the sign-in page. On, and staying on. */
  scanBadgeLogin: boolean;
  /** Asking a question without signing in (Phase 5). */
  publicAsk: boolean;
}

export const FEATURES: FeatureFlags = {
  juryDemo: false,
  voice: false,
  helplineSim: false,
  documentIntel: false,
  adminInsights: false,
  scanBadgeLogin: true,
  publicAsk: false,
};
