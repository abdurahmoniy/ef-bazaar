import Link from 'next/link';
import {
  BadgeCheck,
  Gamepad2,
  Package,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Trophy,
} from 'lucide-react';

import {
  TIER_META,
  TIER_ORDER,
  tierProgress,
  type GamerCardResponse,
  type GamerTier,
} from '@/lib/gamer-types';

import './gamer-card.css';

interface GamerCardViewProps {
  card: GamerCardResponse;
  /** id used by the PNG share button to find the capture root. */
  captureId?: string;
  /** Owner-only. Rendered under @username. Never pass on public /gamers/[id]. */
  email?: string | null;
}

function initialOf(name: string | null) {
  return (name?.trim()[0] || '?').toUpperCase();
}

/**
 * Profil sahifasidagi qisqa ko'rinish — bir qarashda ELO, daraja va
 * ko'tarilishgacha qolgan masofa. To'liq poster uchun GamerCardFullscreen.
 */
export function GamerCardCompact({
  card,
  actionsSlot,
}: {
  card: GamerCardResponse;
  /**
   * Card-scoped actions (share, overflow) rendered as the card's own footer.
   * On a phone these used to sit in a separate strip above the tab rail, which
   * read as page chrome even though every one of them acts on this card.
   */
  actionsSlot?: React.ReactNode;
}) {
  const tier = TIER_META[card.tier];
  const progress = tierProgress(card.tier, card.elo);
  const played = card.wins + card.draws + card.losses;

  return (
    <div
      className="gc-card gc-compact"
      style={{ '--m1': tier.m1, '--m2': tier.m2, '--m3': tier.m3 } as React.CSSProperties}
    >
      <div className="gc-c-top">
        <div className="gc-ava">{initialOf(card.displayName)}</div>
        <div className="gc-id">
          <div className="gc-name">
            <span>{card.displayName ?? "Noma'lum o'yinchi"}</span>
            {card.verified && <BadgeCheck className="gc-vfy" />}
          </div>
          {card.telegramUsername && <div className="gc-handle">@{card.telegramUsername}</div>}
        </div>
        <div className="gc-c-crest">
          <div className="gc-crest-layer gc-crest-outer" />
          <div className="gc-crest-layer gc-crest-inner" />
          <div className="gc-crest-layer gc-crest-face">
            <div className="gc-crest-tier">{tier.label.toUpperCase()}</div>
            <div className="gc-crest-elo">{card.elo}</div>
          </div>
          <div className="gc-crest-layer gc-crest-gloss" />
        </div>
      </div>

      <Ladder card={card} progress={progress} tier={tier} compact />

      <div className="gc-c-strip">
        <div>
          <b className="gc-c-w">{card.wins}</b>
          <span>G&apos;ALABA</span>
        </div>
        <div>
          <b>{card.draws}</b>
          <span>DURRANG</span>
        </div>
        <div>
          <b className="gc-c-l">{card.losses}</b>
          <span>YUTQAZISH</span>
        </div>
        <div>
          <b>{played === 0 || card.winRatePercent == null ? '—' : `${card.winRatePercent}%`}</b>
          <span>WIN RATE</span>
        </div>
      </div>

      {actionsSlot && <div className="gc-c-actions">{actionsSlot}</div>}
    </div>
  );
}

/** Ko'tarilish shkalasi — ikkala variantda ham bir xil mantiq. */
function Ladder({
  card,
  progress,
  tier,
  compact,
}: {
  card: GamerCardResponse;
  progress: ReturnType<typeof tierProgress>;
  tier: (typeof TIER_META)[GamerTier];
  compact?: boolean;
}) {
  return (
    <div className="gc-ladder">
      <div className="gc-lad-top">
        <div className="gc-lad-l">
          {progress.nextTier
            ? `KEYINGI: ${progress.nextTier.label.toUpperCase()} · ${progress.nextTier.min}`
            : 'ENG YUQORI DARAJA'}
        </div>
        <div className="gc-lad-r">
          {progress.eloToNext != null ? (
            <>
              <b>{progress.eloToNext}</b> ELO qoldi
            </>
          ) : (
            <b>TOP</b>
          )}
        </div>
      </div>
      <div className="gc-rail" role="img" aria-label={`Daraja: ${tier.label}, ${card.elo} ELO`}>
        {TIER_ORDER.map((key: GamerTier, i) => {
          const seg = TIER_META[key];
          const width = i < progress.index ? 100 : i === progress.index ? progress.percent : 0;
          return (
            <div
              key={key}
              className="gc-seg"
              style={{ '--c1': seg.m1, '--c2': seg.m2 } as React.CSSProperties}
            >
              <i style={{ width: `${width}%` }} />
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="gc-ticks">
          {TIER_ORDER.map((key: GamerTier, i) => (
            <span key={key} className={i <= progress.index ? 'gc-on' : undefined}>
              {TIER_META[key].short}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function platformLabel(platform: GamerCardResponse['platform']) {
  if (platform === 'BOTH') return 'Android + iOS';
  if (platform === 'ANDROID') return 'Android';
  if (platform === 'IOS') return 'iOS';
  return null;
}

/**
 * The Gamer Card — o'yinchining "raqamli pasporti" va ulashiladigan posteri.
 *
 * ELO kartaning markazi: daraja (tier) metall rangini, gerbni va ko'tarilish
 * shkalasini belgilaydi — o'yinchi keyingi darajagacha qancha qolganini
 * ko'rib turadi. Server component: state yo'q, faqat markup.
 *
 * Karta o'z ranglariga ega (sayt temasidan mustaqil), chunki u PNG ga
 * o'giriladi va Telegramga ulashiladi — light/dark da bir xil chiqishi shart.
 */
export function GamerCardView({ card, captureId, email }: GamerCardViewProps) {
  const tier = TIER_META[card.tier];
  const progress = tierProgress(card.tier, card.elo);

  const memberSince = card.memberSince ? new Date(card.memberSince) : null;
  const memberLabel =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? new Intl.DateTimeFormat('uz-UZ', { year: 'numeric', month: 'long' }).format(memberSince)
      : null;

  const played = card.wins + card.draws + card.losses;
  const platform = platformLabel(card.platform);

  return (
    <div
      id={captureId}
      className="gc-card"
      style={
        {
          '--m1': tier.m1,
          '--m2': tier.m2,
          '--m3': tier.m3,
        } as React.CSSProperties
      }
    >
      {/* identity */}
      <div className="gc-head">
        <div className="gc-ava">{initialOf(card.displayName)}</div>
        <div className="gc-id">
          <div className="gc-name">
            <span>{card.displayName ?? "Noma'lum o'yinchi"}</span>
            {card.verified && <BadgeCheck className="gc-vfy" />}
          </div>
          {card.telegramUsername && <div className="gc-handle">@{card.telegramUsername}</div>}
          {email && <div className="gc-email">{email}</div>}
          {platform && (
            <div className="gc-plats">
              <Gamepad2 />
              <span>{platform}</span>
            </div>
          )}
        </div>
      </div>

      {/* crest — ELO is the hero */}
      <div className="gc-crest-wrap">
        <div className="gc-crest">
          <div className="gc-crest-layer gc-crest-outer" />
          <div className="gc-crest-layer gc-crest-inner" />
          <div className="gc-crest-layer gc-crest-face">
            <div className="gc-crest-tier">{tier.label.toUpperCase()}</div>
            <div className="gc-crest-elo">{card.elo}</div>
            <div className="gc-crest-unit">ELO</div>
          </div>
          <div className="gc-crest-layer gc-crest-gloss" />
        </div>
        {card.highestDivision != null && (
          <div className="gc-crest-pill">DIVIZION {card.highestDivision}</div>
        )}
      </div>

      {/* promotion ladder */}
      <Ladder card={card} progress={progress} tier={tier} />

      {card.blacklisted && (
        <div className="gc-warn">
          <ShieldAlert />
          Bu foydalanuvchi qora ro&apos;yxatda — savdo qilishdan saqlaning!
        </div>
      )}

      {/* match record */}
      <div className="gc-grid">
        <div className="gc-tile gc-win">
          <div className="gc-tile-num">{card.wins}</div>
          <div className="gc-tile-cap">G&apos;ALABA</div>
        </div>
        <div className="gc-tile">
          <div className="gc-tile-num">{card.draws}</div>
          <div className="gc-tile-cap">DURRANG</div>
        </div>
        <div className="gc-tile gc-loss">
          <div className="gc-tile-num">{card.losses}</div>
          <div className="gc-tile-cap">YUTQAZISH</div>
        </div>
        <div className="gc-tile">
          <div className="gc-tile-num">
            {card.winRatePercent == null ? '—' : `${card.winRatePercent}%`}
          </div>
          <div className="gc-tile-cap">WIN RATE</div>
          {played > 0 ? (
            <div className="gc-wr-bar">
              <i className="gc-wr-w" style={{ width: `${(card.wins / played) * 100}%` }} />
              <i className="gc-wr-d" style={{ width: `${(card.draws / played) * 100}%` }} />
              <i className="gc-wr-l" style={{ width: `${(card.losses / played) * 100}%` }} />
            </div>
          ) : (
            <div className="gc-wr-dash" />
          )}
        </div>
      </div>

      {played === 0 && (
        <div className="gc-cta">
          <p>
            <b>Hali o&apos;yin yo&apos;q</b>
            Birinchi matchni o&apos;yna — ELO shu yerdan o&apos;sadi.
          </p>
          {email && <Link href="/tournaments">Match topish</Link>}
        </div>
      )}

      {/* trust rows */}
      <div className="gc-rows">
        <Link href="/tournaments" className="gc-row">
          <Trophy />
          <div>
            <div className="gc-row-num">{card.tournaments}</div>
            <div className="gc-row-cap">TURNIRLAR</div>
          </div>
        </Link>
        <div className="gc-row">
          <Swords />
          <div>
            <div className="gc-row-num">
              {card.matchesCount}{' '}
              <small>
                ({card.goalsFor}:{card.goalsAgainst})
              </small>
            </div>
            <div className="gc-row-cap">O&apos;YINLAR</div>
          </div>
        </div>
        <div className="gc-row">
          <Package />
          <div>
            <div className="gc-row-num">{card.soldListings}</div>
            <div className="gc-row-cap">SOTGAN</div>
          </div>
        </div>
        <div className="gc-row gc-escrow">
          <ShieldCheck />
          <div>
            <div className="gc-row-num">{card.escrowPurchases}</div>
            <div className="gc-row-cap">ESCROW OLGAN</div>
          </div>
        </div>
      </div>

      {card.bio && <p className="gc-bio">{card.bio}</p>}

      <div className="gc-meta">
        {card.favoriteTeam && (
          <div>
            <div className="gc-m-cap">JAMOA</div>
            <div className="gc-m-val">{card.favoriteTeam}</div>
          </div>
        )}
        {memberLabel && (
          <div>
            <div className="gc-m-cap">A&apos;ZO SANA</div>
            <div className="gc-m-val">{memberLabel}</div>
          </div>
        )}
        <div>
          <div className="gc-m-cap">FAOL E&apos;LON</div>
          <div className="gc-m-val">{card.activeListings}</div>
        </div>
        <div>
          <div className="gc-m-cap">PROFIL</div>
          <div className="gc-m-val gc-link">efbazaar.uz</div>
        </div>
      </div>

      <div className="gc-bar">
        <div className="gc-logo">e</div>
        <div className="gc-bar-name">efbazaar</div>
        <div className="gc-bar-tag">Play. Trade. Compete.</div>
      </div>
    </div>
  );
}
