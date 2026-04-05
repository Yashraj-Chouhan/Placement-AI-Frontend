import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, TrendingUp, TrendingDown, Target, Clock, Award, AlertCircle, Loader2, ChevronDown, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { InterviewResult, normalizeApiError, resultApi, TestResult } from "@/lib/api";
import { toast } from "sonner";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const } }),
};

function parseScoreValue(score: string) {
  // Try "Score: 70%" format
  const pctMatch = score.match(/(\d+)\s*%/);
  if (pctMatch) return Number(pctMatch[1]);

  // Try "3/5" format
  const fracMatch = score.match(/(\d+)\s*\/\s*(\d+)/);
  if (fracMatch) return Math.round((Number(fracMatch[1]) / Number(fracMatch[2])) * 100);

  return 0;
}

/**
 * Extract AI feedback section from the stored result string.
 * The result is stored as: "Score: X%\n\n<AI evaluation>\n\n--- Full Q&A ---\n..."
 */
function extractFeedback(result: string): { score: number; feedback: string; qa: string } {
  const scoreVal = parseScoreValue(result);

  // Try to split at "--- Full Q&A ---"
  const qaSeparator = "--- Full Q&A ---";
  const qaSplitIndex = result.indexOf(qaSeparator);

  let feedback = result;
  let qa = "";

  if (qaSplitIndex >= 0) {
    feedback = result.substring(0, qaSplitIndex).trim();
    qa = result.substring(qaSplitIndex + qaSeparator.length).trim();
  }

  // Remove the "Score: X%" line from feedback display
  feedback = feedback.replace(/^Score:\s*\d+%?\s*\n*/i, "").trim();

  return { score: scoreVal, feedback, qa };
}

type HistoryItem = {
  id: string;
  order: number;
  type: "Test" | "Interview";
  topic: string;
  score: number;
  detail: string;
  rawResult: string;
};

const TrackPage = () => {
  const { user } = useAuth();
  const [tests, setTests] = useState<TestResult[]>([]);
  const [interviews, setInterviews] = useState<InterviewResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadResults = async () => {
      setIsLoading(true);
      try {
        const [testResponse, interviewResponse] = await Promise.all([
          resultApi.getTests(user.id),
          resultApi.getInterviews(user.id),
        ]);

        setTests(testResponse.data);
        setInterviews(interviewResponse.data);
      } catch (error) {
        toast.error(normalizeApiError(error, "Failed to load results."));
      } finally {
        setIsLoading(false);
      }
    };

    void loadResults();
  }, [user]);

  const history: HistoryItem[] = useMemo(
    () => [
      ...tests.map((test) => ({
        id: `test-${test.id}`,
        order: test.id,
        type: "Test" as const,
        topic: test.subject,
        score: parseScoreValue(test.score),
        detail: test.score,
        rawResult: test.score,
      })),
      ...interviews.map((interview) => {
        const parsed = extractFeedback(interview.result);
        return {
          id: `interview-${interview.id}`,
          order: interview.id,
          type: "Interview" as const,
          topic: interview.tech,
          score: parsed.score,
          detail: parsed.feedback.substring(0, 100) + (parsed.feedback.length > 100 ? "..." : ""),
          rawResult: interview.result,
        };
      }),
    ].sort((a, b) => b.order - a.order),
    [interviews, tests],
  );

  const avgScore = history.length ? Math.round(history.reduce((sum, item) => sum + item.score, 0) / history.length) : 0;
  const bestScore = history.length ? Math.max(...history.map((item) => item.score)) : 0;
  const strengths = tests.slice(0, 3).map((test) => `${test.subject} (${test.score})`);
  const weaknesses = tests.slice(-3).map((test) => `${test.subject} (${test.score})`);

  const toggleExpand = (id: string) => {
    setExpandedItem(expandedItem === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading your progress...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial="hidden" animate="visible" className="max-w-5xl mx-auto">
        <motion.h1 variants={fadeUp} custom={0} className="text-3xl md:text-4xl font-bold mb-2">
          Performance <span className="gradient-text">Tracker</span>
        </motion.h1>
        <motion.p variants={fadeUp} custom={1} className="text-muted-foreground mb-10">
          Live results from your saved interviews and tests.
        </motion.p>

        <motion.div variants={fadeUp} custom={2} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { icon: Target, label: "Avg Score", value: `${avgScore}%`, color: "text-primary" },
            { icon: Clock, label: "Total Sessions", value: history.length.toString(), color: "text-primary" },
            { icon: Award, label: "Best Score", value: `${bestScore}%`, color: "text-primary" },
            { icon: BarChart3, label: "Tests Taken", value: tests.length.toString(), color: "text-primary" },
          ].map((stat, i) => (
            <motion.div key={stat.label} variants={fadeUp} custom={i + 2} className="glass-card p-5 hover-lift">
              <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
              <div className="text-2xl font-bold gradient-text">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          <motion.div variants={fadeUp} custom={6} className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Recent Strengths</h3>
            </div>
            <div className="space-y-3">
              {(strengths.length ? strengths : ["Complete a few tests to see strengths here."]).map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={fadeUp} custom={7} className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-5 h-5 text-destructive" />
              <h3 className="font-semibold">Practice Next</h3>
            </div>
            <div className="space-y-3">
              {(weaknesses.length ? weaknesses : ["Interview and test history will appear here once you finish a session."]).map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={fadeUp} custom={8} className="glass-card p-6 glow-border">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">AI Feedback</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {history.length
                ? "Click on any history item below to see detailed AI feedback, mistakes, and improvement suggestions."
                : "No saved sessions yet. Start one test or interview and it will show up here automatically."}
            </p>
          </motion.div>
        </div>

        <motion.div variants={fadeUp} custom={9}>
          <h3 className="text-lg font-semibold mb-4">Recent History</h3>
          <p className="text-sm text-muted-foreground mb-4">Click on any item to view detailed feedback</p>
          <div className="space-y-3">
            {history.length ? history.map((item, index) => {
              const isExpanded = expandedItem === item.id;
              const parsed = item.type === "Interview" ? extractFeedback(item.rawResult) : null;

              return (
                <motion.div
                  key={item.id}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={index}
                >
                  {/* Clickable Header */}
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className={`w-full text-left glass-card p-4 flex items-center justify-between hover-lift transition-all ${
                      isExpanded ? "border-primary/30 bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`px-3 py-1 rounded-lg text-xs font-semibold ${item.type === "Interview" ? "bg-accent/20 text-accent" : "bg-primary/10 text-primary"}`}>
                        {item.type}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{item.topic}</div>
                        <div className="text-xs text-muted-foreground max-w-xl truncate">{item.detail}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-lg font-bold ${item.score >= 80 ? "text-green-400" : item.score >= 60 ? "text-yellow-400" : item.score >= 40 ? "text-orange-400" : "text-red-400"}`}>
                        {item.score}%
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {/* Expanded Feedback Panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="glass-card border-t-0 rounded-t-none p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                              {item.type === "Interview" ? "AI Evaluation & Feedback" : "Test Result"}
                            </h4>
                            <button onClick={() => setExpandedItem(null)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {item.type === "Interview" && parsed ? (
                            <>
                              {/* Score display */}
                              <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
                                <div className={`text-3xl font-bold ${parsed.score >= 70 ? "text-green-400" : parsed.score >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                                  {parsed.score}%
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {parsed.score >= 70 ? "Great performance! Keep it up." :
                                   parsed.score >= 40 ? "Decent attempt. Review the feedback below." :
                                   "Needs improvement. Focus on the areas mentioned below."}
                                </div>
                              </div>

                              {/* AI Feedback */}
                              {parsed.feedback && (
                                <div>
                                  <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Feedback & Mistakes</h5>
                                  <div className="p-4 rounded-xl bg-secondary/50 text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                                    {parsed.feedback}
                                  </div>
                                </div>
                              )}

                              {/* Q&A */}
                              {parsed.qa && (
                                <div>
                                  <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Questions & Your Answers</h5>
                                  <div className="p-4 rounded-xl bg-secondary/50 text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                                    {parsed.qa}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="p-4 rounded-xl bg-secondary/50 text-sm">
                              <span className="font-medium">Score: </span>{item.rawResult}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            }) : (
              <div className="glass-card p-6 text-sm text-muted-foreground">
                No backend history yet. Complete a test or interview to populate this page.
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default TrackPage;
