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

---

## [6] Every list on the sources page is derived from a manifest

**Decision.** `/sources` reads `corpus/manifest.json` and `corpus/records-manifest.json` and holds no
list of its own: not the documents, not the groups, not the group order, not the facet options. Group
membership is derived in the generator from `regime_family`, and a regime family with no group is a
build error rather than a silently ungrouped document.

**Alternatives.** Curate the groups in the page, which is easier to read.

**Why.** The build document's done-when is that adding a source changes the page with no code edit.
That was verified rather than assumed: a document was appended to the manifest, the suite was run,
and the page rendered it, grouped it, counted it and filtered it — then the document was removed.
The exercise also caught a hard-coded total of 37 in the test file, which is the same defect the page
forbids, so the tests now derive their totals too.

**Revisit when.** Never; this is the property the page exists to have.

---

## [6] No licence has been read, so nothing is ingested

**Decision.** Every `licence` in the records manifest is null, `isIngested` returns false for all
seventeen sources, and each card says "not yet read — nothing is ingested until it is".

**Alternatives.** Record the licence I believe applies to each source.

**Why.** The corpus policy says a source with an unclear licence is treated as link-out only, and
that open government data typically requires verbatim attribution. A licence written from memory is
the same class of error as a section number written from memory — and here it would also be a
statement about someone else's terms. Reading them is Phase 12's work.

**Revisit when.** Phase 12, one source at a time, as each licence is actually read.

---

## [6] Portal-only sources have nothing for a fetcher to attach to

**Decision.** A `portal_link_only` entry carries no `parser`, no `field_map` and a null
`link_template`. The generator refuses to emit one that does. Two tests enforce it: one on the
manifest's shape, and one that greps every Python file under `scripts/` and `backend/app/` for a
portal source id appearing in a file that also contains fetch code.

**Alternatives.** A note in the documentation saying not to write one.

**Why.** The pre-demo checklist asks for exactly this grep. A checklist item run by hand once is a
checklist item that stops being run; as a test it runs on every commit. Verified by adding a
`requests` import to the generator and confirming the test named the file and the source it had
found next to it.

**Revisit when.** Phase 12 builds real fetchers, when this guard matters most.

---

## [6] The honesty section marks which mechanisms exist

**Decision.** Each of the eight commitments renders with a build-state badge. One is `running`, two
are `built, on illustrative data`, five are `designed, not built`.

**Why.** A commitment with no machinery behind it is a hope, and a page titled "how this is kept
honest" is the worst possible place to overstate. The `BuildStateBadge` moved out of the
how-it-works page into the design system for this, because more than one surface now has to say what
is and is not built.

**Revisit when.** Each phase that builds a mechanism flips its badge.

---

## [7] Script detection is built; language identification is not

**Decision.** `src/lib/detectScript.ts` counts characters in Unicode blocks to decide which of the
six languages a question is written in, and the composer shows the result with a correction control.
Where the script cannot decide — Devanagari carries both Hindi and Marathi — it says which languages
it is between rather than picking one.

**Alternatives.** Wait for Phase 10 and leave the indicator out; or show a fixed "English" and let
the reader change it.

**Why.** The zero-config rule says a reader configures nothing before their first question, and that
includes the language. Script detection is a real capability that can be built now and covers the
case that matters: someone typing Telugu should not have to tell the product they are typing Telugu.
Naming it precisely matters — this is script detection, not language identification, and the
Devanagari case is where the difference shows. Reporting the ambiguity is the same discipline the
answer surface applies to a thin source.

**Revisit when.** Phase 10's language-identification stage replaces it, at which point this becomes
the fallback rather than the mechanism.

---

## [7] One column until there is an answer, and the header shares its edge

**Decision.** The workspace opens as a single centred column and becomes three only when an answer
exists *and* the viewport is at least 1280px. `data-layout` names the state so tests assert it
directly rather than matching a Tailwind arbitrary-value class.

**The fix worth recording:** the first version put the heading and the jurisdiction toggle at full
width while the composer column was centred, so they did not line up — the toggle sat at the page's
left edge and the question box a third of the way across. Before an answer, all of it now shares one
column edge.

**Why.** "Three columns is a state the product reaches, not a state it starts in." A first-time
reader should see a question box, not a cockpit. The alignment defect only showed in a browser; it
passed every test, because tests do not look at a page.

**Revisit when.** Never; verified at 360, 768, 1280 and 1500px.

---

## [7] The context line states what the answer assumes rather than asking

**Decision.** One line above the composer — "India · answering in English · product not yet
identified" — with each part a control. The product type is settable manually now; the guided flow
that determines it is Phase 9.

**Why.** The zero-config rule again: the answer assumes India and says so, instead of demanding a
choice before it will work. Three parts is deliberately the whole context interface; anything more
lives in the rail, which stays collapsed. The middle dots here separate three live controls rather
than decorating a meta string, which is the distinction the banned list is drawing.

**Revisit when.** Phase 9 wires the product part to the classification flow.

---

## [7] `Disclosure` gained a controlled mode

**Decision.** It now accepts `open` and `onOpenChange` alongside `defaultOpen`.

**Why.** The `/` shortcut opens the starter questions, and the first version forced that by changing
the component's `key` to remount it — which throws away focus and any state inside. A controlled
mode is four lines and does not lie to React about identity.

---

## [8] Confidence is a function, and the case set lives outside the frontend

**Decision.** `scoreConfidence` takes the retrieval evidence and returns a level, a reason key and an
abstention reason. Thresholds are named constants. `evals/confidence-cases.json` holds twelve cases
covering every level and every abstention reason, and the TypeScript test reads that file rather
than restating the cases.

**Why the case set is in `/evals` rather than beside the code.** Phase 10 ports this function to
Python. Two implementations of a rule, each with its own tests, is two rules. The shared file means
the port is checked against the same twelve cases, and a disagreement is a test failure rather than
a discrepancy nobody notices.

**Rule 7, enforced by the signature.** `RetrievalEvidence` has no records field. There is no
parameter through which a filed or granted record could reach the scoring function, which is
cheaper than remembering not to pass one. A test asserts the same question with and without records
attached scores identically.

**Revisit when.** Phase 10 ports it; the thresholds are then tuned against the gold set in Phase 13.

---

## [8] An abstention has no answer above it

**Decision.** When the system declines, `QueryResult.answer` is `null`. There is no partial answer,
no "here is what I found anyway" section, and the region carries `data-abstained` and
`data-abstain-reason` so tests assert on the state rather than on prose.

**Why.** A decline with an answer above it is an answer. The whole value of abstention is that a
reader cannot act on something the sources do not support, and softening it is how that gets lost.
Two of the five states — conflict and staleness — do show their passages, because a conflict is only
useful if you can see both sides and a stale source is only useful with its date. That is showing the
evidence for the decline, not answering anyway.

**Revisit when.** Never.

---

## [8] Records are attached to abstentions on purpose

**Decision.** The mock returns related records for abstention cases as readily as for answers, and
the records tab adds a line saying the system still declined and they are shown only because they
exist.

**Why.** The build document calls this out as critical, and the way to be sure it holds is to make
the case reachable rather than avoid it. A test asks a question that both abstains and matches
records, and asserts the abstention still reads as one. Avoiding the combination would have left the
rule untested.

**Revisit when.** Phase 12 replaces the fixture records with real ones.

---

## [8] The confidence reason states the evidence; the callout states the decision

**Decision.** For an abstention the meter reads "4 passages considered; two of them are in tension"
while the callout reads "The only passages I found point different ways".

**The defect this fixed:** the first version had both saying the same sentence, one under the other.
It was caught by a test finding two matching elements — which read as a test that was too loose, and
was actually a copy defect. Splitting them by role removed the duplication and made both more
useful.

**Revisit when.** New abstention states are added.

---

## [8] Simulated latency lives in the mock, in one named constant

**Decision.** `MOCK_LATENCY_MS` in `query.mock.ts` drives the two status lines. The component reads
it; nothing else invents a delay.

**Why.** It stands in for work the pipeline will actually do, and it is the one piece of theatre in
the answer surface, so it should be in one place with a name that says what it is and a comment
saying which phase deletes it. There is no typing animation and no progress bar — the stage timings
shown in the expanded detail are the ones the fixture reports.

**Revisit when.** Phase 10 replaces it with a real stream.

---

## [8] The UK fixture's evidence was changed to match its own caveat

**Decision.** The UK demo answer's caveat says "confidence here is low". The retrieval scores I first
gave it produced `moderate` from the rule, so the meter would have contradicted the answer's own
text. The evidence changed — two passages, neither strong — rather than the rule or the caveat.

**Why it is worth recording.** It is the first time the scoring function disagreed with a fixture,
and the right resolution was to fix the fixture's evidence. Had I adjusted the rule to fit the
fixture, the rule would have started encoding what the demo wanted rather than what the retrieval
showed.

---

## [9] The classification graph is a data file, read by both halves

**Decision.** `backend/app/services/classification/graph.json` holds the decision graph. The backend
service loads it; the frontend imports the same file through a `@classification` alias. It carries
structure only — question ids, options, outcomes — and every string in it is a key into the locale
files.

**Why one file rather than two.** A copy would drift, and the flow a reader walks would stop being
the flow the API walks. Aliasing across the repo boundary is the same trade already made for the
corpus manifest: repo-level data that both halves read.

**Backed by tests on both sides.** Every outcome reachable, every question reachable, no path longer
than the eight the build document allows, no cycles, and every class a real `ProductClass` — never
`undetermined`, because that is the absence of a classification rather than a result.

**Revisit when.** Phase 10 exposes `/api/v1/classify`, at which point the frontend can call it
instead of walking locally; the graph stays where it is.

---

## [9] The graph decides the class; it is forbidden from stating the consequences

**Decision.** A test greps the graph for "licence", "section", "must", "required" and fails if any
appears. The consequence panels are rendered from the corpus with pending markers, and the flow says
so: "a classification flow does not get to state law from a lookup table".

**Why the test exists.** A decision graph with a `consequences` field beside each outcome is the
obvious shortcut, and it would be a hard-coded legal assertion with no source — the exact thing this
product argues against. Making it a test means the shortcut fails the build rather than looking
tidy.

**Where the panel text comes from meanwhile.** The same product-class matrix already on
`/what-is-covered`, which is itself marked pending against named instruments. It is orientation with
its status visible, not an assertion, and the note above the panels says it is replaced by retrieved
passages once the corpus exists.

**Revisit when.** Phase 11 ingests documents and the panels start rendering actual passages.

---

## [9] The ABS flow asserts nothing at all

**Decision.** Its four output panels carry a pending marker naming the instrument and no text.

**Why it goes further than the classification flow.** Every ABS output is a statement about a duty
someone owes. There is no equivalent of the product-class matrix to fall back on that would not
amount to writing the duty myself, so the honest rendering is the marker alone. It closes on the
effective date, because the regime was amended recently and this corpus has no dates.

**Revisit when.** Phase 11.

---

## [9] The prior-art flow is defined by three refusals

**Decision.** It never states a novelty conclusion; it reports finding nothing as "not a result — it
is the absence of one". It never implies the traditional knowledge digital library was searched, and
says plainly that this product cannot search it and what to do instead. It builds no link it has not
verified — the records manifest has null link templates, so every portal reads "link not yet
verified" rather than carrying a guessed URL.

**Tested as refusals.** One test asserts there are zero `http` links in the panel; another that the
banner has no dismiss control; another that finding nothing is not reported as a result.

**Revisit when.** Phase 12 reads the portals' terms and fills the link templates.

---

## [9] Flows are offered by answers, never from navigation

**Decision.** `FlowOffers` renders beneath an answer or an abstention, and which flows appear is
computed from that answer: the classification flow while the product type is unknown, ABS when the
answer touches it, prior art when a patent is in play. An abstention for `needs_more_facts` offers
classification first, because that is the gap it just named.

**Two defects fixed on the way.** All three offer buttons read "Work it out", which is three
identical buttons in a row — each now says what it works out. And the offer heading repeated once
per card; it belongs to the group.

**Revisit when.** A fourth flow appears and the rules for offering them need to move out of the page.
