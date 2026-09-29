/**
 * Lesson Video Completion Rules
 * Prevents gaming completion by seeking directly to 90%.
 */
export const MIN_COMPLETION_PERCENTAGE = 90;

export interface WatchedInterval {
  start: number;
  end: number;
}

/**
 * Calculates meaningful playback coverage by merging overlapping watched intervals
 * and calculating true non-redundant watch time against the total video duration.
 */
export function calculateMeaningfulPlaybackCoverage(
  intervals: WatchedInterval[],
  totalDurationSeconds: number
): {
  watchedSeconds: number;
  coveragePercentage: number;
  isEligibleForCompletion: boolean;
} {
  if (totalDurationSeconds <= 0 || intervals.length === 0) {
    return {
      watchedSeconds: 0,
      coveragePercentage: 0,
      isEligibleForCompletion: false
    };
  }

  // Filter invalid intervals and clamp to [0, totalDurationSeconds]
  const validIntervals = intervals
    .map((inv) => ({
      start: Math.max(0, Math.min(inv.start, totalDurationSeconds)),
      end: Math.max(0, Math.min(inv.end, totalDurationSeconds))
    }))
    .filter((inv) => inv.end > inv.start)
    .sort((a, b) => a.start - b.start);

  if (validIntervals.length === 0) {
    return {
      watchedSeconds: 0,
      coveragePercentage: 0,
      isEligibleForCompletion: false
    };
  }

  // Merge overlapping or contiguous intervals
  const merged: WatchedInterval[] = [validIntervals[0]];

  for (let i = 1; i < validIntervals.length; i++) {
    const current = validIntervals[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  // Sum non-redundant watch duration
  const watchedSeconds = merged.reduce(
    (total, interval) => total + (interval.end - interval.start),
    0
  );

  const coveragePercentage = Math.min(
    100,
    Math.round((watchedSeconds / totalDurationSeconds) * 100)
  );

  return {
    watchedSeconds: Math.round(watchedSeconds),
    coveragePercentage,
    isEligibleForCompletion: coveragePercentage >= MIN_COMPLETION_PERCENTAGE
  };
}
