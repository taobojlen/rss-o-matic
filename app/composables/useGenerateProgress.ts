import { ref } from "vue";

export type ProgressStep = "fetching" | "analyzing" | "done";

const DEFAULT_ANALYZING_LABEL = "Feeding the page to the machine...";

export const SLOW_MESSAGES = [
  "Firing up the transmogrifier...",
  "Reticulating splines...",
  "Warming up the vacuum tubes...",
  "Consulting the instruction manual...",
  "Adjusting the antenna...",
  "Polishing the chrome...",
  "Tuning the frequency...",
  "Spinning up the centrifuge...",
  "Lubricating the gears...",
  "Reversing the polarity...",
  "Engaging the turbo encabulator...",
  "Winding the mainspring...",
];

interface UseGenerateProgressOptions {
  fetchDelay?: number;
  splineDelay?: number;
  rotateInterval?: number;
}

export function useGenerateProgress(options?: UseGenerateProgressOptions) {
  const fetchDelay = options?.fetchDelay ?? 2000;
  const splineDelay = options?.splineDelay ?? 5000;
  const rotateInterval = options?.rotateInterval ?? 3500;

  const currentStep = ref<ProgressStep | null>(null);
  const completedSteps = ref(new Set<ProgressStep>());
  const analyzingLabel = ref(DEFAULT_ANALYZING_LABEL);

  let fetchTimer: ReturnType<typeof setTimeout> | null = null;
  let splineTimer: ReturnType<typeof setTimeout> | null = null;
  let rotateTimer: ReturnType<typeof setInterval> | null = null;

  function pickSlowMessage(): string {
    const current = analyzingLabel.value;
    const candidates = SLOW_MESSAGES.filter((m) => m !== current);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? SLOW_MESSAGES[0]!;
  }

  function clearTimers() {
    if (fetchTimer !== null) {
      clearTimeout(fetchTimer);
      fetchTimer = null;
    }
    if (splineTimer !== null) {
      clearTimeout(splineTimer);
      splineTimer = null;
    }
    if (rotateTimer !== null) {
      clearInterval(rotateTimer);
      rotateTimer = null;
    }
  }

  function start() {
    clearTimers();
    currentStep.value = "fetching";
    completedSteps.value = new Set();
    analyzingLabel.value = DEFAULT_ANALYZING_LABEL;

    fetchTimer = setTimeout(() => {
      completedSteps.value = new Set([...completedSteps.value, "fetching"]);
      currentStep.value = "analyzing";

      splineTimer = setTimeout(() => {
        analyzingLabel.value = pickSlowMessage();
        rotateTimer = setInterval(() => {
          analyzingLabel.value = pickSlowMessage();
        }, rotateInterval);
      }, splineDelay);
    }, fetchDelay);
  }

  function finish() {
    clearTimers();
    completedSteps.value = new Set<ProgressStep>([
      "fetching",
      "analyzing",
      "done",
    ]);
    currentStep.value = "done";
  }

  function reset() {
    clearTimers();
    currentStep.value = null;
    completedSteps.value = new Set();
    analyzingLabel.value = DEFAULT_ANALYZING_LABEL;
  }

  return { currentStep, completedSteps, analyzingLabel, start, finish, reset };
}
