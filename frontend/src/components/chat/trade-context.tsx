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
  fetchAccountRequest,
  roleInRequest,
  type AccountRequest,
} from '@/lib/account-request';
import { canUseSmartAdmin, resolveTradeListing } from '@/lib/trade-platform';
import { isHumanProposal } from '@/lib/trade-human';
import type { ChatResponse, ListingResponse } from '@/lib/marketplace-types';
import { getPublicTradeCommissionConfig } from '@/lib/payment-client';
import type { TradeCommissionConfig } from '@/lib/payment-types';
import { planPollTick } from '@/lib/trade-poll-plan';
import {
  isTerminalState,
  splitTrades,
  type PendingProposalResponse,
  type ProposalResponse,
  type TradeKind,
  type TradeMode,
  type TradeResponse,
} from '@/lib/trade-types';

const POLL_INTERVAL_MS = 4000;

export interface PendingProposal {
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
  reload: () => Promise<void>;
  handleProposalCreated: (
    p: ProposalResponse,
    priceUzs: number,
    mode: TradeMode,
    adminFeeUzs?: number,
    kind?: TradeKind,
  ) => void;
  handleProposalAccepted: () => Promise<void>;
  // Modals & Drawer state
  showPicker: boolean;
  setShowPicker: React.Dispatch<React.SetStateAction<boolean>>;
  showProposeModal: boolean;
  setShowProposeModal: React.Dispatch<React.SetStateAction<boolean>>;
  showAcceptModal: boolean;
  setShowAcceptModal: React.Dispatch<React.SetStateAction<boolean>>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  const role = roleInRequest(accountRequest, viewerId);
  const isSeller = role === 'SELLER';

  const [trades, setTrades] = useState<TradeResponse[] | null>(null);
  const [proposal, setProposal] = useState<PendingProposal | null>(
    initialPendingProposal
      ? {
          id: initialPendingProposal.proposalId,
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
  const [startingNew, setStartingNew] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [commissionConfig, setCommissionConfig] = useState<TradeCommissionConfig | null>(null);

  useEffect(() => {
    getPublicTradeCommissionConfig()
      .then((cfg) => setCommissionConfig(cfg))
      .catch(() => {});
  }, []);

  const reloadInFlight = useRef(false);
  const proposalPollInFlight = useRef(false);

  const { active: activeTrade, lastFinished } = splitTrades(trades);

  const reload = useCallback(async () => {
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    setRefreshing(true);
    try {
      const [list, request] = await Promise.all([
        fetchTradesByChat(chat.id),
        fetchAccountRequest(chat.id),
      ]);
      setTrades(list);
      setAccountRequest(request);
    } finally {
      setRefreshing(false);
      reloadInFlight.current = false;
    }
  }, [chat.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Polling for active trade state while non-terminal
  const activeTradeId = activeTrade?.id ?? null;
  const activeTradeState = activeTrade?.state ?? null;
  useEffect(() => {
    if (!activeTradeId || !activeTradeState) return;
    if (isTerminalState(activeTradeState)) return;
    const id = window.setInterval(() => {
      void reload();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [activeTradeId, activeTradeState, reload]);

  // Polling while no trade exists or proposal pending
  const hasProposal = proposal !== null;
  const hasActiveTrade = activeTrade !== null;
  useEffect(() => {
    if (planPollTick({ hasActiveTrade, hasProposal }) === 'stop') return;
    const tick = async () => {
      if (proposalPollInFlight.current) return;
      proposalPollInFlight.current = true;
      try {
        if (planPollTick({ hasActiveTrade, hasProposal }) === 'find-proposal') {
          const p = await fetchPendingProposal(chat.id);
          if (p) {
            setProposal({
              id: p.proposalId,
              listingId: p.listingId,
              priceUzs: p.amountUzs,
              expiresAt: p.expiresAt,
              mode: p.mode ?? undefined,
              adminId: p.adminId ?? undefined,
              adminFeeUzs: p.adminFeeUzs ?? undefined,
              kind: p.kind ?? undefined,
            });
            return;
          }
        }
        await reload();
      } finally {
        proposalPollInFlight.current = false;
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasActiveTrade, hasProposal, chat.id, reload]);

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
        listingId: accountRequest?.listingId ?? listing?.id,
        priceUzs,
        expiresAt: p.expiresAt,
        mode,
        adminFeeUzs,
        kind,
      });
      setShowProposeModal(false);
    },
    [accountRequest?.listingId, listing?.id],
  );

  const handleProposalAccepted = useCallback(async () => {
    setProposal(null);
    setShowAcceptModal(false);
    await reload();
    router.refresh();
  }, [reload, router]);

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
    reload,
    handleProposalCreated,
    handleProposalAccepted,
    showPicker,
    setShowPicker,
    showProposeModal,
    setShowProposeModal,
    showAcceptModal,
    setShowAcceptModal,
    isDrawerOpen,
    setIsDrawerOpen,
    commissionConfig,
    requiresAdminHandoff,
  };

  return <TradeContext.Provider value={value}>{children}</TradeContext.Provider>;
}

async function fetchTradesByChat(chatId: string): Promise<TradeResponse[]> {
  try {
    const response = await fetch(
      `/api/trade/v1/trades?chatId=${encodeURIComponent(chatId)}`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return [];
    return (await response.json()) as TradeResponse[];
  } catch {
    return [];
  }
}

async function fetchPendingProposal(
  chatId: string,
): Promise<PendingProposalResponse | null> {
  try {
    const response = await fetch(
      `/api/trade/v1/trades/proposals?chatId=${encodeURIComponent(chatId)}`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) return null;
    return (await response.json()) as PendingProposalResponse;
  } catch {
    return null;
  }
}
