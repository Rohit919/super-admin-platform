# File Storage

> Production-grade file storage architecture and implementation guide for Fastify-MasterApp.

## 1. Purpose

This document defines how Fastify-MasterApp should handle uploaded files, generated files, object storage, metadata, access control, scanning, lifecycle management, downloads, signed URLs, background processing, observability, security, backups, and recovery.

The primary design principle is:

> **Object storage owns file bytes; PostgreSQL owns file metadata, ownership, authorization, and application state.**

The API should not become a permanent file server unless there is a clear requirement.

---

# 2. Goals

The file-storage subsystem should provide:

- secure uploads
- private-by-default objects
- authorization-aware downloads
- short-lived signed URLs
- metadata tracking
- deterministic object keys
- file-size limits
- content validation
- malware scanning where required
- lifecycle management
- asynchronous processing
- resumable/large-file support where appropriate
- deletion workflows
- auditability
- observability
- tenant isolation
- backup/recovery strategy
- provider portability

---

# 3. Non-Goals

Do not build a complicated file platform unless product requirements justify it.

The initial system does not need:

- custom distributed file storage
- event sourcing for file metadata
- a proprietary CDN
- permanent public URLs
- synchronous virus scanning for every request
- storing large binary files directly in PostgreSQL
- multi-provider storage failover without a business requirement

Start with a well-designed object-storage adapter.

---

# 4. Recommended Architecture

```text
React Admin
    │
    ▼
Fastify API
    │
    ├── Authentication
    ├── Authorization / RBAC
    ├── File Service
    └── File Repository
             │
             ▼
        PostgreSQL
        file metadata
             │
             ▼
       Object Storage
       file contents

Upload:
Admin → API → upload intent → signed URL → object storage

Download:
Admin → API → authorization → signed URL → object storage

Processing:
Object stored → event/job → worker → scan/process → update metadata
```

---

# 5. Core Rule

Do not store large files directly in PostgreSQL by default.

Prefer:

```text
PostgreSQL
  └── metadata

Object Storage
  └── binary content
```

Example metadata:

```text
file.id
file.objectKey
file.originalName
file.contentType
file.sizeBytes
file.status
file.ownerId
file.tenantId
file.checksum
file.createdAt
```

---

# 6. Storage Provider Abstraction

Use an application-level interface.

```ts
export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult>;

  createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<CreateDownloadUrlResult>;

  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;

  deleteObject(input: DeleteObjectInput): Promise<void>;
}
```

Provider implementations belong behind this interface.

```text
ObjectStorage
    │
    ├── S3 adapter
    ├── S3-compatible adapter
    ├── local development adapter
    └── future provider
```

---

# 7. Directory Structure

Recommended:

```text
apps/api/src/
├── integrations/
│   └── storage/
│       ├── storage.port.ts
│       ├── storage.types.ts
│       ├── storage.errors.ts
│       ├── storage.service.ts
│       ├── providers/
│       │   ├── s3.adapter.ts
│       │   └── local.adapter.ts
│       └── index.ts
│
├── modules/
│   └── files/
│       ├── file.routes.ts
│       ├── file.service.ts
│       ├── file.repository.ts
│       ├── file.schemas.ts
│       ├── file.types.ts
│       ├── file.errors.ts
│       └── file.authorization.ts
│
└── workers/
    └── file-processing/
```

Keep storage mechanics separate from file-domain behavior.

---

# 8. Storage vs File Domain

These are different concerns.

## Storage layer

Responsible for:

- upload
- download
- delete
- metadata from provider
- signed URLs
- provider-specific behavior

## File domain

Responsible for:

- ownership
- authorization
- status
- lifecycle
- business relationships
- visibility
- retention
- audit
- scanning state

Example:

```text
FileService
   ↓
ObjectStorage
```

Not:

```text
BusinessService
   ↓
S3 SDK
```

---

# 9. Database Model

A practical file model:

```text
File
├── id
├── tenantId
├── ownerId
├── objectKey
├── originalName
├── contentType
├── sizeBytes
├── checksum
├── status
├── visibility
├── purpose
├── provider
├── providerVersion
├── scanStatus
├── scanCompletedAt
├── createdAt
├── updatedAt
├── deletedAt
└── expiresAt
```

Add fields only when required.

---

# 10. File Status

Use explicit states.

Example:

```text
PENDING
UPLOADING
UPLOADED
SCANNING
AVAILABLE
REJECTED
FAILED
DELETING
DELETED
EXPIRED
```

Not every project needs every state.

The state machine should reflect actual workflow.

---

# 11. Scan Status

Keep security scanning separate from general file lifecycle.

```text
NOT_REQUIRED
PENDING
SCANNING
CLEAN
INFECTED
FAILED
```

Example:

```text
file.status = UPLOADED
file.scanStatus = PENDING
```

Do not expose the file as downloadable until policy allows it.

---

# 12. Visibility

Prefer explicit visibility.

```text
PRIVATE
PROTECTED
PUBLIC
```

Default:

```text
PRIVATE
```

Public files should be an intentional product decision.

---

# 13. File Purpose

Store a domain purpose when useful.

Examples:

```text
AVATAR
DOCUMENT
INVOICE
IMPORT
EXPORT
ATTACHMENT
REPORT
IDENTITY_DOCUMENT
```

Purpose can influence:

- allowed types
- size limits
- retention
- authorization
- scanning
- processing

---

# 14. Object Key Design

Do not use the original filename as the storage key.

Bad:

```text
uploads/invoice.pdf
```

Preferred:

```text
files/{tenantId}/{fileId}/original
```

or:

```text
files/{tenantId}/{year}/{month}/{fileId}
```

Object keys should be:

- unique
- deterministic
- opaque
- safe
- independent of user filenames

---

# 15. Filename Security

Original filenames are untrusted input.

Do not use them directly in object paths.

Store:

```text
originalName = "Quarterly Report.pdf"
```

but object key:

```text
files/tenant_123/file_456/original
```

When displaying filenames, escape them appropriately.

---

# 16. File IDs

Use the application's normal ID strategy.

Do not make the provider object key the public identifier.

Example:

```text
fileId = file_123
objectKey = files/tenant_123/file_123/original
```

---

# 17. Upload Architecture

Recommended upload flow:

```text
1. Authenticate
2. Authorize upload
3. Validate purpose
4. Validate declared size/type
5. Create file record
6. Generate object key
7. Generate signed upload URL
8. Return upload instructions
9. Client uploads directly
10. Client confirms upload or provider event triggers processing
11. Verify object metadata
12. Scan/process
13. Mark file available
```

---

# 18. Upload Intent

Create an upload intent before accepting the file.

Example:

```http
POST /api/v1/files/uploads
```

Request:

```json
{
  "fileName": "report.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576,
  "purpose": "DOCUMENT"
}
```

Response:

```json
{
  "file": {
    "id": "file_123",
    "status": "PENDING"
  },
  "upload": {
    "url": "...",
    "expiresAt": "..."
  }
}
```

The URL should be short-lived.

---

# 19. Upload Authorization

Authorization must happen before issuing the upload URL.

Check:

- authenticated user
- tenant
- role
- permission
- resource ownership
- purpose
- file size
- file type
- quota

Do not assume that possessing a signed URL is equivalent to application authorization.

---

# 20. Signed Upload URLs

Signed URLs should:

- expire quickly
- target one object
- restrict method where possible
- restrict content type where supported
- restrict content length where supported
- use private storage
- avoid reusable credentials

Example lifecycle:

```text
Create intent
   ↓
authorize
   ↓
signed URL
   ↓
upload
   ↓
expire
```

---

# 21. Direct-to-Storage Uploads

For large files:

```text
Browser
   ↓
Fastify
   ↓
signed upload URL
   ↓
Object Storage
```

This reduces API server:

- bandwidth
- CPU
- memory
- connection duration

It is generally preferred for large objects.

---

# 22. Server-Proxied Uploads

Proxy uploads through Fastify when:

- files are small
- transformation is required immediately
- provider does not support direct upload
- special streaming controls are required

Even then:

- stream rather than buffer
- enforce limits
- validate content
- handle client cancellation

---

# 23. Multipart Uploads

For large files, use multipart/resumable uploads where supported.

Flow:

```text
Create multipart upload
        ↓
Upload parts
        ↓
Retry failed parts
        ↓
Complete upload
        ↓
Verify
```

Never keep a multi-gigabyte file in Node.js memory.

---

# 24. Multipart Security

Limit:

- total file size
- part size
- number of parts
- upload duration
- concurrent uploads

Abort abandoned multipart uploads.

Use storage lifecycle rules for incomplete uploads.

---

# 25. Content-Type Validation

Do not trust the browser's:

```text
Content-Type
```

It is only a claim.

Validate using:

- extension where useful
- declared MIME type
- magic bytes/content sniffing
- parser behavior
- security scanner

The exact validation should depend on file purpose.

---

# 26. File Extension

Extensions are metadata, not proof.

For example:

```text
malware.exe → report.pdf
```

may still contain executable content.

Use content validation in addition to extension checks.

---

# 27. Magic-Byte Validation

For supported formats, inspect file signatures.

Examples:

```text
PDF
JPEG
PNG
ZIP
Office formats
```

Do not accept a file merely because its filename ends in an allowed extension.

---

# 28. Polyglot Files

Be aware that a file may be valid under multiple parsers.

High-risk file types should be:

- parsed
- sanitized
- converted
- scanned
- or rejected

according to product requirements.

---

# 29. Malware Scanning

For user-uploaded untrusted files, consider:

```text
upload
  ↓
quarantine
  ↓
malware scan
  ↓
CLEAN → available
INFECTED → rejected/quarantined
```

Do not expose potentially malicious files while scanning.

---

# 30. Quarantine

A quarantine state prevents unsafe objects from being treated as normal files.

Example:

```text
PENDING
   ↓
UPLOADED
   ↓
QUARANTINED
   ↓
SCANNING
   ├── CLEAN
   └── INFECTED
```

The exact storage arrangement can use separate prefixes or buckets.

---

# 31. Scan Failures

If scanning fails:

```text
scanStatus = FAILED
```

Do not automatically treat failure as clean.

Security-sensitive workflows should fail closed.

---

# 32. File Processing

Background workers can perform:

- virus scanning
- thumbnail generation
- image resizing
- PDF processing
- text extraction
- metadata extraction
- OCR
- transcoding
- indexing
- checksum calculation

See `BACKGROUND_JOBS.md` and `QUEUE_ARCHITECTURE.md`.

---

# 33. Processing Pipeline

Example:

```text
Uploaded
   ↓
Verify object
   ↓
Scan
   ↓
Extract metadata
   ↓
Transform
   ↓
Index
   ↓
Available
```

Each stage should be retryable and observable.

---

# 34. Processing Idempotency

A processing job may run more than once.

Use:

```text
fileId
operation
version
```

as a stable processing identity.

Example:

```text
file_123:thumbnail:v2
```

Do not create duplicate derived objects on every retry.

---

# 35. Derived Files

For generated variants:

```text
files/{tenantId}/{fileId}/original
files/{tenantId}/{fileId}/thumbnail
files/{tenantId}/{fileId}/preview
```

Track derived objects if the application needs lifecycle control.

---

# 36. File Versions

If the product supports revisions:

```text
File
  ├── Version 1
  ├── Version 2
  └── Version 3
```

Do not overwrite important files without a versioning strategy.

---

# 37. Replacement Uploads

For replacing a file:

```text
new upload
   ↓
verify
   ↓
scan
   ↓
mark new version active
   ↓
retire old version
```

Do not delete the old file before the new file is safely available if recovery is required.

---

# 38. Download Architecture

Recommended:

```text
GET /api/v1/files/:id/download
   ↓
authenticate
   ↓
authorize
   ↓
check file status
   ↓
create short-lived signed URL
   ↓
return redirect/URL
```

The browser then downloads directly from object storage.

---

# 39. Download Authorization

Every protected download must verify:

- user
- tenant
- permission
- ownership/resource relationship
- file status
- visibility
- retention/expiration

Never authorize based only on knowing the file ID.

---

# 40. IDOR Prevention

Bad:

```http
GET /files/file_999
```

and simply return file `file_999`.

Correct:

```text
authenticate
   ↓
resolve file
   ↓
check tenant
   ↓
check resource ownership/permission
   ↓
issue access
```

See `RBAC.md` and `SECURITY.md`.

---

# 41. Signed Download URLs

Use short-lived URLs.

Typical properties:

```text
TTL = minutes, not days
method = GET
object = exact file
```

The exact TTL should reflect risk and user experience.

---

# 42. URL Leakage

Signed URLs can appear in:

- browser history
- logs
- analytics
- referrers
- support screenshots

Keep expiration short and avoid putting them in durable records.

---

# 43. Content-Disposition

Choose download behavior intentionally.

For untrusted user-generated files, prefer download behavior where appropriate:

```text
Content-Disposition: attachment
```

For browser-rendered formats, consider the security implications before using inline display.

---

# 44. Content-Type on Downloads

Use the stored/verified content type.

Do not blindly trust user-declared MIME types.

For risky content, use safer response headers and download behavior.

---

# 45. HTTP Security Headers

For file delivery, consider:

```text
Content-Disposition
X-Content-Type-Options: nosniff
Content-Security-Policy
```

The exact header set depends on whether files are downloaded or rendered.

---

# 46. Public Files

If public files are required:

- isolate them from private objects
- use a separate namespace
- document why they are public
- avoid sensitive content
- consider CDN caching
- support revocation if required

Never make the entire storage bucket public for convenience.

---

# 47. CDN

A CDN can improve delivery for truly public or safely cacheable content.

Architecture:

```text
Client
  ↓
CDN
  ↓
Object Storage
```

Private files may use signed CDN URLs or signed cookies if supported.

---

# 48. CDN Cache Security

Never cache private content under a shared public key.

Cache keys must account for:

- object identity
- authorization context where needed
- version
- tenant where applicable

Prefer private signed delivery mechanisms.

---

# 49. File Metadata API

Recommended endpoints:

```text
POST   /api/v1/files/uploads
POST   /api/v1/files/:id/complete
GET    /api/v1/files/:id
GET    /api/v1/files/:id/download
DELETE /api/v1/files/:id
```

Additional endpoints may include:

```text
POST /api/v1/files/:id/retry
POST /api/v1/files/:id/restore
```

Dangerous administrative actions should be protected by RBAC.

---

# 50. File Listing

Example:

```http
GET /api/v1/files
```

Support:

- cursor pagination
- purpose filtering
- status filtering
- owner filtering
- date filtering
- search where appropriate
- sorting

Avoid loading all file metadata into memory.

---

# 51. File Search

Search metadata, not binary content, unless a dedicated search/indexing system exists.

Potential fields:

```text
originalName
purpose
status
owner
createdAt
```

For extracted document text, use a separate indexing workflow.

---

# 52. File Metadata Exposure

Do not return internal storage details unnecessarily.

Avoid:

```json
{
  "bucket": "prod-secret-bucket",
  "objectKey": "internal/...",
  "provider": "..."
}
```

Return application-level metadata.

---

# 53. File Ownership

Every private file should have a clear authorization relationship.

Possible models:

```text
ownerId
resourceId
tenantId
organizationId
```

For shared files, use an explicit relationship rather than ambiguous ownership.

---

# 54. File Sharing

If users can share files:

```text
File
   ↓
FileAccess / FileShare
   ↓
User / Role / Resource
```

Define:

- who can share
- who can access
- expiration
- revocation
- download limits if needed
- audit events

---

# 55. Temporary Sharing

For temporary links:

```text
share record
  ├── fileId
  ├── token/reference
  ├── expiresAt
  ├── createdBy
  └── revokedAt
```

Use short-lived access.

Do not expose permanent bearer links for sensitive documents.

---

# 56. Tenant Isolation

For multi-tenant applications:

```text
files/{tenantId}/{fileId}/...
```

and enforce tenant ownership in the database query.

Never rely solely on object-key prefixes for authorization.

The database authorization check remains mandatory.

---

# 57. Storage Bucket Strategy

Possible structure:

```text
production-private
production-public
production-quarantine
production-temp
```

Separate buckets when different security/lifecycle policies are required.

Do not create dozens of buckets without operational justification.

---

# 58. Environment Isolation

Development, staging, and production should use separate storage resources.

Prefer:

```text
dev-storage
staging-storage
prod-storage
```

Never test destructive operations against production storage.

---

# 59. Prefix Isolation

If separate buckets are impractical:

```text
dev/
staging/
prod/
```

Still enforce credentials and access policies independently.

---

# 60. IAM / Storage Permissions

Application credentials should have the minimum required permissions.

For example:

```text
PutObject
GetObject
HeadObject
DeleteObject
```

only where required.

Do not give the API unrestricted administrative storage access.

---

# 61. Worker Storage Permissions

Workers may require different permissions.

Example:

```text
Upload worker:
  read quarantine
  write processed

Cleanup worker:
  delete expired objects

API:
  generate signed URLs
```

Use separate identities when practical.

---

# 62. Encryption

Use encryption at rest provided by the storage platform.

For sensitive files, consider customer-managed keys if requirements justify the complexity.

Also use TLS for data in transit.

---

# 63. Encryption Key Rotation

Document:

- key ownership
- rotation process
- old-object behavior
- backup implications
- recovery process

Do not assume rotating an encryption key automatically migrates all historical objects.

---

# 64. Checksums

Store a checksum where useful.

Example:

```text
SHA-256
```

Use it for:

- integrity verification
- duplicate detection
- reconciliation
- debugging

Do not treat a checksum alone as proof of file authenticity.

---

# 65. Duplicate Files

Deduplication can reduce storage cost.

But do not introduce global content-addressed storage until authorization and lifecycle semantics are clear.

If deduplicating, ensure:

```text
one physical object
many logical file records
```

does not allow one tenant to access another tenant's object.

---

# 66. Storage Quotas

Track quotas by:

```text
tenant
user
organization
purpose
```

Possible metrics:

```text
bytes used
file count
pending uploads
monthly upload volume
```

Enforce quotas before issuing upload URLs where possible.

---

# 67. Quota Race Conditions

Two simultaneous uploads can exceed a quota if both check the current total independently.

For strict quotas, use:

- transactional reservation
- atomic counters
- locking
- reconciliation

Example:

```text
quota reservation
   ↓
upload
   ↓
finalize actual size
```

---

# 68. Upload Reservation

A file record can reserve expected bytes:

```text
reservedBytes
actualBytes
```

On completion:

```text
reserved → actual
```

On cancellation/expiration:

```text
reservation released
```

---

# 69. Abandoned Uploads

Users may request uploads and never finish them.

Handle:

```text
PENDING
   ↓ timeout
EXPIRED
```

Cleanup should remove:

- metadata
- incomplete multipart uploads
- temporary objects

according to retention policy.

---

# 70. Storage Lifecycle Policies

Use lifecycle rules for:

- incomplete multipart uploads
- temporary files
- old versions
- quarantine objects
- expired exports
- archived content

Lifecycle automation reduces operational debt.

---

# 71. Soft Delete

For important files:

```text
deletedAt != null
```

may hide the file from the application while retaining the object temporarily.

This enables recovery.

But soft delete must have a final purge policy.

---

# 72. Hard Delete

Hard deletion should:

1. authorize
2. mark logical deletion
3. enqueue physical deletion
4. delete object
5. record result
6. mark storage deletion complete

Do not block a user request on slow storage deletion unless required.

---

# 73. Delete Idempotency

Deleting an already deleted object should generally be safe.

Example:

```text
DELETE object
object already missing
```

can be treated as success when business state agrees.

The exact behavior should be provider-independent.

---

# 74. Object Missing

If metadata says:

```text
AVAILABLE
```

but storage returns:

```text
NOT_FOUND
```

this is a reconciliation issue.

Do not silently recreate or mark deleted without investigation.

---

# 75. Orphan Objects

An orphan object exists in storage without a corresponding application record.

Possible causes:

- failed upload confirmation
- application crash
- abandoned workflow
- manual operator action

Use periodic reconciliation to detect them.

---

# 76. Missing Objects

A missing object exists in PostgreSQL metadata but not storage.

Possible causes:

- accidental deletion
- lifecycle misconfiguration
- provider failure
- backup restore inconsistency

Critical files should have stronger protection and alerting.

---

# 77. Storage Reconciliation

Periodic job:

```text
Database metadata
      ↕
Object storage inventory/API
      ↓
mismatch report
```

Detect:

```text
orphan objects
missing objects
size mismatch
checksum mismatch
unexpected status
expired objects
```

---

# 78. Reconciliation Safety

Reconciliation should not immediately delete every unknown object.

Prefer:

```text
detect
  ↓
classify
  ↓
wait/confirm
  ↓
delete if policy allows
```

This protects against transient metadata failures.

---

# 79. Backup Strategy

File metadata should be included in PostgreSQL backup strategy.

Object bytes require a separate storage backup/replication strategy.

You need both:

```text
Database backup
+
Object storage durability/backup
```

A database backup without object bytes cannot fully restore files.

---

# 80. Restore Ordering

A practical recovery sequence:

```text
Restore PostgreSQL
   ↓
restore/verify object storage
   ↓
validate references
   ↓
run reconciliation
   ↓
restore application
   ↓
verify downloads
```

The exact order depends on the provider and backup architecture.

---

# 81. Disaster Recovery

Define:

```text
RPO
RTO
```

for file storage separately from the application.

Questions:

- Can files be restored?
- How quickly?
- Are versions preserved?
- Are deleted files recoverable?
- Are encryption keys available?
- Are signed URL workflows functional?
- Can metadata and objects be reconciled?

See `DISASTER_RECOVERY.md`.

---

# 82. Cross-Region Replication

For high availability, consider object replication.

Possible:

```text
Primary region
      ↓
replication
      ↓
Secondary region
```

Do not enable multi-region complexity without a requirement.

---

# 83. Object Versioning

Object versioning can protect against accidental deletion/overwrite.

Useful for:

- important documents
- recovery
- audit requirements

But versioning increases storage usage and requires lifecycle management.

---

# 84. Retention Policies

Different file types may require different retention.

Example:

```text
temporary export → hours/days
user attachment → account lifetime
audit evidence → longer retention
regulated document → policy-defined
```

Retention must follow product and legal requirements.

---

# 85. Legal Hold

If required, support a state preventing deletion:

```text
legalHold = true
```

Deletion workers must respect the hold.

Do not rely solely on UI restrictions.

---

# 86. Expiration

Temporary files should have:

```text
expiresAt
```

A worker can process:

```text
expiresAt < now
```

and delete or archive the object.

---

# 87. File Access Audit

Audit sensitive operations:

```text
file.uploaded
file.downloaded
file.deleted
file.shared
file.share_revoked
file.scan_rejected
file.restored
file.admin_accessed
```

Avoid logging every low-risk download forever unless requirements justify it.

---

# 88. Audit Metadata

Useful fields:

```text
actorId
tenantId
fileId
resourceId
requestId
operation
outcome
```

Do not store signed URLs or credentials in audit logs.

See `AUDIT_LOGGING.md`.

---

# 89. Admin File Access

Administrative access to sensitive files should be explicitly authorized.

Recommended permission examples:

```text
files.read
files.upload
files.delete
files.restore
files.share
files.admin_read
files.reprocess
files.reconcile
```

Do not grant all file permissions through a generic admin role without review.

---

# 90. Break-Glass File Access

For highly sensitive documents:

```text
normal access
      +
emergency elevated access
```

Break-glass actions should:

- require explicit permission
- generate audit events
- capture reason
- be time-limited where possible
- be reviewed

---

# 91. Sensitive Documents

Examples:

```text
identity documents
financial documents
private contracts
medical/legal documents
security evidence
```

These should have stricter:

- access
- retention
- logging
- encryption
- sharing
- deletion

requirements.

---

# 92. File Download Abuse

Protect against:

- automated scraping
- excessive downloads
- brute-force file IDs
- signed URL abuse

Use:

- authorization
- rate limits
- short-lived URLs
- opaque IDs
- monitoring

See `RATE_LIMITING.md`.

---

# 93. Upload Abuse

Protect against:

- oversized files
- huge file counts
- malicious content
- zip bombs
- decompression bombs
- image bombs
- archive nesting
- excessive concurrent uploads

Apply limits before expensive processing.

---

# 94. Archive Security

If accepting ZIP or similar archives:

- limit compressed size
- limit uncompressed size
- limit file count
- limit nesting depth
- prevent path traversal
- sanitize extracted names
- scan contents
- avoid extracting untrusted archives directly into executable locations

---

# 95. Zip Slip

Never extract:

```text
../../etc/passwd
```

or equivalent paths.

Normalize and validate extraction paths.

Require every extracted path to remain inside the intended destination.

---

# 96. Decompression Bombs

A small compressed file may expand to enormous size.

Track:

```text
compressed bytes
uncompressed bytes
file count
processing CPU/time
```

Abort when limits are exceeded.

---

# 97. Image Security

For uploaded images:

- validate format
- limit dimensions
- limit file size
- decode safely
- strip unnecessary metadata where appropriate
- avoid serving untrusted SVG inline
- scan where required

SVG deserves special attention because it can contain active content.

---

# 98. SVG

Treat uploaded SVG as potentially active content.

Safer options:

- sanitize
- rasterize
- force download
- serve from isolated origin

Do not assume `.svg` is equivalent to a harmless bitmap.

---

# 99. PDF Security

PDFs can contain:

- scripts
- embedded files
- external references
- active content

If PDFs are user-generated and rendered in browsers, apply appropriate isolation and download policies.

---

# 100. Office Documents

Office formats may contain:

- macros
- external links
- embedded content

Do not automatically trust uploaded Office documents.

Use scanning/sanitization where the threat model requires it.

---

# 101. Filename Metadata

Do not trust:

```text
fileName
path
extension
metadata
EXIF
document author
embedded URLs
```

All external metadata should be treated as untrusted.

---

# 102. EXIF Data

Images may contain:

- GPS coordinates
- device information
- timestamps

Strip EXIF data when privacy requirements call for it.

---

# 103. Temporary Processing Storage

Workers may need temporary disk.

Protect it with:

- quotas
- cleanup
- isolated directories
- no execution permissions where possible
- unique job directories

Never allow arbitrary uploaded filenames to determine temporary paths.

---

# 104. Worker Isolation

File processing may be CPU/memory intensive.

Consider:

```text
API workers
   ≠
file-processing workers
```

This prevents image/PDF processing from starving API traffic.

---

# 105. Resource Limits

File workers should have:

- CPU limits
- memory limits
- disk limits
- processing timeouts
- concurrency limits

A malicious file should not be able to consume unlimited resources.

---

# 106. Processing Timeouts

Set a maximum processing duration.

If exceeded:

```text
PROCESSING
   ↓ timeout
FAILED
```

Then:

- log
- metric
- retry only if safe
- alert if abnormal

---

# 107. File Processing Retries

Retry transient failures.

Do not repeatedly retry deterministic failures such as:

- malformed file
- unsupported format
- malware detection
- invalid archive

Classify errors before retrying.

---

# 108. File Processing Dead Letters

Poison files should eventually stop retrying.

Move them to:

```text
dead-letter / failed processing state
```

Provide Admin visibility and safe reprocessing.

---

# 109. Reprocessing

Allow authorized operators to reprocess when:

- scanner updated
- parser fixed
- transformation improved
- transient provider issue resolved

Reprocessing must be idempotent.

---

# 110. File State Transitions

Example:

```text
PENDING
  ↓
UPLOADED
  ↓
SCANNING
  ├──→ REJECTED
  └──→ PROCESSING
            ↓
         AVAILABLE
```

Invalid transitions should be rejected.

---

# 111. Completion Endpoint

If the client must confirm upload:

```http
POST /api/v1/files/:id/complete
```

The server should verify object existence and metadata before marking the upload complete.

Never trust:

```json
{
  "uploaded": true
}
```

without checking storage.

---

# 112. Storage HEAD Verification

Use provider metadata APIs such as HEAD where available.

Verify:

```text
object exists
size
content type
etag/checksum where reliable
metadata
```

Then persist trusted values.

---

# 113. ETag

An ETag can be useful but should not always be treated as a cryptographic checksum.

Multipart uploads and provider-specific implementations can make ETags unsuitable as universal integrity hashes.

Prefer explicit SHA-256 when cryptographic integrity is required.

---

# 114. File Integrity

For important files:

```text
upload
  ↓
calculate/obtain checksum
  ↓
store checksum
  ↓
periodic verification where required
```

This can detect unexpected corruption or mismatches.

---

# 115. Storage Metadata

Use provider metadata sparingly.

Application metadata belongs in PostgreSQL.

Do not make critical business state depend entirely on object metadata.

---

# 116. Storage Tags

Provider object tags can be useful for:

- lifecycle
- billing
- classification
- cleanup

But tags should not replace application authorization.

---

# 117. Object Lock

For compliance-sensitive data, object-lock/immutability features may be appropriate.

Use only when requirements demand them because they affect deletion and operational recovery.

---

# 118. File API Error Contract

Use stable application error codes.

Examples:

```text
FILE_NOT_FOUND
FILE_ACCESS_DENIED
FILE_UPLOAD_EXPIRED
FILE_TOO_LARGE
FILE_TYPE_NOT_ALLOWED
FILE_SCAN_PENDING
FILE_REJECTED
FILE_PROCESSING_FAILED
FILE_DOWNLOAD_UNAVAILABLE
```

Do not expose storage provider errors directly.

---

# 119. HTTP Status Conventions

Typical mapping:

```text
400 → invalid file request
401 → unauthenticated
403 → unauthorized
404 → inaccessible/not found
409 → invalid state/conflict
413 → too large
415 → unsupported type
422 → business validation failure
429 → rate limited
500 → unexpected internal failure
503 → temporary storage dependency issue
```

Use the project's centralized error contract.

See `ERROR_HANDLING.md`.

---

# 120. File Upload Rate Limits

Rate-limit:

- upload intent creation
- completion calls
- downloads
- sharing
- delete/reprocess actions

Limits should be based on business risk and infrastructure cost.

---

# 121. Storage Cost Controls

Track:

```text
total bytes
objects
storage class
egress
request count
processing cost
CDN usage
```

Large unused files can become a significant operational cost.

---

# 122. Storage Classes

For archival content, use appropriate storage classes where available.

Example lifecycle:

```text
hot
  ↓
infrequent access
  ↓
archive
  ↓
purge
```

Do not archive data that requires frequent interactive access.

---

# 123. Egress Costs

Downloads can create significant network cost.

Monitor:

- downloads
- bytes transferred
- top files
- tenant usage
- public vs private traffic

Use CDN/caching only where security semantics permit.

---

# 124. Storage Metrics

Recommended:

```text
file_uploads_total
file_upload_failures_total
file_downloads_total
file_deletions_total
file_processing_total
file_processing_failures_total
file_scan_results_total
file_bytes_uploaded_total
file_bytes_downloaded_total
file_reconciliation_mismatches_total
file_expirations_total
```

Safe labels:

```text
purpose
operation
status
```

Avoid high-cardinality labels such as file IDs.

---

# 125. Logging

Useful fields:

```text
fileId
tenantId
operation
purpose
status
sizeBytes
requestId
jobId
```

Do not log:

- signed URLs
- access tokens
- credentials
- raw sensitive file contents
- unnecessary filenames containing PII

---

# 126. Tracing

Trace:

```text
upload intent
storage operation
processing job
scan
transformation
download URL generation
```

Useful attributes:

```text
storage.provider
storage.operation
file.purpose
file.size_bucket
```

Avoid sensitive identifiers where unnecessary.

---

# 127. Health Checks

Do not make application readiness depend on a full object-storage round trip for every deployment.

Instead:

- validate configuration at startup
- use passive telemetry
- perform targeted dependency checks
- separate liveness from readiness

A temporary storage outage should not necessarily kill every API process.

---

# 128. Storage Dependency Failure

If storage is unavailable:

```text
Upload
  → fail safely / queue if applicable

Download
  → temporary error

Metadata read
  → may still work from PostgreSQL
```

Do not fabricate file availability.

---

# 129. Graceful Degradation

If file processing is optional:

```text
Upload succeeds
Processing delayed
File remains PROCESSING
```

If scanning is mandatory:

```text
Upload succeeds to quarantine
File remains unavailable
```

The product should define the behavior explicitly.

---

# 130. Public vs Private Domain

For high-security deployments, consider serving public and private content from different domains.

Example:

```text
app.example.com
files.example.com
```

or an isolated download domain.

This can reduce the blast radius of browser content execution.

---

# 131. Content Isolation

If untrusted files must be rendered in a browser, consider:

- separate origin
- restrictive headers
- `Content-Disposition: attachment`
- CSP
- `nosniff`
- sandboxing

Never assume a file is harmless because the user uploaded it.

---

# 132. Upload Metadata Validation

Validate:

```text
purpose
sizeBytes
contentType
fileName
```

against server-side rules.

Example:

```text
AVATAR
  max = 5 MB
  allowed = JPEG, PNG, WebP
```

The server owns these rules.

---

# 133. Server-Side Size Verification

Client-declared size is not authoritative.

After upload, verify actual storage object size.

If mismatch:

```text
reject
```

or move into a controlled remediation state.

---

# 134. Quota Enforcement

Do not trust:

```text
client says size = 1 MB
```

for quota enforcement.

Use verified object size before finalizing usage.

---

# 135. File Metadata Consistency

The database record should eventually agree with storage.

Example invariant:

```text
AVAILABLE
⇒ object exists
⇒ verified size exists
⇒ allowed type
⇒ scan policy satisfied
```

Define invariants explicitly.

---

# 136. Orphan Cleanup

A cleanup job can identify:

```text
objects with no matching file record
```

But cleanup should be conservative.

Use a grace period before deletion.

---

# 137. Database Cleanup

Expired file records can be purged after:

```text
retention period
```

Ensure object deletion happens before permanently removing the metadata needed for recovery.

---

# 138. Transaction Boundaries

Do not perform storage API calls inside a database transaction.

Avoid:

```text
BEGIN
  create file
  upload object
  COMMIT
```

Instead:

```text
DB intent
   ↓
commit
   ↓
storage upload
   ↓
verification
   ↓
DB state update
```

---

# 139. Outbox for File Processing

When upload completion requires async processing:

```text
DB transaction
 ├── mark file uploaded
 └── create file.process event

commit
  ↓
outbox publisher
  ↓
queue
  ↓
worker
```

This avoids losing processing work.

---

# 140. Event Examples

Useful internal events:

```text
file.uploaded
file.scan.completed
file.scan.rejected
file.processing.completed
file.processing.failed
file.deleted
file.expired
```

Provider-specific events should be translated into internal events.

---

# 141. Event Payload

Prefer references:

```json
{
  "eventId": "evt_123",
  "fileId": "file_123",
  "tenantId": "tenant_123",
  "operation": "scan",
  "version": 1
}
```

Avoid embedding entire file contents.

---

# 142. File Import Workflow

For imports:

```text
upload CSV
   ↓
quarantine
   ↓
scan
   ↓
parse
   ↓
validate
   ↓
preview
   ↓
confirm
   ↓
import
```

Do not directly mutate business data immediately after upload.

---

# 143. File Export Workflow

For exports:

```text
Admin requests export
   ↓
authorize
   ↓
create export record
   ↓
queue job
   ↓
generate file
   ↓
upload object
   ↓
mark ready
   ↓
short-lived download URL
```

Exports should expire.

---

# 144. Export Security

Exports often contain large amounts of sensitive data.

Use:

- explicit authorization
- audit logging
- short-lived access
- encryption
- expiration
- download monitoring where required

Never make generated exports permanently public.

---

# 145. Admin File Table

Useful columns:

```text
Name
Purpose
Owner
Size
Status
Scan
Created
Expires
Actions
```

Avoid displaying internal storage identifiers unless needed for troubleshooting.

---

# 146. Admin File Actions

Actions may include:

```text
View metadata
Download
Delete
Restore
Retry processing
Re-scan
Reconcile
```

Dangerous actions require explicit permissions.

---

# 147. Admin UX States

The UI should clearly represent:

```text
Uploading
Processing
Scanning
Available
Rejected
Failed
Expired
Deleted
```

Do not display every backend state if it confuses users; map technical states to meaningful UI states.

---

# 148. Upload Progress

For direct uploads:

```text
upload progress
```

can be tracked by the browser.

Server-side processing progress can be represented separately:

```text
UPLOAD 100%
PROCESSING 60%
```

Do not pretend storage upload completion means processing completion.

---

# 149. Large File UX

For large uploads provide:

- resumable upload where practical
- progress
- cancellation
- retry
- clear size limits
- background processing
- status polling or realtime updates

TanStack Query can manage server-side file status.

---

# 150. Client Polling

For asynchronous processing:

```text
POST upload
   ↓
fileId
   ↓
GET file/:id
   ↓
status
```

Use bounded polling.

Avoid aggressive polling for thousands of files.

---

# 151. Realtime Updates

If the application later supports WebSockets/SSE:

```text
worker completes
   ↓
event
   ↓
realtime notification
   ↓
Admin updates UI
```

The database remains authoritative.

---

# 152. File API Pagination

Use cursor pagination for large file lists.

Example:

```text
GET /files?limit=50&cursor=...
```

Do not expose storage listing APIs directly.

---

# 153. Storage Listing

Application code should generally not use object storage listing as the primary user-facing file index.

Use PostgreSQL:

```text
PostgreSQL
  ↓
authorized file list
```

Then use object storage only for content access.

---

# 154. Provider Portability

The application should not depend on:

```text
S3-specific object semantics
```

unless those semantics are intentionally required.

Keep provider-specific behavior inside adapters.

---

# 155. Provider-Specific Features

Provider-specific capabilities such as:

- lifecycle rules
- versioning
- object lock
- multipart uploads
- signed URLs

may be used through a capability-aware adapter.

Do not pretend all providers support the same feature set.

---

# 156. Storage Adapter Capabilities

Possible capability model:

```ts
interface StorageCapabilities {
  signedUploads: boolean;
  signedDownloads: boolean;
  multipartUploads: boolean;
  objectVersioning: boolean;
  objectLock: boolean;
}
```

Only use advanced features when supported.

---

# 157. Local Storage Adapter

Development can use:

```text
local filesystem
```

behind the same interface.

Example:

```text
./.local-storage/
```

Never use local filesystem storage as the production source of truth for horizontally scaled deployments.

---

# 158. Docker Development

For local development:

```text
Docker Compose
 ├── PostgreSQL
 ├── Redis
 └── local object storage
```

An S3-compatible local service can make integration testing more realistic where useful.

---

# 159. Production Storage

Production should use managed object storage unless there is a strong reason not to.

Benefits:

- durability
- lifecycle management
- scaling
- security controls
- replication
- monitoring

---

# 160. Storage Credentials in Docker

Do not bake credentials into images.

Use runtime environment/secret injection.

Bad:

```dockerfile
ENV STORAGE_SECRET=...
```

Preferred:

```text
runtime secret
  ↓
container environment/secret mount
```

---

# 161. Kubernetes Storage Access

In Kubernetes, prefer workload identity/service accounts where the platform supports it.

Avoid long-lived static access keys when workload identity is available.

---

# 162. Network Access

Restrict storage access using:

- private networking where supported
- endpoint policies
- IAM
- egress controls

The API should not need unrestricted internet access merely because it uses object storage.

---

# 163. CORS for Direct Uploads

Direct browser uploads may require storage CORS configuration.

Restrict:

```text
allowed origins
allowed methods
allowed headers
exposed headers
```

Never use:

```text
*
```

without understanding the security implications.

---

# 164. Signed URL CORS

CORS does not authorize a signed URL.

Both must be configured correctly:

```text
application authorization
+
storage URL policy
```

The signed URL itself should remain short-lived and narrowly scoped.

---

# 165. Upload Header Constraints

If the signed upload requires:

```text
Content-Type
checksum
metadata
```

the client must send exactly the expected values.

Validate completion against the stored object.

---

# 166. File Security Review

Before production verify:

- private-by-default storage
- no unrestricted bucket
- signed URLs
- short expiration
- authorization before URL issuance
- size limits
- MIME validation
- magic-byte validation
- malware scanning where required
- archive protections
- SSRF protections for remote imports
- secure temporary directories
- no secret logging
- tenant isolation
- audit controls

---

# 167. Remote File Import

If users can import from a URL:

```text
POST /files/import-url
```

this is an SSRF-sensitive operation.

Validate:

- scheme
- hostname
- DNS resolution
- private IP ranges
- redirects
- response size
- content type
- timeout

Prefer allowlists where practical.

---

# 168. Remote Import Limits

Set:

```text
max download size
max response time
max redirects
max decompression size
```

Never download unlimited remote content.

---

# 169. Remote Import Processing

Recommended:

```text
Import request
  ↓
authorize
  ↓
validate URL
  ↓
create operation
  ↓
queue
  ↓
worker fetches safely
  ↓
store object
  ↓
scan
  ↓
process
```

Do not let a user-controlled URL block an API request.

---

# 170. File Naming for Generated Objects

Generated files should also use deterministic internal keys.

Example:

```text
exports/{tenantId}/{exportId}/result.csv
```

Do not use user-controlled names as storage paths.

---

# 171. Content Generation

Generated reports should be created in workers.

```text
Admin
  ↓
request export
  ↓
job
  ↓
worker
  ↓
generate
  ↓
storage
```

This protects API latency.

---

# 172. Temporary Signed URLs

Generated exports should generally use short-lived signed URLs.

When the URL expires:

```text
request new authorized URL
```

Do not permanently store signed URLs in the database.

---

# 173. File Access Revocation

If access is revoked:

```text
share revoked
   ↓
new signed URL cannot be issued
```

Existing signed URLs may remain valid until expiry depending on provider semantics.

Therefore keep TTL short for sensitive files.

---

# 174. Immediate Revocation

If immediate revocation is mandatory, do not rely only on signed URLs.

Use:

- application proxy
- CDN authorization layer
- very short TTL
- object policy controls

Choose based on the required security level.

---

# 175. File Locking

If multiple users edit/replace the same file:

- use version IDs
- optimistic concurrency
- explicit revision numbers

Avoid silently overwriting another user's upload.

---

# 176. Concurrent Deletion

Deletion should tolerate concurrent operations.

Example:

```text
worker A deletes
worker B deletes
```

Both should converge on:

```text
DELETED
```

without corrupting metadata.

---

# 177. Concurrent Processing

Prevent duplicate processing through:

- job deduplication
- database state checks
- idempotency keys
- unique constraints

Never rely solely on in-memory locks.

---

# 178. Storage Events

Provider object-created events can be useful:

```text
Object storage
   ↓
event
   ↓
webhook/event consumer
   ↓
file verification
```

But the application should not depend on an event being delivered exactly once.

Use durable state and reconciliation.

---

# 179. Event Ordering

Storage events may arrive:

- late
- duplicated
- out of order

Use:

- file state
- version numbers
- timestamps
- idempotency

rather than assuming ordering.

---

# 180. Storage Event Security

Validate provider event authenticity.

Treat object-event payloads as external input.

Do not trust:

```text
objectKey
tenantId
fileId
```

without validating the corresponding database state.

---

# 181. Integration With Audit Logging

File operations should integrate with the audit subsystem.

Example:

```text
FileService
   ↓
business mutation
   ↓
audit event
```

For critical state changes, make audit persistence transactionally consistent with the metadata mutation.

---

# 182. Integration With RBAC

File authorization should use centralized authorization policy.

Example:

```ts
await authorization.assertCan(actor, "files.read", file);
```

Then apply tenant/resource checks.

Do not duplicate authorization logic across every route.

---

# 183. Field-Level Authorization

Some file metadata may be more sensitive than others.

For example:

```text
normal user:
  name
  size
  status

admin:
  scan details
  storage diagnostics
  provider metadata
```

Return only fields appropriate for the caller.

---

# 184. API Contract

Use shared TypeBox schemas for file APIs.

Example:

```ts
const FileResponseSchema = Type.Object({
  id: Type.String(),
  originalName: Type.String(),
  contentType: Type.String(),
  sizeBytes: Type.Integer(),
  status: Type.String(),
});
```

Keep request/response contracts separate from Prisma models.

---

# 185. Prisma Boundary

Do not return Prisma `File` records directly from routes.

Prefer:

```text
Prisma model
  ↓
repository
  ↓
service/domain model
  ↓
response DTO
```

This prevents database structure from becoming the public API.

---

# 186. Database Indexes

Common indexes may include:

```text
tenantId
ownerId
status
purpose
createdAt
expiresAt
```

Composite indexes should reflect actual queries.

Example:

```text
(tenantId, createdAt)
(tenantId, status, createdAt)
```

Do not add indexes without query justification.

---

# 187. Unique Constraints

Useful uniqueness rules may include:

```text
objectKey UNIQUE
(provider, providerObjectId) UNIQUE
```

If versioning:

```text
(fileId, versionNumber) UNIQUE
```

Constraints protect against duplicate records.

---

# 188. File Relationship Tables

For files attached to multiple domain objects:

```text
File
   ↓
FileAttachment
   ├── fileId
   ├── resourceType
   ├── resourceId
   └── createdAt
```

Avoid polymorphic relationships unless the project accepts their tradeoffs.

---

# 189. Authorization With Attachments

When a file is attached to a resource:

```text
file access
  ↓
resource authorization
```

For example:

```text
Order
  └── File
```

A user who cannot view the order should not gain access to its attachments merely by guessing the file ID.

---

# 190. File Ownership Transfer

If ownership changes:

```text
old owner
   ↓
authorization
   ↓
update ownership
   ↓
audit
```

Any cached authorization or sharing state must be invalidated.

---

# 191. Cache Interaction

File metadata may be cached.

Never cache signed URLs for longer than their security lifetime.

Authorization-sensitive metadata should use tenant/user/resource-aware cache keys.

See `CACHING.md`.

---

# 192. Signed URL Caching

If caching signed URLs:

```text
cache TTL < signed URL TTL
```

Prefer not caching them unless it meaningfully improves performance.

A safer default is to generate them on demand.

---

# 193. File List Caching

For admin dashboards, file lists may be cached through TanStack Query.

Invalidate after:

```text
upload
delete
restore
status change
```

The server remains authoritative.

---

# 194. Background Job Observability

For file jobs monitor:

```text
queue depth
queue age
processing latency
failure rate
retry count
dead letters
```

Break metrics down by operation:

```text
scan
thumbnail
extract
export
cleanup
```

---

# 195. File Processing Dashboard

Recommended panels:

```text
Uploads/day
Bytes/day
Processing queue
Scan queue
Failed files
Rejected files
Average processing time
p95 processing time
Storage usage
Orphan objects
Missing objects
```

---

# 196. Alerts

Useful alerts:

```text
storage failure rate elevated
scan failures elevated
processing backlog growing
orphan count increasing
missing objects detected
storage quota near limit
unexpected egress spike
credential/authentication failures
```

---

# 197. Incident Response

File incidents may include:

```text
private files exposed
mass deletion
malware uploaded
storage outage
storage credential compromise
cross-tenant access
signed URL leak
unexpected egress
orphan explosion
```

Treat cross-tenant access or credential compromise as high-severity security incidents.

---

# 198. Mass Deletion Protection

Dangerous cleanup operations should have:

- dry-run
- confirmation
- batch limits
- audit
- permission checks
- recovery strategy

Never provide:

```text
delete all files
```

without strong safeguards.

---

# 199. Cleanup Job Safety

Cleanup should operate on explicit criteria:

```text
status = EXPIRED
expiresAt < now
legalHold = false
```

Use batch limits.

Record progress.

---

# 200. Storage Credential Compromise

If credentials are compromised:

1. Revoke/rotate credentials.
2. Inspect provider logs.
3. Identify affected objects.
4. Review unauthorized access.
5. Rotate dependent secrets.
6. Check public access policies.
7. Review signed URL exposure.
8. Audit.
9. Notify stakeholders as required.
10. Validate storage policy after recovery.

---

# 201. Malware Incident

If malware is detected:

```text
quarantine file
   ↓
block download
   ↓
record detection
   ↓
alert
   ↓
investigate source
   ↓
scan related files if required
   ↓
delete/release according to policy
```

Do not simply change the extension.

---

# 202. Cross-Tenant File Exposure

Immediate actions:

```text
1. Disable affected access path.
2. Revoke/expire access where possible.
3. Determine scope.
4. Preserve evidence.
5. Audit affected requests.
6. Correct authorization.
7. Rotate/revoke credentials if relevant.
8. Validate isolation.
9. Follow incident response.
```

---

# 203. Storage Outage

During an outage:

- preserve metadata
- avoid destructive retries
- queue safe asynchronous work
- communicate impact
- monitor recovery
- verify objects after recovery
- run reconciliation

Do not fabricate successful uploads.

---

# 204. Backup Restore Test

Periodically test:

```text
database restore
+
object restore
+
authorization
+
download
+
processing
```

A backup is not proven until restoration has been tested.

---

# 205. File Storage Disaster Recovery Checklist

- [ ] database backup exists
- [ ] object backup/replication exists
- [ ] encryption keys recoverable
- [ ] storage credentials recoverable
- [ ] restore procedure documented
- [ ] RPO defined
- [ ] RTO defined
- [ ] reconciliation job available
- [ ] download smoke test exists
- [ ] processing can resume
- [ ] expired/incomplete uploads handled

---

# 206. File Storage Testing

## Unit tests

Test:

- object-key generation
- MIME rules
- size rules
- status transitions
- authorization decisions
- error mapping

## Integration tests

Test:

- signed URL creation
- upload completion
- HEAD verification
- download URL creation
- delete
- metadata synchronization

## Security tests

Test:

- IDOR
- cross-tenant access
- invalid signatures
- oversized files
- malicious MIME claims
- path traversal
- archive attacks
- SSRF
- unauthorized sharing

## Recovery tests

Test:

- missing object
- orphan object
- provider outage
- processing retry
- cleanup recovery

---

# 207. Storage Contract Tests

The storage interface should be tested against each adapter.

Example contract:

```text
createUploadUrl
createDownloadUrl
headObject
deleteObject
```

Every provider adapter must satisfy the same behavior expectations.

---

# 208. Fake Storage

Use an in-memory or local fake for unit tests.

It should support:

```text
put
get
head
delete
exists
```

and failure simulation:

```text
timeout
not found
permission denied
provider error
```

---

# 209. Test Fixtures

Useful fixtures:

```text
small-valid-pdf
small-valid-image
oversized-file
wrong-mime
malformed-pdf
zip-bomb-like-fixture
path-traversal-archive
infected-test-fixture
```

Use safe, controlled security fixtures.

---

# 210. E2E Upload Test

Example:

```text
login
  ↓
create upload intent
  ↓
upload file
  ↓
complete
  ↓
processing
  ↓
available
  ↓
request download
  ↓
download
```

Verify authorization at each step.

---

# 211. E2E Security Test

Example:

```text
User A uploads file
User B attempts access
   ↓
403/404 according to API policy
```

Also test:

```text
Tenant A → Tenant B
Admin → restricted file
Revoked share → denied
Expired link → denied
```

---

# 212. Performance Testing

Measure:

- upload intent latency
- signed URL generation
- metadata queries
- download URL generation
- processing throughput
- scan throughput
- large-file behavior

Do not load-test by repeatedly downloading huge files from production.

Use controlled environments.

---

# 213. Large File Testing

Test representative sizes:

```text
1 MB
10 MB
100 MB
1 GB+
```

based on actual product requirements.

Verify memory usage remains bounded.

---

# 214. Node.js Memory Safety

Avoid:

```ts
const buffer = await file.toBuffer();
```

for large files.

Prefer streams.

Use explicit size limits.

---

# 215. API Timeouts for Uploads

Direct uploads reduce API timeout pressure.

For proxied uploads, use:

- request timeout
- streaming
- backpressure
- maximum size
- cancellation

---

# 216. Backpressure

When streaming:

```text
source
  ↓
stream
  ↓
storage
```

respect backpressure.

Do not read the entire file into memory faster than storage can consume it.

---

# 217. Worker Backpressure

If uploads arrive faster than processing:

```text
upload rate > processing rate
```

the queue grows.

Monitor queue age and apply:

- concurrency controls
- priorities
- quotas
- rate limits
- autoscaling

---

# 218. File Processing Autoscaling

Workers can scale based on:

```text
queue depth
queue age
CPU
memory
```

Do not scale solely on queue count if jobs vary greatly in cost.

---

# 219. CPU-Heavy Processing

Separate CPU-heavy jobs such as:

```text
video transcoding
large PDF conversion
OCR
image processing
```

from lightweight jobs.

This prevents one expensive workload from starving everything else.

---

# 220. File Storage API Versioning

File APIs follow the project's URL versioning strategy:

```text
/api/v1/files
```

Breaking changes should use a new API version.

See `API_VERSIONING.md`.

---

# 221. OpenAPI

Document:

- upload intent
- completion
- metadata
- download
- deletion
- listing
- sharing

Do not document signed URLs as permanent API contracts.

The API contract is the application endpoint that authorizes access.

---

# 222. API Documentation Examples

Example:

```http
POST /api/v1/files/uploads
Authorization: Bearer <token>
```

Response:

```json
{
  "data": {
    "file": {
      "id": "file_123",
      "status": "PENDING"
    },
    "upload": {
      "url": "signed-url",
      "expiresAt": "2026-09-07T10:00:00Z"
    }
  }
}
```

Never put real credentials or real signed URLs in documentation.

---

# 223. Configuration

Example environment categories:

```text
STORAGE_PROVIDER
STORAGE_BUCKET
STORAGE_REGION
STORAGE_ENDPOINT

STORAGE_UPLOAD_URL_TTL_SECONDS
STORAGE_DOWNLOAD_URL_TTL_SECONDS

FILE_MAX_SIZE_BYTES
FILE_ALLOWED_TYPES

FILE_SCAN_ENABLED
FILE_PROCESSING_ENABLED
```

Actual variable names should follow the project's configuration conventions.

---

# 224. Startup Validation

Validate at startup:

```text
provider configured
bucket configured
region configured
credentials available
limits valid
TTL values valid
```

Fail fast for invalid production configuration.

---

# 225. Feature Flags

Useful flags:

```text
files.uploads.enabled
files.scanning.enabled
files.processing.enabled
files.publicDownloads.enabled
files.remoteImport.enabled
```

Flags should have owners and removal dates.

---

# 226. Migration From Local Storage

If migrating from local disk:

```text
discover files
   ↓
create metadata
   ↓
upload objects
   ↓
verify checksums
   ↓
switch reads
   ↓
monitor
   ↓
delete old files after retention
```

Do not delete the source before verification.

---

# 227. Storage Migration Verification

Compare:

```text
file count
total bytes
checksums
content types
object accessibility
metadata references
```

Run reconciliation before deleting the old storage.

---

# 228. Provider Migration

Migration between providers:

```text
inventory
   ↓
copy
   ↓
verify
   ↓
dual-read or staged switch
   ↓
switch writes
   ↓
monitor
   ↓
reconcile
   ↓
retire old provider
```

Do not switch blindly.

---

# 229. Migration Rollback

Before migration, define:

```text
How to switch reads back?
How to switch writes back?
Which objects changed?
How to reconcile?
How long is old storage retained?
```

Keep rollback possible until confidence is established.

---

# 230. File Storage Documentation Per Provider

For every provider document:

```text
provider
API version
SDK version
region
bucket/container
credentials
permissions
upload mechanism
download mechanism
limits
lifecycle
backup
webhooks/events
failure modes
runbook
owner
```

---

# 231. Provider Selection Criteria

Evaluate:

- durability
- availability
- security
- regional support
- lifecycle policies
- signed URLs
- multipart uploads
- versioning
- object lock
- monitoring
- cost
- egress
- SDK quality
- portability

---

# 232. Storage Cost Optimization

Use:

- lifecycle rules
- compression where appropriate
- deduplication only when safe
- archival classes
- cleanup of abandoned uploads
- export expiration
- CDN for safe public assets

Never sacrifice authorization for cost optimization.

---

# 233. File Storage Ownership

Assign ownership to:

```text
Platform / Backend
```

with collaboration from:

```text
Security
Product
Infrastructure
```

Critical storage operations need clear responsibility.

---

# 234. Operational Runbooks

Maintain runbooks for:

```text
storage outage
credential rotation
malware detection
mass deletion
missing objects
orphan objects
reconciliation
provider migration
backup restore
quota exhaustion
unexpected egress
```

---

# 235. Definition of Done

A production-ready file-storage subsystem has:

- [ ] object storage provider selected
- [ ] storage adapter implemented
- [ ] file metadata model implemented
- [ ] private-by-default policy
- [ ] upload authorization
- [ ] signed upload URLs
- [ ] signed download URLs
- [ ] file-size limits
- [ ] content validation
- [ ] server-side object verification
- [ ] scan workflow where required
- [ ] processing workers where required
- [ ] idempotent processing
- [ ] secure object keys
- [ ] tenant isolation
- [ ] RBAC integration
- [ ] audit integration
- [ ] rate limiting
- [ ] cleanup workflow
- [ ] retention policy
- [ ] reconciliation
- [ ] metrics
- [ ] structured logs
- [ ] tests
- [ ] backup/recovery strategy
- [ ] incident runbooks
- [ ] owner assigned

---

# 236. Production Checklist

## Upload

- [ ] authenticated
- [ ] authorized
- [ ] size validated
- [ ] type validated
- [ ] signed URL short-lived
- [ ] object private
- [ ] completion verified
- [ ] scan performed if required

## Download

- [ ] authenticated where required
- [ ] resource authorization
- [ ] tenant authorization
- [ ] file status checked
- [ ] short-lived URL
- [ ] safe headers
- [ ] rate limited

## Processing

- [ ] async where appropriate
- [ ] idempotent
- [ ] bounded retries
- [ ] dead-letter handling
- [ ] resource limits
- [ ] observability

## Storage

- [ ] encryption
- [ ] least privilege
- [ ] lifecycle policies
- [ ] backup/replication
- [ ] reconciliation
- [ ] cost monitoring

## Security

- [ ] no public bucket by default
- [ ] no secrets in logs
- [ ] SSRF protection
- [ ] archive protections
- [ ] malware scanning where required
- [ ] cross-tenant tests
- [ ] IDOR tests

---

# 237. Recommended Implementation Sequence

```text
Phase 1
  File metadata model
  Storage interface
  Local adapter

Phase 2
  Upload intent
  Signed upload
  Completion verification

Phase 3
  Signed downloads
  Authorization
  RBAC integration

Phase 4
  Processing queue
  Scan
  Metadata extraction

Phase 5
  Deletion
  Expiration
  Cleanup
  Reconciliation

Phase 6
  Audit
  Metrics
  Dashboards
  Alerts

Phase 7
  Advanced capabilities
  Multipart uploads
  CDN
  Versioning
  Archival
  Remote imports

Phase 8
  Disaster recovery
  Restore testing
  Provider migration strategy
```

---

# 238. Suggested Initial Scope for Fastify-MasterApp

For the first production implementation, keep the scope focused:

```text
PostgreSQL
  └── File metadata

Object Storage
  └── private objects

Fastify
  ├── upload intent
  ├── completion
  ├── metadata
  ├── download authorization
  └── deletion

Redis/BullMQ
  └── processing jobs

Worker
  ├── verify
  ├── scan
  └── process

RBAC
  └── access control

Audit
  └── sensitive actions

Prometheus/Grafana
  └── operational visibility
```

Add advanced functionality only when required.

---

# 239. Final Architecture

```text
                         React Admin
                              │
                              ▼
                         Fastify API
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
          Authentication     RBAC       File Service
                                            │
                             ┌──────────────┼──────────────┐
                             │              │              │
                             ▼              ▼              ▼
                        PostgreSQL       Outbox       Object Storage
                        metadata          │           private bytes
                                          ▼
                                       BullMQ
                                          │
                                          ▼
                                   File Processing
                                      Workers
                                          │
                              ┌───────────┼───────────┐
                              ▼           ▼           ▼
                             Scan      Transform     Index
                              │           │           │
                              └───────────┴───────────┘
                                          │
                                          ▼
                                   Update metadata
                                          │
                                          ▼
                                       Audit
                                          │
                                          ▼
                                  Observability
```

---

# 240. Golden Rules

1. Object storage owns file bytes.
2. PostgreSQL owns file metadata and business state.
3. Files are private by default.
4. Never use original filenames as object keys.
5. Authenticate before issuing upload/download access.
6. Authorize every protected file operation.
7. Never rely on file IDs for authorization.
8. Enforce tenant isolation at the database/application boundary.
9. Use short-lived signed URLs.
10. Do not store signed URLs permanently.
11. Do not trust browser MIME types.
12. Validate actual object size after upload.
13. Validate file content where required.
14. Scan untrusted files where the threat model requires it.
15. Fail closed when mandatory scanning fails.
16. Treat archives as dangerous input.
17. Protect against path traversal.
18. Protect remote imports against SSRF.
19. Do not load huge files into Node.js memory.
20. Use streaming for large files.
21. Use direct-to-storage uploads when appropriate.
22. Keep storage provider code behind an adapter.
23. Do not call storage APIs inside database transactions.
24. Use durable intents and asynchronous processing.
25. Make processing idempotent.
26. Use bounded retries.
27. Isolate heavy file workers from API capacity.
28. Monitor queue depth and processing latency.
29. Audit sensitive file operations.
30. Never log secrets or signed URLs.
31. Define retention and deletion policies.
32. Clean up abandoned uploads.
33. Reconcile database metadata against storage.
34. Protect important files with backup/replication.
35. Test restoration, not just backups.
36. Keep generated exports temporary when possible.
37. Use RBAC for administrative file operations.
38. Use stronger controls for sensitive documents.
39. Monitor storage cost and egress.
40. Document provider ownership and runbooks.
41. Design provider adapters so migration remains possible.
42. Keep advanced storage features optional until justified.
43. Treat uploaded content as untrusted input.
44. Make file state transitions explicit.
45. Make recovery behavior part of the design.

---

# 241. Final Principle

The file-storage system should remain simple at the application boundary:

```text
Authorize
   ↓
Create intent
   ↓
Store bytes
   ↓
Verify
   ↓
Scan/process
   ↓
Mark available
   ↓
Authorize access
   ↓
Deliver safely
   ↓
Retain/reconcile/delete
```

The complexity belongs in the infrastructure and recovery mechanisms, not in every business service.

For Fastify-MasterApp, the preferred architecture is therefore:

> **Fastify + RBAC for authorization, PostgreSQL for metadata and business truth, object storage for binary content, BullMQ for asynchronous processing, audit logging for accountability, and Prometheus/Grafana for operational visibility.**
