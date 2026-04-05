import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Building2, Code2, ChevronRight, Camera, Maximize, AlertTriangle, Mic, PhoneOff, Sparkles, Loader2, Send, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import { TextReveal } from "@/components/TextReveal";
import { aiApi, interviewApi, normalizeApiError, resultApi } from "@/lib/api";
import { toast } from "sonner";

const technologies = ["React", "Node.js", "Python", "Java", "SQL", "System Design", "Data Structures", "Machine Learning"];
const companies = ["Google", "Amazon", "Microsoft", "Meta", "Apple", "Netflix", "Uber", "Stripe"];
const difficulties = ["Easy", "Medium", "Hard"];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const } }),
};

type InterviewState = "setup" | "permissions" | "live" | "result";
type LivePhase = "speaking" | "thinking" | "listening" | "submitting";

type AnswerLog = {
  question: string;
  answer: string;
};

function parseScoreFromEvaluation(evaluation: string): number | null {
  const ratioPatterns = [
    /overall\s*score\s*:\s*(\d+)\s*\/\s*(\d+)/i,
    /score\s*:\s*(\d+)\s*\/\s*(\d+)/i,
    /(\d+)\s*(?:out of|\/)\s*(\d+)/i,
  ];

  for (const pattern of ratioPatterns) {
    const match = evaluation.match(pattern);
    if (match) {
      const pct = Math.round((Number(match[1]) / Math.max(Number(match[2]), 1)) * 100);
      return Math.min(100, Math.max(0, pct));
    }
  }

  const percentPatterns = [
    /overall\s*percentage\s*:\s*(\d+)\s*%/i,
    /percentage\s*:\s*(\d+)\s*%/i,
    /score\s*:\s*(\d+)\s*%/i,
    /(\d+)\s*%/i,
  ];

  for (const pattern of percentPatterns) {
    const match = evaluation.match(pattern);
    if (match) {
      return Math.min(100, Math.max(0, Number(match[1])));
    }
  }

  return null;
}

const THINK_DELAY_MS = 3000;   // 3s pause after AI speaks before listening
const SILENCE_TIMEOUT_MS = 5000; // 5s of silence before auto-submit

const InterviewPage = () => {
  const [mode, setMode] = useState<"technology" | "company">("technology");
  const [selected, setSelected] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [state, setState] = useState<InterviewState>("setup");
  const { user, credits, useCredit } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [livePhase, setLivePhase] = useState<LivePhase>("speaking");
  const [thinkCountdown, setThinkCountdown] = useState(0);
  const [silenceCountdown, setSilenceCountdown] = useState(0);

  // Transcript management
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const fullTranscript = (finalTranscript + " " + interimTranscript).trim();

  const [answers, setAnswers] = useState<AnswerLog[]>([]);
  const [summary, setSummary] = useState("");
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiFeedback, setAiFeedback] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const thinkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextQuestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef(false);
  const isInterviewActiveRef = useRef(false);
  const livePhaseRef = useRef<LivePhase>("speaking");

  // ─── Cleanup helpers ───────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (thinkTimerRef.current) { clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    if (nextQuestionTimeoutRef.current) { clearTimeout(nextQuestionTimeoutRef.current); nextQuestionTimeoutRef.current = null; }
  }, []);

  const pauseRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  const destroyRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  const stopLiveResources = useCallback(() => {
    isInterviewActiveRef.current = false;
    isSubmittingRef.current = false;
    livePhaseRef.current = "speaking";
    clearAllTimers();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    destroyRecognition();
    window.speechSynthesis.cancel();
  }, [clearAllTimers, destroyRecognition]);

  useEffect(() => {
    return () => { stopLiveResources(); };
  }, [stopLiveResources]);

  useEffect(() => {
    livePhaseRef.current = livePhase;
  }, [livePhase]);

  // ─── AI Evaluation ─────────────────────────────────────────────
  const evaluateAndSaveInterview = useCallback(async (answerLog: AnswerLog[]) => {
    if (!user) return;

    const allQuestions = answerLog.map((item, i) => `Q${i + 1}: ${item.question}`).join("\n");
    const allAnswers = answerLog.map((item, i) => `A${i + 1}: ${item.answer || "No answer provided"}`).join("\n");
    const totalQuestions = answerLog.length;

    let evaluationText = "";
    let score: number | null = null;

    if (totalQuestions > 0) {
      try {
        const evalResponse = await aiApi.evaluate({
          question: allQuestions,
          answer: allAnswers,
          total: totalQuestions,
        });
        evaluationText = evalResponse.data;
        score = parseScoreFromEvaluation(evaluationText);
      } catch {
        evaluationText = "AI evaluation could not be completed.\n\n" +
          answerLog.map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer || "No answer"}`).join("\n\n");
      }
    } else {
      evaluationText = "Interview ended before any questions were answered.";
      score = 0;
    }
    if (score === null) score = 0;

    setAiScore(score);
    setAiFeedback(evaluationText);

    const fullResult = `Score: ${score}%\n\n${evaluationText}\n\n--- Full Q&A ---\n${
      answerLog.map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer || "No answer"}`).join("\n\n")
    }`;
    setSummary(fullResult);

    try {
      await resultApi.saveInterview({ userId: user.id, tech: selected, result: fullResult });
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to save interview result."));
    }
  }, [selected, user]);

  // ─── End interview ─────────────────────────────────────────────
  const endInterview = useCallback(async (finalAnswers: AnswerLog[]) => {
    stopLiveResources();
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }

    setIsLoading(true);
    setState("result");

    try {
      await evaluateAndSaveInterview(finalAnswers);
    } catch {
      toast.error("Failed to complete interview evaluation.");
    } finally {
      setIsLoading(false);
    }
  }, [evaluateAndSaveInterview, stopLiveResources]);

  // ─── Start listening (called after think delay) ────────────────
  const startListening = useCallback(() => {
    if (!isInterviewActiveRef.current) return;

    setFinalTranscript("");
    setInterimTranscript("");
    setLivePhase("listening");
    livePhaseRef.current = "listening";
    setSilenceCountdown(0);

    if (recognitionRef.current) {
      try { recognitionRef.current.start(); } catch { /* already started */ }
    }
  }, []);

  // ─── Speak question → think delay → listen ────────────────────
  const speakAndListen = useCallback((text: string) => {
    if (!isInterviewActiveRef.current) return;

    if (!("speechSynthesis" in window)) {
      // Fallback: skip speech, go straight to think → listen
      setLivePhase("thinking");
      setThinkCountdown(3);
      let remaining = 3;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setThinkCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current!);
          startListening();
        }
      }, 1000);
      return;
    }

    // Stop everything first
    window.speechSynthesis.cancel();
    pauseRecognition();
    clearAllTimers();

    setLivePhase("speaking");
    livePhaseRef.current = "speaking";

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      if (!isInterviewActiveRef.current) return;
      // AI finished speaking → "Think about your answer" countdown
      setLivePhase("thinking");
      livePhaseRef.current = "thinking";
      setThinkCountdown(3);

      let remaining = 3;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setThinkCountdown(remaining);
        if (remaining <= 0) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          startListening();
        }
      }, 1000);
    };

    window.speechSynthesis.speak(utterance);
  }, [clearAllTimers, pauseRecognition, startListening]);

  // ─── Submit the current answer ─────────────────────────────────
  const submitCurrentAnswer = useCallback(async (answerText: string) => {
    if (!interviewId || !currentQuestion) return;
    if (isSubmittingRef.current) return;
    if (!isInterviewActiveRef.current) return;

    const cleanAnswer = answerText.trim();
    if (!cleanAnswer) {
      toast.error("No answer detected. Please speak your answer clearly.");
      // Restart listening
      startListening();
      return;
    }

    isSubmittingRef.current = true;
    pauseRecognition();
    clearAllTimers();
    setLivePhase("submitting");
    livePhaseRef.current = "submitting";
    setIsLoading(true);

    try {
      const next = await interviewApi.answer({
        interviewId,
        answer: cleanAnswer,
      });

      const updatedAnswers = [...answers, { question: currentQuestion, answer: cleanAnswer }];
      setAnswers(updatedAnswers);

      if (next.data === "Interview Completed") {
        isSubmittingRef.current = false;
        await endInterview(updatedAnswers);
        return;
      }

      // Move to next question
      setQuestionNumber((v) => v + 1);
      setCurrentQuestion(next.data);
      setFinalTranscript("");
      setInterimTranscript("");
      setIsLoading(false);
      isSubmittingRef.current = false;

      // Small pause before speaking next question
      nextQuestionTimeoutRef.current = setTimeout(() => {
        nextQuestionTimeoutRef.current = null;
        speakAndListen(next.data);
      }, 500);
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to submit answer."));
      setIsLoading(false);
      isSubmittingRef.current = false;
      // Restart listening so user can try again
      startListening();
    }
  }, [answers, clearAllTimers, currentQuestion, endInterview, interviewId, pauseRecognition, speakAndListen, startListening]);

  // ─── Setup speech recognition ──────────────────────────────────
  const setupSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setFinalTranscript((prev) => (prev + " " + final).trim());
      }
      setInterimTranscript(interim);

      // Reset silence timer on any speech activity
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setSilenceCountdown(5);

      // Start a countdown visual
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      let silenceRemaining = 5;
      countdownIntervalRef.current = setInterval(() => {
        silenceRemaining -= 1;
        setSilenceCountdown(silenceRemaining);
        if (silenceRemaining <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      }, 1000);

      // Auto-submit after 5s of no new speech
      silenceTimerRef.current = setTimeout(() => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (!isInterviewActiveRef.current) return;
        // Get the latest accumulated transcript
        setFinalTranscript((currentFinal) => {
          setInterimTranscript((currentInterim) => {
            const fullAnswer = (currentFinal + " " + currentInterim).trim();
            if (fullAnswer && !isSubmittingRef.current) {
              void submitCurrentAnswer(fullAnswer);
            }
            return "";
          });
          return currentFinal;
        });
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        toast.error("Microphone permission was blocked. Please allow mic access and try again.");
        return;
      }

      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
        toast.error("Voice recognition had a problem. Please try speaking again.");
      }
    };

    recognition.onend = () => {
      // Auto-restart if we're still in listening phase and not submitting
      if (!isSubmittingRef.current && isInterviewActiveRef.current && livePhaseRef.current === "listening") {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
  }, [submitCurrentAnswer]);

  // Re-create recognition when submitCurrentAnswer changes
  useEffect(() => {
    if (state === "live") {
      setupSpeechRecognition();
    }
  }, [setupSpeechRecognition, state]);

  // ─── Manual submit button handler ──────────────────────────────
  const handleManualSubmit = () => {
    if (isSubmittingRef.current) return;
    clearAllTimers();
    const answer = fullTranscript;
    if (answer) {
      void submitCurrentAnswer(answer);
    } else {
      toast.error("No answer detected yet. Please speak your answer.");
    }
  };

  // ─── Start interview ──────────────────────────────────────────
  const startInterview = async () => {
    if (!selected || !difficulty) return;
    if (!useCredit()) { setShowUpgrade(true); return; }

    setIsLoading(true);
    try {
      const response = await interviewApi.start({ tech: selected, difficulty });
      setInterviewId(response.data.interviewId);
      setCurrentQuestion(response.data.question);
      setQuestionNumber(1);
      setAnswers([]);
      setSummary("");
      setAiScore(null);
      setAiFeedback("");
      setFinalTranscript("");
      setInterimTranscript("");
      isInterviewActiveRef.current = false;
      livePhaseRef.current = "speaking";
      setState("permissions");
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to start interview."));
    } finally {
      setIsLoading(false);
    }
  };

  const grantPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }

        isInterviewActiveRef.current = true;
        livePhaseRef.current = "speaking";
        setState("live");
        setupSpeechRecognition();

      nextQuestionTimeoutRef.current = setTimeout(() => {
        nextQuestionTimeoutRef.current = null;
        if (!isInterviewActiveRef.current) return;
        if (videoRef.current) { videoRef.current.srcObject = stream; }
        speakAndListen(currentQuestion);
      }, 600);
    } catch {
      toast.error("Camera and microphone access is required.");
    }
  };

  const reset = () => {
    stopLiveResources();
    isInterviewActiveRef.current = false;
    setState("setup");
    setSelected("");
    setDifficulty("");
    setInterviewId(null);
    setCurrentQuestion("");
    setQuestionNumber(1);
    setAnswers([]);
    setFinalTranscript("");
    setInterimTranscript("");
    setSummary("");
    setAiScore(null);
    setAiFeedback("");
    setLivePhase("speaking");
    livePhaseRef.current = "speaking";
  };

  const displayScore = aiScore ?? 0;

  // ─── Phase-specific status text ────────────────────────────────
  const getPhaseIndicator = () => {
    switch (livePhase) {
      case "speaking":
        return (
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">AI is asking a question...</span>
          </div>
        );
      case "thinking":
        return (
          <div className="flex items-center gap-2 text-yellow-400">
            <span className="text-sm font-medium">Think about your answer... {thinkCountdown}s</span>
          </div>
        );
      case "listening":
        return (
          <div className="flex items-center gap-2 text-green-400">
            <Mic className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">🎤 Listening — speak your answer now</span>
            {silenceCountdown > 0 && silenceCountdown <= 5 && fullTranscript && (
              <span className="text-xs text-muted-foreground ml-2">(auto-submit in {silenceCountdown}s)</span>
            )}
          </div>
        );
      case "submitting":
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Processing your answer...</span>
          </div>
        );
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial="hidden" animate="visible" className="max-w-3xl mx-auto">
        <motion.h1 variants={fadeUp} custom={0} className="text-3xl md:text-4xl font-bold mb-2">
          <TextReveal text="AI Mock" /> <span className="gradient-text">Interview</span>
        </motion.h1>
        <motion.p variants={fadeUp} custom={1} className="text-muted-foreground mb-2">
          Practice with our AI interviewer. Select your preferences and start.
        </motion.p>
        <motion.div variants={fadeUp} custom={1.5} className="text-sm text-muted-foreground mb-10">
          Credits remaining: <span className="text-primary font-bold">{credits}</span>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ─── SETUP ─────────────────────────────────────────── */}
          {state === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex gap-2 mb-8">
                {([
                  { key: "technology" as const, icon: Code2, label: "By Technology" },
                  { key: "company" as const, icon: Building2, label: "By Company" },
                ]).map((m) => (
                  <button key={m.key} onClick={() => { setMode(m.key); setSelected(""); }}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                      mode === m.key ? "bg-primary/10 text-primary border border-primary/30" : "glass-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <m.icon className="w-4 h-4" /> {m.label}
                  </button>
                ))}
              </div>

              <div className="mb-8">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Select {mode === "technology" ? "Technology" : "Company"}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(mode === "technology" ? technologies : companies).map((item, i) => (
                    <motion.button key={item} variants={fadeUp} initial="hidden" animate="visible" custom={i}
                      onClick={() => setSelected(item)}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        selected === item ? "bg-primary/15 text-primary border border-primary/30 glow-border" : "glass-card text-muted-foreground hover:text-foreground hover-lift"
                      }`}
                    >{item}</motion.button>
                  ))}
                </div>
              </div>

              <div className="mb-10">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Difficulty</h3>
                <div className="flex gap-3">
                  {difficulties.map((d) => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      className={`px-6 py-3 rounded-xl text-sm font-medium transition-all ${
                        difficulty === d ? "bg-primary/15 text-primary border border-primary/30" : "glass-card text-muted-foreground hover:text-foreground"
                      }`}
                    >{d}</button>
                  ))}
                </div>
              </div>

              <Button size="lg" disabled={!selected || !difficulty || isLoading}
                onClick={() => void startInterview()}
                className="bg-primary text-primary-foreground font-semibold px-10 hover:bg-primary/90 disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Start Interview <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* ─── PERMISSIONS ───────────────────────────────────── */}
          {state === "permissions" && (
            <motion.div key="permissions" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="glass-card p-10 text-center max-w-md mx-auto">
              <AlertTriangle className="w-12 h-12 text-primary mx-auto mb-6" />
              <h2 className="text-xl font-bold mb-3">Permissions Required</h2>
              <p className="text-muted-foreground text-sm mb-6">Allow camera & microphone access for the interview.</p>
              <div className="flex flex-col gap-3 mb-6">
                <div className="flex items-center gap-3 glass-card p-4 rounded-lg"><Camera className="w-5 h-5 text-primary" /><span className="text-sm">Camera Access</span></div>
                <div className="flex items-center gap-3 glass-card p-4 rounded-lg"><Mic className="w-5 h-5 text-primary" /><span className="text-sm">Microphone Access</span></div>
                <div className="flex items-center gap-3 glass-card p-4 rounded-lg"><Maximize className="w-5 h-5 text-primary" /><span className="text-sm">Fullscreen Mode</span></div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                💡 After AI asks a question, you'll get 3 seconds to think before it starts listening. Your answer auto-submits after 5 seconds of silence, or you can click the Submit button.
              </p>
              <Button onClick={() => void grantPermissions()} className="bg-primary text-primary-foreground font-semibold w-full hover:bg-primary/90">Grant & Start</Button>
            </motion.div>
          )}

          {/* ─── LIVE INTERVIEW ────────────────────────────────── */}
          {state === "live" && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background z-50 flex flex-col p-6 overflow-hidden">
              {/* Top bar */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 px-4 py-2 rounded-full border border-primary/20 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold text-primary tracking-wider uppercase">Live</span>
                  </div>
                  <div className="text-muted-foreground text-sm font-medium">Question {questionNumber}</div>
                  <div className="text-muted-foreground text-xs">({answers.length} answered)</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void endInterview(answers)} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                  <PhoneOff className="w-4 h-4 mr-2" /> End
                </Button>
              </div>

              {/* Video panels */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center max-w-7xl mx-auto w-full">
                {/* AI Panel */}
                <div className="flex-1 glass-card glow-border rounded-3xl relative overflow-hidden flex items-center justify-center p-10 min-h-[300px]">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50" />
                  <div className="relative z-10 flex flex-col items-center gap-6">
                    <motion.div
                      animate={livePhase === "speaking" ? { scale: [1, 1.08, 1] } : { y: [0, -10, 0] }}
                      transition={livePhase === "speaking" ? { duration: 1.5, repeat: Infinity } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      className="w-36 h-36 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center"
                    >
                      <Sparkles className="w-16 h-16 text-primary" />
                    </motion.div>

                    {livePhase === "speaking" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-primary/20 text-primary text-xs uppercase font-bold px-4 py-1.5 rounded-full border border-primary/30 flex items-center gap-2">
                        <Sparkles className="w-3 h-3 animate-spin" style={{ animationDuration: "3s" }} /> Speaking...
                      </motion.div>
                    )}
                    {livePhase === "thinking" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-yellow-500/20 text-yellow-400 text-xs uppercase font-bold px-4 py-1.5 rounded-full border border-yellow-500/30">
                        Think... {thinkCountdown}s
                      </motion.div>
                    )}
                  </div>
                  <div className="absolute bottom-5 left-5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-semibold">PlaceAI Interviewer</span>
                  </div>
                </div>

                {/* User Panel */}
                <div className="flex-1 glass-card glow-border rounded-3xl relative overflow-hidden bg-black/40 min-h-[300px]">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
                  <div className="absolute bottom-5 left-5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_10px_white]" />
                    <span className="text-sm font-semibold text-white drop-shadow-md">{user?.name || "Candidate"}</span>
                  </div>
                  {livePhase === "listening" && (
                    <div className="absolute top-5 left-5">
                      <span className="bg-green-500/30 text-green-300 text-[10px] uppercase font-bold px-3 py-1.5 rounded-md border border-green-500/30 backdrop-blur-md flex items-center gap-2">
                        <Mic className="w-3 h-3 animate-pulse" /> Listening
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-5 right-5 flex gap-2">
                    <div className={`p-2.5 rounded-full backdrop-blur-md border border-white/20 ${livePhase === "listening" ? "bg-green-500/30" : "bg-white/10"}`}>
                      {livePhase === "listening" ? <Mic className="w-4 h-4 text-green-300" /> : <MicOff className="w-4 h-4 text-white/50" />}
                    </div>
                    <div className="p-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                      <Video className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom section: question + transcript + controls */}
              <div className="mt-6 flex flex-col items-center gap-4 max-w-4xl mx-auto w-full pb-4">
                {/* Phase indicator */}
                <div className="h-6">{getPhaseIndicator()}</div>

                {/* Current question */}
                <AnimatePresence mode="wait">
                  <motion.div key={currentQuestion} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center px-4">
                    <h2 className="text-lg md:text-xl font-semibold">"{currentQuestion}"</h2>
                  </motion.div>
                </AnimatePresence>

                {/* Transcript + submit button */}
                <div className="w-full glass-card p-4 rounded-2xl">
                  <div className="min-h-[60px] flex items-center justify-center text-center">
                    {livePhase === "submitting" ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Sending to AI...
                      </div>
                    ) : fullTranscript ? (
                      <p className="text-sm">{fullTranscript}<span className="text-muted-foreground animate-pulse">|</span></p>
                    ) : livePhase === "listening" ? (
                      <p className="text-sm italic text-muted-foreground">Speak your answer now... (auto-submits after 5s of silence)</p>
                    ) : livePhase === "thinking" ? (
                      <p className="text-sm italic text-muted-foreground">Get ready to answer...</p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">AI is asking the question...</p>
                    )}
                  </div>

                  {/* Manual submit button — only visible when listening and has transcript */}
                  {livePhase === "listening" && fullTranscript && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center mt-3">
                      <Button size="sm" onClick={handleManualSubmit}
                        className="bg-primary text-primary-foreground font-semibold px-6 hover:bg-primary/90"
                      >
                        <Send className="w-4 h-4 mr-2" /> Submit Answer
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── RESULT ────────────────────────────────────────── */}
          {state === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-10 text-center max-w-2xl mx-auto">
              {isLoading ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-muted-foreground">AI is evaluating your entire interview...</p>
                  <p className="text-xs text-muted-foreground">This may take a moment</p>
                </div>
              ) : (
                <>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
                    className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center glow-border bg-primary/10"
                  >
                    <span className={`text-3xl font-bold ${displayScore >= 70 ? "text-green-400" : displayScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>{displayScore}%</span>
                  </motion.div>
                  <h2 className="text-xl font-bold mb-2">Interview Complete!</h2>
                  <p className="text-muted-foreground text-sm mb-6">
                    {answers.length > 0
                      ? `Answered ${answers.length} questions on ${selected}. Score evaluated by AI.`
                      : "No questions were answered."}
                  </p>

                  {aiFeedback && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI Evaluation</h3>
                      <div className="glass-card p-4 rounded-xl text-left text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {aiFeedback}
                      </div>
                    </div>
                  )}

                  {answers.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Answers</h3>
                      <div className="space-y-3 text-left max-h-72 overflow-y-auto">
                        {answers.map((item, i) => (
                          <div key={i} className="glass-card p-4 rounded-xl">
                            <p className="text-sm font-medium mb-1">Q{i + 1}: {item.question}</p>
                            <p className="text-sm text-muted-foreground">A: {item.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button onClick={reset} className="bg-primary text-primary-foreground font-semibold w-full hover:bg-primary/90">Try Again</Button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default InterviewPage;
