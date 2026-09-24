/** The MarkUP mark (geometry from scripts/icon.mjs). The left leg follows the text color. */
export function Logo({ size = 16 }: { size?: number }) {
  return (
    <svg className="logo" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <polygon fill="currentColor" points="8,12 30,25 30,76 8,90" />
      <polygon fill="#1f5cb8" points="70,24 92,10 92,90 70,76" />
      <polygon fill="#2f80ed" points="30,25 50,36.8 92,10 92,40 50,66.8 30,55" />
    </svg>
  );
}
