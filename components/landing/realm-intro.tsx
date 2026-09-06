"use client";

import { motion, type Variants } from "framer-motion";
import { LandingIcon } from "@/components/landing/icons";

/*
  The introduction. A crisp, professional statement of what The Ravenspire is,
  said once and left there. This used to run a Mission / Vision / History rail
  underneath it, three cards restating the same "what is this" idea a second
  and third time before a visitor had scrolled past the hero. Cut for length:
  the paragraph below already carries the mission and the promise, and the
  three names are not something a first-time visitor needs before they have
  even seen a feature.
*/

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function RealmIntro() {
  return (
    <motion.section
      id="overview"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="scroll-mt-28"
    >
      <motion.div variants={rise} className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-sm border border-gold/20 bg-void/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="layers" className="h-4 w-4" />
          What is The Ravenspire
        </span>
        <h2 className="mt-5 font-display text-3xl font-semibold text-bone sm:text-4xl">
          A premium social realm with{" "}
          <span className="gold-text">real crypto beneath it</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-bone-mut sm:text-base">
          The Ravenspire is the competitive arena where crypto conviction earns
          a name that can&rsquo;t be bought. You post, you argue, you swear to a House and
          you make Calls the realm keeps a record of, while a full suite of
          portfolio, safety and market tools works underneath, reading only real
          on-chain data. A wallet is minted to you on sign-up and the keys are
          yours alone. We never hold your funds, and everything of worth is
          earned, never bought.
        </p>
      </motion.div>
    </motion.section>
  );
}
