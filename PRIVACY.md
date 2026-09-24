# Privacy Policy — CogExt

_Last updated: 2026-09-24_

CogExt is **self-hosted, open-source software** for collecting, organizing, and
rediscovering your own notes, quotes, links, images, and articles. There is no
central CogExt service and no shared CogExt server: each deployment is installed
and run by an individual operator, on infrastructure they control, for their own
personal use. This policy explains how a CogExt deployment handles data —
including data obtained through Google APIs — so it can be linked from the
Google OAuth consent screen.

> **Forking / self-hosting?** Before publishing your own OAuth app, replace the
> contact email and project URL in the [Contact](#contact) section with your own,
> and host this page at a URL you control (e.g. your fork's `PRIVACY.md`, or a
> GitHub Pages / gist rendering of it).

## Who this applies to

The "operator" is the person who deploys and runs an instance of CogExt. The
operator is the only user of their instance. This policy describes what that
software does with data; it is not a service operated by the CogExt authors on
anyone's behalf.

## Google user data we access

To store off-site backups, CogExt uses [`rclone`](https://rclone.org) with the
Google Drive API and requests a **single, narrow scope**:

- **`https://www.googleapis.com/auth/drive.file`**

This scope grants access **only to files the application itself creates** in the
operator's Google Drive. CogExt **cannot see, read, or modify any other files**
in the operator's Drive — only the backup archives it uploads.

We request **no** other Google scopes: not profile, not email, not contacts, not
broad Drive access.

## How we use it

The `drive.file` access is used for one purpose: to **upload and manage backup
archives** that CogExt generates (a PostgreSQL database dump and a file-storage
archive), so the operator has an off-site copy of their own data. Specifically,
the application:

- creates a backup folder and uploads timestamped backup files to it;
- lists and deletes **its own** old backup files to enforce a retention limit;
- performs no other Drive operations.

We do **not** use Google user data for advertising, profiling, training AI or
machine-learning models, or any purpose beyond storing and pruning the
operator's backups.

## Storage, transfer, and security

- The Google OAuth credentials (access and refresh tokens) are stored **on the
  operator's own server**, in the rclone configuration, and are used only to
  authenticate backup uploads to that same operator's Drive.
- Backup archives are transmitted directly between the operator's server and
  Google Drive over Google's encrypted API endpoints.
- No Google user data is transmitted to, or stored by, the CogExt authors or any
  third party.

## Data sharing

CogExt does **not** sell, rent, or share Google user data with any third party.
Backups reside solely in the operator's own Google Drive account.

Use of Google user data adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including its **Limited Use** requirements.

## Data retention and deletion

- Backups in Google Drive are retained until pruned by the operator's configured
  retention limit (the newest N backups are kept; older ones are deleted
  automatically) or deleted manually by the operator.
- The operator can revoke CogExt's access at any time from their Google Account
  under **Security → Third-party apps with account access**, and/or by deleting
  the backup files from their Drive.

## Other (non-Google) data

Records the operator saves in CogExt (notes, links, images, and related
metadata) are stored in the operator's own database and file storage. Some
features send record content to third-party AI providers (e.g. Anthropic for
tagging and chat, Voyage AI for embeddings) as configured by the operator;
that processing is governed by those providers' own privacy policies. None of
this involves Google user data.

## Changes to this policy

This policy may be updated over time; material changes will be reflected by the
"Last updated" date above.

## Contact

Questions about this policy or an instance's data handling can be directed to
the operator at **policy@emilydelacruz.com** (project:
**https://github.com/emdecr/cogext**).
