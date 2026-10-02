import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, apiFetch: mocks.apiFetch };
});

import { ApiException } from './api';
import { getCardInterestCounts, getDreamTeams, getListingMatch, recFetch } from './rec-server';

beforeEach(() => vi.resetAllMocks());

it('routes every call through the internal /rec prefix', async () => {
  mocks.apiFetch.mockResolvedValue({ ids: [] });
  await recFetch('v1/match?matchCard=1');
  expect(mocks.apiFetch).toHaveBeenCalledWith('/rec/v1/match?matchCard=1', undefined);
});

it('loads dream teams from recommendation-service', async () => {
  mocks.apiFetch.mockResolvedValue([{ id: 't' }]);
  expect(await getDreamTeams()).toEqual({ ok: true, data: [{ id: 't' }] });
  expect(mocks.apiFetch).toHaveBeenCalledWith('/rec/v1/dream-teams', undefined);
});

it('asks for one listing match with the active criteria', async () => {
  mocks.apiFetch.mockResolvedValue({ percent: 75 });
  const details = await getListingMatch('abc', ['101:p:N', '202:q:P'], 6);
  expect(details).toEqual({ percent: 75 });
  expect(mocks.apiFetch).toHaveBeenCalledWith(
    '/rec/v1/match/abc?matchCard=101%3Ap%3AN&matchCard=202%3Aq%3AP&matchStrictness=6', undefined);
});

it('skips the match call without criteria and swallows its failure', async () => {
  expect(await getListingMatch('abc', [], undefined)).toBeNull();
  expect(mocks.apiFetch).not.toHaveBeenCalled();
  mocks.apiFetch.mockRejectedValue(new ApiException({ status: 404, error: 'Not Found', code: 'listing_not_found', message: 'x' }));
  expect(await getListingMatch('abc', ['101:p:N'], undefined)).toBeNull();
});

it('returns interest counts and zero-safe empty map when rec is down', async () => {
  mocks.apiFetch.mockResolvedValue({ '10': { days7: 2, days30: 5 } });
  expect(await getCardInterestCounts([10, 10, 11])).toEqual({ '10': { days7: 2, days30: 5 } });
  expect(mocks.apiFetch).toHaveBeenCalledWith('/rec/v1/card-interest/counts?ids=10&ids=11', undefined);
  mocks.apiFetch.mockRejectedValue(new Error('down'));
  expect(await getCardInterestCounts([10])).toEqual({});
  expect(await getCardInterestCounts([])).toEqual({});
});
