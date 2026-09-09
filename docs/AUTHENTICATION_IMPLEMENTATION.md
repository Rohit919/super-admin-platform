# Authentication Implementation

**Document:** `AUTHENTICATION_IMPLEMENTATION.md`  
**Platform:** Gym SaaS Platform  
**Status:** Proposed / Implementation Specification  
**Backend:** Fastify + TypeScript  
**Database:** PostgreSQL + Prisma  
**Cache:** Redis  
**Clients:** Super Admin, Tenant Web, Tenant Website, Member iOS, Member Android, Staff iOS, Staff Android

---

# 1. Purpose

This document defines the complete authentication architecture for the Gym SaaS Platform.

Authentication covers:

- Registration
- Login
- Logout
- Logout from all devices
- Access tokens
- Refresh tokens
- Token rotation
- Session management
- Email verification
- Phone verification
- OTP
- Password authentication
- Forgot password
- Reset password
- Change password
- Passkeys / WebAuthn
- Tenant selection
- Multi-tenant session context
- Mobile authentication
- Staff authentication
- Member authentication
- Super Admin authentication
- Account lockout
- Rate limiting
- Device management
- RBAC integration
- Audit logging
- Security events

The central principle is:

> Authentication establishes **who the user is**. Authorization determines **what that user can do**.

---

# 2. Authentication Architecture

All applications use the centralized Platform API.

```text
                    ┌─────────────────┐
                    │   Super Admin   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Tenant Web    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Tenant Website  │
                    └────────┬────────┘
                             │
       ┌─────────────────────┼──────────────────────┐
       │                     │                      │
       ▼                     ▼                      ▼
 Member iOS             Member Android         Staff Apps
       │                     │                      │
       └─────────────────────┼──────────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │   Central Fastify API │
                  └──────────┬───────────┘
                             │
             ┌───────────────┼────────────────┐
             ▼               ▼                ▼
         PostgreSQL        Redis          Email/SMS
```

There must not be separate authentication implementations for every application.

---

# 3. Authentication vs Authorization

These are separate.

Authentication:

```text id="x3q2d8"
Who are you?
```

Authorization:

```text id="z8l2af"
What are you allowed to do?
```

Example:

```text id="p6u1xk"
User logs in
       ↓
Authentication
       ↓
User identity established
       ↓
Tenant selected
       ↓
TenantMembership loaded
       ↓
RBAC permission evaluation
```

---

# 4. Identity Model

The global identity is:

```text id="f1s4kq"
User
```

Tenant access is:

```text id="m5n8rv"
User
   ↓
TenantMembership
   ↓
Tenant
```

Role is attached to the membership:

```text id="q2a7jw"
TenantMembership
   ↓
Role
   ↓
Permissions
```

Therefore:

```text id="d0k5pl"
User
 ├── Tenant A → OWNER
 ├── Tenant B → TRAINER
 └── Tenant C → MEMBER
```

is valid.

---

# 5. Authentication Methods

The platform supports:

```text id="2z1l8a"
Password
OTP
Passkey / WebAuthn
Refresh Token
```

Depending on application and security policy.

Recommended:

### Web

```text
Password
Passkey
OTP
```

### Mobile

```text
Password
Passkey
OTP
Refresh Token
```

### Super Admin

```text
Password
Passkey
MFA / OTP
```

Super Admin authentication should have stronger security requirements than ordinary tenant users.

---

# 6. Registration

Recommended endpoint:

```http id="8j1xcz"
POST /api/v1/auth/register
```

Request:

```json id="p4o1h7"
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

Response:

```json id="z4w5nc"
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "emailVerified": false
    }
  },
  "requestId": "req_123"
}
```

---

# 7. Registration Rules

Registration must:

1. Validate input.
2. Normalize email.
3. Validate password.
4. Check account existence.
5. Hash password.
6. Create user.
7. Create verification challenge.
8. Send verification email/OTP.
9. Audit registration.
10. Apply rate limits.

Never store the raw password.

---

# 8. Password Hashing

Passwords must use a password hashing algorithm designed for password storage.

Recommended options:

```text id="g7j0yn"
Argon2id
```

or another strong, appropriately configured password-hashing algorithm selected during implementation.

Never use:

```text id="1r9v4k"
MD5
SHA1
SHA256(password)
Base64
Encryption
```

for password storage.

---

# 9. Password Requirements

The server should enforce a sensible password policy.

Example:

```text id="u2q5da"
Minimum length
Password strength
No known compromised passwords
No trivial patterns
```

Avoid overly complicated composition rules that encourage predictable passwords.

A long passphrase should be accepted.

---

# 10. Email Verification

Endpoint:

```http id="6b0z1e"
POST /api/v1/auth/email/verify
```

Verification flow:

```text id="p4r0hc"
Registration
    ↓
Verification challenge
    ↓
Email
    ↓
User clicks link / enters OTP
    ↓
Server validates challenge
    ↓
emailVerifiedAt updated
```

---

# 11. Email Verification Token

Do not store raw verification tokens.

Store:

```text id="r2j6kw"
tokenHash
```

Example model:

```prisma id="y7s2h4"
model EmailVerificationToken {
  id        String @id @default(cuid())

  userId    String

  tokenHash String

  expiresAt DateTime
  usedAt    DateTime?

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

---

# 12. OTP Architecture

OTP can be used for:

```text id="t4q9mb"
Login
Phone verification
Email verification
Password reset
Step-up authentication
MFA
```

OTP must be short-lived.

Example:

```text id="g1p3cx"
OTP:
6 digits

Lifetime:
5 minutes
```

The exact lifetime and attempt limit should be configurable by security policy.

---

# 13. OTP Storage

Never store a plaintext OTP.

Store a hash:

```text id="q7a4lm"
OTP
 ↓
Hash
 ↓
Redis / Database
```

Example Redis key:

```text id="9x3m2v"
otp:{purpose}:{identifier}
```

Example:

```text id="a1v8kc"
otp:login:user@example.com
```

Store:

```text id="3z5p1q"
hash
expiresAt
attemptCount
```

---

# 14. OTP Attempt Limits

Example:

```text id="m7k0s2"
Maximum attempts:
5

After limit:
Invalidate OTP
```

Also rate-limit OTP generation.

Example:

```text id="y2c8fa"
Maximum:
3 OTP requests / 15 minutes
```

Exact values should be configurable and tuned after security review.

---

# 15. Login

Endpoint:

```http id="x8q2mw"
POST /api/v1/auth/login
```

Request:

```json id="t5m1cy"
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

Flow:

```text id="s0x5rn"
Request
 ↓
Rate limit
 ↓
Find user
 ↓
Verify password
 ↓
Check account status
 ↓
Check verification/MFA requirements
 ↓
Create session
 ↓
Issue access token
 ↓
Issue refresh token
```

---

# 16. Failed Login

Do not reveal whether an email exists.

Avoid:

```text id="3m8kqv"
Email does not exist
```

or:

```text id="9w2cxa"
Password is incorrect
```

Use a generic response:

```text id="k5d3vz"
Invalid credentials.
```

This reduces account enumeration.

---

# 17. Account Lockout

Repeated failed authentication should trigger protection.

Possible states:

```text id="r6w9tm"
Normal
   ↓
Repeated failures
   ↓
Temporary throttling
   ↓
Temporary lock
```

Avoid permanent automatic lockouts that can easily be abused for denial-of-service against legitimate users.

Track security events:

```text id="x4n1pw"
LOGIN_FAILED
ACCOUNT_THROTTLED
ACCOUNT_LOCKED
```

---

# 18. Access Token

Access tokens are short-lived credentials used to access APIs.

Example:

```text id="n9x5v0"
Access Token
Lifetime:
10–15 minutes
```

The exact lifetime should be defined by security requirements.

JWT can be used for access tokens.

Recommended claims:

```json id="c5r7yw"
{
  "sub": "user_123",
  "sid": "session_123",
  "iat": 1757400000,
  "exp": 1757400900
}
```

Avoid putting excessive user or tenant data into JWT claims.

---

# 19. Refresh Token

Refresh tokens provide a way to obtain new access tokens without forcing frequent login.

Flow:

```text id="r8w2mc"
Access Token
   ↓
Expires
   ↓
Refresh Token
   ↓
New Access Token
+
Rotated Refresh Token
```

Refresh tokens should be long-lived but revocable.

---

# 20. Refresh Token Rotation

Every successful refresh should rotate the refresh token.

```text id="x3d7pq"
Refresh Token A
       ↓
Refresh
       ↓
Refresh Token B
       ↓
Token A invalidated
```

If an already-invalidated refresh token is reused, treat it as a possible token theft/replay event and revoke the affected token family/session according to the security policy.

---

# 21. Refresh Token Storage

Never store raw refresh tokens in the database.

Store:

```text id="v8k2rm"
refreshTokenHash
```

Example:

```prisma id="q9y4ad"
model AuthSession {
  id String @id @default(cuid())

  userId String

  refreshTokenHash String

  activeTenantId String?

  expiresAt DateTime
  revokedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
  @@index([expiresAt])
}
```

---

# 22. Session Model

A session represents an authenticated login/device session.

Example:

```text id="k5o1wz"
User
 │
 ├── Session A → iPhone
 ├── Session B → Mac
 └── Session C → Android
```

Sessions allow:

- Logout from one device
- Logout all devices
- Session revocation
- Device tracking
- Security monitoring

---

# 23. Session Metadata

Store useful metadata:

```text id="s8m0lq"
User ID
Device ID
Application ID
IP address
User agent
Created at
Last used at
Expires at
Revoked at
```

Avoid collecting unnecessary sensitive data.

---

# 24. Logout

Endpoint:

```http id="h3y7v1"
POST /api/v1/auth/logout
```

Flow:

```text id="d7p2na"
Access Token
 ↓
Identify session
 ↓
Revoke refresh token/session
 ↓
Clear client credentials
```

The server should revoke the relevant session.

The client should clear:

```text id="n4q8bx"
Access token
Refresh token
Cached tenant context
Sensitive local data
```

---

# 25. Logout All

Endpoint:

```http id="p8v4zl"
POST /api/v1/auth/logout-all
```

Flow:

```text id="m1x7qa"
User
 ↓
Revoke all active sessions
 ↓
All refresh tokens become invalid
```

This is useful after:

```text id="0g7qse"
Password change
Account compromise
Lost device
Security incident
```

---

# 26. Change Password

Endpoint:

```http id="s4y1nc"
POST /api/v1/auth/password/change
```

Request:

```json id="m8z5r1"
{
  "currentPassword": "OldPassword",
  "newPassword": "NewStrongPassword"
}
```

Flow:

```text id="x7c2ma"
Authenticate
 ↓
Verify current password
 ↓
Validate new password
 ↓
Update password hash
 ↓
Revoke appropriate sessions
 ↓
Audit event
```

Recommended security behavior is to revoke existing sessions after a password change, with the current session re-established according to product requirements.

---

# 27. Forgot Password

Endpoint:

```http id="a7q4se"
POST /api/v1/auth/password/forgot
```

Request:

```json id="n6p8yc"
{
  "email": "user@example.com"
}
```

The response should not reveal whether the account exists.

Always return a generic response such as:

```text id="c2r7hx"
If an account matches, password reset instructions have been sent.
```

---

# 28. Password Reset Flow

```text id="b3w6mv"
Forgot Password
       ↓
Reset challenge created
       ↓
Email / OTP
       ↓
User opens reset flow
       ↓
Server validates challenge
       ↓
New password submitted
       ↓
Password hash updated
       ↓
Reset challenge consumed
       ↓
Existing sessions revoked
       ↓
Audit event
```

---

# 29. Password Reset Token

Model:

```prisma id="k2s7pn"
model PasswordResetToken {
  id        String @id @default(cuid())

  userId    String

  tokenHash String

  expiresAt DateTime
  usedAt    DateTime?

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

Use:

```text id="w8q0la"
single-use
short-lived
random
high entropy
hashed at rest
```

---

# 30. Reset Token Security

Do not:

- Store plaintext tokens
- Put passwords in URLs
- Log reset tokens
- Return reset tokens from unrelated APIs
- Allow reuse
- Allow unlimited attempts

Reset links should contain a high-entropy random value that is validated server-side.

---

# 31. Password Reset Completion

After successful reset:

```text id="g9m2rx"
Password updated
       ↓
Invalidate reset token
       ↓
Revoke existing sessions
       ↓
Create security audit event
       ↓
Send security notification
```

Do not automatically log the user into every application unless that behavior has been explicitly designed and secured.

---

# 32. Passkeys / WebAuthn

The platform can support passkeys using WebAuthn.

Architecture:

```text id="m8r2vk"
Browser / Native OS
       ↓
Passkey
       ↓
WebAuthn
       ↓
Platform API
       ↓
Credential Verification
```

Passkeys provide phishing-resistant authentication and can reduce reliance on passwords.

---

# 33. Passkey Registration

Flow:

```text id="x2k7pq"
Authenticated User
       ↓
Request registration options
       ↓
Platform generates challenge
       ↓
OS / Browser creates credential
       ↓
Credential returned
       ↓
Server verifies
       ↓
Credential stored
```

---

# 34. Passkey Login

Flow:

```text id="p7c4my"
Login
 ↓
Request WebAuthn challenge
 ↓
OS / Browser
 ↓
Passkey verification
 ↓
Signed assertion
 ↓
Server verifies
 ↓
Create authenticated session
```

---

# 35. Passkey Database Model

Conceptual:

```prisma id="e4j8wq"
model PasskeyCredential {
  id String @id @default(cuid())

  userId String

  credentialId String @unique

  publicKey Bytes

  counter BigInt @default(0)

  transports Json?

  createdAt DateTime @default(now())
  lastUsedAt DateTime?

  user User @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
}
```

The exact fields should follow the WebAuthn library and platform requirements selected during implementation.

---

# 36. Native Passkeys

Native apps should use OS-provided credential APIs.

### iOS

```text id="c5s0ae"
AuthenticationServices
```

### Android

```text id="j6p4rv"
Credential Manager
```

The native applications should not implement their own cryptography for passkey handling.

---

# 37. OTP Login

Optional passwordless login:

```http id="a3q8vx"
POST /api/v1/auth/otp/request
```

Then:

```http id="g4y2pn"
POST /api/v1/auth/otp/verify
```

Flow:

```text id="y1w6kc"
Email / Phone
 ↓
OTP Request
 ↓
OTP delivery
 ↓
User enters OTP
 ↓
Server verifies
 ↓
Create session
```

---

# 38. Tenant Selection

Authentication and tenant selection are separate concepts.

A user may authenticate successfully but belong to multiple tenants.

Example:

```text id="c8f2pm"
John
 ├── Gold's Gym → TRAINER
 ├── Fitness Pro → MEMBER
 └── PowerFit → ADMIN
```

After authentication:

```text id="s9d4wx"
Authenticated
      ↓
Load memberships
      ↓
Select tenant
```

---

# 39. Tenant List

Endpoint:

```http id="n3v6kc"
GET /api/v1/auth/tenants
```

Response:

```json id="m7x2qp"
{
  "success": true,
  "data": {
    "tenants": [
      {
        "id": "tenant_1",
        "name": "Gold's Gym",
        "role": "TRAINER"
      },
      {
        "id": "tenant_2",
        "name": "Fitness Pro",
        "role": "MEMBER"
      }
    ]
  }
}
```

---

# 40. Select Tenant

Endpoint:

```http id="q8z4mv"
POST /api/v1/auth/tenant/select
```

Request:

```json id="x5r2pc"
{
  "tenantId": "tenant_123"
}
```

The server must verify:

```text id="y9m4kn"
User is authenticated
+
Membership exists
+
Membership is active
+
Tenant is active
```

Only then should the tenant become active.

---

# 41. Active Tenant

The active tenant should be treated as request context.

Conceptual:

```ts id="f2c6rw"
type AuthContext = {
  userId: string;
  sessionId: string;
  activeTenantId?: string;
};
```

For tenant-scoped operations:

```text id="b4p8za"
activeTenantId
```

must be valid.

---

# 42. Tenant Context Must Not Be Trusted

The client may send:

```http id="v6n2mq"
X-Tenant-ID: tenant_123
```

but the backend must validate it.

Correct:

```text id="a8w3cs"
Token/User
   ↓
Membership lookup
   ↓
Tenant validation
   ↓
TenantContext
```

Incorrect:

```text id="d2f7py"
X-Tenant-ID
   ↓
Trust
   ↓
Database query
```

---

# 43. JWT Tenant Claim

An active tenant can optionally be represented in an access token claim.

Example:

```json id="r1q5nc"
{
  "sub": "user_123",
  "sid": "session_123",
  "tid": "tenant_123",
  "exp": 1757400900
}
```

However:

> A JWT tenant claim is not sufficient by itself.

The server must still ensure the session and membership remain valid.

For high-risk operations, current membership/authorization state should be consulted rather than relying indefinitely on stale token claims.

---

# 44. Tenant Switching

When a user switches tenants:

```text id="p3v7xa"
Tenant A
 ↓
Switch
 ↓
Validate Tenant B membership
 ↓
Set active tenant
 ↓
Refresh tenant configuration
 ↓
Refresh permissions
 ↓
Refresh tenant data
```

The mobile/web application must clear tenant-scoped cached data before loading the new tenant's data.

---

# 45. Authentication Middleware

Recommended Fastify pipeline:

```text id="c0x6qs"
Request
 ↓
Request ID
 ↓
Rate Limit
 ↓
Authentication
 ↓
Session Validation
 ↓
Tenant Resolution
 ↓
Authorization
 ↓
Validation
 ↓
Controller
 ↓
Service
```

---

# 46. Authentication Hook

Conceptually:

```ts id="j9m4pq"
async function authenticate(request) {
  const token = extractBearerToken(request);

  const payload = verifyAccessToken(token);

  const session = await sessionService.validate(payload.sid);

  request.auth = {
    userId: payload.sub,
    sessionId: payload.sid,
  };
}
```

Do not put business authorization logic into the basic authentication hook.

---

# 47. Authorization Hook

Authorization happens after authentication.

Conceptually:

```ts id="k3v8rx"
await authorization.requirePermission(
  request.auth,
  request.tenantContext,
  "members.read",
);
```

---

# 48. Auth Context

Recommended structure:

```ts id="q1m7wd"
type AuthContext = {
  userId: string;
  sessionId: string;
  authenticationMethod: "PASSWORD" | "OTP" | "PASSKEY";

  activeTenantId?: string;
  membershipId?: string;
  roleId?: string;
};
```

The final authorization context should be generated server-side.

---

# 49. Centralized Auth Module

Recommended structure:

```text id="z4k2lm"
apps/platform-api/src/modules/authentication/
│
├── authentication.controller.ts
├── authentication.service.ts
├── authentication.repository.ts
├── authentication.schemas.ts
├── authentication.types.ts
├── authentication.errors.ts
├── authentication.policy.ts
│
├── password/
│   ├── password.service.ts
│   └── password.policy.ts
│
├── otp/
│   ├── otp.service.ts
│   └── otp.repository.ts
│
├── tokens/
│   ├── access-token.service.ts
│   ├── refresh-token.service.ts
│   └── token.types.ts
│
├── sessions/
│   ├── session.service.ts
│   └── session.repository.ts
│
├── passkeys/
│   ├── passkey.service.ts
│   └── passkey.repository.ts
│
└── tenant/
    └── tenant-context.service.ts
```

---

# 50. Authentication Endpoints

The centralized API should expose:

```text id="r8j3kp"
/api/v1/auth/register

/api/v1/auth/login
/api/v1/auth/logout
/api/v1/auth/logout-all

/api/v1/auth/refresh
/api/v1/auth/me

/api/v1/auth/tenants
/api/v1/auth/tenant/select

/api/v1/auth/email/verify
/api/v1/auth/email/resend

/api/v1/auth/phone/verify
/api/v1/auth/phone/resend

/api/v1/auth/otp/request
/api/v1/auth/otp/verify

/api/v1/auth/password/forgot
/api/v1/auth/password/reset
/api/v1/auth/password/change

/api/v1/auth/passkeys/register/options
/api/v1/auth/passkeys/register/verify
/api/v1/auth/passkeys/login/options
/api/v1/auth/passkeys/login/verify

/api/v1/auth/sessions
/api/v1/auth/sessions/:sessionId
```

---

# 51. Authentication Response Contract

Success:

```json id="s1v7yd"
{
  "success": true,
  "data": {},
  "requestId": "req_123"
}
```

Error:

```json id="w4p8zc"
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials."
  },
  "requestId": "req_123"
}
```

Clients should rely on stable error codes rather than parsing human-readable messages.

---

# 52. Authentication Error Codes

Recommended:

```text id="e5w2pc"
INVALID_CREDENTIALS
ACCOUNT_DISABLED
ACCOUNT_SUSPENDED
EMAIL_NOT_VERIFIED
PHONE_NOT_VERIFIED
OTP_INVALID
OTP_EXPIRED
OTP_TOO_MANY_ATTEMPTS
RESET_TOKEN_INVALID
RESET_TOKEN_EXPIRED
SESSION_EXPIRED
SESSION_REVOKED
REFRESH_TOKEN_INVALID
REFRESH_TOKEN_REUSED
TENANT_NOT_FOUND
TENANT_ACCESS_DENIED
TENANT_SUSPENDED
PASSKEY_INVALID
PASSKEY_CHALLENGE_EXPIRED
RATE_LIMITED
```

---

# 53. Cookie vs Bearer Token

For web applications, the architecture may use:

```text id="w7p4qm"
Secure HttpOnly SameSite cookies
```

for refresh/session credentials.

For native applications:

```text id="q3n8xr"
Authorization: Bearer <access-token>
```

is appropriate.

The exact transport should be standardized per client type.

---

# 54. Web Security

For cookie-based authentication:

```text id="g2w9ml"
Secure
HttpOnly
SameSite
CSRF protection
```

must be configured appropriately.

Do not store long-lived authentication secrets in:

```text id="c6r1xp"
localStorage
```

when a safer architecture is available.

---

# 55. Mobile Token Storage

Native mobile applications should use secure OS storage.

### iOS

```text id="y5k2wr"
Keychain
```

### Android

```text id="m8p4cz"
Android Keystore-backed secure storage
```

Never store refresh tokens in:

```text id="n4q6sw"
Plain SharedPreferences
Plain files
UserDefaults
SQLite without encryption/protection
Logs
```

---

# 56. Mobile Authentication Flow

```text id="r0x7vn"
App Launch
   ↓
Load secure session
   ↓
Access token valid?
   ├── Yes → Continue
   │
   └── No
        ↓
    Refresh token
        ↓
    Rotate tokens
        ↓
    Continue
        │
        └── Refresh failed
              ↓
          Login required
```

---

# 57. Mobile Token Manager

Both native apps should centralize token management.

### iOS

```text id="u6v3px"
Authentication/
└── TokenManager
```

### Android

```text id="a1q9mk"
authentication/
└── TokenManager
```

Responsibilities:

```text id="e4m8yr"
Get access token
Refresh token
Rotate token
Store token
Delete token
Handle refresh failure
Prevent concurrent refresh races
```

---

# 58. Refresh Race Protection

Multiple API requests can discover an expired access token simultaneously.

Bad:

```text id="q5v1sz"
Request A → refresh
Request B → refresh
Request C → refresh
```

Better:

```text id="k8r2xd"
Request A
   ↓
Refresh in progress
   ↓
Requests B/C wait
   ↓
One refresh completes
   ↓
All requests retry
```

Implement a single-flight refresh mechanism in web/mobile clients.

---

# 59. Native App Logout

Logout must clear:

```text id="h7p3wa"
Access token
Refresh token
User session state
Active tenant
Tenant-scoped cache
Sensitive local data
```

Then call:

```http id="x9v2ke"
POST /api/v1/auth/logout
```

where network access is available.

Local logout should still succeed if the device is offline.

---

# 60. Super Admin Authentication

Super Admin must use a separate application:

```text id="k2r6ps"
apps/super-admin
```

but the same centralized authentication infrastructure.

Recommended stronger controls:

```text id="w5q8nc"
Passkey
MFA
Short sessions
Strong rate limiting
Step-up authentication
Audit logging
IP/device monitoring where appropriate
```

Super Admin must never rely solely on a client-side `SUPER_ADMIN` role.

---

# 61. Super Admin Authorization

Super Admin authentication establishes identity.

Platform authorization then checks:

```text id="f3m9xy"
platform.* permissions
```

Example:

```text id="j8q2pw"
platform.tenants.read
platform.tenants.update
platform.mobile_builds.create
platform.mobile_builds.release
```

---

# 62. Step-Up Authentication

Sensitive operations may require recent authentication.

Examples:

```text id="p1x6mv"
Change password
Change email
Disable MFA
View sensitive security data
Refund payment
Delete tenant
Release mobile application
Rotate security credentials
```

Flow:

```text id="c7n4qs"
Authenticated
   ↓
Sensitive operation
   ↓
Require recent authentication
   ↓
Password / Passkey / OTP
   ↓
Short-lived authorization
   ↓
Operation allowed
```

---

# 63. Security Events

Authentication events should be recorded.

Examples:

```text id="y4w7kn"
REGISTERED
LOGIN_SUCCESS
LOGIN_FAILED
LOGOUT
LOGOUT_ALL
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
EMAIL_VERIFIED
PHONE_VERIFIED
OTP_REQUESTED
OTP_FAILED
PASSKEY_REGISTERED
PASSKEY_REMOVED
SESSION_CREATED
SESSION_REVOKED
REFRESH_TOKEN_ROTATED
REFRESH_TOKEN_REUSE_DETECTED
TENANT_SELECTED
STEP_UP_AUTHENTICATED
```

---

# 64. Audit Log

Security-sensitive authentication events should contain:

```text id="b2m9xc"
userId
tenantId where applicable
sessionId
event
requestId
IP address where appropriate
user agent where appropriate
timestamp
```

Do not store:

```text id="e7q1mz"
Passwords
Raw OTPs
Raw refresh tokens
Reset tokens
Private keys
```

---

# 65. Rate Limiting

Authentication endpoints require strict rate limits.

Examples:

```text id="n3x7rp"
/login
/otp/request
/otp/verify
/password/forgot
/password/reset
/passkeys/*
```

Use Redis-backed distributed rate limiting when running multiple API instances.

Rate limiting should consider appropriate dimensions such as:

```text id="q8k4ws"
IP
Account identifier
Device/session
Endpoint
```

Do not rely exclusively on IP because many legitimate users can share an IP.

---

# 66. Brute Force Protection

Protection should combine:

```text id="z1r6mq"
Rate limiting
Credential throttling
OTP attempt limits
Session controls
Suspicious-event detection
Temporary lockouts where appropriate
```

Avoid exposing whether an account exists.

---

# 67. Email Enumeration Protection

These should behave similarly:

```text id="g4p9vc"
Existing email
Unknown email
```

for:

```text id="t6m2xr"
Password reset
OTP request
Registration
```

where account enumeration would otherwise be possible.

---

# 68. Account Status

User status:

```text id="j9q4nx"
INVITED
ACTIVE
SUSPENDED
DISABLED
```

Tenant membership status:

```text id="f5m8kc"
INVITED
ACTIVE
SUSPENDED
REMOVED
```

Both must be considered.

Example:

```text id="u2z7px"
User ACTIVE
+
TenantMembership SUSPENDED
=
No tenant access
```

---

# 69. Tenant Status

Tenant status also affects authentication context.

```text id="n7x3mq"
Tenant ACTIVE
    ↓
Normal tenant access

Tenant SUSPENDED
    ↓
Tenant access restricted

Tenant ARCHIVED
    ↓
Tenant access disabled
```

A globally valid user does not imply valid access to every tenant.

---

# 70. Authentication State Machine

User:

```text id="r6k1wb"
INVITED
   ↓
ACTIVE
   ↓
SUSPENDED
   ↓
ACTIVE
   ↓
DISABLED
```

Session:

```text id="v8m2cq"
CREATED
   ↓
ACTIVE
   ↓
EXPIRED
   or
REVOKED
```

Password reset:

```text id="k4x7zn"
CREATED
   ↓
USED
```

or:

```text id="f2q9mp"
CREATED
   ↓
EXPIRED
```

---

# 71. Authentication Database Entities

Initial authentication tables:

```text id="c3m8xy"
User
AuthSession
EmailVerificationToken
PasswordResetToken
PasskeyCredential
TenantInvitation
Device
```

Optional:

```text id="p6w1rz"
OTPChallenge
SecurityEvent
MfaMethod
```

depending on implementation.

---

# 72. User Authentication Model

The user table should not contain:

```text id="s9x4kw"
plain password
```

Instead:

```prisma id="y2m7qp"
passwordHash String?
```

A nullable password hash supports passkey/OTP-only accounts.

Example:

```prisma id="q5k8nd"
model User {
  id String @id @default(cuid())

  email String? @unique
  phone String? @unique

  passwordHash String?

  firstName String?
  lastName String?

  status UserStatus @default(INVITED)

  emailVerifiedAt DateTime?
  phoneVerifiedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships TenantMembership[]

  memberProfile Member?
  trainerProfile Trainer?

  sessions AuthSession[]
  devices Device[]
  passkeys PasskeyCredential[]
}
```

---

# 73. Authentication and RBAC

Authentication produces:

```text id="r4c8mx"
userId
sessionId
```

Tenant selection produces:

```text id="p7n2kw"
tenantId
membershipId
roleId
```

RBAC produces:

```text id="w3q9za"
permissions
```

Final authorization:

```text id="m6x1pc"
User
+
Session
+
Tenant Membership
+
Role
+
Permission
+
Resource Policy
=
Authorized
```

---

# 74. Authentication and Mobile Application Identity

Native apps may send:

```http id="y8k3pn"
X-Application-ID: app_123
X-App-Version: 1.5.0
X-App-Build: 42
```

The API may use these for:

```text id="z4m7cq"
Application identification
Version enforcement
Feature compatibility
Push routing
Diagnostics
```

They are not a substitute for authentication.

Never trust an application ID as proof that a request came from an official binary.

---

# 75. Version Enforcement

After authentication, the API may return:

```json id="n8q3ws"
{
  "minimumVersion": "1.5.0",
  "recommendedVersion": "1.6.0",
  "forceUpdate": false
}
```

If:

```text id="c1p6mx"
installedVersion < minimumVersion
```

the application may be required to update.

---

# 76. Authentication API Flow

Complete tenant user flow:

```text id="w7z4kn"
                 REGISTER / LOGIN
                       │
                       ▼
                Authenticate User
                       │
                       ▼
                Create Session
                       │
                       ▼
                Issue Tokens
                       │
                       ▼
                 Load Tenants
                       │
                       ▼
                Select Tenant
                       │
                       ▼
              Validate Membership
                       │
                       ▼
                Load Permissions
                       │
                       ▼
                 Access API
```

---

# 77. Request Authorization Flow

Every protected tenant request:

```text id="m8p2yc"
HTTP Request
    ↓
Request ID
    ↓
Rate Limit
    ↓
Access Token
    ↓
Session Validation
    ↓
User Status
    ↓
Tenant Context
    ↓
Membership Status
    ↓
Permission
    ↓
Resource Policy
    ↓
Controller
    ↓
Service
    ↓
Repository
```

---

# 78. Authentication Security Rules

Never:

```text id="z6x3pv"
Store plaintext passwords
Store plaintext refresh tokens
Store plaintext OTPs
Log authentication secrets
Trust client tenant IDs
Trust client roles
Authorize in frontend only
Use long-lived access tokens unnecessarily
Return account-existence information
Skip rate limiting
Skip session revocation
```

---

# 79. Client Security Rules

Web:

```text id="b4m8xq"
Use secure cookies where applicable
Use CSRF protection
Avoid persistent token storage in localStorage
Clear session state on logout
```

Mobile:

```text id="r7p1cz"
Use Keychain / Keystore
Never log tokens
Clear credentials on logout
Use secure networking
Handle token refresh centrally
```

---

# 80. Authentication Testing

Tests must cover:

### Registration

```text id="g3w8mq"
Valid registration
Invalid email
Weak password
Duplicate account
Verification
```

### Login

```text id="x6p2kn"
Valid credentials
Invalid credentials
Suspended account
Disabled account
Rate limiting
```

### OTP

```text id="v9m4cz"
Valid OTP
Invalid OTP
Expired OTP
Too many attempts
Repeated requests
```

### Password Reset

```text id="q5k7mx"
Valid reset
Expired token
Used token
Invalid token
Session revocation
```

### Sessions

```text id="w1n8pc"
Refresh
Rotation
Revocation
Reuse detection
Logout
Logout all
```

### Tenant

```text id="r4z2my"
Valid membership
Invalid membership
Suspended membership
Tenant switching
Cross-tenant access
```

### Passkeys

```text id="m7c3xq"
Registration
Authentication
Invalid challenge
Expired challenge
Credential removal
```

---

# 81. Critical Security Tests

These tests are mandatory.

### Cross-tenant authentication context

```text id="k8p1sw"
User belongs to Tenant A

Attempt:
Select Tenant B

Expected:
403
```

### Suspended membership

```text id="f3m7qx"
User ACTIVE
TenantMembership SUSPENDED

Expected:
Tenant access denied
```

### Refresh token reuse

```text id="n6z2pc"
Refresh Token A
 ↓
Refresh
 ↓
Token B issued
 ↓
Token A reused

Expected:
Security event
Session/token-family revocation according to policy
```

### Password reset invalidation

```text id="x9w4km"
Reset password
 ↓
Old session
 ↓
Must be invalid
```

---

# 82. Authentication Observability

Metrics:

```text id="q7m2zp"
auth_login_success_total
auth_login_failure_total
auth_otp_requested_total
auth_otp_failure_total
auth_password_reset_total
auth_refresh_total
auth_refresh_failure_total
auth_refresh_reuse_total
auth_session_revoked_total
auth_passkey_success_total
auth_passkey_failure_total
```

Track latency:

```text id="j4x8cn"
login_latency
refresh_latency
otp_verification_latency
passkey_verification_latency
```

---

# 83. Authentication Logging

Use structured logs.

Example:

```json id="p3w7ka"
{
  "event": "LOGIN_SUCCESS",
  "userId": "user_123",
  "sessionId": "session_123",
  "requestId": "req_123"
}
```

Never log:

```text id="x8m1qc"
password
OTP
access token
refresh token
reset token
private key
```

---

# 84. Authentication Notifications

Security events may trigger notifications.

Examples:

```text id="z5r2mv"
New login
Password changed
Password reset
New passkey added
Session revoked
Suspicious authentication
```

Notifications should not expose secrets.

---

# 85. Authentication Email/SMS Architecture

Authentication should not directly depend on SMTP/SMS provider implementations.

Use an abstraction:

```text id="b7n4px"
Authentication Service
       ↓
Notification Service
       ↓
Email/SMS Provider
```

Possible providers can be changed without rewriting authentication logic.

---

# 86. Async Authentication Jobs

Use background jobs for:

```text id="f8q2mc"
Email verification delivery
Password reset email
OTP delivery where appropriate
Security notifications
```

Do not make unnecessary external provider calls part of the critical database transaction.

---

# 87. Transaction Boundaries

Example registration:

```text id="k2p7xr"
Database transaction:
    Create user
    Create verification challenge

After commit:
    Queue email
```

This avoids:

```text id="w5m9qc"
Email sent
+
Database transaction rolled back
```

---

# 88. Authentication Secrets

Application secrets must live in a secure secret-management system.

Examples:

```text id="c4x8mp"
JWT signing secret/private key
Email provider credentials
SMS credentials
WebAuthn configuration secrets where applicable
Encryption keys
```

Never store these in Git.

---

# 89. JWT Signing

For a distributed production system, consider asymmetric signing:

```text id="y6n2pw"
Private Key
    ↓
Token Issuer

Public Key
    ↓
Token Verification
```

This can be useful when multiple services eventually need to verify tokens without receiving the signing secret.

The exact algorithm and key-management strategy should be finalized during security implementation.

---

# 90. Key Rotation

Authentication signing keys must support rotation.

Conceptually:

```text id="p1m7xz"
Key A
 ↓
Key B becomes active
 ↓
New tokens signed with B
 ↓
Old A tokens remain temporarily verifiable
 ↓
A retired
```

Expose key IDs (`kid`) where applicable.

---

# 91. Session Expiration

Sessions should have:

```text id="g8r3kc"
Absolute expiration
Idle timeout where appropriate
Revocation state
```

Different application types may use different policies.

For example:

```text id="w2q7mn"
Super Admin:
shorter session

Tenant Web:
moderate session

Mobile:
longer refresh lifetime with secure device storage
```

Exact values should be security-reviewed.

---

# 92. Account Recovery

Recovery methods may include:

```text id="c9x4pa"
Email
Phone
Passkey
Recovery codes
Support-assisted recovery
```

Support-assisted recovery must have strict identity-verification procedures and audit trails.

Never let a support operator simply change an account password without appropriate verification.

---

# 93. Email Change

Changing email should require strong verification.

Flow:

```text id="z3p8mw"
Authenticated User
      ↓
Request email change
      ↓
Step-up authentication
      ↓
Verify new email
      ↓
Update email
      ↓
Security notification
      ↓
Potential session revocation
```

Do not immediately trust an unverified new email.

---

# 94. Phone Change

Similar flow:

```text id="j7c2nx"
Authenticated User
      ↓
Step-up authentication
      ↓
OTP to new phone
      ↓
Verify
      ↓
Update phone
      ↓
Security event
```

---

# 95. Account Deletion

Account deletion is a separate workflow.

It must consider:

```text id="m5x8qr"
Tenant memberships
Membership records
Payments
Audit records
Legal retention
Workout history
Notifications
Devices
Passkeys
Sessions
```

Authentication records may need deletion/anonymization while financial/audit records may require retention.

---

# 96. Authentication Architecture by Client

| Client         | Authentication             | Token Storage           |
| -------------- | -------------------------- | ----------------------- |
| Super Admin    | Password + Passkey/MFA     | Secure cookie/session   |
| Tenant Web     | Password + Passkey/OTP     | Secure cookie/session   |
| Tenant Website | Password/OTP as applicable | Secure session          |
| Member iOS     | Password + Passkey/OTP     | Keychain                |
| Member Android | Password + Passkey/OTP     | Keystore-backed storage |
| Staff iOS      | Password + Passkey/OTP     | Keychain                |
| Staff Android  | Password + Passkey/OTP     | Keystore-backed storage |

---

# 97. Final Authentication Architecture

```text id="u3k9wm"
                       USER
                        │
                        ▼
                 Authentication
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      Password         OTP            Passkey
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                     Session
                        │
                        ▼
                  Access Token
                        │
                        ▼
                  Refresh Token
                        │
                        ▼
                  Tenant Selection
                        │
                        ▼
               Tenant Membership
                        │
                        ▼
                       Role
                        │
                        ▼
                  Permissions
                        │
                        ▼
                Resource Policy
                        │
                        ▼
                    API Access
```

---

# 98. Final Security Invariant

The platform must enforce:

```text id="q8m3zx"
Authenticated Identity
        +
Valid Session
        +
Active User
        +
Valid Tenant
        +
Active Tenant Membership
        +
Valid Permission
        +
Resource Authorization
        =
Authorized Request
```

Authentication alone never grants access to tenant resources.

---

# 99. Final Implementation Checklist

Before production:

```text id="w6p2nk"
[ ] Password hashing implemented
[ ] Registration implemented
[ ] Email verification implemented
[ ] Phone verification implemented where required
[ ] Login implemented
[ ] Access token implemented
[ ] Refresh token implemented
[ ] Refresh token rotation implemented
[ ] Refresh token reuse detection implemented
[ ] Session management implemented
[ ] Logout implemented
[ ] Logout-all implemented
[ ] Forgot password implemented
[ ] Reset password implemented
[ ] Change password implemented
[ ] OTP implemented
[ ] OTP rate limiting implemented
[ ] Passkeys implemented
[ ] Tenant selection implemented
[ ] Tenant membership validation implemented
[ ] Super Admin authentication implemented
[ ] RBAC integration implemented
[ ] Step-up authentication implemented for sensitive operations
[ ] Security audit events implemented
[ ] Authentication rate limits implemented
[ ] Secure mobile token storage implemented
[ ] Secure web session handling implemented
[ ] Authentication secrets stored securely
[ ] JWT/key rotation strategy implemented
[ ] Authentication monitoring implemented
[ ] Security tests implemented
[ ] Cross-tenant tests implemented
```

---

# 100. Final Principle

The authentication architecture must remain centralized.

```text
                 ALL CLIENTS
                     │
                     ▼
              Central Auth API
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      User         Session       Tenant
        │            │            │
        └────────────┼────────────┘
                     ▼
                    RBAC
                     │
                     ▼
               Resource Policy
                     │
                     ▼
                 API Access
```

There should be:

```text
ONE authentication system
ONE user identity model
ONE session model
ONE token strategy
ONE tenant-selection mechanism
ONE RBAC integration
ONE centralized security policy
```

while supporting:

```text
Super Admin
Tenant Web
Tenant Website
Member iOS
Member Android
Staff iOS
Staff Android
```

The result is a single, consistent authentication architecture across the entire Gym SaaS Platform.
