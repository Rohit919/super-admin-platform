# PERFORMANCE.md

# Fastify-MasterApp — Performance, Capacity & Scalability Guide

> Production-grade performance guidance for the Fastify API, React Admin frontend, PostgreSQL/Prisma, Redis/BullMQ, background workers, Docker/Kubernetes, observability, and future horizontal scaling.

---

## Table of Contents

1. [Purpose](#purpose)
2. [Performance Philosophy](#performance-philosophy)
3. [Core Principles](#core-principles)
4. [Performance Targets](#performance-targets)
5. [Latency Model](#latency-model)
6. [Request Lifecycle](#request-lifecycle)
7. [Fastify Performance](#fastify-performance)
8. [Route Design](#route-design)
9. [Validation Performance](#validation-performance)
10. [Serialization](#serialization)
11. [Response Size](#response-size)
12. [Compression](#compression)
13. [Caching](#caching)
14. [HTTP Caching](#http-caching)
15. [Application Caching](#application-caching)
16. [Redis Caching](#redis-caching)
17. [Cache Invalidation](#cache-invalidation)
18. [Cache Stampede](#cache-stampede)
19. [Database Performance](#database-performance)
20. [Prisma Performance](#prisma-performance)
21. [Query Design](#query-design)
22. [Indexes](#indexes)
23. [N+1 Queries](#n1-queries)
24. [Pagination](#pagination)
25. [Cursor Pagination](#cursor-pagination)
26. [Filtering](#filtering)
27. [Search](#search)
28. [Sorting](#sorting)
29. [Selecting Fields](#selecting-fields)
30. [Joins and Relations](#joins-and-relations)
31. [Transactions](#transactions)
32. [Connection Pools](#connection-pools)
33. [PostgreSQL Tuning](#postgresql-tuning)
34. [Large Tables](#large-tables)
35. [Bulk Operations](#bulk-operations)
36. [Database Migrations](#database-migrations)
37. [Background Jobs](#background-jobs)
38. [Queue Performance](#queue-performance)
39. [Worker Concurrency](#worker-concurrency)
40. [Backpressure](#backpressure)
41. [External APIs](#external-apis)
42. [Timeout Budgets](#timeout-budgets)
43. [Retries](#retries)
44. [Rate Limits](#rate-limits)
45. [File Processing](#file-processing)
46. [Report Generation](#report-generation)
47. [Admin Frontend Performance](#admin-frontend-performance)
48. [React Rendering](#react-rendering)
49. [TanStack Query](#tanstack-query)
50. [Bundle Size](#bundle-size)
51. [Code Splitting](#code-splitting)
52. [Tables and Large Datasets](#tables-and-large-datasets)
53. [Forms](#forms)
54. [Images and Assets](#images-and-assets)
55. [Network Performance](#network-performance)
56. [API Client](#api-client)
57. [Observability](#observability)
58. [Performance Metrics](#performance-metrics)
59. [Latency Percentiles](#latency-percentiles)
60. [SLOs](#slos)
61. [Profiling](#profiling)
62. [Node.js Profiling](#nodejs-profiling)
63. [Database Profiling](#database-profiling)
64. [Load Testing](#load-testing)
65. [Stress Testing](#stress-testing)
66. [Spike Testing](#spike-testing)
67. [Soak Testing](#soak-testing)
68. [Capacity Planning](#capacity-planning)
69. [Scaling](#scaling)
70. [Horizontal Scaling](#horizontal-scaling)
71. [Vertical Scaling](#vertical-scaling)
72. [Autoscaling](#autoscaling)
73. [Kubernetes](#kubernetes)
74. [Docker](#docker)
75. [Memory](#memory)
76. [CPU](#cpu)
77. [Garbage Collection](#garbage-collection)
78. [Event Loop](#event-loop)
79. [Blocking Operations](#blocking-operations)
80. [Security and Performance](#security-and-performance)
81. [Performance Regression Prevention](#performance-regression-prevention)
82. [Testing in CI](#testing-in-ci)
83. [Performance Budgets](#performance-budgets)
84. [Troubleshooting](#troubleshooting)
85. [Common Anti-Patterns](#common-anti-patterns)
86. [Implementation Roadmap](#implementation-roadmap)
87. [Definition of Done](#definition-of-done)
88. [Performance Checklist](#performance-checklist)
89. [Golden Rules](#golden-rules)

---

# Purpose

Fastify-MasterApp should remain responsive as:

```text
users ↑
requests ↑
database rows ↑
background jobs ↑
Admin usage ↑
integrations ↑
```

Performance is not simply:

```text
"make requests fast"
```

It is the ability to maintain acceptable:

- latency
- throughput
- resource utilization
- reliability
- database health
- queue processing time

under realistic workloads.

---

# Performance Philosophy

The project should follow:

```text
Measure
  ↓
Find bottleneck
  ↓
Optimize bottleneck
  ↓
Measure again
```

Do not optimize based on assumptions.

A slower database query is usually more important than a tiny JavaScript micro-optimization.

---

# Core Principles

## 1. Measure before optimizing

Use:

- request latency
- query duration
- CPU
- memory
- queue latency
- browser performance
- external dependency latency

---

## 2. Optimize the bottleneck

Do not optimize code that consumes 1% of total request time while ignoring the 80% database query.

---

## 3. Keep the request path short

Prefer:

```text
HTTP
 ↓
validation
 ↓
authorization
 ↓
service
 ↓
database
 ↓
response
```

Move slow independent work to background jobs.

---

## 4. Protect dependencies

Fast API code can still overload:

```text
PostgreSQL
Redis
external APIs
```

Performance includes protecting the entire system.

---

## 5. Bounded concurrency beats unlimited concurrency

More workers do not automatically mean more throughput.

---

# Performance Targets

Targets should be measured against real workload requirements.

A reasonable starting point for a normal authenticated API:

```text
p50:
< 100 ms

p95:
< 300 ms

p99:
< 800 ms
```

These are engineering targets, not universal guarantees.

Slow operations such as:

```text
exports
reports
imports
```

should be asynchronous instead of forcing interactive latency targets.

---

# Latency Model

A request can be decomposed into:

```text
Total latency
=
network
+
Fastify overhead
+
validation
+
authentication
+
authorization
+
service logic
+
database
+
external APIs
+
serialization
```

Measure these components before deciding what to optimize.

---

# Request Lifecycle

Example:

```text
Client
  ↓
Load Balancer
  ↓
Fastify
  ↓
Auth
  ↓
RBAC
  ↓
Service
  ↓
Prisma
  ↓
PostgreSQL
  ↓
Serialization
  ↓
Response
```

Each boundary should have measurable latency where useful.

---

# Fastify Performance

Fastify is designed for high-throughput Node.js HTTP workloads.

Performance practices:

- use schema-based validation
- use response schemas
- avoid unnecessary middleware
- avoid synchronous/blocking operations
- keep hooks lightweight
- reuse clients/connections
- avoid excessive serialization
- use structured logging without huge payloads

---

# Route Design

Routes should remain thin.

Good:

```text
route
  ↓
service
```

Bad:

```text
route
  ↓
500 lines of database/business logic
```

Thin routes improve:

- maintainability
- testability
- performance reasoning

---

# Validation Performance

TypeBox schemas should validate at the HTTP boundary.

Avoid repeated validation of the same trusted object.

For example:

```text
HTTP body
  ↓
TypeBox validation
  ↓
service
```

Do not repeatedly re-parse the same payload unless crossing a trust boundary.

---

# Serialization

Use explicit response schemas where practical.

Benefits:

- predictable output
- reduced accidental fields
- serialization optimization
- security

Never serialize entire Prisma models by default.

---

# Response Size

Large responses are expensive.

Avoid:

```text
GET /users
```

returning:

```text
50,000 users
```

Use:

```text
pagination
filtering
field selection
```

where appropriate.

---

# Compression

Compression can reduce network transfer size but consumes CPU.

Use it selectively based on response size and workload.

Do not compress tiny responses unnecessarily.

Static Admin assets should generally be served with appropriate compression and caching.

---

# Caching

Caching is useful when:

```text
data is expensive to compute
+
data can tolerate bounded staleness
```

Examples:

- permissions
- reference data
- dashboard summaries
- expensive aggregate results

Do not cache everything.

---

# HTTP Caching

Use appropriate:

```text
Cache-Control
ETag
Last-Modified
```

where useful.

Never cache personalized sensitive responses publicly.

---

# Application Caching

Application cache should have:

```text
key
value
TTL
invalidation strategy
```

Example:

```text
permissions:user_123
TTL: 60 seconds
```

Do not use infinite TTL unless the data is truly immutable.

---

# Redis Caching

Redis may be used for:

```text
cache
rate limiting
queues
temporary coordination
```

Keep cache data separate conceptually from durable business data.

---

# Cache Invalidation

The difficult part of caching is invalidation.

Example:

```text
role changed
  ↓
permissions cache must invalidate
```

Define invalidation ownership explicitly.

---

# Cache Stampede

If a popular cache key expires:

```text
1,000 requests
     ↓
all miss cache
     ↓
1,000 database queries
```

Mitigations:

- jittered TTLs
- single-flight loading
- stale-while-revalidate
- bounded concurrency
- prewarming

Use these only where the workload warrants them.

---

# Database Performance

For most CRUD applications, PostgreSQL is a major performance boundary.

Focus on:

- indexes
- query shape
- row counts
- connection pools
- transactions
- N+1 behavior
- pagination
- selectivity

---

# Prisma Performance

Prisma should be used intentionally.

Prefer:

```ts
select: {
  id: true,
  email: true,
  displayName: true,
}
```

over retrieving a huge model when only a few fields are needed.

---

# Query Design

Bad:

```text
load all records
filter in JavaScript
```

Good:

```text
filter in PostgreSQL
```

The database is optimized for set-based operations.

---

# Indexes

Indexes should support actual queries.

Common examples:

```text
users.email
users.createdAt
users.status
audit_logs.createdAt
audit_logs.actorId + createdAt
```

Do not create indexes for every column.

Indexes consume:

- disk
- memory
- write time

---

# Composite Indexes

If a query commonly uses:

```text
WHERE tenantId = ?
ORDER BY createdAt DESC
```

a composite index may be appropriate:

```text
tenantId + createdAt
```

Design indexes from query patterns.

---

# N+1 Queries

Bad:

```text
query 100 users

for each user:
  query roles
```

Result:

```text
101 queries
```

Prefer:

```text
1–2 set-based queries
```

or carefully designed relation loading.

---

# N+1 Detection

Monitor:

```text
query count/request
```

during integration/performance testing.

A request that suddenly changes:

```text
5 queries → 505 queries
```

should be treated as a regression.

---

# Pagination

Never return unbounded collections.

Use:

```text
limit
cursor
```

or documented page-based pagination.

Enforce a server-side maximum.

Example:

```text
default = 50
maximum = 100
```

---

# Cursor Pagination

Cursor pagination is preferred for large or frequently changing datasets.

Conceptually:

```text
GET /users?limit=50&cursor=abc
```

Benefits:

- stable traversal
- better performance at large offsets
- less work for PostgreSQL

---

# Offset Pagination

Offset pagination can be acceptable for:

- small tables
- simple Admin views
- low-volume datasets

But:

```text
OFFSET 500000
```

can become expensive.

Use cursor pagination when scale requires it.

---

# Filtering

Push filters into SQL.

Good:

```text
WHERE status = 'ACTIVE'
```

Bad:

```text
SELECT all rows
↓
filter in Node.js
```

---

# Search

Simple search can use indexed PostgreSQL patterns.

For larger search requirements, consider dedicated search infrastructure only when needed.

Do not introduce Elasticsearch/OpenSearch simply because search exists.

---

# Sorting

Sort in the database.

Whitelist sortable fields.

Example:

```text
createdAt
updatedAt
email
```

Do not interpolate arbitrary SQL column names.

---

# Selecting Fields

Only retrieve what is needed.

Example:

```ts
select: {
  id: true,
  email: true,
}
```

This reduces:

- DB transfer
- memory
- serialization
- response size

---

# Joins and Relations

Be deliberate with relation loading.

Do not return:

```text
user
  → roles
  → permissions
  → sessions
  → auditLogs
  → todos
  → ...
```

for a normal user detail endpoint unless required.

Create focused representations.

---

# Transactions

Keep transactions short.

Bad:

```text
BEGIN
  call external API
  wait 10 seconds
  update database
COMMIT
```

Better:

```text
call external API
then
short database transaction
```

unless atomicity specifically requires another design.

---

# Connection Pools

PostgreSQL connections are finite.

Total potential connections:

```text
API replicas
+
worker replicas
+
admin/maintenance clients
```

must fit the database capacity.

Example:

```text
10 API replicas × 10 connections
+
5 workers × 5 connections
=
125 potential connections
```

This must be planned rather than guessed.

---

# Connection Pool Exhaustion

Symptoms:

- requests waiting for connections
- increased latency
- timeouts
- Prisma errors
- worker failures

Mitigations:

- lower concurrency
- reduce pool sizes
- shorten transactions
- optimize slow queries
- scale PostgreSQL appropriately
- use connection pooling infrastructure when justified

---

# PostgreSQL Tuning

Important areas:

```text
CPU
memory
shared buffers
work memory
connection count
autovacuum
checkpoint behavior
index health
query plans
storage IOPS
```

Do not tune parameters blindly.

Use database metrics and query plans.

---

# EXPLAIN ANALYZE

For slow queries, inspect:

```sql
EXPLAIN ANALYZE ...
```

Look for:

- sequential scans on large tables
- poor row estimates
- expensive sorts
- nested loops over large datasets
- missing indexes
- excessive rows removed by filters

Never run destructive or production-risky diagnostics without appropriate controls.

---

# Large Tables

As tables grow:

```text
10k
100k
1M
10M
100M
```

query behavior can change significantly.

Plan for:

- indexes
- archival
- partitioning where justified
- efficient pagination
- retention
- batch operations

---

# Audit Logs and Large Tables

Audit logs can grow quickly.

Use:

```text
createdAt indexes
actor indexes
target indexes
retention
archiving
```

Avoid unbounded metadata-heavy queries.

See `AUDIT_LOGGING.md`.

---

# Bulk Operations

Use bulk database operations where safe.

Bad:

```text
for each user:
  UPDATE
```

Better:

```text
UPDATE ... WHERE ...
```

or controlled batch updates.

Bulk operations must still respect:

- authorization
- audit requirements
- transaction size
- lock duration

---

# Bulk Operation Limits

Do not allow Admin users to trigger unlimited work in a single request.

Prefer:

```text
select records
  ↓
create operation
  ↓
queue background job
```

for large operations.

---

# Database Migrations

Large schema migrations can cause:

- locks
- downtime
- CPU spikes
- replication lag

Use expand-and-contract migrations for important production changes.

---

# Background Jobs

Move long work away from HTTP.

Examples:

```text
reports
imports
exports
emails
webhooks
large synchronization
```

See `BACKGROUND_JOBS.md`.

---

# Queue Performance

Measure:

```text
queue depth
queue wait time
processing duration
retry rate
failure rate
oldest job age
```

Queue depth alone is insufficient.

---

# Worker Concurrency

Example:

```text
email:
10

reports:
2

imports:
2
```

Tune from measurements.

Too much concurrency can overload:

```text
database
external API
CPU
memory
```

---

# Backpressure

If:

```text
queue = 100,000 jobs
```

do not necessarily scale workers to:

```text
500
```

Protect downstream dependencies.

Backpressure may be more important than raw throughput.

---

# External APIs

External calls often dominate latency.

Use:

- connection reuse
- keep-alive where supported
- bounded timeouts
- controlled retries
- concurrency limits
- provider-aware rate limits

---

# Timeout Budgets

Example:

```text
API request:
3 seconds

database:
1 second

external API:
1.5 seconds
```

Leave enough time for application work and response serialization.

---

# Retries

Retries increase total latency and load.

Use:

```text
small retry count
+
exponential backoff
+
jitter
```

Only for transient failures.

---

# Rate Limits

Respect external provider limits.

A provider's:

```text
100 req/min
```

means the worker system should not collectively exceed that limit.

Coordinate across worker replicas.

---

# File Processing

Large files should be streamed where possible.

Avoid:

```text
load 2 GB file into memory
```

Prefer:

```text
stream
→
process chunks
→
write output
```

---

# Report Generation

Reports should usually be asynchronous.

Use:

```text
request
→
job
→
generate
→
store
→
download
```

Do not block the HTTP request for expensive report generation.

---

# Admin Frontend Performance

The Admin frontend should remain responsive even with large datasets.

Focus on:

- route-level code splitting
- query caching
- table pagination
- debounced search
- virtualization when necessary
- avoiding unnecessary renders

---

# React Rendering

Avoid unnecessary global state updates.

For example:

```text
typing in one form field
```

should not re-render:

```text
entire Admin application
```

Use appropriate component boundaries.

---

# TanStack Query

Use query caching deliberately.

Configure:

```text
staleTime
gcTime
retry
refetch behavior
```

based on data characteristics.

Avoid aggressive refetching for stable Admin data.

---

# Query Invalidation

After a mutation:

```text
update user
  ↓
invalidate users query
```

Do not invalidate every query in the application.

Broad invalidation creates unnecessary network and rendering work.

---

# Bundle Size

Monitor Admin bundle size.

Large dependencies can slow:

```text
download
parse
compile
execute
```

Use bundle analysis to identify large dependencies.

---

# Code Splitting

Admin routes can be loaded lazily.

Example:

```text
/dashboard
/users
/roles
/audit
/settings
```

Do not require the browser to download every Admin page before displaying the dashboard.

---

# Tables and Large Datasets

Use:

```text
server-side pagination
server-side filtering
server-side sorting
```

Avoid rendering thousands of rows simultaneously.

---

# Virtualization

For genuinely large visible datasets, use virtualization.

Example:

```text
10,000 records
```

but only render:

```text
30–100 visible rows
```

Do not add virtualization to every small table automatically.

---

# Search Debouncing

For search boxes:

```text
R
Ro
Roh
Roha
Rohit
```

do not send five immediate API requests.

Use a small debounce interval.

---

# Forms

Avoid expensive validation on every keystroke when unnecessary.

Prefer:

```text
blur
submit
field-level validation
```

for complex forms.

---

# Images and Assets

Optimize:

- image dimensions
- formats
- compression
- lazy loading
- caching

Admin applications usually do not need huge image assets.

---

# Network Performance

Reduce:

- request count
- response size
- duplicate requests
- unnecessary polling

Prefer:

```text
one well-designed endpoint
```

over:

```text
ten tiny endpoints
```

when the UI genuinely needs all data together.

Do not create mega-endpoints that return the entire application state.

---

# API Client

Centralize API behavior:

```text
base URL
auth
refresh
timeouts
error parsing
headers
```

This avoids duplicated network logic and makes performance behavior consistent.

---

# Request Deduplication

If multiple components need the same query:

```text
useUsers()
```

TanStack Query can share the result.

Avoid:

```text
component A → /users
component B → /users
component C → /users
```

as three independent requests.

---

# Polling

Use polling only when necessary.

Example:

```text
export status
```

may poll while:

```text
PROCESSING
```

and stop when:

```text
COMPLETED
```

Do not poll indefinitely.

---

# Observability

Performance optimization requires observability.

Track:

```text
request latency
query latency
external dependency latency
queue latency
worker duration
browser load time
```

---

# Performance Metrics

Recommended API metrics:

```text
http_request_duration_seconds
http_requests_total
http_response_size_bytes
```

Database:

```text
db_query_duration_seconds
db_query_errors_total
db_pool_usage
```

Queue:

```text
job_duration_seconds
job_queue_wait_seconds
queue_depth
```

---

# Latency Percentiles

Do not rely only on averages.

Use:

```text
p50
p95
p99
```

Example:

```text
Average: 120 ms
p95:     450 ms
p99:     2.4 s
```

The average hides the slow tail.

---

# SLOs

Example API SLO:

```text
99% of normal API requests
complete under 500 ms
```

Define SLOs per endpoint class where useful.

Do not force expensive operations into the same SLO as simple CRUD reads.

---

# Endpoint Classes

A useful classification:

```text
Interactive read
Interactive mutation
Bulk operation
Async operation
Health endpoint
```

Each can have different performance expectations.

---

# Profiling

Profiling should answer:

> Where is CPU time or latency actually being spent?

Tools/techniques include:

- Node.js CPU profiles
- heap snapshots
- database query plans
- Redis metrics
- browser performance tools
- load testing

---

# Node.js Profiling

Watch for:

- CPU-heavy loops
- JSON serialization
- large object allocation
- synchronous filesystem operations
- cryptographic operations
- compression
- regular expressions

---

# Event Loop

Node.js depends on an event loop.

Blocking it harms every request handled by that process.

Avoid:

```ts
fs.readFileSync(...)
```

on request paths.

Avoid expensive synchronous computations.

---

# Blocking Operations

Dangerous request-path operations include:

```text
large CSV parsing
large JSON transformation
PDF generation
image processing
compression of huge payloads
synchronous filesystem operations
CPU-heavy encryption
```

Move them to workers where appropriate.

---

# Memory

Monitor:

```text
heap used
heap total
RSS
external memory
GC pauses
```

Memory leaks often appear as:

```text
memory rises continuously
```

rather than:

```text
short spike
then recovery
```

---

# Garbage Collection

Large allocations increase GC pressure.

Avoid repeatedly creating huge objects.

Examples:

```text
load 500,000 rows
map entire result
JSON.stringify entire result
```

Prefer streaming/batching.

---

# CPU

CPU saturation can increase latency dramatically.

If:

```text
CPU = 100%
```

the API may become slow even when the database is healthy.

Separate CPU-heavy work into workers.

---

# Memory Limits

Containers should have explicit memory limits.

A memory limit without application monitoring can result in:

```text
OOM kill
```

Use:

```text
memory limit
+
headroom
+
alerts
```

---

# Security and Performance

Security controls have performance cost.

Examples:

```text
password hashing
JWT verification
rate limiting
validation
Helmet
CORS
audit logging
```

Do not remove security controls merely because they consume CPU.

Optimize their implementation and measure the actual cost.

---

# Password Hashing

Password hashing is intentionally expensive.

Do not weaken password hashing parameters just to improve benchmark results.

Use asynchronous APIs where possible so hashing does not block the event loop.

---

# Performance Regression Prevention

Every important optimization should include a before/after measurement.

Example:

```text
Before:
p95 = 800 ms

After:
p95 = 280 ms
```

Record meaningful improvements in PR descriptions when useful.

---

# Testing in CI

Not every CI run needs a massive load test.

Useful layers:

```text
PR:
small smoke benchmark

main:
representative performance tests

scheduled:
full load test
```

Keep CI duration practical.

---

# Performance Budgets

Set budgets for important paths.

Example:

```text
API:
p95 < 300 ms

Admin initial JS:
< agreed size

Database:
critical query < 100 ms

Queue:
oldest normal job < agreed threshold
```

Budgets should be based on real requirements.

---

# Load Testing

Load tests should represent realistic traffic.

Example:

```text
60% reads
20% writes
10% searches
5% Admin operations
5% authentication
```

The exact distribution should come from expected usage.

---

# Load Test Environment

Do not use a tiny local database and assume production behavior.

Prefer a staging environment that approximates:

- CPU
- memory
- PostgreSQL
- Redis
- replicas
- network
- external dependencies

---

# Stress Testing

Stress testing finds system limits.

Increase traffic until:

```text
latency degrades
errors increase
CPU saturates
DB saturates
queue grows
```

Record the breaking point.

---

# Spike Testing

Simulate sudden traffic:

```text
100 req/s
   ↓
2,000 req/s
```

Observe:

- autoscaling
- queue behavior
- database load
- error rates
- recovery time

---

# Soak Testing

Run realistic traffic for a long period.

Useful for detecting:

- memory leaks
- connection leaks
- queue accumulation
- gradual latency degradation
- log growth

---

# Capacity Planning

Track:

```text
requests/sec
active users
DB rows
DB storage
queue jobs/minute
worker utilization
CPU
memory
```

Estimate future capacity.

---

# Scaling

Scaling options:

```text
vertical
horizontal
database optimization
caching
background processing
```

Apply the least complex solution that solves the actual bottleneck.

---

# Horizontal Scaling

The API should be stateless.

Avoid storing critical session state in process memory.

Use shared infrastructure for:

```text
sessions
rate limits
queues
cache
```

where required.

---

# Stateless API

This allows:

```text
API pod 1
API pod 2
API pod 3
```

to handle requests interchangeably.

Do not depend on:

```text
in-memory user session
```

for correctness.

---

# Vertical Scaling

Increasing:

```text
CPU
RAM
database resources
```

can be the simplest first scaling step.

Do not introduce distributed architecture before measuring the need.

---

# Autoscaling

API autoscaling can consider:

```text
CPU
memory
request rate
latency
```

Worker autoscaling should additionally consider:

```text
queue depth
oldest job age
```

---

# Kubernetes

For Kubernetes deployments, configure:

```text
requests
limits
readiness
liveness
HPA
PDB
```

carefully.

Bad resource settings can cause:

```text
CPU throttling
OOM kills
unnecessary scaling
```

---

# CPU Throttling

A container can appear:

```text
CPU usage = moderate
```

while still being throttled by a restrictive limit.

Investigate actual CPU throttling metrics before changing application code.

---

# Docker

Use production builds:

```text
multi-stage build
minimal runtime image
production dependencies
```

Smaller images improve:

- deployment speed
- startup time
- security surface

They do not automatically improve runtime request latency.

---

# Startup Performance

Fast startup matters for:

- autoscaling
- deployments
- recovery

Avoid expensive startup work such as:

```text
loading entire database
building huge caches synchronously
```

unless necessary.

---

# Warmup

If expensive initialization is required:

```text
readiness = false
```

until the process is ready.

Do not send traffic to an instance that is technically alive but not prepared.

---

# Graceful Shutdown

Graceful shutdown prevents interrupted requests/jobs.

On shutdown:

```text
stop accepting new work
finish active requests/jobs
close resources
exit
```

See `DEPLOYMENT.md`.

---

# Performance and Errors

Performance failures often become reliability failures.

Example:

```text
slow DB
  ↓
connection pool occupied
  ↓
requests queue
  ↓
timeouts
  ↓
retries
  ↓
more load
  ↓
system collapse
```

This is why performance and reliability must be designed together.

---

# Performance Troubleshooting

## API suddenly slow

Check:

1. p95/p99 latency
2. CPU
3. memory
4. database latency
5. connection pool
6. external APIs
7. Redis
8. queue pressure
9. recent deployment

---

## Database suddenly slow

Check:

1. slow queries
2. query plans
3. missing indexes
4. lock contention
5. connection count
6. CPU
7. I/O
8. table growth
9. autovacuum

---

## Admin suddenly slow

Check:

1. browser CPU
2. bundle size
3. network requests
4. duplicate queries
5. React rendering
6. table size
7. query cache configuration

---

## Queue growing

Check:

1. worker replicas
2. worker concurrency
3. downstream rate limits
4. job duration
5. retry storms
6. database capacity

---

## Memory continuously increasing

Check:

1. heap snapshots
2. global caches
3. unbounded arrays
4. event listeners
5. large request bodies
6. file buffering
7. worker payloads
8. connection leaks

---

# Performance Investigation Workflow

Use:

```text
1. Confirm regression
2. Identify affected endpoint/workload
3. Check p50/p95/p99
4. Compare resource metrics
5. Identify slow dependency
6. Profile if needed
7. Form hypothesis
8. Change one major variable
9. Benchmark
10. Roll out gradually
11. Monitor
```

---

# Common Anti-Patterns

## 1. Premature Optimization

Do not optimize imaginary bottlenecks.

---

## 2. Returning Huge Collections

Always paginate large datasets.

---

## 3. N+1 Queries

Avoid query-per-record patterns.

---

## 4. Unbounded Concurrency

Protect downstream dependencies.

---

## 5. Long Transactions

Keep transactions short.

---

## 6. Blocking the Event Loop

Move CPU-heavy work to workers.

---

## 7. Loading Huge Files Into Memory

Stream or batch.

---

## 8. Cache Everything

Caching creates invalidation complexity.

---

## 9. No Cache Invalidation

Stale data can become a correctness problem.

---

## 10. Retry Storms

Retries can amplify outages.

---

## 11. Scaling Only on CPU

Queue systems and external APIs can bottleneck first.

---

## 12. Ignoring p99

Average latency hides tail behavior.

---

## 13. Unlimited Admin Queries

Admin users can accidentally become the biggest source of load.

---

## 14. Fetching Entire Prisma Models

Select only required fields.

---

## 15. Client-Side Filtering of Large Datasets

Push filtering to PostgreSQL.

---

## 16. Polling Forever

Stop polling when the operation reaches a terminal state.

---

## 17. Adding Redis Before Measuring

Redis is useful, but not free.

---

## 18. Adding Microservices for Performance

A network boundary does not automatically make software faster.

---

# Implementation Roadmap

## Phase 1 — Baseline

Measure:

```text
API p50/p95/p99
database latency
CPU
memory
Admin load time
```

---

# Phase 2 — Database Optimization

Focus on:

- indexes
- query plans
- N+1 queries
- pagination
- field selection
- connection pools

---

# Phase 3 — API Optimization

Implement:

- response schemas
- bounded payloads
- efficient serialization
- correct timeouts
- request metrics

---

# Phase 4 — Admin Optimization

Implement:

- code splitting
- query caching
- debounced search
- server-side pagination
- efficient tables

---

# Phase 5 — Background Jobs

Move expensive workloads to workers:

```text
reports
exports
imports
emails
```

---

# Phase 6 — Caching

Add Redis/application caching only for measured hot paths.

---

# Phase 7 — Load Testing

Create realistic:

```text
load
stress
spike
soak
```

test suites.

---

# Phase 8 — Scaling

Introduce:

```text
horizontal API scaling
worker scaling
autoscaling
```

when measured demand requires it.

---

# Phase 9 — Advanced Optimization

Potential future work:

- read replicas
- advanced caching
- partitioning
- specialized search
- CDN optimization
- database connection pooling infrastructure
- distributed tracing
- advanced workload isolation

Only introduce these when justified.

---

# Recommended Performance Dashboard

```text
API
├── Requests/sec
├── p50 latency
├── p95 latency
├── p99 latency
├── 4xx rate
└── 5xx rate

Database
├── Query latency
├── Connections
├── CPU
├── IOPS
└── Slow queries

Redis
├── Memory
├── Commands/sec
├── Latency
└── Queue depth

Workers
├── Active jobs
├── Waiting jobs
├── Job duration
├── Retry rate
└── Oldest job age

Admin
├── Initial load
├── JS bundle size
├── API latency
└── Error rate
```

---

# Performance Review Checklist

## API

- [ ] Routes are thin.
- [ ] Validation is efficient.
- [ ] Response schemas are defined.
- [ ] Responses are bounded.
- [ ] Pagination exists.
- [ ] Serialization is measured.
- [ ] Blocking operations are absent.
- [ ] Timeouts are defined.

## Database

- [ ] Queries are indexed.
- [ ] N+1 is avoided.
- [ ] Field selection is intentional.
- [ ] Pagination is efficient.
- [ ] Transactions are short.
- [ ] Connection pools are bounded.
- [ ] Slow queries are observable.

## Redis

- [ ] Cache has TTL.
- [ ] Invalidation is defined.
- [ ] Queue load is observable.
- [ ] Memory limits are understood.

## Workers

- [ ] Concurrency is bounded.
- [ ] Retry policy exists.
- [ ] Backpressure exists.
- [ ] Queue lag is monitored.
- [ ] CPU-heavy jobs are isolated.

## Admin

- [ ] Routes are code-split.
- [ ] Queries are cached.
- [ ] Search is debounced.
- [ ] Tables are paginated.
- [ ] Large lists are virtualized where needed.
- [ ] Duplicate requests are avoided.

## Infrastructure

- [ ] CPU limits are appropriate.
- [ ] Memory limits are appropriate.
- [ ] Readiness is configured.
- [ ] Autoscaling signals are meaningful.
- [ ] Database capacity is known.
- [ ] Redis capacity is known.

---

# Definition of Done

A performance-sensitive feature is production-ready when:

- [ ] Expected workload is documented.
- [ ] Performance target is defined.
- [ ] Request latency is measurable.
- [ ] Database behavior is understood.
- [ ] N+1 behavior has been checked.
- [ ] Response size is bounded.
- [ ] Pagination exists where required.
- [ ] External dependencies have timeouts.
- [ ] Retry behavior is safe.
- [ ] Background work is asynchronous where appropriate.
- [ ] Concurrency is bounded.
- [ ] Memory behavior is understood.
- [ ] CPU behavior is understood.
- [ ] Metrics exist.
- [ ] Logs/traces support diagnosis.
- [ ] Load testing covers important paths.
- [ ] Regression tests exist where useful.
- [ ] Scaling behavior is understood.
- [ ] Failure behavior is understood.
- [ ] Security controls have not been weakened for performance.
- [ ] Rollout and rollback are documented.

---

# Performance Checklist

Before merging a performance-sensitive change:

### Measurement

- [ ] What was slow before?
- [ ] What metric proves the improvement?
- [ ] Is the improvement measured under realistic load?

### API

- [ ] Response size checked.
- [ ] Query count checked.
- [ ] Serialization checked.
- [ ] Timeout budget checked.

### Database

- [ ] Query plan checked.
- [ ] Index reviewed.
- [ ] N+1 checked.
- [ ] Connection impact checked.

### Workers

- [ ] Concurrency checked.
- [ ] Queue impact checked.
- [ ] Retry impact checked.

### Admin

- [ ] Render behavior checked.
- [ ] Network request count checked.
- [ ] Bundle impact checked.

### Operations

- [ ] Metrics updated.
- [ ] Dashboard updated if necessary.
- [ ] Alerts reviewed.
- [ ] Rollback available.

---

# Golden Rules

## Rule 1

**Measure before optimizing.**

## Rule 2

**Optimize the bottleneck, not the code that looks interesting.**

## Rule 3

**Protect PostgreSQL from unnecessary work.**

## Rule 4

**Never return unbounded collections.**

## Rule 5

**Avoid N+1 queries.**

## Rule 6

**Keep transactions short.**

## Rule 7

**Do not block the Node.js event loop.**

## Rule 8

**Use background jobs for slow independent work.**

## Rule 9

**Bound concurrency everywhere.**

## Rule 10

**Retries must respect dependency capacity.**

## Rule 11

**Use p95/p99, not just averages.**

## Rule 12

**Cache only when there is a measured benefit.**

## Rule 13

**Every cache needs an invalidation strategy.**

## Rule 14

**Scale from evidence, not fashion.**

## Rule 15

**Keep the API stateless so it can scale horizontally.**

## Rule 16

**Performance optimizations must not weaken security.**

## Rule 17

**Admin operations must be bounded because administrators can generate very large workloads.**

## Rule 18

**Queue depth is not enough; monitor queue age and processing time.**

## Rule 19

**Do not introduce microservices merely to solve an unmeasured performance problem.**

## Rule 20

**A performance improvement is incomplete until it is measured in production-like conditions.**

---

# Final Performance Architecture

Fastify-MasterApp should evolve toward:

```text
                         Clients
                            |
                            v
                     Load Balancer
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
          API Pod        API Pod        API Pod
             |              |              |
             +--------------+--------------+
                            |
                  +---------+---------+
                  |                   |
                  v                   v
             PostgreSQL            Redis
                  |                   |
                  |             +-----+-----+
                  |             |           |
                  |             v           v
                  |          Queues      Cache
                  |             |
                  |             v
                  |          Workers
                  |             |
                  +-------------+
                            |
                       External APIs
```

The performance strategy is:

```text
Efficient API
    ↓
Efficient queries
    ↓
Bounded payloads
    ↓
Caching where justified
    ↓
Async processing
    ↓
Bounded concurrency
    ↓
Observability
    ↓
Load testing
    ↓
Horizontal scaling
```

The target is not the smallest latency number possible.

The target is a system that remains:

- fast enough
- predictable
- resource-efficient
- resilient under load
- observable
- secure
- horizontally scalable

without introducing unnecessary architectural complexity.

Fastify-MasterApp should therefore follow the principle:

> **Measure first, optimize the bottleneck, protect dependencies, and scale only when evidence requires it.**
