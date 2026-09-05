# Security

Report vulnerabilities privately through the repository's GitHub Security
Advisories. Do not post access links, creation codes, database credentials or
presentation contents in public issues.

## Access model

The editor works locally without an account. Creating a server-backed document
requires the deployment's private creation code. Each document has separate,
random 256-bit owner, editor and viewer capabilities. Anyone possessing a link
has its permission: send links only to their intended recipients. The owner can
revoke editor/viewer links by renewing them. Keep an owner link privately to open
the same document on another device; there is no account recovery or cloud library.

Only SHA-256 capability hashes are stored in PostgreSQL. Link secrets remain in
the URL fragment and are sent to the Buddy server through a request header, not
URL query strings. Browser backups necessarily store document access on that
device. Do not use a shared browser profile for confidential documents.

Database credentials stay on Vercel's server. The dedicated `buddy_keynote_app`
login accesses only the `buddy_keynote` schema. Tables use row-level security and
are unavailable to Supabase's anonymous and authenticated Data API roles.
Document capabilities are checked by the Buddy server; database row policies
isolate the application role, not individual end users. A dedicated Supabase
project is recommended because existing PUBLIC grants in a shared database can
weaken application isolation.

Requests are bounded in size and rate, creation requires a private code, and
database triggers limit total document count/storage. These limits reduce abuse;
they do not replace provider quotas, monitoring, backups or timely updates.

## Deployment

- Never put database passwords or the creation code in `NEXT_PUBLIC_*` variables.
- Never use a Supabase administrator/service-role credential in the application.
- Give preview deployments separate data and codes; production credentials are
  only configured for production by default.
- Keep TLS certificate verification enabled. Use `BUDDY_DATABASE_CA` if needed.
- Keep GitHub fork protection and Vercel preview protection enabled.
- Rotate the creation code in Vercel if leaked. Existing invitations are rotated
  independently by each document owner. Rotate a leaked database password too.
- Uploaded code is displayed, never evaluated. Imported Office archives are
  bounded; exported HTML is an executable presentation and should be treated as
  a downloaded document. External image/media URLs contact their remote hosts.

No deployment can guarantee immunity from compromise. Keep dependencies patched
and monitor Vercel errors and Supabase usage.

## Reviewed dependency exception (2026-09-05)

`pptxgenjs` 4.0.1 declares the unused `image-size` parser dependency. npm reports
[ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) infinite-loop issues;
no patched version was published at the audit date. Buddy runs the PPTX exporter
in the browser, where pptxgenjs explicitly disables `image-size`, and its
distributed exporter has no active call to this parser. The production audit
script allows only these exact advisories at this exact dependency path and
pptxgenjs version; new high/critical findings fail CI. Remove this exception when
upstream drops or fixes the dependency. This is not a claim of zero npm alerts.
