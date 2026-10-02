export type PopupTrigger = 'BROWSE' | 'LISTING_PUBLISHED' | 'EMPTY_SEARCH' | 'TRADE_COMPLETED';
export type PopupTone = 'INFO' | 'SUCCESS' | 'WARNING';
export type PopupAudience = 'ALL' | 'SELLERS' | 'SELECTED';
export type PopupStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';
export interface PopupMessage {
  id: string; title: string; message: string; tone: PopupTone; trigger: PopupTrigger;
  actionLabel?: string | null; actionPath?: string | null; endsAt: string;
}
export interface CampaignInput {
  title: string; message: string; tone: PopupTone; audience: PopupAudience; recipientIds: string[];
  trigger: PopupTrigger; actionLabel?: string | null; actionPath?: string | null;
  startsAt: string; endsAt: string; priority: number;
}
export interface PopupCampaign extends CampaignInput {
  id: string; status: PopupStatus; createdAt: string; createdBy: string;
  shownCount: number; clickedCount: number; dismissedCount: number;
}
export interface PopupDelivery { deliveryId: string; campaign: PopupMessage }
export type PopupEvent = 'SHOWN' | 'DISMISSED' | 'CLICKED';
