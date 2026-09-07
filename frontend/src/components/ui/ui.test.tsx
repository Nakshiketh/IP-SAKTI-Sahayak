/**
 * Behaviour the design system promises, tested rather than asserted.
 *
 * The keyboard cases are here because they are the ones that break silently: a
 * drawer that does not return focus, a tab strip that puts every tab in the tab
 * order, a tooltip that only opens on hover. None of those show up in a
 * screenshot.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  Chip,
  ConfidenceMeter,
  Drawer,
  Disclosure,
  JurisdictionToggle,
  RecordCard,
  SourceRule,
  Tabs,
  Tooltip,
} from '@/components/ui';
import type { Jurisdiction } from '@/types/domain';

describe('Tabs', () => {
  function Harness() {
    const [value, setValue] = useState('sources');
    return (
      <Tabs
        aria-label="Answer panel"
        idBase="spec"
        items={[
          { id: 'sources', label: 'Sources', count: 4 },
          { id: 'records', label: 'Related records', count: 2 },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it('keeps one stop in the tab order and moves with arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const sources = screen.getByRole('tab', { name: /Sources/ });
    const records = screen.getByRole('tab', { name: /Related records/ });

    expect(sources).toHaveAttribute('tabindex', '0');
    expect(records).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(sources).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(records).toHaveFocus();
    expect(records).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(sources).toHaveFocus();
  });
});

describe('JurisdictionToggle', () => {
  function Harness() {
    const [value, setValue] = useState<Jurisdiction>('IN');
    return (
      <JurisdictionToggle
        aria-label="Jurisdiction"
        value={value}
        onChange={setValue}
        labels={{ IN: 'India', INTL: 'International' }}
      />
    );
  }

  it('is a radiogroup with exactly one checked option', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('radiogroup', { name: 'Jurisdiction' });
    const india = within(group).getByRole('radio', { name: 'India' });
    const intl = within(group).getByRole('radio', { name: 'International' });

    expect(india).toHaveAttribute('aria-checked', 'true');
    expect(intl).toHaveAttribute('aria-checked', 'false');

    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(intl).toHaveAttribute('aria-checked', 'true');
    expect(india).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Drawer', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open sources
        </button>
        <Drawer open={open} onClose={() => setOpen(false)} title="Sources">
          <button type="button">Show the passage</button>
        </Drawer>
      </>
    );
  }

  it('closes on Escape and hands focus back to whatever opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Open sources' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Sources' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the panel while it is open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open sources' }));

    const dialog = screen.getByRole('dialog', { name: 'Sources' });
    const inside = within(dialog).getAllByRole('button');

    for (let i = 0; i < inside.length + 2; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

describe('Disclosure', () => {
  it('reports its state and shows the panel only when open', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="4 passages from 2 documents">
        <p>The stage-by-stage breakdown.</p>
      </Disclosure>,
    );

    const trigger = screen.getByRole('button', { name: /4 passages/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('The stage-by-stage breakdown.')).not.toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The stage-by-stage breakdown.')).toBeVisible();
  });
});

describe('Tooltip', () => {
  it('opens on keyboard focus, not only on hover', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="General explanation, not from a specific source.">
        <button type="button">An unsourced sentence</button>
      </Tooltip>,
    );

    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();

    await user.tab();
    expect(screen.getByRole('tooltip')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });
});

describe('Chip', () => {
  it('gives its remove control a name that says what is being removed', () => {
    render(
      <Chip onRemove={() => undefined} removeLabel="Remove filter: India">
        India
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'Remove filter: India' })).toBeInTheDocument();
  });
});

describe('rules the system encodes', () => {
  it('a record card always carries the not-legal-authority label', () => {
    render(
      <RecordCard
        title="Herbal composition for joint discomfort"
        recordType="Patent application"
        snapshotDate="2026-01-01"
      />,
    );
    expect(screen.getByText(/not a statement of law/i)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot 2026-01-01/)).toBeInTheDocument();
  });

  it('confidence never renders without its reason', () => {
    render(<ConfidenceMeter level="high" reason="Based on 4 passages from 2 current sources." />);
    expect(screen.getByText('Based on 4 passages from 2 current sources.')).toBeInTheDocument();
    // The visual meter is described in words for anyone not seeing the ticks.
    expect(screen.getByRole('img', { name: 'High confidence: 4 of 4' })).toBeInTheDocument();
  });

  it('an abstention shows no filled ticks, so it cannot read as a weak answer', () => {
    render(<ConfidenceMeter level="abstain" reason="Nothing in these sources answers this." />);
    expect(screen.getByRole('img', { name: 'Not answered: 0 of 4' })).toBeInTheDocument();
  });

  it('unsourced content is marked before the reader reaches the text', () => {
    const { container } = render(
      <SourceRule sourced={false} note="Illustrative example">
        <p>A worked example.</p>
      </SourceRule>,
    );
    expect(screen.getByText('Illustrative example')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('rule-illustrative');
  });
});
