import type { TradeState } from '@/lib/trade-types';
import { InvitationCard } from './invitation-card';

export function CompletedTradeInvite({ state }: { state: TradeState }) {
  if (state !== 'SUCCESS') return null;
  return <div className="mx-auto w-full max-w-md">
    <InvitationCard placement="completed_trade" compact dismissible title="Do‘stingizga ham tavsiya qiling"
      description="Savdongiz yakunlandi. Do‘stlaringizga efBazaar’ni ulashing va taklif mukofoti shartlarini ko‘ring." />
  </div>;
}
