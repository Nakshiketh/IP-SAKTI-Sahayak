/**
 * Feature flags for the upgrade phases.
 *
 * Declared in Phase 0 so later phases can hide work in progress behind a flag
 * rather than deleting reusable code. A phase that starts using a flag must
 * also state, in docs/upgrade/PROGRESS.md, what changes when it is turned on.
 *
 * `juryDemo` and `voice` are true: both are finished and tested, and a finished
 * feature left switched off is indistinguishable from one that was never built.
 * The three that remain false have no interface yet — turning them on would
 * change nothing a reader could see, which is worse than leaving them off,
 * because it suggests there is something to look for.
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
  juryDemo: true,
  voice: true,
  helplineSim: false,
  documentIntel: true,
  adminInsights: true,
  scanBadgeLogin: true,
  publicAsk: false,
};
