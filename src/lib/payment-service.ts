import apiClient from "@/lib/api";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
    };
  }
}

export interface CreditPack {
  id: string;
  credits: number;
  amount: number;
  bestValue: boolean;
}

export interface MonthlyPlan {
  id: string;
  name: string;
  monthlyAmount: number;
  monthlyCredits: number | null;
  popular: boolean;
  features: string[];
}

export interface PaymentCatalog {
  creditPacks: CreditPack[];
  monthlyPlans: MonthlyPlan[];
}

export interface CreateOrderPayload {
  amount: number;
  authUserId: number;
  purchaseType: "CREDITS" | "PLAN";
  referenceId: string;
  credits?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  key: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentPayload {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
}

const DEFAULT_CATALOG: PaymentCatalog = {
  creditPacks: [
    { id: "credits-5", credits: 5, amount: 49, bestValue: false },
    { id: "credits-15", credits: 15, amount: 129, bestValue: false },
    { id: "credits-30", credits: 30, amount: 229, bestValue: true },
  ],
  monthlyPlans: [
    {
      id: "starter",
      name: "Starter",
      monthlyAmount: 199,
      monthlyCredits: 20,
      popular: false,
      features: ["20 Credits/month", "AI Interview Practice", "MCQ Tests", "Basic Analytics"],
    },
    {
      id: "pro",
      name: "Pro",
      monthlyAmount: 499,
      monthlyCredits: 100,
      popular: true,
      features: ["100 Credits/month", "Priority AI Feedback", "Company-Specific Prep", "Advanced Analytics", "Resume Review"],
    },
    {
      id: "elite",
      name: "Elite",
      monthlyAmount: 999,
      monthlyCredits: null,
      popular: false,
      features: ["Unlimited Credits", "1-on-1 AI Mentoring", "Mock Group Discussions", "Placement Guarantee", "Priority Support"],
    },
  ],
};

function formatAmountForRazorpay(amount: number) {
  return Math.round(amount * 100);
}

export async function getPaymentCatalog(): Promise<PaymentCatalog> {
  try {
    const response = await apiClient.get<PaymentCatalog>("/payments/catalog");
    return response.data;
  } catch {
    return DEFAULT_CATALOG;
  }
}

export async function createPaymentOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  const response = await apiClient.post<CreateOrderResponse>("/payments/create-order", payload);
  return response.data;
}

export async function verifyPayment(payload: VerifyPaymentPayload): Promise<void> {
  await apiClient.post("/payments/verify", payload);
}

export function openRazorpayCheckout(
  order: CreateOrderResponse,
  options: Omit<RazorpayCheckoutOptions, "key" | "amount" | "currency" | "order_id">,
) {
  if (!window.Razorpay) {
    throw new Error("Razorpay SDK is not loaded. Add checkout.js in index.html before opening payments.");
  }

  const razorpay = new window.Razorpay({
    key: order.key,
    amount: formatAmountForRazorpay(order.amount),
    currency: order.currency,
    order_id: order.orderId,
    ...options,
  });

  razorpay.open();
}

export function formatRupees(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
