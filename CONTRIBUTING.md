# Contributing

Open a pull request against `main`. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, and `node scripts/audit-production.mjs` before requesting review. Use Node.js 24.

Never include credentials, private creation codes, document access links, production data or `.env` files. Use `.env.example` and isolated test data. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

Changes to workflows, dependencies, authorization, document import/export, and storage need particular security review. Keep workflow tokens read-only unless a job needs a specific permission. Pin third-party actions to full commit SHAs; Dependabot can propose updates. Do not run untrusted pull-request code with production secrets or on a maintainer's machine.
