import type { OAuthProvider } from './oauth';

// Update with your real publisher & extension IDs
const REDIRECT = 'vscode://yourpublisher.clockit/oauth/callback';

export const JiraOAuthProvider: OAuthProvider = {
  id: 'jira',
  authUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  clientId: '<ATLASSIAN_CLIENT_ID>',
  clientSecret: undefined,           // PKCE only (recommended)
  scopes: [
    // choose minimal required scopes; adjust as needed
    'read:jira-work',
    'write:jira-work',
    'read:jira-user',
  ],
  redirectUri: REDIRECT,
  extraAuthParams: {
    audience: 'api.atlassian.com',   // Atlassian requires audience for cloud APIs
    prompt: 'consent',
  },
};

export const NotionOAuthProvider: OAuthProvider = {
  id: 'notion',
  authUrl: 'https://api.notion.com/v1/oauth/authorize',
  tokenUrl: 'https://api.notion.com/v1/oauth/token',
  clientId: '<NOTION_CLIENT_ID>',
  clientSecret: '<NOTION_CLIENT_SECRET>', // Notion typically needs client_secret
  scopes: [], // Notion v1 uses integration capabilities rather than granular scopes
  redirectUri: REDIRECT,
  scopeParamName: 'owner', // Notion’s authorize params differ; leave empty or customize if needed
};