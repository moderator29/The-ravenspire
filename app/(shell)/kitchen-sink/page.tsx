import { notFound } from "next/navigation";
import { KitchenSinkView } from "./kitchen-sink-view";

/* INTERNAL DEV PAGE, and now it is only that.
 *
 * The primitives gallery was publicly routable in production. Nothing on it is
 * secret and nothing on it reads data, but a live product serving a page of
 * every button in every state, at a guessable address, is an internal tool
 * shipped to members: it is unlinked rather than unreachable, it is not in the
 * realm's voice, and it is the one page here that would tell a stranger the
 * product is a work in progress.
 *
 * So the route answers 404 in production and stays exactly as it was in
 * development, which is where its whole value is. The gate lives in this thin
 * server shell rather than in the gallery, so the check happens before any of
 * six hundred lines of demo components is rendered.
 */

export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitchenSinkView />;
}
