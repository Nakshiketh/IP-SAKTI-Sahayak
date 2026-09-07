// DEMO DATA — not a legal source
//
// Illustrative answers used until the retrieval pipeline lands in Phase 10.
// Everything here is shaped exactly like a real Answer so the components under
// it are the real components, but nothing here has been retrieved from anything.
//
// Three rules this file follows, and any future fixture must follow:
//
//  1. Every document id is prefixed `demo-`, every verification_status is
//     "demo", and every answer sets is_demo, so the interface can mark it.
//  2. No invented statutory text. The `passage` on a demo citation says plainly
//     that it is a placeholder. Showing fabricated provision wording — even in a
//     demo — is the exact failure this product exists to avoid.
//  3. No invented section numbers or dates. Where a source is named, it is named
//     by its published title and the heading of the part being pointed at.

import type { Answer, Citation, Jurisdiction } from '@/types/domain';

/** A demo citation carries the placeholder passage the UI reveals on request. */
export interface DemoCitation extends Citation {
  passage: string;
}

const PLACEHOLDER_PASSAGE =
  'Demo passage. The retrieved provision would appear here, in its original ' +
  'wording, with its section path and effective date. No document has been ' +
  'ingested yet, so nothing is quoted.';

function demoCitation(
  id: string,
  documentId: string,
  title: string,
  organization: string,
  jurisdiction: Jurisdiction,
  sectionLabel: string,
): DemoCitation {
  return {
    citation_id: id,
    chunk_id: `${documentId}::demo`,
    document_id: documentId,
    document_title: title,
    organization,
    jurisdiction,
    section_label: sectionLabel,
    page: null,
    url: null,
    retrieval_score: null,
    rerank_score: null,
    verification_status: 'demo',
    as_of_date: null,
    passage: PLACEHOLDER_PASSAGE,
  };
}

const IN_CITATIONS: DemoCitation[] = [
  demoCitation(
    'd-in-1',
    'demo-in-drugs-and-cosmetics-act-1940',
    'The Drugs and Cosmetics Act, 1940',
    'Government of India',
    'IN',
    'Ayurvedic, Siddha and Unani drugs',
  ),
  demoCitation(
    'd-in-2',
    'demo-in-patents-act-1970',
    'The Patents Act, 1970',
    'Government of India',
    'IN',
    'What are not inventions',
  ),
  demoCitation(
    'd-in-3',
    'demo-in-drugs-and-cosmetics-rules-1945',
    'The Drugs and Cosmetics Rules, 1945',
    'Government of India',
    'IN',
    'Manufacture for sale of Ayurvedic drugs',
  ),
  demoCitation(
    'd-in-4',
    'demo-in-biological-diversity-act-2002',
    'The Biological Diversity Act, 2002',
    'Government of India',
    'IN',
    'Access to biological resources',
  ),
];

const UK_CITATIONS: DemoCitation[] = [
  demoCitation(
    'd-uk-1',
    'demo-uk-traditional-herbal-registration',
    'Traditional herbal registration scheme',
    'Medicines and Healthcare products Regulatory Agency',
    'INTL',
    'Eligibility for registration',
  ),
  demoCitation(
    'd-uk-2',
    'demo-uk-food-supplements-labelling',
    'Food supplements: labelling and composition rules',
    'Department of Health and Social Care',
    'INTL',
    'Permitted claims',
  ),
];

/** The question the homepage answers, and the one the composer pre-fills. */
export const DEMO_QUESTION =
  'We have modified a classical polyherbal formulation and want to sell it in ' +
  'India and the UK. What should we work out first?';

const INDIA_ANSWER: Answer = {
  answer_id: 'demo-answer-in',
  query_id: 'demo-query-1',
  jurisdiction: 'IN',
  language: 'en',
  product_class: 'patent_proprietary',
  ip_rights: ['patent', 'traditional_knowledge', 'trademark'],
  regulatory_areas: ['licensing', 'manufacturing_gmp', 'abs_compliance'],
  confidence: 'moderate',
  abstained: false,
  abstain_reason: null,
  escalation_offered: true,
  as_of_date: null,
  corpus_version: null,
  latency_ms: 1840,
  is_demo: true,
  citations: IN_CITATIONS,
  related_records: [],
  blocks: [
    {
      id: 'in-answer',
      kind: 'answer',
      text:
        'Work out what your product is regulatorily before anything else. ' +
        'Changing the ingredients, proportions or dosage form of a classical formulation generally moves it out of the classical category and into the patent-or-proprietary route. ' +
        'That classification is what then decides which licence you need and what intellectual property is realistically open to you.',
      citation_ids: ['d-in-1'],
      claims: [
        {
          text: 'Work out what your product is regulatorily before anything else.',
          citation_ids: [],
        },
        {
          text: 'Changing the ingredients, proportions or dosage form of a classical formulation generally moves it out of the classical category and into the patent-or-proprietary route.',
          citation_ids: ['d-in-1'],
        },
        {
          text: 'That classification is what then decides which licence you need and what intellectual property is realistically open to you.',
          citation_ids: [],
        },
      ],
    },
    {
      id: 'in-why',
      kind: 'why',
      text:
        'For an Ayurvedic product these two questions are joined rather than separate. ' +
        'A formulation taken unchanged from an authoritative text is documented traditional knowledge, which stands as prior art against a claim to the composition itself. ' +
        'Once you have modified it, the question becomes whether what you changed is genuinely new, rather than an aggregation of properties already known.',
      citation_ids: ['d-in-2'],
      claims: [
        {
          text: 'For an Ayurvedic product these two questions are joined rather than separate.',
          citation_ids: [],
        },
        {
          text: 'A formulation taken unchanged from an authoritative text is documented traditional knowledge, which stands as prior art against a claim to the composition itself.',
          citation_ids: ['d-in-2'],
        },
        {
          text: 'Once you have modified it, the question becomes whether what you changed is genuinely new, rather than an aggregation of properties already known.',
          citation_ids: ['d-in-2'],
        },
      ],
    },
    {
      id: 'in-check',
      kind: 'what_to_check',
      text:
        'Record which authoritative text your starting formulation comes from, and exactly what you changed. ' +
        'Confirm whether your manufacturing licence covers a patent or proprietary medicine rather than only classical preparations. ' +
        'Establish whether any ingredient is a biological resource that carries access and benefit-sharing duties, before you file anything.',
      citation_ids: ['d-in-3', 'd-in-4'],
      claims: [
        {
          text: 'Record which authoritative text your starting formulation comes from, and exactly what you changed.',
          citation_ids: [],
        },
        {
          text: 'Confirm whether your manufacturing licence covers a patent or proprietary medicine rather than only classical preparations.',
          citation_ids: ['d-in-3'],
        },
        {
          text: 'Establish whether any ingredient is a biological resource that carries access and benefit-sharing duties, before you file anything.',
          citation_ids: ['d-in-4'],
        },
      ],
    },
    {
      id: 'in-caveat',
      kind: 'caveat',
      text:
        'This does not tell you whether a patent application would succeed, and it is not a search for prior art. ' +
        'It also does not settle the UK position, which is produced separately from different sources.',
      citation_ids: [],
      claims: [
        {
          text: 'This does not tell you whether a patent application would succeed, and it is not a search for prior art.',
          citation_ids: [],
        },
        {
          text: 'It also does not settle the UK position, which is produced separately from different sources.',
          citation_ids: [],
        },
      ],
    },
  ],
};

const UK_ANSWER: Answer = {
  answer_id: 'demo-answer-uk',
  query_id: 'demo-query-1',
  jurisdiction: 'INTL',
  language: 'en',
  product_class: 'patent_proprietary',
  ip_rights: ['trademark'],
  regulatory_areas: ['licensing', 'labelling', 'import_export'],
  confidence: 'low',
  abstained: false,
  abstain_reason: null,
  escalation_offered: true,
  as_of_date: null,
  corpus_version: null,
  latency_ms: 2110,
  is_demo: true,
  citations: UK_CITATIONS,
  related_records: [],
  blocks: [
    {
      id: 'uk-answer',
      kind: 'answer',
      text:
        'An Indian manufacturing licence does not carry across, so the UK route has to be worked out on its own terms. ' +
        'Where a herbal product is sold with therapeutic indications, the registration route turns on evidence of traditional use rather than on how the product is classified in India. ' +
        'If you make no therapeutic claim at all, a food or supplement route may apply instead, with quite different labelling rules.',
      citation_ids: ['d-uk-1', 'd-uk-2'],
      claims: [
        {
          text: 'An Indian manufacturing licence does not carry across, so the UK route has to be worked out on its own terms.',
          citation_ids: [],
        },
        {
          text: 'Where a herbal product is sold with therapeutic indications, the registration route turns on evidence of traditional use rather than on how the product is classified in India.',
          citation_ids: ['d-uk-1'],
        },
        {
          text: 'If you make no therapeutic claim at all, a food or supplement route may apply instead, with quite different labelling rules.',
          citation_ids: ['d-uk-2'],
        },
      ],
    },
    {
      id: 'uk-why',
      kind: 'why',
      text:
        'The two jurisdictions ask different questions, so their answers are produced separately and never merged. ' +
        'What decides the Indian route is which category the formulation falls into; what decides the UK route is what you claim the product does.',
      citation_ids: ['d-uk-1'],
      claims: [
        {
          text: 'The two jurisdictions ask different questions, so their answers are produced separately and never merged.',
          citation_ids: [],
        },
        {
          text: 'What decides the Indian route is which category the formulation falls into; what decides the UK route is what you claim the product does.',
          citation_ids: ['d-uk-1'],
        },
      ],
    },
    {
      id: 'uk-check',
      kind: 'what_to_check',
      text:
        'Decide what you intend to claim on the packaging, because that choice picks the route. ' +
        'Assemble whatever evidence of traditional use you hold, and check what form it needs to be in. ' +
        'Check the ingredient list against what is permitted in the destination market rather than assuming the Indian formulation transfers.',
      citation_ids: ['d-uk-1', 'd-uk-2'],
      claims: [
        {
          text: 'Decide what you intend to claim on the packaging, because that choice picks the route.',
          citation_ids: [],
        },
        {
          text: 'Assemble whatever evidence of traditional use you hold, and check what form it needs to be in.',
          citation_ids: ['d-uk-1'],
        },
        {
          text: 'Check the ingredient list against what is permitted in the destination market rather than assuming the Indian formulation transfers.',
          citation_ids: ['d-uk-2'],
        },
      ],
    },
    {
      id: 'uk-caveat',
      kind: 'caveat',
      text:
        'Confidence here is low: the sources found are thinner than for the Indian position, and one of them is general guidance rather than a regulation. ' +
        'Treat this as a starting point for a conversation with someone who handles the destination market.',
      citation_ids: [],
      claims: [
        {
          text: 'Confidence here is low: the sources found are thinner than for the Indian position, and one of them is general guidance rather than a regulation.',
          citation_ids: [],
        },
        {
          text: 'Treat this as a starting point for a conversation with someone who handles the destination market.',
          citation_ids: [],
        },
      ],
    },
  ],
};

/**
 * One question, two answer sets, never merged. Switching jurisdiction swaps the
 * whole answer rather than filtering one.
 */
export const DEMO_ANSWERS: Record<Jurisdiction, Answer> = {
  IN: INDIA_ANSWER,
  INTL: UK_ANSWER,
};

export function demoCitationsFor(answer: Answer): DemoCitation[] {
  return answer.citations as DemoCitation[];
}
