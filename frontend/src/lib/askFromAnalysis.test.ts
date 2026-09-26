/**
 * The bridge from Check My Product to Ask Sahayak.
 *
 * What it carries matters more than that it works. The question is generated
 * from an analysis that deliberately refuses to call anything novel, so a
 * question built from it must not smuggle a verdict in — and everything it
 * does carry has to be visible to the reader, because being answered on words
 * you were never shown is the defect this product exists to avoid.
 */

import { describe, expect, it } from 'vitest';

import { askUrlFromAnalysis, questionFromAnalysis } from '@/lib/askFromAnalysis';
import type { Conversation } from '@/services/analyst';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    title: 'Turmeric–Neem Face Pack',
    created_at: 0,
    updated_at: 0,
    messages: [],
    missing: [],
    ready: true,
    history: [],
    engine: 'rules',
    invention: {
      title: 'Turmeric–Neem Face Pack',
      invention_type: null,
      form: 'face pack',
      category: null,
      intended_use: 'skin cleansing and oil absorption',
      use_terms: [],
      problem: null,
      batch_size: null,
      process_steps: [],
      process_parameters: [],
      distinctive_features: ['a modified drying step'],
      technical_effects: [],
      evidence: null,
      ingredients: [
        { key: 'a', name: 'Multani Mitti', vocabulary_id: null, label: null, kind: 'material', amount: null, percent: 40, percent_derived: null, purpose: null },
        { key: 'b', name: 'Turmeric', vocabulary_id: null, label: null, kind: 'traditional', amount: null, percent: 10, percent_derived: null, purpose: null },
      ],
    },
    analysis: {
      created_at: 0,
      invention_version: 1,
      trigger: 'user',
      reran: [],
      products: {} as never,
      knowledge: {} as never,
      prior_art: {} as never,
      assessment: {
        indicator: 'related_material_found' as never,
        reasons: [],
        novelty: {} as never,
        inventive_step: {} as never,
        industrial_applicability: {} as never,
        exclusions: [],
        would_sharpen: ['whether it is sold as a cosmetic or a drug'],
      },
      ip_options: [],
      next_steps: [],
      intelligence: null,
    },
    ...overrides,
  } as Conversation;
}

describe('the question built from an analysis', () => {
  it('carries the composition with its percentages', () => {
    const question = questionFromAnalysis(conversation())!;
    expect(question).toContain('Multani Mitti (40%)');
    expect(question).toContain('Turmeric (10%)');
  });

  it('carries the form and the intended use', () => {
    const question = questionFromAnalysis(conversation())!;
    expect(question).toContain('face pack');
    expect(question).toContain('skin cleansing and oil absorption');
  });

  it('writes the form as words, never as the key it is stored under', () => {
    // It came out as "an Ayurvedic face_pack skin" in the browser: a raw enum
    // and a stray category. A reader seeing that learns their product was not
    // understood, before they have read a word of the answer.
    const underscored = conversation();
    underscored.invention.form = 'oral_formulation';
    underscored.invention.category = 'skin';
    const question = questionFromAnalysis(underscored)!;
    expect(question).toContain('an Ayurvedic oral formulation');
    expect(question).not.toContain('_');
    expect(question).not.toContain('oral formulation skin');
  });

  it('keeps a distinctive feature as a belief, not as a finding', () => {
    // The analyst will not conclude that anything is distinctive. A question
    // generated from it that asserted so would be putting a verdict into the
    // reader's mouth and getting it answered back.
    const question = questionFromAnalysis(conversation())!;
    expect(question).toContain('We believe');
    expect(question).toContain('a modified drying step');
  });

  it('carries what the analyst could not settle', () => {
    const question = questionFromAnalysis(conversation())!;
    expect(question).toContain('We do not yet know');
    expect(question).toContain('cosmetic or a drug');
  });

  it('never claims the product is novel or patentable', () => {
    const question = questionFromAnalysis(conversation())!.toLowerCase();
    for (const forbidden of ['is novel', 'is patentable', 'novelty is', 'we have invented']) {
      expect(question).not.toContain(forbidden);
    }
  });

  it('asks what applies rather than asserting what does', () => {
    expect(questionFromAnalysis(conversation())).toMatch(/what intellectual-property and regulatory requirements apply/i);
  });

  it('produces nothing at all without a composition', () => {
    // Half a formulation would be answered on facts the reader had not
    // finished giving.
    const empty = conversation();
    empty.invention.ingredients = [];
    expect(questionFromAnalysis(empty)).toBeNull();
    expect(askUrlFromAnalysis(empty)).toBeNull();
  });

  it('puts the whole question in the address, where the box can show it', () => {
    const url = askUrlFromAnalysis(conversation())!;
    expect(url.startsWith('/sahayak?q=')).toBe(true);
    // Round-trips exactly: what is asked is what the reader will read.
    const carried = decodeURIComponent(url.slice('/sahayak?q='.length));
    expect(carried).toBe(questionFromAnalysis(conversation()));
  });

  it('stays short enough to retrieve on', () => {
    const many = conversation();
    many.invention.ingredients = Array.from({ length: 60 }, (_, index) => ({
      key: `k${index}`,
      name: `Ingredient number ${index} with a long botanical name`,
      vocabulary_id: null,
      label: null,
      kind: 'material' as const,
      amount: null,
      percent: 1,
      percent_derived: null,
      purpose: null,
    }));
    expect(questionFromAnalysis(many)!.length).toBeLessThanOrEqual(1200);
  });
});
