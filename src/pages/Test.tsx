import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ChevronRight, CheckCircle2, Building2, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import { TextReveal } from "@/components/TextReveal";
import { normalizeApiError, resultApi, testApi } from "@/lib/api";
import { toast } from "sonner";

const subjects = ["JavaScript", "Python", "Java", "SQL", "Data Structures", "Operating Systems", "DBMS", "Networking"];
const companiesList = ["Google", "Amazon", "Microsoft", "TCS", "Infosys", "Wipro"];
const difficulties = ["Easy", "Medium", "Hard"];
const questionCounts = [5, 10, 15, 20];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const } }),
};

type TestState = "setup" | "active" | "result";

type ParsedQuestion = {
  id: number;
  question: string;
  options: string[];
  correctAnswer?: string;
};

function calculateScore(questions: ParsedQuestion[], answers: string[]) {
  return questions.reduce((count, question, index) => {
    const answerLetter = answers[index];
    return answerLetter && answerLetter === question.correctAnswer ? count + 1 : count;
  }, 0);
}

function parseMcqResponse(raw: string): ParsedQuestion[] {
  const normalized = raw.replace(/\r/g, "").trim();
  const blocks = normalized
    .split(/(?=Q\d+:)/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const optionLines = lines.filter((line) => /^[A-D][).:]/i.test(line));
    const correctLine = lines.find((line) => /^Correct Answer\s*:/i.test(line));
    const questionLines = lines.filter(
      (line) => !/^Q\d+:/i.test(line) && !/^[A-D][).:]/i.test(line) && !/^Correct Answer\s*:/i.test(line),
    );

    return {
      id: index + 1,
      question: questionLines.join(" ") || `Question ${index + 1}`,
      options: optionLines.map((line) => line.replace(/^[A-D][).:]\s*/i, "").trim()),
      correctAnswer: correctLine?.split(":")[1]?.trim().charAt(0).toUpperCase(),
    };
  });
}

const TestPage = () => {
  const [mode, setMode] = useState<"subject" | "company">("subject");
  const [selected, setSelected] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [numQ, setNumQ] = useState(5);
  const [state, setState] = useState<TestState>("setup");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [testId, setTestId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [evaluation, setEvaluation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { credits, useCredit, user } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const total = questions.length;
  const score = useMemo(() => calculateScore(questions, answers), [answers, questions]);

  const startTest = async () => {
    if (!selected || !difficulty) return;
    if (!useCredit()) {
      setShowUpgrade(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await testApi.start({
        subject: selected,
        count: numQ,
        difficulty,
      });

      const parsedQuestions = parseMcqResponse(response.data.questions);
      if (!parsedQuestions.length) {
        throw new Error("Backend returned questions in an unexpected format.");
      }

      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => undefined);
      }

      setTestId(response.data.testId);
      setQuestions(parsedQuestions);
      setAnswers([]);
      setCurrentQ(0);
      setEvaluation("");
      setState("active");
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to start test."));
    } finally {
      setIsLoading(false);
    }
  };

  const finishTest = async (finalAnswers: string[]) => {
    if (!testId || !user) {
      toast.error("Missing active test session.");
      return;
    }

    setIsLoading(true);
    try {
      const answerSheet = finalAnswers
        .map((answer, index) => `Q${index + 1}: ${answer || "Skipped"}`)
        .join("\n");

      const submitResponse = await testApi.submit({
        testId,
        answers: answerSheet,
      });

      const finalScore = calculateScore(questions, finalAnswers);
      const scoreSummary = `${finalScore}/${total}`;
      await resultApi.saveTest({
        userId: user.id,
        subject: selected,
        score: scoreSummary,
      });

      setEvaluation(submitResponse.data);
      setState("result");
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to submit test."));
    } finally {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
      setIsLoading(false);
    }
  };

  const selectAnswer = (idx: number) => {
    const answerLetter = String.fromCharCode(65 + idx);
    const newAnswers = [...answers];
    newAnswers[currentQ] = answerLetter;
    setAnswers(newAnswers);

    if (currentQ < total - 1) {
      setTimeout(() => setCurrentQ((c) => c + 1), 300);
      return;
    }

    setTimeout(() => {
      void finishTest(newAnswers);
    }, 400);
  };

  const reset = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    setState("setup");
    setSelected("");
    setDifficulty("");
    setQuestions([]);
    setAnswers([]);
    setTestId(null);
    setEvaluation("");
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial="hidden" animate="visible" className="max-w-3xl mx-auto">
        <motion.h1 variants={fadeUp} custom={0} className="text-3xl md:text-4xl font-bold mb-2">
          <TextReveal text="Smart" /> <span className="gradient-text">MCQ Test</span>
        </motion.h1>
        <motion.p variants={fadeUp} custom={1} className="text-muted-foreground mb-2">
          Test your knowledge with AI-generated questions.
        </motion.p>
        <motion.div variants={fadeUp} custom={1.5} className="text-sm text-muted-foreground mb-10">
          Credits remaining: <span className="text-primary font-bold">{credits}</span>
        </motion.div>

        <AnimatePresence mode="wait">
          {state === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex gap-2 mb-8">
                {[
                  { key: "subject" as const, icon: BookOpen, label: "By Subject" },
                  { key: "company" as const, icon: Building2, label: "By Company" },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => {
                      setMode(m.key);
                      setSelected("");
                    }}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                      mode === m.key ? "bg-primary/10 text-primary border border-primary/30" : "glass-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <m.icon className="w-4 h-4" /> {m.label}
                  </button>
                ))}
              </div>

              <div className="mb-8">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Select {mode === "subject" ? "Subject" : "Company"}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(mode === "subject" ? subjects : companiesList).map((item, i) => (
                    <motion.button
                      key={item}
                      variants={fadeUp}
                      initial="hidden"
                      animate="visible"
                      custom={i}
                      onClick={() => setSelected(item)}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        selected === item ? "bg-primary/15 text-primary border border-primary/30" : "glass-card text-muted-foreground hover:text-foreground hover-lift"
                      }`}
                    >
                      {item}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-8 mb-10">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Difficulty</h3>
                  <div className="flex gap-3">
                    {difficulties.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                          difficulty === d ? "bg-primary/15 text-primary border border-primary/30" : "glass-card text-muted-foreground"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Questions</h3>
                  <div className="flex gap-3">
                    {questionCounts.map((n) => (
                      <button
                        key={n}
                        onClick={() => setNumQ(n)}
                        className={`px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                          numQ === n ? "bg-primary/15 text-primary border border-primary/30" : "glass-card text-muted-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                disabled={!selected || !difficulty || isLoading}
                onClick={() => void startTest()}
                className="bg-primary text-primary-foreground font-semibold px-10 hover:bg-primary/90 disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Start Test <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {state === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mb-8">
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Question {currentQ + 1} of {total}</span>
                  <span>{selected} • {difficulty}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${((currentQ + 1) / total) * 100}%` }} transition={{ duration: 0.4 }} />
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={currentQ} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="glass-card p-8 rounded-2xl">
                  <h2 className="text-lg font-semibold mb-6">{questions[currentQ]?.question}</h2>
                  <div className="grid gap-3">
                    {questions[currentQ]?.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectAnswer(idx)}
                        disabled={isLoading}
                        className="text-left px-5 py-4 rounded-xl glass-card text-sm font-medium hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
                      >
                        <span className="text-muted-foreground mr-3">{String.fromCharCode(65 + idx)}.</span>{opt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}

          {state === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-10 max-w-2xl mx-auto text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center glow-border bg-primary/10"
              >
                <span className="text-3xl font-bold gradient-text">{Math.round((score / Math.max(total, 1)) * 100)}%</span>
              </motion.div>
              <h2 className="text-xl font-bold mb-2">Test Complete!</h2>
              <p className="text-muted-foreground text-sm mb-6">{score}/{total} answers matched the generated key</p>
              <div className="glass-card p-4 rounded-xl text-left text-sm text-muted-foreground whitespace-pre-wrap mb-6">
                {evaluation}
              </div>
              <div className="space-y-2 mb-6 text-left">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex items-start gap-3 glass-card p-3 rounded-lg text-sm">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div>{q.question}</div>
                      <div className="text-muted-foreground mt-1">Your answer: {answers[i] || "Skipped"}{q.correctAnswer ? ` | Correct: ${q.correctAnswer}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={reset} className="bg-primary text-primary-foreground font-semibold w-full hover:bg-primary/90">Take Another Test</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default TestPage;
