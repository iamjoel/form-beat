export type MainNavDestination = "fitness" | "workout" | "profile";

interface MainNavProps {
  active: MainNavDestination;
  onNavigate: (destination: MainNavDestination) => void;
}

export function MainNav({ active, onNavigate }: MainNavProps) {
  return (
    <nav className="main-nav" aria-label="主要导航">
      <button
        className="main-nav__button"
        data-active={active === "fitness" ? "true" : "false"}
        type="button"
        aria-current={active === "fitness" ? "page" : undefined}
        onClick={() => onNavigate("fitness")}
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
          <path d="M7 3v3M17 3v3M4 9h16" />
          <rect x="3.5" y="5" width="17" height="16" rx="2" />
          <path d="M8 13h3M8 17h3M15 13h1M15 17h1" />
        </svg>
        <span>体能</span>
      </button>

      <button
        className="main-nav__button"
        data-active={active === "workout" ? "true" : "false"}
        type="button"
        aria-current={active === "workout" ? "page" : undefined}
        onClick={() => onNavigate("workout")}
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
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
        </svg>
        <span>锻炼</span>
      </button>

      <button
        className="main-nav__button"
        data-active={active === "profile" ? "true" : "false"}
        type="button"
        aria-current={active === "profile" ? "page" : undefined}
        onClick={() => onNavigate("profile")}
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
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21c.8-4.2 3.3-6.3 7.5-6.3s6.7 2.1 7.5 6.3" />
        </svg>
        <span>个人</span>
      </button>
    </nav>
  );
}
