import { createContext, useContext, useState, ReactNode } from "react";
import axios from "axios";
import { authApi, normalizeApiError, type UserProfile, userApi } from "@/lib/api";

interface User {
  id: number;
  profileId?: number;
  name: string;
  email: string;
  mobileNumber?: string | null;
  credits: number;
  activePlan?: string | null;
  planExpiryDate?: string | null;
}

interface AuthContextType {
  user: User | null;
  credits: number;
  login: (email: string, password?: string) => Promise<void>;
  signup: (name: string, email: string, mobileNumber: string, password?: string) => Promise<void>;
  logout: () => void;
  useCredit: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const MAX_FREE_CREDITS = 5;
const USER_REGISTRY_KEY = "placeai_user_registry";

function deriveUserId(email: string) {
  return email.split("").reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) % 2147483647, 7);
}

function getStoredUsers(): Record<string, User> {
  const saved = localStorage.getItem(USER_REGISTRY_KEY);
  return saved ? JSON.parse(saved) : {};
}

function saveStoredUser(user: User) {
  const users = getStoredUsers();
  users[user.email] = user;
  localStorage.setItem(USER_REGISTRY_KEY, JSON.stringify(users));
}

function toAppUser(profile: Partial<UserProfile> & { email: string; name?: string }) {
  const storedUsers = getStoredUsers();
  const storedUser = storedUsers[profile.email];
  const authUserId = profile.authUserId ?? storedUser?.id ?? deriveUserId(profile.email);

  return {
    id: authUserId,
    profileId: profile.id ?? storedUser?.profileId,
    name: profile.name ?? storedUser?.name ?? profile.email.split("@")[0],
    email: profile.email,
    mobileNumber: profile.mobileNumber ?? storedUser?.mobileNumber ?? null,
    credits: profile.credits ?? storedUser?.credits ?? MAX_FREE_CREDITS,
    activePlan: profile.activePlan ?? storedUser?.activePlan ?? null,
    planExpiryDate: profile.planExpiryDate ?? storedUser?.planExpiryDate ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("placeai_user");
    return saved ? JSON.parse(saved) : null;
  });

  const persistUser = (nextUser: User | null) => {
    setUser(nextUser);

    if (nextUser) {
      saveStoredUser(nextUser);
      localStorage.setItem("placeai_user", JSON.stringify(nextUser));
      return;
    }

    localStorage.removeItem("placeai_user");
  };

  const loadUserProfile = async (email: string) => {
    try {
      const response = await userApi.getByEmail(email);
      const resolvedUser = toAppUser(response.data);
      persistUser(resolvedUser);
      return resolvedUser;
    } catch (error) {
      const storedUser = getStoredUsers()[email];

      if (axios.isAxiosError(error) && error.response?.status === 404 && storedUser) {
        const syncResponse = await userApi.sync({
          authUserId: storedUser.id,
          name: storedUser.name,
          email: storedUser.email,
          mobileNumber: storedUser.mobileNumber ?? undefined,
        });
        const resolvedUser = toAppUser(syncResponse.data);
        persistUser(resolvedUser);
        return resolvedUser;
      }

      throw error;
    }
  };

  const login = async (email: string, password?: string) => {
    try {
      const response = await authApi.login(email, password || "");
      const token = response.data;

      if (typeof token !== "string" || !token.trim()) {
        throw new Error("Invalid response from server.");
      }

      localStorage.setItem("placeai_token", token);
      await loadUserProfile(email);
    } catch (error: unknown) {
      console.error("Login Error:", error);
      throw new Error(normalizeApiError(error, "Failed to login. Please check your credentials."));
    }
  };

  const signup = async (name: string, email: string, mobileNumber: string, password?: string) => {
    try {
      const response = await authApi.register(name, email, mobileNumber, password || "");
      const data = response.data as UserProfile;

      if (typeof data.id !== "number") {
        throw new Error("Auth service did not return a valid user id.");
      }

      const syncResponse = await userApi.sync({
        authUserId: data.id,
        name: data.name || name,
        email: data.email || email,
        mobileNumber: data.mobileNumber || mobileNumber,
      });

      const createdUser = toAppUser({
        ...syncResponse.data,
        authUserId: data.id,
        name: syncResponse.data.name || name,
        email: syncResponse.data.email || email,
        mobileNumber: syncResponse.data.mobileNumber || data.mobileNumber || mobileNumber,
      });

      saveStoredUser(createdUser);
    } catch (error: unknown) {
      console.error("Signup Error:", error);
      throw new Error(normalizeApiError(error, "Failed to sign up."));
    }
  };

  const logout = () => {
    persistUser(null);
    localStorage.removeItem("placeai_token");
  };

  const useCredit = async () => {
    if (!user) return false;

    try {
      const response = await userApi.consumeCredit(user.id);
      const updatedUser = toAppUser(response.data);
      persistUser(updatedUser);
      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && (error.response?.status === 400 || error.response?.status === 404)) {
        return false;
      }

      throw new Error(normalizeApiError(error, "Failed to update credits."));
    }
  };

  const refreshUser = async () => {
    if (!user?.email) return;
    await loadUserProfile(user.email);
  };

  return (
    <AuthContext.Provider value={{ user, credits: user?.credits ?? MAX_FREE_CREDITS, login, signup, logout, useCredit, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
