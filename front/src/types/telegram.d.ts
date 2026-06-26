/**
 * Telegram WebApp SDK type declarations.
 * @see https://core.telegram.org/bots/webapps#initializing-mini-apps
 */

interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebAppInitData {
  query_id?: string;
  user?: TelegramWebAppUser;
  receiver?: TelegramWebAppUser;
  chat_instance?: string;
  chat_type?: string;
  start_param?: string;
  auth_date: number;
  hash: string;
}

interface TelegramWebApp {
  /** Raw init data string for server-side validation */
  initData: string;
  /** Parsed init data object */
  initDataUnsafe: TelegramWebAppInitData;
  /** App version */
  version: string;
  /** Current color scheme */
  colorScheme: 'light' | 'dark';
  /** Header color */
  headerColor: string;
  /** Background color */
  backgroundColor: string;
  /** Whether the app is expanded to full height */
  isExpanded: boolean;
  /** Viewport height */
  viewportHeight: number;
  /** Stable viewport height */
  viewportStableHeight: number;
  /** Inform Telegram that the app is ready */
  ready(): void;
  /** Expand the app to full height */
  expand(): void;
  /** Close the app */
  close(): void;
}

interface TelegramGlobal {
  WebApp: TelegramWebApp;
}

interface Window {
  Telegram?: TelegramGlobal;
}
