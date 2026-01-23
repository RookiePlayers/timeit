export const DEFAULT_PAGE_SIZE = 6;
export const STORAGE_KEY_GOALS = "clockit-online-guest-goals";
export const STORAGE_KEY_SESSIONS = "clockit-online-guest-sessions";
export const CLOCKIT_SERVER_WS =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SOCKET_URL) ||
  "ws://localhost:4000/session";
export const STORAGE_KEY_CUSTOM_GROUPS = "clockit-online-guest-custom-groups";
