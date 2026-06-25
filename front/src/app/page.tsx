'use client';

import { useState } from 'react';
import AppShell, { type Section } from '@/components/layout/AppShell';
import MarketSection from '@/components/market/MarketSection';
import ProfileSection from '@/components/profile/ProfileSection';
import TournamentSection from '@/components/tournament/TournamentSection';
import { AuthProvider } from '@/lib/auth';

export default function Home() {
  const [section, setSection] = useState<Section>('tournament');

  return (
    <AuthProvider>
      <AppShell activeSection={section} onSectionChange={setSection}>
        {section === 'tournament' && <TournamentSection />}
        {section === 'market'     && <MarketSection />}
        {section === 'profile'    && <ProfileSection />}
      </AppShell>
    </AuthProvider>
  );
}
