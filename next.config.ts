import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The build directory is overridable so two people can build the same
     checkout at once.

     Next takes a lock on its output directory, so a second `npm run build`
     does not queue, it exits immediately with "Another next build process is
     already running". With more than one agent working a shared tree that is
     constant, and the failure mode is worse than the wait: the lock message
     looks nothing like a compile error, so a build that never ran reads as a
     build that passed unless someone reads the whole log.

     Set NEXT_DIST_DIR to build into your own directory. Unset, which is what
     CI and Vercel do, it is the ordinary .next. */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
