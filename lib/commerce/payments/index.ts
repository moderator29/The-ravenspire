import "server-only";
import { paymentProviderName } from "@/lib/commerce/catalog";
import { stripeProvider } from "@/lib/commerce/payments/stripe";
import type { PaymentProvider } from "@/lib/commerce/payments/provider";

/* The provider selector. One place resolves the configured processor, so a
   route never names Stripe directly and swapping the provider is a single edit
   here plus an env value (PAYMENT_PROVIDER). Stripe is the only implementation
   at launch; an unknown name falls back to it rather than failing closed on a
   typo, and the payment route reports isConfigured honestly either way. */
const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
};

export function paymentProvider(): PaymentProvider {
  const name = paymentProviderName();
  return PROVIDERS[name] ?? stripeProvider;
}

export type {
  PaymentProvider,
  PaymentEvent,
  CheckoutSession,
  CreateCheckoutParams,
  CheckoutLineItem,
} from "@/lib/commerce/payments/provider";
