import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { CampaignInput, PopupCampaign, PopupDelivery, PopupEvent, PopupMessage, PopupStatus, PopupTrigger } from './types';
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(buildMarketplaceApiPath(`v1/${path.split('?')[0]}`) + (path.includes('?') ? `?${path.split('?')[1]}` : ''), {
    credentials: 'same-origin', cache: 'no-store', ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'Bu amal uchun admin huquqi kerak.' : 'So‘rov bajarilmadi. Qayta urinib ko‘ring.');
  return response.status === 204 ? null as T : await response.json() as T;
}
export const nextPopup = (trigger: PopupTrigger, signal: AbortSignal) => request<PopupMessage | null>(`popups/next?trigger=${trigger}`, { signal });
export const claimPopup = (id: string, trigger: PopupTrigger, sessionId: string, signal: AbortSignal) => request<PopupDelivery | null>(`popups/${id}/claim`, { method: 'POST', body: JSON.stringify({ trigger, sessionId }), signal });
export const recordPopupEvent = (id: string, event: PopupEvent) => request<void>(`popups/deliveries/${id}/events`, { method: 'POST', body: JSON.stringify({ event }), keepalive: true });
export const listPopupCampaigns = () => request<PopupCampaign[]>('admin/popups');
export const createPopupCampaign = (campaign: CampaignInput) => request<PopupCampaign>('admin/popups', { method: 'POST', body: JSON.stringify(campaign) });
export const setPopupCampaignStatus = (id: string, status: Exclude<PopupStatus, 'DRAFT'>) => request<PopupCampaign>(`admin/popups/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
