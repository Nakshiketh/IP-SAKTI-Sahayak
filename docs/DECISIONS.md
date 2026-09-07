# Decisions

Append an entry every phase. Each records what was chosen, what it was chosen over, and why —
so the reasoning survives past the moment it was obvious.

Format: `## [phase] title` · **Decision** · **Alternatives** · **Why** · **Revisit when**.

---

## [0] The domain model is defined twice, and a test enforces that

**Decision.** The model lives in `backend/app/models/domain.py` (Pydantic) and
`frontend/src/types/domain.ts` (TypeScript). Neither generates the other. Both are checked
against `schemas/domain.schema.json`, which *is* generated, from the Pydantic side, by
`scripts/gen_schema.py`. Two tests close the loop: `backend/tests/test_schema_drift.py` fails if
the checked-in schema is stale, and `frontend/src/types/domain.test.ts` fails if the TypeScript
constants no longer match it.

**Alternatives.** Generate TypeScript from the schema at build time
(`json-schema-to-typescript`); or use a codegen tool over the OpenAPI document.

**Why.** Generated types are read-only artefacts — you cannot attach the domain comments that
carry the product rules ("registry data is evidence, never authority"), and a build step that
must run before typecheck is a step that gets skipped. Hand-written types with a failing test are
as safe and stay readable. The test was verified by injecting a drift into the Python enum and
confirming both suites go red.

**Revisit when.** The model grows past roughly thirty types, or a third consumer appears.

---

## [0] `Record.citable_in_answers` is typed `Literal[False]`, not `bool`

**Decision.** The field cannot hold `True`. Constructing a `Record` with `citable_in_answers=True`
is a validation error; the generated schema carries `"const": false`; the TypeScript field is
typed `false`, so a record cannot be passed where a `Citation` is expected.

**Alternatives.** A `bool` defaulting to `False`, with the rule enforced in the orchestrator.

**Why.** Product rule 7 says registry data is never authority. A rule enforced only in
orchestration code is one refactor away from being lost. Typing it out of existence means the rule
holds even in code nobody has written yet. This is the same reasoning Phase 12 applies when it
says "enforce in code, not in a prompt".

**Revisit when.** Never, unless the two-layer distinction itself changes.

---

## [0] `abstain_reason` is an enum; the four abstention states are typed

**Decision.** `AbstainReason` enumerates `nothing_relevant`, `out_of_scope`, `sources_conflict`,
`sources_out_of_date`, `needs_more_facts`. The build document lists `abstain_reason` untyped;
Phase 8 specifies four distinct abstention states with different UI and different user offers.

**Alternatives.** A free-text string.

**Why.** Phase 13 measures abstention precision and recall. You cannot score a free-text field,
and the four states each need a different surface. `sources_conflict` and `sources_out_of_date`
are split because Phase 8 state 3 covers both and they read differently to a user.

**Revisit when.** Phase 8, if a fifth state appears in practice.

---

## [0] Python 3.11 in a committed-recipe virtualenv; no lockfile yet

**Decision.** `backend/.venv` built with Python 3.11.9. Dependency ranges live in
`backend/pyproject.toml`; frontend versions in `frontend/package.json` with `package-lock.json`
committed.

**Alternatives.** Poetry or uv with a Python lockfile; Docker from Phase 0.

**Why.** The build document names Python 3.11 and the retrieval stack (FAISS, sentence
transformers) has the fewest surprises there. A Python lockfile is worth adding at Phase 11 when
the dependency set stops being four packages and starts including native wheels.

**Revisit when.** Phase 11, when the ingestion dependencies land.

---

## [0] `make` targets for unbuilt phases fail loudly rather than no-op

**Decision.** `make ingest`, `make ingest-records` and `make evals` print which phase builds them
and exit non-zero.

**Alternatives.** Omit the targets until the phase; or have them succeed silently.

**Why.** A target that exits 0 having done nothing is indistinguishable from a working pipeline in
CI, and eventually someone demos on the strength of it. The same principle as abstention: say
plainly that there is nothing here.

**Revisit when.** Phases 11, 12 and 13 respectively.

---

## [0] GNU make is not installed on the development machine

**Decision.** The `Makefile` is authoritative. `make.ps1` mirrors every target for Windows
machines without make, and is what was actually used to verify Phase 0.

**Alternatives.** Require make via winget/chocolatey; use npm scripts as the top-level runner.

**Why.** The build document specifies a Makefile and CI will have make. Requiring a toolchain
install before the first test run is friction for no gain when a fifty-line script does the job.
Both files must be updated together — if they drift, the Makefile wins.

**Revisit when.** CI is set up, or the target list grows enough that keeping two runners in sync
becomes the larger cost.

---

## [1] `--sap` is not a text colour, and the system says so out loud

**Decision.** `--sap` on `--bone` measures 4.45:1 — under the 4.5:1 WCAG AA needs for body
text, over the 3:1 it needs as a user-interface colour. So sap draws interactive states, borders,
success marks and graphical objects, and never a paragraph or a label. In `ConfidenceMeter` this
splits the component's colour in two: the ticks carry the level (sap at "moderate"), the words stay
in `--ink`.

**Alternatives.** Darken the token; use sap as text anyway at 4.45; only use sap at large sizes.

**Why.** The palette is specified in the build document and is not mine to redefine over 0.05 of a
contrast point. The honest move is to bound where the colour may be used and encode the bound. An
axe pass in a real browser found exactly one violation on the specimen page — `.text-sap` — which is
the same finding `src/styles/contrast.test.ts` had already predicted from the token file.

**Revisit when.** Never, unless the palette changes.

---

## [1] `--rule-strong` was raised from 0.34 to 0.50 alpha

**Decision.** The token that draws the dashed "illustrative" edge and the incised category lines now
clears 3:1 against the page (3.32:1). `--rule` and `--rule-faint` stay faint.

**Alternatives.** Leave it at 0.34 and treat every hairline as decorative.

**Why.** WCAG 1.4.11 applies to boundaries that carry information, and these do: the dashed rule is
the only thing saying a passage is not from a source. `--rule` separates things that are already
distinguishable another way, so it does not need the same weight. The distinction between a line
that means something and a line that merely divides is now in the token names.

**Revisit when.** A third class of line appears.

---

## [1] `Tabs` takes an `idBase` instead of minting one

**Decision.** `Tabs` and `TabPanel` both require the caller's `idBase`.

**Alternatives.** `useId()` inside `Tabs`, which is what it did first.

**Why.** A `Tabs` that generates its own id cannot tell its panels what that id was, so
`aria-controls` and `aria-labelledby` pointed at elements that did not exist. Nothing visible broke;
axe caught it as `aria-valid-attr-value`. Making the id an input makes the association impossible to
get wrong silently.

**Revisit when.** A compound-component API with context replaces the flat one.

---

## [1] Heading level is a prop, not a hardcoded tag

**Decision.** `Callout` and `RecordCard` take `titleLevel`, defaulting to 3, via a small `Heading`
component. Visual size comes from a class; document level comes from where the component sits.

**Alternatives.** Hardcode `h4`, which is what they did first and what axe flagged as
`heading-order`.

**Why.** A component that hardcodes its heading level produces a broken outline the moment it is
reused one level up or down, and a broken outline is how a screen-reader user loses the shape of a
page. This is the sort of thing that is nearly free to fix now and expensive to retrofit across
eight pages.

**Revisit when.** Never.

---

## [1] Fonts are self-hosted and imported per script; per-locale preload is deferred

**Decision.** Tiro (display) and IBM Plex Sans with Noto Sans (body) are installed from
`@fontsource` and imported one script subset at a time, so an English reader never downloads Telugu
outlines. Each `:lang()` block names a fallback for that same script, so the swap fallback for a
Telugu heading is a Telugu-capable system face rather than Latin.

**Not done:** per-locale `<link rel="preload">`.

**Why the deferral.** The preload has to name the file for the *active* locale, and the active
locale is not known until the i18n layer exists. Adding a preload now would either preload the wrong
script or preload all six, which is worse than none. It lands in Phase 2 with the language selector.
Recorded here rather than left implicit so the honesty audit has something to check it against.

**Revisit when.** Phase 2.

---

## [2] An ESLint rule enforces "no hard-coded user-facing strings"

**Decision.** `i18next/no-literal-string` runs over `src/**/*.tsx` in `jsx-only` mode, covering JSX
text and the attributes a reader can perceive (`alt`, `aria-label`, `placeholder`, `title`). Two
exclusions: the `/design` specimen, which is a development surface not registered in a production
build, and test files.

**Alternatives.** Review discipline; a pre-commit grep.

**Why.** The sixth language stops being a real translation the first time someone types a word
straight into JSX, and nobody notices, because the person who typed it reads English. The rule was
verified by injecting a literal heading and an `alt` attribute and confirming both were reported.

**Revisit when.** The exclusion list grows past those two entries — that would mean it is being used
to avoid the rule rather than to scope it.

---

## [2] Some copy belongs to a component, not to its caller

**Decision.** `RecordCard` owns the "filed or granted record — not a statement of law" label and
`ConfidenceMeter` owns the four level names. Both read them from the `common` namespace themselves
rather than taking them as props.

**Alternatives.** Pass them in, which is the usual way to keep a primitive presentational.

**Why.** These strings state product rules. A prop can be omitted, or passed something else; a
string the component fetches itself cannot. It is the same reasoning as typing `citable_in_answers`
as `Literal[False]` — put the rule where it cannot be routed around. The cost is that two primitives
now depend on i18n, which is why the test setup initialises it.

**Revisit when.** A caller has a legitimate need to vary one of these, which would mean the rule
itself has changed.

---

## [2] The footer says "no sources indexed yet" rather than "0 documents"

**Decision.** The source line reads `/api/v1/corpus-version` through `useCorpusStatus`. With zero
documents it renders "No sources indexed yet · v{version}"; when the API cannot be reached it says
the information is unavailable. The specified "Sources as of {date} · {n} documents · v{version}"
form is used once there is a corpus.

**Alternatives.** Render the specified string with a zero in it; or bake a build-time constant.

**Why.** "0 documents" presents a count as though a count were the fact, when the fact is that
nothing has been ingested. And a baked constant would duplicate the value the backend already owns,
which is precisely how a footer ends up stating something that stopped being true. The unavailable
case follows the same rule the answer surface follows: say you do not know rather than guess.

**Revisit when.** Phase 11, when a corpus exists and the first branch starts being used.

---

## [2] The mobile menu contributes no `nav` landmark

**Decision.** The links inside the mobile dialog sit in a plain `<ul>`, not a second `<nav>`.

**Alternatives.** A second `<nav>` with the same "Main" label, or with a different one.

**Why.** Both navigations are in the DOM at once — they are separated by CSS breakpoints, not by
rendering — so a `<nav aria-label="Main">` in each produced two landmarks with one name, which axe
reports as `landmark-unique` and which a screen-reader user has to disambiguate for no reason. The
dialog is already named "Menu" and traps focus, which is what a reader on a phone needs.

**Revisit when.** The two navigations stop coexisting in the DOM.

---

## [2] Locale files are seeded with English and flagged, never machine-translated

**Decision.** `node scripts/i18n-seed.ts` copies the English string into every other locale and sets
`__untranslated: true` on the file. Coverage currently reports 0% for hi, te, ta, bn and mr, and
`scripts/i18n-coverage.ts` prints that table.

**Alternatives.** Machine-translate the interface copy now so the demo shows six working languages.

**Why.** This product's whole claim is that it does not assert what it cannot support. Shipping an
unreviewed machine translation of "It does not provide legal advice, grant intellectual-property
rights, approve products" would be exactly the failure the product exists to avoid — in the one
sentence where it matters most. The seeded English is visibly a placeholder, and the coverage table
says so in a number.

**Revisit when.** A speaker of each language reviews a translation, at which point the flag comes off
that file.

---

## [3] `AnswerBlock` gained a `claims` list, and the schema moved

**Decision.** `Claim { text, citation_ids[] }` was added, and `AnswerBlock` now carries
`claims[]` alongside `text` and `citation_ids`. Two Pydantic validators keep them honest: `text`
must equal the claims joined by a space, and the block's `citation_ids` must be the union of its
claims' ids.

**Alternatives.** Keep the Phase 0 shape and carry inline markers inside `text`, parsed at render
time.

**Why.** The build document specifies both a block-level `AnswerBlock` (Phase 0) and claim-level
citation (Phases 3 and 8). Block-level ids cannot express "this sentence rests on a passage and that
one does not", which is the single most important thing an answer conveys. Parsing markers out of
prose was the other option, and Phase 10 rules it out explicitly — structured output, not prose
parsing. `text` is kept because it is what a copy-to-clipboard produces and what Phase 13 scores;
the validators stop the scored text and the cited text becoming different things.

**Revisit when.** Phase 10, if the model's claim-to-passage map turns out to need per-claim
confidence too.

---

## [3] Demo fixtures quote nothing

**Decision.** Every demo citation's passage reads "Demo passage. The retrieved provision would
appear here…". Demo documents are named by their real published titles and pointed at by section
heading rather than by number, and no demo answer carries an as-of date or corpus version.

**Alternatives.** Write plausible statutory wording so the homepage looks fuller.

**Why.** A fabricated provision is the exact failure mode this product exists to prevent, and a
screenshot does not carry the word "demo" with it. Naming a real Act is a public fact; inventing
what it says is not. Section numbers are omitted for the same reason — "Section 3(p)" typed from
memory is a fabricated citation even when it happens to be right. A test asserts every demo passage
begins "Demo passage." and every demo answer has a null as-of date.

**Revisit when.** Phase 11 ingests real documents and the fixtures are replaced rather than
elaborated.

---

## [3] The five non-English sample questions need a native speaker before demo

**Decision.** `home.languages.samples` carries one specimen question per script. The Hindi and
Telugu strings come from the gold set in `docs/CORPUS_POLICY.md`. The Tamil, Bengali and Marathi
strings are my own composition.

**Status: unverified.** They are short, simple sentences, but I cannot check them the way a speaker
can, and they sit on the homepage where a wrong one is embarrassing in exactly the way this project
should not be.

**Why it is recorded rather than fixed.** The alternative was to show only English specimens on a
page whose subject is answering in six languages, or to quietly ship text I cannot vouch for. This
records the third option: ship it, and say plainly which strings need checking.

**Revisit when.** Before any demo. A speaker of each language reads these five lines.

---

## [3] The workspace answers with the demo fixture, and says so

**Decision.** `/sahayak` reads `?q`, echoes the question, and renders the illustrative answer under
a caution callout stating that every question currently returns this example.

**Alternatives.** Have the hero navigate to a page that ignores the question; or hold the hero input
back until Phase 7.

**Why.** Phase 3 requires a working question box, and a box that navigates somewhere the question
disappears is not working. Rendering a demo answer without saying it is the same answer for every
question would be worse — that is a product pretending to retrieve. The callout is the honest third
option, and it costs one sentence.

**Revisit when.** Phase 7 builds the real workspace and Phase 10 puts retrieval behind it.

---

## [3] No arrow on the Ask button

**Decision.** The submit button reads "Ask", with no trailing arrow glyph.

**Why.** The banned list rules out "->" appended to link and button text. An `ArrowRight` icon is
the same tell wearing an icon font, and it was in the first version of this button until the browser
pass. Recorded because it is the kind of thing that creeps back in.

---

## [4] The corpus manifest exists before anything is ingested

**Decision.** `corpus/manifest.json` lists the 37 planned Layer 1 documents now, generated by
`scripts/build_manifest.py`. Every entry has a null `source_url`, null effective dates, null
`retrieved_at` and `verification_status: "unverified"`.

**Alternatives.** Wait for Phase 11 and hard-code document names into the reference page.

**Why.** `/what-is-covered` has to name the instrument each statement will rest on, and a name typed
into a component is not checkable. With the manifest, a marker pointing at a document that does not
exist throws at render, and a backend test asserts no entry claims to have been fetched. The nulls
are the honest state, not a to-do list — per the corpus policy those fields are filled only from the
document actually fetched.

**Revisit when.** Phase 11 replaces the generator's output with real fetch results.

---

## [4] Every statement is pending, and the page says so once

**Decision.** `Src` renders a marker in one of two states. Cited is an indigo number; pending is a
muted, dotted-underlined number naming the document and saying it has not been retrieved. With an
empty corpus every one of the 91 markers on the page is pending, and a single caution callout at the
top explains that rather than a hundred inline apologies.

**Alternatives.** Omit the statements until sources exist; or state them plainly and add sources
later.

**Why.** The second option is the one to avoid: a dense, confident reference page with no sourcing is
exactly the artefact this product is arguing against. The first leaves nothing to review. Marking
every statement makes the page useful now and honest about what it is — and when documents are
ingested, the same markers turn indigo without a line of the content changing.

**Revisit when.** The first document is ingested and some markers resolve.

---

## [4] A section's source list is derived from its markers, never declared

**Decision.** `rightSources()` and the regulation model compute each section's source list from the
per-field document mapping, so the list cannot contain a document nothing points at.

**Alternatives.** Declare the list beside the section, which is what the first version did.

**Why.** The first version listed up to three documents per right while every marker pointed at the
first — the sourcing plan looked twice as thorough as it was. Deriving the list makes that
impossible by construction, and a test asserts it, verified by adding an unreferenced document and
confirming the test named the section and the orphan.

**Revisit when.** Never; this is the cheaper invariant.

---

## [4] Statements about an absence carry no citation

**Decision.** Fields listed in a right's `gaps` render "(no instrument to cite — this states an
absence)" instead of a marker. Two fields use it: what trade secrets protect, and where they apply.

**Alternatives.** Point those sentences at the Patents Act, which is the nearest instrument.

**Why.** India has no standalone trade-secrets statute, and the corpus policy says to state that gap
explicitly rather than imply coverage. Citing an adjacent Act for "there is no Act" would be citing
the wrong instrument to avoid an empty space — a small dishonesty, but exactly the kind this product
exists to refuse.

**Revisit when.** A statute appears, or another section needs the same treatment.

---

## [4] No section numbers anywhere in the content, enforced by test

**Decision.** A test flattens every string in `covered.json` and fails on `/\b(section|rule|article|
clause|schedule)\s+\d/i`, and on phrases asserting commencement.

**Why.** "Section 3(p)" written from memory is a fabricated citation even when it is right, and this
page is the most tempting place in the product to write one. Numbers and dates come from an ingested
document or they do not appear.

**Revisit when.** Never. When documents are ingested, numbers come from the passage, not the copy.

---

## [5] The pipeline page states what is not built, in three places

**Decision.** `/how-it-works` carries a build state on every pipeline stage and every architecture
layer: `running`, `built, on illustrative data`, or `designed, not built`. Twelve of thirteen stages
and four of five layers are the last of those. A counted line above the stage list says so, computed
from the model rather than typed, and a callout under the h1 says it again in prose.

**Alternatives.** Describe the pipeline in the present tense, which is what an architecture page
normally does; or omit the unbuilt stages entirely.

**Why.** This page's whole job is to let someone decide whether to trust the product, and describing
an ambition in the present tense is the fastest way to forfeit that. Omitting the stages would be
honest but useless — the design is the thing worth assessing. The counted line exists because the
state was originally only visible in the detail panel, which meant a reader had to click thirteen
stages to learn how little runs; the most important message on the page was hidden behind
interaction.

**Revisit when.** Each phase that builds a stage flips its state, and the count updates itself.

---

## [5] The evaluation section shows no numbers, and reads them at runtime

**Decision.** `useEvalSummary` fetches `/evals-summary.json` at runtime. There is no such file, so
all ten metrics render "not measured" against a callout saying no evaluation has been run. When
Phase 13's harness writes the summary, the same table fills in.

**Alternatives.** Omit the section; or show illustrative figures.

**Why.** Illustrative evaluation figures would be the single most dishonest thing this product could
do — the whole argument is that a plausible number without a source is worse than none. A runtime
read rather than a build-time import means a missing file is an ordinary state the page renders,
and the numbers are whatever the last run produced rather than whatever was true when someone typed
them. The section is worth keeping now because the *axes* are the commitment.

**Revisit when.** Phase 13 runs the harness and the build starts emitting the summary.

---

## [5] A malformed evaluation summary is treated as no summary

**Decision.** `isEvalSummary` validates the shape before the page accepts it. Anything else falls
back to "no evaluation has been run".

**Why.** Not hypothetical: a stubbed fetch returning a different endpoint's JSON crashed the whole
page with `Cannot read properties of undefined`, and a misrouted proxy would do the same in
production. The same discipline the answer surface applies to sources — do not render what you
cannot verify — applies to the page's own data.

**Revisit when.** Never; validate at every boundary.

---

## [5] The pipeline diagram advances on selection, never on a timer

**Decision.** A vertical tablist with a roving tabindex: one stop in the tab order, arrow keys to
move, Home and End to the ends. A test runs thirty seconds of fake timers and asserts the selection
has not moved.

**Why.** The build document asks for this explicitly, and the reason is sound: someone assessing the
engineering wants to stop on one stage and read what happens when it fails, and a diagram that
animates itself takes that away. Thirteen buttons each in the tab order would also make the rest of
the page unreachable in any reasonable number of key presses.

**Revisit when.** Never.
