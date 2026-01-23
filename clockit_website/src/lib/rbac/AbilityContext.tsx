"use client";

/**
 * CASL Ability Context
 * Provides CASL ability throughout the React component tree
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { defineAbilityFor, type AppAbility } from './abilities';
import { Permission, Role } from './types';

interface AbilityContextValue {
  ability: AppAbility;
  role: Role;
  loading: boolean;
}

const AbilityContext = createContext<AbilityContextValue | undefined>(undefined);

interface AbilityProviderProps {
  children: ReactNode;
}

export function AbilityProvider({ children }: AbilityProviderProps) {
  const [user, loading] = useAuthState(auth);
  const [ability, setAbility] = useState<AppAbility>(() => defineAbilityFor(Role.GUEST));
  const [role, setRole] = useState<Role>(Role.GUEST);

  useEffect(() => {
    const updateAbility = async () => {
      if (!user) {
        // Not authenticated - guest role
        setRole(Role.GUEST);
        setAbility(defineAbilityFor(Role.GUEST));
        return;
      }

      try {
        // Get custom claims from Firebase
        const idTokenResult = await user.getIdTokenResult();
        const userRole = (idTokenResult.claims.role as Role) || Role.USER;
        const customPermissions = idTokenResult.claims.permissions as Permission[];

        setRole(userRole);
        setAbility(defineAbilityFor(userRole, customPermissions));
      } catch (error) {
        console.error('Failed to load user permissions:', error);
        // Fallback to USER role on error
        setRole(Role.USER);
        setAbility(defineAbilityFor(Role.USER));
      }
    };

    updateAbility();
  }, [user]);

  return (
    <AbilityContext.Provider value={{ ability, role, loading }}>
      {children}
    </AbilityContext.Provider>
  );
}

export function useAbility() {
  const context = useContext(AbilityContext);
  if (!context) {
    throw new Error('useAbility must be used within AbilityProvider');
  }
  return context;
}

export { AbilityContext };
