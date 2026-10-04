export default function Logo({ size = 28 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#d4a843" />
            <path d="M6 22 4.5 10.5l6.2 5L16 8l5.3 7.5 6.2-5L26 22z" fill="#0d1b2a" />
            <rect x="6" y="23.5" width="20" height="2.5" rx="1" fill="#0d1b2a" />
        </svg>
    );
}
