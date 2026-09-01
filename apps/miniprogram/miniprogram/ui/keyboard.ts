function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resolveKeyboardInset(reportedHeight: number, baselineWindowHeight: number, currentWindowHeight: number, pixelRatio = 1) {
  const baseline = finiteNonNegative(baselineWindowHeight);
  const current = finiteNonNegative(currentWindowHeight);
  let reported = finiteNonNegative(reportedHeight);
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 1 ? pixelRatio : 1;
  if (baseline > 0 && reported > baseline) reported /= ratio;
  if (reported === 0) return 0;
  const viewportReduction = Math.max(0, baseline - current);
  const uncovered = Math.max(0, reported - viewportReduction);
  const usableHeight = current || baseline;
  return Math.round(usableHeight > 0 ? Math.min(uncovered, usableHeight * 0.75) : uncovered);
}
