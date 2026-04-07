import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Check, X, Zap, Star, Rocket, Coins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizeApiError } from "@/lib/api";
import {
  createPaymentOrder,
  formatRupees,
  getPaymentCatalog,
  openRazorpayCheckout,
  verifyPayment,
  type CreditPack,
  type MonthlyPlan,
} from "@/lib/payment-service";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

const planIcons = {
  Starter: Zap,
  Pro: Star,
  Elite: Rocket,
} satisfies Record<string, typeof Zap>;

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const [tab, setTab] = useState<"plans" | "credits">("credits");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const { credits, refreshUser, user } = useAuth();

  useEffect(() => {
    let mounted = true;

    getPaymentCatalog()
      .then((catalog) => {
        if (!mounted) return;
        setCreditPacks(catalog.creditPacks);
        setPlans(catalog.monthlyPlans);
      })
      .catch(() => {
        toast.error("Could not load payment catalog.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const isBusy = processingId !== null;

  const finishPurchase = async (message: string) => {
    setProcessingId(null);
    try {
      await refreshUser();
    } catch {
      // Keep the UI moving even if the user profile refresh lags behind.
    }
    toast.success(message);
    onClose();
  };

  const handleBuyCredits = async (pack: CreditPack) => {
    if (!user) {
      toast.error("Please log in before making a payment.");
      return;
    }

    try {
      setProcessingId(pack.id);
      const order = await createPaymentOrder({
        amount: pack.amount,
        authUserId: user.id,
        purchaseType: "CREDITS",
        referenceId: pack.id,
        credits: pack.credits,
        customerName: user.name,
        customerEmail: user.email,
        customerPhone: user.mobileNumber ?? undefined,
      });

      openRazorpayCheckout(order, {
        name: "Placement AI",
        description: `${pack.credits} credits`,
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.mobileNumber ?? undefined,
        },
        theme: {
          color: "#22d3b6",
        },
        modal: {
          ondismiss: () => {
            setProcessingId(null);
          },
        },
        handler: async (response) => {
          try {
            await verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            await finishPurchase(`${pack.credits} credits added successfully!`);
          } catch (error) {
            setProcessingId(null);
            toast.error(normalizeApiError(error, "Payment was captured, but verification failed."));
          }
        },
      });
    } catch (error) {
      setProcessingId(null);
      toast.error(normalizeApiError(error, "Unable to start payment."));
    }
  };

  const handleChoosePlan = async (plan: MonthlyPlan) => {
    if (!user) {
      toast.error("Please log in before making a payment.");
      return;
    }

    try {
      setProcessingId(plan.id);
      const order = await createPaymentOrder({
        amount: plan.monthlyAmount,
        authUserId: user.id,
        purchaseType: "PLAN",
        referenceId: plan.id,
        credits: plan.monthlyCredits ?? undefined,
        customerName: user.name,
        customerEmail: user.email,
        customerPhone: user.mobileNumber ?? undefined,
      });

      openRazorpayCheckout(order, {
        name: "Placement AI",
        description: `${plan.name} monthly plan`,
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.mobileNumber ?? undefined,
        },
        theme: {
          color: "#22d3b6",
        },
        modal: {
          ondismiss: () => {
            setProcessingId(null);
          },
        },
        handler: async (response) => {
          try {
            await verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            await finishPurchase(`${plan.name} plan activated!`);
          } catch (error) {
            setProcessingId(null);
            toast.error(normalizeApiError(error, "Payment was captured, but verification failed."));
          }
        },
      });
    } catch (error) {
      setProcessingId(null);
      toast.error(normalizeApiError(error, "Unable to start payment."));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-full max-w-3xl glass-card p-8 rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Get More Credits</h2>
                  <p className="text-sm text-muted-foreground">
                    You have <span className="text-primary font-bold">{credits}</span> credits remaining
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTab("credits")}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  tab === "credits" ? "bg-primary/10 text-primary border border-primary/30" : "glass-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Coins className="w-4 h-4 inline mr-2" />Buy Credits
              </button>
              <button
                onClick={() => setTab("plans")}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  tab === "plans" ? "bg-primary/10 text-primary border border-primary/30" : "glass-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Star className="w-4 h-4 inline mr-2" />Monthly Plans
              </button>
            </div>

            <AnimatePresence mode="wait">
              {tab === "credits" && (
                <motion.div key="credits" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {creditPacks.map((pack, i) => (
                      <motion.div
                        key={pack.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`relative p-6 rounded-xl border transition-all hover:scale-[1.02] cursor-pointer ${
                          pack.bestValue ? "border-primary/50 bg-primary/5 glow-border" : "border-border bg-secondary/30"
                        }`}
                      >
                        {pack.bestValue && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold bg-primary text-primary-foreground rounded-full">
                            BEST VALUE
                          </span>
                        )}
                        <div className="flex items-center gap-2 mb-3">
                          <Plus className="w-5 h-5 text-primary" />
                          <span className="text-2xl font-bold">{pack.credits}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">Credits</p>
                        <div className="text-xl font-bold gradient-text mb-4">{formatRupees(pack.amount)}</div>
                        <Button
                          onClick={() => handleBuyCredits(pack)}
                          disabled={isBusy}
                          className={`w-full font-semibold ${
                            pack.bestValue ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-foreground hover:bg-secondary/80"
                          }`}
                        >
                          <Coins className="w-4 h-4 mr-2" />
                          {processingId === pack.id ? "Processing..." : "Buy Now"}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {tab === "plans" && (
                <motion.div key="plans" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <div className="grid md:grid-cols-3 gap-4">
                    {plans.map((plan, i) => {
                      const PlanIcon = planIcons[plan.name] ?? Star;

                      return (
                        <motion.div
                          key={plan.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className={`relative p-6 rounded-xl border transition-all hover:scale-[1.02] ${
                            plan.popular ? "border-primary/50 bg-primary/5 glow-border" : "border-border bg-secondary/30"
                          }`}
                        >
                          {plan.popular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold bg-primary text-primary-foreground rounded-full">
                              POPULAR
                            </span>
                          )}
                          <PlanIcon className="w-6 h-6 text-primary mb-3" />
                          <h3 className="font-bold text-lg">{plan.name}</h3>
                          <div className="flex items-baseline gap-1 mt-1 mb-4">
                            <span className="text-2xl font-bold gradient-text">{formatRupees(plan.monthlyAmount)}</span>
                            <span className="text-sm text-muted-foreground">/month</span>
                          </div>
                          <ul className="space-y-2 mb-6">
                            {plan.features.map((feature) => (
                              <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Check className="w-4 h-4 text-primary shrink-0" />{feature}
                              </li>
                            ))}
                          </ul>
                          <Button
                            onClick={() => handleChoosePlan(plan)}
                            disabled={isBusy}
                            className={`w-full font-semibold ${
                              plan.popular ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-foreground hover:bg-secondary/80"
                            }`}
                          >
                            {processingId === plan.id ? "Processing..." : `Choose ${plan.name}`}
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
