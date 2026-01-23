"use client";

/**
 * RBAC Usage Examples
 * This file demonstrates how to use the RBAC system
 */

import { useState } from 'react';
import { Can, Cannot, RequireRole, RequireAuth, Role, useCan, useRole, useIsAdmin } from '@/lib/rbac';
import { rbacApi } from '@/lib/api-client';

/**
 * Example 1: Using Can/Cannot Components
 */
export function UploadSection() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Uploads</h2>

      {/* Show button only if user can create uploads */}
      <Can I="create" a="Upload">
        <button className="px-4 py-2 bg-blue-600 text-white rounded">
          Upload CSV
        </button>
      </Can>

      {/* Show message if user cannot delete */}
      <Cannot I="delete" a="Upload">
        <div className="text-sm text-amber-600">
          You don&apos;t have permission to delete uploads. Contact your administrator.
        </div>
      </Cannot>
    </div>
  );
}

/**
 * Example 2: Using RequireRole Component
 */
export function AdminPanel() {
  return (
    <RequireRole
      role={[Role.ADMIN, Role.SUPER_ADMIN]}
      fallback={
        <div className="p-4 border border-red-300 bg-red-50 rounded">
          <p className="text-red-800">Access Denied</p>
          <p className="text-sm text-red-600">This section requires admin privileges.</p>
        </div>
      }
    >
      <div className="p-6 border rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>
        <p>Welcome, administrator! Here you can manage users and system settings.</p>
        <UserRoleManager />
      </div>
    </RequireRole>
  );
}

/**
 * Example 3: Using Hooks
 */
export function DashboardHeader() {
  const canUpload = useCan('create', 'Upload');
  const role = useRole();
  const isAdmin = useIsAdmin();

  return (
    <div className="flex items-center justify-between p-4 bg-gray-100">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-600">Role: {role}</p>
      </div>
      <div className="flex gap-2">
        {canUpload && (
          <button className="px-3 py-1 bg-green-600 text-white rounded text-sm">
            Upload
          </button>
        )}
        {isAdmin && (
          <button className="px-3 py-1 bg-purple-600 text-white rounded text-sm">
            Admin Settings
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Example 4: User Role Manager (Admin Only)
 */
export function UserRoleManager() {
  const [users, setUsers] = useState<Array<{ uid: string; email?: string; role: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await rbacApi.listUsersWithRoles();
      setUsers(response.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    try {
      await rbacApi.setUserRole(userId, newRole);
      alert(`Role updated successfully! User needs to refresh to see changes.`);
      await loadUsers(); // Reload the list
    } catch (err) {
      alert(`Failed to update role: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <RequireRole role={[Role.ADMIN, Role.SUPER_ADMIN]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">User Management</h3>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Users'}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded">
            {error}
          </div>
        )}

        {users.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Email</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Current Role</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => (
                  <tr key={user.uid}>
                    <td className="px-4 py-2 text-sm">{user.email || 'No email'}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className="px-2 py-1 bg-gray-200 rounded text-xs">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <select
                        value={user.role}
                        onChange={(e) => changeUserRole(user.uid, e.target.value)}
                        className="px-2 py-1 border rounded text-xs"
                      >
                        <option value={Role.SUPER_ADMIN}>Super Admin</option>
                        <option value={Role.ADMIN}>Admin</option>
                        <option value={Role.USER}>User</option>
                        <option value={Role.TEAM_ADMIN}>Team Admin</option>
                        <option value={Role.TEAM_MEMBER}>Team Member</option>
                        <option value={Role.GUEST}>Guest</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireRole>
  );
}

/**
 * Example 5: Require Authentication
 */
export function ProtectedContent() {
  return (
    <RequireAuth
      fallback={
        <div className="p-6 text-center">
          <p className="text-lg mb-4">Please sign in to view this content</p>
          <button className="px-4 py-2 bg-blue-600 text-white rounded">
            Sign In
          </button>
        </div>
      }
    >
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">Protected Content</h2>
        <p>This content is only visible to authenticated users.</p>
      </div>
    </RequireAuth>
  );
}

/**
 * Example 6: Multiple Roles
 */
export function TeamManagement() {
  return (
    <RequireRole
      role={[Role.ADMIN, Role.SUPER_ADMIN, Role.TEAM_ADMIN]}
      fallback={
        <p className="text-gray-600">Only admins and team admins can manage teams.</p>
      }
    >
      <div className="p-4 border rounded">
        <h3 className="font-semibold mb-2">Team Management</h3>
        <Can I="invite" a="User">
          <button className="px-3 py-1 bg-green-600 text-white rounded text-sm">
            Invite Team Member
          </button>
        </Can>
      </div>
    </RequireRole>
  );
}

/**
 * Example 7: Conditional Rendering with Fallback
 */
export function ActionButtons() {
  return (
    <div className="flex gap-2">
      <Can
        I="create"
        a="Upload"
        fallback={
          <button disabled className="px-3 py-1 bg-gray-300 text-gray-500 rounded text-sm">
            Upload (No Permission)
          </button>
        }
      >
        <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
          Upload
        </button>
      </Can>

      <Can
        I="delete"
        a="Upload"
        fallback={null} // Don't show anything if can't delete
      >
        <button className="px-3 py-1 bg-red-600 text-white rounded text-sm">
          Delete
        </button>
      </Can>
    </div>
  );
}
