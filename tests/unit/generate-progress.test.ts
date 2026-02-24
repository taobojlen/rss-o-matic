import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useGenerateProgress } from "../../app/composables/useGenerateProgress";

describe("useGenerateProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle state", () => {
    const { currentStep, completedSteps } = useGenerateProgress();
    expect(currentStep.value).toBe(null);
    expect(completedSteps.value.size).toBe(0);
  });

  it("sets fetching step on start()", () => {
    const { currentStep, completedSteps, start } = useGenerateProgress();
    start();
    expect(currentStep.value).toBe("fetching");
    expect(completedSteps.value.size).toBe(0);
  });

  it("advances to analyzing after fetch delay", () => {
    const { currentStep, completedSteps, start } = useGenerateProgress({
      fetchDelay: 3500,
    });
    start();
    vi.advanceTimersByTime(3500);
    expect(currentStep.value).toBe("analyzing");
    expect(completedSteps.value.has("fetching")).toBe(true);
    expect(completedSteps.value.has("analyzing")).toBe(false);
  });

  it("shows slow message after spline delay", () => {
    const { currentStep, analyzingLabel, start } = useGenerateProgress({
      fetchDelay: 3500,
      splineDelay: 12000,
    });
    start();
    vi.advanceTimersByTime(3500);
    expect(currentStep.value).toBe("analyzing");
    expect(analyzingLabel.value).toBe("Feeding the page to the machine...");

    vi.advanceTimersByTime(12000);
    expect(analyzingLabel.value).toBe("Reticulating splines...");
  });

  it("finish() completes all steps from analyzing", () => {
    const { currentStep, completedSteps, start, finish } =
      useGenerateProgress({ fetchDelay: 3500 });
    start();
    vi.advanceTimersByTime(3500);
    finish();
    expect(currentStep.value).toBe("done");
    expect(completedSteps.value.has("fetching")).toBe(true);
    expect(completedSteps.value.has("analyzing")).toBe(true);
    expect(completedSteps.value.has("done")).toBe(true);
  });

  it("fast finish skips straight to done", () => {
    const { currentStep, completedSteps, start, finish } =
      useGenerateProgress({ fetchDelay: 3500 });
    start();
    // finish before the fetch delay timer fires
    finish();
    expect(currentStep.value).toBe("done");
    expect(completedSteps.value.has("fetching")).toBe(true);
    expect(completedSteps.value.has("analyzing")).toBe(true);
    expect(completedSteps.value.has("done")).toBe(true);
  });

  it("reset() clears state and cancels timers", () => {
    const { currentStep, completedSteps, start, reset } =
      useGenerateProgress({ fetchDelay: 3500 });
    start();
    reset();
    expect(currentStep.value).toBe(null);
    expect(completedSteps.value.size).toBe(0);

    // timer should not fire after reset
    vi.advanceTimersByTime(5000);
    expect(currentStep.value).toBe(null);
  });

  it("reset() cancels spline timer too", () => {
    const { analyzingLabel, start, reset } = useGenerateProgress({
      fetchDelay: 3500,
      splineDelay: 12000,
    });
    start();
    vi.advanceTimersByTime(3500);
    reset();
    vi.advanceTimersByTime(12000);
    // analyzingLabel should have been reset, not changed to spline text
    expect(analyzingLabel.value).toBe("Feeding the page to the machine...");
  });

  it("start() resets previous state", () => {
    const { currentStep, completedSteps, start, finish } =
      useGenerateProgress({ fetchDelay: 3500 });
    start();
    vi.advanceTimersByTime(3500);
    finish();
    expect(currentStep.value).toBe("done");

    start();
    expect(currentStep.value).toBe("fetching");
    expect(completedSteps.value.size).toBe(0);
  });
});
