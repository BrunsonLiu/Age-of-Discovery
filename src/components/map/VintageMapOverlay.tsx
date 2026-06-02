function CompassRose({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="roseGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f4e4c1" stopOpacity="0" />
          <stop offset="70%" stopColor="#c9a96e" stopOpacity="0.0" />
          <stop offset="100%" stopColor="#5a3e1a" stopOpacity="0.4" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#roseGrad)" stroke="#5a3e1a" strokeWidth="1.2" opacity="0.6" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="#8b6f3e" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.7" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="#8b6f3e" strokeWidth="0.5" opacity="0.5" />

      <g opacity="0.85">
        <polygon points="100,18 108,100 100,108 92,100" fill="#5a3e1a" stroke="#2b1e0e" strokeWidth="0.6" />
        <polygon points="100,182 108,100 100,92 92,100" fill="#c9a86a" stroke="#2b1e0e" strokeWidth="0.6" />
        <polygon points="18,100 100,92 108,100 100,108" fill="#8b6f3e" stroke="#2b1e0e" strokeWidth="0.6" />
        <polygon points="182,100 100,92 92,100 100,108" fill="#a0804a" stroke="#2b1e0e" strokeWidth="0.6" />
      </g>

      <g opacity="0.65">
        <polygon points="146,54 104,98 100,100 96,102" fill="#a0804a" stroke="#2b1e0e" strokeWidth="0.4" />
        <polygon points="54,146 102,100 100,96 98,100" fill="#a0804a" stroke="#2b1e0e" strokeWidth="0.4" />
        <polygon points="146,146 100,104 96,100 100,96" fill="#a0804a" stroke="#2b1e0e" strokeWidth="0.4" />
        <polygon points="54,54 100,96 104,100 100,104" fill="#a0804a" stroke="#2b1e0e" strokeWidth="0.4" />
      </g>

      <g fill="#2b1e0e" fontFamily="serif" fontSize="14" fontStyle="italic" fontWeight="700" textAnchor="middle">
        <text x="100" y="14">N</text>
        <text x="100" y="196">S</text>
        <text x="12" y="105">W</text>
        <text x="188" y="105">E</text>
      </g>

      <circle cx="100" cy="100" r="6" fill="#5a3e1a" stroke="#2b1e0e" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="2" fill="#f4e4c1" />
    </svg>
  )
}

function SeaMonster({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 180"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ transform: flip ? 'scaleX(-1)' : 'none' }}
    >
      <g fill="#5a3e1a" opacity="0.55" stroke="#2b1e0e" strokeWidth="0.6">
        <path d="M30,140 C20,120 25,95 45,80 C60,70 75,75 85,90
                 C95,75 110,72 120,85 C130,95 132,108 124,120
                 C135,118 145,128 142,140 C155,135 168,140 172,150
                 C160,150 148,148 138,150 C128,160 115,160 105,150
                 C95,160 80,158 70,148 C55,155 38,152 30,140 Z" />
        <path d="M45,80 C40,68 38,55 42,45 C44,40 50,42 50,50 C52,58 50,70 48,80" fill="none" strokeWidth="1" />
        <path d="M85,90 C82,78 80,65 84,55 C86,50 92,52 92,60 C94,68 90,80 88,90" fill="none" strokeWidth="1" />
        <path d="M120,85 C118,73 117,60 121,50 C123,45 129,47 128,55 C130,63 126,75 122,85" fill="none" strokeWidth="1" />
        <ellipse cx="100" cy="155" rx="30" ry="6" fill="none" strokeWidth="1" opacity="0.4" />
        <path d="M60,155 C55,160 50,162 45,160" fill="none" strokeWidth="1.2" />
        <path d="M80,160 C78,166 73,168 70,165" fill="none" strokeWidth="1.2" />
        <path d="M115,160 C112,166 107,168 104,164" fill="none" strokeWidth="1.2" />
      </g>
    </svg>
  )
}

function CompassStar({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g fill="#8b6f3e" opacity="0.4" stroke="#2b1e0e" strokeWidth="0.4">
        <polygon points="50,5 54,50 50,55 46,50" />
        <polygon points="50,95 54,50 50,45 46,50" />
        <polygon points="5,50 50,46 55,50 50,54" />
        <polygon points="95,50 50,46 45,50 50,54" />
        <polygon points="20,20 52,48 50,50 48,52" />
        <polygon points="80,80 50,52 48,50 50,48" />
        <polygon points="20,80 50,48 48,50 50,52" />
        <polygon points="80,20 48,52 50,50 52,48" />
      </g>
      <circle cx="50" cy="50" r="3" fill="#5a3e1a" />
    </svg>
  )
}

export default function VintageMapOverlay() {
  return (
    <div className="vintage-map-overlay pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="vintage-paper" />
      <div className="vintage-vignette" />

      <CompassRose className="absolute top-3 right-3 w-32 h-32 z-10 opacity-60" />
      <CompassStar className="absolute bottom-20 left-3 w-16 h-16 opacity-30" />
      <CompassStar className="absolute top-32 left-3 w-12 h-12 opacity-25" />

      <SeaMonster className="absolute top-4 left-4 w-40 h-30 opacity-50" />
      <SeaMonster className="absolute bottom-4 right-4 w-44 h-32 opacity-50" flip />

      <svg
        className="absolute bottom-4 left-1/2 -translate-x-1/2 w-64 h-16 opacity-50"
        viewBox="0 0 320 60"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="none" stroke="#5a3e1a" strokeWidth="1" opacity="0.7">
          <path d="M20,30 Q40,15 60,30 T100,30 T140,30 T180,30 T220,30 T260,30 T300,30" />
          <path d="M20,40 Q40,25 60,40 T100,40 T140,40 T180,40 T220,40 T260,40 T300,40" opacity="0.5" />
          <path d="M20,20 Q40,5 60,20 T100,20 T140,20 T180,20 T220,20 T260,20 T300,20" opacity="0.5" />
        </g>
        <g fill="#5a3e1a" opacity="0.6">
          <path d="M40,15 L42,20 L46,21 L43,24 L44,28 L40,26 L36,28 L37,24 L34,21 L38,20 Z" />
          <path d="M120,12 L122,17 L126,18 L123,21 L124,25 L120,23 L116,25 L117,21 L114,18 L118,17 Z" />
          <path d="M210,15 L212,20 L216,21 L213,24 L214,28 L210,26 L206,28 L207,24 L204,21 L208,20 Z" />
        </g>
      </svg>
    </div>
  )
}
