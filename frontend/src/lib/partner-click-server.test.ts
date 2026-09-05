import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { recordChannelClick } = await import('./partner-click-server');

describe('recordChannelClick', () => {
  beforeEach(() => apiFetch.mockClear());

  it('hands apiFetch an object, never a pre-stringified body', () => {
    // apiFetch stringifies the body itself. Passing a string wraps it
    // twice, and the server then sees a JSON *string* at the root:
    // "Cannot construct instance of ClickRequest ... from String value".
    // The click was never recorded, so the partner earned nothing from
    // a trade they had actually brought in.
    recordChannelClick('RM5JPZVF', '43ca2355-5f28-402e-90c6-679bbb6a7820');

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, options] = apiFetch.mock.calls[0] as [string, { body: unknown }];
    expect(typeof options.body).toBe('object');
    expect(options.body).toEqual({
      linkCode: 'RM5JPZVF',
      listingId: '43ca2355-5f28-402e-90c6-679bbb6a7820',
    });
  });

  it('uppercases the code so a lowercase link still credits the partner', () => {
    recordChannelClick(' rm5jpzvf ', 'listing-1');

    const [, options] = apiFetch.mock.calls[0] as [string, { body: { linkCode: string } }];
    expect(options.body.linkCode).toBe('RM5JPZVF');
  });

  it('sends nothing when the code is not a link code', () => {
    // Anything can land in the query string. A malformed code is not
    // worth a round trip, and the server rejects it anyway.
    recordChannelClick('nope', 'listing-1');
    recordChannelClick(undefined, 'listing-1');
    recordChannelClick('TOOLONGCODE123', 'listing-1');

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
