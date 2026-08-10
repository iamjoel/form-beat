export type MainNavDestination = "home" | "records";

interface MainNavProps {
  active: MainNavDestination;
  onNavigate: (destination: MainNavDestination) => void;
}

export function MainNav({ active, onNavigate }: MainNavProps) {
  return (
    <nav className="main-nav" aria-label="主要导航">
      <button
        className="main-nav__button"
        data-active={active === "home" ? "true" : "false"}
        type="button"
        aria-current={active === "home" ? "page" : undefined}
        onClick={() => onNavigate("home")}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3.5 10.5 8.5-7 8.5 7" />
          <path d="M5.5 9v11h13V9M9.5 20v-6h5v6" />
        </svg>
        <span>首页</span>
      </button>

      <button
        className="main-nav__button"
        data-active={active === "records" ? "true" : "false"}
        type="button"
        aria-current={active === "records" ? "page" : undefined}
        onClick={() => onNavigate("records")}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 4h14v16H5z" />
          <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
        </svg>
        <span>记录</span>
      </button>
    </nav>
  );
}
