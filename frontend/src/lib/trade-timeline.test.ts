import { describe, expect, it } from 'vitest';
import { tradeTimeline } from './trade-timeline';
import type { TradeResponse, TradeState } from './trade-types';

const trade = (state: TradeState, mode: 'SMART' | 'HUMAN' = 'SMART') => ({ state, mode, kind: 'SALE' }) as TradeResponse;
const flow: TradeState[] = ['INITIATED', 'WAITING_PAYMENT', 'WAITING_EMAIL_CHANGE', 'VERIFYING_KONAMI_LINK', 'WAITING_PASSWORD', 'WAITING_BUYER_VERIFY', 'SUCCESS'];

describe('full trade timeline', () => {
  it.each(flow)('marks only reached steps green and the current %s step yellow', state => {
    const steps = tradeTimeline('ACCEPTED', trade(state));
    expect(steps).toHaveLength(9);
    const currentIndex = flow.indexOf(state) + 2;
    steps.forEach((step, index) => expect(step.status).toBe(state === 'SUCCESS' || index < currentIndex ? 'passed' : index === currentIndex ? 'current' : 'next'));
  });

  it('includes upcoming steps for an unaccepted request', () => {
    const steps = tradeTimeline('PENDING');
    expect(steps[0].status).toBe('passed');
    expect(steps[1].status).toBe('current');
    expect(steps.slice(2).every(step => step.status === 'next')).toBe(true);
  });

  it.each(['REJECTED', 'EXPIRED'] as const)('marks a %s proposal red without claiming the trade began', outcome => {
    const steps = tradeTimeline(outcome);
    expect(steps[1].status).toBe('failed');
    expect(steps.slice(2).every(step => step.status === 'next')).toBe(true);
  });

  it('marks buyer rejection red and leaves completion gray', () => {
    const steps = tradeTimeline('ACCEPTED', trade('REJECTED'));
    expect(steps.slice(0, -2).every(step => step.status === 'passed')).toBe(true);
    expect(steps.at(-2)).toMatchObject({ id: 'WAITING_BUYER_VERIFY', status: 'failed' });
    expect(steps.at(-1)).toMatchObject({ id: 'SUCCESS', status: 'next' });
  });

  it('shows the human-admin flow without smart-only stages', () => {
    const steps = tradeTimeline('ACCEPTED', trade('WAITING_CLOSE_CONFIRM', 'HUMAN'));
    expect(steps.map(step => step.id)).toEqual(['SENT', 'ACCEPTED', 'INITIATED', 'WAITING_ADMIN', 'IN_PROGRESS', 'WAITING_CLOSE_CONFIRM', 'SUCCESS']);
    expect(steps.at(-2)?.status).toBe('current');
    expect(steps.slice(0, -2).every(step => step.status === 'passed')).toBe(true);
  });

  it('marks human-admin cancellation at the work stage', () => {
    const steps = tradeTimeline('ACCEPTED', trade('REJECTED', 'HUMAN'));
    expect(steps.find(step => step.id === 'IN_PROGRESS')?.status).toBe('failed');
    expect(steps.find(step => step.id === 'WAITING_CLOSE_CONFIRM')?.status).toBe('next');
  });

  it('shows the complete flow for historical accepted requests without inventing progress', () => {
    const steps = tradeTimeline('ACCEPTED');
    expect(steps).toHaveLength(9);
    expect(steps.slice(0, 2).every(step => step.status === 'passed')).toBe(true);
    expect(steps.slice(2).every(step => step.status === 'unknown')).toBe(true);
  });

  it('does not claim an unknown request was accepted', () => {
    expect(tradeTimeline('UNKNOWN').slice(1).every(step => step.status === 'unknown')).toBe(true);
  });

  it('does not invent a last completed stage for a timed-out trade', () => {
    const steps = tradeTimeline('ACCEPTED', trade('ORPHANED'));
    expect(steps.slice(2, -1).every(step => step.status === 'unknown')).toBe(true);
    expect(steps.at(-1)).toMatchObject({ id: 'ORPHANED', status: 'failed' });
    expect(steps.some(step => step.status === 'current')).toBe(false);
  });

  it('labels exchange confirmation without suggesting a payment for pure swaps', () => {
    const steps = tradeTimeline('PENDING', null, 'SWAP');
    expect(steps.find(step => step.id === 'WAITING_PAYMENT')?.label).toContain('Almashish');
    expect(steps.find(step => step.id === 'WAITING_BUYER_VERIFY')?.label).toContain('Ikkala');
  });
});
