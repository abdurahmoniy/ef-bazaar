// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteConfig } from '@/lib/site';
import { SOCIAL_LINKS } from '@/components/brand/social-icons';

describe('social media integration', () => {
  it('siteConfig exposes valid social media URLs', () => {
    expect(siteConfig.links.telegram).toMatch(/^https:\/\/t\.me\//);
    expect(siteConfig.links.telegramBot).toMatch(/^https:\/\/t\.me\//);
    expect(siteConfig.links.telegramChannel).toMatch(/^https:\/\/t\.me\//);
    expect(siteConfig.links.instagram).toMatch(/^https:\/\/(www\.)?instagram\.com\/efbazaar\.uz/);
  });

  it('SOCIAL_LINKS lists telegram channel, bot, and instagram', () => {
    const names = SOCIAL_LINKS.map((s) => s.name);
    expect(names).toContain('Telegram Kanal');
    expect(names).toContain('Telegram Bot');
    expect(names).toContain('Instagram');

    for (const link of SOCIAL_LINKS) {
      expect(link.href).toBeTruthy();
      expect(link.label).toBeTruthy();
      expect(link.icon).toBeTruthy();
    }
  });

  it('SiteFooter references telegram channel and instagram', () => {
    const footerSource = readFileSync(
      path.join(process.cwd(), 'src/components/site-footer.tsx'),
      'utf8'
    );
    expect(footerSource).toContain('siteConfig.links.telegramChannel');
    expect(footerSource).toContain('siteConfig.links.instagram');
    expect(footerSource).toContain('SocialLinksRow');
  });

  it('HelpView references telegram channel and instagram', () => {
    const helpSource = readFileSync(
      path.join(process.cwd(), 'src/components/help/help-view.tsx'),
      'utf8'
    );
    expect(helpSource).toContain('siteConfig.links.telegramChannel');
    expect(helpSource).toContain('siteConfig.links.instagram');
  });

  it('ProfileAccount references telegram channel and instagram', () => {
    const profileSource = readFileSync(
      path.join(process.cwd(), 'src/components/profile/profile-account.tsx'),
      'utf8'
    );
    expect(profileSource).toContain('siteConfig.links.telegramChannel');
    expect(profileSource).toContain('siteConfig.links.instagram');
    expect(profileSource).toContain('Biz ijtimoiy tarmoqlarda');
  });
});
