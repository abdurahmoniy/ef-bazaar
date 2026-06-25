import type {
  MatchResponse,
  StandingsRowResponse,
  TeamResponse,
  TelegramLoginPayload,
  TelegramWebAppPayload,
  TokenResponse,
  TournamentResponse,
} from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.chempox.uz';

export class ApiError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `API error ${status}`);
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('efb_token');
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('efb_token', token);
  else localStorage.removeItem('efb_token');
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    telegram: (payload: TelegramLoginPayload) =>
      request<TokenResponse>('/api/auth/telegram', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    telegramWebApp: (payload: TelegramWebAppPayload) =>
      request<TokenResponse>('/api/auth/telegram-webapp', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    me: () => request<import('@/types/api').UserResponse>('/api/me'),
  },
  tournaments: {
    list: () => request<TournamentResponse[]>('/api/tournaments'),
    active: () => request<TournamentResponse[]>('/api/tournaments/active'),
    get: (id: number) => request<TournamentResponse>(`/api/tournaments/${id}`),
    joined: () => request<TournamentResponse[]>('/api/tournaments/joined'),
    mine: () => request<TournamentResponse[]>('/api/tournaments/mine'),
  },
  teams: {
    byTournament: (id: number) => request<TeamResponse[]>(`/api/tournaments/${id}/teams`),
  },
  matches: {
    byTournament: (id: number, round?: number) => {
      const qs = round != null ? `?round=${round}` : '';
      return request<MatchResponse[]>(`/api/tournaments/${id}/matches${qs}`);
    },
    today: () => request<MatchResponse[]>('/api/me/matches/today'),
    get: (id: number) => request<MatchResponse>(`/api/matches/${id}`),
  },
  standings: {
    byTournament: (id: number) =>
      request<StandingsRowResponse[]>(`/api/tournaments/${id}/standings`),
    groups: (id: number) =>
      request<Record<string, StandingsRowResponse[]>>(`/api/tournaments/${id}/standings/groups`),
  },
};
