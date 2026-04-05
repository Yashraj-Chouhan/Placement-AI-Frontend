import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Video, FileText, BarChart3, Sparkles, Target, TrendingUp, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import { TextReveal, Typewriter, GradientTextAnimate } from "@/components/TextReveal";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: "easeOut" as const },
  }),
};

const features = [
  { icon: Video, title: "AI Mock Interviews", desc: "Practice with AI-powered interviews tailored to specific companies and technologies.", link: "/interview" },
  { icon: FileText, title: "Smart MCQ Tests", desc: "Take adaptive tests across subjects with instant AI-evaluated results.", link: "/test" },
  { icon: BarChart3, title: "Performance Tracking", desc: "Get detailed analytics on strengths, weaknesses, and improvement trends.", link: "/track" },
];

const stats = [
  { value: "10K+", label: "Mock Interviews", icon: Target },
  { value: "95%", label: "Placement Rate", icon: TrendingUp },
  { value: "500+", label: "Companies", icon: Sparkles },
  { value: "50+", label: "Technologies", icon: Zap },
];

const Index = () => {
  const { credits, user } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);

  return (
    <div className="relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-40 right-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      {/* Credit banner */}
      {credits <= 2 && credits > 0 && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/10 border-b border-primary/20 py-2 text-center text-sm">
          ⚡ You have <span className="font-bold text-primary">{credits}</span> credits left.{" "}
          <button onClick={() => setShowUpgrade(true)} className="text-primary font-semibold hover:underline">Upgrade now</button>
        </motion.div>
      )}

      {/* Hero */}
      <section className="relative container mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-32 text-center">
        <motion.div initial="hidden" animate="visible" className="max-w-4xl mx-auto">
          <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <Typewriter text="AI-Powered Placement Preparation" delay={0.3} speed={0.02} />
          </motion.div>

          <motion.h1 variants={fadeUp} custom={1} className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight mb-6">
            <TextReveal text={`Hey ${user?.name || "there"}, Ace Your`} delay={0.2} />
            <br />
            <TextReveal text="Next " delay={0.8} />
            <GradientTextAnimate text="Interview" delay={1} />
          </motion.h1>

          <motion.p variants={fadeUp} custom={2} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            <TextReveal text="Practice mock interviews, take smart tests, and track your progress — all powered by generative AI." delay={1.2} />
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/interview">
              <Button size="lg" className="bg-primary text-primary-foreground font-semibold text-base px-8 hover:bg-primary/90 glow-border">
                Start Practicing
              </Button>
            </Link>
            <Link to="/test">
              <Button size="lg" variant="outline" className="font-semibold text-base px-8 border-border hover:bg-secondary">
                Take a Test
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-28 right-10 w-20 h-20 rounded-full bg-accent/20 blur-sm hidden lg:block" />
        <motion.div animate={{ y: [10, -10, 10] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-16 w-14 h-14 rounded-full bg-primary/20 blur-sm hidden lg:block" />
      </section>

      {/* Stats */}
      <section className="container mx-auto px-4 pb-20">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div key={stat.label} variants={fadeUp} custom={i} className="glass-card p-6 text-center hover-lift">
              <stat.icon className="w-6 h-6 text-primary mx-auto mb-3" />
              <div className="text-2xl md:text-3xl font-bold gradient-text mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 pb-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} className="text-center mb-16">
          <motion.h2 variants={fadeUp} custom={0} className="text-3xl md:text-4xl font-bold mb-4">
            Everything You Need to <GradientTextAnimate text="Succeed" delay={0.2} />
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-muted-foreground max-w-lg mx-auto">
            Comprehensive tools designed to maximize your placement success rate.
          </motion.p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <Link to={f.link} className="block glass-card p-8 hover-lift group h-full">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20 mb-5 group-hover:scale-110 transition-transform">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-24">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="glass-card glow-border p-12 md:p-16 text-center">
          <Brain className="w-12 h-12 text-primary mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Placed?</h2>
          <p className="text-muted-foreground max-w-lg mx-auto mb-8">
            Join thousands of students who have already aced their interviews with PlaceAI.
          </p>
          <Button size="lg" onClick={() => setShowUpgrade(true)} className="bg-primary text-primary-foreground font-semibold text-base px-10 hover:bg-primary/90">
            Upgrade to Pro
          </Button>
        </motion.div>
      </section>

      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 PlaceAI. All rights reserved.</p>
      </footer>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default Index;
