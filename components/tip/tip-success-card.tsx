"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { explorerTxUrl, resolveChain } from "@/components/tip/chain";

/* The cinematic beat after a tribute lands: a struck-gold coin, a ring of
   sparks, and the on-chain receipt. Celebratory but restrained. */
export function TipSuccessCard({
  amount,
  symbol,
  chainId,
  txHash,
  recipientName,
  onClose,
}: {
  amount: string;
  symbol: string;
  chainId: number | null;
  txHash: string;
  recipientName: string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const chain = resolveChain(chainId);
  const txUrl = explorerTxUrl(chainId, txHash);

  const coinVariants: Variants = {
    hidden: { scale: 0.4, opacity: 0, rotate: -30 },
    show: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: reduce
        ? { duration: 0.2 }
        : { type: "spring", stiffness: 220, damping: 14, delay: 0.05 },
    },
  };

  /* Eight sparks flung outward from the coin. */
  const sparks = Array.from({ length: 8 });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="glass glass-warm relative w-full max-w-md overflow-hidden p-7 text-center"
    >
      {/* Radiant gold wash behind the coin. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(240,214,140,0.18), rgba(200,162,76,0.05) 42%, transparent 70%)",
        }}
      />
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          initial={{ x: "-120%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 1.6, ease: "easeInOut", delay: 0.35 }}
          style={{
            background:
              "linear-gradient(75deg, transparent 40%, rgba(255,244,214,0.16) 50%, transparent 60%)",
          }}
        />
      )}

      <div className="relative flex flex-col items-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {!reduce &&
            sparks.map((_, i) => {
              const angle = (i / sparks.length) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-gold-bright"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
                  animate={{
                    x: Math.cos(angle) * 52,
                    y: Math.sin(angle) * 52,
                    opacity: [0, 1, 0],
                    scale: [0.6, 1, 0.4],
                  }}
                  transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
                />
              );
            })}
          <motion.div
            variants={coinVariants}
            initial="hidden"
            animate="show"
            className="gold-metal flex h-20 w-20 items-center justify-center rounded-full shadow-[inset_0_2px_4px_rgba(255,244,214,0.6),inset_0_-4px_8px_rgba(90,66,20,0.5),0_10px_30px_rgba(200,162,76,0.35)]"
          >
            <Icon name="coin" className="h-9 w-9 text-[#171204]" />
          </motion.div>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          Tribute sent
        </p>
        <p className="tnum mt-2 font-display text-4xl font-bold gold-text">
          {amount} {symbol}
        </p>
        <p className="mt-2 text-sm text-bone-mut">
          delivered to{" "}
          <span className="font-semibold text-bone">{recipientName}</span>
        </p>
        <p className="mt-1 text-[11px] text-bone-faint">
          A real transfer, wallet to wallet on {chain.name}. THE RAVENSPIRE never
          touched the coin.
        </p>

        <div className="mt-6 flex w-full items-center gap-2">
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-glass flex-1 px-4 py-2 text-xs text-gold transition hover:text-gold-bright"
          >
            <Icon name="scroll" className="h-4 w-4" />
            View on {chain.name}
          </a>
          <button
            onClick={onClose}
            className="btn-gold flex-1 px-4 py-2 text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </motion.div>
  );
}
