// __tests__/sinks.jira.test.ts
import { JiraSink } from '../src/sinks/jira.sink';
import type { TimeSinkConfig } from '../src/core/sink';
import type { Session } from '../src/core/types';

function makeCfg(overrides?: Partial<TimeSinkConfig['options']>): TimeSinkConfig {
  return {
    kind: 'jira',
    enabled: true,
    options: {
      'jira.domain': 'team.atlassian.net',
      'jira.email': 'dev@example.com',
      'jira.apiToken': 'ATAT-123',
      ...overrides,
    },
  };
}

function makeSession(overrides?: Partial<Session>): Session {
  return {
    startedIso: '2025-01-01T00:00:00.000Z',
    endedIso: '2025-01-01T00:15:00.000Z',
    durationSeconds: 900,
    workspace: 'ws',
    repoPath: '/repo',
    branch: 'feature/TP-123',
    issueKey: 'TP-123',
    comment: 'Worked on login',
    meta: {},
    ...overrides,
  };
}

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json?: () => Promise<any>;
};

function makeFetch(...responses: MockResponse[]): jest.Mock {
  const fn = jest.fn();
  responses.forEach(r => fn.mockResolvedValueOnce(r));
  return fn;
}
const okJson = (obj: any = {}) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(obj), json: async () => obj }) as MockResponse;
const created = () =>
  ({ ok: true, status: 201, text: async () => '' }) as MockResponse;
const fail = (status = 401, body = 'Unauthorized') =>
  ({ ok: false, status, text: async () => body }) as MockResponse;

describe('JiraSink', () => {
  test('posts worklog when creds + issueKey present (preflight then post)', async () => {
    // 1) preflight GET 200, 2) POST 201
    const fetch = makeFetch(okJson({ id: '10000', key: 'TP-123' }), created());
    const sink = new JiraSink(makeCfg(), fetch);

    const s = makeSession({ durationSeconds: 2700 });
    const result = await sink.export(s);

    expect(result.ok).toBe(true);
    expect(String(result.message)).toContain('Jira');

    // Two calls: preflight GET then POST worklog
    expect(fetch).toHaveBeenCalledTimes(2);

    // First call: preflight GET to /issue/{key}?fields=id,key
    const [preUrl, preInit] = fetch.mock.calls[0];
    expect(String(preUrl)).toBe(
      'https://team.atlassian.net/rest/api/3/issue/TP-123?fields=id,key'
    );
    expect((preInit?.method ?? 'GET')).toBe('GET');

    // Second call: POST worklog
    const [url, init] = fetch.mock.calls[1];
    expect(String(url)).toBe('https://team.atlassian.net/rest/api/3/issue/TP-123/worklog');
    expect(init?.method).toBe('POST');

    const headers = (init?.headers || {}) as Record<string, string>;
    expect(headers['Authorization'] || headers['authorization']).toMatch(/^Basic\s+/);
    expect(headers['Content-Type'] || headers['content-type']).toBe('application/json');

    const body = JSON.parse(String(init?.body));
    expect(body.timeSpentSeconds).toBe(2700);
    // +0000 timezone format (not Z)
    expect(body.started).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+0000$/);
    // ADF comment
    expect(body.comment?.type).toBe('doc');
    expect(body.comment?.content?.[0]?.type).toBe('paragraph');
  });

  test('skips when no issueKey (returns ok with skip message, no network)', async () => {
    const fetch = makeFetch(); // no calls expected
    const sink = new JiraSink(makeCfg(), fetch);

    const s = makeSession({ issueKey: null, branch: 'feature/no-ticket' });
    const result = await sink.export(s);

    expect(result.ok).toBe(true);
    expect(String(result.message)).toMatch(/skipped/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('propagates POST auth error after successful preflight', async () => {
    // Preflight OK, but POST 403 => sink returns "Jira auth failed (403)"
    const fetch = makeFetch(okJson({ id: '10000', key: 'TP-123' }), fail(403, 'Forbidden'));
    const sink = new JiraSink(makeCfg(), fetch);

    const s = makeSession();
    const result = await sink.export(s);

    expect(result.ok).toBe(false);
    expect(String(result.message)).toContain('Jira auth failed (403)');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('normalizes domain with protocol/trailing slash', async () => {
    const fetch = makeFetch(okJson({ id: '10000', key: 'TP-123' }), created());
    const cfg = makeCfg({ 'jira.domain': 'https://my-team.atlassian.net/' });
    const sink = new JiraSink(cfg, fetch);

    await sink.export(makeSession());

    // Second call is the POST worklog — check URL normalization there
    const [postUrl] = fetch.mock.calls[1];
    expect(String(postUrl)).toBe(
      'https://my-team.atlassian.net/rest/api/3/issue/TP-123/worklog'
    );
  });

  test('emits default comment when session.comment is empty', async () => {
    const fetch = makeFetch(okJson({ id: '10000', key: 'TP-123' }), created());
    const sink = new JiraSink(makeCfg(), fetch);

    await sink.export(makeSession({ comment: '   ' }));

    const [, init] = fetch.mock.calls[1]; // POST call
    const body = JSON.parse(String(init?.body));
    const textNode = body.comment?.content?.[0]?.content?.[0];
    expect(textNode?.text).toBe('Logged by Clockit');
  });

  test('uses comment-derived issue key when no git info present', async () => {
    const fetch = makeFetch(okJson({ id: '10000', key: 'TP-777' }), created());
    const sink = new JiraSink(makeCfg(), fetch);

    const s = makeSession({
      branch: null,
      repoPath: undefined,
      issueKey: null,
      comment: 'TP-777 Implemented authentication flow',
    });

    const result = await sink.export(s);

    expect(result.ok).toBe(true);
    // Preflight then POST
    expect(fetch).toHaveBeenCalledTimes(2);

    const [postUrl, init] = fetch.mock.calls[1];
    expect(String(postUrl)).toContain('/TP-777/');

    const body = JSON.parse(String(init?.body));
    const textNode = body.comment.content[0].content[0];
    expect(textNode.text).toBe('TP-777 Implemented authentication flow');
  });
});