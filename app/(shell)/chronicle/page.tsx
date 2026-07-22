import { chronicle } from "@/lib/data/chronicle";
import { BackButton } from "@/components/shell/back-button";

export default function ChroniclePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <BackButton />
      <h1 className="gold-text mt-3 font-display text-2xl font-semibold sm:text-3xl">
        The Chronicle
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        How the realm works
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Table of contents */}
        <nav className="glass glass-sm shrink-0 p-4 lg:sticky lg:top-6 lg:w-56">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            Contents
          </p>
          <ol className="mt-3 flex flex-col gap-2">
            {chronicle.map((s, i) => (
              <li key={s.slug}>
                <a
                  href={`#${s.slug}`}
                  className="flex items-baseline gap-2 text-sm text-bone-mut transition-colors hover:text-gold"
                >
                  <span className="tnum text-xs text-bone-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4">
            {chronicle.map((s) => (
              <section
                key={s.slug}
                id={s.slug}
                className="glass scroll-mt-6 p-6 sm:p-8"
              >
                <h2 className="font-display text-xl font-semibold text-bone">
                  {s.title}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gold">
                  {s.plain}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {s.body.map((p, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-bone-mut"
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <footer className="mt-6 pb-4 text-center">
            <p className="text-xs uppercase tracking-[0.26em] text-bone-faint">
              Non-custodial, always. Standing earned, never bought.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
