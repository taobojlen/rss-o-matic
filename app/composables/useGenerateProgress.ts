import { ref } from "vue";

export type ProgressStep = "fetching" | "analyzing" | "done";

const DEFAULT_ANALYZING_LABEL = "Feeding the page to the machine...";
const SPLINE_LABEL = "Reticulating splines...";

interface UseGenerateProgressOptions {
  fetchDelay?: number;
  splineDelay?: number;
}

export function useGenerateProgress(options?: UseGenerateProgressOptions) {
  const fetchDelay = options?.fetchDelay ?? 3500;
  const splineDelay = options?.splineDelay ?? 12000;

  const currentStep = ref<ProgressStep | null>(null);
  const completedSteps = ref(new Set<ProgressStep>());
  const analyzingLabel = ref(DEFAULT_ANALYZING_LABEL);

  let fetchTimer: ReturnType<typeof setTimeout> | null = null;
  let splineTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    if (fetchTimer !== null) {
      clearTimeout(fetchTimer);
      fetchTimer = null;
    }
    if (splineTimer !== null) {
      clearTimeout(splineTimer);
      splineTimer = null;
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
        analyzingLabel.value = SPLINE_LABEL;
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
