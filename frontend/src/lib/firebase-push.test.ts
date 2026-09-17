// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  isSupported: vi.fn(), getToken: vi.fn(), deleteToken: vi.fn(), onMessage: vi.fn(),
}));
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase/messaging', () => ({ ...sdk, getMessaging: () => ({}) }));
import { enablePush, syncPushSubscription, disablePush, getPushAvailability } from './firebase-push';

const context = {
  userId: 'user-a', vapidKey: 'vapid',
  config: { apiKey: 'key', projectId: 'project', messagingSenderId: 'sender', appId: 'app' },
};
const requestPermission = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: vi.fn().mockResolvedValue({ active: {} }), getRegistration: vi.fn().mockResolvedValue(undefined),
  } });
  let lockQueue: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (_name: string, action: () => Promise<unknown>) => {
      const next = lockQueue.then(action, action);
      lockQueue = next.catch(() => undefined);
      return next;
    },
  } });
  sdk.isSupported.mockResolvedValue(true);
  sdk.getToken.mockResolvedValue('device-token');
  sdk.deleteToken.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('push subscription lifecycle', () => {
  it('does not prompt or initialize messaging without configuration', async () => {
    expect(await getPushAvailability({ ...context, config: null })).toBe('unconfigured');
    expect(sdk.getToken).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('never prompts for permission during automatic reconciliation', async () => {
    expect(await syncPushSubscription(context)).toBe('available');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not register a device when permission is denied', async () => {
    requestPermission.mockResolvedValue('denied');
    expect(await enablePush(context)).toBe('denied');
    expect(fetch).not.toHaveBeenCalled();
    expect(sdk.getToken).not.toHaveBeenCalled();
  });
  it('requests permission synchronously from the user click and persists only after registration', async () => {
    requestPermission.mockResolvedValue('granted');
    const pending = enablePush(context);
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(await pending).toBe('enabled');
    expect(fetch).toHaveBeenCalledWith('/api/push/subscription', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ token: 'device-token', userId: 'user-a' }),
    }));
    expect(JSON.parse(localStorage.getItem('efbazaar.push')!)).toEqual({ userId: 'user-a', token: 'device-token' });
  });
  it('does not claim success or keep a token if registration fails', async () => {
    requestPermission.mockResolvedValue('granted');
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(enablePush(context)).rejects.toThrow();
    expect(localStorage.getItem('efbazaar.push')).toBeNull();
    expect(sdk.deleteToken).toHaveBeenCalled();
  });
  it('removes the prior account token on account switching without opting the new user in', async () => {
    localStorage.setItem('efbazaar.push', JSON.stringify({ userId: 'user-old', token: 'old' }));
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    expect(await syncPushSubscription(context)).toBe('available');
    expect(sdk.deleteToken).toHaveBeenCalled();
    expect(sdk.getToken).not.toHaveBeenCalled();
    expect(localStorage.getItem('efbazaar.push')).toBeNull();
  });
  it('preserves an established subscription during a temporary registration outage', async () => {
    const saved = { userId: 'user-a', token: 'device-token' };
    localStorage.setItem('efbazaar.push', JSON.stringify(saved));
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await expect(syncPushSubscription(context)).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem('efbazaar.push')!)).toEqual(saved);
    expect(sdk.deleteToken).not.toHaveBeenCalled();
  });
  it('records opt-out and invalidates Firebase even when the server cannot be reached', async () => {
    localStorage.setItem('efbazaar.push', JSON.stringify({ userId: 'user-a', token: 'device-token' }));
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await expect(disablePush(context)).rejects.toThrow();
    expect(sdk.deleteToken).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('efbazaar.push')!).disabled).toBe(true);
  });
  it('never automatically reenables after a Firebase cleanup failure', async () => {
    localStorage.setItem('efbazaar.push', JSON.stringify({ userId: 'user-a', token: 'device-token' }));
    sdk.deleteToken.mockRejectedValue(new Error('Firebase unreachable'));
    await expect(disablePush(context)).rejects.toThrow();
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    await expect(syncPushSubscription(context)).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem('efbazaar.push')!).disabled).toBe(true);
    expect(sdk.getToken).not.toHaveBeenCalled();
  });
  it('serializes a concurrent opt-out after an in-flight registration', async () => {
    localStorage.setItem('efbazaar.push', JSON.stringify({ userId: 'user-a', token: 'device-token' }));
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    let completeRegistration!: (response: Response) => void;
    let registrationStarted!: () => void;
    const started = new Promise<void>((resolve) => { registrationStarted = resolve; });
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        registrationStarted();
        return new Promise<Response>((resolve) => { completeRegistration = resolve; });
      }
      return new Response(null, { status: 204 });
    });
    const refresh = syncPushSubscription(context);
    await started;
    const disable = disablePush(context);
    await Promise.resolve();
    expect(vi.mocked(fetch).mock.calls.map(([, options]) => options?.method)).toEqual(['PUT']);
    completeRegistration(new Response(null, { status: 204 }));
    await refresh;
    await disable;
    expect(localStorage.getItem('efbazaar.push')).toBeNull();
    expect(sdk.deleteToken).toHaveBeenCalled();
  });
  it('deletes remote registration and local token when disabled', async () => {
    localStorage.setItem('efbazaar.push', JSON.stringify({ userId: 'user-a', token: 'device-token' }));
    await disablePush(context);
    expect(fetch).toHaveBeenCalledWith('/api/push/subscription', expect.objectContaining({ method: 'DELETE' }));
    expect(sdk.deleteToken).toHaveBeenCalled();
    expect(localStorage.getItem('efbazaar.push')).toBeNull();
  });
});
