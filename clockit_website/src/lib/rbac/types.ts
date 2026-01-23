/**
 * RBAC Type Definitions
 * Defines roles, permissions, subjects, and actions for the CASL authorization system
 */

// Define all possible actions
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage' // special action meaning "all actions"
  | 'upload'
  | 'download'
  | 'share'
  | 'export'
  | 'invite';

// Define all possible subjects (resources)
export type Subject =
  | 'Upload'
  | 'Session'
  | 'Goal'
  | 'GoalGroup'
  | 'Stats'
  | 'Achievement'
  | 'User'
  | 'Team'
  | 'Workspace'
  | 'Settings'
  | 'all'; // special subject meaning "all subjects"

// Role definitions
export enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
  TEAM_ADMIN = 'team_admin',
  TEAM_MEMBER = 'team_member',
}

// Permission object
export interface Permission {
  action: Action;
  subject: Subject;
  conditions?: Record<string, unknown>;
  fields?: string[];
  inverted?: boolean;
  reason?: string;
}

// User with role information
export interface UserWithRole {
  uid: string;
  email?: string | null;
  role: Role;
  customClaims?: Record<string, unknown>;
  teamId?: string;
  permissions?: Permission[];
}

// Role configuration
export interface RoleConfig {
  role: Role;
  permissions: Permission[];
  inherits?: Role[];
  description: string;
}

// Firestore role document
export interface RoleDocument {
  id: string;
  name: string;
  permissions: Permission[];
  inherits?: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
}

// User role assignment in Firestore
export interface UserRoleAssignment {
  userId: string;
  role: Role;
  teamId?: string;
  assignedAt: string;
  assignedBy: string;
  expiresAt?: string;
}
