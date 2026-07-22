import type { Author } from "@/lib/social/types";

const houseTints: Record<string, string> = {
  corvane: "#C8A24C",
  emberfall: "#E5702A",
  frosthold: "#6E7683",
  stormcrest: "#ECE4D2",
  nightvale: "#7E1F1C",
  goldmane: "#F0D68C",
};

export function Avatar({
  author,
  size = 40,
}: {
  author: Pick<Author, "handle" | "display_name" | "avatar_url" | "house_slug">;
  size?: number;
}) {
  const tint = houseTints[author.house_slug ?? ""] ?? "#6E7683";
  const letter = (author.display_name ?? author.handle ?? "?")
    .slice(0, 1)
    .toUpperCase();
  if (author.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.avatar_url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: `1px solid ${tint}44` }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${tint}26, #101017)`,
        border: `1px solid ${tint}55`,
        color: tint,
        fontSize: size * 0.42,
      }}
    >
      {letter}
    </div>
  );
}
