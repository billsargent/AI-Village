/**
 * Spec section 14: "a text size setting (100-150%)". Kept in the browser,
 * and applied as the page's root font size, so every panel - all sized in
 * rem - grows with it. The map's pixel art doesn't change.
 */
export const TEXT_SIZES = [100, 115, 130, 150] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const STORAGE_KEY = 'ai-village.text-size';

export function loadTextSize(): TextSize {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return (TEXT_SIZES as readonly number[]).includes(saved) ? (saved as TextSize) : 100;
  } catch {
    return 100;
  }
}

export function applyTextSize(size: TextSize): void {
  document.documentElement.style.fontSize = size === 100 ? '' : `${size}%`;
}

export function saveTextSize(size: TextSize): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // Storage turned off: the size still applies until the page reloads.
  }
  applyTextSize(size);
}
