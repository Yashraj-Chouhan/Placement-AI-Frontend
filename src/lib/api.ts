import axios from "axios";

// When using Vite proxy, use empty string so requests go to the same origin.
// The Vite dev server will proxy them to the gateway at localhost:8081.
// For production, set VITE_API_BASE_URL to the gateway URL.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export interface UserProfile {
  id: number;
  authUserId?: number;
  name: string;
  email: string;
  mobileNumber?: string | null;
  credits?: number;
  activePlan?: string | null;
  planExpiryDate?: string | null;
}

export interface UserProfileSyncPayload {
  authUserId: number;
  name: string;
  email: string;
  mobileNumber?: string;
}

export interface StartTestPayload {
  subject: string;
  count: number;
  difficulty: string;
}

export interface StartTestResponse {
  testId: number;
  questions: string;
}

export interface SubmitTestPayload {
  testId: number;
  answers: string;
}

export interface StartInterviewPayload {
  tech: string;
  difficulty: string;
}

export interface StartInterviewResponse {
  interviewId: number;
  question: string;
}

export interface SubmitInterviewPayload {
  interviewId: number;
  answer: string;
}

export interface SaveTestResultPayload {
  userId: number;
  subject: string;
  score: string;
}

export interface SaveInterviewResultPayload {
  userId: number;
  tech: string;
  result: string;
}

export interface TestResult {
  id: number;
  userId: number;
  subject: string;
  score: string;
}

export interface InterviewResult {
  id: number;
  userId: number;
  tech: string;
  result: string;
}

export interface AIEvaluatePayload {
  question: string;
  answer: string;
  total: number;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("placeai_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export const authApi = {
  login: (email: string, password: string) => apiClient.post<string>("/auth/login", { email, password }),
  register: (name: string, email: string, mobileNumber: string, password: string) =>
    apiClient.post<UserProfile>("/auth/register", { name, email, mobileNumber, password }),
  forgotPassword: (email: string) => apiClient.post("/auth/forgot-password", { email }),
  resetPassword: (payload: {email: string; otp: string; newPassword: string}) => apiClient.post("/auth/reset-password", payload),
};

export const userApi = {
  sync: (payload: UserProfileSyncPayload) => apiClient.post<UserProfile>("/users/sync", payload),
  getByEmail: (email: string) => apiClient.get<UserProfile>("/users/by-email", { params: { email } }),
  getByAuthUserId: (authUserId: number) => apiClient.get<UserProfile>(`/users/auth/${authUserId}`),
  consumeCredit: (authUserId: number) => apiClient.post<UserProfile>(`/users/auth/${authUserId}/credits/consume`),
};

export const testApi = {
  start: (payload: StartTestPayload) => apiClient.post<StartTestResponse>("/tests/start", payload),
  submit: (payload: SubmitTestPayload) => apiClient.post<string>("/tests/submit", payload),
};

export const interviewApi = {
  start: (payload: StartInterviewPayload) => apiClient.post<StartInterviewResponse>("/interviews/start", payload),
  answer: (payload: SubmitInterviewPayload) => apiClient.post<string>("/interviews/answer", payload),
};

export const aiApi = {
  evaluate: (payload: AIEvaluatePayload) => apiClient.post<string>("/ai/evaluate", payload),
};

export const resultApi = {
  saveTest: (payload: SaveTestResultPayload) => apiClient.post<string>("/results/test", payload),
  saveInterview: (payload: SaveInterviewResultPayload) => apiClient.post<string>("/results/interview", payload),
  getTests: (userId: number) => apiClient.get<TestResult[]>(`/results/tests/${userId}`),
  getInterviews: (userId: number) => apiClient.get<InterviewResult[]>(`/results/interviews/${userId}`),
};

export function normalizeApiError(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;

    // Plain string response body (our custom error messages)
    if (typeof data === "string" && data.trim()) {
      return data;
    }

    // Spring's standard error object with a message field
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }

    // Spring's default error object: { status, error, path } — no message field
    // Map HTTP status codes to readable messages
    if (status === 400) return data?.error || fallback;
    if (status === 401) return "Invalid email or password. Please try again.";
    if (status === 403) return "Access denied. Please log in again.";
    if (status === 404) return "Account not found. Please sign up first.";
    if (status === 409) return "An account with this email already exists.";
    if (status === 500) return "Server error. Please try again in a moment.";
    if (status === 503) return "Service temporarily unavailable. Please try again shortly.";

    // Network-level failure (no response from server)
    if (error.code === "ERR_NETWORK" || !error.response) {
      return "Cannot connect to backend. Make sure all services are running.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export default apiClient;
