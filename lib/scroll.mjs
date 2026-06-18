export function distanceFromBottom(target) {
  if (!target) return 0;
  return Math.max(0, target.scrollHeight - target.scrollTop - target.clientHeight);
}

export function isNearBottom(target, threshold = 96) {
  return distanceFromBottom(target) <= threshold;
}
