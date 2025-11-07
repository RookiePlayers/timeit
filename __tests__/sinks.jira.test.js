"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jira_sink_1 = require("../src/sinks/jira.sink");
function makeCfg(overrides) {
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
function makeSession(overrides) {
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
function mockFetchOk() {
    const res = {
        ok: true,
        status: 201,
        text: async () => '',
        json: async () => ({}),
    };
    return jest.fn().mockResolvedValue(res);
}
function mockFetchFail(status = 401, body = 'Unauthorized') {
    const res = {
        ok: false,
        status,
        text: async () => body,
    };
    return jest.fn().mockResolvedValue(res);
}
describe('JiraSink', () => {
    test('posts worklog when creds + issueKey present', async () => {
        const fetch = mockFetchOk();
        const sink = new jira_sink_1.JiraSink(makeCfg(), fetch);
        const s = makeSession({ durationSeconds: 2700 }); // 45m
        const result = await sink.export(s);
        expect(result.ok).toBe(true);
        expect(result.message).toContain('Jira');
        // fetch called once with correct URL and headers
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(String(url)).toBe('https://team.atlassian.net/rest/api/3/issue/TP-123/worklog');
        expect(init?.method).toBe('POST');
        // Check Authorization and content-type exist
        const headers = (init?.headers || {});
        expect(headers['Authorization'] || headers['authorization']).toMatch(/^Basic\s+/);
        expect(headers['Content-Type'] || headers['content-type']).toBe('application/json');
        // Body sanity: timeSpentSeconds & Jira timestamp format (+0000, not Z)
        const body = JSON.parse(String(init?.body));
        expect(body.timeSpentSeconds).toBe(2700);
        expect(body.started).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+0000$/);
        // ADF comment payload
        expect(body.comment?.type).toBe('doc');
        expect(body.comment?.content?.[0]?.type).toBe('paragraph');
    });
    test('skips when no issueKey (returns ok with skip message)', async () => {
        const fetch = mockFetchOk();
        const sink = new jira_sink_1.JiraSink(makeCfg(), fetch);
        const s = makeSession({ issueKey: null, branch: 'feature/no-ticket' });
        const result = await sink.export(s);
        expect(result.ok).toBe(true);
        expect(String(result.message)).toMatch(/skipped/i);
        expect(fetch).not.toHaveBeenCalled();
    });
    test('reports missing setup fields (domain/email/token)', async () => {
        const fetch = mockFetchOk();
        const cfg = makeCfg({ 'jira.apiToken': '' }); // missing token
        const sink = new jira_sink_1.JiraSink(cfg, fetch);
        const s = makeSession();
        const result = await sink.export(s);
        expect(result.ok).toBe(false);
        expect(String(result.message)).toMatch(/missing/i);
        expect(String(result.message)).toMatch(/jira\.apiToken/);
        expect(fetch).not.toHaveBeenCalled();
    });
    test('propagates non-2xx response with status and body', async () => {
        const fetch = mockFetchFail(403, 'Forbidden');
        const sink = new jira_sink_1.JiraSink(makeCfg(), fetch);
        const s = makeSession();
        const result = await sink.export(s);
        expect(result.ok).toBe(false);
        expect(String(result.message)).toContain('Jira 403');
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    test('normalizes domain with protocol/trailing slash', async () => {
        const fetch = mockFetchOk();
        const cfg = makeCfg({ 'jira.domain': 'https://my-team.atlassian.net/' });
        const sink = new jira_sink_1.JiraSink(cfg, fetch);
        await sink.export(makeSession());
        const [url] = fetch.mock.calls[0];
        expect(String(url)).toBe('https://my-team.atlassian.net/rest/api/3/issue/TP-123/worklog');
    });
    test('uses session.issueKey first, then options.issueKey as fallback', async () => {
        const fetch = mockFetchOk();
        const cfg = makeCfg({ 'issueKey': 'TP-999' });
        const sink = new jira_sink_1.JiraSink(cfg, fetch);
        // Case 1: session has key → use it
        await sink.export(makeSession({ issueKey: 'TP-123' }));
        expect(String(fetch.mock.calls[0][0])).toContain('/TP-123/');
        // Case 2: session lacks key → fallback to options.issueKey
        fetch.mockClear();
        await sink.export(makeSession({ issueKey: null }));
        expect(String(fetch.mock.calls[0][0])).toContain('/TP-999/');
    });
    test('emits default comment when session.comment is empty', async () => {
        const fetch = mockFetchOk();
        const sink = new jira_sink_1.JiraSink(makeCfg(), fetch);
        await sink.export(makeSession({ comment: '   ' }));
        const [, init] = fetch.mock.calls[0];
        const body = JSON.parse(String(init?.body));
        const textNode = body.comment?.content?.[0]?.content?.[0];
        expect(textNode?.text).toBe('Logged by Clockit');
    });
    test('uses comment-derived issue key when no git info present', async () => {
        const fetch = mockFetchOk();
        const sink = new jira_sink_1.JiraSink(makeCfg(), fetch);
        // Simulate session with no branch or repo info
        const s = makeSession({
            branch: null,
            repoPath: undefined,
            issueKey: null,
            comment: 'TP-777 Implemented authentication flow', // user wrote key in comment
        });
        const result = await sink.export(s);
        // Should succeed and POST to the issue in comment
        expect(result.ok).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(String(url)).toContain('/TP-777/');
        const body = JSON.parse(String(init?.body));
        // Ensure comment content still propagates
        const textNode = body.comment.content[0].content[0];
        expect(textNode.text).toBe('TP-777 Implemented authentication flow');
    });
});
//# sourceMappingURL=sinks.jira.test.js.map