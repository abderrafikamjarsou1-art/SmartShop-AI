import "server-only";
import Stripe from "stripe";

/** Stripe singleton. apiVersion pinned so upgrades are deliberate. */
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}
