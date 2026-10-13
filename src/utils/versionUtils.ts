/**
 * WaveCraft Version Utilities
 * Pure semver and version comparison utilities for in-app updates.
 */

export const parseSemver = (v: string): number[] => {
  return v
    .replace(/^v/i, '')
    .split('.')
    .map((num) => parseInt(num, 10) || 0);
};

export const isVersionGreater = (latest: string, current: string): boolean => {
  const l = parseSemver(latest);
  const c = parseSemver(current);
  const len = Math.max(l.length, c.length);
  for (let i = 0; i < len; i++) {
    const valL = l[i] ?? 0;
    const valC = c[i] ?? 0;
    if (valL > valC) return true;
    if (valL < valC) return false;
  }
  return false;
};
