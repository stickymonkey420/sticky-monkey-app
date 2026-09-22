"use client";

// Tiny cross-component store for the Monthly Income Goal.
//
// IncomeHistoryChart and NetWorthHistoryChart each independently fetch and
// display the same `income_goals` row (via fetchMonthlyGoal), with no
// shared state between them. Before this store existed, saving a new goal
// on one chart updated that chart instantly but left the OTHER chart
// showing the old goal (wrong dashed line, wrong beat/miss coloring, a
// stale "$X" label) until it happened to reload or remount.
//
// Both charts now read the goal through this store (via useSyncExternalStore)
// instead of their own local state, and any save calls setSharedGoal() --
// so every subscriber on the page re-renders with the new value
// immediately, without needing to know about each other or force a
// network refetch.
type Listener = () => void;

let currentGoal: number | null = null; // null = not yet loaded by any chart on this page
const listeners = new Set<Listener>();

export function getSharedGoal(): number | null {
  return currentGoal;
}

export function getSharedGoalServerSnapshot(): number | null {
  return null;
}

export function setSharedGoal(value: number): void {
  currentGoal = value;
  listeners.forEach((l) => l());
}

export function subscribeSharedGoal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
