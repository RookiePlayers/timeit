import { sessionUploadSchema } from '@/types';
import { auth } from './firebase';
import z from 'zod';
import type { FeatureGroup, CreateFeatureGroupRequest, UpdateFeatureGroupRequest } from '@/types/feature-group.types';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const SERVER_UNAVAILABLE_CODE = 'SERVER_UNAVAILABLE';
export const SERVER_UNAVAILABLE_MESSAGE =
  "Sorry, our servers can't be reached right now. It might be down for maintenance. Please try again later.";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) {
      return null;
    }
    return await user.getIdToken();
  }

  /**
   * Generate a UUID v4 for idempotency keys
   */
  private generateIdempotencyKey(): string {
    return crypto.randomUUID();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { idempotent?: boolean } = {}
  ): Promise<T> {
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Merge existing headers
    if (options.headers) {
      const existingHeaders = new Headers(options.headers);
      existingHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add idempotency key for mutation operations if requested
    if (options.idempotent && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || '')) {
      headers['Idempotency-Key'] = this.generateIdempotencyKey();
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (error) {
      throw new ApiError(0, SERVER_UNAVAILABLE_CODE, SERVER_UNAVAILABLE_MESSAGE, { cause: error });
    }

    // Handle 204 No Content responses (e.g., DELETE operations)
    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    let data: ApiResponse<T> | null = null;
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (error) {
        throw new ApiError(response.status, SERVER_UNAVAILABLE_CODE, SERVER_UNAVAILABLE_MESSAGE, { cause: error });
      }
    } else {
      const text = await response.text();
      throw new ApiError(response.status, SERVER_UNAVAILABLE_CODE, SERVER_UNAVAILABLE_MESSAGE, {
        bodyPreview: text.slice(0, 200),
      });
    }

    // Ensure data is not null (should not happen given the logic above, but TypeScript needs the check)
    if (!data) {
      throw new ApiError(response.status, SERVER_UNAVAILABLE_CODE, 'Invalid response: no data received');
    }

    if (!response.ok || !data.success) {
      throw new ApiError(
        response.status,
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.message || 'An error occurred',
        data.error?.details
      );
    }

    return data.data as T;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown, idempotent = false): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      idempotent,
    });
  }

  async put<T>(endpoint: string, body?: unknown, idempotent = false): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      idempotent,
    });
  }

  async delete<T>(endpoint: string, idempotent = false): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', idempotent });
  }
}

export const apiClient = new ApiClient();

export function isServerUnavailableError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === SERVER_UNAVAILABLE_CODE;
}

export interface TokenListItem {
  id: string;
  name: string;
  lastFour: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface CreateTokenRequest {
  name: string;
  expiresInDays?: number;
}

export interface CreateTokenResponse {
  id: string;
  token: string;
  name: string;
  lastFour: string;
  createdAt: string;
  expiresAt: string | null;
}

export const tokensApi = {
  list: () => apiClient.get<TokenListItem[]>('/tokens'),
  create: (data: CreateTokenRequest) =>
    apiClient.post<CreateTokenResponse>('/tokens', data),
  get: (tokenId: string) => apiClient.get<TokenListItem>(`/tokens/${tokenId}`),
  revoke: (tokenId: string) => apiClient.delete(`/tokens/${tokenId}`),
};

export type UploadListItem = z.infer<typeof UploadListItemSchema>;
export const UploadListItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  source: z.enum(["manual", "auto"]),
  uploadedAt: z.string(),
  rowCount: z.number(),
  ideName: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});


export type UploadResponse = z.infer<typeof UploadResponseSchema>;

export const UploadResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  uploadedAt: z.string(),
  rowCount: z.number(),
  ideName: z.string().optional(),
  source: z.enum(["manual", "auto"]).optional().default('manual'),
  meta: z.record(z.string(), z.unknown()).optional(),
  data: z.array(sessionUploadSchema),
});

export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;

export const CreateUploadRequestSchema = z.object({
  filename: z.string(),
  data: z.array(sessionUploadSchema).default([]),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;
export const CreateUploadResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  uploadedAt: z.string(),
  rowCount: z.number().optional().default(0),
});

export const uploadsApi = {
  list: (limit?: number, includeData?: boolean) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (includeData) params.append('includeData', 'true');
    const queryString = params.toString();
    return apiClient.get<UploadResponse[]>(
      `/uploads${queryString ? `?${queryString}` : ''}`
    );
  },
  create: (data: CreateUploadRequest) =>
    apiClient.post<CreateUploadResponse>('/uploads', data, true), // idempotent
  get: (uploadId: string) => apiClient.get<UploadResponse>(`/uploads/${uploadId}`),
  delete: (uploadId: string) => apiClient.delete(`/uploads/${uploadId}`, true), // idempotent
};

export interface Goal {
  id: string;
  title: string;
  createdAt: string;
  completed: boolean;
  completedAt?: string;
  groupId: string;
  groupName: string;
  createdBy?: string;
  locked?: boolean;
  estimatedGoalTime?: number;
  order?: number;
  note?: string;
  description?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface GoalGroup {
  id: string;
  name: string;
  kind: "day" | "custom";
  createdAt?: string;
  description?: string;
  color?: string;
  [key: string]: unknown;
}

export interface GoalsResponse {
  goals: Goal[];
}

export interface GoalGroupsResponse {
  groups: GoalGroup[];
}

export const goalsApi = {
  list: () => apiClient.get<GoalsResponse>('/goals'),
  sync: (goals: Goal[]) => apiClient.post<void>('/goals/sync', { goals }),
  delete: (goalId: string) => apiClient.delete(`/goals/${goalId}`),
  listGroups: () => apiClient.get<GoalGroupsResponse>('/goals/groups'),
  syncGroups: (groups: GoalGroup[]) => apiClient.post<void>('/goals/groups/sync', { groups }),
  deleteGroup: (groupId: string) => apiClient.delete(`/goals/groups/${groupId}`),
};

export interface ClockitSession {
  id: string;
  [key: string]: unknown;
}

export interface SessionListItem {
  id: string;
  label: string;
  startedAt: number;
  accumulatedMs: number;
  endedAt?: number;
  running: boolean;
  groupId?: string;
  groupName?: string;
}

export interface SessionResponse {
  id: string;
  label: string;
  startedAt: number;
  accumulatedMs: number;
  endedAt?: number;
  running: boolean;
  goals: unknown[];
  groupId?: string;
  groupName?: string;
  comment?: string;
  pausedAt?: number;
  csv?: string;
  createdAt?: string;
  lastUpdatedAt?: string;
}

export const sessionsApi = {
  list: (limit?: number, includeFullData?: boolean) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (includeFullData) params.append('includeFullData', 'true');
    const queryString = params.toString();
    return apiClient.get<SessionListItem[] | SessionResponse[]>(
      `/sessions${queryString ? `?${queryString}` : ''}`
    );
  },
  get: (sessionId: string) => apiClient.get<SessionResponse>(`/sessions/${sessionId}`),
  save: (sessions: ClockitSession[]) => apiClient.post<void>('/sessions/save', { sessions }),
  delete: (sessionId: string) => apiClient.delete(`/sessions/${sessionId}`),
};

export interface MaterializedStats {
  [key: string]: unknown;
}

export interface Achievement {
  id: string;
  type: string;
  earnedAt?: string;
  [key: string]: unknown;
}

export const statsApi = {
  get: () => apiClient.get<MaterializedStats>('/stats'),
  refresh: () => apiClient.post<void>('/stats/refresh'),
  saveAchievement: (achievement: Achievement) => apiClient.post<void>('/stats/achievements', achievement, true), // idempotent
};

export interface UserFeatureData {
  entitlementId?: string;
  [key: string]: unknown;
}

export interface FeatureEntitlement {
  id: string;
  name: string;
  featureGroups: string[];
  features?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface UserEntitlementResponse {
  entitlement: FeatureEntitlement;
  entitlementId: string;
}

export const featuresApi = {
  getUserEntitlement: () => apiClient.get<UserEntitlementResponse>('/features/user'),
  setUserEntitlement: (entitlementId: string) => apiClient.post<void>('/features/user/entitlement', { entitlementId }),
  listEntitlements: () => apiClient.get<FeatureEntitlement[]>('/features/entitlements'),
  getEntitlement: (entitlementId: string) => apiClient.get<FeatureEntitlement>(`/features/entitlements/${entitlementId}`),
};

// RBAC API
export interface RolePermission {
  action: string;
  subject: string;
  conditions?: Record<string, unknown>;
  fields?: string[];
  inverted?: boolean;
}

export interface UserRoleResponse {
  role: string;
  permissions: RolePermission[];
}

export interface UsersWithRolesResponse {
  users: Array<{
    uid: string;
    email?: string;
    role: string;
    teamId?: string;
  }>;
}

export interface CheckPermissionResponse {
  hasPermission: boolean;
}

export const rbacApi = {
  getMyRole: () => apiClient.get<UserRoleResponse>('/rbac/me'),
  setUserRole: (userId: string, role: string, teamId?: string) =>
    apiClient.post<void>('/rbac/users/role', { userId, role, teamId }),
  getUserRole: (userId: string) => apiClient.get<UserRoleResponse>(`/rbac/users/${userId}/role`),
  removeUserRole: (userId: string) => apiClient.delete(`/rbac/users/${userId}/role`),
  listUsersWithRoles: () => apiClient.get<UsersWithRolesResponse>('/rbac/users'),
  checkPermission: (action: string, subject: string) =>
    apiClient.post<CheckPermissionResponse>('/rbac/check', { action, subject }),
};

// Feature Groups API
export const featureGroupsApi = {
  create: (data: CreateFeatureGroupRequest) =>
    apiClient.post<{ featureGroup: FeatureGroup }>('/feature-groups', data),

  getById: (id: string) =>
    apiClient.get<{ featureGroup: FeatureGroup }>(`/feature-groups/${id}`),

  getByIds: (ids: string[]) =>
    apiClient.post<{ featureGroups: FeatureGroup[] }>('/feature-groups/batch', { ids }),

  list: (activeOnly = false) =>
    apiClient.get<{ featureGroups: FeatureGroup[] }>(`/feature-groups?activeOnly=${activeOnly}`),

  update: (id: string, data: UpdateFeatureGroupRequest) =>
    apiClient.put<{ featureGroup: FeatureGroup }>(`/feature-groups/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ message: string }>(`/feature-groups/${id}`),
};
