# Authentication Implementation Guide

## Fastify-MasterApp

> Complete production-oriented authentication implementation covering registration, login, logout, access tokens, refresh-token rotation, OTP verification, forgot password, password reset, email verification, sessions, account security, Admin authentication, rate limiting, auditing, testing, and operational recovery.

---

## 1. Purpose

This document is the implementation blueprint for authentication in Fastify-MasterApp.

It answers:

- How a user registers
- How email/identity verification works
- How OTPs are generated, stored, delivered, verified, expired, and invalidated
- How passwords are hashed and verified
- How login works
- How access and refresh tokens work
- How refresh-token rotation prevents replay
- How logout works
- How users log out from one device or all devices
- How forgot-password works
- How reset-password works
- How password changes work for authenticated users
- How email verification works
- How sessions are managed
- How authentication middleware works in Fastify
- How the React Admin frontend maintains authentication
- How expired access tokens are refreshed
- How refresh failures are handled
- How rate limiting and brute-force protection work
- How suspicious authentication activity is audited
- How authentication is tested
- How authentication is deployed safely in production

Authentication must be treated as a security subsystem rather than a collection of login endpoints.

---

# 2. Authentication Principles

The implementation follows these principles:

1. Authentication identifies the caller.
2. Authorization decides what the caller can do.
3. Passwords are never stored in plaintext.
4. OTPs are never stored as plaintext when avoidable.
5. Access tokens should be short-lived.
6. Refresh tokens should be rotated.
7. Refresh-token reuse must be detected.
8. Password reset tokens must be short-lived and single-use.
9. OTPs must expire and have attempt limits.
10. Authentication endpoints must be rate-limited.
11. Sensitive authentication events must be audited.
12. Authentication errors must not reveal sensitive account information.
13. Revocation must be possible.
14. Logout must invalidate the relevant session.
15. Password changes should revoke existing sessions when appropriate.
16. Administrative authentication should have stronger controls.
17. Authentication must fail closed when security state cannot be verified.
18. Secrets must never be committed to Git.
19. Tokens must not appear in logs.
20. Every security-sensitive path must be tested.

---

# 3. Authentication Scope

The authentication system should support the following lifecycle:

```text
Register
   |
   v
Email / OTP Verification
   |
   v
Account Activated
   |
   v
Login
   |
   +------------------+
   |                  |
   v                  v
Access Token      Refresh Token
   |                  |
   |                  v
   |             Rotate Refresh
   |                  |
   |                  v
   |             New Token Pair
   |
   v
Authenticated API Requests
   |
   +--------------------+
   |                    |
   v                    v
Logout              Password Change
   |                    |
   v                    v
Session Revoked     Sessions Revoked
```

Password recovery is a separate flow:

```text
Forgot Password
      |
      v
Request OTP / Reset Challenge
      |
      v
Verify OTP
      |
      v
Issue Short-Lived Reset Token
      |
      v
Reset Password
      |
      v
Revoke Existing Sessions
      |
      v
Login Again
```

---

# 4. Recommended Authentication Components

A clean implementation should separate authentication responsibilities.

Recommended API structure:

```text
apps/api/src/modules/auth/

├── auth.routes.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.repository.ts
├── auth.schemas.ts
├── auth.types.ts
├── auth.errors.ts
├── auth.constants.ts
│
├── services/
│   ├── password.service.ts
│   ├── token.service.ts
│   ├── refresh-token.service.ts
│   ├── otp.service.ts
│   ├── email-verification.service.ts
│   ├── password-reset.service.ts
│   ├── session.service.ts
│   └── authentication.service.ts
│
├── guards/
│   ├── authenticate.ts
│   ├── require-email-verification.ts
│   └── require-recent-authentication.ts
│
├── repositories/
│   ├── auth-session.repository.ts
│   ├── otp.repository.ts
│   └── password-reset.repository.ts
│
└── templates/
    ├── verification-email.ts
    ├── otp-email.ts
    └── password-reset-email.ts
```

The exact structure can differ, but responsibilities should remain separated.

---

# 5. Authentication Data Model

Authentication requires durable security state.

Recommended conceptual models:

```text
User
UserSession
RefreshToken
OtpChallenge
PasswordResetToken
EmailVerificationToken
PasswordHistory
LoginAttempt
AuthenticationEvent
```

Some of these can be combined depending on implementation.

---

# 6. User Model

A user should contain identity and account-state information.

Example conceptual model:

```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String?

  firstName       String?
  lastName        String?

  emailVerifiedAt DateTime?
  status          UserStatus @default(PENDING)

  failedLoginCount Int      @default(0)
  lockedUntil      DateTime?

  passwordChangedAt DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  sessions        UserSession[]
}
```

Do not store:

```text
password
plainOtp
plainResetToken
accessToken
refreshToken
```

---

# 7. User Status

Recommended statuses:

```text
PENDING
ACTIVE
SUSPENDED
DISABLED
LOCKED
```

The application must define the exact semantics.

For example:

```text
PENDING
  Account exists but required verification is incomplete.

ACTIVE
  User can authenticate normally.

SUSPENDED
  Authentication may be blocked by an administrator or security process.

DISABLED
  Account is intentionally disabled.

LOCKED
  Temporary security lock after suspicious activity or excessive failures.
```

Do not use account status as a replacement for authorization.

---

# 8. Authentication Session Model

Each authenticated login should create a server-side session.

Example:

```prisma
model UserSession {
  id               String   @id @default(uuid())
  userId           String

  refreshTokenHash String   @unique

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  expiresAt        DateTime
  revokedAt        DateTime?

  lastUsedAt       DateTime?
  ipAddress        String?
  userAgent        String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@index([revokedAt])
}
```

The database should store a hash/fingerprint of the refresh token rather than the raw token.

---

# 9. Why Server-Side Sessions Matter

JWTs can be self-contained, but authentication still needs revocation state.

Server-side session records allow:

- Logout
- Logout all devices
- Refresh-token rotation
- Refresh-token reuse detection
- Password-change revocation
- Account suspension
- Security incident response
- Device/session management
- Administrative session revocation

---

# 10. Password Security

Passwords must be hashed using a password hashing algorithm designed for password storage.

Preferred choices:

```text
Argon2id
```

or an appropriately configured:

```text
bcrypt
```

Never use:

```text
SHA-256(password)
MD5(password)
SHA-1(password)
AES(password)
Base64(password)
```

Password hashing should be handled by one service.

Example:

```text
PasswordService

hash(password)
verify(password, passwordHash)
validatePolicy(password)
```

Routes and controllers must not implement hashing directly.

---

# 11. Password Policy

Define a clear password policy.

Recommended minimum:

```text
Minimum length: 12 characters
```

Avoid excessive composition requirements that encourage predictable passwords.

Reject:

- known compromised passwords
- obviously weak passwords
- passwords containing the user's email when appropriate
- passwords equal to common examples

Do not require arbitrary password changes on a fixed schedule unless there is a security reason.

---

# 12. Password Hash Upgrade

Password hashes may need upgrading over time.

Flow:

```text
Login
  |
  v
Verify old hash
  |
  v
Hash valid?
  |
  +---- yes
  |
  v
Is hash configuration outdated?
  |
  +---- yes
  |
  v
Generate stronger hash
  |
  v
Update passwordHash
```

This allows security improvements without forcing every user through a password reset.

---

# 13. Registration

Endpoint:

```http
POST /api/v1/auth/register
```

Request:

```json
{
  "email": "user@example.com",
  "password": "strong-password",
  "firstName": "John",
  "lastName": "Doe"
}
```

Recommended registration flow:

```text
Request
  |
  v
Validate request
  |
  v
Normalize email
  |
  v
Check rate limit
  |
  v
Check account state
  |
  v
Validate password
  |
  v
Hash password
  |
  v
Create user
  |
  v
Create verification challenge
  |
  v
Send verification OTP/email
  |
  v
Return safe response
```

---

# 14. Email Normalization

Normalize emails consistently.

At minimum:

```text
trim()
lowercase()
```

Do not arbitrarily modify provider-specific email semantics such as removing dots or plus-addressing unless that behavior is explicitly intended and understood.

The normalized email should be used consistently for account lookup.

---

# 15. Registration Duplicate Handling

Avoid revealing whether an account exists when doing so creates an account-enumeration risk.

For example, registration may respond with a generic message:

```json
{
  "message": "If the account can be registered, verification instructions will be provided."
}
```

For internal/admin contexts, more specific responses may be acceptable.

---

# 16. Email Verification

Email verification establishes that the user controls the email address.

Recommended flow:

```text
Register
   |
   v
Create verification challenge
   |
   v
Send email
   |
   v
User enters OTP
   |
   v
Verify OTP
   |
   v
Mark emailVerifiedAt
   |
   v
Activate account
```

Endpoint:

```http
POST /api/v1/auth/verify-email
```

Request:

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

---

# 17. OTP Design

OTP should be:

- short-lived
- single-purpose
- single-use
- attempt-limited
- rate-limited
- server-generated
- cryptographically random

Recommended numeric OTP:

```text
6 digits
```

Possible lifetime:

```text
5 minutes
```

Do not reuse OTPs.

---

# 18. OTP Storage

Do not store:

```text
123456
```

directly in the database.

Instead:

```text
OTP
 |
 v
HMAC/hash
 |
 v
Database
```

Store:

```text
challengeId
userId
purpose
otpHash
expiresAt
attemptCount
maxAttempts
consumedAt
createdAt
```

---

# 19. OTP Purpose

OTP challenges must have a purpose.

Example:

```text
EMAIL_VERIFICATION
PASSWORD_RESET
LOGIN_VERIFICATION
CHANGE_EMAIL
CHANGE_PHONE
MFA
```

Never allow an OTP generated for one purpose to satisfy another purpose.

For example:

```text
PASSWORD_RESET OTP
```

must not be accepted by:

```text
EMAIL_VERIFICATION
```

---

# 20. OTP Database Model

Example:

```prisma
model OtpChallenge {
  id           String   @id @default(uuid())
  userId       String?
  destination  String
  purpose      OtpPurpose

  codeHash     String

  attempts     Int      @default(0)
  maxAttempts  Int      @default(5)

  expiresAt    DateTime
  consumedAt   DateTime?

  createdAt    DateTime @default(now())

  @@index([userId, purpose])
  @@index([expiresAt])
}
```

---

# 21. OTP Verification

Verification flow:

```text
Receive OTP
   |
   v
Validate request
   |
   v
Find active challenge
   |
   v
Expired?
  / \
yes  no
 |    |
reject |
      v
Increment attempt
      |
      v
Compare hash
    /   \
 wrong  correct
   |       |
   v       v
reject   consume
           |
           v
        continue
```

Important:

> Consume the OTP so it cannot be reused.

---

# 22. OTP Attempt Protection

If:

```text
maxAttempts = 5
```

then after five invalid attempts:

```text
challenge = invalid
```

Do not continue accepting guesses.

Also apply:

```text
IP rate limit
email/user rate limit
purpose-specific rate limit
```

---

# 23. OTP Resend

Endpoint:

```http
POST /api/v1/auth/otp/resend
```

Flow:

```text
Request resend
   |
   v
Rate limit
   |
   v
Invalidate previous active challenge
   |
   v
Generate new OTP
   |
   v
Store hash
   |
   v
Send OTP
```

Use a resend cooldown such as:

```text
30–60 seconds
```

The exact value should be configurable.

---

# 24. OTP Enumeration Protection

Do not reveal:

```text
User does not exist
OTP does not exist
Email is not registered
```

unless the endpoint's threat model explicitly allows it.

Prefer:

```text
"If the request is valid, a verification code has been sent."
```

---

# 25. Login

Endpoint:

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Flow:

```text
Request
  |
  v
Rate limit
  |
  v
Validate input
  |
  v
Normalize email
  |
  v
Find user
  |
  v
Check account status
  |
  v
Verify password
  |
  +---- failure ---> record attempt
  |
  v
Check verification requirements
  |
  v
Create session
  |
  v
Issue access token
  |
  v
Issue refresh token
  |
  v
Return authentication response
```

---

# 26. Failed Login

Never return:

```text
Email does not exist
```

for one case and:

```text
Wrong password
```

for another.

Prefer:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials."
  }
}
```

This reduces account enumeration.

---

# 27. Login Brute-Force Protection

Login should have layered protection.

Example:

```text
IP limit
+
email/account limit
+
device/session heuristics
+
temporary lockout
+
security event logging
```

Do not rely only on IP rate limiting because attackers can distribute requests across many IPs.

---

# 28. Temporary Account Lock

Example:

```text
5 failed attempts
      |
      v
Temporary lock
      |
      v
5–15 minute delay
```

The exact policy should be configurable.

Avoid permanent account lockout based solely on password failures because attackers could weaponize it to deny access to legitimate users.

---

# 29. Login Success

On successful login:

```text
Reset failed-login counter
Record successful login
Create session
Generate refresh token
Generate access token
Return token response
```

Audit:

```text
AUTH_LOGIN_SUCCESS
```

Do not log:

```text
password
access token
refresh token
OTP
reset token
```

---

# 30. Access Token

Access tokens should be short-lived.

Example:

```text
15 minutes
```

Claims should be minimal.

Example:

```json
{
  "sub": "user-id",
  "sid": "session-id",
  "iat": 1730000000,
  "exp": 1730000900
}
```

Avoid putting large authorization data into the token.

---

# 31. JWT Claims

Recommended claims:

```text
sub
sid
iat
exp
jti (when useful)
iss
aud
```

Use:

```text
sub = user ID
sid = authentication session ID
```

Do not include:

```text
password
passwordHash
refresh token
OTP
private profile information
large permission lists
sensitive business data
```

---

# 32. JWT Verification

Every protected request should verify:

```text
signature
algorithm
issuer
audience
expiration
required claims
```

Do not accept arbitrary algorithms.

The accepted algorithm must be explicitly configured.

---

# 33. Refresh Token

Refresh tokens provide a way to obtain new access tokens without requiring the user to log in again.

Example:

```text
Access token: 15 minutes
Refresh token: 7–30 days
```

Exact values should be configurable.

---

# 34. Refresh Token Rotation

Refresh tokens should be rotated.

Flow:

```text
Client sends refresh token A
          |
          v
Validate token A
          |
          v
Validate session
          |
          v
Invalidate token A
          |
          v
Generate token B
          |
          v
Store hash(B)
          |
          v
Return access token + token B
```

Token A must no longer be valid.

---

# 35. Refresh Token Reuse Detection

Critical security behavior:

```text
Token A
  |
  v
Used successfully
  |
  v
Token B issued
  |
  v
Attacker uses Token A again
  |
  v
Reuse detected
  |
  v
Revoke session/token family
  |
  v
Require fresh login
```

This protects against stolen refresh tokens.

---

# 36. Refresh Endpoint

Endpoint:

```http
POST /api/v1/auth/refresh
```

Request:

```json
{
  "refreshToken": "..."
}
```

Prefer secure HttpOnly cookies for browser-based refresh tokens where the architecture supports them.

---

# 37. Refresh Token Storage

For browser applications, a recommended model is:

```text
Access token:
  short-lived
  kept in application memory where practical

Refresh token:
  Secure
  HttpOnly
  SameSite cookie
```

Avoid storing long-lived refresh tokens in:

```text
localStorage
sessionStorage
URL parameters
```

because XSS can expose browser storage.

---

# 38. CSRF and Cookie Authentication

If refresh/session cookies are used, explicitly address CSRF.

Controls may include:

```text
SameSite cookies
CSRF tokens where required
Origin/Referer validation
strict CORS
POST-only state-changing endpoints
```

Do not assume SameSite alone is sufficient for every deployment architecture.

---

# 39. Logout

Endpoint:

```http
POST /api/v1/auth/logout
```

Flow:

```text
Authenticate session
      |
      v
Revoke current session
      |
      v
Invalidate refresh token
      |
      v
Clear cookie
      |
      v
Audit logout
```

Access tokens that have already been issued may remain technically valid until expiration unless you add an active revocation mechanism.

Therefore access tokens should remain short-lived.

---

# 40. Logout All Devices

Endpoint:

```http
POST /api/v1/auth/logout-all
```

Flow:

```text
Authenticated user
      |
      v
Find all sessions
      |
      v
Revoke all sessions
      |
      v
Clear current client session
```

Useful for:

- password compromise
- security incident response
- password changes
- account recovery

---

# 41. Session Management

Authenticated users should eventually be able to view:

```text
Current device
Other devices
Last used
Created at
Approximate IP
Browser/device information
```

Possible endpoints:

```http
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:sessionId
POST   /api/v1/auth/logout-all
```

Users must only be able to manage their own sessions unless an administrator has explicit permission.

---

# 42. Forgot Password

Endpoint:

```http
POST /api/v1/auth/forgot-password
```

Request:

```json
{
  "email": "user@example.com"
}
```

Flow:

```text
Request
  |
  v
Rate limit
  |
  v
Normalize email
  |
  v
Lookup user
  |
  +---- missing ----+
  |                 |
  |                 v
  |            same response
  |
  v
Create reset challenge
  |
  v
Generate OTP
  |
  v
Store hash + expiry
  |
  v
Send reset OTP
  |
  v
Return generic response
```

The endpoint should not reveal whether the email belongs to an account.

---

# 43. Forgot Password Response

Use a generic response:

```json
{
  "message": "If an account exists for this email, password reset instructions will be sent."
}
```

Do not return:

```json
{
  "exists": true
}
```

---

# 44. Password Reset OTP

Password reset OTP should have:

```text
Purpose = PASSWORD_RESET
Expiry = short
Max attempts = limited
Single use = yes
Rate limit = yes
```

Never reuse email-verification OTPs for password resets.

---

# 45. Verify Password Reset OTP

Endpoint:

```http
POST /api/v1/auth/password-reset/verify
```

Request:

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

If valid:

```text
consume OTP
      |
      v
issue short-lived reset token
```

The reset token should not itself grant normal API access.

---

# 46. Password Reset Token

The reset token represents:

```text
permission to perform exactly one password reset
```

It should be:

- short-lived
- single-use
- tied to a user
- tied to a reset challenge/session
- unusable for normal authenticated API access

Example lifetime:

```text
10 minutes
```

---

# 47. Reset Password

Endpoint:

```http
POST /api/v1/auth/password-reset/confirm
```

Request:

```json
{
  "resetToken": "...",
  "newPassword": "new-strong-password"
}
```

Flow:

```text
Validate reset token
       |
       v
Validate password policy
       |
       v
Hash new password
       |
       v
Update user password
       |
       v
Mark reset token consumed
       |
       v
Revoke existing sessions
       |
       v
Invalidate password reset challenges
       |
       v
Record security event
       |
       v
Return success
```

---

# 48. Password Reset Must Revoke Sessions

After successful password reset:

```text
revoke all active sessions
```

This prevents an attacker who already obtained a refresh token from maintaining access after the password has been changed.

Depending on the threat model, additional security actions may be required.

---

# 49. Password History

If the application requires prevention of immediate password reuse, maintain password history.

Example:

```prisma
model PasswordHistory {
  id           String   @id @default(uuid())
  userId       String
  passwordHash String
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
}
```

Do not store plaintext historical passwords.

---

# 50. Authenticated Password Change

Endpoint:

```http
POST /api/v1/auth/change-password
```

Request:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

Flow:

```text
Authenticate user
       |
       v
Verify current password
       |
       v
Validate new password
       |
       v
Hash new password
       |
       v
Update password
       |
       v
Revoke sessions
       |
       v
Create new session if desired
```

Require recent authentication for sensitive changes where appropriate.

---

# 51. Recent Authentication

Some sensitive actions should require recent authentication.

Examples:

```text
Change password
Change email
Disable MFA
Generate recovery codes
Delete account
Change critical security settings
```

Possible policy:

```text
Authentication age < 10 minutes
```

Otherwise require:

```text
password confirmation
OTP
MFA
```

---

# 52. Change Email

Recommended flow:

```text
Authenticated user
      |
      v
Request email change
      |
      v
Recent-authentication check
      |
      v
Validate new email
      |
      v
Send verification challenge
      |
      v
Verify new email
      |
      v
Change email
```

Do not immediately trust an unverified new email.

---

# 53. Account Email Verification

The account should contain:

```text
emailVerifiedAt
```

Before verification:

```text
emailVerifiedAt = null
```

After successful verification:

```text
emailVerifiedAt = current timestamp
```

The application can require verified email before granting certain capabilities.

---

# 54. Resend Verification

Endpoint:

```http
POST /api/v1/auth/resend-verification
```

Controls:

```text
rate limit
cooldown
OTP expiry
single active challenge
generic response
```

---

# 55. Authentication Middleware

Fastify protected route:

```text
Request
  |
  v
authenticate()
  |
  v
Extract token
  |
  v
Verify JWT
  |
  v
Load session/user as required
  |
  v
Attach auth context
  |
  v
Route handler
```

Example conceptual request context:

```ts
request.auth = {
  userId,
  sessionId,
};
```

Do not attach passwords, refresh tokens, or sensitive authentication secrets.

---

# 56. Authentication Hook

The hook should:

1. Read credential.
2. Validate credential format.
3. Verify signature.
4. Verify issuer.
5. Verify audience.
6. Verify expiration.
7. Extract `sub`.
8. Extract `sid`.
9. Validate expected claims.
10. Attach safe authentication context.

---

# 57. Authentication vs Authorization

Authentication:

```text
Who are you?
```

Authorization:

```text
What are you allowed to do?
```

Example:

```text
authenticate()
      |
      v
userId = 123
      |
      v
authorize("users.read")
      |
      v
allow / deny
```

Never assume that authentication means authorization.

---

# 58. RBAC Integration

Protected routes should eventually look conceptually like:

```text
authenticate
   |
   v
requirePermission("users.read")
   |
   v
handler
```

For mutations:

```text
authenticate
   |
   v
requirePermission("users.update")
   |
   v
resource authorization
   |
   v
handler
```

Authentication should not contain business-specific permission logic.

---

# 59. Access Token Expiration

When an access token expires:

```text
API
 |
 v
401 TOKEN_EXPIRED
 |
 v
Admin API client
 |
 v
refresh()
 |
 v
retry original request once
```

Do not retry indefinitely.

---

# 60. Refresh Single-Flight

The Admin frontend must avoid this problem:

```text
10 requests expire simultaneously
        |
        v
10 refresh requests
```

Instead:

```text
Request A ----+
Request B ----+----> shared refresh promise
Request C ----+
Request D ----+
```

Only one refresh request should run at a time.

---

# 61. Refresh Failure

If refresh fails because the session is invalid:

```text
clear authentication state
clear protected client cache
redirect to login
```

Do not repeatedly retry a rejected refresh token.

---

# 62. Admin Authentication Flow

Recommended browser flow:

```text
Login
  |
  v
Receive access credential
  |
  v
Store short-lived credential safely
  |
  v
Refresh credential held in HttpOnly cookie
  |
  v
Authenticated Admin API requests
```

Use:

```text
TanStack Query
```

for server state and a small auth/session store for client authentication state.

---

# 63. Admin Route Protection

Frontend routes:

```text
/public
/login
/forgot-password
/reset-password
/verify-email
```

Protected routes:

```text
/dashboard
/users
/roles
/audit-logs
/settings
```

Conceptual route guard:

```text
Is authenticated?
   |
   +---- no ---> /login
   |
   v
Is verified?
   |
   +---- no ---> /verify-email
   |
   v
Does permission exist?
   |
   +---- no ---> /403
   |
   v
Render page
```

---

# 64. Forgot Password Admin UX

Flow:

```text
Login page
   |
   v
Forgot password?
   |
   v
Enter email
   |
   v
OTP screen
   |
   v
Verify OTP
   |
   v
New password
   |
   v
Success
   |
   v
Login
```

Include:

```text
OTP expiry countdown
Resend cooldown
attempt error
password requirements
password visibility toggle
```

Do not expose account existence.

---

# 65. Reset Password UX

The reset-password page should:

- validate password locally
- show password requirements
- confirm matching passwords
- submit only once per deliberate action
- handle expired reset tokens
- handle already-consumed reset tokens
- redirect to login after successful reset

Do not put the new password into query parameters.

---

# 66. Authentication API Endpoints

Recommended endpoint set:

```text
POST /api/v1/auth/register

POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
POST /api/v1/auth/refresh

POST /api/v1/auth/verify-email
POST /api/v1/auth/resend-verification

POST /api/v1/auth/otp/resend
POST /api/v1/auth/otp/verify

POST /api/v1/auth/forgot-password
POST /api/v1/auth/password-reset/verify
POST /api/v1/auth/password-reset/confirm

POST /api/v1/auth/change-password

GET  /api/v1/auth/me

GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:sessionId
```

Optional future endpoints:

```text
POST /api/v1/auth/mfa/enroll
POST /api/v1/auth/mfa/verify
POST /api/v1/auth/mfa/disable

POST /api/v1/auth/recovery-codes/regenerate

GET /api/v1/auth/security-events
```

---

# 67. `GET /auth/me`

Endpoint:

```http
GET /api/v1/auth/me
```

Purpose:

```text
Determine current authenticated identity.
```

Response should contain safe user information:

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "emailVerified": true,
  "firstName": "John",
  "lastName": "Doe"
}
```

Do not return:

```text
passwordHash
refreshToken
OTP
internal secrets
security-sensitive database fields
```

---

# 68. Token Response

If tokens are returned in the response body:

```json
{
  "accessToken": "...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

Prefer keeping long-lived refresh credentials out of JavaScript-readable storage for browser clients.

---

# 69. Cookie Configuration

For refresh cookies:

```text
HttpOnly = true
Secure = true in production
SameSite = Lax or Strict where compatible
Path = authentication refresh path where practical
```

Cookie domain should be narrowly scoped.

Avoid broad domain cookies unless necessary.

---

# 70. CORS

Authentication requires strict CORS.

Example policy:

```text
Allowed origins:
  explicit Admin application origins
```

Avoid:

```text
Access-Control-Allow-Origin: *
```

for credentialed browser authentication.

---

# 71. HTTPS

Production authentication must use HTTPS.

Never send:

```text
password
OTP
reset token
session credential
```

over plaintext HTTP.

Local development may use HTTP where acceptable, but production configuration must force secure transport.

---

# 72. CSRF

If cookies are used for authentication, protect state-changing operations against CSRF.

Relevant endpoints:

```text
logout
change password
change email
reset password
delete session
account settings
```

Use the appropriate combination of:

```text
SameSite cookies
CSRF token
Origin checks
strict CORS
```

---

# 73. Rate Limiting Matrix

Authentication endpoints should have different limits.

| Endpoint            | Recommended protection |
| ------------------- | ---------------------- |
| Register            | IP + identity          |
| Login               | IP + account           |
| Refresh             | session/token          |
| OTP send            | IP + destination       |
| OTP verify          | IP + challenge         |
| Forgot password     | IP + destination       |
| Reset verify        | IP + challenge         |
| Reset confirm       | reset token            |
| Change password     | authenticated user     |
| Resend verification | user/email + IP        |

Exact limits should be configurable and tuned using telemetry.

---

# 74. Redis for Distributed Authentication Controls

When multiple API instances exist:

```text
API 1 ----+
API 2 ----+
API 3 ----+----> Redis
```

Use Redis for:

- rate limits
- OTP attempt counters where appropriate
- distributed locks
- refresh single-flight
- temporary authentication state
- abuse detection

PostgreSQL remains the durable source of authentication truth.

---

# 75. OTP and Redis

OTP state may use PostgreSQL or Redis depending on requirements.

Recommended durable model:

```text
PostgreSQL:
  challenge lifecycle
  auditability
  security state
```

Redis:

```text
fast counters
rate limiting
cooldowns
short-lived coordination
```

Do not make Redis the only source of critical security state unless the failure model explicitly supports it.

---

# 76. Email Delivery

Authentication emails may include:

```text
verification OTP
password reset OTP
security notification
password changed notification
new login notification
```

Use a background queue for email delivery when appropriate:

```text
API
 |
 v
Transactional state
 |
 v
Outbox
 |
 v
BullMQ
 |
 v
Email worker
 |
 v
Email provider
```

---

# 77. Do Not Block Critical API Requests on Email Provider

Avoid:

```text
register request
  |
  v
wait 10 seconds for email provider
  |
  v
response
```

Prefer:

```text
register
  |
  v
commit account/challenge
  |
  v
queue email
  |
  v
respond
```

Authentication state and delivery state should be separate.

---

# 78. Email Delivery Failure

If the email provider fails:

```text
challenge remains valid
email job retries
failure is observable
```

Do not generate a new OTP on every automatic retry.

The same challenge can be delivered again if the security policy permits.

---

# 79. Transactional Registration

Registration should use a transaction for database state:

```text
Create user
Create verification challenge
Create outbox event
```

Then commit.

After commit:

```text
worker sends verification email
```

This prevents:

```text
email sent
but user creation rolled back
```

---

# 80. Password Reset Transaction

Password reset should atomically perform:

```text
update password
consume reset token
revoke sessions
invalidate reset challenges
update passwordChangedAt
```

Where practical, these operations should occur inside one database transaction.

---

# 81. Security Events

Record authentication events.

Examples:

```text
AUTH_REGISTERED
AUTH_EMAIL_VERIFIED

AUTH_LOGIN_SUCCESS
AUTH_LOGIN_FAILURE
AUTH_LOGIN_LOCKED

AUTH_LOGOUT
AUTH_LOGOUT_ALL

AUTH_REFRESH_SUCCESS
AUTH_REFRESH_FAILURE
AUTH_REFRESH_REUSE_DETECTED

AUTH_OTP_SENT
AUTH_OTP_FAILED
AUTH_OTP_VERIFIED
AUTH_OTP_EXPIRED

AUTH_PASSWORD_RESET_REQUESTED
AUTH_PASSWORD_RESET_VERIFIED
AUTH_PASSWORD_RESET_COMPLETED

AUTH_PASSWORD_CHANGED

AUTH_SESSION_REVOKED
AUTH_ACCOUNT_SUSPENDED
```

---

# 82. Audit Logging

Security events should include:

```text
event
actor/user ID where known
target user ID where applicable
session ID where safe
request ID
timestamp
IP metadata where permitted
user-agent metadata where permitted
result
reason/error code
```

Never include:

```text
password
OTP plaintext
access token
refresh token
reset token
full authorization header
```

---

# 83. Authentication Logging

Good:

```text
authentication failed
reason=INVALID_CREDENTIALS
userIdHash=...
requestId=...
```

Bad:

```text
password=secret123
token=eyJ...
otp=123456
```

---

# 84. Login Notifications

For higher-security deployments, notify users about:

```text
new login
new device
password changed
email changed
MFA changed
session revoked
```

Notifications should not contain credentials.

---

# 85. Suspicious Login Detection

Possible signals:

```text
many failed attempts
impossible travel
new device
new country
new ASN
unusual request rate
refresh-token reuse
repeated OTP failures
```

Do not automatically block users solely from one weak signal.

Use risk scoring and step-up authentication where appropriate.

---

# 86. MFA / OTP Distinction

Do not confuse:

```text
email verification OTP
```

with:

```text
MFA
```

Email verification proves control of an email address.

MFA provides an additional authentication factor.

Future MFA can use:

```text
TOTP
WebAuthn/passkeys
hardware security keys
recovery codes
```

SMS should be treated carefully because of SIM-swap risks.

---

# 87. Recommended Future MFA Flow

```text
Password
   |
   v
Primary authentication
   |
   v
MFA required?
   |
   +---- no ---> session
   |
   v
Challenge
   |
   v
Verify MFA
   |
   v
Session
```

MFA challenge must not itself become a normal authenticated session until all required factors succeed.

---

# 88. Recovery Codes

If MFA is implemented, generate recovery codes.

Properties:

```text
random
single-use
hashed in database
limited quantity
revocable
audited
```

Never display recovery codes after initial generation unless the product explicitly provides a secure re-display flow.

---

# 89. Authentication Error Contract

Use stable error codes.

Examples:

```text
INVALID_CREDENTIALS
ACCOUNT_DISABLED
ACCOUNT_SUSPENDED
EMAIL_NOT_VERIFIED
TOKEN_EXPIRED
TOKEN_INVALID
REFRESH_TOKEN_REUSED
SESSION_REVOKED
OTP_INVALID
OTP_EXPIRED
OTP_ATTEMPTS_EXCEEDED
RESET_TOKEN_INVALID
RESET_TOKEN_EXPIRED
RESET_TOKEN_USED
PASSWORD_POLICY_FAILED
RECENT_AUTH_REQUIRED
RATE_LIMITED
```

The client should branch on codes rather than fragile message strings.

---

# 90. HTTP Status Codes

Recommended:

```text
400
Invalid request / malformed input

401
Authentication missing or invalid

403
Authenticated but not authorized

404
Resource intentionally hidden or does not exist

409
Conflict where appropriate

422
Validation/business input failure if chosen consistently

429
Rate limited

500
Unexpected internal failure
```

Do not use `403` for an unauthenticated request when `401` is appropriate.

---

# 91. Account Enumeration

Protect:

```text
login
register
forgot password
resend verification
```

from unnecessary enumeration.

Use generic responses where appropriate.

However, do not make the UI misleading in ways that harm legitimate users.

The security posture should be chosen based on the application's threat model.

---

# 92. Password Reset Enumeration

Bad:

```text
Email not found.
```

Preferred:

```text
If an account exists for that address, reset instructions will be sent.
```

The same external response should be returned for both existing and nonexistent accounts where enumeration resistance is required.

---

# 93. Reset Token Security

Reset tokens must be:

```text
random
unpredictable
single-use
short-lived
scoped
revocable
```

Use sufficient entropy.

Never generate tokens using:

```text
Math.random()
timestamp
userId
email
incrementing IDs
```

---

# 94. Reset Token Hashing

Prefer:

```text
raw reset token
       |
       v
HMAC/hash
       |
       v
database
```

The raw token is sent only to the user.

If the database is compromised, attackers should not immediately obtain usable reset tokens.

---

# 95. Token Families

Refresh tokens should belong to a session/token family.

Example:

```text
Session A
   |
   +-- Refresh A
   |
   +-- Refresh B
   |
   +-- Refresh C
```

If refresh-token reuse is detected:

```text
revoke Session A
```

This is stronger than revoking only the reused token.

---

# 96. Session Revocation Reasons

Store a reason where useful:

```text
USER_LOGOUT
LOGOUT_ALL
PASSWORD_CHANGED
PASSWORD_RESET
ADMIN_REVOKED
TOKEN_REUSE
ACCOUNT_SUSPENDED
SECURITY_INCIDENT
EXPIRED
```

This improves investigation and support.

---

# 97. Admin Session Revocation

Authorized administrators may need to revoke a user's sessions.

Endpoint:

```http
DELETE /api/v1/admin/users/:userId/sessions
```

This must require explicit permissions.

Example:

```text
users.sessions.revoke
```

Every administrative session revocation must be audited.

---

# 98. Super Admin Security

Do not create unrestricted administrator access casually.

High-risk operations should eventually support:

```text
MFA
recent authentication
step-up authentication
audit logging
break-glass controls
```

---

# 99. Authentication Configuration

Example environment configuration:

```env
JWT_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

JWT_ISSUER=
JWT_AUDIENCE=

PASSWORD_MIN_LENGTH=12

OTP_LENGTH=6
OTP_EXPIRES_IN=5m
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN=60

PASSWORD_RESET_TOKEN_EXPIRES_IN=10m

SESSION_MAX_AGE=30d

AUTH_LOGIN_RATE_LIMIT=
AUTH_OTP_RATE_LIMIT=
AUTH_PASSWORD_RESET_RATE_LIMIT=

CORS_ORIGINS=
```

Secrets must never be committed.

---

# 100. Secret Management

Production secrets should come from:

```text
secret manager
environment injection
Kubernetes Secret
cloud secret service
```

Avoid:

```text
.env committed to Git
hardcoded JWT secret
hardcoded SMTP password
hardcoded API key
```

---

# 101. JWT Key Rotation

Long-lived systems should support key rotation.

Prefer asymmetric signing when the deployment architecture benefits from it.

Conceptual model:

```text
Current signing key
       |
       v
Issue tokens

Old verification keys
       |
       v
Continue validating unexpired tokens
```

Key IDs can identify signing keys.

---

# 102. Authentication Clock Handling

JWT validation depends on accurate server clocks.

Production infrastructure should use time synchronization.

Allow only a small configured clock tolerance where necessary.

Do not use large clock-skew windows that undermine expiration.

---

# 103. Database Constraints

Authentication tables require database-level protections.

Examples:

```text
unique user email
unique refresh token hash
indexes on userId
indexes on expiration
indexes on session state
```

Application validation is not enough.

---

# 104. Cleanup Jobs

Expired authentication state should be cleaned.

Possible jobs:

```text
delete expired OTP challenges
delete expired reset tokens
delete expired sessions
archive old login attempts
archive security events according to policy
```

Cleanup must not break active security controls.

---

# 105. Authentication Job Architecture

Recommended:

```text
apps/api
    |
    +---- authentication
    |
    +---- outbox
              |
              v
         BullMQ / Redis
              |
              +---- email worker
              +---- notification worker
              +---- cleanup worker
```

Workers must be idempotent.

---

# 106. Idempotent Password Reset Email

A retry must not:

```text
invalidate a valid reset challenge unexpectedly
```

unless the product explicitly intends that behavior.

Prefer a stable challenge lifecycle.

---

# 107. Authentication Concurrency

Protect against races.

Example:

```text
Two refresh requests
        |
        v
same refresh token
```

Only one should successfully rotate the token.

The second should either:

```text
detect already-consumed token
```

or be handled using a short concurrency mechanism.

A race must not result in two valid replacement tokens from one refresh token.

---

# 108. Database Transaction for Refresh Rotation

Conceptual:

```text
BEGIN

find session
lock/check current refresh token

verify token

mark old token/session state

create replacement token state

COMMIT
```

The exact implementation depends on the session model.

---

# 109. Refresh Token Reuse Response

When reuse is detected:

```text
return safe authentication error
```

and internally:

```text
revoke token family/session
record security event
raise security metric
```

Do not expose investigation details to the attacker.

---

# 110. Password Reset and Existing Refresh Tokens

Password reset should revoke existing sessions.

Reason:

```text
password compromised
+
attacker has existing session
```

Without revocation:

```text
password reset
      |
      v
attacker session remains active
```

This defeats part of the recovery mechanism.

---

# 111. Password Change and Sessions

A reasonable default:

```text
password change
    |
    v
revoke all other sessions
    |
    v
keep current session only if security policy allows
```

A stricter policy:

```text
revoke all sessions
    |
    v
require fresh login
```

Choose explicitly and document the decision.

---

# 112. Account Suspension

When an account becomes suspended:

```text
prevent new login
+
revoke active sessions
```

If access tokens are short-lived, they naturally expire soon.

For immediate revocation, add a server-side authorization/session check or a revocation mechanism.

---

# 113. Immediate Revocation

If the product requires immediate invalidation of access tokens:

```text
JWT
 |
 v
sid
 |
 v
session lookup
 |
 v
revoked?
```

Tradeoff:

```text
JWT-only validation
    = faster

JWT + session validation
    = stronger immediate revocation
```

Choose based on risk and performance requirements.

---

# 114. Device Tracking

Session metadata may include:

```text
user agent
IP
createdAt
lastUsedAt
```

Avoid storing excessive device fingerprints.

Treat IP and user-agent information as potentially sensitive operational data.

---

# 115. Authentication Privacy

Authentication data should have retention policies.

Potentially sensitive:

```text
IP addresses
user agents
login history
security events
reset requests
failed attempts
```

Retention should follow:

```text
security need
legal requirements
privacy requirements
product policy
```

---

# 116. Authentication Metrics

Track:

```text
auth_login_success_total
auth_login_failure_total
auth_login_locked_total

auth_register_total
auth_email_verification_total

auth_otp_sent_total
auth_otp_failed_total
auth_otp_verified_total

auth_password_reset_requested_total
auth_password_reset_completed_total

auth_refresh_success_total
auth_refresh_failure_total
auth_refresh_reuse_total

auth_logout_total
auth_session_revoked_total
```

Never put:

```text
email
user ID
token
OTP
password
```

into metric labels.

---

# 117. Authentication Alerts

Potential alerts:

```text
High login failure rate
High OTP failure rate
Refresh-token reuse spike
Password reset spike
Authentication latency spike
Email delivery failure
JWT verification failure spike
Session database errors
Redis authentication-control errors
```

---

# 118. Authentication Dashboards

Recommended dashboard sections:

```text
Login success/failure
Registration
Email verification
OTP
Password reset
Refresh token
Session revocation
Rate limiting
Authentication latency
Provider/email delivery
Security events
```

---

# 119. Fastify Route Structure

Conceptual:

```ts
fastify.post(
  "/api/v1/auth/login",
  {
    schema: {
      body: loginSchema,
      response: loginResponseSchema,
    },
    config: {
      rateLimit: loginRateLimit,
    },
  },
  loginHandler,
);
```

Authentication implementation should remain outside route definitions.

---

# 120. Service Layer

Example:

```text
AuthenticationService.login()
```

should coordinate:

```text
user lookup
password verification
account state
session creation
token issuance
security event
```

It should not directly handle HTTP response formatting.

---

# 121. Repository Layer

Repository responsibilities:

```text
find user
create session
find session
rotate refresh token
revoke session
create OTP challenge
consume OTP
create reset token
consume reset token
```

Repositories should not decide HTTP status codes.

---

# 122. TypeBox Contracts

Authentication requests/responses should have shared TypeBox schemas.

Example concepts:

```text
LoginRequest
LoginResponse
RefreshRequest
RefreshResponse
RegisterRequest
RegisterResponse
VerifyOtpRequest
ForgotPasswordRequest
VerifyResetOtpRequest
ResetPasswordRequest
ChangePasswordRequest
SessionResponse
```

The Admin frontend should consume these contracts rather than duplicate them.

---

# 123. Validation

Validate:

```text
email
password
OTP
reset token
session ID
```

at the HTTP boundary.

TypeBox handles structure.

Services enforce business/security rules.

---

# 124. Input Normalization

Normalize before security decisions:

```text
email
```

but do not blindly normalize:

```text
password
OTP
tokens
```

Do not trim or mutate passwords unexpectedly.

---

# 125. Password Validation Ordering

Recommended:

```text
schema validation
   |
   v
password policy
   |
   v
password hashing
```

Never log rejected passwords.

---

# 126. Sensitive Request Headers

Do not log:

```text
Authorization
Cookie
Set-Cookie
```

Authentication middleware should ensure sensitive headers are redacted by Pino configuration.

---

# 127. Error Handling

Unexpected authentication errors should return:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred."
  }
}
```

Internal logs should contain:

```text
requestId
error type
stack
safe authentication context
```

but never credentials.

---

# 128. Authentication Request IDs

Every authentication request should have a request ID.

This allows:

```text
login request
   |
   v
database
   |
   v
audit
   |
   v
email
```

to be correlated.

---

# 129. Email Security

Authentication emails should:

- avoid sensitive information
- avoid plaintext passwords
- contain HTTPS links
- have short-lived links
- use trusted domains
- use consistent templates
- include support guidance
- avoid exposing account existence

---

# 130. Password Reset Link

If using a reset link:

```text
https://admin.example.com/reset-password?token=...
```

The token should be:

```text
short-lived
single-use
high entropy
```

Avoid putting sensitive tokens into analytics, third-party scripts, or logs.

The frontend should exchange the token carefully and remove it from browser history where practical.

---

# 131. Referrer Leakage

Reset pages can leak sensitive URLs through referrer headers.

Use appropriate:

```http
Referrer-Policy: no-referrer
```

or another restrictive policy.

Avoid third-party resources on sensitive reset pages.

---

# 132. Password Reset Page Security

The reset page should not load:

```text
analytics scripts
ads
third-party widgets
unknown external assets
```

that could observe the reset URL.

---

# 133. Login Page Security

Login page should avoid unnecessary third-party JavaScript.

The more JavaScript executing on the page:

```text
greater XSS supply-chain exposure
```

Keep dependencies controlled and audited.

---

# 134. Session Cookie Clearing

Logout should explicitly clear authentication cookies.

Ensure the clearing cookie uses matching:

```text
name
path
domain
```

otherwise the browser may retain the original cookie.

---

# 135. Cookie Prefixes

Where appropriate, consider secure cookie prefixes such as:

```text
__Host-
```

when the deployment architecture supports their constraints.

This can strengthen cookie scoping.

---

# 136. Browser Token Handling

Do not expose refresh tokens to application code when HttpOnly cookies are used.

Frontend code should operate with:

```text
access credential
authentication state
```

rather than raw long-lived refresh credentials.

---

# 137. Authentication State Store

Admin auth state should contain minimal information:

```text
isAuthenticated
currentUser
loading
```

Avoid storing:

```text
password
refresh token
OTP
reset token
```

in global state.

---

# 138. Cache Clearing on Logout

Logout should clear:

```text
current user
TanStack Query protected data
permission data
sensitive cached resources
```

This prevents stale authenticated data from appearing after logout.

---

# 139. Cache Clearing on Account Switch

If one user logs out and another logs in:

```text
clear user-specific cache
clear permission cache
clear tenant cache where applicable
```

before rendering the new account.

---

# 140. Multi-Tab Logout

For browser applications, consider:

```text
BroadcastChannel
storage event
shared session state
```

to propagate logout across tabs.

Do not use localStorage to store sensitive tokens merely to achieve synchronization.

---

# 141. Multi-Tab Refresh

Refresh handling should coordinate across tabs where necessary to avoid:

```text
many tabs
+
same refresh token
+
simultaneous rotation
```

Use a safe single-flight/coordinated strategy.

---

# 142. Authentication Testing Strategy

Authentication requires:

```text
unit tests
integration tests
contract tests
E2E tests
security tests
load tests
failure-injection tests
```

Do not rely only on unit tests.

---

# 143. Registration Tests

Test:

```text
valid registration
duplicate email
invalid email
weak password
strong password
email normalization
verification challenge creation
rate limiting
database failure
email queue failure
```

---

# 144. Login Tests

Test:

```text
valid login
wrong password
unknown account
disabled account
suspended account
unverified account
expired session
locked account
rate limit
failed attempt counter
successful attempt reset
```

---

# 145. JWT Tests

Test:

```text
valid token
expired token
invalid signature
wrong issuer
wrong audience
wrong algorithm
missing subject
missing session ID
malformed token
```

---

# 146. Refresh Token Tests

Critical tests:

```text
valid refresh
expired refresh
invalid refresh
revoked session
rotation
old token rejected
reuse detection
session-family revocation
concurrent refresh
database failure
```

---

# 147. OTP Tests

Test:

```text
correct OTP
incorrect OTP
expired OTP
consumed OTP
too many attempts
resend
old OTP invalidation
wrong purpose
rate limit
concurrent verification
```

---

# 148. Forgot Password Tests

Test:

```text
existing email
unknown email
generic response
rate limit
OTP creation
email queue
OTP expiry
OTP attempt limit
```

---

# 149. Reset Password Tests

Test:

```text
valid reset token
expired reset token
used reset token
weak new password
successful password change
session revocation
refresh-token invalidation
audit event
```

---

# 150. Password Change Tests

Test:

```text
correct old password
incorrect old password
weak new password
same password
password history if enabled
session revocation
recent-authentication requirement
```

---

# 151. Logout Tests

Test:

```text
logout current session
logout all
already revoked session
expired session
cookie clearing
audit event
```

---

# 152. Authorization Tests

Authentication tests must also verify:

```text
unauthenticated -> 401
authenticated -> allowed only when authorized
user A cannot access user B
disabled user cannot authenticate
suspended user cannot authenticate
revoked session cannot refresh
```

---

# 153. IDOR Tests

Critical examples:

```http
GET /users/user-A
```

while authenticated as:

```text
user-B
```

must not expose user A unless the user has explicit authorization.

Authentication alone is not enough.

---

# 154. Security Tests

Include:

```text
account enumeration
brute force
OTP guessing
reset token guessing
refresh token replay
CSRF
XSS
credential leakage
log leakage
session fixation
cookie security
rate limit bypass
proxy IP spoofing
```

---

# 155. Session Fixation

After authentication, create a new authenticated session identity.

Do not let attacker-controlled pre-authentication state become an authenticated session without regeneration/rotation where relevant.

---

# 156. Timing Considerations

Password verification and sensitive comparisons should use appropriate cryptographic primitives.

Avoid naïve string comparisons for secrets when a constant-time comparison is required.

Do not prematurely optimize cryptographic operations in ways that weaken security.

---

# 157. Authentication Load Testing

Measure:

```text
login requests/sec
refresh requests/sec
OTP verification/sec
password reset requests/sec
database latency
Redis latency
password hash CPU usage
email queue throughput
```

Password hashing is intentionally expensive.

Capacity planning must account for that CPU cost.

---

# 158. Password Hashing Capacity

If:

```text
login traffic increases
```

the primary bottleneck may be:

```text
CPU used by password verification
```

Do not solve this by weakening the password hashing parameters without security review.

Scale appropriate API capacity and tune hashing based on measured performance and security requirements.

---

# 159. Authentication Availability

Authentication is a critical dependency.

Monitor:

```text
database
Redis
email provider
JWT key material
configuration
```

A failed authentication dependency should produce safe, observable failures rather than insecure fallback behavior.

---

# 160. Fail-Closed Rules

Authentication should generally fail closed when:

```text
JWT verification configuration is unavailable
session revocation state cannot be validated when required
security-critical configuration is invalid
```

Never:

```text
"Redis is down, allow everyone."
```

Never:

```text
"JWT verification failed, trust the request anyway."
```

---

# 161. Redis Failure

For rate limiting:

```text
Redis failure
```

may have a controlled fallback depending on risk.

For critical session/revocation security state:

```text
do not silently bypass security checks
```

Document the exact failure behavior.

---

# 162. Database Failure

If authentication database access fails:

```text
return safe 5xx
```

Do not:

```text
authenticate from stale unknown data
```

unless the architecture intentionally provides a secure cache with explicit guarantees.

---

# 163. Email Provider Failure

Email failure should not corrupt user security state.

Example:

```text
OTP generated
email failed
```

The challenge remains tracked.

The resend flow can generate a new challenge subject to cooldown and policy.

---

# 164. Account Recovery

Recovery must not be weaker than authentication.

Bad:

```text
"I know the user's name, so reset password."
```

Recovery must require an approved verification factor.

Possible factors:

```text
verified email
MFA
recovery code
support-assisted identity verification
```

---

# 165. Support-Assisted Recovery

If support can reset passwords, require:

```text
explicit permission
strong identity verification
audit logging
reason
ticket/reference
optional second approval
```

Support agents should never see the user's current password.

---

# 166. Break-Glass Access

Emergency administrative access should be:

```text
rare
time-limited
audited
MFA-protected
explicitly approved
```

It should not become the normal authentication path.

---

# 167. Authentication Incident Response

When credentials may be compromised:

```text
1. Identify scope
2. Revoke affected sessions
3. Rotate secrets if necessary
4. Force password reset if necessary
5. Revoke refresh token families
6. Investigate audit events
7. Notify affected users when required
8. Monitor for recurrence
```

---

# 168. JWT Secret Compromise

If a symmetric JWT signing secret is compromised:

```text
rotate signing secret
invalidate affected tokens
force reauthentication where required
investigate token issuance
```

A simple secret replacement may invalidate all existing JWTs.

Plan rotation deliberately.

---

# 169. Refresh Token Database Compromise

If refresh-token hashes are compromised:

```text
assess whether tokens can be recovered
rotate/revoke sessions if needed
invalidate token families
investigate access
```

Hashing is defense-in-depth, not a substitute for incident response.

---

# 170. Password Database Compromise

If password hashes are compromised:

```text
rotate sessions
force password resets where appropriate
investigate hash strength
upgrade hashing parameters
monitor credential stuffing
```

Never send existing passwords to users.

---

# 171. Authentication API Contract

A consistent success/error contract should be used.

Success:

```json
{
  "data": {}
}
```

Error:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials."
  }
}
```

Use the repository's API conventions consistently.

---

# 172. Recommended Implementation Order

Implement authentication in this order:

```text
Phase 1
Configuration + secrets

Phase 2
User database model

Phase 3
Password hashing service

Phase 4
Registration

Phase 5
Email verification + OTP

Phase 6
Login

Phase 7
JWT access tokens

Phase 8
Server-side sessions

Phase 9
Refresh tokens + rotation

Phase 10
Logout

Phase 11
Forgot password

Phase 12
Password reset

Phase 13
Authenticated password change

Phase 14
Session management

Phase 15
Admin frontend integration

Phase 16
Rate limiting

Phase 17
Audit/security events

Phase 18
Comprehensive tests

Phase 19
Observability

Phase 20
MFA / advanced security
```

---

# 173. Suggested First Implementation

Start with:

```text
User
  |
  +-- passwordHash
  +-- emailVerifiedAt
  +-- status
  +-- passwordChangedAt

UserSession
  |
  +-- refreshTokenHash
  +-- expiresAt
  +-- revokedAt

OtpChallenge
  |
  +-- purpose
  +-- codeHash
  +-- expiresAt
  +-- attempts
  +-- consumedAt
```

Then implement:

```text
register
verify-email
login
refresh
logout
forgot-password
reset-password
change-password
me
sessions
```

---

# 174. Complete Registration Flow

```text
POST /register
       |
       v
Validate
       |
       v
Normalize email
       |
       v
Rate limit
       |
       v
Validate password
       |
       v
Hash password
       |
       v
Create user
       |
       v
Create email verification OTP
       |
       v
Create outbox event
       |
       v
Commit
       |
       v
Queue email
       |
       v
Return safe response
```

---

# 175. Complete Email Verification Flow

```text
POST /verify-email
       |
       v
Validate OTP
       |
       v
Find challenge
       |
       v
Check purpose
       |
       v
Check expiry
       |
       v
Check attempts
       |
       v
Compare hash
       |
       v
Consume challenge
       |
       v
Mark email verified
       |
       v
Activate account
       |
       v
Audit
```

---

# 176. Complete Login Flow

```text
POST /login
       |
       v
Rate limit
       |
       v
Validate request
       |
       v
Find user
       |
       v
Check account state
       |
       v
Verify password
       |
       v
Reset failure count
       |
       v
Create session
       |
       v
Generate refresh token
       |
       v
Generate access token
       |
       v
Audit success
       |
       v
Return response
```

---

# 177. Complete Refresh Flow

```text
POST /refresh
       |
       v
Extract refresh credential
       |
       v
Hash/lookup
       |
       v
Find session
       |
       v
Check expiration
       |
       v
Check revocation
       |
       v
Check token family
       |
       v
Rotate token
       |
       v
Issue new access token
       |
       v
Return new credentials
```

Reuse:

```text
old token used again
       |
       v
REUSE DETECTED
       |
       v
Revoke session family
       |
       v
Audit + alert
       |
       v
Require login
```

---

# 178. Complete Logout Flow

```text
POST /logout
       |
       v
Identify session
       |
       v
Revoke session
       |
       v
Clear refresh cookie
       |
       v
Audit
       |
       v
Return success
```

---

# 179. Complete Forgot Password Flow

```text
POST /forgot-password
       |
       v
Rate limit
       |
       v
Normalize email
       |
       v
Find user
       |
       v
Create reset OTP
       |
       v
Store hash + expiry
       |
       v
Queue email
       |
       v
Generic response
```

---

# 180. Complete Password Reset Flow

```text
POST /password-reset/verify
       |
       v
Validate OTP
       |
       v
Consume OTP
       |
       v
Issue reset token
       |
       v
POST /password-reset/confirm
       |
       v
Validate reset token
       |
       v
Validate new password
       |
       v
Hash password
       |
       v
Transaction
       |
       +--> Update password
       |
       +--> Consume reset token
       |
       +--> Revoke sessions
       |
       +--> Update passwordChangedAt
       |
       v
Audit
       |
       v
Success
```

---

# 181. Complete Password Change Flow

```text
Authenticated request
       |
       v
Recent-auth check
       |
       v
Verify current password
       |
       v
Validate new password
       |
       v
Hash new password
       |
       v
Update password
       |
       v
Revoke sessions according to policy
       |
       v
Audit
       |
       v
Security notification
```

---

# 182. Complete Admin Request Flow

```text
React Admin
    |
    v
API Client
    |
    v
Access Token
    |
    v
Fastify
    |
    v
authenticate()
    |
    v
JWT verification
    |
    v
Session validation if required
    |
    v
Auth Context
    |
    v
RBAC permission check
    |
    v
Resource authorization
    |
    v
Service
    |
    v
Repository
    |
    v
PostgreSQL
```

---

# 183. Authentication + RBAC Boundary

Authentication creates:

```text
AuthContext
```

Example:

```ts
type AuthContext = {
  userId: string;
  sessionId: string;
};
```

Authorization consumes:

```text
AuthContext
```

and determines:

```text
permissions
roles
tenant scope
resource ownership
```

Keep these responsibilities separate.

---

# 184. Authentication + Audit Boundary

Authentication emits events:

```text
AUTH_LOGIN_SUCCESS
AUTH_LOGIN_FAILURE
AUTH_LOGOUT
AUTH_PASSWORD_RESET_COMPLETED
```

Audit infrastructure persists them.

Do not make authentication directly depend on an Admin UI.

---

# 185. Authentication + Event Architecture

Recommended:

```text
Authentication Service
        |
        v
Transactional Outbox
        |
        v
Event
        |
        +----> Audit consumer
        |
        +----> Notification consumer
        |
        +----> Security analytics
```

Critical authentication state changes must not depend on a consumer successfully running.

---

# 186. Authentication + Background Jobs

Good asynchronous candidates:

```text
verification email
password reset email
login notification
password changed notification
expired session cleanup
expired OTP cleanup
security reports
```

Bad asynchronous candidate:

```text
password verification
```

Password verification must complete before login succeeds.

---

# 187. Authentication + Caching

Do not aggressively cache:

```text
password state
session revocation state
OTP state
reset-token state
```

Security-critical state needs strong consistency.

Safe cache candidates may include:

```text
non-sensitive configuration
static authentication metadata
permission metadata with careful invalidation
```

---

# 188. Authentication + Rate Limiting

Authentication rate limits should be implemented independently from application-wide limits.

Example:

```text
Global API rate limit
+
Auth-specific rate limit
+
Account-specific protection
```

This prevents one compromised or abused route from affecting all authentication behavior.

---

# 189. Authentication + API Versioning

Authentication routes should use:

```text
/api/v1/auth/*
```

Breaking changes should use:

```text
/api/v2/auth/*
```

Do not silently change token semantics for existing clients.

---

# 190. Authentication + OpenAPI

Document:

```text
authentication endpoints
request schemas
response schemas
error codes
401 responses
403 responses
429 responses
cookie behavior
security schemes
```

Do not put real secrets into Swagger examples.

Use fake values only.

---

# 191. Authentication + TypeBox

Keep shared contracts in:

```text
packages/api-contracts
```

Example:

```text
AuthLoginRequest
AuthLoginResponse
AuthRefreshRequest
AuthRefreshResponse
AuthForgotPasswordRequest
AuthResetPasswordRequest
AuthVerifyOtpRequest
AuthSession
```

This prevents Admin/API schema drift.

---

# 192. Authentication + Prisma

Prisma should remain behind repository/service boundaries.

Avoid:

```text
route -> prisma.user.findUnique()
```

Prefer:

```text
route
  -> auth service
      -> repository
          -> prisma
```

This keeps authentication business rules testable.

---

# 193. Authentication + Database Transactions

Use transactions for security-sensitive multi-record operations.

Examples:

```text
password reset
refresh rotation
session revocation
registration + outbox
email verification + account activation
```

---

# 194. Authentication Security Checklist

Before considering authentication complete:

```text
[ ] Passwords are securely hashed
[ ] Passwords never appear in logs
[ ] JWT validation is strict
[ ] Access tokens are short-lived
[ ] Refresh tokens rotate
[ ] Refresh-token reuse is detected
[ ] Sessions can be revoked
[ ] Logout works
[ ] Logout-all works
[ ] Registration works
[ ] Email verification works
[ ] OTP expires
[ ] OTP is single-use
[ ] OTP attempts are limited
[ ] OTP resend is rate-limited
[ ] Forgot password is implemented
[ ] Reset token is short-lived
[ ] Reset token is single-use
[ ] Password reset revokes sessions
[ ] Password change revokes sessions according to policy
[ ] Account enumeration is considered
[ ] Login brute force is protected
[ ] CORS is restricted
[ ] Cookies are secure
[ ] CSRF is addressed
[ ] HTTPS is required in production
[ ] Authentication events are audited
[ ] Sensitive headers are redacted
[ ] Authentication metrics exist
[ ] Tests cover failure paths
```

---

# 195. Production Authentication Checklist

## Identity

```text
[ ] Unique normalized email
[ ] Account status
[ ] Email verification state
[ ] Password-change timestamp
```

## Password

```text
[ ] Argon2id/bcrypt
[ ] Strong password policy
[ ] Hash upgrade support
[ ] Optional password history
```

## Tokens

```text
[ ] Short access-token lifetime
[ ] Secure JWT configuration
[ ] Refresh rotation
[ ] Replay detection
[ ] Session revocation
```

## OTP

```text
[ ] Cryptographically random
[ ] Hashed at rest
[ ] Purpose-scoped
[ ] Expiring
[ ] Attempt-limited
[ ] Single-use
[ ] Rate-limited
```

## Password Recovery

```text
[ ] Generic forgot-password response
[ ] Reset OTP
[ ] Reset token
[ ] Single-use reset
[ ] Session revocation
[ ] Security notification
```

## Browser Security

```text
[ ] HTTPS
[ ] Secure cookies
[ ] HttpOnly cookies
[ ] SameSite policy
[ ] CSRF protection
[ ] Strict CORS
[ ] CSP/security headers
```

## Operations

```text
[ ] Authentication metrics
[ ] Security alerts
[ ] Audit logs
[ ] Session revocation tooling
[ ] Incident runbook
```

---

# 196. Definition of Done

Authentication is considered production-ready only when:

### Registration

- [ ] Registration validates input.
- [ ] Email is normalized.
- [ ] Password is securely hashed.
- [ ] Duplicate-account behavior is documented.
- [ ] Verification challenge is generated.
- [ ] Verification email is queued.
- [ ] Registration is rate-limited.

### Login

- [ ] Password verification works.
- [ ] Account status is checked.
- [ ] Failed login attempts are protected.
- [ ] Successful sessions are created.
- [ ] Access token is issued.
- [ ] Refresh token is issued securely.
- [ ] Login events are audited.

### OTP

- [ ] OTP is cryptographically random.
- [ ] OTP is hashed.
- [ ] OTP has a purpose.
- [ ] OTP expires.
- [ ] OTP has maximum attempts.
- [ ] OTP is single-use.
- [ ] Resend is rate-limited.

### Refresh

- [ ] Refresh token is stored securely.
- [ ] Refresh token rotates.
- [ ] Old token becomes invalid.
- [ ] Replay is detected.
- [ ] Token family/session can be revoked.
- [ ] Concurrent refresh is handled.

### Logout

- [ ] Current session is revoked.
- [ ] Cookie is cleared.
- [ ] Logout is audited.
- [ ] Logout-all is available where required.

### Password Recovery

- [ ] Forgot-password response resists enumeration.
- [ ] Reset OTP works.
- [ ] Reset OTP is protected.
- [ ] Reset token is short-lived.
- [ ] Reset token is single-use.
- [ ] Password is rehashed.
- [ ] Sessions are revoked.
- [ ] Reset event is audited.

### Admin

- [ ] Login screen exists.
- [ ] Forgot-password screen exists.
- [ ] OTP screen exists.
- [ ] Reset-password screen exists.
- [ ] Protected routes work.
- [ ] Refresh is automatic.
- [ ] Refresh requests are single-flight.
- [ ] Logout clears client state.
- [ ] Permission checks integrate with RBAC.

### Security

- [ ] HTTPS is enforced in production.
- [ ] Secrets are externalized.
- [ ] Authentication headers are redacted.
- [ ] Rate limiting is configured.
- [ ] CSRF is addressed.
- [ ] CORS is restricted.
- [ ] Security events are observable.
- [ ] Incident response procedures exist.

### Testing

- [ ] Unit tests
- [ ] Integration tests
- [ ] Contract tests
- [ ] E2E tests
- [ ] Security tests
- [ ] Rate-limit tests
- [ ] Token replay tests
- [ ] OTP tests
- [ ] Password reset tests
- [ ] Session revocation tests
- [ ] Failure-path tests

---

# 197. Final Authentication Architecture

```text
                         ┌───────────────────────┐
                         │     React Admin       │
                         │                       │
                         │ Login                 │
                         │ Verify OTP            │
                         │ Forgot Password       │
                         │ Reset Password        │
                         │ Session Management    │
                         └───────────┬───────────┘
                                     │
                                     v
                         ┌───────────────────────┐
                         │     API Client        │
                         │                       │
                         │ Access Token          │
                         │ Refresh Handling      │
                         │ Single-Flight         │
                         └───────────┬───────────┘
                                     │
                                     v
┌───────────────────────────────────────────────────────────────┐
│                         Fastify API                            │
│                                                               │
│  Auth Routes                                                  │
│      │                                                        │
│      v                                                        │
│  TypeBox Validation                                           │
│      │                                                        │
│      v                                                        │
│  Authentication Service                                      │
│      │                                                        │
│      ├──── Password Service                                   │
│      │                                                        │
│      ├──── OTP Service                                        │
│      │                                                        │
│      ├──── Token Service                                      │
│      │                                                        │
│      ├──── Session Service                                    │
│      │                                                        │
│      └──── Password Reset Service                             │
│      │                                                        │
│      v                                                        │
│  Authentication Context                                      │
│      │                                                        │
│      v                                                        │
│  RBAC / Authorization                                         │
│      │                                                        │
│      v                                                        │
│  Business Services                                            │
└───────────────┬──────────────────────┬────────────────────────┘
                │                      │
                v                      v
       ┌────────────────┐     ┌──────────────────┐
       │ PostgreSQL     │     │ Redis            │
       │                │     │                  │
       │ Users          │     │ Rate limits      │
       │ Sessions       │     │ Cooldowns        │
       │ OTP metadata   │     │ Locks            │
       │ Reset state    │     │ Coordination     │
       │ Audit state    │     │                  │
       └────────────────┘     └──────────────────┘
                │
                v
       ┌────────────────────┐
       │ Transactional      │
       │ Outbox             │
       └─────────┬──────────┘
                 │
                 v
       ┌────────────────────┐
       │ BullMQ / Workers   │
       │                    │
       │ Email              │
       │ Notifications      │
       │ Cleanup            │
       └─────────┬──────────┘
                 │
                 v
       ┌────────────────────┐
       │ External Providers │
       │                    │
       │ Email/SMS          │
       │ Notification       │
       └────────────────────┘
```

---

# 198. Golden Rules

1. Never store plaintext passwords.
2. Never log passwords.
3. Never log OTPs.
4. Never log refresh tokens.
5. Never log reset tokens.
6. Never put secrets in URLs.
7. Keep access tokens short-lived.
8. Rotate refresh tokens.
9. Detect refresh-token reuse.
10. Revoke sessions after password reset.
11. Scope OTPs by purpose.
12. Make OTPs single-use.
13. Limit OTP attempts.
14. Rate-limit authentication endpoints.
15. Protect against account enumeration.
16. Separate authentication from authorization.
17. Default to deny for authorization.
18. Use HTTPS in production.
19. Secure browser cookies.
20. Address CSRF when cookies are used.
21. Keep JWT claims minimal.
22. Validate JWT issuer and audience.
23. Never trust client-provided identity.
24. Do not use Redis failure as a reason to bypass security.
25. Audit security-sensitive authentication events.
26. Use transactions for critical state changes.
27. Make asynchronous authentication jobs idempotent.
28. Test replay, race, expiry, and failure scenarios.
29. Make logout and revocation operationally reliable.
30. Treat password recovery as a high-security authentication flow.
31. Make administrative authentication stronger than ordinary authentication.
32. Keep authentication contracts versioned and typed.
33. Keep security decisions centralized.
34. Monitor authentication anomalies.
35. Design authentication for incident recovery, not only normal operation.

---

# 199. Recommended Implementation Sequence for Fastify-MasterApp

Implement the actual code in this order:

```text
01. Auth configuration
02. User model
03. PasswordService
04. Auth repository
05. Registration
06. OTP infrastructure
07. Email verification
08. Login
09. JWT access token service
10. UserSession
11. Refresh token rotation
12. Refresh replay detection
13. Logout
14. Logout all
15. /auth/me
16. Session management
17. Forgot password
18. Password reset OTP
19. Reset token
20. Password reset confirmation
21. Authenticated password change
22. Email-change flow
23. Authentication rate limits
24. Security audit events
25. Email worker
26. Admin authentication client
27. Admin route guards
28. Automatic token refresh
29. Logout/cache cleanup
30. Authentication test suite
31. Security testing
32. Metrics and alerts
33. Production hardening
34. MFA/passkeys as the next security layer
```

---

# 200. Final Principle

The authentication system should be designed as a complete lifecycle rather than isolated endpoints.

The target model is:

```text
IDENTITY
   ↓
PASSWORD / PRIMARY FACTOR
   ↓
OTP / EMAIL VERIFICATION
   ↓
SESSION
   ↓
SHORT-LIVED ACCESS TOKEN
   ↓
ROTATING REFRESH TOKEN
   ↓
AUTHENTICATED REQUEST
   ↓
AUTHORIZATION / RBAC
   ↓
AUDIT + OBSERVABILITY
```

For account recovery:

```text
FORGOT PASSWORD
   ↓
RATE LIMIT
   ↓
OTP CHALLENGE
   ↓
OTP VERIFICATION
   ↓
SHORT-LIVED RESET TOKEN
   ↓
NEW PASSWORD
   ↓
REVOKE SESSIONS
   ↓
AUDIT
   ↓
SECURITY NOTIFICATION
   ↓
FRESH LOGIN
```

The most important architectural boundary is:

```text
Authentication answers:
"Who is this?"

Authorization answers:
"What may this identity do?"

Session management answers:
"Which authenticated sessions are still trusted?"

Recovery answers:
"How can identity be safely re-established when credentials are lost?"

Audit/observability answers:
"What happened, when, and how can we investigate it?"
```

Fastify-MasterApp should keep these concerns separate while providing one cohesive authentication experience across the API and React Admin application.
