// Global stylesheets are imported for their side effects only (e.g.
// `import "./globals.css"` in the root layout). TypeScript 6+ checks
// side-effect imports by default, and Next.js 15 doesn't declare them.
declare module "*.css";
