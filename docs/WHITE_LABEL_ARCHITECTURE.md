# White-Label Architecture

**Project:** Gym SaaS Platform  
**Document:** White-Label Architecture  
**Status:** Proposed  
**Version:** 1.0  
**Last Updated:** 2026-09-09

---

# 1. Purpose

This document defines the architecture for delivering **tenant-specific white-label applications** from a shared Gym SaaS platform.

Each gym/tenant may receive:

- A branded public website
- A branded tenant web application
- A branded native iOS Member application
- A branded native Android Member application
- A branded native iOS Staff application
- A branded native Android Staff application

Example:

```text
Gold's Gym
├── Website
├── Gold's Gym Member iOS
├── Gold's Gym Member Android
├── Gold's Gym Staff iOS
└── Gold's Gym Staff Android
```

Another tenant:

```text
Fitness Pro
├── Website
├── Fitness Pro Member iOS
├── Fitness Pro Member Android
├── Fitness Pro Staff iOS
└── Fitness Pro Staff Android
```

The applications must be **separate products from the end user's perspective**, while sharing the same underlying source code and platform infrastructure wherever practical.

---

# 2. Core Architecture Decision

The platform uses:

> **One shared source codebase per application type + tenant-specific build configuration + separate application identities.**

We do NOT create separate source repositories for every gym.

Incorrect:

```text
goldsgym-ios/
fitnesspro-ios/
powerfit-ios/
```

Correct:

```text
apps/
├── member-ios/
├── member-android/
├── staff-ios/
└── staff-android/
```

The build system generates tenant-specific applications.

```text
Shared Source
      │
      ▼
Tenant Configuration
      │
      ▼
White-Label Build
      │
      ├── iOS
      └── Android
```

---

# 3. Application Architecture

The complete platform contains separate applications.

```text
gym-platform/
│
├── apps/
│   │
│   ├── platform-api/
│   │
│   ├── super-admin/
│   │
│   ├── tenant-web/
│   │
│   ├── tenant-website/
│   │
│   ├── member-ios/
│   │
│   ├── member-android/
│   │
│   ├── staff-ios/
│   │
│   └── staff-android/
```

The Super Admin application is independent.

```text
Super Admin
      │
      ▼
super-admin
      │
      ▼
Platform API
```

Tenant applications are separate clients:

```text
Tenant
  │
  ├── Website
  ├── Tenant Web
  ├── Member iOS
  ├── Member Android
  ├── Staff iOS
  └── Staff Android
```

---

# 4. White-Label Application Types

There are two native application products.

## 4.1 Member Application

The Member application is used by gym customers.

```text
Member App
├── iOS
└── Android
```

Features may include:

```text
Authentication
Profile
Gym information
Workout plans
Workout sessions
Exercise tracking
Progress
Personal records
Body measurements
Attendance
Membership
Payments
Notifications
Messages
```

---

# 5. Staff Application

The Staff application is used by:

```text
OWNER
ADMIN
TRAINER
```

```text
Staff App
├── iOS
└── Android
```

The same source application can expose different functionality based on permissions.

```text
Staff
  │
  ├── OWNER
  ├── ADMIN
  └── TRAINER
```

Example:

```text
OWNER
├── Members
├── Trainers
├── Payments
├── Reports
├── Settings
└── Branding

TRAINER
├── Assigned Members
├── Workouts
├── Progress
└── Attendance
```

Authorization is enforced by the backend.

The mobile application must never be the final security authority.

---

# 6. Native Technology

All mobile applications are native.

## iOS

```text
Swift
SwiftUI
```

## Android

```text
Kotlin
Jetpack Compose
```

The platform does not use:

```text
React Native
Flutter
Capacitor
Cordova
PWA
WebView-based application
```

for the native mobile products.

---

# 7. Shared Backend

All white-label applications communicate with the centralized platform API.

```text
Gold's Gym Member iOS
        │
Gold's Gym Member Android
        │
Gold's Gym Staff iOS
        │
Gold's Gym Staff Android
        │
Fitness Pro Member iOS
        │
Fitness Pro Staff Android
        │
        ▼
   Central Platform API
        │
        ▼
   PostgreSQL / Redis / Storage
```

The mobile application must not communicate directly with PostgreSQL or other internal infrastructure.

---

# 8. Tenant Identification

Each white-label application has a known tenant identity at build time.

Example:

```text
Gold's Gym Member iOS
    ↓
tenant = goldsgym
```

However, the client-provided tenant identifier must not be treated as trusted authorization.

The backend must still validate:

```text
Authenticated User
      +
Tenant
      +
Membership
      +
Role
      +
Permissions
```

---

# 9. Tenant Configuration

Tenant configuration is stored centrally.

Recommended model:

```text
Tenant
├── id
├── name
├── slug
├── status
└── ...
```

Branding:

```text
TenantBranding
├── tenantId
├── logo
├── favicon
├── primaryColor
├── secondaryColor
├── accentColor
├── font
├── appIcon
├── splashScreen
└── ...
```

Mobile configuration:

```text
TenantMobileApp
├── tenantId
├── applicationType
├── platform
├── appName
├── bundleId
├── packageName
├── appIcon
├── splashScreen
├── version
├── buildNumber
└── status
```

---

# 10. Application Identity

Every white-label application must have a unique application identity.

## iOS

The application is identified by its Bundle ID.

Example:

```text
com.yourplatform.goldsgym.member
com.yourplatform.goldsgym.staff

com.yourplatform.fitnesspro.member
com.yourplatform.fitnesspro.staff
```

## Android

The application is identified by its package/application ID.

Example:

```text
com.yourplatform.goldsgym.member
com.yourplatform.goldsgym.staff

com.yourplatform.fitnesspro.member
com.yourplatform.fitnesspro.staff
```

Application identities must be unique across tenants.

---

# 11. Naming Convention

Recommended naming:

```text
com.<platform>.<tenant>.<application>
```

Examples:

```text
com.gymplatform.goldsgym.member
com.gymplatform.goldsgym.staff

com.gymplatform.fitnesspro.member
com.gymplatform.fitnesspro.staff
```

The tenant slug must be:

- stable
- lowercase
- URL/package safe
- unique
- immutable after application publication unless a migration strategy exists

---

# 12. Application Name

The visible application name comes from tenant configuration.

Example:

```text
Tenant:
Gold's Gym

Member Application:
Gold's Gym

Staff Application:
Gold's Gym Staff
```

Another:

```text
Tenant:
Fitness Pro

Member Application:
Fitness Pro

Staff Application:
Fitness Pro Staff
```

The source code does not hard-code the tenant name.

---

# 13. Application Icon

Every tenant may have its own:

```text
App Icon
```

Assets should be stored centrally.

Example:

```text
storage/
└── tenants/
    └── tenant_123/
        └── mobile/
            ├── member/
            │   ├── icon
            │   └── splash
            │
            └── staff/
                ├── icon
                └── splash
```

The build pipeline retrieves the correct assets.

---

# 14. Splash Screen

Each white-label application can have tenant-specific splash branding.

Configuration:

```text
TenantMobileApp
├── splashScreen
├── splashBackground
└── splashLogo
```

The build system injects these assets into the native application.

---

# 15. App Theme

Tenant branding should support:

```text
Primary Color
Secondary Color
Accent Color
Background
Text Color
Dark Mode
Typography
```

Example:

```json
{
  "primaryColor": "#000000",
  "secondaryColor": "#FFD700",
  "accentColor": "#FFFFFF"
}
```

The native applications map these values to native design tokens.

---

# 16. Design Tokens

Native applications should not scatter raw colors throughout the source code.

Instead:

```text
Tenant Branding
      ↓
Design Tokens
      ↓
Native UI
```

iOS:

```text
Theme
├── primary
├── secondary
├── accent
├── background
└── text
```

Android:

```text
Theme
├── primary
├── secondary
├── accent
├── background
└── text
```

This makes white-labeling maintainable.

---

# 17. Build Configuration

A tenant-specific build should be generated from configuration.

Example:

```text
TENANT_SLUG=goldsgym
APP_TYPE=member
PLATFORM=ios
```

produces:

```text
Gold's Gym Member iOS
```

Another:

```text
TENANT_SLUG=fitnesspro
APP_TYPE=staff
PLATFORM=android
```

produces:

```text
Fitness Pro Staff Android
```

---

# 18. Configuration Sources

Configuration should be separated into:

## Build-time configuration

Used for:

```text
Bundle ID
Package ID
App name
App icon
Splash screen
Store metadata
Signing configuration
```

## Runtime configuration

Used for:

```text
Tenant settings
Feature flags
User permissions
Remote configuration
API configuration
Notification settings
```

This distinction is important.

---

# 19. Build-Time vs Runtime

```text
                   Tenant Configuration
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
         Build Config             Runtime Config
              │                         │
              ▼                         ▼
       Native App Identity        API Configuration
       App Icon                   Features
       Splash                     Branding
       Store Name                 Permissions
       Signing                    Tenant Settings
```

---

# 20. Runtime Tenant Validation

Even though the application is built for a tenant, the API must validate the tenant.

Example:

```text
Gold's Gym App
       │
       ▼
API Request
       │
       ▼
Authenticated User
       │
       ▼
Does user belong to Gold's Gym?
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
Allow    Reject
```

This prevents a compromised client from changing a tenant identifier and accessing another gym.

---

# 21. White-Label Build Pipeline

The recommended build pipeline:

```text
Super Admin
     │
     ▼
Create / Update Tenant
     │
     ▼
Configure Branding
     │
     ▼
Configure Mobile App
     │
     ▼
Validate Configuration
     │
     ▼
Create Build
     │
     ▼
Build Service
     │
     ├───────────────┐
     ▼               ▼
    iOS            Android
     │               │
     ▼               ▼
   IPA              AAB
     │               │
     ▼               ▼
 App Store        Play Store
```

---

# 22. Build Service

White-label builds should eventually be handled by a dedicated build process.

Conceptually:

```text
Super Admin
      ↓
Build Request
      ↓
Build Queue
      ↓
Build Worker
      ↓
Native Build
      ↓
Artifact
      ↓
Release
```

The platform API should not perform long-running native builds directly inside a normal HTTP request.

---

# 23. Build Queue

Builds should be asynchronous.

Example:

```text
POST /api/v1/platform/mobile-builds
```

Response:

```json
{
  "buildId": "build_123",
  "status": "QUEUED"
}
```

Then:

```text
QUEUED
   ↓
BUILDING
   ↓
TESTING
   ↓
READY
   ↓
SUBMITTED
   ↓
RELEASED
```

Failure:

```text
BUILDING
   ↓
FAILED
```

---

# 24. Build Status

Recommended statuses:

```text
DRAFT
QUEUED
BUILDING
TESTING
READY
SUBMITTED
APPROVED
RELEASED
FAILED
CANCELLED
```

Every build should retain its configuration snapshot.

---

# 25. Build Reproducibility

Every build must be reproducible.

Store:

```text
Source commit
Tenant configuration version
Branding version
App version
Build number
Dependencies
Build environment
Build timestamp
```

Example:

```text
Build
├── id
├── tenantId
├── appType
├── platform
├── sourceCommit
├── configurationVersion
├── version
├── buildNumber
├── status
└── createdAt
```

---

# 26. Versioning

Each white-label application should have:

```text
Marketing Version
+
Build Number
```

Example:

```text
Version:
2.4.0

Build:
105
```

Version:

```text
2.4.0
```

is user-facing.

Build:

```text
105
```

is used internally for release tracking.

---

# 27. Version Strategy

Recommended semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Examples:

```text
1.0.0
1.1.0
1.1.1
2.0.0
```

The platform should maintain a shared application version policy.

Tenant-specific builds may have separate build numbers.

---

# 28. Release Management

Super Admin should have a release management interface.

Example:

```text
Super Admin
│
└── Mobile Releases
    │
    ├── Member iOS
    ├── Member Android
    ├── Staff iOS
    └── Staff Android
```

Tenant:

```text
Gold's Gym
│
├── Member iOS
│   └── 2.4.0 (105)
│
├── Member Android
│   └── 2.4.0 (105)
│
├── Staff iOS
│   └── 2.4.0 (105)
│
└── Staff Android
    └── 2.4.0 (105)
```

---

# 29. App Store Accounts

White-label applications require careful ownership decisions.

The platform must decide whether apps are published under:

### Model A — Platform-owned developer accounts

```text
Platform Apple Account
        │
        ├── Gold's Gym
        ├── Fitness Pro
        └── PowerFit
```

and:

```text
Platform Google Play Account
        │
        ├── Gold's Gym
        ├── Fitness Pro
        └── PowerFit
```

### Model B — Tenant-owned developer accounts

```text
Gold's Gym Apple Account
Gold's Gym Google Play Account

Fitness Pro Apple Account
Fitness Pro Google Play Account
```

This is a business/legal decision and must be finalized before production distribution.

---

# 30. Recommended Ownership Model

For a SaaS white-label platform, the preferred initial architecture is:

```text
Platform
   │
   ├── Build infrastructure
   ├── Signing infrastructure
   ├── Release automation
   └── Store integration
```

However, each tenant's legal/store ownership requirements must be evaluated before choosing the final App Store and Play Store account model.

The architecture must not assume that every tenant can legally or operationally share the platform's developer account.

---

# 31. Signing Credentials

Signing credentials are highly sensitive.

They must never be committed to Git.

Never:

```text
git repository
.env
Docker image
source code
```

Store them in secure secret management.

Example:

```text
Secret Manager
      │
      ├── Apple credentials
      ├── Android signing keys
      ├── Google Play credentials
      └── Build secrets
```

---

# 32. Credential Isolation

Tenant credentials must be isolated.

Example:

```text
Tenant A
   ↓
Credential A

Tenant B
   ↓
Credential B
```

A build worker for Tenant A must not have access to Tenant B's credentials unless explicitly required.

---

# 33. iOS Signing Architecture

The iOS pipeline should manage:

```text
Bundle ID
Apple Team
Certificates
Provisioning profiles
App Store Connect
Signing
Build
Archive
Upload
```

Conceptually:

```text
Tenant Config
      ↓
Bundle ID
      ↓
Signing Configuration
      ↓
Xcode Build
      ↓
Archive
      ↓
App Store Connect
```

---

# 34. Android Signing Architecture

Android pipeline should manage:

```text
Application ID
Keystore
Signing configuration
Google Play
AAB build
Upload
Release
```

Conceptually:

```text
Tenant Config
      ↓
Package ID
      ↓
Signing
      ↓
Gradle Build
      ↓
AAB
      ↓
Google Play
```

---

# 35. CI/CD

Recommended pipeline:

```text
Git Push
   ↓
CI
   ↓
Unit Tests
   ↓
Static Analysis
   ↓
Security Checks
   ↓
Native Build
   ↓
Integration Tests
   ↓
Artifact
   ↓
Release Approval
   ↓
Store Submission
```

---

# 36. Tenant-Specific CI

Do not maintain separate CI definitions manually for every tenant.

Instead:

```text
Shared CI Pipeline
        +
Tenant Build Configuration
        ↓
Tenant Application
```

Example:

```text
build-member-app.yml
```

can build:

```text
Gold's Gym
Fitness Pro
PowerFit
```

based on configuration.

---

# 37. Build Matrix

The platform effectively has:

```text
2 Application Types
×
2 Mobile Platforms
×
N Tenants
```

For 100 tenants:

```text
Member iOS       = 100 apps
Member Android   = 100 apps
Staff iOS        = 100 apps
Staff Android    = 100 apps

Total = 400 applications
```

The architecture must therefore automate the entire process.

---

# 38. Tenant Application Registry

The platform should maintain an application registry.

```text
TenantApplication
├── id
├── tenantId
├── type
├── platform
├── name
├── bundleId
├── packageName
├── storeAppId
├── currentVersion
├── currentBuild
├── status
└── createdAt
```

Application types:

```text
MEMBER
STAFF
```

Platforms:

```text
IOS
ANDROID
```

---

# 39. Application Status

Recommended:

```text
CONFIGURING
READY
BUILDING
ACTIVE
SUSPENDED
DEPRECATED
```

A tenant can have a suspended application without deleting the tenant.

---

# 40. Tenant Suspension

If a tenant is suspended:

```text
Tenant
   ↓
SUSPENDED
```

the platform can disable access.

The mobile application itself may still remain installed on the user's device.

Therefore:

```text
Installed App
      ↓
API Request
      ↓
Tenant Status
      ↓
SUSPENDED
      ↓
Access denied / restricted
```

Tenant suspension must be enforced server-side.

---

# 41. Force Update

The platform should support minimum supported versions.

Example:

```text
TenantAppVersionPolicy
├── minimumVersion
├── recommendedVersion
└── forceUpdate
```

Runtime flow:

```text
Mobile App
    ↓
GET /api/v1/mobile/config
    ↓
Version Policy
    ↓
Current version supported?
```

If not:

```text
FORCE UPDATE
```

---

# 42. Remote Configuration

Not every configuration change should require a new app store release.

Runtime-configurable values may include:

```text
Feature flags
API behavior
Support contact
Notification settings
Theme adjustments where allowed
Feature availability
Maintenance mode
Minimum version
```

Changes such as these should ideally not require rebuilding the app.

---

# 43. Configuration Precedence

Configuration hierarchy:

```text
Platform Defaults
       ↓
Tenant Configuration
       ↓
Application Configuration
       ↓
User Preferences
```

Example:

```text
Platform:
dark mode supported

Tenant:
dark mode enabled

Application:
member app supports dark mode

User:
light mode selected
```

Final UI:

```text
light mode
```

---

# 44. Deep Links

Each white-label application should have its own deep-link configuration.

Example:

```text
Gold's Gym
goldsgym://workout/123
```

or HTTPS universal/app links:

```text
https://goldsgym.com/workout/123
```

The mobile application must validate tenant context before displaying protected content.

---

# 45. Push Notifications

Push notification architecture:

```text
Platform API
      ↓
Notification Service
      ↓
APNs / FCM
      ↓
Tenant App
      ↓
User Device
```

Each application must have its own platform-specific push configuration.

For example:

```text
Gold's Gym Member
Gold's Gym Staff
Fitness Pro Member
Fitness Pro Staff
```

must be distinguishable by the notification infrastructure.

---

# 46. Notification Isolation

A notification must never cross tenant boundaries.

Example:

```text
Gold's Gym event
      ↓
Gold's Gym notification tokens
```

must not reach:

```text
Fitness Pro users
```

Notification queries must always be tenant-scoped.

---

# 47. Analytics

Analytics must be tenant-aware.

Example:

```text
Tenant A
├── App installs
├── Active users
├── Workout sessions
└── Retention

Tenant B
├── App installs
├── Active users
├── Workout sessions
└── Retention
```

Platform-level analytics can aggregate these metrics.

---

# 48. Privacy

Tenant data must remain isolated in analytics as well as transactional data.

Never send raw tenant/user information to third-party analytics without appropriate authorization, configuration, and privacy controls.

The platform should support tenant-level analytics configuration.

---

# 49. App Store Metadata

Tenant-specific metadata may include:

```text
Application Name
Description
Subtitle
Keywords
Screenshots
Icon
Privacy URL
Support URL
Marketing URL
Category
```

These should be represented as configuration.

Example:

```text
TenantStoreMetadata
├── appName
├── subtitle
├── description
├── keywords
├── privacyUrl
├── supportUrl
└── marketingUrl
```

---

# 50. Store Submission Workflow

Recommended:

```text
Tenant Configuration
       ↓
Build
       ↓
Automated Tests
       ↓
Artifact
       ↓
Super Admin Approval
       ↓
Store Submission
       ↓
Store Review
       ↓
Approved
       ↓
Release
```

Store approval is an external process and cannot be assumed to be automatic.

---

# 51. Release Channels

Support:

```text
Development
QA
Staging
Production
```

Mobile release flow:

```text
Development
     ↓
Internal Testing
     ↓
QA
     ↓
Beta
     ↓
Production
```

---

# 52. Emergency Release

The platform should support emergency builds.

Example:

```text
Critical security issue
       ↓
Patch
       ↓
Build
       ↓
Priority submission
       ↓
Release
```

The system should retain an audit record of the emergency release.

---

# 53. Rollback Strategy

Mobile applications cannot be rolled back in exactly the same way as backend deployments.

Therefore:

```text
Backend rollback
```

and:

```text
Mobile rollback
```

must be treated separately.

For mobile:

```text
Bad Release
   ↓
Disable affected backend feature
   ↓
Publish fixed version
   ↓
Force update if necessary
```

Feature flags should be used to reduce the impact of problematic releases.

---

# 54. Feature Flags

Feature flags should exist at:

```text
Platform
Tenant
Application
User
```

Example:

```text
AI Coach
```

can be:

```text
Platform: enabled
Tenant A: enabled
Tenant B: disabled
Tenant A Member App: enabled
Tenant A Staff App: enabled
```

---

# 55. Native Shared Libraries

The native applications may share platform-neutral concepts through API contracts.

However, do not attempt to force Swift and Kotlin to share UI code.

Recommended:

```text
packages/
├── api-contracts/
├── documentation/
└── schemas/
```

Native implementation:

```text
member-ios/
    Swift / SwiftUI

member-android/
    Kotlin / Compose

staff-ios/
    Swift / SwiftUI

staff-android/
    Kotlin / Compose
```

---

# 56. API Contract

All native applications should consume the same API contract.

```text
Central API
     ↓
OpenAPI Contract
     │
     ├── iOS client models
     ├── Android client models
     ├── Web client
     └── Admin client
```

API changes must be backward compatible wherever practical.

---

# 57. Mobile API Versioning

The API must support mobile clients that may remain on older versions.

Example:

```text
API v1
```

must continue supporting currently supported mobile applications.

When breaking changes are required:

```text
v1
 ↓
v2
```

must be introduced deliberately.

---

# 58. Mobile Configuration Endpoint

A recommended endpoint:

```text
GET /api/v1/mobile/config
```

Response may include:

```json
{
  "tenant": {
    "id": "tenant_123",
    "name": "Gold's Gym"
  },
  "branding": {
    "primaryColor": "#000000",
    "secondaryColor": "#FFD700"
  },
  "features": {
    "workouts": true,
    "payments": true,
    "aiCoach": false
  },
  "versionPolicy": {
    "minimumVersion": "2.3.0",
    "recommendedVersion": "2.4.0",
    "forceUpdate": false
  }
}
```

The server remains authoritative.

---

# 59. Security Requirements

White-label architecture must enforce:

```text
Authentication
Authorization
Tenant Isolation
Secure Storage
Certificate/Signing Security
Secret Management
API Security
Push Notification Isolation
Deep Link Validation
Build Credential Isolation
Audit Logging
```

---

# 60. Secure Local Storage

Native applications should use platform-secure storage.

iOS:

```text
Keychain
```

Android:

```text
Android Keystore
```

Do not store sensitive authentication material in:

```text
Plain files
NSUserDefaults
SharedPreferences without encryption
Logs
```

---

# 61. Application Secrets

The following must never be treated as safe merely because they are inside a native application:

```text
API keys
Tenant secrets
Private signing keys
Database credentials
Admin credentials
Platform secrets
```

Native applications are distributed to users and must be considered inspectable.

Sensitive authorization belongs on the server.

---

# 62. Environment Separation

Build environments:

```text
DEV
QA
STAGING
PRODUCTION
```

Each environment should have independent:

```text
API endpoints
Credentials
Push configuration
Signing configuration
Databases
Storage
```

Production credentials must never be used by development builds.

---

# 63. Development Builds

Developers should be able to build a tenant locally.

Example:

```text
TENANT_SLUG=goldsgym
ENVIRONMENT=development
APP_TYPE=member
PLATFORM=ios
```

The resulting development application should use:

```text
Development API
Development configuration
Development signing identity
```

where appropriate.

---

# 64. Local Tenant Switching

For development only, the application may support switching tenants.

Example:

```text
Developer Mode
├── Gold's Gym
├── Fitness Pro
└── PowerFit
```

This must not become an unrestricted production feature.

Production application identity should be fixed to its configured tenant.

---

# 65. White-Label Asset Validation

Before building, validate:

```text
Logo exists
Icon exists
Splash exists
Correct dimensions
Correct formats
Valid colors
Valid app name
Valid bundle ID
Valid package ID
Valid store metadata
```

Build should fail early if required configuration is invalid.

---

# 66. Tenant Onboarding

Super Admin workflow:

```text
Create Tenant
      ↓
Tenant Information
      ↓
Branding
      ↓
Domain
      ↓
Features
      ↓
Subscription
      ↓
Mobile Configuration
      ↓
Store Configuration
      ↓
Create Owner
      ↓
Generate Apps
```

---

# 67. Tenant Mobile Setup

Super Admin:

```text
Tenant
  ↓
Mobile Apps
  ↓
Create Member App
  ↓
Create Staff App
```

Each application receives:

```text
App Name
Bundle ID / Package ID
Icon
Splash
Theme
Store Metadata
Version
Status
```

---

# 68. Application Generation

Example:

```text
Tenant: Gold's Gym
App: Member
Platform: iOS
```

Configuration:

```text
APP_NAME="Gold's Gym"
BUNDLE_ID="com.gymplatform.goldsgym.member"
TENANT_ID="tenant_123"
```

Build result:

```text
Gold's Gym
Member
iOS
```

---

# 69. Build Artifact Storage

Artifacts should be stored securely.

Example:

```text
storage/
└── builds/
    └── tenant_123/
        └── member/
            └── ios/
                └── 2.4.0/
                    ├── build-105.ipa
                    └── metadata.json
```

Build artifacts should have controlled access and retention policies.

---

# 70. Build Audit Log

Every build should produce an audit event.

Example:

```text
WHITE_LABEL_BUILD_CREATED
WHITE_LABEL_BUILD_STARTED
WHITE_LABEL_BUILD_FAILED
WHITE_LABEL_BUILD_COMPLETED
WHITE_LABEL_RELEASE_SUBMITTED
WHITE_LABEL_RELEASE_APPROVED
WHITE_LABEL_RELEASE_PUBLISHED
```

---

# 71. Super Admin Controls

Super Admin should be able to:

```text
View tenant apps
Create app
Update branding
Update metadata
Configure package IDs
Configure domains
Start builds
View build logs
View build history
Approve releases
Submit releases
Suspend apps
Force updates
Manage feature flags
```

Super Admin actions must be audited.

---

# 72. Tenant Owner Controls

Tenant owners may be allowed to manage:

```text
Logo
Brand colors
Website content
Support information
Basic app metadata
```

They should NOT automatically control:

```text
Signing credentials
Apple certificates
Android keystores
Platform secrets
Build infrastructure
Other tenants
Super Admin settings
```

Those belong to the platform.

---

# 73. Domain Architecture

Tenant websites may use:

```text
goldsgym.platform.com
```

or custom domains:

```text
www.goldsgym.com
```

Domain mapping:

```text
Domain
   ↓
Tenant Resolver
   ↓
Tenant
   ↓
Branding
   ↓
Website
```

---

# 74. Mobile and Website Relationship

The website and mobile applications should share:

```text
Tenant identity
Branding
Features
Authentication
API
```

but remain separate clients.

```text
Tenant Website
       │
       ├── API
       │
       └── Tenant Configuration

Member Mobile
       │
       ├── API
       │
       └── Tenant Configuration

Staff Mobile
       │
       ├── API
       │
       └── Tenant Configuration
```

---

# 75. No Tenant-Specific Backend

Do not create:

```text
Gold's Gym API
Fitness Pro API
PowerFit API
```

The platform uses:

```text
Central Platform API
```

with strict tenant isolation.

```text
Tenant A ──┐
Tenant B ──┼──> Platform API
Tenant C ──┘
```

---

# 76. No Tenant-Specific Source Code

Avoid:

```text
if (tenant === "goldsgym") {
   ...
}

if (tenant === "fitnesspro") {
   ...
}
```

for normal business behavior.

Use configuration and feature flags instead.

Good:

```text
tenant.features.aiCoach
```

Bad:

```text
if (tenant.slug === "goldsgym") {
   enableAI();
}
```

Tenant-specific custom business logic should only be introduced through a deliberate extension mechanism.

---

# 77. Exception: Tenant Customization

If a tenant requires functionality unavailable to other tenants, prefer:

```text
Feature
   ↓
Configuration
   ↓
Tenant Feature Flag
```

rather than modifying core code specifically for that tenant.

If true custom code is required, document it as an explicit architecture decision.

---

# 78. White-Label Scalability

The architecture must support:

```text
1 tenant
10 tenants
100 tenants
1,000+ tenants
```

without creating:

```text
1,000 source repositories
```

or:

```text
1,000 manually maintained CI pipelines
```

Automation is mandatory.

---

# 79. Operational Model

At scale:

```text
Tenant
   ↓
Configuration
   ↓
Application Registry
   ↓
Build Queue
   ↓
Build Worker
   ↓
Artifact
   ↓
Release Pipeline
```

This allows the platform to operate many white-label applications without manual duplication.

---

# 80. Recommended Repository

Final structure:

```text
gym-platform/
│
├── apps/
│   │
│   ├── platform-api/
│   ├── super-admin/
│   ├── tenant-web/
│   ├── tenant-website/
│   │
│   ├── member-ios/
│   ├── member-android/
│   │
│   ├── staff-ios/
│   └── staff-android/
│
├── packages/
│   │
│   ├── api-contracts/
│   ├── tenant/
│   ├── auth/
│   ├── rbac/
│   ├── branding/
│   ├── mobile-config/
│   ├── validation/
│   └── types/
│
├── infrastructure/
│   ├── ci/
│   ├── docker/
│   ├── deployment/
│   └── secrets/
│
├── scripts/
│   ├── mobile/
│   ├── tenant/
│   └── release/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
└── docs/
    ├── ARCHITECTURE.md
    ├── MULTI_TENANT_ARCHITECTURE.md
    ├── WHITE_LABEL_ARCHITECTURE.md
    ├── TENANT_DATA_MODEL.md
    ├── AUTHENTICATION_IMPLEMENTATION.md
    ├── RBAC.md
    ├── TENANT_BRANDING.md
    ├── MOBILE_ARCHITECTURE.md
    ├── MOBILE_RELEASES.md
    ├── API.md
    └── SECURITY.md
```

---

# 81. Final Architecture

```text
                              PLATFORM
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
             ┌─────────────┐             ┌──────────────┐
             │ SUPER ADMIN │             │ PLATFORM API │
             │    APP      │────────────▶│   Fastify    │
             └─────────────┘             └──────┬───────┘
                                                │
                         ┌──────────────────────┼──────────────────────┐
                         │                      │                      │
                         ▼                      ▼                      ▼
                    PostgreSQL                Redis                Storage
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
   GOLD'S GYM        FITNESS PRO        POWERFIT
       │                 │                 │
       │                 │                 │
 ┌─────┼─────┐     ┌─────┼─────┐     ┌─────┼─────┐
 │     │     │     │     │     │     │     │     │
 ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼
Web  Member Staff  Web Member Staff  Web Member Staff
     │      │           │      │           │      │
     │      │           │      │           │      │
     ▼      ▼           ▼      ▼           ▼      ▼
    iOS  Android       iOS  Android       iOS  Android
```

---

# 82. Final Application Matrix

| Product        | Platform | Tenant-specific | Native |
| -------------- | -------- | --------------: | -----: |
| Super Admin    | Web      |              No |    N/A |
| Tenant Web     | Web      |             Yes |    N/A |
| Tenant Website | Web      |             Yes |    N/A |
| Member App     | iOS      |             Yes |    Yes |
| Member App     | Android  |             Yes |    Yes |
| Staff App      | iOS      |             Yes |    Yes |
| Staff App      | Android  |             Yes |    Yes |

---

# 83. Non-Negotiable Rules

### Rule 1

Super Admin is a completely separate application.

### Rule 2

All native mobile applications are truly native.

### Rule 3

One shared source codebase must produce multiple tenant applications.

### Rule 4

Never create separate source repositories for individual gyms.

### Rule 5

Every white-label application must have a unique application identity.

### Rule 6

Tenant branding must be configuration-driven.

### Rule 7

Tenant-specific application identity must be configured at build time.

### Rule 8

Tenant permissions and business authorization must remain server-side.

### Rule 9

Native applications must never contain database credentials or platform secrets.

### Rule 10

Signing credentials must never be committed to source control.

### Rule 11

Builds must be asynchronous and auditable.

### Rule 12

Every build must retain the configuration and source version used to produce it.

### Rule 13

Mobile releases must support version enforcement and emergency feature disabling.

### Rule 14

Tenant applications must communicate only through the centralized API.

### Rule 15

A compromised tenant application must not allow access to another tenant.

### Rule 16

Push notifications must be tenant-isolated.

### Rule 17

Deep links must validate tenant and user authorization.

### Rule 18

Platform and tenant configuration must be clearly separated.

### Rule 19

Tenant-specific customization should use configuration and feature flags before custom code.

### Rule 20

White-label infrastructure must be automated so that adding a new tenant does not require manually duplicating the application source code or CI pipeline.

---

# 84. Architectural Objective

The final system should make this possible:

```text
Super Admin
     │
     ▼
Create "Gold's Gym"
     │
     ├── Configure Branding
     ├── Configure Domain
     ├── Configure Features
     ├── Configure Member App
     ├── Configure Staff App
     └── Create Owner
              │
              ▼
       Automated Build
              │
        ┌─────┴─────┐
        ▼           ▼
      iOS         Android
        │           │
        ▼           ▼
   App Store     Play Store
```

Then:

```text
Create "Fitness Pro"
```

uses the exact same platform:

```text
Shared Source
     +
Fitness Pro Configuration
     ↓
Fitness Pro Member App
Fitness Pro Staff App
```

No duplicated business logic.

No duplicated backend.

No duplicated source repositories.

Only **separate tenant application identities, branding, configuration, signing/distribution metadata, and store products**.

---

# 85. Relationship to Other Architecture Documents

This document depends on and extends:

```text
MULTI_TENANT_ARCHITECTURE.md
```

It should be implemented together with:

```text
AUTHENTICATION_IMPLEMENTATION.md
RBAC.md
TENANT_BRANDING.md
TENANT_DATA_MODEL.md
MOBILE_ARCHITECTURE.md
MOBILE_RELEASES.md
API.md
SECURITY.md
```

The implementation order should be:

```text
Multi-Tenancy
      ↓
Tenant Data Model
      ↓
Authentication
      ↓
RBAC
      ↓
Tenant Branding
      ↓
Native Mobile Architecture
      ↓
White-Label Configuration
      ↓
Build Pipeline
      ↓
Store Release Automation
```

**White-labeling is therefore a platform capability, not a collection of separate applications manually maintained for each gym.**
