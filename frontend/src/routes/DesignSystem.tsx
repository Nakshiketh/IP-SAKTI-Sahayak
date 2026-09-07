import { useEffect, useId, useState } from 'react';

import {
  Badge,
  BottomSheet,
  Button,
  Callout,
  Card,
  CardRow,
  Chip,
  ConfidenceMeter,
  Disclosure,
  Drawer,
  IncisedMark,
  JurisdictionToggle,
  LedgerEntry,
  LiveRegion,
  RecordCard,
  Select,
  Skeleton,
  SkeletonBlock,
  SourceRule,
  TabPanel,
  Tabs,
  Tooltip,
} from '@/components/ui';
import { AA_TEXT, ratio, type Rgb } from '@/lib/contrast';
import type { Confidence, Jurisdiction } from '@/types/domain';

/**
 * The specimen page. Development only — App.tsx does not register this route in
 * a production build.
 *
 * Every primitive appears here with the states it actually has, so a change to
 * the system is visible in one place rather than discovered on a product page.
 */

const PALETTE = [
  { name: 'ink', role: 'Text, and dark surfaces' },
  { name: 'leaf', role: 'Primary. Structure and primary action' },
  { name: 'sap', role: 'Interactive states and success. Not a text colour' },
  { name: 'bone', role: 'The page' },
  { name: 'lac', role: 'Caution, and declining to answer. Nothing else' },
  { name: 'stamp', role: 'Sourcing, verification, citation. Nothing else' },
] as const;

const SCRIPTS = [
  { lang: 'en', name: 'English', sample: 'Protecting an Ayurvedic formulation' },
  { lang: 'hi', name: 'हिंदी', sample: 'आयुर्वेदिक सूत्र का संरक्षण' },
  { lang: 'te', name: 'తెలుగు', sample: 'ఆయుర్వేద సూత్రీకరణ రక్షణ' },
  { lang: 'ta', name: 'தமிழ்', sample: 'ஆயுர்வேத மருந்துக் காப்பு' },
  { lang: 'bn', name: 'বাংলা', sample: 'আয়ুর্বেদিক সূত্র সুরক্ষা' },
  { lang: 'mr', name: 'मराठी', sample: 'आयुर्वेदिक सूत्राचे संरक्षण' },
] as const;

/** Written out rather than interpolated: Tailwind only sees literal class names. */
const SCALE = [
  { step: 'xs', className: 'text-xs' },
  { step: 'base', className: 'text-base' },
  { step: 'md', className: 'text-md' },
  { step: 'lg', className: 'text-lg' },
  { step: 'xl', className: 'text-xl' },
  { step: '2xl', className: 'text-2xl' },
  { step: '3xl', className: 'text-3xl' },
] as const;

const CONFIDENCE_STATES: ReadonlyArray<{ level: Confidence; reason: string }> = [
  { level: 'high', reason: 'Based on 4 passages from 2 current sources.' },
  { level: 'moderate', reason: 'Based on 3 passages, all from one source.' },
  { level: 'low', reason: 'The passages found are weak, and two of them disagree.' },
  { level: 'abstain', reason: 'Nothing in these sources answers this reliably.' },
];

function readPalette(): Record<string, Rgb> {
  const styles = getComputedStyle(document.documentElement);
  const out: Record<string, Rgb> = {};
  for (const { name } of PALETTE) {
    const raw = styles.getPropertyValue(`--${name}-rgb`).trim();
    const parts = raw.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      out[name] = parts as unknown as Rgb;
    }
  }
  return out;
}

export default function DesignSystem() {
  const [palette, setPalette] = useState<Record<string, Rgb>>({});
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('IN');
  const [tab, setTab] = useState('sources');
  const tabsId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => setPalette(readPalette()), []);

  const bone = palette.bone;

  return (
    <main className="mx-auto max-w-[64rem] px-5 py-10">
      <header className="mb-10 border-b border-rule-strong pb-6">
        <p className="mb-1 text-xs text-muted">Development only. Not a product page.</p>
        <h1 className="text-2xl">Design system</h1>
        <p className="mt-2 text-muted">
          The reference object is a palm-leaf manuscript in a registry: incised ink, aged leaf,
          lac-red seals, an inspector&rsquo;s indigo stamp. Two accents, two jobs — indigo means
          sourced, lac red means caution or declining to answer. Neither is ever decorative.
        </p>
      </header>

      {/* Palette — a table, because it is one: values, roles and measured ratios. */}
      <Spec
        title="Palette"
        note="Contrast measured live against the page ground. The same numbers are asserted in src/styles/contrast.test.ts."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-base">
            <thead>
              <tr className="border-b border-rule-strong text-left">
                <Th>Token</Th>
                <Th>Value</Th>
                <Th>On bone</Th>
                <Th>Job</Th>
              </tr>
            </thead>
            <tbody>
              {PALETTE.map(({ name, role }) => {
                const rgb = palette[name];
                const contrast = rgb && bone && name !== 'bone' ? ratio(rgb, bone) : null;
                return (
                  <tr key={name} className="border-b border-rule-faint align-top">
                    <Td>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 shrink-0 rounded-data border border-rule-strong"
                          style={{ backgroundColor: `rgb(var(--${name}-rgb))` }}
                        />
                        <code>--{name}</code>
                      </span>
                    </Td>
                    <Td>
                      <code className="text-xs text-muted">{rgb ? rgb.join(' ') : '—'}</code>
                    </Td>
                    <Td>
                      {contrast === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={contrast >= AA_TEXT ? undefined : 'text-lac'}>
                          {contrast.toFixed(2)}:1
                          {contrast >= AA_TEXT ? '' : ' — interface and large text only'}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted">{role}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Spec>

      {/* Type — a specimen list, one row per script. */}
      <Spec
        title="Type"
        note="One display family across scripts, so a Telugu heading has the same voice as an English one. Scale is 1.25 from a 16px base; the measure is capped at 68 characters."
      >
        <ul className="m-0 list-none space-y-4 p-0">
          {SCRIPTS.map(({ lang, name, sample }) => (
            <li key={lang} className="border-b border-rule-faint pb-4 last:border-b-0">
              <p className="mb-1 max-w-none text-xs text-muted">
                {name} · <code>:lang({lang})</code>
              </p>
              <p lang={lang} className="font-display text-xl">
                {sample}
              </p>
              <p lang={lang} className="mt-1 text-base text-muted">
                {sample}
              </p>
            </li>
          ))}
        </ul>
        <dl className="mt-6 grid grid-cols-[6rem_1fr] items-baseline gap-y-1 text-base">
          {SCALE.map(({ step, className }) => (
            <div key={step} className="contents">
              <dt className="text-xs text-muted">{step}</dt>
              <dd className={`m-0 truncate font-display ${className}`}>Ancient knowledge</dd>
            </div>
          ))}
        </dl>
      </Spec>

      {/* Structural devices — the load-bearing part of the system. */}
      <Spec
        title="Sourcing device"
        note="A solid indigo left rule means the content came from a retrieved passage. A dashed neutral rule means it is an example. This one device runs through the whole product, which only works if it is never used for anything else."
      >
        <div className="space-y-4">
          <SourceRule sourced>
            <p>
              A statement drawn from a retrieved passage. The rule is what tells a reader they can
              open the source behind it.
            </p>
          </SourceRule>
          <SourceRule sourced={false} note="Illustrative example">
            <p>
              A worked example written to explain a distinction. Nothing behind it is a source, and
              the dashed rule says so before the reader has read a word.
            </p>
          </SourceRule>
        </div>
      </Spec>

      <Spec
        title="Category marking"
        note="Intellectual property and regulation are distinguished by stroke pattern as well as colour — two incised lines against one incised and one broken — so the distinction survives for a reader who cannot separate the hues."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="incised incised--ip">
            <h3 className="flex items-center gap-2 text-md">
              <IncisedMark kind="ip" label={null} />
              Intellectual property
            </h3>
            <p className="mt-1 text-muted">How do I secure or understand rights in this?</p>
          </div>
          <div className="incised incised--reg">
            <h3 className="flex items-center gap-2 text-md">
              <IncisedMark kind="regulatory" label={null} />
              Regulation
            </h3>
            <p className="mt-1 text-muted">What must I do before I can sell this?</p>
          </div>
        </div>
      </Spec>

      <Spec title="Buttons" note="Weight comes from fill and border. Nothing lifts on hover.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Ask Sahayak</Button>
          <Button variant="secondary">See what&rsquo;s covered</Button>
          <Button variant="quiet">Show the passage</Button>
          <Button variant="danger">Withdraw consent</Button>
          <Button variant="primary" disabled>
            Unavailable
          </Button>
          <Button variant="secondary" size="sm">
            Small
          </Button>
        </div>
      </Spec>

      <Spec
        title="Chips and badges"
        note="A chip is a control — a filter, a follow-up, an applied facet. A badge is a label a reader cannot act on. They are different things, so they do not look alike."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip onClick={() => undefined}>What changes for the UK?</Chip>
            <Chip tone="sourced" onClick={() => undefined}>
              Open the passage
            </Chip>
            <Chip tone="demo">Illustrative example</Chip>
            <Chip onRemove={() => undefined} removeLabel="Remove filter: India">
              India
            </Chip>
            <Chip selected onClick={() => undefined}>
              Selected
            </Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Act</Badge>
            <Badge tone="sourced">Verified source</Badge>
            <Badge tone="caution">Superseded</Badge>
          </div>
        </div>
      </Spec>

      <Spec
        title="Cards"
        note="Three variants that differ in structure, not colour: a bounded data surface, a register-style ledger entry with a label column, and a filled panel that exists to be acted on."
      >
        <div className="space-y-6">
          <Card variant="data" as="article" className="max-w-md">
            <CardRow>
              <h3 className="text-base">The Patents Act, 1970</h3>
              <p className="mt-0.5 text-xs text-muted">Government of India · Act</p>
            </CardRow>
            <CardRow>
              <p className="text-xs text-muted">Chapter II, Section 3(p) · page 12</p>
            </CardRow>
          </Card>

          <Card variant="ledger" as="section" className="max-w-lg">
            <h3 className="mb-2 text-base">Entry</h3>
            <dl className="m-0">
              <LedgerEntry label="Jurisdiction">India</LedgerEntry>
              <LedgerEntry label="Document type">Act</LedgerEntry>
              <LedgerEntry label="Effective from">Pending source</LedgerEntry>
            </dl>
          </Card>

          <Card variant="action" className="max-w-md">
            <h3 className="text-base">What is your product, regulatorily?</h3>
            <p className="mt-1 text-muted">
              What applies to you depends on this. Five questions, and you can change the answer
              later.
            </p>
            <Button variant="primary" size="sm" className="mt-3">
              Work it out
            </Button>
          </Card>
        </div>
      </Spec>

      <Spec
        title="Record card"
        note="Layer 2. A full neutral border rather than an indigo left rule, and a label that cannot be dismissed. A record must never read as a statement of law."
      >
        <RecordCard
          className="max-w-md"
          title="Herbal composition for joint discomfort and process thereof"
          recordType="Patent application"
          applicant="Illustrative applicant"
          status="Published"
          snapshotDate="pending first snapshot"
        />
      </Spec>

      <Spec
        title="Callouts"
        note="Three tones, three jobs. Abstain is never dressed up as an answer."
      >
        <div className="space-y-3">
          <Callout tone="info" title="Sources stay in their original language">
            The answer is translated. The passage it came from is not, so you can check it against
            the document as published.
          </Callout>
          <Callout tone="caution" title="The position may have changed">
            Two passages disagree, and one is older than the other. Both dates are shown on the
            sources.
          </Callout>
          <Callout tone="abstain" title="I couldn't find anything that answers this reliably">
            Try narrowing the jurisdiction, naming the product type, or rephrasing. You can also see
            what&rsquo;s covered, or send this to a human IP facilitator with the context already
            filled in.
          </Callout>
        </div>
      </Spec>

      <Spec
        title="Jurisdiction toggle"
        note="The most prominent control on the workspace. Changing it swaps the answer set outright — the two are never blended."
      >
        <div className="flex flex-wrap items-center gap-4">
          <JurisdictionToggle
            aria-label="Jurisdiction"
            value={jurisdiction}
            onChange={setJurisdiction}
            labels={{ IN: 'India', INTL: 'International' }}
          />
          <p className="text-xs text-muted">
            Selected: <code>{jurisdiction}</code>
          </p>
        </div>
      </Spec>

      <Spec
        title="Confidence"
        note="Four states, each with its reason in a sentence. Never a bare number: a reader cannot act on a percentage."
      >
        <ul className="m-0 list-none space-y-3 p-0">
          {CONFIDENCE_STATES.map(({ level, reason }) => (
            <li key={level}>
              <ConfidenceMeter level={level} reason={reason} />
            </li>
          ))}
        </ul>
      </Spec>

      <Spec
        title="Tabs"
        note="Sources and related records are separate tabs because they must never appear in one list. Arrow keys move between them."
      >
        <div className="max-w-md">
          <Tabs
            aria-label="Answer panel"
            idBase={tabsId}
            items={[
              { id: 'sources', label: 'Sources', count: 4 },
              { id: 'records', label: 'Related records', count: 2 },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="pt-3">
            <TabPanel id="sources" idBase={tabsId} active={tab === 'sources'}>
              <p className="text-muted">Passages the answer was built from.</p>
            </TabPanel>
            <TabPanel id="records" idBase={tabsId} active={tab === 'records'}>
              <p className="text-muted">Filed or granted records. Not legal authority.</p>
            </TabPanel>
          </div>
        </div>
      </Spec>

      <Spec
        title="Select"
        note="The platform control, styled. A custom listbox would have to earn its way past keyboard, screen reader and touch, and here it has no reason to."
      >
        <Select
          label="Export market"
          defaultValue="uk"
          options={[
            { value: 'uk', label: 'United Kingdom' },
            { value: 'eu', label: 'European Union' },
            { value: 'us', label: 'United States' },
          ]}
        />
      </Spec>

      <Spec
        title="Overlays"
        note="Both trap focus while open, close on Escape, and return focus to the control that opened them. The drawer is the tablet surface for sources; the sheet is the phone one."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
        </div>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Sources">
          <p className="text-muted">Four passages from two documents.</p>
        </Drawer>
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Sources">
          <p className="text-muted">Four passages from two documents.</p>
        </BottomSheet>
      </Spec>

      <Spec
        title="Tooltip"
        note="Opens on focus as well as hover, and closes on Escape. Nothing important lives only in a tooltip."
      >
        <Tooltip content="General explanation, not from a specific source.">
          <button
            type="button"
            className="rounded-data underline decoration-dotted underline-offset-4"
          >
            An unsourced sentence
          </button>
        </Tooltip>
      </Spec>

      <Spec title="Disclosure" note="Depth on request. The summary line is enough on its own.">
        <Disclosure summary="4 passages from 2 documents · India · 1.8s" className="max-w-md">
          <p className="text-muted">
            The stage-by-stage breakdown with timings would sit here, along with the retrieved
            passages and their scores.
          </p>
        </Disclosure>
      </Spec>

      <Spec
        title="Waiting"
        note="A blank ruled leaf, breathing on opacity. Not a shimmer: a gradient sweeping across the page is decoration, and it implies progress the system cannot report."
      >
        <div className="max-w-md space-y-4">
          <Skeleton lines={4} />
          <SkeletonBlock className="h-16" />
        </div>
      </Spec>

      <Spec
        title="Announcements"
        note="Answers are announced politely so a screen-reader user is not interrupted mid-sentence. Retrieval status is assertive, and only on a state change."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setAnnouncement(`Reading 7 passages from 4 documents (${Date.now()})`)}
          >
            Announce a status change
          </Button>
          <LiveRegion urgency="polite" className="text-muted">
            {announcement ? 'Reading 7 passages from 4 documents' : ''}
          </LiveRegion>
        </div>
      </Spec>
    </main>
  );
}

function Spec({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-lg">{title}</h2>
      <p className="mb-5 mt-1 text-muted">{note}</p>
      {children}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-4 text-xs font-medium text-muted">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-4">{children}</td>;
}
