import { useTranslation } from 'react-i18next';

import { Button, Card } from '@/components/ui';

/**
 * How a flow is reached.
 *
 * Never a navigation item. Each flow is offered by an answer that needed it, as
 * a card inside that answer — at the moment the reader has just discovered the
 * gap it fills. Putting these in the nav would make them three more things to
 * choose between before asking anything.
 */
export type FlowKind = 'classify' | 'abs' | 'priorArt';

/** One heading above the group; repeating it per card would be noise. */
export function FlowOffers({
  kinds,
  onOpen,
}: {
  kinds: readonly FlowKind[];
  onOpen: (kind: FlowKind) => void;
}) {
  const { t } = useTranslation('sahayak');
  if (kinds.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="text-xs text-muted">{t('flows.offerHeading')}</p>
      <div className="mt-2 space-y-3">
        {kinds.map((kind) => (
          <FlowOffer key={kind} kind={kind} onOpen={() => onOpen(kind)} />
        ))}
      </div>
    </section>
  );
}

function FlowOffer({ kind, onOpen }: { kind: FlowKind; onOpen: () => void }) {
  const { t } = useTranslation('sahayak');

  return (
    <Card variant="action" className="max-w-measure">
      <p className="max-w-none text-base">{t(`flows.${kind}.offer`)}</p>
      <Button size="sm" className="mt-3" onClick={onOpen}>
        {t(`flows.${kind}.open`)}
      </Button>
    </Card>
  );
}
