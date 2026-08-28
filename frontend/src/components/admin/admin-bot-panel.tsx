'use client';

import { useState } from 'react';
import { Bot, MessageSquare, Send } from 'lucide-react';

import { AdminBotBroadcast } from '@/components/admin/admin-bot-broadcast';
import { AdminBotSettings } from '@/components/admin/admin-bot-settings';
import type { BotSettings } from '@/lib/bot-settings';
import { cn } from '@/lib/utils';

type TabId = 'start' | 'broadcast';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'start', label: 'Start xabari', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'broadcast', label: 'Ommaviy xabar', icon: <Send className="h-4 w-4" /> },
];

interface AdminBotPanelProps {
  settings: BotSettings;
}

/**
 * Bot bo'limining tab konteyneri.
 *
 * <p>Tablar URL'ga chiqarilmagan va bu ataylab: ommaviy xabar kompozitorida
 * saqlanmagan qoralama turadi va sahifa qayta yuklansa u yo'qoladi. Tab
 * marshrut bo'lganda brauzerning "orqaga" tugmasi shu yo'qotishni bir
 * bosishda keltirib chiqarardi.
 */
export function AdminBotPanel({ settings }: AdminBotPanelProps) {
  const [active, setActive] = useState<TabId>('start');

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Bot sozlamalari</h1>
          <p className="text-sm text-muted-foreground">
            Telegram boti orqali chiqadigan xabarlar.
          </p>
        </div>
      </header>

      <nav className="overflow-x-auto no-scrollbar">
        <div className="flex min-w-max items-center gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                active === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/*
        Tab almashganda komponent yechib olinmaydi, yashiriladi. Aks holda
        ommaviy xabarda yozilgan matn va yig'ilgan tugmalar boshqa tabga
        o'tib qaytganda yo'qolardi.
      */}
      <div hidden={active !== 'start'}>
        <AdminBotSettings initial={settings} />
      </div>
      <div hidden={active !== 'broadcast'}>
        <AdminBotBroadcast />
      </div>
    </div>
  );
}
