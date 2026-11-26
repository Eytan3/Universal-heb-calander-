/** A drawn "return" arrow (curved back to the start), mirrored automatically in RTL via .flip. */
export function BackIcon() {
  return (
    <svg className="back-icon flip" viewBox="0 0 20 20" aria-hidden>
      <path d="M7.5 5 3.75 8.75 7.5 12.5" />
      <path d="M4 8.75h7.25a4.75 4.75 0 0 1 0 9.5H9" />
    </svg>
  );
}
