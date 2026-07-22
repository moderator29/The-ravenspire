"use client";

/* The "sequencing" state: a gold double-helix scanning under a sweep line.
   Pure CSS, reduced-motion aware via the global media query in globals.css
   (which zeroes animations), so nothing here needs to special-case it. */

const RUNGS = Array.from({ length: 14 });

export function Sequencing({ subject }: { subject: string }) {
  return (
    <div className="glass flex flex-col items-center gap-6 px-6 py-10 text-center">
      <div className="dna-stage" aria-hidden="true">
        {RUNGS.map((_, i) => (
          <div
            key={i}
            className="dna-rung"
            style={{ animationDelay: `${i * 0.11}s` }}
          >
            <span className="dna-node dna-node-a" />
            <span className="dna-bond" />
            <span className="dna-node dna-node-b" />
          </div>
        ))}
        <div className="dna-sweep" />
      </div>

      <div>
        <p className="gold-text font-display text-lg font-semibold">
          Sequencing the DNA
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
          Reading {subject}
        </p>
        <p className="mt-3 max-w-xs text-sm text-bone-mut">
          Pulling real signals and distilling the strands. This takes a moment.
        </p>
      </div>

      <style>{`
        .dna-stage {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 190px;
          height: 150px;
          justify-content: center;
          overflow: hidden;
        }
        .dna-rung {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 8px;
          animation: dna-twist 2.1s ease-in-out infinite;
        }
        .dna-node {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex-shrink: 0;
          box-shadow: 0 0 8px rgba(200, 162, 76, 0.5);
        }
        .dna-node-a { background: var(--gold-bright); }
        .dna-node-b { background: var(--gold-deep); }
        .dna-bond {
          flex: 1;
          height: 2px;
          margin: 0 4px;
          background: linear-gradient(
            90deg,
            var(--gold-bright),
            rgba(200, 162, 76, 0.25),
            var(--gold-deep)
          );
        }
        .dna-sweep {
          position: absolute;
          left: 0;
          right: 0;
          height: 34px;
          top: -34px;
          background: linear-gradient(
            180deg,
            transparent,
            rgba(240, 214, 140, 0.22),
            transparent
          );
          animation: dna-scan 1.9s linear infinite;
        }
        @keyframes dna-twist {
          0%, 100% { transform: scaleX(1); opacity: 1; }
          50% { transform: scaleX(0.28); opacity: 0.55; }
        }
        @keyframes dna-scan {
          0% { top: -34px; }
          100% { top: 150px; }
        }
      `}</style>
    </div>
  );
}
