import { createContext, useContext, useState, ReactNode } from "react";
import { authApi, normalizeApiError, UserProfile } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  credits: number;
  login: (email: string, password?: string) => Promise<void>;
  signup: (name: string, email: string, password?: string) => Promise<void>;
  logout: () => void;
  useCredit: () => boolean;
  addCredits: (amount: number) => void;
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

function toUserProfile(profile: Partial<UserProfile> & { email: string; name?: string }) {
  const storedUsers = getStoredUsers();
  const storedUser = storedUsers[profile.email];

  return {
    id: profile.id ?? storedUser?.id ?? deriveUserId(profile.email),
    name: profile.name ?? storedUser?.name ?? profile.email.split("@")[0],
    email: profile.email,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("placeai_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [credits, setCredits] = useState(() => {
    const saved = localStorage.getItem("placeai_credits");
    return saved ? parseInt(saved) : MAX_FREE_CREDITS;
  });

  const login = async (email: string, password?: string) => {
    try {
      const response = await authApi.login(email, password || "");
      const token = response.data;

      // If the response is not a valid token string, throw
      if (typeof token !== "string" || !token.trim()) {
        throw new Error("Invalid response from server.");
      }

      localStorage.setItem("placeai_token", token);

      const u = toUserProfile({ email });
      setUser(u);
      localStorage.setItem("placeai_user", JSON.stringify(u));
    } catch (error: any) {
      console.error("Login Error:", error);
      throw new Error(normalizeApiError(error, "Failed to login. Please check your credentials."));
    }
  };

  const signup = async (name: string, email: string, password?: string) => {
    try {
      const response = await authApi.register(name, email, password || "");
      const data = response.data as any;

      // Save the user profile locally for future reference
      const createdUser = toUserProfile({
        id: data.id,
        name: data.name || name,
        email: data.email || email,
      });
      saveStoredUser(createdUser);

      // DO NOT auto-login after signup.
      // The user must sign in manually with their credentials.
      // This ensures proper authentication flow.

      setCredits(MAX_FREE_CREDITS);
      localStorage.setItem("placeai_credits", String(MAX_FREE_CREDITS));
    } catch (error: any) {
      console.error("Signup Error:", error);
      throw new Error(normalizeApiError(error, "Failed to sign up."));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("placeai_user");
    localStorage.removeItem("placeai_token");
  };

  const useCredit = () => {
    if (credits <= 0) return false;
    const newCredits = credits - 1;
    setCredits(newCredits);
    localStorage.setItem("placeai_credits", String(newCredits));
    return true;
  };

  const addCredits = (amount: number) => {
    const newCredits = credits + amount;
    setCredits(newCredits);
    localStorage.setItem("placeai_credits", String(newCredits));
  };

  return (
    <AuthContext.Provider value={{ user, credits, login, signup, logout, useCredit, addCredits }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
