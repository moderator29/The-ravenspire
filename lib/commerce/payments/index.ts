import "server-only";
import { paymentProviderName } from "@/lib/commerce/catalog";
import { coinbaseProvider } from "@/lib/commerce/payments/coinbase";
import type { PaymentProvider } from "@/lib/commerce/payments/provider";

/* The provider selector. One place resolves the configured processor, so a
   route never names the provider directly and swapping it is a single edit here
   plus an env value (PAYMENT_PROVIDER). Ravenspire is a non-custodial crypto
   platform, so the provider is Coinbase Commerce: crypto checkout in ETH on
   mainnet and ETH or USDC on Base, settled straight to the merchant wallet. An
   unknown name falls back to it rather than failing closed on a typo, and the
   payment route reports isConfigured honestly either way. */
const PROVIDERS: Record<string, PaymentProvider> = {
  coinbase: coinbaseProvider,
  "coinbase-commerce": coinbaseProvider,
};

export function paymentProvider(): PaymentProvider {
  const name = paymentProviderName();
  return PROVIDERS[name] ?? coinbaseProvider;
}

export type {
  PaymentProvider,
  PaymentEvent,
  CheckoutSession,
  CreateCheckoutParams,
  CheckoutLineItem,
  CreateRefundParams,
  RefundResult,
} from "@/lib/commerce/payments/provider";
