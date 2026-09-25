// Keep the local dev compiler separate from production builds. Running `next build`
// while `next dev` is open otherwise replaces dev CSS artifacts under the shared
// `.next` directory and can leave localhost temporarily unstyled.
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
