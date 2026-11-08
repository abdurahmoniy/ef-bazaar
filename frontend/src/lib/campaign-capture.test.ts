import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN_CLICK_COOKIE,
  CAMPAIGN_COOKIE,
  campaignLinks,
  readCampaignCookie,
  readCampaignFromSearch,
} from './campaign-capture';

describe('readCampaignFromSearch', () => {
  it('reads and normalises the campaign parameter', () => {
    expect(readCampaignFromSearch('?c=grp23456')).toBe('GRP23456');
  });

  it('survives other parameters', () => {
    expect(readCampaignFromSearch('?utm_source=tg&c=GRP23456&ref=ABCD2345')).toBe('GRP23456');
  });

  it('never reads the referral parameters as a campaign', () => {
    // ?ref= va ?p= — "kim olib keldi"; ?c= — "qayerdan keldi".
    expect(readCampaignFromSearch('?ref=ABCD2345')).toBeNull();
    expect(readCampaignFromSearch('?p=ABCD2345')).toBeNull();
  });

  it('rejects anything that is not a code', () => {
    expect(readCampaignFromSearch('?c=<script>')).toBeNull();
    expect(readCampaignFromSearch('?c=TOOLONGCODE')).toBeNull();
    expect(readCampaignFromSearch('?c=')).toBeNull();
    expect(readCampaignFromSearch('')).toBeNull();
  });
});

describe('readCampaignCookie', () => {
  it('reads the named cookie and validates its shape', () => {
    const header = `a=1; ${CAMPAIGN_COOKIE}=GRP23456; ${CAMPAIGN_CLICK_COOKIE}=bad!`;
    expect(readCampaignCookie(header, CAMPAIGN_COOKIE)).toBe('GRP23456');
    expect(readCampaignCookie(header, CAMPAIGN_CLICK_COOKIE)).toBeNull();
    expect(readCampaignCookie('', CAMPAIGN_COOKIE)).toBeNull();
  });
});

describe('campaignLinks', () => {
  it('builds the site link and the bot deep link the bot parses', () => {
    // Prefiks `c_` — UpdateHandler.campaignPayload aynan shuni kutadi.
    expect(campaignLinks('GRP23456', 'https://efbazaar.uz', 'EfBazaarBot')).toEqual({
      site: 'https://efbazaar.uz/?c=GRP23456',
      bot: 'https://t.me/EfBazaarBot?start=c_GRP23456',
    });
  });

  it('omits the bot link when no bot is configured', () => {
    expect(campaignLinks('GRP23456', 'https://efbazaar.uz', '').bot).toBeNull();
  });
});
