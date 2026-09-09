import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CountdownTimer from "./CountdownTimer";
import Stopwatch from "./Stopwatch";

vi.mock("../lib/haptics", () => ({ haptics: { success: vi.fn() } }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("completes a local rest countdown once and cancels it when closed", () => {
  const complete = vi.fn();
  const first = render(<CountdownTimer duration={2} onComplete={complete} onSkip={vi.fn()} />);
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText("0:00")).toBeInTheDocument();
  expect(complete).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(2000));
  expect(complete).toHaveBeenCalledTimes(1);
  first.unmount();
  const second = render(<CountdownTimer duration={2} onComplete={complete} onSkip={vi.fn()} />);
  second.unmount();
  act(() => vi.advanceTimersByTime(2000));
  expect(complete).toHaveBeenCalledTimes(1);
});

it("reports numeric active seconds across stopwatch pause and resume", () => {
  const stop = vi.fn();
  render(<Stopwatch onStop={stop} />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(stop).toHaveBeenLastCalledWith(3);
  act(() => vi.advanceTimersByTime(5000));
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(stop).toHaveBeenLastCalledWith(5);
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByText("0:00")).toBeInTheDocument();
});
