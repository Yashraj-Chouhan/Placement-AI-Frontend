import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Mail, Lock, User, ArrowRight, Loader2, CheckCircle2, ArrowLeft, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { TextReveal, Typewriter } from "@/components/TextReveal";
import { authApi, normalizeApiError } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const } }),
};

type ViewMode = "login" | "signup" | "forgot_email" | "forgot_otp";

const LoginPage = () => {
  const [mode, setMode] = useState<ViewMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [successBanner, setSuccessBanner] = useState("");
  const { login, signup } = useAuth();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
    } catch (error: any) {
      toast.error(error.message || "Failed to authenticate with backend.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) return;
    
    setIsLoading(true);
    try {
      await signup(name, email, password);
      toast.success("Account created successfully!");
      setSuccessBanner("Account created successfully! Please sign in.");
      setMode("login");
      setPassword("");
      setName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create account.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      await authApi.forgotPassword(email);
      toast.success("OTP sent to your email!");
      setMode("forgot_otp");
    } catch (error: any) {
      toast.error(normalizeApiError(error, "Failed to request password reset."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp || !password) return;

    setIsLoading(true);
    try {
      await authApi.resetPassword({ email, otp, newPassword: password });
      toast.success("Password reset successfully!");
      setSuccessBanner("Password has been reset. You can now login.");
      setMode("login");
      setPassword("");
      setOtp("");
    } catch (error: any) {
      toast.error(normalizeApiError(error, "Failed to reset password."));
    } finally {
      setIsLoading(false);
    }
  };

  const currentSubmit = 
    mode === "login" ? handleLoginSubmit :
    mode === "signup" ? handleSignupSubmit :
    mode === "forgot_email" ? handleForgotEmailSubmit :
    handleForgotOtpSubmit;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <motion.div initial="hidden" animate="visible" className="w-full max-w-md">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-14 h-14 rounded-2xl flex items-center justify-center glow-border bg-primary/10 mx-auto mb-4"
          >
            <Brain className="w-7 h-7 text-primary" />
          </motion.div>
          <h1 className="text-2xl font-bold">
            <TextReveal text={
              mode === "signup" ? "Create Account" : 
              mode === "forgot_email" || mode === "forgot_otp" ? "Reset Password" : 
              "Welcome Back"} 
            />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Typewriter
              text={
                mode === "signup" ? "Start your AI-powered placement journey" : 
                mode === "forgot_email" ? "Enter your email to receive an OTP" : 
                mode === "forgot_otp" ? "Enter the OTP sent to your email" :
                "Sign in to continue your preparation"}
              delay={0.5}
            />
          </p>
        </motion.div>

        {/* Success banner */}
        <AnimatePresence>
          {successBanner && mode === "login" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 mb-4"
            >
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-400">{successBanner}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form variants={fadeUp} custom={1} className="glass-card p-8 rounded-2xl" onSubmit={currentSubmit}>
          <div className="space-y-4">
            {mode === "signup" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className="pl-10 bg-secondary border-border" required />
              </motion.div>
            )}

            {(mode === "login" || mode === "signup" || mode === "forgot_email" || mode === "forgot_otp") && (
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 bg-secondary border-border" required disabled={mode === "forgot_otp"} />
              </div>
            )}

            {mode === "forgot_otp" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="text" placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} className="pl-10 bg-secondary border-border tracking-widest font-mono" required maxLength={6} />
              </motion.div>
            )}

            {(mode === "login" || mode === "signup" || mode === "forgot_otp") && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder={mode === "forgot_otp" ? "New Password" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 bg-secondary border-border" required minLength={6} />
              </div>
            )}

            {mode === "login" && (
              <div className="flex justify-end">
                <button type="button" onClick={() => setMode("forgot_email")} className="text-xs text-primary hover:underline">
                  Forgot Password?
                </button>
              </div>
            )}

            <Button type="submit" disabled={isLoading} className="w-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 mt-2">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {mode === "signup" ? "Sign Up" : mode === "forgot_email" ? "Send OTP" : mode === "forgot_otp" ? "Reset Password" : "Sign In"}
              {!isLoading && mode !== "forgot_email" && mode !== "forgot_otp" && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "forgot_email" || mode === "forgot_otp" ? (
              <button type="button" onClick={() => setMode("login")} className="text-muted-foreground flex items-center justify-center w-full hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
              </button>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-primary font-medium hover:underline">
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-primary font-medium hover:underline">
                  Sign Up
                </button>
              </>
            )}
          </div>
        </motion.form>
      </motion.div>
    </div>
  );
};

export default LoginPage;
