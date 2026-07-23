import Link from "next/link";
import { Fragment } from "react";
import { CashtagChip } from "@/components/social/cashtag-chip";

/* Renders raven text with $cashtags gold, @mentions linked, urls linked. */
export function RichBody({ text }: { text: string }) {
  const parts = text.split(/(\$[a-zA-Z]{2,12}\b|@[a-z0-9_]{2,20}\b|https?:\/\/\S+)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (/^\$[a-zA-Z]{2,12}$/.test(part)) {
          return <CashtagChip key={i} tag={part.toUpperCase()} />;
        }
        if (/^@[a-z0-9_]{2,20}$/.test(part)) {
          return (
            <Link
              key={i}
              href={`/u/${part.slice(1)}`}
              className="font-medium text-gold-rich hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-rich underline decoration-gold-deep/50"
            >
              {part.replace(/^https?:\/\//, "").slice(0, 40)}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
