import { describe, expect, it } from "vitest";
import { mergeClasses } from "@/components/ui/merge";

/* Every case below is a defect that shipped, not a hypothetical. The class
   order in each `mergeClasses` call is the order the primitive composes in:
   base first, caller last. */

const has = (out: string, cls: string) => out.split(" ").includes(cls);

describe("mergeClasses drops the base class the caller replaced", () => {
  it("lets a circle beat the rectangle radius, which IconButton could not", () => {
    const out = mergeClasses("rounded-md", "rounded-[var(--radius-full)]");
    expect(has(out, "rounded-[var(--radius-full)]")).toBe(true);
    expect(has(out, "rounded-md")).toBe(false);
  });

  it("lets a caller un-bold a Button", () => {
    const out = mergeClasses("font-semibold leading-none", "font-normal");
    expect(has(out, "font-normal")).toBe(true);
    expect(has(out, "font-semibold")).toBe(false);
    /* Untouched families survive. */
    expect(has(out, "leading-none")).toBe(true);
  });

  it("lets a control be fixed to the viewport", () => {
    const out = mergeClasses("relative inline-flex", "fixed left-1/2 top-3");
    expect(has(out, "fixed")).toBe(true);
    expect(has(out, "relative")).toBe(false);
  });

  it("lets a control be hidden", () => {
    const out = mergeClasses("relative inline-flex", "hidden sm:inline-flex");
    expect(has(out, "hidden")).toBe(true);
    expect(has(out, "inline-flex")).toBe(false);
    /* The responsive variant is a different bucket and must survive. */
    expect(has(out, "sm:inline-flex")).toBe(true);
  });

  it("lets a caller shrink padding, which sort order forbade", () => {
    expect(has(mergeClasses("p-4", "p-3"), "p-3")).toBe(true);
    expect(has(mergeClasses("p-4", "p-3"), "p-4")).toBe(false);
    /* And the direction that already worked keeps working. */
    expect(has(mergeClasses("p-4", "p-6"), "p-6")).toBe(true);
    expect(has(mergeClasses("p-4", "p-6"), "p-4")).toBe(false);
  });

  it("keeps px and py independent of p", () => {
    const out = mergeClasses("p-4", "px-2");
    expect(has(out, "p-4")).toBe(true);
    expect(has(out, "px-2")).toBe(true);
  });

  it("separates a responsive base from an unconditional caller", () => {
    /* Card's md padding is `p-4 sm:p-5`. A caller's `p-6` must not silently
       lose above 640px, and the way to guarantee that is to key the variant
       separately and let the caller's own responsive classes decide. */
    const out = mergeClasses("p-4 sm:p-5", "p-6");
    expect(has(out, "p-6")).toBe(true);
    expect(has(out, "p-4")).toBe(false);
    expect(has(out, "sm:p-5")).toBe(true);
  });

  it("separates hover from the resting state", () => {
    const out = mergeClasses("bg-void/60 hover:bg-void/75", "bg-panel");
    expect(has(out, "bg-panel")).toBe(true);
    expect(has(out, "bg-void/60")).toBe(false);
    expect(has(out, "hover:bg-void/75")).toBe(true);
  });

  it("treats a background image as its own property", () => {
    const out = mergeClasses("bg-void/60 bg-[image:linear-gradient(red,blue)]", "bg-none");
    expect(has(out, "bg-none")).toBe(true);
    expect(has(out, "bg-[image:linear-gradient(red,blue)]")).toBe(false);
    /* The colour is a different property and is not touched by bg-none. */
    expect(has(out, "bg-void/60")).toBe(true);
  });

  it("does not confuse a text size with a text colour", () => {
    const out = mergeClasses("text-[15px] text-bone", "text-xs");
    expect(has(out, "text-xs")).toBe(true);
    expect(has(out, "text-[15px]")).toBe(false);
    expect(has(out, "text-bone")).toBe(true);
  });

  it("does not confuse a border width with a border colour", () => {
    const out = mergeClasses("border border-gold/16", "border-ember/40");
    expect(has(out, "border")).toBe(true);
    expect(has(out, "border-ember/40")).toBe(true);
    expect(has(out, "border-gold/16")).toBe(false);
  });

  it("keeps a corner radius separate from the whole radius", () => {
    const out = mergeClasses("rounded-xl", "rounded-br-sm");
    expect(has(out, "rounded-xl")).toBe(true);
    expect(has(out, "rounded-br-sm")).toBe(true);
  });

  it("keeps min-height separate from height", () => {
    const out = mergeClasses("h-8 touch:min-h-11", "min-h-11");
    expect(has(out, "h-8")).toBe(true);
    expect(has(out, "min-h-11")).toBe(true);
    expect(has(out, "touch:min-h-11")).toBe(true);
  });
});

describe("mergeClasses never loses a class it does not understand", () => {
  it("appends anything unrecognised rather than dropping it", () => {
    const out = mergeClasses(
      "notif-toast scrollbar-none",
      "glass-sm some-future-utility"
    );
    for (const c of ["notif-toast", "scrollbar-none", "glass-sm", "some-future-utility"])
      expect(has(out, c)).toBe(true);
  });

  it("keeps two unrecognised classes even when they look alike", () => {
    const out = mergeClasses("realm-bg", "realm-bg-alt");
    expect(has(out, "realm-bg")).toBe(true);
    expect(has(out, "realm-bg-alt")).toBe(true);
  });

  it("ignores false and undefined the way cx does", () => {
    expect(mergeClasses("p-4", false, undefined, null, "p-2")).toBe("p-2");
  });

  it("preserves written order for everything it keeps", () => {
    expect(mergeClasses("relative inline-flex items-center", "gap-2")).toBe(
      "relative inline-flex items-center gap-2"
    );
  });
});

describe("mergeClasses reads the variant separator correctly", () => {
  it("does not split an arbitrary value on its own colon", () => {
    /* `bg-[image:...]` and `[@media(pointer:coarse)]:min-h-11` both carry a
       colon that is not a variant separator. Taking the last colon naively
       made the first unrecognisable, so a caller could never replace a
       gradient. */
    const out = mergeClasses(
      "bg-[image:linear-gradient(a,b)] [@media(pointer:coarse)]:min-h-11",
      "bg-[image:linear-gradient(c,d)]"
    );
    expect(has(out, "bg-[image:linear-gradient(c,d)]")).toBe(true);
    expect(has(out, "bg-[image:linear-gradient(a,b)]")).toBe(false);
    expect(has(out, "[@media(pointer:coarse)]:min-h-11")).toBe(true);
  });

  it("keys the touch variant apart from the unconditional property", () => {
    const out = mergeClasses("touch:min-h-11", "min-h-0");
    expect(has(out, "touch:min-h-11")).toBe(true);
    expect(has(out, "min-h-0")).toBe(true);
  });
});
