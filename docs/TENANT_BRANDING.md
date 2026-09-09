# Tenant Branding Architecture

**Document:** `TENANT_BRANDING.md`  
**Platform:** Gym SaaS Platform  
**Status:** Proposed / Implementation Specification  
**Scope:** Multi-tenant branding, white-label web, native mobile apps, domains, assets, and mobile builds

---

# 1. Purpose

This document defines the complete tenant branding architecture for the Gym SaaS Platform.

The platform supports multiple gyms operating on shared infrastructure while allowing each gym to present its own brand.

Example tenants:

```text
Gold's Gym
Fitness Pro
PowerFit
Any Local Gym
```

Each tenant can have its own:

- Logo
- Colors
- Fonts
- Favicon
- Website branding
- Mobile app name
- Mobile app icon
- Splash screen
- App Store / Play Store metadata
- Custom domain
- Support information
- Application-specific branding
- Feature configuration

The platform must achieve this **without creating tenant-specific source code**.

---

# 2. Core Principle

Tenant branding is configuration, not application code.

Never implement branding like:

```ts
if (tenant.slug === "goldsgym") {
  // special Gold's Gym UI
}
```

or:

```ts
if (tenant.id === "123") {
  // custom behavior
}
```

Instead:

```text
Tenant
   │
   ├── Branding
   ├── Configuration
   ├── Features
   └── Applications
```

The application reads tenant configuration and renders accordingly.

---

# 3. Branding Architecture

```text
                    ┌──────────────────────┐
                    │     Super Admin      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Tenant Configuration │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
       Tenant Branding   Feature Config    Mobile Config
             │                 │                 │
             └─────────────────┼─────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Central API       │
                    └──────────┬───────────┘
                               │
       ┌───────────────┬───────┼────────┬───────────────┐
       ▼               ▼       ▼        ▼               ▼
   Tenant Web      Website   iOS     Android        Staff Apps
```

---

# 4. Branding Layers

The platform has four configuration layers.

```text
Platform Defaults
        ↓
Tenant Configuration
        ↓
Application Configuration
        ↓
User Preferences
```

Higher-level configuration overrides lower-level defaults.

For example:

```text
Platform primary color:
#000000

Tenant primary color:
#E31B23

Application override:
#CC0000

User preference:
dark mode
```

The effective configuration is:

```text
primaryColor = #CC0000
theme = dark
```

---

# 5. Tenant Branding Model

The core branding entity is:

```text
TenantBranding
```

Conceptual model:

```prisma
model TenantBranding {
  id             String   @id @default(cuid())

  tenantId       String   @unique

  logoUrl        String?
  logoDarkUrl    String?
  faviconUrl     String?

  appIconUrl     String?
  splashScreenUrl String?

  primaryColor   String?
  secondaryColor String?
  accentColor    String?

  backgroundColor String?
  surfaceColor    String?
  textColor       String?

  fontFamily     String?

  themeMode      String?

  version        Int      @default(1)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

---

# 6. Why Branding Has Its Own Entity

Do not put every branding field directly inside `Tenant`.

Avoid:

```prisma
model Tenant {
  id           String
  name         String
  logoUrl      String
  primaryColor String
  ...
}
```

Prefer:

```text
Tenant
   │
   └── TenantBranding
```

This provides:

- Cleaner tenant model
- Easier versioning
- Easier caching
- Easier mobile build integration
- Easier future branding expansion
- Clear separation of business data and presentation configuration

---

# 7. Tenant Application Model

A tenant can have multiple applications.

For example:

```text
Gold's Gym

Member iOS
Member Android
Staff iOS
Staff Android
Tenant Web
Tenant Website
```

Therefore application-specific configuration should be modeled separately.

```prisma
enum TenantApplicationType {
  MEMBER
  STAFF
}

enum TenantApplicationPlatform {
  IOS
  ANDROID
}

enum TenantApplicationStatus {
  CONFIGURING
  READY
  BUILDING
  ACTIVE
  SUSPENDED
  DEPRECATED
}

model TenantApplication {
  id          String   @id @default(cuid())

  tenantId    String

  type        TenantApplicationType
  platform    TenantApplicationPlatform

  appName     String

  bundleId    String?
  packageName String?

  storeAppId  String?

  version     String?
  buildNumber Int?

  status      TenantApplicationStatus @default(CONFIGURING)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, type, platform])
  @@index([tenantId])
}
```

---

# 8. Example

For one tenant:

```text
Tenant
Gold's Gym

TenantApplication
├── MEMBER + IOS
├── MEMBER + ANDROID
├── STAFF + IOS
└── STAFF + ANDROID
```

Example:

```text
Member iOS
App Name:
Gold's Gym App

Bundle ID:
com.gymplatform.goldsgym.member

Member Android
App Name:
Gold's Gym App

Package:
com.gymplatform.goldsgym.member

Staff iOS
App Name:
Gold's Gym Staff

Bundle ID:
com.gymplatform.goldsgym.staff

Staff Android
App Name:
Gold's Gym Staff

Package:
com.gymplatform.goldsgym.staff
```

---

# 9. Runtime Branding vs Build-Time Branding

This distinction is critical.

Some branding can change at runtime.

Other branding must be embedded during the native application build.

---

## 9.1 Runtime Branding

Runtime branding includes:

- Primary color
- Secondary color
- Accent color
- Logo
- Favicon
- Fonts
- UI theme
- Feature flags
- Support information
- Tenant name
- Content configuration

Example:

```json
{
  "tenant": {
    "id": "tenant_123",
    "name": "Gold's Gym"
  },
  "branding": {
    "primaryColor": "#E31B23",
    "secondaryColor": "#000000",
    "accentColor": "#FFFFFF",
    "logoUrl": "https://cdn.example.com/..."
  }
}
```

These can normally change without publishing a new native application.

---

# 10. Build-Time Branding

Native application identity requires a new build.

Build-time configuration includes:

```text
App Name
Bundle ID
Package Name
App Icon
Splash Screen
Launch Assets
Store Metadata
Application Identifier
Signing Configuration
```

For example:

```text
Fitness Pro

Member iOS
com.gymplatform.fitnesspro.member

Member Android
com.gymplatform.fitnesspro.member
```

Changing the bundle ID requires a different application identity.

Therefore:

```text
Runtime branding
        ≠
Native application identity
```

---

# 11. Branding Configuration Precedence

The platform should resolve branding using:

```text
Platform Defaults
       ↓
Tenant Branding
       ↓
Application Branding
       ↓
User Preferences
```

Example:

```text
Platform:
primaryColor = #000000

Tenant:
primaryColor = #FF0000

Application:
primaryColor = #D00000

User:
themeMode = DARK
```

Final:

```text
primaryColor = #D00000
themeMode = DARK
```

---

# 12. Web Branding

Tenant Web must dynamically load tenant configuration.

Example:

```text
tenant-web.example.com
```

The API determines:

```text
tenant
branding
features
permissions
```

The frontend then applies the theme.

Example:

```ts
const branding = await getTenantBranding();

applyTheme({
  primaryColor: branding.primaryColor,
  secondaryColor: branding.secondaryColor,
  accentColor: branding.accentColor,
});
```

---

# 13. CSS Variable Strategy

Web applications should use CSS variables.

Example:

```css
:root {
  --color-primary: #000000;
  --color-secondary: #ffffff;
  --color-accent: #ff0000;
}
```

Tenant configuration replaces them at runtime.

```css
:root {
  --color-primary: #e31b23;
  --color-secondary: #000000;
  --color-accent: #ffffff;
}
```

Components should use variables:

```css
.button-primary {
  background: var(--color-primary);
}
```

Do not hard-code tenant colors throughout the application.

---

# 14. Tenant Website Branding

The public tenant website can use the same branding system.

Example:

```text
goldsgym.example.com
```

The website loads:

```text
Tenant
Branding
Public Configuration
Public Content
```

Possible branded elements:

```text
Header
Logo
Navigation
Hero
CTA
Footer
Contact details
Membership information
Pricing
Locations
Social links
```

---

# 15. Custom Domains

Tenants should optionally support custom domains.

Example:

```text
www.goldsgym.com
```

instead of:

```text
goldsgym.platform.com
```

Architecture:

```text
Custom Domain
      ↓
Reverse Proxy / CDN
      ↓
Tenant Resolution
      ↓
Tenant ID
      ↓
Tenant Branding
      ↓
Application
```

The server must map the domain to a tenant.

Example:

```prisma
model TenantDomain {
  id        String   @id @default(cuid())

  tenantId  String

  domain    String
  isPrimary Boolean  @default(false)
  verified  Boolean  @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([domain])
  @@index([tenantId])
}
```

---

# 16. Domain Verification

Custom domains must not become active immediately.

Flow:

```text
Tenant enters domain
        ↓
Platform generates verification token
        ↓
Tenant adds DNS record
        ↓
Platform verifies DNS
        ↓
Domain marked verified
        ↓
TLS certificate configured
        ↓
Domain activated
```

Never trust a domain simply because a tenant submitted it.

---

# 17. Branding Assets

Branding assets should not be stored inside the application container.

Avoid:

```text
/apps/tenant-web/public/tenant-logos/
```

Instead use object storage:

```text
Object Storage
    │
    ├── tenant/
    │   ├── tenant_123/
    │   │   ├── branding/
    │   │   │   ├── logo.png
    │   │   │   ├── logo-dark.png
    │   │   │   ├── favicon.png
    │   │   │   ├── app-icon.png
    │   │   │   └── splash.png
```

Examples:

```text
AWS S3
Cloudflare R2
Google Cloud Storage
Azure Blob Storage
```

The application stores references/URLs, not binary assets in PostgreSQL.

---

# 18. Asset Upload Flow

Never upload large assets directly through the API server when unnecessary.

Preferred flow:

```text
Admin
  ↓
API
  ↓
Generate signed upload URL
  ↓
Object Storage
  ↓
Upload
  ↓
API confirms asset
  ↓
TenantBranding updated
```

Example:

```http
POST /api/v1/files/upload-url
```

Response:

```json
{
  "success": true,
  "data": {
    "uploadUrl": "...",
    "assetId": "asset_123"
  }
}
```

---

# 19. Asset Validation

Branding uploads must be validated.

Check:

```text
File type
File size
Image dimensions
MIME type
File extension
Content signature
```

Allowed examples:

```text
PNG
JPEG
WebP
SVG
```

SVG requires additional sanitization because malicious SVG content can contain scripts or unsafe references.

---

# 20. Image Requirements

Recommended requirements:

### Logo

```text
PNG/WebP
Transparent background
Recommended width: 512px+
```

### App Icon

```text
High-resolution square image
No transparency assumptions for platform requirements
```

### Splash Screen

```text
High-resolution
Platform-specific dimensions
Safe area considered
```

The mobile build system can generate platform-specific assets from approved source assets where appropriate.

---

# 21. Branding Versioning

Every branding update should increment a version.

Example:

```text
version = 1

Logo updated
        ↓

version = 2

Primary color updated
        ↓

version = 3
```

This helps:

- Cache invalidation
- Mobile build reproducibility
- Audit
- Rollbacks
- CDN cache management

---

# 22. Branding Audit

Sensitive branding changes should be audited.

Example:

```text
User:
admin@example.com

Tenant:
Gold's Gym

Action:
TENANT_BRANDING_UPDATED

Changes:
primaryColor:
#000000 → #E31B23

timestamp:
2026-09-09T12:00:00Z
```

Audit record:

```text
AuditLog
├── actorId
├── tenantId
├── action
├── resource
├── resourceId
├── before
├── after
├── requestId
└── createdAt
```

---

# 23. Branding Permissions

Branding must be protected by RBAC.

Example permissions:

```text
branding.read
branding.update
branding.assets.upload
branding.preview
branding.publish
```

Typical role mapping:

```text
OWNER
  branding.read
  branding.update
  branding.assets.upload
  branding.preview
  branding.publish

ADMIN
  branding.read
  branding.update
  branding.assets.upload
  branding.preview

TRAINER
  branding.read

MEMBER
  branding.read
```

The exact permissions can be adjusted according to the RBAC policy.

---

# 24. Super Admin Branding Permissions

Super Admin has platform-level authority.

Possible permissions:

```text
platform.tenants.read
platform.tenants.update
platform.branding.read
platform.branding.update
platform.mobile_apps.read
platform.mobile_apps.build
platform.mobile_apps.release
```

Super Admin actions should always be audited.

---

# 25. Tenant Branding API

Recommended endpoints:

```text
GET    /api/v1/branding
PATCH  /api/v1/branding

POST   /api/v1/branding/assets/upload-url
DELETE /api/v1/branding/assets/:assetId

POST   /api/v1/branding/preview
POST   /api/v1/branding/publish
```

Tenant context is determined by authenticated tenant membership.

Never allow:

```http
PATCH /api/v1/branding

{
  "tenantId": "another-tenant"
}
```

to bypass tenant authorization.

---

# 26. Mobile Branding API

Native mobile apps need tenant configuration.

Recommended endpoint:

```http
GET /api/v1/mobile/config
```

Example response:

```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "tenant_123",
      "name": "Gold's Gym"
    },
    "application": {
      "id": "app_123",
      "type": "MEMBER",
      "platform": "IOS"
    },
    "branding": {
      "logoUrl": "https://cdn.example.com/logo.png",
      "primaryColor": "#E31B23",
      "secondaryColor": "#000000",
      "accentColor": "#FFFFFF"
    },
    "features": {
      "workouts": true,
      "attendance": true,
      "payments": true
    },
    "versionPolicy": {
      "minimumVersion": "1.4.0",
      "recommendedVersion": "1.5.0",
      "forceUpdate": false
    }
  },
  "requestId": "req_123"
}
```

---

# 27. Mobile Application Identity

Each white-label native application receives a unique identity.

Example:

```text
Tenant: Gold's Gym

Member iOS:
com.gymplatform.goldsgym.member

Staff iOS:
com.gymplatform.goldsgym.staff

Member Android:
com.gymplatform.goldsgym.member

Staff Android:
com.gymplatform.goldsgym.staff
```

The exact identifier convention must be validated against platform requirements and organizational naming rules before production rollout.

---

# 28. Bundle ID / Package Name Rules

Identifiers must be:

```text
Unique
Stable
Deterministic
Validated
Reserved
Immutable after production release where platform rules require it
```

Do not derive them from arbitrary user input without validation.

Example tenant slug:

```text
Gold's Gym
```

Normalized:

```text
goldsgym
```

Potential identifier:

```text
com.gymplatform.goldsgym.member
```

Before creation, check whether the identifier is already reserved.

---

# 29. White-Label Mobile Build Pipeline

Branding connects directly to the mobile build system.

Flow:

```text
Super Admin
     ↓
Tenant Branding
     ↓
Tenant Mobile Configuration
     ↓
Validate Configuration
     ↓
Create Build
     ↓
Build Queue
     ↓
Native Build Worker
     ↓
Inject Branding
     ↓
Compile iOS / Android
     ↓
Tests
     ↓
Artifact
     ↓
Approval
     ↓
Store Submission
     ↓
Release
```

---

# 30. Build Configuration

A build should use a versioned configuration.

Example:

```json
{
  "tenantId": "tenant_123",
  "applicationId": "app_123",
  "appName": "Gold's Gym App",
  "bundleId": "com.gymplatform.goldsgym.member",
  "brandingVersion": 7,
  "apiEnvironment": "production",
  "appVersion": "1.5.0",
  "buildNumber": 42
}
```

This configuration should be immutable once the build begins.

---

# 31. Build Reproducibility

Every build should record:

```text
Tenant ID
Application ID
Source commit
Branding version
Configuration version
App version
Build number
Environment
Build timestamp
Build worker
Artifact
```

Example:

```text
Build #42

Tenant:
tenant_123

Application:
app_123

Source:
git commit abc123

Branding:
version 7

App:
1.5.0

Build:
42
```

This makes production debugging and reproduction possible.

---

# 32. Native iOS Branding

The iOS build pipeline may inject:

```text
CFBundleDisplayName
CFBundleIdentifier
App Icons
Launch Assets
Accent Color
Configuration
Associated Domains
URL Schemes
Push configuration
```

The application should read runtime tenant configuration from the API after authentication.

The native application identity itself remains build-time.

---

# 33. Native Android Branding

The Android build pipeline may inject:

```text
applicationId
App Name
Launcher Icon
Splash Screen
Manifest configuration
Deep-link configuration
Push configuration
Build configuration
```

Runtime configuration is still retrieved from the centralized API.

---

# 34. No Tenant-Specific Source Code

Do not create:

```text
goldsgym/
fitnesspro/
powerfit/
```

inside the source tree.

Do not create:

```text
if tenant == GoldsGym
```

Do not fork the mobile application for every tenant.

Instead:

```text
One Source
    +
Tenant Configuration
    +
Branding
    +
Build Configuration
    =
Many White-Label Apps
```

---

# 35. Example: 100 Tenants

If there are:

```text
100 tenants
```

and each tenant has:

```text
1 Member iOS
1 Member Android
1 Staff iOS
1 Staff Android
```

then:

```text
100 × 4 = 400 native applications
```

The source code remains:

```text
member-ios
member-android
staff-ios
staff-android
```

The build system generates:

```text
400 application products
```

This is the primary benefit of configuration-driven white-label architecture.

---

# 36. Branding Preview

Super Admin and authorized tenant users should be able to preview branding before publishing.

Flow:

```text
Edit Branding
     ↓
Preview
     ↓
Validate
     ↓
Publish
```

Preview should show:

```text
Tenant Web
Tenant Website
Member App
Staff App
```

The preview should use the same design tokens that production uses.

---

# 37. Draft vs Published Branding

For safer workflows, branding should support draft state.

Conceptually:

```text
Published Branding
        │
        └── current production configuration

Draft Branding
        │
        └── pending changes
```

Flow:

```text
Edit
 ↓
Save Draft
 ↓
Preview
 ↓
Validate
 ↓
Publish
```

This prevents accidental production changes while an administrator is still editing.

---

# 38. Branding Publish Process

Publishing should:

1. Validate configuration
2. Validate assets
3. Verify tenant authorization
4. Increment branding version
5. Persist configuration
6. Invalidate caches
7. Purge relevant CDN cache
8. Emit branding event
9. Audit the action

Example event:

```text
tenant.branding.updated
```

---

# 39. Cache Strategy

Branding is read frequently.

Recommended architecture:

```text
Client
   ↓
CDN / Browser Cache
   ↓
Redis
   ↓
PostgreSQL
```

Redis key:

```text
tenant:{tenantId}:branding
```

Application configuration:

```text
tenant:{tenantId}:config
```

Invalidate cache when branding is published.

---

# 40. CDN Strategy

Assets should be served through CDN where practical.

Example:

```text
Object Storage
      ↓
CDN
      ↓
Web / Mobile
```

Use immutable asset URLs where possible.

Example:

```text
/logo-v7.png
```

rather than:

```text
/logo.png
```

This reduces stale-cache problems.

---

# 41. Security

Tenant branding must follow the same tenant-isolation rules as all other tenant resources.

Every request must establish:

```text
Authenticated User
        ↓
Tenant Context
        ↓
Tenant Membership
        ↓
Permission
        ↓
Branding Resource
```

Never allow:

```text
Tenant A
   ↓
request
   ↓
Tenant B branding
```

because the client supplied a different tenant ID.

---

# 42. Tenant Isolation

Repository methods should always include tenant context.

Good:

```ts
brandingRepository.findByTenantId(tenantId);
```

Better for resource authorization:

```ts
brandingRepository.find({
  tenantId,
  brandingId,
});
```

Avoid:

```ts
brandingRepository.findById(brandingId);
```

when the caller's tenant context is omitted.

---

# 43. Branding and RBAC

The authorization pipeline remains:

```text
Authentication
      ↓
Tenant Resolution
      ↓
Tenant Membership
      ↓
Permission Check
      ↓
Resource Authorization
      ↓
Branding Service
```

Example:

```text
PATCH /api/v1/branding
```

requires:

```text
Authenticated
+
Active Tenant
+
Tenant Membership
+
branding.update
```

---

# 44. Branding and Feature Flags

Branding and feature flags are different concerns.

Branding:

```text
How the product looks
```

Feature flags:

```text
What the product can do
```

Example:

```text
Branding:
primaryColor = red

Feature:
payments = false
```

Do not encode features inside branding.

---

# 45. Branding and Permissions

Branding also does not replace authorization.

Example:

```text
branding.update
```

is an RBAC permission.

A feature flag might say:

```text
customBranding = true
```

Both can be evaluated:

```text
Permission
+
Feature enabled
=
Branding operation allowed
```

---

# 46. Branding and Mobile Releases

Not every branding change should trigger a native release.

### No native release required

Usually:

```text
Primary color
Secondary color
Logo URL
Typography
Support information
Feature configuration
```

### Native release required

Usually:

```text
App name
Bundle ID
Package name
App icon
Splash screen
Store listing metadata
Native capabilities
```

The exact release trigger should be defined by the mobile build system.

---

# 47. Emergency Branding Rollback

The platform should support restoring a previous branding version.

Example:

```text
Version 8
   ↓
Problem discovered

Rollback
   ↓
Version 7
```

Rollback should:

```text
Restore previous configuration
Increment current version
Invalidate cache
Audit action
```

For native apps, rollback may require a new release if the affected branding is embedded in the binary.

---

# 48. Store Metadata

White-label applications may have tenant-specific:

```text
App name
Subtitle
Description
Keywords
Screenshots
Privacy URL
Support URL
Marketing URL
Store category
App icon
```

These belong to the application configuration/build system rather than ordinary runtime branding.

---

# 49. Store Metadata Model

Conceptual model:

```prisma
model MobileStoreMetadata {
  id              String @id @default(cuid())

  applicationId   String

  displayName     String
  subtitle        String?
  description     String?
  keywords        String?
  supportUrl      String?
  privacyUrl      String?
  marketingUrl    String?

  version         Int    @default(1)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  application TenantApplication @relation(
    fields: [applicationId],
    references: [id]
  )

  @@unique([applicationId])
}
```

---

# 50. Tenant Branding API Contract

Example:

```http
GET /api/v1/branding
```

Response:

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant_123",
    "version": 7,
    "logoUrl": "https://cdn.example.com/logo-v7.png",
    "faviconUrl": "https://cdn.example.com/favicon-v7.png",
    "primaryColor": "#E31B23",
    "secondaryColor": "#000000",
    "accentColor": "#FFFFFF",
    "fontFamily": "Inter",
    "themeMode": "SYSTEM"
  },
  "requestId": "req_123"
}
```

---

# 51. Branding Validation

Before publishing:

```text
Tenant exists
Tenant is active
User has permission
Colors are valid
Assets exist
Assets belong to tenant
URLs are valid
Font is supported
App metadata is valid
Application identifiers are valid
```

Invalid example:

```json
{
  "primaryColor": "hello"
}
```

must be rejected.

---

# 52. Branding Service

Recommended backend structure:

```text
modules/
└── branding/
    ├── branding.controller.ts
    ├── branding.service.ts
    ├── branding.repository.ts
    ├── branding.schemas.ts
    ├── branding.types.ts
    ├── branding.policy.ts
    ├── branding.mapper.ts
    └── branding.events.ts
```

Responsibilities:

### Controller

HTTP handling.

### Service

Business rules.

### Repository

Database access.

### Policy

Authorization/resource rules.

### Mapper

DTO transformation.

### Events

Branding update events.

---

# 53. Branding Events

Recommended events:

```text
tenant.branding.created
tenant.branding.updated
tenant.branding.published
tenant.branding.rollback
tenant.branding.asset.uploaded
tenant.branding.asset.deleted
```

Mobile build events:

```text
mobile.branding.build.required
mobile.application.build.created
mobile.application.build.completed
```

---

# 54. Mobile Build Trigger

When build-time branding changes:

```text
Branding Update
      ↓
Determine affected applications
      ↓
Determine whether native build required
      ↓
Create build request
      ↓
Queue build
```

Example:

```text
Logo URL changed
```

If logo is runtime-only:

```text
No build
```

If logo is native app icon:

```text
Build required
```

---

# 55. Configuration Classification

Every branding field should explicitly define whether it is:

```text
RUNTIME
BUILD_TIME
STORE_TIME
```

Example:

| Configuration     |   Runtime |     Build | Store |
| ----------------- | --------: | --------: | ----: |
| Primary color     |       Yes |        No |    No |
| Logo URL          |       Yes | Sometimes |    No |
| App icon          |        No |       Yes |   Yes |
| App name          | Sometimes |       Yes |   Yes |
| Bundle ID         |        No |       Yes |    No |
| Package name      |        No |       Yes |    No |
| Splash screen     |        No |       Yes |    No |
| Support URL       |       Yes |        No |   Yes |
| Store description |        No |        No |   Yes |
| Feature flag      |       Yes |        No |    No |

---

# 56. Application Configuration

A tenant application can have additional configuration:

```prisma
model TenantApplicationConfig {
  id            String @id @default(cuid())

  applicationId String @unique

  apiEnvironment String
  supportEmail   String?
  supportUrl     String?

  minimumVersion String?
  recommendedVersion String?
  forceUpdate    Boolean @default(false)

  configVersion Int @default(1)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  application TenantApplication @relation(
    fields: [applicationId],
    references: [id]
  )
}
```

---

# 57. Relationship Model

The overall relationship is:

```text
Tenant
 │
 ├── TenantBranding
 │
 ├── TenantDomain
 │
 ├── TenantApplication
 │       │
 │       ├── TenantApplicationConfig
 │       ├── MobileStoreMetadata
 │       └── MobileBuild
 │
 └── Tenant Features
```

---

# 58. Mobile Build Model

Conceptual:

```prisma
enum MobileBuildStatus {
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
}

model MobileBuild {
  id             String @id @default(cuid())

  applicationId  String

  sourceCommit   String
  brandingVersion Int
  configVersion   Int

  appVersion     String
  buildNumber    Int

  environment    String

  status         MobileBuildStatus @default(DRAFT)

  artifactUrl    String?
  errorMessage   String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  application TenantApplication @relation(
    fields: [applicationId],
    references: [id]
  )

  @@index([applicationId])
  @@index([status])
}
```

---

# 59. White-Label Build Security

Signing credentials must never be stored in:

```text
Git
.env files
Docker images
Source code
Database plaintext
Mobile configuration JSON
```

Use:

```text
Secret Manager
```

Examples:

```text
AWS Secrets Manager
Google Secret Manager
Azure Key Vault
HashiCorp Vault
```

The build worker receives credentials only when required.

---

# 60. Tenant Cannot Access Signing Credentials

Tenant administrators may manage:

```text
Brand name
Logo
Colors
Store metadata
Support details
```

They must not receive:

```text
Apple signing certificates
Apple private keys
App Store API private keys
Android keystore passwords
Signing keys
Build infrastructure credentials
```

Super Admin/platform infrastructure owns this process.

---

# 61. Tenant Preview Architecture

Preview should not modify production branding.

Example:

```text
Tenant Branding Draft
       ↓
Preview Token
       ↓
Preview Web/App
       ↓
Temporary Configuration
```

Preview must be authorized and short-lived.

Do not expose unpublished branding through publicly guessable URLs.

---

# 62. Branding Cache Invalidation

When publishing:

```text
Database updated
      ↓
Redis invalidated
      ↓
CDN invalidated where necessary
      ↓
Clients fetch new configuration
```

Mobile clients should refresh configuration on:

```text
App launch
Login
Tenant switch
Config TTL expiry
Explicit refresh
```

Do not refresh on every screen render.

---

# 63. Offline Mobile Behavior

Mobile applications may not always have network connectivity.

Therefore:

```text
Last known valid branding
```

can be cached locally.

If network is unavailable:

```text
Use cached branding
```

When online:

```text
Fetch latest configuration
```

Security-sensitive configuration must remain server-authoritative.

---

# 64. Branding and Tenant Switching

If a user belongs to multiple tenants:

```text
User
 ├── Tenant A
 ├── Tenant B
 └── Tenant C
```

the application must maintain:

```text
activeTenantId
```

When tenant changes:

```text
Switch tenant
      ↓
Validate membership
      ↓
Load tenant branding
      ↓
Load tenant features
      ↓
Refresh tenant-scoped data
```

Do not retain Tenant A branding while displaying Tenant B data.

---

# 65. Tenant Branding State Machine

Recommended states:

```text
DRAFT
  ↓
VALIDATING
  ↓
READY
  ↓
PUBLISHED
  ↓
ARCHIVED
```

Failed validation:

```text
DRAFT
  ↓
VALIDATING
  ↓
FAILED
```

---

# 66. Operational Requirements

Monitoring should track:

```text
Branding update failures
Asset upload failures
Asset processing failures
CDN failures
Configuration API failures
Mobile config failures
Mobile build failures
Store submission failures
```

Useful metrics:

```text
branding_update_total
branding_update_failed_total
branding_config_load_total
branding_config_load_failed_total
mobile_build_total
mobile_build_failed_total
```

---

# 67. Testing Requirements

Branding must have automated tests.

### Tenant isolation

```text
Tenant A cannot read Tenant B branding
Tenant A cannot update Tenant B branding
Tenant A cannot delete Tenant B assets
```

### RBAC

```text
OWNER can update
ADMIN can update if permitted
TRAINER cannot update
MEMBER cannot update
```

### Validation

```text
Invalid color rejected
Invalid asset rejected
Oversized file rejected
Invalid URL rejected
```

### Cache

```text
Published branding invalidates cache
New version is returned
```

### Mobile

```text
Correct tenant config returned
Correct application config returned
Correct branding returned
Incorrect application rejected
```

---

# 68. Security Test

This test is mandatory:

```text
Given:
Tenant A user

When:
User requests Tenant B branding

Then:
403 Forbidden
```

Also test:

```text
Tenant A application
       ↓
Tenant B mobile config
       ↓
Must fail
```

---

# 69. API Security Rule

Never accept tenant branding authority from:

```http
X-Tenant-ID
```

alone.

The header may be used as a tenant selection hint.

The server must resolve:

```text
Authenticated identity
+
Membership
+
Tenant status
+
Application identity
```

before returning branding.

---

# 70. Tenant Status

If a tenant is:

```text
SUSPENDED
```

the platform may prevent normal branding/configuration access.

If:

```text
DELETED
```

tenant assets and domains should enter the appropriate retention/deletion lifecycle.

---

# 71. Asset Lifecycle

Recommended lifecycle:

```text
Uploaded
   ↓
Validated
   ↓
Active
   ↓
Replaced
   ↓
Old asset retained temporarily
   ↓
Retention period
   ↓
Deleted
```

Do not immediately delete old assets if active builds may still reference them.

---

# 72. Mobile Build Asset Snapshot

A mobile build must reference immutable assets.

Bad:

```text
https://cdn.example.com/current-logo.png
```

Better:

```text
https://cdn.example.com/tenant_123/logo-v7.png
```

This guarantees that build #42 can be traced to the exact branding asset used.

---

# 73. Branding Configuration Snapshot

Every native build should create a snapshot:

```text
Build
 ├── Tenant
 ├── Application
 ├── Branding version
 ├── Branding assets
 ├── Configuration version
 └── Source commit
```

This prevents future branding changes from altering the meaning of an existing build.

---

# 74. White-Label Architecture Summary

The final model is:

```text
                    PLATFORM
                       │
                       ▼
                    Tenant
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      Branding      Features    Applications
          │                         │
          │              ┌──────────┼──────────┐
          │              ▼          ▼          ▼
          │           Member      Staff      Website
          │              │          │
          │              ▼          ▼
          │             iOS      Android
          │
          ▼
     Runtime Theme
```

---

# 75. Final Architecture Rules

The following rules are mandatory.

### Rule 1

**Branding is tenant configuration.**

### Rule 2

**Do not hard-code tenant-specific branding.**

### Rule 3

**Runtime branding and build-time identity must remain separate.**

### Rule 4

**Native app identity is created through the white-label build pipeline.**

### Rule 5

**One source codebase produces many tenant applications.**

### Rule 6

**Tenant branding assets live in object storage, not PostgreSQL.**

### Rule 7

**Branding assets are served through CDN where appropriate.**

### Rule 8

**Branding changes are versioned.**

### Rule 9

**Production branding changes are audited.**

### Rule 10

**Every branding operation is tenant-authorized.**

### Rule 11

**Client-supplied tenant IDs are never trusted as authorization.**

### Rule 12

**Signing credentials never enter tenant-accessible configuration.**

### Rule 13

**Native builds must be reproducible.**

### Rule 14

**Build-time configuration must be snapshotted.**

### Rule 15

**Tenant branding must work across web, website, Member apps, and Staff apps.**

---

# 76. Final Invariant

The complete branding invariant is:

```text
Authenticated User
      +
Valid Tenant Membership
      +
Valid Tenant Context
      +
Branding Permission
      +
Valid Branding Configuration
      +
Valid Tenant Assets
      =
Authorized Tenant Branding
```

For native applications:

```text
Tenant
+
Application
+
Branding Version
+
Application Configuration
+
Validated Build
+
Secure Signing
=
White-Label Native Application
```

The platform therefore supports:

```text
Gold's Gym
    ↓
Gold's Gym Member iOS
Gold's Gym Member Android
Gold's Gym Staff iOS
Gold's Gym Staff Android

Fitness Pro
    ↓
Fitness Pro Member iOS
Fitness Pro Member Android
Fitness Pro Staff iOS
Fitness Pro Staff Android

PowerFit
    ↓
PowerFit Member iOS
PowerFit Member Android
PowerFit Staff iOS
PowerFit Staff Android
```

All of these applications share:

```text
Central API
Shared domain logic
Shared authentication
Shared RBAC
Shared tenant model
Shared native source code
Shared build infrastructure
```

while maintaining independent:

```text
Brand identity
Application identity
Store listing
App icon
Splash screen
Bundle ID / Package ID
Tenant configuration
```

This is the foundation for a scalable **true white-label multi-tenant Gym SaaS platform**.
