// Praxio logo: the "praxio." wordmark, set in Geist with the accent full stop.
// `height` is the visual line height in px (font size follows it); colour inherits.

export default function Logo({ height = 40, className = '' }) {
  return (
    <span
      role="img"
      aria-label="Praxio"
      className={`inline-block select-none font-bold leading-none ${className}`}
      style={{ fontFamily: "'Geist', system-ui, sans-serif", fontSize: Math.round(height * 0.6), letterSpacing: '-0.065em' }}
    >
      praxio<span className="text-[#8FA6FF]">.</span>
    </span>
  );
}
