import { Composer } from "@/components/social/composer";

/*
  The dedicated compose screen. Like X's compose, the whole surface is given
  over to writing a single raven: a top bar with a way out and a prominent
  Send raven, the author's avatar, and a large textarea. Every composer feature
  travels with it (images, the Herald's suggestion, audience). On a successful
  send the Composer routes back to /home, where the feed reloads on mount and
  surfaces the new raven.
*/
export default function ComposePage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Composer page />
    </div>
  );
}
