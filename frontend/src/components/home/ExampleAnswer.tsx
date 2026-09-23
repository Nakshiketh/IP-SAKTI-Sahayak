import { useTranslation } from 'react-i18next';

import { AnswerView } from '@/components/answer';
import { EXAMPLE_ANSWERS } from '@/services/answers.example';
import type { Jurisdiction } from '@/types/domain';

/**
 * The worked example on the homepage, in its own chunk.
 *
 * It reads the verified guidance corpus, which is too large to ride in the
 * first bundle, so the homepage loads it lazily as the section renders.
 */
export default function ExampleAnswer({ jurisdiction }: { jurisdiction: Jurisdiction }) {
  const { t: tc } = useTranslation('common');
  const answer = EXAMPLE_ANSWERS[jurisdiction];

  return (
    <AnswerView
      className="pt-6"
      answer={answer}
      confidenceReason={tc('confidence.reasons.high', {
        passages: answer.citations.length,
        documents: new Set(answer.citations.map((citation) => citation.document_id)).size,
      })}
    />
  );
}
