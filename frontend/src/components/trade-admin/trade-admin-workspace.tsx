'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  UserCog,
  XCircle,
} from 'lucide-react';

import { CountdownText } from '@/components/trade-admin/countdown-text';
import { HumanTradeChecklist } from '@/components/trade-admin/human-trade-checklist';
import { HumanTradeMessages } from '@/components/trade-admin/human-trade-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import { buildTradeApiPath } from '@/lib/trade-client-api';
import { humanStepCompletion, validateAdminFee } from '@/lib/trade-human';
import {
  TRADE_STATE_LABEL_UZ,
  type TradeAdminProfileResponse,
  type TradeAdminProfileUpsertRequest,
  type TradeResponse,
  type TradeStep,
  type TradeStepResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 6000;

export function TradeAdminWorkspace({
  initialProfile,
  initialInvitations,
  initialTrades,
  initialTradeId,
}: {
  initialProfile: TradeAdminProfileResponse | null;
  initialInvitations: TradeResponse[];
  initialTrades: TradeResponse[];
  initialTradeId?: string;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [trades, setTrades] = useState(initialTrades);
  const [selectedTradeId, setSelectedTradeId] = useState(
    initialTradeId ?? initialTrades[0]?.id ?? initialInvitations[0]?.id ?? null,
  );
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const selectedTrade = useMemo(
    () =>
      trades.find((trade) => trade.id === selectedTradeId) ??
      invitations.find((trade) => trade.id === selectedTradeId) ??
      null,
    [trades, invitations, selectedTradeId],
  );

  const reloadLists = useCallback(async () => {
    const [nextProfile, nextInvitations, nextTrades] = await Promise.all([
      fetchMyProfile(),
      fetchMyInvitations(),
      fetchMyTrades(),
    ]);
    if (nextProfile.ok) setProfile(nextProfile.data);
    if (nextInvitations.ok) setInvitations(nextInvitations.data);
    if (nextTrades.ok) setTrades(nextTrades.data);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void reloadLists(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reloadLists]);

  function refresh() {
    startRefresh(async () => {
      setMessage(null);
      await reloadLists();
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-black text-foreground">Inson admin workspace</h1>
            <p className="text-sm text-muted-foreground">
              Takliflar, aktiv savdolar, checklist va ikki alohida chat.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Yangilash
        </Button>
      </header>

      {message && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-sm font-semibold',
            message.tone === 'ok'
              ? 'border-primary/25 bg-primary/5 text-primary'
              : 'border-destructive/25 bg-destructive/5 text-destructive',
          )}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
        <aside className="space-y-4">
          <ProfileEditor
            profile={profile}
            onSaved={(next) => {
              setProfile(next);
              setMessage({ tone: 'ok', text: 'Profil saqlandi' });
            }}
            onError={(text) => setMessage({ tone: 'error', text })}
          />

          <TradeList
            title="Takliflar"
            empty="Hozircha taklif yo'q."
            trades={invitations}
            selectedTradeId={selectedTradeId}
            invitation
            onSelect={setSelectedTradeId}
            onChanged={reloadLists}
            onMessage={setMessage}
          />

          <TradeList
            title="Aktiv savdolar"
            empty="Aktiv savdo yo'q."
            trades={trades}
            selectedTradeId={selectedTradeId}
            onSelect={setSelectedTradeId}
            onChanged={reloadLists}
            onMessage={setMessage}
          />
        </aside>

        <main className="min-w-0">
          {selectedTrade ? (
            <WorkspaceTradeDetail
              trade={selectedTrade}
              onChanged={reloadLists}
              onMessage={setMessage}
            />
          ) : (
            <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-border bg-card px-4 text-center text-sm text-muted-foreground">
              Savdoni tanlang.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ProfileEditor({
  profile,
  onSaved,
  onError,
}: {
  profile: TradeAdminProfileResponse | null;
  onSaved: (profile: TradeAdminProfileResponse) => void;
  onError: (text: string) => void;
}) {
  const [minFee, setMinFee] = useState(String(profile?.minFeeUzs ?? 20_000));
  const [maxFee, setMaxFee] = useState(String(profile?.maxFeeUzs ?? 50_000));
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [accepting, setAccepting] = useState(profile?.acceptingOrders ?? true);
  const [capacity, setCapacity] = useState(String(profile?.maxConcurrentTrades ?? 3));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMinFee(String(profile?.minFeeUzs ?? 20_000));
    setMaxFee(String(profile?.maxFeeUzs ?? 50_000));
    setBio(profile?.bio ?? '');
    setAccepting(profile?.acceptingOrders ?? true);
    setCapacity(String(profile?.maxConcurrentTrades ?? 3));
  }, [profile]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const minFeeUzs = Number(minFee);
    const maxFeeUzs = Number(maxFee);
    const maxConcurrentTrades = Number(capacity);
    if (!Number.isFinite(minFeeUzs) || minFeeUzs < 1) return onError("Minimal narx noto'g'ri");
    if (!Number.isFinite(maxFeeUzs) || maxFeeUzs < minFeeUzs) {
      return onError("Maksimal narx minimal narxdan kam bo'lmasligi kerak");
    }
    if (!Number.isInteger(maxConcurrentTrades) || maxConcurrentTrades < 1 || maxConcurrentTrades > 20) {
      return onError("Sig'im 1 dan 20 gacha bo'lishi kerak");
    }

    const payload: TradeAdminProfileUpsertRequest = {
      minFeeUzs,
      maxFeeUzs,
      bio: bio.trim() || undefined,
      acceptingOrders: accepting,
      maxConcurrentTrades,
    };
    startTransition(async () => {
      const result = await postProfile(payload);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onSaved(result.data);
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-card" onSubmit={save}>
      <div>
        <h2 className="text-sm font-black text-foreground">Profil</h2>
        <p className="text-xs text-muted-foreground">Narx bandi, bio va sig'im.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="admin-min-fee">Min narx</Label>
          <Input id="admin-min-fee" value={minFee} onChange={(e) => setMinFee(e.target.value)} type="number" min={1} />
        </div>
        <div>
          <Label htmlFor="admin-max-fee">Max narx</Label>
          <Input id="admin-max-fee" value={maxFee} onChange={(e) => setMaxFee(e.target.value)} type="number" min={1} />
        </div>
      </div>
      <div>
        <Label htmlFor="admin-capacity">Bir vaqtdagi savdolar</Label>
        <Input id="admin-capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={1} max={20} />
      </div>
      <div>
        <Label htmlFor="admin-bio">Bio</Label>
        <Textarea id="admin-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} />
      </div>
      <Checkbox
        checked={accepting}
        onChange={(e) => setAccepting(e.target.checked)}
        label="Buyurtma qabul qilaman"
        description="O'chirilsa yangi takliflar qabul qilinmaydi."
      />
      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Saqlash
      </Button>
    </form>
  );
}

function TradeList({
  title,
  empty,
  trades,
  selectedTradeId,
  invitation = false,
  onSelect,
  onChanged,
  onMessage,
}: {
  title: string;
  empty: string;
  trades: TradeResponse[];
  selectedTradeId: string | null;
  invitation?: boolean;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
  onMessage: (message: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-card">
      <h2 className="text-sm font-black text-foreground">{title}</h2>
      {trades.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {trades.map((trade) => (
            <li key={trade.id}>
              <button
                type="button"
                onClick={() => onSelect(trade.id)}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition hover:border-primary/40',
                  selectedTradeId === trade.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/20',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-foreground">{formatPriceUZS(trade.priceUzs)}</p>
                    <p className="text-[10.5px] text-muted-foreground">{trade.id.slice(0, 8)}</p>
                  </div>
                  <Badge variant={trade.state === 'IN_PROGRESS' ? 'verified' : 'muted'}>
                    {TRADE_STATE_LABEL_UZ[trade.state]}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
                  <span>{formatListingDate(trade.createdAt)}</span>
                  {trade.stateDeadline && (
                    <span>
                      <CountdownText until={trade.stateDeadline} prefix="Qoldi:" />
                    </span>
                  )}
                </div>
              </button>
              {invitation && (
                <InviteActions trade={trade} onChanged={onChanged} onMessage={onMessage} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteActions({
  trade,
  onChanged,
  onMessage,
}: {
  trade: TradeResponse;
  onChanged: () => Promise<void>;
  onMessage: (message: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  const [pending, startTransition] = useTransition();

  function act(path: 'admin-accept' | 'admin-decline') {
    startTransition(async () => {
      const result = await postTradeAction(trade.id, path);
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      onMessage({ tone: 'ok', text: path === 'admin-accept' ? 'Taklif qabul qilindi' : 'Taklif rad etildi' });
      await onChanged();
    });
  }

  return (
    <div className="-mt-1 flex gap-2 rounded-b-lg border-x border-b border-border bg-card px-2 pb-2">
      <Button type="button" size="sm" className="flex-1" disabled={pending} onClick={() => act('admin-accept')}>
        Qabul qilish
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act('admin-decline')}>
        Rad etish
      </Button>
    </div>
  );
}

function WorkspaceTradeDetail({
  trade,
  onChanged,
  onMessage,
}: {
  trade: TradeResponse;
  onChanged: () => Promise<void>;
  onMessage: (message: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  const [steps, setSteps] = useState<TradeStepResponse[] | null>(null);
  const [pending, startTransition] = useTransition();

  const completion = useMemo(() => humanStepCompletion(steps ?? []), [steps]);
  const editable = trade.state === 'IN_PROGRESS';

  const reloadSteps = useCallback(async () => {
    const result = await fetchSteps(trade.id);
    if (result.ok) setSteps(result.data);
    else onMessage({ tone: 'error', text: result.error });
  }, [trade.id, onMessage]);

  useEffect(() => {
    setSteps(null);
    void reloadSteps();
  }, [reloadSteps]);

  async function mark(step: TradeStep, note?: string) {
    const result = await postStep(trade.id, step, note);
    if (!result.ok) {
      onMessage({ tone: 'error', text: result.error });
      return;
    }
    await reloadSteps();
  }

  async function unmark(step: TradeStep) {
    const result = await deleteStep(trade.id, step);
    if (!result.ok) {
      onMessage({ tone: 'error', text: result.error });
      return;
    }
    await reloadSteps();
  }

  function closeTrade() {
    startTransition(async () => {
      const result = await postTradeAction(trade.id, 'admin-close');
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      onMessage({ tone: 'ok', text: 'Savdo yopildi, taraflar tasdiqlashi kutilmoqda' });
      await onChanged();
    });
  }

  function cancelTrade() {
    const reason = window.prompt('Bekor qilish sababi (ixtiyoriy)')?.trim();
    startTransition(async () => {
      const result = await postAdminCancel(trade.id, reason || undefined);
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      onMessage({ tone: 'ok', text: 'Savdo bekor qilindi' });
      await onChanged();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Savdo {trade.id.slice(0, 8)}
          </p>
          <h2 className="text-lg font-black text-foreground">{formatPriceUZS(trade.priceUzs)}</h2>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="verified">{TRADE_STATE_LABEL_UZ[trade.state]}</Badge>
            {trade.escalatedAt && <Badge variant="warn">Eskalatsiya</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void reloadSteps()}>
            <RefreshCw className="h-4 w-4" />
            Checklist
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !completion.allDone || trade.state !== 'IN_PROGRESS'}
            onClick={closeTrade}
          >
            <CheckCircle2 className="h-4 w-4" />
            Yopish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending || trade.state !== 'IN_PROGRESS'}
            onClick={cancelTrade}
          >
            <XCircle className="h-4 w-4" />
            Bekor
          </Button>
        </div>
      </div>

      {trade.mailboxEmail && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
          <p className="font-bold text-foreground">Platforma emaili</p>
          <code className="font-mono text-primary">{trade.mailboxEmail}</code>
        </div>
      )}

      {trade.escalatedAt && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{trade.escalationReason || "Admin jim qolgan, platform admin ko'rib chiqadi."}</p>
        </div>
      )}

      {steps === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checklist yuklanmoqda...
        </div>
      ) : (
        <HumanTradeChecklist
          steps={steps}
          editable={editable}
          disabled={pending}
          onMark={mark}
          onUnmark={unmark}
        />
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <HumanTradeMessages
          tradeId={trade.id}
          target="SELLER"
          title="Sotuvchi chati"
          readOnly={trade.state !== 'IN_PROGRESS' && trade.state !== 'WAITING_CLOSE_CONFIRM'}
        />
        <HumanTradeMessages
          tradeId={trade.id}
          target="BUYER"
          title="Xaridor chati"
          readOnly={trade.state !== 'IN_PROGRESS' && trade.state !== 'WAITING_CLOSE_CONFIRM'}
        />
      </div>
    </section>
  );
}

async function fetchMyProfile() {
  return fetchJson<TradeAdminProfileResponse>(buildTradeApiPath('v1/trade-admins/me'));
}

async function fetchMyInvitations() {
  return fetchJson<TradeResponse[]>(buildTradeApiPath('v1/trade-admins/me/invitations'));
}

async function fetchMyTrades() {
  return fetchJson<TradeResponse[]>(buildTradeApiPath('v1/trade-admins/me/trades'));
}

async function fetchSteps(tradeId: string) {
  return fetchJson<TradeStepResponse[]>(buildTradeApiPath(['v1', 'trades', tradeId, 'steps']));
}

async function postProfile(payload: TradeAdminProfileUpsertRequest) {
  return fetchJson<TradeAdminProfileResponse>(buildTradeApiPath('v1/trade-admins/me'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function postTradeAction(tradeId: string, action: 'admin-accept' | 'admin-decline' | 'admin-close') {
  return fetchJson<TradeResponse>(
    buildTradeApiPath(['v1', 'trades', tradeId, 'actions', action]),
    { method: 'POST' },
  );
}

async function postAdminCancel(tradeId: string, reason?: string) {
  return fetchJson<TradeResponse>(
    buildTradeApiPath(['v1', 'trades', tradeId, 'actions', 'admin-cancel']),
    { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) },
  );
}

async function postStep(tradeId: string, step: TradeStep, note?: string) {
  return fetchJson<TradeStepResponse>(
    buildTradeApiPath(['v1', 'trades', tradeId, 'steps', step]),
    { method: 'POST', body: JSON.stringify(note ? { note } : {}) },
  );
}

async function deleteStep(tradeId: string, step: TradeStep) {
  return fetchJson<void>(buildTradeApiPath(['v1', 'trades', tradeId, 'steps', step]), {
    method: 'DELETE',
  });
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
    if (response.status === 204) return { ok: true, data: undefined as T };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: 'Trade API bilan aloqa yo\'q' };
  }
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
  } catch {
    // ignore
  }
  return response.status === 401 || response.status === 403
    ? 'Kirish talab qilinadi'
    : "So'rov bajarilmadi";
}
