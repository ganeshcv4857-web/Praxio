// Praxio logo: the exact brand artwork (public/brand/praxio-logo.webp), shown as-is.
// The artwork has a light background, so it sits on its own rounded light tile.

export default function Logo({ height = 40, className = '' }) {
  return (
    <img
      src="/brand/praxio-logo.webp"
      alt="Praxio"
      style={{ height }}
      className={`w-auto rounded-lg ${className}`}
      draggable="false"
    />
  );
}
