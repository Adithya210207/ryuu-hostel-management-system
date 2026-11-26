import type { NextConfig } from 'next';
const config: NextConfig = {
  // Hide the Next.js "N" dev badge; build and runtime errors still show.
  devIndicators: false,
  // The Wi-Fi launcher binds 0.0.0.0, so loopback must stay explicitly allowed too.
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? ['127.0.0.1', 'localhost', ...[process.env.DEV_LAN_ORIGIN, process.env.DEV_TUNNEL_ORIGIN].filter(Boolean).map(origin => new URL(origin!).hostname)] : [],
  output: 'standalone',
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'exceljs', 'pdfkit', 'web-push', 'nodemailer'],
  poweredByHeader: false,
  outputFileTracingExcludes: { '*': ['./.data/**', './.env*', './backups/**', './.npm-cache/**', './.git/**'] },
  // Version 2: the homepage is the static Onda-based page in public/site/. /classic redirects here.
  async rewrites() {
    // With NEXT_PUBLIC_PLACEHOLDER_BRANDING=true, the Ryuu logo and building image addresses serve neutral
    // placeholders instead (this also covers the static homepage in public/site/).
    const placeholders = process.env.NEXT_PUBLIC_PLACEHOLDER_BRANDING !== 'true' ? [] : [
      { source: '/images/ryuu-house-logo.png', destination: '/images/placeholder/house-logo.png' },
      { source: '/images/ryuu-logo.webp', destination: '/images/placeholder/wordmark.png' },
      { source: '/images/ryuu-logo.png', destination: '/images/placeholder/wordmark.png' },
      { source: '/images/ryuu-exterior.webp', destination: '/images/photos/inside-balcony.webp' },
      { source: '/images/ryuu-exterior.png', destination: '/images/photos/inside-balcony.webp' },
    ];
    return { beforeFiles: [{ source: '/', destination: '/site/index.html' }, ...placeholders], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-store, max-age=0'},{key:'Service-Worker-Allowed',value:'/'}]}, { source: '/:path*', headers: [
      ...(process.env.NODE_ENV==='production'?[{key:'Strict-Transport-Security',value:'max-age=31536000'}]:[]),
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV==='production'?'':"'unsafe-eval'"}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; worker-src 'self'; manifest-src 'self'` }
    ] }];
  }
};
export default config;
