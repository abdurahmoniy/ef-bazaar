import { describe, expect, it } from 'vitest';
import { isSafePopupPath, validateCampaign } from './campaign-form';
const valid={ title:'Taklif', message:'Birgalikda boshlang', tone:'INFO' as const, audience:'ALL' as const, recipientIds:[], trigger:'BROWSE' as const, actionLabel:'Ochish', actionPath:'/invite', startsAt:'2026-10-03T00:00:00Z', endsAt:'2026-10-04T00:00:00Z', priority:0 };
describe('admin campaign validation', () => {
  it('accepts a bounded campaign with an internal CTA', () => expect(validateCampaign(valid)).toBeNull());
  it.each(['https://x.com','//x.com','javascript:alert(1)','/auth/login?from=https://x.com','/marketplace/../admin','/marketplace?redirect=evil','/help/%2f%2fevil','/marketplace\\evil'])('rejects unsafe action path %s', path => expect(isSafePopupPath(path)).toBe(false));
  it('requires selected users, paired CTA fields and a bounded schedule', () => {
    expect(validateCampaign({...valid,audience:'SELECTED'})).toBeTruthy();
    expect(validateCampaign({...valid,actionLabel:''})).toBeTruthy();
    expect(validateCampaign({...valid,endsAt:valid.startsAt})).toBeTruthy();
    expect(validateCampaign({...valid,endsAt:'2027-01-01T00:00:00Z'})).toBeTruthy();
  });
});
