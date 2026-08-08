'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { CheckCircle2, Clock3, Send, ShieldCheck, UserCog, XCircle } from 'lucide-react';

import { submitTradeAdminApplicationAction } from '@/app/profile/trade-admin-application-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  canSubmitTradeAdminApplication,
  tradeAdminApplicationStatusBadge,
  tradeAdminApplicationStatusText,
  type TradeAdminApplicationResponse,
} from '@/lib/trade-admin-applications';
import { cn } from '@/lib/utils';

interface TradeAdminApplicationPanelProps {
  application: TradeAdminApplicationResponse | null;
  isTradeAdmin: boolean;
  defaultContact?: string;
}

export function TradeAdminApplicationPanel({
  application,
  isTradeAdmin,
  defaultContact,
}: TradeAdminApplicationPanelProps) {
  const [current, setCurrent] = useState(application);
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState(defaultContact ?? '');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const canSubmit = canSubmitTradeAdminApplication(isTradeAdmin, current);
  const status = isTradeAdmin
    ? { label: 'Tasdiqlangan', variant: 'verified' as const }
    : current
      ? tradeAdminApplicationStatusBadge(current.status)
      : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 20) {
      setMessage({ tone: 'error', text: "Ariza kamida 20 ta belgidan iborat bo'lsin" });
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const result = await submitTradeAdminApplicationAction({
        reason: trimmedReason,
        contact: contact.trim() || undefined,
      });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setCurrent(result.data);
      setReason('');
      setMessage({ tone: 'ok', text: 'Ariza yuborildi' });
    });
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserCog className="h-5 w-5 text-primary" />
          Inson adminlik
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <StatusIcon status={isTradeAdmin ? 'APPROVED' : current?.status} />
            <p className="text-sm font-semibold text-foreground">
              {isTradeAdmin
                ? 'Siz inson admin sifatida ishlay olasiz'
                : tradeAdminApplicationStatusText(current)}
            </p>
          </div>
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
        </div>

        {message && (
          <p
            className={cn(
              'rounded-lg border px-3 py-2 text-sm font-semibold',
              message.tone === 'ok'
                ? 'border-primary/25 bg-primary/5 text-primary'
                : 'border-destructive/25 bg-destructive/5 text-destructive',
            )}
          >
            {message.text}
          </p>
        )}

        {isTradeAdmin || current?.status === 'APPROVED' ? (
          <Button asChild>
            <Link href="/trade-admin">
              <ShieldCheck className="h-4 w-4" />
              Workspace ochish
            </Link>
          </Button>
        ) : canSubmit ? (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="trade-admin-reason">Nima uchun inson admin bo'lmoqchisiz?</Label>
              <Textarea
                id="trade-admin-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Savdo tajribangiz, vaqt ajrata olishingiz va qanday yordam berishingizni yozing."
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-admin-contact">Aloqa uchun kontakt</Label>
              <Input
                id="trade-admin-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={255}
                placeholder="@username yoki email"
                disabled={pending}
              />
            </div>
            <Button type="submit" disabled={pending}>
              <Send className="h-4 w-4" />
              Ariza yuborish
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Adminlar arizani ko'rib chiqadi. Javob shu yerda ko'rinadi.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status?: TradeAdminApplicationResponse['status'] }) {
  if (status === 'APPROVED') return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === 'REJECTED') return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock3 className="h-4 w-4 text-amber-600" />;
}
