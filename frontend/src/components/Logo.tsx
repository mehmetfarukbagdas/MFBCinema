export function Logo({ small = false }: { small?: boolean }) {
  return (
    <a className={"brand " + (small ? "brand-small" : "")} href="/" aria-label="MFB Cinema home">
      <svg viewBox="0 0 100 48" role="img" aria-label="MFB">
        <text x="1" y="37" className="logo-type">
          M
        </text>
        <text x="37" y="37" className="logo-type">
          F
        </text>
        <text x="61" y="37" className="logo-type">
          B
        </text>
        <path d="M46 4 L56 4 L56 39 L46 39 Z" fill="#e5093b" />
        <path d="M49 6 L53 6 L53 36 L49 36 Z" fill="#ff526f" opacity=".7" />
      </svg>
      <span>C I N E M A</span>
    </a>
  );
}
