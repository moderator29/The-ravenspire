import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";

/* The plain reading of a legal page, above the legal reading of it.
 *
 * Terms and a privacy policy are the two surfaces a member is least likely to
 * read and most likely to be affected by. A short version at the top is not a
 * softening of them, it is the difference between a document that is available
 * and a document that is understood.
 *
 * Three rules keep it honest:
 *
 * 1. Every point must be a fair summary of a section that is actually below
 *    it, and links to that section. The summary points at the operative text
 *    rather than standing in for it.
 * 2. It never says anything the sections do not say. If a promise is not in
 *    the document, it does not belong here.
 * 3. It says plainly that it is a summary and that the sections govern. That
 *    line is not fine print, it sits with the heading.
 */

export type GlancePoint = {
  icon: Icon3DName;
  title: string;
  body: string;
  /* The anchor of the section this summarises. */
  href: string;
};

export function AtAGlance({ points }: { points: GlancePoint[] }) {
  return (
    <section
      aria-labelledby="at-a-glance"
      className="mt-8 rounded-2xl border border-steel-line bg-panel/60 p-5 sm:p-7"
    >
      <h2
        id="at-a-glance"
        className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        The short version
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-bone-faint">
        A plain summary, not a replacement. The numbered sections below are what
        govern, and each point here links to the one it came from.
      </p>

      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {points.map((p) => (
          <li key={p.href}>
            <a
              href={p.href}
              className="group flex h-full flex-col gap-2 rounded-xl border border-steel-line bg-panel p-4 transition-colors duration-fast hover:border-gold/35"
            >
              <Icon3D name={p.icon} size="md" />
              <p className="font-display text-sm font-semibold text-bone">
                {p.title}
              </p>
              <p className="text-[13px] leading-relaxed text-bone-mut">
                {p.body}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
