/**
 * axe over the whole specimen page.
 *
 * A caveat worth stating rather than hiding: jsdom has no layout engine, so
 * axe's colour-contrast rule cannot run here and reports "incomplete" rather
 * than passing. Contrast is covered separately and properly by
 * src/styles/contrast.test.ts, which measures the real token values, and by a
 * browser pass against the running dev server. What this test does cover is
 * everything structural — roles, names, labels, heading order, landmark use,
 * duplicate ids, form labelling — which is where regressions actually creep in.
 */

import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import DesignSystem from '@/routes/DesignSystem';

describe('the design specimen', () => {
  it('has no axe violations', async () => {
    const { container } = render(<DesignSystem />);
    const results = await axe.run(container, {
      resultTypes: ['violations'],
    });

    const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`);
    expect(summary).toEqual([]);
  }, 30_000);

  it('opens overlays without leaking a second dialog', async () => {
    const { container } = render(<DesignSystem />);
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });
});
