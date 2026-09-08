# Authentication Guide

This document defines the authentication architecture, implementation rules, security requirements, development workflow, testing strategy, and operational considerations for **Fastify-MasterApp**.

Fastify-MasterApp uses token-based authentication with short-lived access tokens and refresh-token rotation.

Authentication answers:

> **Who is making this request?**

Authorization answers:

> **What is that authenticated actor allowed to do?**

These are separate responsibilities and must remain separate throughout the application.

---

## Table of Contents

1. [Authentication Principles](#1-authentication-principles)
2. [Authentication vs Authorization](#2-authentication-vs-authorization)
3. [Authentication Architecture](#3-authentication-architecture)
4. [Authentication Components](#4-authentication-components)
5. [User Identity](#5-user-identity)
6. [Password Security](#6-password-security)
7. [Registration](#7-registration)
8. [Login](#8-login)
9. [Access Tokens](#9-access-tokens)
10. [JWT Claims](#10-jwt-claims)
11. [Refresh Tokens](#11-refresh-tokens)
12. [Refresh Token Rotation](#12-refresh-token-rotation)
13. [Refresh Token Replay](#13-refresh-token-replay)
14. [Token Expiration](#14-token-expiration)
15. [Token Storage](#15-token-storage)
16. [Browser Authentication](#16-browser-authentication)
17. [Cookies](#17-cookies)
18. [CORS](#18-cors)
19. [CSRF](#19-csrf)
20. [Logout](#20-logout)
21. [Session Revocation](#21-session-revocation)
22. [Multiple Sessions](#22-multiple-sessions)
23. [Password Changes](#23-password-changes)
24. [Password Reset](#24-password-reset)
25. [Email Verification](#25-email-verification)
26. [Account Status](#26-account-status)
27. [Rate Limiting](#27-rate-limiting)
28. [Brute-Force Protection](#28-brute-force-protection)
29. [Authentication Middleware](#29-authentication-middleware)
30. [Request Authentication Flow](#30-request-authentication-flow)
31. [Current User](#31-current-user)
32. [Authentication Errors](#32-authentication-errors)
33. [Sensitive Information](#33-sensitive-information)
34. [JWT Secret Management](#34-jwt-secret-management)
35. [Key Rotation](#35-key-rotation)
36. [Clock and Time Handling](#36-clock-and-time-handling)
37. [Authentication Database Design](#37-authentication-database-design)
38. [Session Database Design](#38-session-database-design)
39. [Admin Authentication](#39-admin-authentication)
40. [RBAC Integration](#40-rbac-integration)
41. [Object-Level Authorization](#41-object-level-authorization)
42. [Authentication Events](#42-authentication-events)
43. [Audit Logging](#43-audit-logging)
44. [Authentication Metrics](#44-authentication-metrics)
45. [Authentication Logging](#45-authentication-logging)
46. [API Client Behavior](#46-api-client-behavior)
47. [Admin Session Handling](#47-admin-session-handling)
48. [Automatic Token Refresh](#48-automatic-token-refresh)
49. [Refresh Failure Handling](#49-refresh-failure-handling)
50. [Authentication Development Workflow](#50-authentication-development-workflow)
51. [Local Authentication Testing](#51-local-authentication-testing)
52. [Authentication Test Matrix](#52-authentication-test-matrix)
53. [Security Testing](#53-security-testing)
54. [Integration Testing](#54-integration-testing)
55. [End-to-End Testing](#55-end-to-end-testing)
56. [Common Authentication Bugs](#56-common-authentication-bugs)
57. [Troubleshooting](#57-troubleshooting)
58. [Production Deployment](#58-production-deployment)
59. [Incident Response](#59-incident-response)
60. [Authentication Review Checklist](#60-authentication-review-checklist)
61. [Definition of Done](#61-definition-of-done)
62. [Authentication Golden Rules](#62-authentication-golden-rules)

---

# 1. Authentication Principles

Authentication must be:

```text
Secure
Predictable
Short-lived where possible
Revocable
Observable
Testable
```

The authentication system should minimize the amount of long-lived credential material exposed to browsers and clients.

---

## 1.1 Core Model

The recommended lifecycle is:

```text
Credentials
    ↓
Authentication
    ↓
Session established
    ↓
Access token
    ↓
Protected API requests
    ↓
Refresh when necessary
    ↓
Rotation
    ↓
Logout / expiration / revocation
```

---

## 1.2 Authentication Is a Security Boundary

Everything received from a client is untrusted.

Never assume:

```text
Admin frontend
```

is trusted merely because it is the official application.

A user can:

- Modify JavaScript
- Call APIs directly
- Change requests
- Replay requests
- Forge headers
- Modify local state

The backend must authenticate every protected request independently.

---

# 2. Authentication vs Authorization

These concepts must remain separate.

### Authentication

```text
Who are you?
```

### Authorization

```text
What can you do?
```

Example:

```text
JWT valid
    ↓
Authenticated as User A
    ↓
Does User A have users:update?
    ↓
Authorization decision
```

A valid JWT does not automatically mean the caller can perform every operation.

---

# 3. Authentication Architecture

Conceptual architecture:

```text
                 ┌──────────────────┐
                 │ Browser / Client  │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Fastify API      │
                 └────────┬─────────┘
                          │
                 ┌────────▼────────┐
                 │ Auth Middleware │
                 └────────┬────────┘
                          │
                    Validate JWT
                          │
                          ▼
                 ┌──────────────────┐
                 │ Auth Context     │
                 └────────┬─────────┘
                          │
                          ▼
                 Authorization/RBAC
                          │
                          ▼
                    Application
```

Authentication infrastructure may also interact with:

```text
PostgreSQL
    │
    ├── Users
    ├── Sessions
    └── Refresh token state
```

---

# 4. Authentication Components

Typical components include:

```text
Registration
Login
Access token issuing
Refresh token issuing
Refresh rotation
Logout
Session revocation
Password hashing
Password reset
Email verification
Authentication middleware
Current-user resolution
Rate limiting
Audit logging
```

Not every deployment needs every component immediately.

---

# 5. User Identity

The authenticated identity should be represented by a stable user identifier.

Conceptually:

```ts
request.user = {
  id: string,
  // minimal additional trusted claims
};
```

Do not put the entire database user object into the request authentication context.

---

## 5.1 Minimal Identity

Authentication context should contain only what downstream authorization needs.

Avoid carrying:

```text
passwordHash
refreshTokenHash
private profile data
large relation graphs
```

---

# 6. Password Security

Passwords are high-value secrets.

Never store plaintext passwords.

Use a password hashing algorithm appropriate for password storage and configured by the application's security policy.

Examples of modern password-hashing families include:

```text
Argon2id
bcrypt
```

The project should use one consistent approved implementation rather than multiple algorithms without a migration plan.

---

## 6.1 Password Hashing

Conceptually:

```text
Password
   ↓
Password hashing function
   ↓
Password hash
   ↓
Database
```

At login:

```text
Password
   ↓
Verify against stored hash
   ↓
Success / failure
```

Never decrypt a password.

Password hashes are intended to be one-way verification artifacts.

---

## 6.2 Password Hash Parameters

Hash configuration should balance:

```text
Security
+
Server performance
```

Do not choose parameters solely because they are fast.

At the same time, avoid parameters that make ordinary authentication prohibitively expensive.

Benchmark under expected production hardware.

---

# 7. Registration

Typical registration flow:

```text
Client
  ↓
Validate input
  ↓
Normalize identity fields
  ↓
Check account policy
  ↓
Hash password
  ↓
Create user
  ↓
Create initial session if designed
  ↓
Return appropriate response
```

---

## 7.1 Registration Security

Registration should consider:

- Email normalization
- Duplicate accounts
- Password policy
- Rate limiting
- Abuse prevention
- Email verification
- Default role assignment
- Audit events

Do not allow users to choose privileged roles during ordinary registration.

---

## 7.2 Default Role

If the system uses RBAC, new users should receive a safe default role.

For example:

```text
Registration
    ↓
Default role
    ↓
Limited permissions
```

Never default ordinary registration to:

```text
admin
super-admin
```

---

# 8. Login

Typical flow:

```text
POST /auth/login
        ↓
Validate request
        ↓
Find user
        ↓
Verify password
        ↓
Check account status
        ↓
Create session
        ↓
Issue access token
        ↓
Issue refresh token
```

---

## 8.1 Failed Login

Failed authentication should not reveal whether a particular account exists when doing so creates an account-enumeration risk.

Avoid unnecessarily specific responses such as:

```text
Email exists but password is wrong.
```

Prefer a generic authentication failure where appropriate.

---

## 8.2 Successful Login

On successful authentication:

```text
Create session
 ↓
Issue access token
 ↓
Issue refresh token
 ↓
Record authentication event
```

Do not log the credentials or raw tokens.

---

# 9. Access Tokens

Access tokens are intended to be short-lived credentials used for API access.

Typical structure:

```text
JWT
 ├── header
 ├── payload
 └── signature
```

---

## 9.1 Short Lifetime

Access tokens should generally have a shorter lifetime than refresh tokens.

Conceptually:

```text
Access token
   ↓
Minutes
```

while:

```text
Refresh/session
   ↓
Hours / days depending on policy
```

Exact durations are application configuration.

---

## 9.2 Access Token Purpose

Access tokens should answer:

```text
Which authenticated session/user is this request associated with?
```

They should not become a complete user profile database.

---

# 10. JWT Claims

Keep claims minimal.

Common claims include:

```text
sub
iat
exp
iss
aud
jti
```

depending on the application's design.

---

## 10.1 Subject

`sub` should identify the authenticated principal/session subject according to the project's token design.

Do not use arbitrary mutable profile information as the primary identity.

---

## 10.2 Issuer and Audience

Where multiple services or token consumers exist, consider:

```text
iss
aud
```

to prevent accepting tokens intended for a different context.

---

## 10.3 JWT ID

`jti` may be useful when token-level identification is required.

Do not add claims merely because they exist in JWT specifications.

---

## 10.4 Avoid Sensitive Claims

Do not put:

```text
password
passwordHash
refreshToken
API keys
secrets
private data
```

inside JWT payloads.

Remember:

> JWT payloads are encoded, not inherently secret.

---

# 11. Refresh Tokens

Refresh tokens allow the client to obtain a new access token without repeatedly providing the user's password.

Conceptual flow:

```text
Access token expires
        ↓
Client sends refresh token
        ↓
Server validates session/token
        ↓
Rotate refresh token
        ↓
Issue new access token
        ↓
Issue new refresh token
```

---

# 12. Refresh Token Rotation

Refresh-token rotation is a major security control.

Instead of:

```text
One refresh token
    ↓
Used repeatedly
```

prefer:

```text
Refresh Token A
      ↓
Refresh
      ↓
Token B
      ↓
Refresh
      ↓
Token C
```

The previous token should no longer be valid according to the session/rotation design.

---

## 12.1 Why Rotate?

Rotation reduces the useful lifetime of a stolen refresh token.

If an attacker obtains:

```text
Refresh Token A
```

and the legitimate user already rotates it:

```text
A → B
```

then token A should not remain indefinitely usable.

---

# 13. Refresh Token Replay

A refresh token that has already been consumed should not normally be accepted again.

Example:

```text
Legitimate client
A → B

Attacker
A → ?
```

The server should detect the replay according to the token-family/session design.

Possible response:

```text
Revoke affected session/token family
Require re-authentication
Record security event
```

Exact behavior should follow the application's threat model.

---

## 13.1 Replay Detection

Replay handling should be:

```text
Atomic
Observable
Tested
```

Avoid a race condition where two concurrent refresh requests both successfully rotate the same token.

---

# 14. Token Expiration

Access and refresh credentials must have explicit expiration.

Important concepts:

```text
iat = issued at
exp = expiration
```

The server must reject expired tokens.

Do not rely on the client to stop using an expired credential.

---

# 15. Token Storage

Storage strategy depends on the client architecture.

For browser-based Admin applications, prefer security-conscious storage that minimizes exposure to JavaScript where practical.

Potential browser mechanisms include:

```text
HttpOnly cookies
Secure cookies
SameSite controls
```

Avoid storing long-lived sensitive credentials in easily script-readable storage without a deliberate security rationale.

---

## 15.1 Access Token Storage

If an access token is held in memory:

```text
Page refresh
 ↓
Token may disappear
 ↓
Refresh/session mechanism restores access
```

This can reduce persistent exposure.

If tokens are stored persistently, understand the XSS implications.

---

## 15.2 Refresh Token Storage

Refresh tokens are especially sensitive because they can create new access tokens.

For browser applications, an HttpOnly secure cookie is often preferable to exposing the refresh token directly to application JavaScript.

The final choice must match the deployed architecture.

---

# 16. Browser Authentication

For the Admin application:

```text
Browser
 ↓
Login
 ↓
Authentication session
 ↓
API access
```

The browser should not be treated as a trusted environment.

---

## 16.1 Browser Threats

Consider:

```text
XSS
CSRF
Token theft
Malicious browser extensions
Session fixation
Open redirects
Clickjacking
```

No single mechanism eliminates all threats.

Use defense in depth.

---

# 17. Cookies

If cookies are used for authentication, configure appropriate attributes.

Important attributes:

```text
HttpOnly
Secure
SameSite
Path
Domain
```

---

## 17.1 HttpOnly

`HttpOnly` prevents normal JavaScript access to the cookie.

This reduces exposure during many XSS scenarios.

It does not make the application immune to XSS.

---

## 17.2 Secure

Authentication cookies should use:

```text
Secure
```

in HTTPS environments.

---

## 17.3 SameSite

Use an appropriate:

```text
SameSite
```

policy based on the application's frontend/API deployment architecture.

Do not select a permissive policy without understanding CSRF implications.

---

# 18. CORS

CORS controls which browser origins may make cross-origin requests.

For local development, an allowed origin may be:

```text
http://localhost:5173
```

Production should use explicit trusted origins.

Avoid:

```text
*
```

for credentialed authentication flows.

---

# 19. CSRF

Cookie-based authentication introduces CSRF considerations because browsers automatically attach cookies.

Possible controls include:

```text
SameSite cookies
CSRF tokens
Origin validation
Referer validation where appropriate
```

The chosen approach should match the application's authentication architecture.

---

## 19.1 Bearer Tokens and CSRF

Bearer tokens manually attached by application code have different CSRF characteristics from automatically attached cookies.

However, they introduce other risks such as token exposure through JavaScript and XSS.

Security decisions should consider the entire threat model rather than one vulnerability category.

---

# 20. Logout

Logout should invalidate the authentication session according to the application's session design.

Conceptually:

```text
Logout
 ↓
Revoke session / refresh state
 ↓
Clear authentication cookie/state
 ↓
Return success
```

---

## 20.1 Logout Is Not Only Client-Side

Do not implement logout as:

```text
delete localStorage
```

while leaving the server-side refresh session valid.

For server-managed sessions, logout should invalidate the server-side session or refresh-token state.

---

# 21. Session Revocation

Revocation may be required when:

```text
User logs out
Password changes
Password reset completes
Admin disables account
Security incident occurs
Refresh token replay detected
User requests "log out everywhere"
```

---

## 21.1 Revocation Scope

Possible scopes:

```text
Single session
All sessions for user
Token family
All sessions after security event
```

Use the smallest scope that satisfies the security requirement unless broader revocation is necessary.

---

# 22. Multiple Sessions

Users may authenticate from:

```text
Laptop
Phone
Browser
Admin workstation
```

Sessions should be independently manageable when the product requires it.

Useful session metadata may include:

```text
Created at
Last used at
Approximate device information
Session identifier
Revocation state
Expiration
```

Do not store unnecessary tracking information.

---

# 23. Password Changes

Changing a password is a security-sensitive operation.

Recommended flow:

```text
Authenticated user
 ↓
Verify current password
 ↓
Validate new password
 ↓
Hash new password
 ↓
Update password
 ↓
Apply session policy
 ↓
Audit event
```

---

## 23.1 Session Policy

After a password change, consider revoking other sessions.

A security-sensitive application may choose:

```text
Password changed
 ↓
Revoke all existing sessions
 ↓
Create current session again
```

The exact product policy should be explicit.

---

# 24. Password Reset

Password reset must not require the user to know the existing password.

Typical flow:

```text
Request reset
 ↓
Generate random reset token
 ↓
Store secure representation
 ↓
Send reset link
 ↓
User submits token + new password
 ↓
Validate token
 ↓
Set new password
 ↓
Invalidate reset token
 ↓
Apply session revocation policy
```

---

## 24.1 Reset Tokens

Reset tokens should be:

```text
Random
High entropy
Short-lived
Single-use
Stored securely
```

Never use predictable values such as:

```text
userId + timestamp
```

---

## 24.2 Account Enumeration

Password reset requests should be careful not to reveal whether an account exists.

Prefer a generic user-facing response when appropriate.

---

# 25. Email Verification

If email verification is part of the product:

```text
Register
 ↓
Unverified account
 ↓
Verification token
 ↓
Email link
 ↓
Verify
 ↓
Account becomes verified
```

Verification tokens should have:

```text
Expiration
Single-use semantics
High entropy
Revocation/invalidation behavior
```

---

# 26. Account Status

Authentication should consider account state.

Possible states:

```text
ACTIVE
SUSPENDED
DISABLED
PENDING_VERIFICATION
LOCKED
```

The exact model depends on the application.

---

## 26.1 Authentication vs Account Status

A valid password does not necessarily mean login should succeed.

Example:

```text
Correct password
+
Account suspended
=
Authentication denied
```

---

# 27. Rate Limiting

Authentication endpoints are high-value targets.

Apply appropriate rate limiting to:

```text
Login
Registration
Password reset
Refresh
Verification
MFA
```

Rate limits should consider:

```text
IP
Account identity
Session
Endpoint
Risk level
```

Do not make limits so aggressive that normal users are constantly locked out.

---

# 28. Brute-Force Protection

Consider layered controls:

```text
Rate limiting
+
Progressive delay
+
Account/session monitoring
+
Suspicious activity detection
```

Avoid permanent account lockout as the only defense because attackers can abuse it to deny service to legitimate users.

---

# 29. Authentication Middleware

Protected API routes should use a centralized authentication mechanism.

Conceptually:

```text
Request
 ↓
Extract credential
 ↓
Validate credential
 ↓
Verify signature
 ↓
Validate expiration
 ↓
Resolve identity
 ↓
Attach auth context
 ↓
Continue
```

---

## 29.1 Middleware Should Not Authorize Everything

Authentication middleware should establish identity.

Authorization should be performed by:

```text
Permission/policy layer
```

where the operation requires it.

---

# 30. Request Authentication Flow

A protected request:

```text
HTTP Request
      ↓
Credential present?
      │
      ├── No → 401
      │
      ▼
Credential valid?
      │
      ├── No → 401
      │
      ▼
Identity resolved
      ↓
Authorization
      │
      ├── No permission → 403
      │
      ▼
Service
      ↓
Response
```

The exact error semantics should follow `API_CONVENTIONS.md`.

---

# 31. Current User

The application may provide a current-user endpoint such as:

```text
GET /auth/me
```

or an equivalent user endpoint.

This allows the Admin application to retrieve trusted server-side identity information.

---

## 31.1 Current User Response

Return only fields required by the frontend.

Do not return:

```text
passwordHash
refresh token state
private security fields
```

---

# 32. Authentication Errors

Authentication errors should be stable and intentionally designed.

Common categories:

```text
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
INVALID_TOKEN
TOKEN_EXPIRED
SESSION_REVOKED
REFRESH_TOKEN_INVALID
REFRESH_TOKEN_REUSED
ACCOUNT_DISABLED
```

The exact error codes belong to the shared API contract.

---

# 33. Sensitive Information

Authentication code must treat all credentials as secrets.

Never log:

```text
Password
Password hash
Access token
Refresh token
Reset token
Verification token
Cookie value
Authorization header
JWT secret
```

---

## 33.1 Error Messages

Do not expose internal authentication implementation details.

Bad:

```text
JWT verification failed because secret key X was missing.
```

Prefer:

```text
Authentication required.
```

Detailed diagnostic information belongs in controlled server logs.

---

# 34. JWT Secret Management

JWT signing secrets must be:

```text
High entropy
Stored outside source control
Loaded from secure configuration
Rotated according to policy
Protected from logs
```

Never commit:

```text
JWT_SECRET=real-secret
```

to the repository.

---

# 35. Key Rotation

JWT signing keys may eventually require rotation.

A production key rotation design may use:

```text
Current signing key
+
Previous verification keys
```

during a controlled transition.

Conceptually:

```text
Issue tokens with Key B
Verify Key A + Key B temporarily
        ↓
Old tokens expire
        ↓
Remove Key A
```

Do not rotate a signing key without understanding token lifetime and active sessions.

---

# 36. Clock and Time Handling

JWT validation depends on accurate server time.

Infrastructure should use synchronized clocks.

Be careful with:

```text
iat
exp
nbf
```

and clock skew.

Do not create excessive expiration tolerance just to hide clock configuration problems.

---

# 37. Authentication Database Design

Typical authentication data may include:

```text
User
Session
Refresh token state
Password reset token state
Email verification state
```

The exact schema is defined in `DATABASE.md` and the Prisma schema.

---

## 37.1 User Model

A user may contain:

```text
id
email
passwordHash
status
emailVerifiedAt
createdAt
updatedAt
```

This is illustrative.

Only store fields required by the actual domain.

---

# 38. Session Database Design

A session record may contain:

```text
id
userId
token family/state
createdAt
lastUsedAt
expiresAt
revokedAt
```

Raw refresh tokens should not be stored when the security design calls for hashed storage.

---

## 38.1 Session Ownership

Every session should map clearly to a user.

Database relationship:

```text
User
  │
  └── Session
```

If a user is disabled, session policy must define what happens to existing sessions.

---

# 39. Admin Authentication

The Admin frontend must use the same authoritative API authentication system.

Do not create a second independent authentication system merely for Admin.

Preferred:

```text
Admin
 ↓
Fastify Auth
 ↓
User identity
 ↓
RBAC
```

---

## 39.1 Admin Does Not Mean Trusted

An Admin user has elevated permissions, but their browser remains untrusted.

Every privileged API operation must be authorized server-side.

---

# 40. RBAC Integration

Authentication establishes:

```text
userId
```

RBAC determines:

```text
permissions
```

Conceptual flow:

```text
JWT
 ↓
User ID
 ↓
Roles
 ↓
Permissions
 ↓
Policy
 ↓
Allow / Deny
```

---

## 40.1 Permission Changes

If permissions can change while a user has an active session, decide whether authorization should:

```text
Read current permissions from database/cache
```

or:

```text
Use permissions embedded in token
```

For rapidly changing administrative permissions, server-side permission resolution is often safer because permission changes take effect without waiting for long-lived tokens to expire.

The chosen architecture should be explicit.

---

# 41. Object-Level Authorization

Authentication does not prove resource ownership.

Example:

```text
JWT:
userId = A
```

Request:

```text
GET /todos/B
```

The server must determine:

```text
Can User A access Todo B?
```

Do not assume:

```text
authenticated = authorized
```

---

# 42. Authentication Events

Useful security events include:

```text
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
REFRESH
REFRESH_REUSE_DETECTED
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
EMAIL_VERIFIED
ACCOUNT_DISABLED
SESSION_REVOKED
```

The exact event vocabulary should be centralized.

---

# 43. Audit Logging

Authentication security events may be recorded in audit logs.

Include:

```text
Timestamp
Actor/user ID where known
Action
Outcome
Request ID
Session ID where appropriate
Safe metadata
```

Do not include raw credentials.

---

# 44. Authentication Metrics

Useful metrics include:

```text
auth_login_success_total
auth_login_failure_total
auth_refresh_success_total
auth_refresh_failure_total
auth_refresh_reuse_total
auth_logout_total
auth_password_reset_total
auth_account_lockout_total
```

Metric names should follow the application's established naming convention.

---

## 44.1 Alerting

Potential alerts:

```text
Sudden login failure spike
Refresh replay spike
Large increase in disabled-account login attempts
Unexpected authentication latency
```

Do not create alerts for normal isolated failures.

---

# 45. Authentication Logging

Use structured logs.

A useful event may contain:

```text
event: authentication_failure
userId: safe identifier if known
requestId: correlation ID
reason: invalid_credentials
```

Do not include:

```text
password
token
authorization header
cookie
secret
```

---

# 46. API Client Behavior

The Admin API client should centralize authentication behavior.

Preferred:

```text
React component
 ↓
Query/mutation hook
 ↓
API client
 ↓
HTTP request
```

The API client should handle:

- Base URL
- Credentials
- Authentication headers/cookies
- Error parsing
- Refresh behavior where appropriate

Avoid implementing authentication independently in every component.

---

# 47. Admin Session Handling

The Admin should maintain a clear session state:

```text
Unknown
   ↓
Loading session
   ↓
Authenticated / Unauthenticated
```

Do not briefly render privileged pages while authentication status is still unknown.

---

## 47.1 Session Bootstrap

Typical flow:

```text
Admin starts
 ↓
Check existing session
 ↓
Call current-user endpoint
 ↓
Receive user
 ↓
Resolve permissions
 ↓
Render application
```

If the session is invalid:

```text
Clear local auth state
 ↓
Redirect to login
```

---

# 48. Automatic Token Refresh

If the Admin uses refresh tokens, automatic refresh should be centralized.

Conceptual flow:

```text
API request
 ↓
Access token expired
 ↓
Refresh once
 ↓
Receive new token/session
 ↓
Retry original request
```

---

## 48.1 Refresh Storm Prevention

If multiple requests fail simultaneously:

```text
Request A → expired
Request B → expired
Request C → expired
```

do not blindly execute:

```text
3 refresh requests
```

Prefer a single-flight strategy:

```text
Request A ─┐
Request B ─┼→ one refresh operation → retry
Request C ─┘
```

This reduces race conditions and refresh-token rotation conflicts.

---

# 49. Refresh Failure Handling

If refresh fails because the session is invalid:

```text
Clear local auth state
 ↓
Do not endlessly retry
 ↓
Redirect to login
```

Do not create an infinite loop:

```text
401
 ↓
refresh
 ↓
401
 ↓
refresh
 ↓
401
 ↓
...
```

---

# 50. Authentication Development Workflow

When modifying authentication:

```text
1. Read SECURITY.md
2. Read this document
3. Inspect existing auth implementation
4. Define threat model
5. Add/update tests
6. Implement smallest safe change
7. Test success path
8. Test failure path
9. Test replay/expiration/revocation where relevant
10. Review logs
11. Review token contents
12. Review API errors
13. Run security-relevant suite
14. Update documentation
```

---

# 51. Local Authentication Testing

Use synthetic users.

Example:

```text
admin@example.local
manager@example.local
readonly@example.local
```

Use test passwords that are not reused anywhere else.

---

## 51.1 Test Login

Verify:

```text
Correct credentials
Incorrect password
Unknown account
Disabled account
Malformed request
Rate limit
```

---

## 51.2 Test Refresh

Verify:

```text
Valid refresh
Expired refresh
Invalid refresh
Revoked session
Reused refresh
Concurrent refresh
```

---

# 52. Authentication Test Matrix

| Scenario                     | Expected                     |
| ---------------------------- | ---------------------------- |
| No credentials               | 401                          |
| Malformed credentials        | 401                          |
| Invalid access token         | 401                          |
| Expired access token         | 401                          |
| Valid access token           | Continue                     |
| Invalid refresh token        | Deny                         |
| Expired refresh token        | Deny                         |
| Revoked session              | Deny                         |
| Reused refresh token         | Security response/revocation |
| Valid refresh                | Rotate                       |
| Correct password             | Login                        |
| Wrong password               | Deny                         |
| Disabled account             | Deny                         |
| Password reset token expired | Deny                         |
| Password reset token reused  | Deny                         |
| Missing permission           | 403                          |
| Wrong resource owner         | Deny                         |

The exact HTTP error semantics should follow the API contract.

---

# 53. Security Testing

Authentication security tests should include:

### Credential attacks

```text
Brute force
Credential stuffing simulation
Malformed input
Oversized input
```

### Token attacks

```text
Modified JWT
Expired JWT
Wrong signing key
Wrong algorithm
Wrong issuer
Wrong audience
Replay
Token substitution
```

### Session attacks

```text
Revoked session
Concurrent refresh
Refresh reuse
Logout then refresh
Password change then old session
```

### Browser attacks

```text
CSRF
XSS-related token exposure
Cookie configuration
CORS misconfiguration
Open redirect
```

---

# 54. Integration Testing

Integration tests should verify the real boundaries:

```text
HTTP
 ↓
Fastify
 ↓
Authentication
 ↓
Service
 ↓
Database
```

Examples:

```text
Login creates session
Refresh rotates token
Logout revokes session
Disabled user cannot authenticate
Permission checks use authenticated identity
```

---

# 55. End-to-End Testing

An Admin E2E test might look like:

```text
Open Admin
 ↓
Login
 ↓
Session established
 ↓
Open Users
 ↓
Load user list
 ↓
Create user
 ↓
Assign role
 ↓
Refresh page
 ↓
Verify state
 ↓
Logout
```

Test privileged actions with users having different roles.

---

# 56. Common Authentication Bugs

## 56.1 Authentication in Frontend Only

Bad:

```text
if token exists:
    assume logged in
```

The API must validate credentials.

---

## 56.2 Long-Lived Access Tokens

Long-lived access tokens increase exposure after theft.

Prefer short-lived access tokens and controlled refresh sessions.

---

## 56.3 Reusable Refresh Tokens

A stolen refresh token that can be reused indefinitely creates significant risk.

Use rotation and replay detection where supported by the architecture.

---

## 56.4 Logging Tokens

Never do:

```ts
logger.info({ token }, "login");
```

---

## 56.5 Password in JWT

Never include:

```text
password
passwordHash
```

in a JWT.

---

## 56.6 Trusting JWT Claims Forever

JWT claims may become stale.

For security-sensitive authorization, determine whether current server-side state must be checked.

---

## 56.7 Infinite Refresh Loops

Always cap refresh attempts.

---

## 56.8 Refresh Race Conditions

Concurrent refresh requests can invalidate one another if rotation is not coordinated.

Implement single-flight behavior in clients and atomic server-side rotation.

---

# 57. Troubleshooting

## Login Returns 401

Check:

```text
Request schema
 ↓
Email normalization
 ↓
User lookup
 ↓
Password verification
 ↓
Account status
 ↓
Rate limiting
```

---

## Protected API Returns 401

Check:

```text
Credential sent?
 ↓
Correct header/cookie?
 ↓
JWT valid?
 ↓
Signature correct?
 ↓
Expiration valid?
 ↓
Authentication hook running?
```

---

## Protected API Returns 403

Authentication succeeded.

Check:

```text
User roles
 ↓
Permissions
 ↓
Resource ownership
 ↓
Policy
```

---

## Refresh Fails

Check:

```text
Refresh credential exists
 ↓
Session exists
 ↓
Session not revoked
 ↓
Token not expired
 ↓
Rotation state valid
 ↓
No replay detected
```

---

## Admin Logs Out Unexpectedly

Check:

```text
Access token lifetime
Refresh failure
Cookie configuration
CORS
API availability
Session revocation
Clock synchronization
```

---

## Refresh Happens Repeatedly

Check:

```text
Access token expiry handling
Refresh response
Client token update
Retry interceptor
Refresh-loop guard
```

---

# 58. Production Deployment

Authentication deployment requires:

```text
HTTPS
Secure secrets
Correct CORS
Correct cookie configuration
Correct token lifetime
Database availability
Rate limiting
Logging
Metrics
Clock synchronization
Backup/recovery
```

---

## 58.1 HTTPS

Authentication credentials should be transmitted only over HTTPS in production.

Do not deploy production authentication over plaintext HTTP.

---

## 58.2 Secrets

Production secrets must come from a secure secret-management system appropriate to the deployment environment.

Do not store them in:

```text
Git
Docker image
Frontend bundle
Public configuration
Logs
```

---

## 58.3 Deployment Compatibility

When changing authentication behavior:

```text
Old clients
+
New clients
+
Existing sessions
```

must be considered.

A deployment that invalidates every session unexpectedly can create a major user-impact event.

---

# 59. Incident Response

Authentication incidents may include:

```text
Credential leak
JWT secret compromise
Refresh token theft
Refresh replay spike
Account takeover
Brute-force attack
Session hijacking
```

Initial response may include:

```text
1. Confirm incident
2. Contain attack
3. Preserve evidence
4. Revoke affected sessions
5. Rotate compromised secrets/keys
6. Assess affected users
7. Monitor
8. Remediate root cause
9. Document incident
```

---

## 59.1 JWT Secret Compromise

If a signing secret is compromised:

```text
Assume tokens may be forgeable
 ↓
Rotate signing key/secret
 ↓
Invalidate affected sessions if required
 ↓
Deploy verification changes
 ↓
Monitor authentication activity
```

The exact response depends on the token architecture.

---

# 60. Authentication Review Checklist

## Credentials

- [ ] Passwords are hashed.
- [ ] Passwords are never logged.
- [ ] Password policy is enforced.
- [ ] Password reset tokens are secure.
- [ ] Verification tokens are secure.

## JWT

- [ ] Access tokens are short-lived.
- [ ] Claims are minimal.
- [ ] Tokens have expiration.
- [ ] Signing secrets are protected.
- [ ] Algorithm handling is explicit.
- [ ] Issuer/audience are validated where applicable.

## Refresh

- [ ] Refresh tokens expire.
- [ ] Refresh rotation is implemented where required.
- [ ] Reuse/replay is detected.
- [ ] Rotation is atomic.
- [ ] Raw refresh tokens are not unnecessarily stored.
- [ ] Concurrent refresh behavior is tested.

## Sessions

- [ ] Sessions can be revoked.
- [ ] Logout invalidates server-side state where required.
- [ ] Password changes apply session policy.
- [ ] Disabled users cannot use active sessions when policy requires revocation.

## Browser

- [ ] HTTPS is required in production.
- [ ] Cookies use appropriate `HttpOnly`.
- [ ] Cookies use `Secure` in HTTPS deployments.
- [ ] `SameSite` is intentional.
- [ ] CORS is restrictive.
- [ ] CSRF strategy is documented.

## API

- [ ] Protected routes require authentication.
- [ ] Authentication is centralized.
- [ ] Authorization is separate.
- [ ] Errors do not leak secrets.
- [ ] Sensitive responses are minimized.

## Abuse Protection

- [ ] Login is rate-limited.
- [ ] Refresh is protected.
- [ ] Password reset is protected.
- [ ] Brute-force controls exist.
- [ ] Account enumeration is considered.

## Observability

- [ ] Authentication failures are measurable.
- [ ] Security events are auditable.
- [ ] Tokens are not logged.
- [ ] Alerts exist for meaningful anomalies.

## Testing

- [ ] Login success tested.
- [ ] Login failure tested.
- [ ] Token expiration tested.
- [ ] Refresh tested.
- [ ] Rotation tested.
- [ ] Replay tested.
- [ ] Revocation tested.
- [ ] Password reset tested.
- [ ] Authorization integration tested.
- [ ] Admin E2E authentication tested.

---

# 61. Definition of Done

An authentication change is complete when applicable requirements are satisfied.

## Design

- [ ] Threat model considered.
- [ ] Authentication and authorization responsibilities are separated.
- [ ] Token/session lifecycle is explicit.
- [ ] Failure behavior is defined.

## Security

- [ ] Credentials are protected.
- [ ] Secrets are not committed.
- [ ] Tokens are appropriately short-lived.
- [ ] Refresh lifecycle is secure.
- [ ] Revocation behavior is defined.
- [ ] Browser threats are considered.
- [ ] Rate limiting is considered.

## Implementation

- [ ] Authentication middleware is updated if required.
- [ ] Service logic is updated.
- [ ] Database changes are migrated.
- [ ] API contracts are updated.
- [ ] Admin client is updated if necessary.

## Testing

- [ ] Success path tested.
- [ ] Failure path tested.
- [ ] Expiration tested.
- [ ] Revocation tested.
- [ ] Refresh rotation tested.
- [ ] Replay tested where applicable.
- [ ] Authorization tested.
- [ ] E2E flow tested where applicable.

## Operations

- [ ] Logs are safe.
- [ ] Metrics are available.
- [ ] Alerts are considered.
- [ ] Secret rotation is understood.
- [ ] Incident response implications are documented.

## Documentation

- [ ] Authentication behavior is documented.
- [ ] Environment variables are documented.
- [ ] API contract changes are documented.
- [ ] Security implications are documented.

---

# 62. Authentication Golden Rules

```text
1. Authentication identifies the caller.
2. Authorization decides what the caller may do.
3. Never trust the frontend as a security boundary.
4. Never store plaintext passwords.
5. Never log passwords or tokens.
6. Keep access tokens short-lived.
7. Protect refresh tokens carefully.
8. Rotate refresh tokens where the architecture supports it.
9. Detect refresh-token replay.
10. Make token rotation atomic.
11. Support session revocation.
12. Treat logout as a server-side security event when sessions are server-managed.
13. Use secure cookie attributes for cookie-based browser authentication.
14. Use restrictive CORS.
15. Consider CSRF whenever browsers automatically attach credentials.
16. Rate-limit authentication endpoints.
17. Avoid account enumeration where practical.
18. Keep JWT claims minimal.
19. Validate token expiration and relevant claims.
20. Protect signing secrets.
21. Plan key/secret rotation.
22. Do not put secrets inside JWT payloads.
23. Do not confuse authentication with authorization.
24. Check resource ownership for sensitive operations.
25. Test negative authentication paths.
26. Test concurrent refresh behavior.
27. Make refresh failures terminate cleanly.
28. Do not create infinite retry loops.
29. Audit important authentication events.
30. Monitor abnormal authentication activity.
31. Use synthetic credentials in development.
32. Never use production credentials locally.
33. Revoke sessions after security-sensitive events according to policy.
34. Document authentication changes.
35. Prefer secure defaults over convenience.
```

---

# Authentication Lifecycle

The complete conceptual lifecycle is:

```text
                     ┌───────────────┐
                     │ Registration  │
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Password Hash │
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │     Login     │
                     └───────┬───────┘
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
           Access Token            Session/
                  │                Refresh State
                  │                     │
                  ▼                     │
           Protected APIs               │
                  │                     │
                  └──────────┬──────────┘
                             ▼
                         Expiration
                             │
                             ▼
                          Refresh
                             │
                             ▼
                         Rotation
                             │
                       ┌─────┴─────┐
                       ▼           ▼
                    Success      Replay
                       │           │
                       ▼           ▼
                 New Session    Revoke/
                 Credentials    Investigate
                       │
                       ▼
                  Logout / Expire
                       │
                       ▼
                   Revocation
```

Authentication should remain a **small, explicit, security-focused subsystem** rather than being scattered throughout the application.

The guiding principle is:

> **Authenticate centrally, issue minimal credentials, rotate and revoke safely, authorize independently, and test every failure path.**
