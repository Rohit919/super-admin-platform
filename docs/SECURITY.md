# Security

## Fastify-MasterApp — Security Architecture & Implementation Plan

**Status:** Proposed security standard  
**Priority:** P0 — Critical  
**Scope:** API, Admin frontend, authentication, authorization, database, infrastructure, CI/CD

---

# 1. Purpose

This document defines the security baseline for Fastify-MasterApp.

The goal is to make security:

- centralized;
- explicit;
- testable;
- observable;
- secure by default;
- difficult to accidentally bypass.

Security must be enforced primarily at the API boundary.

The Admin frontend improves usability and reduces accidental access, but it is never a trusted security boundary.

---

# 2. Security Model

Use defense in depth:

```text
                    Internet
                       │
                       ↓
                TLS / HTTPS
                       │
                       ↓
                 Reverse Proxy
                       │
                       ↓
                Fastify API
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
 Authentication   Authorization   Validation
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                Business Rules
                       ↓
                 Prisma / DB
                       ↓
                 PostgreSQL
```

Additional layers:

```text
Rate limiting
Security headers
CORS
Structured logging
Audit logging
Monitoring
Dependency scanning
Secret management
Container security
Backups
Incident response
```

---

# 3. Security Principles

Follow these principles:

1. Default deny.
2. Least privilege.
3. Never trust the client.
4. Validate all external input.
5. Authenticate before protected operations.
6. Authorize every sensitive operation.
7. Keep secrets out of source code.
8. Keep sensitive data out of logs.
9. Minimize data exposure.
10. Use short-lived credentials where practical.
11. Rotate credentials.
12. Audit privileged actions.
13. Fail safely.
14. Make security behavior observable.
15. Test security boundaries explicitly.
16. Keep dependencies patched.
17. Separate development and production credentials.
18. Prefer secure defaults over developer convenience in production.

---

# 4. Threat Model

The application should assume attackers can:

```text
Send arbitrary HTTP requests
Modify frontend JavaScript
Bypass the Admin UI
Replay requests
Manipulate query parameters
Manipulate request bodies
Attempt credential stuffing
Attempt token theft/reuse
Attempt privilege escalation
Attempt IDOR/resource access
Abuse expensive endpoints
Exploit dependency vulnerabilities
Probe error messages
Exploit misconfigured infrastructure
```

Never assume:

```text
The request came from our Admin UI
```

means the request is trustworthy.

---

# 5. Trust Boundaries

Important trust boundaries:

```text
Browser → API
API → Database
API → External services
Developer machine → Repository
CI/CD → Deployment
Admin → Privileged operations
Worker → Queue
```

Validate and authorize data crossing each boundary.

---

# 6. Authentication

Authentication answers:

> Who is this caller?

Recommended flow:

```text
Credentials
   ↓
POST /auth/login
   ↓
Validate credentials
   ↓
Create authenticated session
   ↓
Short-lived access credential
   ↓
Authenticated API requests
```

The API must be responsible for authentication.

Do not implement authentication solely in React.

---

# 7. Password Storage

Never store plaintext passwords.

Never use reversible encryption for passwords.

Use a modern password hashing algorithm such as:

```text
Argon2id
```

or another strong, appropriately configured password hashing scheme supported by the application's security requirements.

Password hashes must use:

```text
unique salt
appropriate work factor
```

Never log:

```text
password
password hash
password reset token
```

---

# 8. Password Policy

Use a practical password policy.

Minimum requirements should prioritize resistance to guessing and credential stuffing rather than arbitrary complexity rules.

Recommended:

```text
Minimum length: 12
```

Consider rejecting commonly breached passwords.

Do not require unnecessary rules such as:

```text
exactly one uppercase
exactly one special character
```

if they encourage predictable passwords.

---

# 9. Login Protection

Protect login endpoints against:

```text
Credential stuffing
Brute force
Automated abuse
User enumeration
```

Use:

```text
Rate limiting
Progressive delays where appropriate
Generic authentication errors
Monitoring
```

Avoid:

```text
Email does not exist
```

versus:

```text
Incorrect password
```

when such differences would enable account enumeration.

Prefer:

```text
Invalid email or password.
```

---

# 10. Session Strategy

Use short-lived access credentials.

Example:

```text
Access token
→ ~15 minutes

Refresh/session credential
→ longer-lived
```

Exact lifetimes should be configurable.

The refresh/session mechanism should support:

```text
Rotation
Revocation
Replay detection
Session identification
Logout
```

---

# 11. Refresh Token Security

If refresh tokens are persisted:

```text
Never store raw refresh tokens unnecessarily.
```

Prefer storing a secure hash/reference.

Recommended lifecycle:

```text
Refresh token issued
       ↓
Client refreshes
       ↓
Old token invalidated
       ↓
New token issued
```

If an already-used refresh token is presented again:

```text
Possible replay
       ↓
Revoke affected session/token family
       ↓
Require re-authentication
       ↓
Audit event
```

Implement replay handling carefully so legitimate concurrent refreshes do not create accidental lockouts.

---

# 12. Token Storage in Browser

Prefer:

```text
HttpOnly
Secure
SameSite
```

cookies for long-lived refresh/session credentials where compatible with the application's architecture.

Avoid storing long-lived refresh tokens in:

```text
localStorage
sessionStorage
```

because JavaScript-accessible storage increases the impact of XSS.

Short-lived access-token handling should follow the chosen authentication architecture and minimize exposure.

---

# 13. JWT Rules

If JWTs are used:

```text
Use strong signing keys
Validate algorithm explicitly
Validate issuer where applicable
Validate audience where applicable
Validate expiration
Validate not-before where applicable
Validate token type
```

Do not accept arbitrary JWT algorithms.

Never use:

```text
alg = none
```

or equivalent unsafe configurations.

---

# 14. JWT Payload

Keep JWT payloads minimal.

Safe examples:

```text
sub
sessionId
iat
exp
iss
aud
tokenType
```

Avoid putting:

```text
password
refresh token
sensitive personal data
large permission lists
secrets
```

into the token.

Especially avoid treating client-visible permission claims as the authoritative authorization source when permissions can change before token expiration.

---

# 15. Authentication vs Authorization

Keep these separate.

```text
Authentication
→ Who are you?

Authorization
→ What can you do?
```

Flow:

```text
authenticate
    ↓
request.user
    ↓
requirePermission(...)
```

RBAC details belong in the RBAC implementation plan.

---

# 16. RBAC

Use permission-based authorization.

Example:

```text
users.read
users.create
users.update
users.delete
roles.read
roles.update
audit.read
settings.update
```

Prefer:

```ts
requirePermission("users.delete");
```

over:

```ts
if (user.role === "ADMIN")
```

The API must enforce authorization.

Frontend checks are only UX.

---

# 17. Default Deny

If authorization information is:

```text
missing
invalid
unknown
unavailable
```

the system must not grant access.

Conceptually:

```text
No permission
   ↓
DENY
```

not:

```text
No permission
   ↓
Maybe allow
```

---

# 18. Privilege Escalation Protection

Prevent users from granting permissions they should not be able to delegate.

Example:

```text
ADMIN
  ↓
assign SUPER_ADMIN
```

must be rejected unless explicitly authorized.

Protect:

```text
Role creation
Role modification
Permission assignment
Role assignment
SUPER_ADMIN assignment
```

---

# 19. Resource Authorization / IDOR

RBAC does not automatically prevent object-level authorization problems.

Example:

```http
GET /api/users/123
```

A user may have:

```text
users.read
```

but still not be allowed to read every user.

The API must verify:

```text
Permission
+
Resource access policy
```

when the domain requires it.

Never assume that possession of a resource ID grants access.

---

# 20. Input Validation

Validate all untrusted input.

Validate:

```text
JSON body
Path parameters
Query parameters
Headers where relevant
File uploads
Webhook payloads
External API responses where appropriate
```

Use TypeBox/Fastify schemas consistently.

Never rely solely on TypeScript.

---

# 21. SQL / Injection Protection

Use Prisma's parameterized query mechanisms.

Avoid raw SQL unless necessary.

If raw SQL is required:

```text
Use parameterized queries
Validate inputs
Review permissions
Test injection boundaries
```

Never concatenate untrusted input into SQL.

Bad:

```text
"... WHERE id = '" + userInput + "'"
```

---

# 22. NoSQL / Command / Template Injection

The same principle applies to:

```text
Shell commands
Redis commands
Template engines
Search queries
Regular expressions
External query languages
```

Never pass untrusted input directly into executable/query syntax.

---

# 23. Path Traversal

For file operations, reject paths containing unsafe traversal.

Do not allow user input to directly determine filesystem paths.

Bad:

```text
/files?path=../../../../etc/passwd
```

Use:

```text
opaque file IDs
allowlisted directories
normalized paths
```

where file operations are required.

---

# 24. File Upload Security

For uploads:

```text
Authenticate
Authorize
Validate size
Validate extension
Validate actual content
Store outside executable directories
Generate safe filenames
Scan when appropriate
```

Do not trust:

```text
Content-Type
filename extension
client-provided filename
```

alone.

---

# 25. XSS Protection

The Admin frontend should avoid rendering untrusted HTML.

Do not use:

```text
dangerouslySetInnerHTML
```

with unsanitized user content.

If HTML must be rendered:

```text
sanitize
allowlist
review
```

API responses should not be assumed safe merely because they came from the application database.

Stored XSS is especially important for:

```text
User names
Comments
Descriptions
Audit metadata
Imported content
```

---

# 26. Content Security Policy

Consider a strong Content Security Policy for the Admin frontend.

Start with a policy appropriate to the application's actual asset and API architecture.

Avoid immediately using:

```text
unsafe-eval
```

unless required.

Avoid:

```text
unsafe-inline
```

where practical.

Test CSP before enforcing it broadly.

---

# 27. Security Headers

Use appropriate HTTP security headers.

Common baseline:

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

Avoid legacy headers that are no longer useful unless required for compatibility.

---

# 28. HTTPS

Production authentication must use HTTPS.

Do not send credentials over plaintext HTTP.

Use:

```text
TLS
HSTS
Secure cookies
```

in production.

Redirect HTTP to HTTPS at the appropriate infrastructure layer.

---

# 29. CORS

CORS should be explicitly configured.

Avoid:

```text
Access-Control-Allow-Origin: *
```

for authenticated Admin APIs.

Prefer allowlisted origins:

```text
https://admin.example.com
```

Only allow required:

```text
methods
headers
credentials
origins
```

---

# 30. CSRF

If authentication uses cookies, evaluate CSRF protection carefully.

Possible defenses include:

```text
SameSite cookies
CSRF tokens
Origin validation
Referer validation where appropriate
```

Do not assume CORS alone is CSRF protection.

If the browser automatically sends authentication cookies, state-changing endpoints need a deliberate CSRF strategy.

---

# 31. Rate Limiting

Apply rate limits based on endpoint sensitivity.

High priority:

```text
/login
/auth/refresh
/password reset
/password change
role/permission mutations
expensive exports
```

Rate-limit responses should use:

```text
429 Too Many Requests
```

and should not reveal unnecessary security information.

For distributed deployments, use a shared rate-limit store when necessary.

---

# 32. Account Lockout

Avoid simplistic permanent lockouts because attackers can weaponize them for denial of service.

Prefer combinations such as:

```text
Rate limiting
Progressive delays
Risk detection
Temporary throttling
Credential reset
Monitoring
```

If lockout is used, define:

```text
duration
unlock behavior
admin recovery
audit behavior
```

---

# 33. Email Verification

If email ownership matters, implement a verification flow.

Requirements:

```text
Short-lived verification token
Single use
Secure random token
Expiration
Audit event
```

Never log the token.

Avoid exposing whether a particular email is registered through public verification endpoints.

---

# 34. Password Reset

Password reset tokens must be:

```text
Cryptographically random
Short-lived
Single-use
Stored safely if persisted
Invalidated after use
```

Flow:

```text
Request reset
    ↓
Generic response
    ↓
Email token
    ↓
Validate token
    ↓
Set new password
    ↓
Invalidate existing sessions where appropriate
    ↓
Audit
```

Do not reveal whether the account exists.

---

# 35. Session Revocation

Support revoking sessions.

Useful triggers:

```text
Logout
Password change
Password reset
Account suspension
Refresh token replay
Admin security action
```

Consider a session model:

```text
Session
├── id
├── userId
├── createdAt
├── lastUsedAt
├── expiresAt
├── revokedAt
├── IP
└── userAgent
```

Do not retain sensitive session metadata indefinitely.

---

# 36. Admin Session Security

Administrators have elevated risk.

Consider:

```text
Shorter session lifetime
Re-authentication for critical actions
MFA
Session listing
Remote session revocation
Audit logging
```

MFA should be prioritized for SUPER_ADMIN and highly privileged users.

---

# 37. Multi-Factor Authentication

Recommended future security feature:

```text
Password
+
TOTP/WebAuthn/security key
```

Prioritize:

```text
SUPER_ADMIN
ADMIN
```

WebAuthn/passkeys can provide strong phishing-resistant authentication where supported by the product requirements.

Do not invent custom cryptographic MFA.

Use established standards/libraries.

---

# 38. Re-authentication

For highly sensitive actions, require recent authentication.

Examples:

```text
Change primary email
Change password
Disable MFA
Grant SUPER_ADMIN
Delete critical data
Change security configuration
```

Conceptually:

```text
Authenticated
    ↓
Sensitive operation
    ↓
Recent authentication required
```

---

# 39. Sensitive Data Minimization

Only collect and store data that the application needs.

Avoid storing unnecessary:

```text
PII
tokens
IP history
device data
personal metadata
```

When sensitive data is required:

```text
Encrypt where appropriate
Restrict access
Audit access
Define retention
```

---

# 40. Database Security

Production database should:

```text
Require authentication
Use TLS where appropriate
Restrict network access
Use least-privileged database credentials
Avoid public exposure
Use backups
Monitor access
```

Do not expose PostgreSQL directly to the public internet unless there is a compelling, reviewed architecture.

---

# 41. Database User Privileges

Do not run the application with a database superuser.

Prefer:

```text
Application DB user
  → only required privileges
```

Migration tooling can use a more privileged account separately if needed.

---

# 42. Database Secrets

Never hard-code:

```text
DATABASE_URL
DB password
encryption keys
JWT signing keys
```

Use:

```text
environment secrets
secret manager
deployment secret store
```

Production secrets should not be committed to Git.

---

# 43. Prisma Security

Use Prisma normally for parameterized queries.

Review:

```text
$executeRaw
$queryRaw
```

carefully.

Avoid raw SQL unless it provides a real benefit.

When using raw queries, ensure all user-controlled values are safely parameterized.

---

# 44. Database Backups

Production must have backups.

Define:

```text
Backup frequency
Retention
Encryption
Storage location
Access controls
Restore process
Restore testing
```

A backup that has never been restored is not a proven backup strategy.

Test restoration periodically.

---

# 45. Secrets Management

Secrets should be supplied at runtime.

Examples:

```text
JWT signing key
Database password
Redis credentials
External API keys
Cloud credentials
Encryption keys
```

Preferred:

```text
Secret manager
↓
Deployment
↓
Environment/runtime
```

Avoid:

```text
Git repository
Docker image
frontend bundle
logs
```

---

# 46. Frontend Environment Variables

For Vite-style applications, assume frontend environment variables are public.

Never put secrets in:

```text
VITE_*
```

Examples of acceptable values:

```text
VITE_API_BASE_URL
VITE_APP_NAME
VITE_ENVIRONMENT
```

Never:

```text
VITE_DATABASE_PASSWORD
VITE_JWT_SECRET
VITE_PRIVATE_API_KEY
```

Anything shipped to the browser can be inspected.

---

# 47. Dependency Security

Keep dependencies maintained.

Run:

```text
npm audit
```

or the package manager equivalent where appropriate.

Also use:

```text
Dependabot/Renovate
OSV or equivalent scanning
CI dependency checks
```

Do not blindly auto-upgrade major versions in production.

Review security advisories based on actual exposure.

---

# 48. Lockfiles

Commit the package manager lockfile.

CI should use deterministic installation.

Examples:

```text
npm ci
```

or the equivalent deterministic package-manager command.

Do not allow CI to silently resolve arbitrary dependency versions.

---

# 49. Supply Chain Security

Protect the software supply chain.

Recommended:

```text
Dependency pinning/lockfiles
Automated vulnerability scanning
Minimal dependencies
Trusted package sources
Review dependency changes
Signed/verified build artifacts where appropriate
```

Avoid adding packages for trivial functionality when native code is sufficient.

---

# 50. Container Security

Production containers should:

```text
Use minimal base images
Run as non-root
Avoid unnecessary packages
Pin important base versions
Scan images
Use read-only filesystem where practical
Drop unnecessary Linux capabilities
```

Do not put secrets into Docker image layers.

Bad:

```dockerfile
ENV JWT_SECRET=...
```

Use runtime secret injection.

---

# 51. Kubernetes Security

If Kubernetes is used:

```text
Run as non-root
Use NetworkPolicies
Restrict service accounts
Use secrets management
Set resource limits
Set security contexts
Avoid privileged containers
Restrict host access
```

Do not expose internal services unnecessarily.

---

# 52. Network Segmentation

Recommended production topology:

```text
Internet
   ↓
Load Balancer / Reverse Proxy
   ↓
Fastify API
   ↓
Private Network
   ├── PostgreSQL
   ├── Redis
   └── Workers
```

Database and internal queues should not be directly accessible from the public internet.

---

# 53. SSRF Protection

If the API fetches URLs supplied by users:

```text
Validate URL
Allowlist protocols
Restrict destinations
Block private IP ranges
Block metadata endpoints
Control redirects
Limit response size
Set timeouts
```

Do not blindly do:

```ts
fetch(userProvidedUrl);
```

SSRF can expose:

```text
internal services
cloud metadata
credentials
private networks
```

---

# 54. External API Security

For external services:

```text
Use HTTPS
Validate certificates normally
Use timeouts
Use authentication
Rotate credentials
Handle errors safely
Avoid logging secrets
```

Do not expose external service credentials to the browser.

---

# 55. Webhook Security

For incoming webhooks:

```text
Verify signature
Validate timestamp/replay window
Validate payload schema
Use idempotency
Rate limit
Audit important events
```

Never trust a webhook merely because it hit the correct endpoint.

---

# 56. Replay Protection

For sensitive signed requests:

```text
timestamp
+
nonce/idempotency key
+
signature
```

can reduce replay risk.

Webhook providers may already provide their own scheme; follow their documented security model.

---

# 57. Authorization Cache Security

If permissions are cached:

```text
Cache hit
    ↓
Use only if trusted and valid
```

Invalidate authorization cache when:

```text
Role assigned
Role removed
Role permissions changed
User disabled
Critical permission changed
```

Never allow stale authorization data to silently create permanent access.

---

# 58. Logging Security

Never log:

```text
Passwords
Access tokens
Refresh tokens
Session secrets
Authorization headers
API keys
Database passwords
Encryption keys
Password reset tokens
MFA secrets
```

Be careful with:

```text
Request bodies
Query parameters
Cookies
User PII
```

---

# 59. Error Security

Production errors should be generic.

Do not expose:

```text
Stack traces
SQL
File paths
Internal hostnames
Prisma internals
Secrets
Library versions unnecessarily
```

Return a stable error code.

Example:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "requestId": "req_123"
  }
}
```

Log detailed information internally.

---

# 60. Request Correlation

Every request should have a request ID.

Example:

```text
X-Request-ID: req_123
```

Use it across:

```text
API logs
Audit events
External calls
Worker jobs
Error responses
Tracing
```

Do not allow attacker-controlled IDs to become dangerous log injection vectors. Normalize and validate them.

---

# 61. Audit Logging

Audit privileged actions.

At minimum:

```text
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT

PASSWORD_CHANGED
PASSWORD_RESET

ROLE_CREATED
ROLE_UPDATED
ROLE_DELETED
ROLE_ASSIGNED
ROLE_REMOVED
ROLE_PERMISSIONS_UPDATED

USER_SUSPENDED
USER_REACTIVATED
USER_DELETED

SECURITY_SETTING_CHANGED
```

Audit logs should be append-oriented and protected from ordinary users.

---

# 62. Audit Log Integrity

Administrators should not be able to casually delete their own audit history.

Consider:

```text
Restricted write path
Restricted delete permissions
Append-only semantics
Centralized retention
```

For high-security environments, consider tamper-evident or external audit storage.

---

# 63. Privacy and Retention

Define retention periods for:

```text
Audit logs
Session metadata
IP addresses
User activity
Security events
Application logs
Backups
```

Do not retain security data forever without a reason.

Retention should reflect:

```text
Business needs
Legal requirements
Security needs
Privacy requirements
```

---

# 64. Account Lifecycle

Support explicit states:

```text
ACTIVE
SUSPENDED
DISABLED
DELETED
```

Authentication should reject inappropriate states.

Example:

```text
SUSPENDED
   ↓
login denied
```

Role/permission checks should not accidentally override account status.

---

# 65. Deactivated User Sessions

When a user is disabled:

```text
Disable account
   ↓
Revoke active sessions
   ↓
Invalidate refresh credentials
   ↓
Audit event
```

Do not wait for existing long-lived credentials to expire if immediate revocation is required.

---

# 66. Admin Account Protection

For privileged accounts:

```text
MFA
Strong password
Shorter sessions
Session visibility
Security alerts
Audit logging
Least privilege
```

Do not share administrator accounts.

Every administrator should have an individual identity.

---

# 67. Break-Glass Access

If the product requires emergency access, design it deliberately.

Example:

```text
Break-glass account
  ↓
Highly restricted
  ↓
MFA
  ↓
Alert on use
  ↓
Full audit
```

Do not create undocumented backdoor credentials.

---

# 68. API Abuse Protection

Monitor for:

```text
Repeated 401
Repeated 403
Repeated 404
Repeated 429
Large request volumes
Expensive query patterns
Suspicious resource enumeration
```

Useful signals:

```text
IP
Account
Session
Route
Request frequency
Failure rate
```

Do not rely on IP alone because users can share IPs and attackers can rotate addresses.

---

# 69. Resource Enumeration

Attackers may enumerate:

```text
User IDs
Order IDs
Role IDs
File IDs
```

Use:

```text
Authorization
Non-sequential opaque IDs where appropriate
Rate limiting
Consistent access controls
```

Never treat random IDs as a substitute for authorization.

---

# 70. Sensitive Endpoints

Review extra protections for:

```text
/auth/login
/auth/refresh
/auth/logout
/password/*
/users/*
/roles/*
/permissions/*
/settings/*
/audit/*
```

Especially:

```text
SUPER_ADMIN operations
credential changes
permission changes
```

---

# 71. Admin Frontend Security

The Admin frontend must:

```text
Use HTTPS
Avoid secrets
Avoid unsafe HTML rendering
Handle 401/403 centrally
Hide unauthorized UI
Protect routes
Avoid token logging
Use secure session strategy
```

Remember:

```text
Frontend permission check
≠
API authorization
```

---

# 72. Browser Security

Configure:

```text
CSP
HSTS
Secure cookies
SameSite cookies
X-Content-Type-Options
Referrer-Policy
```

Avoid unnecessary third-party scripts in the Admin.

Every third-party script increases the browser trust surface.

---

# 73. Third-Party Dependencies

For frontend packages:

```text
Audit dependencies
Minimize third-party scripts
Review package permissions
Keep packages updated
Remove unused packages
```

Avoid loading remote JavaScript from arbitrary domains.

---

# 74. CSRF Strategy Decision

Document the chosen model.

### Cookie-based authentication

Use:

```text
SameSite
+
CSRF protection
+
Origin checks
```

where appropriate.

### Authorization header model

CSRF exposure is generally different because browsers do not automatically attach arbitrary authorization headers, but XSS/token theft remains important.

Do not assume one defense solves all browser threats.

---

# 75. CORS Is Not Authentication

This is critical.

CORS controls which browsers may read responses.

It does not prevent:

```text
curl
Postman
custom scripts
server-side attackers
```

from calling the API.

Therefore:

```text
CORS
≠
authentication
≠
authorization
```

---

# 76. Secrets Rotation

Define rotation procedures for:

```text
JWT keys
Database credentials
Redis credentials
Cloud credentials
External API keys
Webhook secrets
Encryption keys
```

Document:

```text
Who rotates
How rotation occurs
How old credentials are revoked
How applications reload credentials
How failures are handled
```

---

# 77. Encryption

Use encryption in transit:

```text
HTTPS/TLS
```

Use encryption at rest where appropriate:

```text
Database
Backups
Object storage
Secrets
```

For especially sensitive application fields, consider application-level encryption.

Do not implement custom cryptography.

Use established libraries and algorithms.

---

# 78. Encryption Key Management

Do not store encryption keys:

```text
in source code
in database rows next to ciphertext
in frontend bundles
```

Prefer:

```text
KMS
Secret manager
HSM where required
```

Plan key rotation before implementing field-level encryption.

---

# 79. Database Migration Security

Review migrations for:

```text
Data loss
Permission changes
Sensitive field exposure
Index changes
Large table locks
Rollback limitations
```

Never run destructive migrations automatically in production without a controlled deployment process.

---

# 80. Seed Security

Development seed data must never contain real credentials.

Use obviously fake values.

Never commit:

```text
real admin passwords
real API keys
real customer data
```

Production bootstrap credentials should use a secure provisioning flow.

---

# 81. Production Configuration

Production configuration should be validated at startup.

Fail fast when required security settings are missing.

Examples:

```text
JWT_SECRET missing
DATABASE_URL missing
CORS origin missing
required encryption key missing
```

Do not silently use insecure defaults.

---

# 82. Development vs Production

Development may allow:

```text
localhost origins
debug logging
test credentials
mock services
```

Production must explicitly configure:

```text
HTTPS
secure cookies
real secrets
restricted CORS
safe logging
production database
monitoring
```

Never let development defaults silently become production behavior.

---

# 83. CI Security

CI should include:

```text
Typecheck
Lint
Tests
Dependency audit
Secret scanning
Build
Container scan
```

High-severity vulnerabilities should block deployment according to the organization's risk policy.

---

# 84. Secret Scanning

Use secret scanning for:

```text
Git commits
Pull requests
CI artifacts
Container layers
```

Potential tools include:

```text
Gitleaks
GitHub secret scanning
TruffleHog
```

Use one or more based on repository/platform requirements.

---

# 85. SAST

Consider static application security testing.

Look for:

```text
Injection
Unsafe eval
Path traversal
Hard-coded secrets
Weak cryptography
Authorization mistakes
Dangerous APIs
```

SAST should complement, not replace, code review and runtime testing.

---

# 86. Dependency Scanning

Scan:

```text
Node dependencies
Docker base images
OS packages
```

Prioritize vulnerabilities that are:

```text
reachable
exploitable
production-present
high severity
```

Do not blindly panic over every transitive advisory without evaluating exposure.

---

# 87. Security Code Review

Sensitive pull requests should receive focused review.

High-risk changes:

```text
Authentication
Authorization
RBAC
Password handling
Token handling
File uploads
External URL fetching
Payment logic
Database permissions
Secrets
Infrastructure
```

Use a security checklist rather than relying on intuition.

---

# 88. Security Testing

Minimum API security tests:

```text
Missing authentication → 401
Invalid authentication → 401
Missing permission → 403
Unauthorized resource → 403/404 as designed
Invalid input → 400/422
Duplicate resource → 409
Rate limit → 429
```

Also test:

```text
Privilege escalation
IDOR
Session revocation
Password reset
Refresh-token replay
Account suspension
```

---

# 89. RBAC Security Tests

Test:

```text
ADMIN cannot grant SUPER_ADMIN
SUPPORT cannot modify roles
User without users.delete cannot delete users
User with users.delete can delete allowed users
Removed permission immediately blocks access according to cache policy
Disabled user cannot authenticate
```

---

# 90. Authentication Security Tests

Test:

```text
Wrong password
Unknown user
Expired token
Invalid token
Wrong issuer
Wrong audience
Wrong token type
Revoked session
Refresh replay
Password reset reuse
```

---

# 91. Fuzz / Property Testing

For critical validation boundaries, consider fuzz testing.

Good candidates:

```text
Query parsing
JSON validation
File metadata
Pagination
Sorting
Search
Webhook verification
```

The goal is to discover unexpected parser and validation behavior.

---

# 92. Security Headers Testing

Verify production headers using automated checks.

Check:

```text
HSTS
CSP
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

Do not rely solely on local development behavior.

---

# 93. Penetration Testing

Before major production launch, perform a security assessment.

At minimum review:

```text
Authentication
RBAC
IDOR
XSS
CSRF
Injection
File upload
SSRF
Rate limiting
Session handling
Secrets
Admin APIs
```

For high-risk deployments, use an independent security review.

---

# 94. Incident Response

Define what happens when a security event occurs.

Example:

```text
Detect
  ↓
Contain
  ↓
Investigate
  ↓
Rotate credentials
  ↓
Revoke sessions
  ↓
Patch
  ↓
Recover
  ↓
Document
  ↓
Prevent recurrence
```

Have clear ownership for each step.

---

# 95. Credential Compromise

If a secret is exposed:

```text
1. Revoke/rotate immediately.
2. Identify affected systems.
3. Search logs for abuse.
4. Revoke affected sessions/tokens.
5. Patch the source of exposure.
6. Remove the secret from repository history where necessary.
7. Document the incident.
```

Do not merely delete the secret from the latest commit and assume the problem is solved.

---

# 96. JWT Key Compromise

If JWT signing keys are compromised:

```text
Rotate signing keys
Invalidate/reject affected tokens where possible
Update key verification strategy
Force re-authentication if required
Audit suspicious activity
```

Use a key ID (`kid`) and key rotation strategy if the architecture requires seamless key rollover.

---

# 97. Database Compromise

If database credentials are compromised:

```text
Rotate credentials
Restrict network access
Review database logs
Assess exposed data
Invalidate application credentials
Review application permissions
Investigate persistence
```

Do not assume changing only the database password closes the incident.

---

# 98. Logging and Monitoring Alerts

Recommended alerts:

```text
Spike in login failures
Spike in 403 responses
Spike in 429 responses
SUPER_ADMIN role assignment
SUPER_ADMIN login
Password reset spikes
Refresh-token replay
Disabled account login attempts
Unusual export volume
Database authentication failures
```

Alert thresholds should be tuned to reduce false positives.

---

# 99. Security Metrics

Useful metrics:

```text
Authentication failures
Authorization failures
Rate-limit events
Password reset requests
Session revocations
Refresh-token replay detections
Privileged role changes
Security configuration changes
```

Avoid high-cardinality metric labels.

---

# 100. Security Documentation

Keep documentation for:

```text
Authentication architecture
RBAC
Secrets
Deployment
Incident response
Backup/restore
Security configuration
Dependency updates
```

Security documentation must stay synchronized with implementation.

---

# 101. Developer Security Rules

Every developer should follow:

```text
Never commit secrets
Never log credentials
Never trust client permissions
Always validate input
Always use parameterized DB queries
Always protect sensitive routes
Never expose internal errors
Never disable security controls without review
```

---

# 102. Pull Request Security Checklist

For every PR:

```text
[ ] Does this introduce a new endpoint?
[ ] Is authentication required?
[ ] Is authorization required?
[ ] Are all inputs validated?
[ ] Is sensitive data exposed?
[ ] Are logs safe?
[ ] Are errors safe?
[ ] Are database queries parameterized?
[ ] Are new dependencies necessary?
[ ] Are secrets introduced?
[ ] Does the change affect CORS?
[ ] Does it affect cookies?
[ ] Does it affect CSRF?
[ ] Does it affect sessions?
[ ] Does it affect RBAC?
[ ] Does it require audit logging?
[ ] Are security tests included?
```

---

# 103. P0 Security Implementation Plan

Implement these first:

```text
1. Environment validation
2. HTTPS production configuration
3. Secure authentication
4. Password hashing
5. Refresh-token/session security
6. Central authorization/RBAC
7. Input validation
8. Secure error handling
9. CORS configuration
10. Rate limiting
11. Security headers
12. Safe logging
13. Audit logging
14. Secret management
15. Database access restrictions
16. Security tests
```

---

# 104. P1 Security Hardening

Next:

```text
MFA
Session management UI
Password reset hardening
Email verification
Security alerts
Dependency scanning
Secret scanning
Container scanning
SAST
Backup/restore verification
```

---

# 105. P2 Advanced Security

Later:

```text
WebAuthn/passkeys
Advanced anomaly detection
Centralized security event pipeline
Tamper-evident audit storage
Automated key rotation
Advanced threat detection
Dedicated security monitoring
Regular penetration testing
```

---

# 106. Security Definition of Done

Fastify-MasterApp should not be considered production-ready until:

- [ ] Authentication is secure.
- [ ] Passwords are strongly hashed.
- [ ] Sessions can be revoked.
- [ ] Refresh credentials are rotated.
- [ ] Refresh replay is handled.
- [ ] RBAC is enforced server-side.
- [ ] Privilege escalation is prevented.
- [ ] Object-level authorization is handled where required.
- [ ] All external input is validated.
- [ ] SQL/raw query usage is reviewed.
- [ ] CORS is restricted.
- [ ] CSRF strategy is documented.
- [ ] Security headers are configured.
- [ ] HTTPS is enforced.
- [ ] Rate limiting exists.
- [ ] Secrets are externally managed.
- [ ] Secrets are not present in frontend builds.
- [ ] Sensitive data is not logged.
- [ ] Audit logging covers privileged actions.
- [ ] Database is not publicly exposed.
- [ ] Application DB user has least privilege.
- [ ] Production backups exist.
- [ ] Restore has been tested.
- [ ] Dependency scanning is enabled.
- [ ] Secret scanning is enabled.
- [ ] Container scanning is enabled where containers are used.
- [ ] Security tests cover authentication and authorization.
- [ ] Incident response procedure exists.
- [ ] Critical admin actions are auditable.

---

# 107. Recommended Security Architecture

The target architecture is:

```text
                         INTERNET
                            │
                            ↓
                       HTTPS / TLS
                            │
                            ↓
                  Reverse Proxy / LB
                            │
                            ↓
                     ┌────────────┐
                     │  Fastify   │
                     │    API     │
                     └─────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ↓              ↓              ↓
      Authentication   Authorization   Validation
            │              │              │
            ↓              ↓              ↓
       Sessions          RBAC          TypeBox
            │              │              │
            └──────────────┼──────────────┘
                           ↓
                   Business Rules
                           │
                ┌──────────┴──────────┐
                ↓                     ↓
             Prisma                Workers
                │                     │
                ↓                     ↓
          PostgreSQL               Redis/Queue
```

Supporting security systems:

```text
Secrets Manager
      │
      ↓
Runtime configuration

Audit Logs
      │
      ↓
Security monitoring

CI/CD
 ├── Secret scanning
 ├── Dependency scanning
 ├── SAST
 └── Container scanning
```

---

# 108. Security Priority Matrix

| Area                      | Priority | Reason                            |
| ------------------------- | -------- | --------------------------------- |
| Authentication            | P0       | Identity boundary                 |
| RBAC                      | P0       | Privilege boundary                |
| Input validation          | P0       | Prevent malformed/malicious input |
| Secret management         | P0       | Prevent credential exposure       |
| Session security          | P0       | Protect authenticated accounts    |
| API authorization         | P0       | Prevent unauthorized actions      |
| Rate limiting             | P0       | Abuse protection                  |
| Error handling            | P0       | Prevent information leakage       |
| CORS/CSRF                 | P0       | Browser security                  |
| Security headers          | P0       | Browser hardening                 |
| Audit logs                | P1       | Accountability                    |
| MFA                       | P1       | Strong admin protection           |
| Dependency scanning       | P1       | Supply-chain security             |
| Container security        | P1       | Runtime hardening                 |
| Backup/restore            | P1       | Recovery                          |
| Pen testing               | P2       | Independent validation            |
| Advanced threat detection | P2       | Mature security posture           |

---

# 109. Final Security Principles

Fastify-MasterApp should follow these rules above all others:

```text
1. Never trust the client.
2. Authentication identifies the caller.
3. Authorization decides what the caller may do.
4. RBAC must be enforced by the API.
5. Resource authorization must be enforced where required.
6. Validate every external input.
7. Minimize sensitive data.
8. Never expose secrets.
9. Never log credentials.
10. Use least privilege.
11. Default deny.
12. Audit privileged actions.
13. Make security failures observable.
14. Rotate and revoke credentials.
15. Test security boundaries continuously.
```

The final security boundary should be:

```text
                  UNTRUSTED
                     │
                     ↓
              ┌──────────────┐
              │    Fastify   │
              │   API Edge   │
              └──────┬───────┘
                     │
              Validate Input
                     │
                     ↓
              Authenticate
                     │
                     ↓
              Authorize / RBAC
                     │
                     ↓
           Resource Authorization
                     │
                     ↓
              Business Rules
                     │
                     ↓
             Database / Services
                     │
                     ↓
                  TRUSTED
```

Security should be treated as an architectural property of Fastify-MasterApp, not as a collection of middleware added after the application is built.
