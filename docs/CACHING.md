# Caching

## Fastify-MasterApp

> Production-grade caching strategy for the Fastify API, PostgreSQL/Prisma workloads, Redis, React Admin, TanStack Query, background jobs, and horizontally scaled deployments.

---

## 1. Purpose

Caching reduces repeated work by temporarily storing data closer to the component that needs it.

Fastify-MasterApp can use caching to improve:

- API latency
- database efficiency
- throughput
- Admin responsiveness
- external API resilience
- expensive read performance

Caching must not compromise:

- correctness
- authorization
- tenant isolation
- data privacy
- security
- consistency
- recoverability

The central principle is:

> Cache data that is safe to reuse, invalidate it deliberately, and keep PostgreSQL as the durable source of business truth.

---

# 2. Caching Philosophy

Caching is an optimization.

It should not become a hidden source of business state.

Preferred architecture:

```text
React Admin
    ↓
Fastify API
    ↓
Cache
    ↓
PostgreSQL
```

When cache data is unavailable:

```text
Cache miss
   ↓
PostgreSQL
   ↓
Return data
   ↓
Optionally populate cache
```

The application should continue operating correctly without cached data whenever practical.

---

# 3. Cache Layers

Fastify-MasterApp may eventually use multiple cache layers.

```text
Browser
  ↓
React / TanStack Query
  ↓
CDN / Edge
  ↓
Fastify process
  ↓
Redis
  ↓
PostgreSQL
```

Each layer solves a different problem.

---

# 4. Cache Types

## Client Cache

Examples:

- TanStack Query cache
- browser memory
- browser storage where appropriate

## Edge Cache

Examples:

- CDN
- reverse proxy

## Application Cache

Examples:

- in-process LRU cache
- memoization

## Distributed Cache

Example:

- Redis

## Database-Level Caching

PostgreSQL and its infrastructure also benefit from:

- buffer cache
- prepared statements
- connection pooling

Do not confuse database caching with application caching.

---

# 5. Source of Truth

The default hierarchy should be:

```text
PostgreSQL
    ↓
Authoritative business state

Redis
    ↓
Derived/temporary state

TanStack Query
    ↓
Client-side representation
```

If Redis and PostgreSQL disagree, PostgreSQL should normally win.

---

# 6. What Should Be Cached

Good candidates:

- public configuration
- reference data
- permissions metadata where safe
- frequently accessed read models
- expensive immutable/slow-changing queries
- external API responses
- dashboard aggregates
- feature configuration
- non-sensitive lookup data

Poor candidates:

- highly volatile records
- security-sensitive state without careful invalidation
- data with strict real-time requirements
- large objects rarely reused
- user-specific data without correct isolation

---

# 7. Cacheability Checklist

Before caching data, ask:

```text
Is it read frequently?
Is it expensive to compute?
Does it change relatively infrequently?
Can stale data be tolerated?
Can it be invalidated reliably?
Can authorization be represented safely?
Is it safe to store?
Is the cache key unambiguous?
```

If several answers are "no", caching may not be worthwhile.

---

# 8. Cache Key Design

Cache keys must be:

- deterministic
- unique
- versionable
- bounded
- privacy-conscious

Example:

```text
fastify-masterapp:user:v1:{userId}
```

For a list:

```text
fastify-masterapp:users:v1:list:{hash}
```

Avoid keys containing raw sensitive data where unnecessary.

---

# 9. Key Namespaces

Use clear namespaces.

Example:

```text
cache:user:
cache:users:
cache:dashboard:
cache:permissions:
cache:external:
```

Do not mix:

```text
bull:
ratelimit:
session:
cache:
```

without explicit prefixes.

---

# 10. Cache Key Versioning

Version keys when the cached representation changes.

Example:

```text
user:v1:123
```

becomes:

```text
user:v2:123
```

This avoids having to understand every old cached value during a deployment.

Old keys can expire naturally.

---

# 11. Avoid Raw Query Strings

A cache key should not blindly contain an arbitrary query string.

Bad:

```text
users:?search=<untrusted-input>
```

Potential issues:

- very high cardinality
- long keys
- inconsistent ordering
- sensitive data exposure

Normalize and hash complex query parameters.

---

# 12. Query Normalization

Equivalent requests should produce equivalent keys.

For example:

```text
?page=1&limit=20&sort=name
```

and:

```text
?sort=name&limit=20&page=1
```

should not create separate cache entries if they represent the same query.

Canonicalize parameters before hashing.

---

# 13. User-Specific Cache

If data belongs to a user:

```text
user:{userId}:resource:{resourceId}
```

Do not use:

```text
resource:{resourceId}
```

unless the resource is genuinely safe to share across users.

---

# 14. Tenant-Specific Cache

For multi-tenancy:

```text
tenant:{tenantId}:users:{queryHash}
```

Tenant ID must be part of the cache identity.

Never allow:

```text
tenant A data
```

to be served from:

```text
tenant B cache
```

---

# 15. Authorization-Aware Caching

Authorization is one of the biggest cache risks.

Example:

```text
Admin sees 100 users
Normal user sees 10 users
```

Do not cache the response only as:

```text
users:list
```

unless the response is truly identical for all callers.

Possible key:

```text
user:{userId}:users:list:{hash}
```

or:

```text
tenant:{tenantId}:permissionScope:{scopeHash}:{queryHash}
```

The safest design is often to cache a neutral data representation and apply authorization before returning it.

---

# 16. Never Cache Authorization Decisions Blindly

Permissions can change.

Avoid long-lived:

```text
user-is-admin = true
```

without an invalidation strategy.

If permission caching is necessary:

- use short TTLs
- invalidate on role/permission changes
- include version information
- test privilege revocation

---

# 17. Sensitive Data

Be conservative when caching:

- passwords
- refresh tokens
- session secrets
- API keys
- private documents
- financial information
- personal information

Prefer not caching sensitive values unless there is a clear security design.

---

# 18. Authentication Data

Do not casually cache:

```text
password hash
JWT signing secret
refresh token
```

Authentication state should have explicit security semantics.

Redis may store session or refresh-token metadata when designed for it, but this is not ordinary application caching.

---

# 19. Cache vs Session Store

Do not confuse:

```text
cache
```

with:

```text
session store
```

A cache can often be deleted safely.

A session store may represent active security state.

If deleting a cache logs every user out, it is not merely a cache.

Document its semantics explicitly.

---

# 20. Cache Consistency Models

Choose intentionally.

## Strong-ish consistency

Cache is invalidated synchronously after a write.

## Eventual consistency

Cache may remain stale briefly.

## Read-through

Application automatically retrieves and populates cache on miss.

## Write-through

Writes update cache and source of truth together through a controlled mechanism.

## Write-behind

Cache accepts writes and persists later.

Write-behind is risky for business-critical state and should not be the default.

---

# 21. Recommended Default

For Fastify-MasterApp:

```text
PostgreSQL write
      ↓
commit
      ↓
invalidate cache
```

and:

```text
read
 ↓
cache
 ↓ miss
PostgreSQL
 ↓
populate cache
```

This is simple and reliable.

---

# 22. Cache-Aside Pattern

The recommended initial pattern is cache-aside.

```text
Read
 ↓
Check Redis
 ↓
Hit ──────────→ return
 ↓ miss
Query PostgreSQL
 ↓
Set Redis
 ↓
return
```

Benefits:

- simple
- application-controlled
- cache can be rebuilt
- source of truth remains PostgreSQL

---

# 23. Cache-Aside Example

Conceptually:

```ts
const cached = await cache.get(key);

if (cached) {
  return cached;
}

const value = await repository.find(...);

await cache.set(key, value, ttl);

return value;
```

Production code should also handle:

- serialization
- cache errors
- stale data
- observability
- authorization
- stampedes

---

# 24. Cache Write Strategy

For mutations:

```text
BEGIN
  update PostgreSQL
COMMIT

invalidate cache
```

Do not update the cache before the database transaction succeeds unless the architecture explicitly supports that behavior.

Otherwise a failed transaction can produce a false cached state.

---

# 25. Invalidation

Cache invalidation should be explicit.

Examples:

```text
User updated
    ↓
invalidate user:{id}
```

or:

```text
Role changed
    ↓
invalidate affected permission caches
```

The system should define which writes affect which cache keys.

---

# 26. Invalidation Matrix

Maintain an invalidation map.

Example:

| Mutation              | Invalidate                                         |
| --------------------- | -------------------------------------------------- |
| User update           | user detail, relevant lists                        |
| User deletion         | user detail, user lists                            |
| Role update           | role detail, role lists, affected permission cache |
| Permission update     | permission cache                                   |
| Order update          | order detail, affected lists, aggregates           |
| Settings update       | settings cache                                     |
| Dashboard data change | relevant aggregate cache                           |

Do not rely on developers remembering hidden cache relationships.

---

# 27. Delete Invalidation

After:

```text
DELETE /users/:id
```

invalidate:

```text
user:{id}
```

and any relevant:

```text
users:list:*
```

If list keys are difficult to enumerate, use versioned namespaces or tags.

---

# 28. Update Invalidation

After:

```text
PATCH /users/:id
```

invalidate:

```text
user:{id}
```

and all derived representations that could contain the changed user.

---

# 29. Create Invalidation

After:

```text
POST /users
```

invalidate affected list/aggregate caches.

Do not necessarily invalidate unrelated user detail keys.

---

# 30. Namespace Versioning

For large list-cache sets:

```text
users:list:version = 12
```

Key:

```text
users:list:v12:{queryHash}
```

After a mutation:

```text
version = 13
```

All old entries become unreachable and expire naturally.

This avoids scanning Redis for thousands of keys.

---

# 31. Cache Tags

For complex systems, logical tags can represent relationships.

Example:

```text
cache entry:
users:list:abc

tags:
users
tenant:123
```

Mutation:

```text
user updated
 ↓
invalidate tag users
```

Use this only if the cache library/system supports it efficiently.

---

# 32. TTL

Every cache entry should have a defined TTL unless there is a deliberate reason otherwise.

Example:

```text
public configuration: 5 min
reference data: 1 hour
dashboard aggregate: 30 sec
external API response: provider-dependent
```

TTL should reflect:

- freshness requirements
- change frequency
- query cost

---

# 33. TTL Is Not Invalidation

TTL provides eventual expiration.

It does not guarantee immediate consistency.

Example:

```text
TTL = 1 hour
```

does not mean updated data is visible within one hour if immediate invalidation is required.

Use:

```text
mutation → invalidation
+
TTL → safety net
```

---

# 34. Jittered TTL

Large numbers of identical keys can expire simultaneously.

Instead of:

```text
TTL = 300 seconds
```

use small randomized jitter:

```text
300 ± random(0..30)
```

This reduces synchronized cache misses.

---

# 35. Stale-While-Revalidate

For suitable data:

```text
stale cache
   ↓
return stale value
   ↓
background refresh
```

This can improve latency.

Only use when stale data is acceptable.

Never use stale values for security-critical state without an explicit design.

---

# 36. Cache Stampede

A stampede occurs when many requests miss simultaneously.

Example:

```text
cache expires
    ↓
1,000 requests miss
    ↓
1,000 DB queries
```

This can overload PostgreSQL.

---

# 37. Stampede Prevention

Options:

- locking
- single-flight
- request coalescing
- jittered TTL
- stale-while-revalidate
- background refresh

Example:

```text
Request A ─┐
Request B ─┼── one DB query
Request C ─┤
Request D ─┘
              ↓
          cache result
```

---

# 38. Redis Locks

For expensive cache regeneration, a short-lived distributed lock can help.

Conceptually:

```text
SET lock:key token NX PX 5000
```

The lock must have:

- expiration
- ownership token
- safe release
- bounded wait

Do not create locks without understanding failure modes.

---

# 39. Lock Failure

A process can crash while holding a lock.

Therefore locks must expire.

Never create an infinite lock.

---

# 40. Dogpile Prevention

Another approach:

```text
fresh cache
   ↓
serve

stale-but-acceptable cache
   ↓
serve
+
refresh asynchronously
```

This is useful for expensive dashboard/reference data.

---

# 41. Negative Caching

Negative caching stores the result:

```text
resource does not exist
```

Example:

```text
user:123 = NOT_FOUND
```

This can prevent repeated expensive misses.

Use short TTLs because the resource may be created later.

---

# 42. Security Risk of Negative Caching

Do not cache authorization failures as globally reusable data.

Example:

```text
403 for User A
```

must not become:

```text
403 for User B
```

unless the authorization context is identical.

---

# 43. Error Caching

Be conservative about caching errors.

Safe candidates:

- stable public `404`
- external provider response where semantics are understood

Avoid caching:

- `500`
- authentication errors
- authorization errors
- transient database failures

unless deliberately designed.

---

# 44. Cache Serialization

Choose a consistent representation.

Options:

- JSON
- MessagePack
- structured binary formats

JSON is often sufficient initially.

Do not cache:

```text
class instances
```

that depend on process-specific prototypes unless serialization/deserialization is explicit.

---

# 45. Cache Schema

Cached objects should have a predictable shape.

Example:

```json
{
  "version": 1,
  "expiresAt": "2026-09-07T10:00:00Z",
  "data": {}
}
```

The cache layer can also manage metadata separately.

---

# 46. Cache Versioning

When representation changes:

```text
v1
```

becomes:

```text
v2
```

Avoid deserializing unknown old shapes without validation.

TypeBox or equivalent runtime validation can be used when cached data crosses important boundaries.

---

# 47. Cache Corruption

If cached data cannot be parsed:

```text
cache parse error
 ↓
delete bad key
 ↓
fetch PostgreSQL
 ↓
repopulate
```

Do not fail the entire request merely because a non-authoritative cache entry is corrupt.

---

# 48. Cache Failure

A cache should generally fail gracefully.

For ordinary read caching:

```text
Redis unavailable
   ↓
log/metric
   ↓
read PostgreSQL
```

Do not turn:

```text
cache outage
```

into:

```text
application outage
```

unless the cache is intentionally part of critical state.

---

# 49. Fail-Open vs Fail-Closed

For ordinary caching:

```text
prefer fail open
```

Meaning:

```text
cache unavailable → use source of truth
```

For security state such as session revocation, semantics may require stricter behavior.

Document each Redis use separately.

---

# 50. Redis Role Separation

Fastify-MasterApp may use Redis for:

```text
cache
rate limiting
BullMQ
sessions
locks
```

These have different reliability requirements.

Avoid assuming:

```text
Redis is just cache
```

when it also stores security or queue state.

---

# 51. Dedicated Redis Namespaces

Example:

```text
cache:
ratelimit:
bull:
session:
lock:
```

This makes operational investigation easier.

---

# 52. Dedicated Redis Instances

At larger scale, consider separate Redis resources for:

```text
Cache
```

and:

```text
Queues / workers
```

and potentially:

```text
Security/session state
```

This prevents cache eviction or load from affecting critical queue processing.

Start with one managed Redis when scale does not justify separation.

---

# 53. Redis Eviction

Choose an eviction policy appropriate to the workload.

For cache-only data, eviction is expected.

For critical state, eviction may be unacceptable.

Do not put critical session/queue data into a Redis instance configured to evict it unexpectedly.

---

# 54. Cache Memory Limits

Monitor:

- memory usage
- eviction count
- key count
- hit rate
- fragmentation
- latency

A cache that consumes all available memory can become a reliability problem.

---

# 55. Cache Hit Rate

Track:

```text
cache hits
cache misses
```

Formula:

```text
hit rate =
hits / (hits + misses)
```

Example:

```text
9,000 hits
1,000 misses

hit rate = 90%
```

Hit rate alone does not determine whether caching is useful.

---

# 56. Cache Value

Measure:

```text
database queries avoided
latency reduced
Redis cost
cache memory
invalidation complexity
```

A 95% hit rate on a cheap query may provide little benefit.

A 70% hit rate on an expensive query may be extremely valuable.

---

# 57. Cache Metrics

Recommended metrics:

```text
cache_hits_total
cache_misses_total
cache_errors_total
cache_set_total
cache_delete_total
cache_evictions_total
cache_get_duration_seconds
cache_set_duration_seconds
```

Avoid unbounded labels.

Good:

```text
cache="redis"
operation="get"
category="user"
```

Bad:

```text
userId
requestId
email
```

---

# 58. Cache Dashboards

Track:

- hit rate
- miss rate
- Redis latency
- Redis memory
- Redis evictions
- cache errors
- PostgreSQL query rate
- API p95 latency

Correlate cache changes with database load.

---

# 59. Cache Alerts

Potential alerts:

- Redis unavailable
- high Redis latency
- excessive eviction
- sudden hit-rate drop
- cache error spike
- memory near limit

Do not alert on every cache miss.

---

# 60. Cache Warmup

After deployment or Redis restart, cache may be cold.

Possible behavior:

```text
Cold cache
   ↓
DB load increases
   ↓
cache repopulates
   ↓
DB load normalizes
```

This is expected.

Do not automatically prewarm everything.

---

# 61. Selective Warmup

Warm only high-value data:

- public configuration
- frequently used reference data
- dashboard aggregates
- popular read models

Use background jobs where appropriate.

---

# 62. Cache Warming Risk

Aggressive warmup can overload PostgreSQL.

Bad:

```text
startup
 ↓
load millions of records
```

Better:

```text
startup
 ↓
serve normal traffic
 ↓
warm small set
```

or:

```text
controlled background warmup
```

---

# 63. Cache Invalidation on Deployment

Not every deployment requires clearing Redis.

Prefer:

- versioned keys
- targeted invalidation
- TTL

Only flush the entire cache when there is a strong reason.

---

# 64. Avoid `FLUSHALL`

Never use:

```text
FLUSHALL
```

as a routine application deployment strategy.

It can destroy:

- queue state
- sessions
- rate-limit state
- locks

if Redis is shared.

Use namespace-specific invalidation or separate Redis resources.

---

# 65. Cache Flush Procedure

If a full flush is unavoidable:

1. Identify all Redis workloads.
2. Stop dependent workers if necessary.
3. Confirm business impact.
4. Back up/reconcile critical state.
5. Flush only the intended database/namespace.
6. Restart/recover dependent components.
7. Monitor PostgreSQL load.

Prefer avoiding this operation.

---

# 66. Database Query Caching

Before adding Redis, optimize PostgreSQL.

Check:

- indexes
- query plans
- pagination
- N+1 queries
- joins
- selected columns
- connection pool
- query timeouts

Caching a bad query can hide the real problem.

---

# 67. Prisma Considerations

Keep caching outside repository internals unless there is a clear reason.

Preferred:

```text
Route
  ↓
Service
  ↓
Cache
  ↓
Repository
  ↓
Prisma
```

or:

```text
Service
  ↓
Cache abstraction
  ↓
Repository
```

This keeps persistence and caching responsibilities understandable.

---

# 68. Repository Boundary

Repositories should focus on persistence.

Example:

```text
UserRepository
  ↓
Prisma
```

Caching can live in a service/cache layer:

```text
UserService
  ↓
UserCache
  ↓
UserRepository
```

This prevents Prisma-specific caching details from leaking throughout the application.

---

# 69. Service-Level Caching

Service-level caching is often easier to reason about.

Example:

```text
getUserProfile()
    ↓
cache
    ↓
repository
```

The service understands:

- business meaning
- authorization
- invalidation
- freshness requirements

---

# 70. Avoid Hidden Caching

Avoid silently caching inside generic repository methods:

```ts
userRepository.findById();
```

without making callers aware of caching behavior.

Hidden caching makes consistency difficult to reason about.

---

# 71. Cache Abstraction

A small abstraction may look like:

```ts
interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

This allows testing without requiring Redis everywhere.

---

# 72. Cache Provider

A provider may implement:

```text
RedisCache
MemoryCache
NoopCache
```

Useful for:

- production
- tests
- local development
- failure simulations

---

# 73. No-Op Cache

A no-op implementation is useful for testing business logic:

```text
get → null
set → success
delete → success
```

This verifies the application remains correct without caching.

---

# 74. Testing Cache Behavior

Test:

### Hit

```text
cache hit → repository not called
```

### Miss

```text
cache miss → repository called → cache populated
```

### Expiry

```text
expired → repository called
```

### Invalidation

```text
mutation → affected cache deleted
```

### Failure

```text
Redis error → fallback to source
```

---

# 75. Cache Contract Tests

The cache abstraction should have provider-independent tests.

For example:

```text
RedisCache
MemoryCache
```

should both satisfy:

```text
get
set
delete
TTL
```

semantics where supported.

---

# 76. Integration Tests

Test actual Redis for:

- serialization
- TTL
- concurrent requests
- invalidation
- failure behavior

Do not rely only on mocks.

---

# 77. Stampede Tests

Simulate:

```text
100 concurrent cache misses
```

and verify:

```text
not 100 database queries
```

if single-flight protection is part of the design.

---

# 78. Authorization Cache Tests

Critical tests:

```text
Admin → sees admin data
User → sees user data
Admin role revoked
User → no longer receives admin data
```

This must include cache state.

---

# 79. Tenant Isolation Tests

If multi-tenancy exists:

```text
Tenant A request
Tenant B request
```

must never share unauthorized cached results.

Test:

- detail
- list
- search
- dashboard
- aggregate

---

# 80. Privacy Tests

Verify sensitive information does not leak through:

- Redis keys
- logs
- metrics
- cache values
- error messages

---

# 81. Cache Stampede Load Test

Run:

```text
cache expires
 ↓
high concurrency
 ↓
measure DB requests
```

Compare:

```text
without protection
vs
with single-flight/lock
```

---

# 82. Cache Performance Testing

Measure:

- Redis latency
- serialization cost
- cache lookup overhead
- DB queries avoided
- total API latency

Caching should improve end-to-end performance, not merely move work to Redis.

---

# 83. Cache Size

Do not cache arbitrarily large results.

Set limits on:

- object size
- list size
- serialized payload size

For large responses prefer:

- pagination
- object storage
- asynchronous export
- streaming

---

# 84. Large List Caching

Avoid caching:

```text
all users
all orders
```

unless the dataset is genuinely small and stable.

Prefer:

```text
page/cursor-specific results
```

or precomputed aggregates.

---

# 85. Pagination Cache

Example:

```text
users:list:v1:{queryHash}:cursor:{cursor}
```

However, pagination caches can become difficult to invalidate.

Use them when read volume justifies the complexity.

---

# 86. Cursor Pagination

Cursor-based lists are often better for large datasets.

Cache only if:

- query is repeated frequently
- ordering is stable
- invalidation is acceptable

Do not cache dynamic cursors indefinitely.

---

# 87. Dashboard Caching

Dashboards are strong cache candidates.

Instead of:

```text
Dashboard request
 ↓
20 expensive queries
```

consider:

```text
background aggregation
 ↓
Redis
 ↓
Dashboard
```

Use short TTLs such as:

```text
15–60 seconds
```

depending on freshness requirements.

---

# 88. Dashboard Consistency

Document:

```text
Dashboard data may lag by 30 seconds.
```

if eventual consistency is acceptable.

Do not present stale analytics as real-time transactional truth.

---

# 89. Reference Data

Good candidates:

- countries
- status definitions
- static permission metadata
- application configuration
- supported feature metadata

These can often have longer TTLs.

---

# 90. Configuration Caching

Be careful with configuration.

Distinguish:

```text
static application configuration
```

from:

```text
dynamic security configuration
```

Do not cache:

```text
security-critical setting
```

for hours unless invalidation is guaranteed.

---

# 91. Feature Flags

If feature flags are cached:

- use short TTLs
- support explicit invalidation
- fail safely
- define behavior when flag service is unavailable

A stale feature flag can cause unexpected behavior.

---

# 92. External API Caching

Caching external responses can:

- reduce cost
- reduce latency
- protect provider quotas

Define:

- TTL
- stale behavior
- error behavior
- invalidation
- provider terms

Do not cache responses that are user-specific without identity isolation.

---

# 93. External API Failure

If provider fails and stale data is acceptable:

```text
fresh cache
 ↓
provider unavailable
 ↓
serve stale cache
```

Only use this for data where stale information is safe.

---

# 94. HTTP Caching

For public GET endpoints, HTTP caching can be useful.

Headers may include:

```http
Cache-Control
ETag
Last-Modified
```

Do not enable shared caching for private user-specific responses without correct cache-control headers.

---

# 95. `Cache-Control`

Private response:

```http
Cache-Control: private, max-age=30
```

Public response:

```http
Cache-Control: public, max-age=60
```

The exact policy depends on the endpoint.

---

# 96. ETags

ETags can reduce transfer and server work.

Example:

```http
ETag: "resource-version"
```

Client:

```http
If-None-Match: "resource-version"
```

Server:

```http
304 Not Modified
```

ETags are especially useful for stable resources.

---

# 97. ETag vs Redis

These solve different problems.

### ETag

Reduces response transfer/work when the client already has the representation.

### Redis cache

Reduces backend computation/database work.

They can be used together.

---

# 98. Browser Cache Security

Do not allow sensitive responses to be cached publicly.

For sensitive Admin responses, carefully configure:

```http
Cache-Control
```

to prevent shared intermediary caching.

---

# 99. React Admin Caching

TanStack Query already provides client-side caching.

Use it intentionally for:

- current user
- lists
- details
- dashboard queries
- reference data

Do not duplicate the same cache logic unnecessarily in Zustand.

---

# 100. TanStack Query Responsibilities

TanStack Query should generally own:

- server-state caching
- stale time
- refetching
- invalidation
- request deduplication

Zustand should generally own:

- UI state
- local preferences
- non-server interaction state

---

# 101. `staleTime`

Use `staleTime` to express freshness.

Example:

```text
Current user:
1–5 minutes

Reference data:
30 minutes–hours

Dashboard:
15–60 seconds

Frequently changing list:
short
```

Tune from behavior, not arbitrary values.

---

# 102. `gcTime`

TanStack Query's garbage-collection duration controls how long inactive query data remains available.

It is different from freshness.

```text
staleTime
    = how long data is considered fresh

gcTime
    = how long inactive data can remain cached
```

---

# 103. Query Invalidation

After a mutation:

```text
update user
   ↓
invalidate user detail
   ↓
invalidate affected user lists
```

Prefer targeted invalidation.

Avoid:

```text
invalidate everything
```

after every mutation.

---

# 104. Optimistic Updates

Optimistic UI can improve Admin responsiveness.

Use only when:

- operation is predictable
- rollback is safe
- authorization is already enforced server-side

After success:

```text
invalidate/reconcile
```

Do not treat the optimistic client state as authoritative.

---

# 105. Cache and Authentication

When a user logs out:

- clear user-specific query caches
- clear sensitive local state
- remove access credentials according to auth architecture
- prevent another user from seeing previous user's cached data

This is critical on shared browsers.

---

# 106. User Switching

If an Admin can switch users/accounts/tenants:

```text
identity changes
 ↓
clear/invalidate identity-scoped cache
 ↓
load new identity data
```

Never reuse a previous user's query cache under a new identity.

---

# 107. Cache and RBAC Changes

When roles/permissions change:

```text
permission mutation
 ↓
invalidate affected user permission cache
 ↓
invalidate Admin UI queries
```

For privileged changes, prefer immediate invalidation.

---

# 108. Cache and Audit Logging

Cache reads normally do not require audit events.

Cache-related security events may be logged when:

- cache access exposes sensitive data
- authorization cache is invalidated
- emergency cache flush occurs
- security state is affected

Do not generate audit noise for ordinary cache hits.

---

# 109. Cache and Rate Limiting

Rate limiting should happen before cache access where the request itself must be protected.

Example:

```text
request
 ↓
rate limit
 ↓
cache
```

Otherwise a cheap cache endpoint can still be abused for:

- CPU
- network
- Redis operations

---

# 110. Cache and Background Jobs

Workers can use Redis caching too.

Be careful not to confuse:

```text
job state
```

with:

```text
cache state
```

Critical job state should remain durable/recoverable.

---

# 111. Cache and Outbox

Outbox records are durable business/integration state.

Do not cache the outbox as the only copy.

Preferred:

```text
PostgreSQL outbox
 ↓
publisher
 ↓
Redis/BullMQ
```

Cache is not a replacement for the outbox.

---

# 112. Cache and Transactions

Do not make Redis cache writes part of the database transaction unless the architecture specifically requires distributed transaction semantics.

Preferred:

```text
DB transaction
 ↓
commit
 ↓
cache invalidation
```

---

# 113. Invalidation Failure

A database mutation may succeed while cache invalidation fails.

Example:

```text
PostgreSQL update → success
Redis delete → failure
```

The cache may remain stale.

Mitigations:

- short TTL
- retry invalidation
- outbox-based invalidation
- versioned keys
- reconciliation

For critical data, consider durable cache-invalidation events.

---

# 114. Transactional Invalidation

For important caches:

```text
BEGIN
  update business data
  insert cache-invalidation event
COMMIT
```

Then:

```text
worker
 ↓
invalidate Redis
```

This provides durable invalidation intent.

Do not introduce this complexity for every simple cache.

---

# 115. Cache Invalidation Outbox

Conceptual:

```text
PostgreSQL
 ├── business update
 └── cache invalidation event
          ↓
       publisher
          ↓
        Redis
```

If Redis is down, the event remains durable.

This is useful for high-value derived caches.

---

# 116. Cache Reconciliation

Periodically verify important cached data against PostgreSQL.

Useful for:

- aggregates
- critical configuration
- permission-related derived data

Reconciliation should be targeted rather than continuously comparing everything.

---

# 117. Cache Stampede During Recovery

After Redis failure:

```text
empty cache
 ↓
many requests
 ↓
database overload
```

Mitigate with:

- gradual warmup
- request coalescing
- DB connection protection
- concurrency limits
- cache prewarming for high-value keys

---

# 118. Cache Recovery

If Redis is lost:

```text
Redis unavailable
 ↓
API falls back where safe
 ↓
Redis restored
 ↓
cache repopulates
```

Do not require a full cache restore for ordinary derived data.

The cache should be rebuildable.

---

# 119. Redis Persistence

For ordinary cache data, persistence may not be necessary.

For Redis uses involving:

- BullMQ
- sessions
- security state

persistence/recovery requirements are different.

Document each Redis workload independently.

---

# 120. Cache Backups

Do not assume Redis cache backups are necessary.

Ask:

```text
Can this data be rebuilt from PostgreSQL?
```

If yes, prioritize PostgreSQL backups.

If Redis contains durable queue/session/security state, follow the appropriate recovery strategy.

---

# 121. Cache Eviction Strategy

For cache-only workloads, eviction should favor availability.

Possible strategies include:

- LRU
- LFU
- TTL-based eviction

Choose based on access patterns.

Do not select an eviction policy without understanding what else shares the Redis instance.

---

# 122. Hot Keys

A hot key is accessed extremely frequently.

Example:

```text
config:global
```

Potential problems:

- concentrated Redis traffic
- latency
- CPU

Mitigations:

- local short-lived cache
- replication/read scaling where appropriate
- precomputation
- controlled refresh

Use local caching carefully if data can become stale.

---

# 123. Cache Penetration

Cache penetration occurs when requests repeatedly query nonexistent data.

Example:

```text
/user/999999999
```

when it does not exist.

Mitigations:

- negative caching
- validation
- abuse protection
- request limits
- identifier sanity checks

---

# 124. Cache Avalanche

An avalanche occurs when many entries expire at once.

Mitigations:

- TTL jitter
- staggered refresh
- background warming
- namespaces
- request coalescing

---

# 125. Cache Breakdown

Cache breakdown can occur when one extremely popular key expires.

Mitigations:

- single-flight
- distributed lock
- stale-while-revalidate
- proactive refresh

---

# 126. Cache Security Threats

Consider:

- cache poisoning
- unauthorized cache reads
- cross-user leakage
- cross-tenant leakage
- sensitive data retention
- key manipulation
- Redis exposure
- stale authorization
- compromised Redis credentials

---

# 127. Cache Poisoning

Never construct cache keys or values directly from untrusted input without normalization and validation.

Validate:

- route parameters
- query parameters
- identity
- tenant
- serialization

---

# 128. Cache Poisoning Through Authorization

A dangerous pattern:

```text
Admin request
 ↓
cache response
 ↓
normal user receives cached response
```

This can expose privileged data.

Authorization context must be part of the design.

---

# 129. Redis Network Security

Redis should generally be:

- private
- authenticated
- encrypted in transit where appropriate
- firewall-restricted
- accessible only to required services

Do not expose Redis directly to the public internet.

---

# 130. Redis Credentials

Store Redis credentials in the secret manager.

Do not place:

```text
REDIS_PASSWORD
```

in:

- source code
- logs
- metrics
- client-visible responses

---

# 131. Cache Observability Security

Metrics should not expose:

- raw cache keys
- emails
- user IDs
- tenant IDs
- tokens

Use bounded categories.

---

# 132. Cache Logging

Log cache failures, not every successful hit.

Useful:

```text
cache operation
category
duration
error type
fallback used
```

Avoid high-volume per-key logging.

---

# 133. Cache Error Policy

For ordinary cache failures:

```text
cache error
 ↓
record metric
 ↓
structured log
 ↓
fallback to DB
```

Do not expose:

```text
Redis connection error
```

to end users.

---

# 134. Timeouts

Cache operations should have bounded latency.

A slow Redis request should not hold an API request indefinitely.

Use:

- client timeouts
- connection limits
- bounded retries

---

# 135. Cache Retry Policy

Do not aggressively retry Redis.

Bad:

```text
Redis timeout
 ↓
retry 10 times
 ↓
API request hangs
```

Better:

```text
Redis timeout
 ↓
bounded retry if appropriate
 ↓
fallback
```

---

# 136. Cache and Circuit Breakers

For unstable Redis or external cache providers, a circuit breaker can prevent repeated failures.

Example:

```text
Redis errors ↑
 ↓
open circuit
 ↓
temporary DB fallback
 ↓
periodic Redis probe
 ↓
close circuit
```

Use only where operational complexity is justified.

---

# 137. Cache Latency Budget

Define a target.

Example:

```text
Redis GET p95 < 10ms
```

The actual target depends on deployment topology.

Monitor the complete request:

```text
API
 ↓
cache
 ↓
DB
```

not just Redis in isolation.

---

# 138. Serialization Performance

Large JSON objects can make serialization/deserialization expensive.

Measure:

```text
Redis latency
+
serialization time
```

A cache hit is not automatically cheap if the object is huge.

---

# 139. Compression

Compression can reduce Redis memory and network usage but adds CPU.

Use it only after measurement.

Do not compress tiny values unnecessarily.

---

# 140. Cache Object Shape

Cache only the fields needed by the consumer.

Bad:

```text
entire database record with sensitive/internal fields
```

Better:

```text
small read model
```

This reduces:

- memory
- serialization
- privacy risk
- coupling

---

# 141. Read Models

For expensive dashboards/reports, create explicit read models.

Example:

```text
PostgreSQL
 ↓
aggregation
 ↓
dashboard read model
 ↓
Redis
 ↓
Admin
```

This is often better than caching raw ORM entities.

---

# 142. Avoid ORM Object Caching

Do not cache Prisma model instances directly.

Cache serializable data transfer objects/read models.

Benefits:

- stable representation
- smaller payload
- no ORM coupling
- easier versioning

---

# 143. Cache API Response vs Domain Object

Prefer caching a deliberately designed representation.

For example:

```text
UserSummary
```

rather than:

```text
Prisma User
```

This prevents accidental exposure of fields.

---

# 144. API Response Caching

Response caching can be useful for:

- public immutable resources
- stable reference endpoints
- expensive public reads

For authenticated responses, prefer application-level cache unless shared HTTP caching is explicitly safe.

---

# 145. Cache Headers

For private Admin APIs:

```http
Cache-Control: private, no-store
```

may be appropriate for especially sensitive responses.

For less sensitive private data:

```http
private, max-age=30
```

may be appropriate.

Choose per endpoint.

---

# 146. CDN Caching

Only cache responses at a shared edge when:

- response is public
- authorization does not vary
- cache key is correct
- invalidation is manageable

Never accidentally CDN-cache a private Admin response.

---

# 147. Cache-Control Review

For every endpoint eligible for caching, review:

```text
public/private
max-age
s-maxage
no-store
ETag
Vary
Authorization
Cookie
```

---

# 148. `Vary`

When representation changes based on a request header, use appropriate `Vary` semantics.

However, excessive `Vary` dimensions can destroy cache efficiency.

Do not casually vary on arbitrary headers.

---

# 149. Authorization Header

Be especially careful when responses depend on:

```http
Authorization
```

A shared intermediary must not reuse one user's response for another user.

For private APIs, application-level caching is often safer.

---

# 150. Cache Invalidation Testing Matrix

For every cached resource:

| Operation     | Cache action                           |
| ------------- | -------------------------------------- |
| Create        | invalidate relevant lists              |
| Read          | get/set                                |
| Update        | invalidate detail + derived lists      |
| Delete        | invalidate detail + lists              |
| Restore       | invalidate detail + lists              |
| Bulk update   | invalidate affected namespace          |
| Role change   | invalidate permission-sensitive caches |
| Tenant change | invalidate tenant namespace            |

---

# 151. Bulk Invalidation

Bulk operations can affect many keys.

Avoid iterating through millions of Redis keys.

Prefer:

- namespace versioning
- tags
- generation counters

Example:

```text
users:generation = 42
```

Keys include:

```text
users:v42:...
```

After bulk mutation:

```text
generation = 43
```

---

# 152. Cache Generation

Generation-based invalidation is particularly useful for:

- lists
- dashboards
- tenant-wide derived data
- large cache namespaces

It avoids expensive key scans.

---

# 153. Avoid `KEYS`

Do not run:

```text
KEYS cache:users:*
```

in production on a large Redis instance.

It can block Redis.

Prefer:

- versioned namespaces
- `SCAN` when necessary
- dedicated Redis databases/resources
- logical tags

---

# 154. Cache Warmup After Deployment

A deployment should not automatically cause a database storm.

If a new cache key version is introduced:

```text
v1 → v2
```

allow gradual population.

For high-value data, use controlled warmup.

---

# 155. Cache Compatibility During Rollout

During rolling deployments:

```text
API v1
API v2
```

may run simultaneously.

Use versioned cache entries if representations differ.

Avoid having v2 write values that v1 cannot parse.

---

# 156. Blue/Green Deployments

Blue/green environments may share Redis.

If so:

- version cache keys
- isolate namespaces
- avoid incompatible representations
- clear only intended data

---

# 157. Cache and API Versioning

When API response contracts change:

```text
/api/v1
/api/v2
```

consider:

```text
cache:api:v1:
cache:api:v2:
```

or cache an internal neutral read model and transform at the API boundary.

---

# 158. Cache and Database Migrations

A migration may change the underlying data shape.

Before deploying:

- review cached representations
- version keys if needed
- invalidate incompatible values
- ensure rollback compatibility

Do not let old cached data crash new application code.

---

# 159. Cache and Rollback

If rolling back:

```text
v2 cache
```

may not be readable by:

```text
v1 application
```

Version cache representations to make rollback safer.

---

# 160. Cache and Feature Flags

A feature flag can change cache behavior.

Example:

```text
newDashboard = true
```

If the new dashboard uses a different read model:

```text
dashboard:v2:
```

Keep old and new representations isolated during rollout.

---

# 161. Cache Testing in CI

CI should test:

- cache abstraction
- Redis integration
- invalidation
- TTL
- authorization
- tenant isolation
- deployment compatibility

Do not require production Redis credentials in CI.

---

# 162. Test Redis Isolation

Every test run should use isolated Redis state.

Options:

- ephemeral Redis container
- unique namespace
- dedicated test database
- test-specific instance

Never share production cache state.

---

# 163. Cache Test Data

Use deterministic keys.

Clean up after tests.

Avoid tests that depend on cache entries left by another test.

---

# 164. Cache Race Conditions

Test concurrent operations:

```text
two updates
+
cache invalidation
```

and:

```text
read during update
```

Consistency behavior should be documented.

---

# 165. Stale Read Tests

If eventual consistency is accepted:

```text
write
 ↓
read
```

should have documented semantics.

If immediate consistency is required, verify invalidation completes before returning.

---

# 166. Cache Monitoring During Incidents

During incidents check:

```text
Redis
 ↓
latency
memory
evictions
errors
connections
```

Then compare:

```text
API
 ↓
cache hit rate
 ↓
DB load
```

A cache failure may manifest as a database incident.

---

# 167. Cache Incident Runbook

## Redis unavailable

```text
Confirm Redis failure
 ↓
Determine workload
 ↓
Enable safe fallback
 ↓
Monitor DB load
 ↓
Restore Redis
 ↓
Gradually repopulate
 ↓
Verify hit rate
```

---

# 168. Cache Stampede Incident

```text
Detect DB spike
 ↓
Check cache hit rate
 ↓
Check expiration pattern
 ↓
Identify hot keys
 ↓
Reduce regeneration concurrency
 ↓
Restore cache
 ↓
Monitor DB
```

---

# 169. Cache Poisoning Incident

```text
Identify affected keys
 ↓
Stop affected endpoint if needed
 ↓
Invalidate malicious values
 ↓
Review authorization
 ↓
Review key construction
 ↓
Patch
 ↓
Validate
 ↓
Review historical exposure
```

---

# 170. Cross-Tenant Leakage Incident

Treat as a security incident.

Immediately:

- disable affected cache path
- preserve evidence
- invalidate affected keys
- review access logs
- determine affected tenants/users
- patch key/authorization logic
- add regression tests
- assess notification obligations

---

# 171. Cache Credential Compromise

If Redis credentials are exposed:

```text
Rotate credentials
 ↓
Restrict network access
 ↓
Review Redis activity
 ↓
Restart/reconfigure clients
 ↓
Invalidate sensitive state if required
 ↓
Monitor
```

If Redis contains sessions or security state, assess additional impact.

---

# 172. Cache Recovery

For ordinary derived cache:

```text
delete/rebuild
```

For critical Redis state:

```text
follow workload-specific recovery
```

Do not use a single generic Redis recovery policy.

---

# 173. Capacity Planning

Estimate:

```text
average cached object size
×
number of entries
×
replication/overhead
```

Add headroom.

Monitor actual usage.

---

# 174. Cache Cost Model

Evaluate:

```text
Redis cost
+
engineering complexity
+
invalidation complexity
+
operational risk
```

against:

```text
DB load reduction
+
latency reduction
+
external API savings
```

Caching is not free.

---

# 175. When Not to Cache

Do not cache when:

- query is already fast
- data changes constantly
- invalidation is harder than recomputation
- data is highly sensitive
- hit rate is very low
- memory cost is excessive
- consistency requirements are strict

---

# 176. Cache Decision Record

For important caches, document:

```text
Cache:
Purpose:
Source of truth:
Key:
TTL:
Invalidation:
Stale tolerance:
Authorization scope:
Failure behavior:
Owner:
Metrics:
```

This prevents undocumented cache semantics.

---

# 177. Recommended Cache Registry

A central registry can describe policies.

Conceptually:

```ts
type CachePolicy = {
  name: string;
  ttlSeconds: number;
  namespace: string;
  scope: "public" | "user" | "tenant";
  staleAllowed: boolean;
};
```

Routes/services reference policies instead of scattering magic TTLs.

---

# 178. Cache Policy Examples

```text
user-profile
  TTL: 60s
  scope: user

reference-data
  TTL: 1h
  scope: public

dashboard-summary
  TTL: 30s
  scope: tenant

external-provider-response
  TTL: provider-defined
  scope: user/tenant
```

---

# 179. Avoid Magic TTLs

Bad:

```ts
redis.set(key, value, 437);
```

Better:

```ts
cache.set(key, value, CACHE_POLICIES.userProfile.ttl);
```

Centralized policies improve reviewability.

---

# 180. Cache Documentation

For each cached endpoint document:

- whether caching exists
- scope
- TTL
- invalidation
- stale behavior
- failure behavior

Developers should not need to inspect Redis to understand correctness.

---

# 181. API Documentation

Swagger does not need to expose Redis internals.

It may document:

- public cache behavior
- ETags
- `304 Not Modified`
- freshness guarantees where important

Internal cache implementation remains an architecture concern.

---

# 182. Admin UX

Caching should improve:

- list navigation
- back/forward navigation
- dashboard loading
- reference data

But users should have predictable refresh behavior.

For critical mutations, refresh/invalidate affected data immediately.

---

# 183. Manual Refresh

Admin users may need a manual refresh action.

Manual refresh should:

```text
invalidate query
 ↓
fetch current data
```

not necessarily:

```text
flush Redis
```

---

# 184. Optimistic Admin Updates

After an optimistic mutation:

```text
UI update
 ↓
API mutation
 ↓
success → invalidate/reconcile
failure → rollback
```

Server state remains authoritative.

---

# 185. Search Caching

Search caching can be useful for repeated queries.

But search keys can have enormous cardinality.

Use:

- normalized query
- maximum query length
- bounded page size
- short TTL
- selective caching

Do not cache every arbitrary search indefinitely.

---

# 186. Autocomplete

Autocomplete requests are frequent.

Use:

- client-side debounce
- server-side rate limiting
- short cache TTL
- minimum query length

Example:

```text
minimum 2–3 characters
```

depending on the feature.

---

# 187. Pagination Cache and Mutation

After a mutation, cached pages may become stale.

Possible strategy:

```text
invalidate list namespace
```

rather than trying to update every cached page.

Use targeted updates only when the complexity is justified.

---

# 188. Cache and Sorting

Different sort orders produce different representations.

Include normalized sort parameters in the cache key.

Example:

```text
users:list:v1:{filterHash}:{sortHash}:{page}
```

---

# 189. Cache and Filtering

All result-affecting filters must participate in the cache identity.

Never:

```text
users:list
```

for:

```text
role=admin
```

and:

```text
role=user
```

unless the cached value is intentionally shared.

---

# 190. Cache and Permissions

Permission changes should invalidate:

```text
current-user
permission
navigation
protected-list
```

queries in the Admin frontend as appropriate.

The API must still enforce authorization independently.

---

# 191. Cache and Soft Deletes

If using soft deletes:

```text
deletedAt
```

must be reflected in cache behavior.

After soft delete:

```text
invalidate detail
invalidate lists
```

Do not let stale cached records appear as active resources.

---

# 192. Cache and Restore

After database restoration:

```text
old Redis cache
```

may represent a different database state.

For major database restore events:

```text
invalidate incompatible caches
```

or isolate Redis until consistency is confirmed.

This is especially important for PITR recovery.

---

# 193. Cache and Disaster Recovery

Ordinary cache data usually does not need restoration.

Recovery should prioritize:

```text
PostgreSQL
API
authentication
workers
```

then:

```text
Redis cache
```

can be rebuilt.

Follow `DISASTER_RECOVERY.md`.

---

# 194. Cache and Incident Response

If caching causes a production incident:

- declare appropriate severity
- contain affected cache path
- preserve logs/metrics
- disable caching temporarily if safe
- validate source-of-truth behavior
- recover
- perform postmortem

Follow `INCIDENT_RESPONSE.md`.

---

# 195. Cache and Rate Limiting

Do not remove rate limits simply because an endpoint is cached.

Cached endpoints can still consume:

- CPU
- network
- Redis
- connection pools

Follow `RATE_LIMITING.md`.

---

# 196. Cache and Performance

Caching should be part of a measured performance strategy.

Follow `PERFORMANCE.md` for:

- latency
- DB optimization
- load testing
- profiling
- capacity planning

---

# 197. Cache and Observability

Follow `OBSERVABILITY.md` for:

- metrics
- dashboards
- alerts
- tracing
- structured logs

Caching must be observable without logging every key.

---

# 198. Cache and Security

Follow `SECURITY.md` for:

- sensitive data
- access control
- secrets
- Redis network security
- privacy

Caching should never weaken authorization.

---

# 199. Cache and Database

Follow `DATABASE.md` for:

- indexes
- query optimization
- transactions
- consistency
- Prisma boundaries

Caching is not a replacement for a healthy database design.

---

# 200. Recommended Fastify-MasterApp Cache Architecture

The initial production architecture should be:

```text
                    React Admin
                         │
                  TanStack Query
                         │
                    Fastify API
                         │
                 ┌───────┴────────┐
                 │                │
             Cache layer       Services
                 │                │
               Redis         Repositories
                                  │
                                Prisma
                                  │
                              PostgreSQL
```

With:

```text
PostgreSQL = source of truth
Redis      = distributed derived cache
TanStack   = client-side server-state cache
```

---

# 201. Recommended Cache Flow

## Read

```text
Request
 ↓
Authenticate
 ↓
Authorize
 ↓
Validate
 ↓
Cache lookup
 ├── hit → return
 └── miss
       ↓
   PostgreSQL
       ↓
   cache set
       ↓
   return
```

Authorization must not be bypassed because data came from cache.

---

# 202. Recommended Mutation Flow

```text
Request
 ↓
Authenticate
 ↓
Authorize
 ↓
Validate
 ↓
BEGIN
 ↓
PostgreSQL mutation
 ↓
COMMIT
 ↓
Invalidate affected cache
 ↓
Return response
```

For highly critical caches:

```text
PostgreSQL transaction
 ↓
outbox invalidation event
 ↓
worker
 ↓
Redis invalidation
```

---

# 203. Recommended Cache Failure Flow

```text
Cache request
 ↓
Redis unavailable
 ↓
bounded fallback
 ↓
PostgreSQL
 ↓
return correct data
```

For cache-only data, availability should generally win.

For security/session state, follow the stricter workload-specific policy.

---

# 204. Implementation Structure

A maintainable implementation could be:

```text
apps/api/src/
  cache/
    cache.interface.ts
    redis-cache.ts
    memory-cache.ts
    noop-cache.ts
    policies.ts
    keys.ts
    serialization.ts
    invalidation.ts

  plugins/
    redis.ts
    cache.ts

  services/
    users/
    roles/
    dashboard/
```

The exact structure should follow the repository's existing module conventions.

---

# 205. Cache Key Helper

Centralize key creation.

Conceptually:

```ts
const userKey = cacheKeys.user(userId);
```

instead of:

```ts
`user:${userId}`;
```

throughout the codebase.

This prevents inconsistent naming.

---

# 206. Cache Policy Helper

Centralize policy selection.

Conceptually:

```ts
cachePolicies.userProfile;
cachePolicies.dashboardSummary;
cachePolicies.referenceData;
```

This makes TTL review easier.

---

# 207. Cache Invalidation Helper

Centralize invalidation.

Conceptually:

```ts
await invalidateUser(userId);
```

instead of manually deleting unrelated keys throughout services.

---

# 208. Cache Dependency Graph

For complex modules:

```text
User
 ├── user detail
 ├── user lists
 ├── dashboard counts
 └── permission-derived views
```

A user mutation must define which derived caches are affected.

Document these relationships.

---

# 209. Avoid Global Invalidation

Bad:

```text
any mutation
 ↓
flush all cache
```

This causes:

- DB spikes
- Redis churn
- latency increases
- poor cache hit rate

Use targeted invalidation.

---

# 210. Cache Warmup After Flush

If a namespace is intentionally invalidated:

```text
invalidate
 ↓
normal traffic
 ↓
repopulate
```

Do not immediately execute massive warmup queries.

---

# 211. Cache Review Checklist

Before introducing a cache:

- [ ] source of truth identified
- [ ] read frequency measured
- [ ] query cost measured
- [ ] stale tolerance defined
- [ ] key designed
- [ ] scope defined
- [ ] TTL defined
- [ ] invalidation defined
- [ ] failure behavior defined
- [ ] authorization reviewed
- [ ] privacy reviewed
- [ ] metrics defined
- [ ] tests defined

---

# 212. Security Checklist

- [ ] no passwords cached
- [ ] no tokens cached unnecessarily
- [ ] no secrets in keys
- [ ] tenant isolation verified
- [ ] user isolation verified
- [ ] authorization remains server-side
- [ ] Redis is private
- [ ] Redis credentials are managed securely
- [ ] cache logs do not expose sensitive data
- [ ] shared HTTP caching reviewed

---

# 213. Performance Checklist

- [ ] hit rate measured
- [ ] DB load reduction measured
- [ ] Redis latency measured
- [ ] serialization cost measured
- [ ] cache size measured
- [ ] eviction monitored
- [ ] stampede behavior tested
- [ ] hot keys identified
- [ ] large values avoided

---

# 214. Reliability Checklist

- [ ] cache can be rebuilt
- [ ] Redis failure behavior documented
- [ ] fallback tested
- [ ] TTL exists
- [ ] invalidation failures handled
- [ ] deployment compatibility tested
- [ ] rollback compatibility tested
- [ ] database restore interaction understood

---

# 215. Admin Checklist

- [ ] TanStack Query owns server-state caching
- [ ] mutation invalidation exists
- [ ] logout clears sensitive query state
- [ ] user switching clears identity-scoped state
- [ ] 429 behavior is safe
- [ ] manual refresh is supported where useful
- [ ] stale data behavior is understandable

---

# 216. Testing Checklist

- [ ] cache hit
- [ ] cache miss
- [ ] TTL
- [ ] invalidation
- [ ] Redis failure
- [ ] serialization failure
- [ ] concurrent requests
- [ ] stampede
- [ ] RBAC
- [ ] tenant isolation
- [ ] user isolation
- [ ] deployment compatibility
- [ ] rollback compatibility
- [ ] load testing

---

# 217. Operations Checklist

- [ ] Redis health monitored
- [ ] cache hit rate monitored
- [ ] memory monitored
- [ ] evictions monitored
- [ ] latency monitored
- [ ] emergency flush procedure documented
- [ ] namespace strategy documented
- [ ] ownership assigned

---

# 218. Anti-Patterns

## Anti-pattern 1 — Cache Everything

Caching everything increases complexity without guaranteed benefit.

---

## Anti-pattern 2 — Cache Without Invalidation

Long TTL plus no invalidation creates stale data.

---

## Anti-pattern 3 — Cache Without Authorization Scope

This can become a data-leak vulnerability.

---

## Anti-pattern 4 — Redis as Source of Truth

Cache loss should not destroy business state.

---

## Anti-pattern 5 — Flush Redis on Every Deploy

This can create a database storm and destroy unrelated Redis workloads.

---

## Anti-pattern 6 — Cache Entire ORM Entities

This increases coupling and can expose fields unintentionally.

---

## Anti-pattern 7 — Infinite TTL

Permanent cached values become difficult to invalidate.

---

## Anti-pattern 8 — Huge Cached Responses

Large values consume memory and increase serialization cost.

---

## Anti-pattern 9 — `KEYS` for Invalidation

It can block Redis.

---

## Anti-pattern 10 — Ignore Cache Failures

A cache outage should not automatically become an application outage.

---

## Anti-pattern 11 — Cache Authorization Failures Globally

A user-specific `403` must not become another user's result.

---

## Anti-pattern 12 — Cache Before Database Commit

This can expose data that never actually committed.

---

## Anti-pattern 13 — Cache Without Metrics

Without hit rate and latency measurements, caching becomes guesswork.

---

# 219. Implementation Roadmap

## Phase 1 — Measure First

Identify:

- slow endpoints
- repeated queries
- expensive queries
- high-volume reads

Do not add Redis blindly.

---

## Phase 2 — Cache Abstraction

Implement:

```text
Cache interface
Redis provider
No-op provider
policy registry
key helpers
```

---

## Phase 3 — High-Value Read Caches

Start with:

- reference data
- public configuration
- dashboard summaries
- expensive read models

---

## Phase 4 — Targeted Invalidation

Add:

- mutation invalidation
- namespace generation
- TTL safety net

---

## Phase 5 — Admin Client Cache

Tune:

- TanStack Query
- stale times
- query invalidation
- refresh behavior

---

## Phase 6 — Stampede Protection

Add only where required:

- single-flight
- locks
- stale-while-revalidate
- jittered TTL

---

## Phase 7 — Observability

Add:

- hit/miss metrics
- Redis dashboards
- alerts
- cache error tracking

---

## Phase 8 — Advanced Caching

Only when justified:

- external API caching
- tenant-specific caching
- read models
- cache tags
- multi-layer caching
- CDN caching

---

# 220. Definition of Done

Caching is production-ready when:

### Architecture

- [ ] cache responsibilities are documented
- [ ] PostgreSQL remains source of truth
- [ ] Redis namespaces are defined
- [ ] cache policies are centralized

### Correctness

- [ ] TTLs are defined
- [ ] invalidation is defined
- [ ] stale behavior is documented
- [ ] mutation flows are tested

### Security

- [ ] authorization is preserved
- [ ] tenant isolation is preserved
- [ ] sensitive data is minimized
- [ ] Redis is secured
- [ ] cache keys are privacy-conscious

### Reliability

- [ ] Redis failure behavior is defined
- [ ] fallback is tested
- [ ] cache can be rebuilt
- [ ] recovery behavior is documented

### Performance

- [ ] cache hit rate measured
- [ ] Redis latency measured
- [ ] DB load reduction measured
- [ ] cache memory monitored
- [ ] stampede behavior tested

### Admin

- [ ] TanStack Query caching is configured
- [ ] mutations invalidate affected queries
- [ ] logout clears sensitive state
- [ ] user/tenant switching is safe

### Operations

- [ ] dashboards exist
- [ ] alerts exist
- [ ] ownership exists
- [ ] emergency procedures exist

### Testing

- [ ] unit tests
- [ ] integration tests
- [ ] security tests
- [ ] isolation tests
- [ ] concurrency tests
- [ ] load tests

---

# 221. Final Golden Rules

1. **PostgreSQL remains the durable source of business truth.**
2. **Caching is an optimization, not an authority.**
3. **Use cache-aside as the default starting pattern.**
4. **Every cache needs a clear key, scope, TTL, and invalidation strategy.**
5. **Authorization must remain enforced even on cache hits.**
6. **Never allow cross-user or cross-tenant cache leakage.**
7. **Do not cache secrets or authentication credentials unnecessarily.**
8. **Use Redis for distributed caching when horizontal scaling requires it.**
9. **Do not assume every Redis workload is disposable cache state.**
10. **Separate cache, queue, rate-limit, and session semantics.**
11. **Prefer targeted invalidation over global cache flushes.**
12. **Never use `FLUSHALL` as a routine deployment operation.**
13. **Use namespace versioning for large invalidation sets.**
14. **Do not use `KEYS` for large production invalidation.**
15. **Use TTL as a safety net, not as the only consistency mechanism.**
16. **Protect expensive cache regeneration from stampedes.**
17. **Design for Redis failure and safe fallback.**
18. **Cache read models instead of raw ORM entities where practical.**
19. **Measure before and after caching.**
20. **Do not cache inefficient queries instead of fixing them.**
21. **Version cache representations across incompatible deployments.**
22. **Clear identity-scoped client caches on logout/user changes.**
23. **Treat authorization and security-state caches more strictly than ordinary data caches.**
24. **Test cache invalidation, failure, concurrency, and isolation.**
25. **A cache that cannot be explained is a cache that will eventually cause an incident.**

---

# 222. Final Principle

The desired caching architecture is:

```text
                    Client
                      │
                TanStack Query
                      │
                   Fastify
                      │
              ┌───────▼───────┐
              │ Cache Layer   │
              └───────┬───────┘
                      │
                Redis Cache
                      │
                  cache miss
                      │
                 PostgreSQL
                      │
                Source of Truth
```

With writes:

```text
API mutation
     ↓
Authorization
     ↓
PostgreSQL transaction
     ↓
Commit
     ↓
Targeted cache invalidation
     ↓
Response
```

And failure:

```text
Redis unavailable
     ↓
Safe fallback
     ↓
PostgreSQL
     ↓
Correct response
```

Fastify-MasterApp should therefore follow:

**measure → cache high-value reads → define freshness → invalidate deliberately → observe → test failure → scale only when evidence requires it.**
