import { useUser } from "@stackframe/stack";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/api/types";
import { getMe } from "@/api/auth";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const stackUser = useUser({ or: "return-null" });
  const stackUserRef = useRef(stackUser);
  stackUserRef.current = stackUser;

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedForId = useRef<string | null>(null);

  const stackUserId = stackUser?.id ?? null;

  useEffect(() => {
    if (!stackUserId) {
      setUser(null);
      setIsLoading(false);
      fetchedForId.current = null;
      return;
    }
    if (fetchedForId.current === stackUserId) return;
    fetchedForId.current = stackUserId;

    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stackUserId]);

  const refreshUser = useCallback(async () => {
    if (!stackUserRef.current?.id) return;
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await stackUserRef.current?.signOut();
    setUser(null);
    fetchedForId.current = null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      logout,
      refreshUser,
    }),
    [user, isLoading, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
