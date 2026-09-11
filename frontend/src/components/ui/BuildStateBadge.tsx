/**
 * What state a piece of the system is in.
 *
 * Three values, and the distinction between the middle one and the first is what
 * matters: `demo` means the code exists and runs, but on illustrative data rather
 * than on anything retrieved. Collapsing that into "running" is how a model of
 * the system starts lying about itself.
 *
 * This is the type only. It classifies the pipeline stages, the architecture
 * layers and the rules on the sources page, and the tests assert against it —
 * but nothing renders it to a reader any more. A badge reporting how far along
 * the build of a stage is tells a visitor about the project rather than about
 * the subject, and belongs in the repository rather than on the page.
 */
export type BuildState = 'live' | 'demo' | 'planned';
