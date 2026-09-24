'use client';

import { useRouter } from 'next/navigation';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  roleInRequest,
  type AccountRequest,
} from '@/lib/account-request';
import { canUseSmartAdmin, resolveTradeListing } from '@/lib/trade-platform';
import { isHumanProposal } from '@/lib/trade-human';
import type { ChatResponse, ListingResponse, MessageResponse } from '@/lib/marketplace-types';
import { getPublicTradeCommissionConfig } from '@/lib/payment-client';
import type { TradeCommissionConfig } from '@/lib/payment-types';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import {
  splitTrades,
  tradeParticipantRole,
  type PendingProposalResponse,
  type ProposalResponse,
  type TradeKind,
  type TradeMode,
  type TradeResponse,
} from '@/lib/trade-types';

const POLL_INTERVAL_MS = 4000;
const IDLE_POLL_INTERVAL_MS = 30000;

export interface PendingProposal extends Pick<PendingProposalResponse, 'sellerId' | 'buyerId' | 'proposerUserId'> {
  listingId?: string | null;
  id: string;
  priceUzs: number;
  expiresAt: string;
  mode?: TradeMode;
  adminId?: string;
  adminFeeUzs?: number;
  kind?: TradeKind;
}

interface TradeContextValue {
  chat: ChatResponse;
  viewerId: string;
  listing: ListingResponse | null;
  otherPartyId: string;
  accountRequest: AccountRequest | null;
  setAccountRequest: React.Dispatch<React.SetStateAction<AccountRequest | null>>;
  role: 'SELLER' | 'BUYER' | null;
  isSeller: boolean;
  trades: TradeResponse[] | null;
  activeTrade: TradeResponse | null;
  lastFinished: TradeResponse | null;
  proposal: PendingProposal | null;
  setProposal: React.Dispatch<React.SetStateAction<PendingProposal | null>>;
  startingNew: boolean;
  setStartingNew: React.Dispatch<React.SetStateAction<boolean>>;
  refreshing: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  handleProposalCreated: (
    p: ProposalResponse,
    priceUzs: number,
    mode: TradeMode,
    adminFeeUzs?: number,
    kind?: TradeKind,
  ) => void;
  handleProposalAccepted: () => Promise<void>;
  handleProposalRejected: (proposalId: string) => Promise<void>;
  rejectedProposalIds: ReadonlySet<string>;
  rejectProposalId: string | null;
  setRejectProposalId: React.Dispatch<React.SetStateAction<string | null>>;
  // Modals & Drawer state
  showPicker: boolean;
  setShowPicker: React.Dispatch<React.SetStateAction<boolean>>;
  showProposeModal: boolean;
  setShowProposeModal: React.Dispatch<React.SetStateAction<boolean>>;
  showAcceptModal: boolean;
  setShowAcceptModal: React.Dispatch<React.SetStateAction<boolean>>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  viewedProposal: MessageResponse | null;
  openProposal: (message: MessageResponse) => void;
  viewedTrade: { id: string; listingId?: string | null } | null;
  openTrade: (tradeId: string, listingId?: string | null) => void;
  commissionConfig: TradeCommissionConfig | null;
  requiresAdminHandoff: boolean;
}

const TradeContext = createContext<TradeContextValue | null>(null);

export function useTradeContext(): TradeContextValue {
  const context = useContext(TradeContext);
  if (!context) {
    throw new Error('useTradeContext must be used within a TradeProvider');
  }
  return context;
}

interface TradeProviderProps {
  chat: ChatResponse;
  viewerId: string;
  listing: ListingResponse | null;
  initialPendingProposal?: PendingProposalResponse | null;
  children?: React.ReactNode;
}

export function TradeProvider({
  chat,
  viewerId,
  listing,
  initialPendingProposal = null,
  children,
}: TradeProviderProps) {
  const router = useRouter();
  const otherPartyId = chat.sellerId === viewerId ? chat.buyerId : chat.sellerId;

  const [accountRequest, setAccountRequest] = useState<AccountRequest | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [trades, setTrades] = useState<TradeResponse[] | null>(null);
  const proposalMutation = useRef(0);
  const [proposal, setProposalState] = useState<PendingProposal | null>(
    initialPendingProposal
      ? {
          id: initialPendingProposal.proposalId,
          sellerId: initialPendingProposal.sellerId,
          buyerId: initialPendingProposal.buyerId,
          proposerUserId: initialPendingProposal.proposerUserId,
          listingId: initialPendingProposal.listingId,
          priceUzs: initialPendingProposal.amountUzs,
          expiresAt: initialPendingProposal.expiresAt,
          mode: initialPendingProposal.mode ?? undefined,
          adminId: initialPendingProposal.adminId ?? undefined,
          adminFeeUzs: initialPendingProposal.adminFeeUzs ?? undefined,
          kind: initialPendingProposal.kind ?? undefined,
        }
      : null,
  );
  const setProposal = useCallback<React.Dispatch<React.SetStateAction<PendingProposal | null>>>((update) => {
    proposalMutation.current++;
    setProposalState(update);
  }, []);
  const [rejectProposalId, setRejectProposalId] = useState<string | null>(null);
  const [rejectedProposalIds, setRejectedProposalIds] = useState<ReadonlySet<string>>(new Set());
  const [startingNew, setStartingNew] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [viewedProposal, setViewedProposal] = useState<MessageResponse | null>(null);
  const [viewedTrade, setViewedTrade] = useState<TradeContextValue['viewedTrade']>(null);
  const setIsDrawerOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((open) => {
    setViewedProposal(null);
    setViewedTrade(null);
    setDrawerOpen(open);
  }, []);
  const openTrade = useCallback((id: string, listingId?: string | null) => {
    setViewedProposal(null);
    setViewedTrade({ id, listingId });
    setDrawerOpen(true);
  }, []);
  const openProposal = useCallback((message: MessageResponse) => {
    setViewedTrade(null);
    setViewedProposal(message);
    setDrawerOpen(true);
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commissionConfig, setCommissionConfig] = useState<TradeCommissionConfig | null>(null);

  useEffect(() => {
    getPublicTradeCommissionConfig()
      .then((cfg) => setCommissionConfig(cfg))
      .catch(() => {});
  }, []);

  const reloadInFlight = useRef(false);
  const reloadQueued = useRef(false);
  const automaticPollingStopped = useRef(false);
  const { active: activeTrade, lastFinished } = splitTrades(trades);
  const participants = proposal ?? activeTrade ?? (!startingNew ? lastFinished : null);
  const role = participants ? tradeParticipantRole(participants, viewerId) : roleInRequest(accountRequest, viewerId);
  const isSeller = role === 'SELLER';
  const hasActiveTrade = activeTrade !== null;
  const hasProposal = proposal !== null;

  const refresh = useCallback(async (): Promise<void> => {
    if (reloadInFlight.current || document.visibilityState === 'hidden' || !navigator.onLine) return;
    reloadInFlight.current = true;
    const mutationAtStart = proposalMutation.current;
    setRefreshing(true);
    try {
      const [list, request, pending] = await Promise.allSettled([
        readTradeData<TradeResponse[]>(`/api/trade/v1/trades?chatId=${encodeURIComponent(chat.id)}`),
        readTradeData<AccountRequest | null>(buildMarketplaceApiPath(['v1', 'chats', chat.id, 'account-request'])),
        readTradeData<PendingProposalResponse | null>(`/api/trade/v1/trades/proposals?chatId=${encodeURIComponent(chat.id)}`, true),
      ]);
      // A lookup that started before a create/accept/reject mutation cannot
      // replace the result the user has just confirmed.
      if (mutationAtStart !== proposalMutation.current) return;
      // Successful resources may advance independently; failed requests must
      // never erase the last known trade, account request, or proposal.
      if (list.status === 'fulfilled') setTrades(list.value);
      if (request.status === 'fulfilled') setAccountRequest(request.value);
      if (pending.status === 'fulfilled') {
        const p = pending.value;
        setProposalState(p ? {
          id: p.proposalId, listingId: p.listingId, priceUzs: p.amountUzs,
          sellerId: p.sellerId, buyerId: p.buyerId, proposerUserId: p.proposerUserId,
          expiresAt: p.expiresAt, mode: p.mode ?? undefined,
          adminId: p.adminId ?? undefined, adminFeeUzs: p.adminFeeUzs ?? undefined,
          kind: p.kind ?? undefined,
        } : null);
      }
      const failures = [list, request, pending].filter(result => result.status === 'rejected');
      automaticPollingStopped.current = failures.some(result =>
        result.reason instanceof TradeReadError && result.reason.permanent);
      setLoadError(failures.length ? 'Savdo ma’lumotlarini yangilab bo‘lmadi. Qayta urinib ko‘ring.' : null);
    } finally {
      setRefreshing(false);
      reloadInFlight.current = false;
      if (reloadQueued.current) {
        reloadQueued.current = false;
        void refresh();
      }
    }
  }, [chat.id]);

  const reload = useCallback(async () => {
    automaticPollingStopped.current = false;
    if (reloadInFlight.current) {
      reloadQueued.current = true;
      return;
    }
    await refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const tick = () => {
      if (!automaticPollingStopped.current) void refresh();
    };
    // Empty conversations and transient outages do not need a request every
    // four seconds. An active negotiation retains the faster cadence.
    const delay = loadError || (!hasActiveTrade && !hasProposal) ? IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    const id = window.setInterval(tick, delay);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [hasActiveTrade, hasProposal, loadError, refresh]);

  const handleProposalCreated = useCallback(
    (
      p: ProposalResponse,
      priceUzs: number,
      mode: TradeMode,
      adminFeeUzs?: number,
      kind?: TradeKind,
    ) => {
      setProposal({
        id: p.proposalId,
        sellerId: viewerId,
        buyerId: accountRequest?.requesterId ?? otherPartyId,
        proposerUserId: viewerId,
        listingId: accountRequest?.listingId ?? listing?.id,
        priceUzs,
        expiresAt: p.expiresAt,
        mode,
        adminFeeUzs,
        kind,
      });
      setShowProposeModal(false);
    },
    [accountRequest?.listingId, accountRequest?.requesterId, listing?.id, otherPartyId, viewerId, setProposal],
  );

  const handleProposalAccepted = useCallback(async () => {
    setProposal(null);
    setShowAcceptModal(false);
    await reload();
    router.refresh();
  }, [reload, router, setProposal]);

  const handleProposalRejected = useCallback(async (proposalId: string) => {
    setRejectedProposalIds(previous => new Set(previous).add(proposalId));
    setProposal(current => current?.id === proposalId ? null : current);
    setRejectProposalId(null);
    setShowAcceptModal(false);
    await reload();
    router.refresh();
  }, [reload, router, setProposal]);

  const selectedListing = resolveTradeListing(accountRequest, listing);
  const tradeListing = proposal
    ? [selectedListing, listing].find((item) => item?.id === proposal.listingId) ?? null
    : selectedListing;
  const requiresAdminHandoff = !(proposal && isHumanProposal(proposal)) && !canUseSmartAdmin(tradeListing);

  const value: TradeContextValue = {
    chat,
    viewerId,
    listing,
    otherPartyId,
    accountRequest,
    setAccountRequest,
    role,
    isSeller,
    trades,
    activeTrade,
    lastFinished,
    proposal,
    setProposal,
    startingNew,
    setStartingNew,
    refreshing,
    loadError,
    reload,
    handleProposalCreated,
    handleProposalAccepted,
    handleProposalRejected,
    rejectedProposalIds,
    rejectProposalId,
    setRejectProposalId,
    showPicker,
    setShowPicker,
    showProposeModal,
    setShowProposeModal,
    showAcceptModal,
    setShowAcceptModal,
    isDrawerOpen,
    setIsDrawerOpen,
    viewedTrade,
    openTrade,
    viewedProposal,
    openProposal,
    commissionConfig,
    requiresAdminHandoff,
  };

  return <TradeContext.Provider value={value}>{children}</TradeContext.Provider>;
}

class TradeReadError extends Error {
  permanent: boolean;
  constructor(status: number) {
    super(`Trade request failed (${status})`);
    this.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
}

async function readTradeData<T>(path: string, proposalLookup = false): Promise<T> {
  const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
  // TradeProposalController explicitly uses 404 for no accessible proposal.
  // Other endpoints' 404s and all other non-success responses are failures.
  if ((proposalLookup && response.status === 404) || response.status === 204) return null as T;
  if (!response.ok) throw new TradeReadError(response.status);
  return await response.json() as T;
}
