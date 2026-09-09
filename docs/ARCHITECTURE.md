# 🏗️ Architecture Guide — Gym Platform API

## Golden Orchestrator Pattern

The Golden Orchestrator pattern structures complex business logic as a pipeline of single-responsibility operations, providing automatic performance tracking, error handling, and testability. In the Gym Platform API it backs multi-step domain flows such as creating a member, provisioning a tenant, or logging a workout session.

> The code below uses a generic `Order` flow purely to illustrate the pattern's mechanics (validate → process → notify). In this codebase the same shape applies to gym-domain flows — e.g. a `CreateMemberOrchestrator` with `validate → createMember → notify`.

---

## Core Concepts

### 1. Orchestrator

Defines and executes a pipeline of operations.

```typescript
export class CreateOrderOrchestrator extends BaseOrchestrator<
  OrderPipelineContext,
  Order,
  CreateOrderInput
> {
  protected getPipeline(): PipelineStage<OrderPipelineContext>[] {
    return [
      { name: "validate", operation: validate, critical: true },
      { name: "process", operation: process, critical: true },
      { name: "notify", operation: notify, critical: false },
    ];
  }
}
```

### 2. Operations

Single-responsibility async functions that transform context. Each operation does one thing - it may perform I/O (database writes, API calls), but owns exactly one concern.

```typescript
export async function createOrder(
  ctx: OrderPipelineContext,
): Promise<OrderPipelineContext> {
  // Skip if validation failed
  if (ctx.errors.length > 0) return ctx;

  // Database write - side effects are allowed
  const order = await prisma.order.create({
    data: {
      customerId: ctx.input.customerId,
      items: ctx.input.items,
      status: "PENDING",
    },
  });

  ctx.order = order;
  return ctx; // Always return context
}
```

### 3. Context

Flows through the pipeline, accumulating results.

```typescript
interface OrderPipelineContext extends OperationContext {
  input: CreateOrderInput;
  order?: Order;
  validationErrors?: string[];
}
```

---

## Request Flow

```
Client Request
    ↓
Route (validates, authenticates)
    ↓
Service (facade pattern)
    ↓
Orchestrator (runs pipeline)
    ↓
Operations (single-responsibility functions)
    ├─ Operation 1: validate (pure)
    ├─ Operation 2: createOrder (DB write)
    └─ Operation 3: notify (external API)
    ↓
Result (with metrics)
    ↓
Response to Client
```

---

## When to Use Each Pattern

### ✅ Use Golden Orchestrator When:

- Multi-step workflows
- Multiple database operations
- External API calls
- Need performance tracking per step
- Conditional logic between steps
- Non-critical operations (notifications)

**Example:**

```typescript
// Order processing: validate → charge → fulfill → notify
POST /orders → OrderService → CreateOrderOrchestrator
```

### ✅ Use Direct Prisma Access When:

- Single database query
- Simple CRUD operations
- No business logic
- Speed is critical

**Example:**

```typescript
// Simple lookup
GET /users/:id → prisma.user.findUnique()
```

---

## Complete Example

### Step 1: Define Types

```typescript
// src/services/order/types/index.ts
import type { OperationContext } from "@core/orchestration";

export interface CreateOrderInput {
  customerId: string;
  items: OrderItem[];
  total: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  createdAt: Date;
}

export interface OrderPipelineContext extends OperationContext {
  input: CreateOrderInput;
  order?: Order;
  validationErrors?: string[];
}
```

### Step 2: Create Operations

```typescript
// src/services/order/operations/validate.ts
export async function validate(ctx: OrderPipelineContext) {
  const errors: string[] = [];

  if (!ctx.input.customerId) {
    errors.push("Customer ID required");
  }

  if (ctx.input.items.length === 0) {
    errors.push("Order must have items");
  }

  if (errors.length > 0) {
    ctx.validationErrors = errors;
    ctx.errors.push(new Error(`Validation: ${errors.join(", ")}`));
  }

  return ctx;
}

// src/services/order/operations/process.ts
export async function process(ctx: OrderPipelineContext) {
  // Skip if validation failed
  if (ctx.errors.length > 0) return ctx;

  // Create order in database
  const order = await prisma.order.create({
    data: {
      customerId: ctx.input.customerId,
      items: ctx.input.items,
      total: ctx.input.total,
      status: "PENDING",
    },
  });

  ctx.order = order;
  ctx.results.createdOrder = order;

  return ctx;
}

// src/services/order/operations/notify.ts
export async function notify(ctx: OrderPipelineContext) {
  // Skip if no order created
  if (!ctx.order) return ctx;

  // Send notification (non-critical - won't fail pipeline)
  await sendEmail({
    to: ctx.order.customerEmail,
    subject: "Order Confirmed",
    body: `Order #${ctx.order.id} received`,
  });

  ctx.results.notificationSent = true;

  return ctx;
}
```

### Step 3: Create Orchestrator

```typescript
// src/services/order/orchestrator.ts
import {
  BaseOrchestrator,
  DefaultPerformanceTracker,
} from "@core/orchestration";
import { validate } from "./operations/validate";
import { process } from "./operations/process";
import { notify } from "./operations/notify";

export class CreateOrderOrchestrator extends BaseOrchestrator<
  OrderPipelineContext,
  Order,
  CreateOrderInput
> {
  constructor() {
    super({
      name: "CreateOrderOrchestrator",
      timeout: 5000,
      enableMetrics: true,
    });
  }

  protected async initializeContext(input: CreateOrderInput) {
    return {
      requestId: Math.random().toString(36).substr(2, 9),
      startTime: Date.now(),
      perfTracker: new DefaultPerformanceTracker(),
      input,
      results: {},
      errors: [],
      metadata: {},
    };
  }

  protected getPipeline() {
    return [
      { name: "validate", operation: validate, critical: true, timeout: 1000 },
      { name: "process", operation: process, critical: true, timeout: 3000 },
      { name: "notify", operation: notify, critical: false, timeout: 2000 },
    ];
  }

  protected buildResult(context: OrderPipelineContext): Order {
    if (!context.order) {
      throw new Error("Order creation failed");
    }
    return context.order;
  }
}
```

### Step 4: Create Service Facade

```typescript
// src/services/order/index.ts
import { CreateOrderOrchestrator } from "./orchestrator";

export class OrderService {
  private static instance: OrderService;
  private createOrchestrator: CreateOrderOrchestrator;

  private constructor() {
    this.createOrchestrator = new CreateOrderOrchestrator();
  }

  public static getInstance(): OrderService {
    if (!OrderService.instance) {
      OrderService.instance = new OrderService();
    }
    return OrderService.instance;
  }

  public async createOrder(input: CreateOrderInput) {
    return this.createOrchestrator.execute(input);
  }
}

export const orderService = OrderService.getInstance();
```

### Step 5: Create Route

```typescript
// src/routes/order/index.ts
import { Type } from "@sinclair/typebox";
import { orderService } from "@services/order";

const orderRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/",
    {
      preValidation: [fastify.authenticate],
      schema: {
        body: Type.Object({
          customerId: Type.String(),
          items: Type.Array(
            Type.Object({
              productId: Type.String(),
              quantity: Type.Number(),
            }),
          ),
          total: Type.Number(),
        }),
      },
    },
    async (request, reply) => {
      const result = await orderService.createOrder(request.body);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: { message: result.error.message },
        });
      }

      return reply.status(201).send({
        success: true,
        data: result.data,
        metadata: {
          duration: result.duration,
          metrics: result.metrics, // Per-operation timing!
        },
      });
    },
  );
};
```

---

## Key Benefits

### 1. Testability

Each operation is isolated and can be tested by mocking its single dependency:

```typescript
describe("createOrder operation", () => {
  it("should create order in database", async () => {
    // Mock the single dependency
    const mockPrisma = {
      order: {
        create: vi.fn().mockResolvedValue({ id: "order-1", status: "PENDING" }),
      },
    };

    const ctx = {
      input: { customerId: "cust-1", items: [] },
      errors: [],
      deps: { prisma: mockPrisma },
    };

    const result = await createOrder(ctx);

    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { customerId: "cust-1" } }),
    );
    expect(result.order.id).toBe("order-1");
  });
});
```

### 2. Observability

Automatic performance tracking for every operation:

```json
{
  "success": true,
  "duration": 45,
  "metrics": {
    "validate": 5,
    "process": 28,
    "notify": 12
  }
}
```

### 3. Composability

Reuse operations across different orchestrators:

```typescript
// Reuse validate operation in multiple orchestrators
import { validate } from "../order/operations/validate";

class UpdateOrderOrchestrator {
  protected getPipeline() {
    return [
      { name: "validate", operation: validate }, // Reused!
      { name: "update", operation: updateOrder },
    ];
  }
}
```

### 4. Reliability

Critical vs non-critical operations:

- **Critical** (`critical: true`) - Failure stops the pipeline
- **Non-critical** (`critical: false`) - Failure is logged but pipeline continues

```typescript
{ name: 'notify', operation: notify, critical: false }
// If notification fails, order is still created
```

### 5. Maintainability

Clear separation of concerns:

- **Routes**: HTTP handling, validation, authentication
- **Services**: Public API, singleton management
- **Orchestrators**: Pipeline definition, flow control
- **Operations**: Single-responsibility functions (may include I/O)

---

## Performance Comparison

### Direct Prisma Access

```
Request → Validation (2ms) → DB Query (5ms) → Response
Total: ~7ms
```

### Golden Orchestrator

```
Request → Orchestrator
  ├─ validate (5ms)
  ├─ process (28ms)
  └─ notify (12ms)
Total: ~45ms

But you get:
✅ Per-operation metrics
✅ Testable operations
✅ Error handling
✅ Timeout protection
✅ Non-critical operations
```

---

## Best Practices

### 1. Keep Operations Single-Responsibility

Each operation should do one thing. Side effects (DB writes, API calls) are allowed - but each operation owns exactly one concern.

```typescript
// ✅ Good - one responsibility (create order)
export async function createOrder(ctx: Context) {
  if (ctx.errors.length > 0) return ctx;

  ctx.order = await prisma.order.create({
    data: { customerId: ctx.input.customerId, status: 'PENDING' },
  });
  return ctx;
}

// ❌ Bad - multiple responsibilities
export async function createOrderAndNotify(ctx: Context) {
  ctx.order = await prisma.order.create({...});
  await sendEmail(ctx.order.customerEmail); // Should be separate operation
  await updateInventory(ctx.order.items);   // Should be separate operation
  return ctx;
}
```

### 2. Always Return Context

```typescript
// ✅ Good
export async function process(ctx: Context) {
  ctx.results.processed = true;
  return ctx; // Always return
}

// ❌ Bad
export async function process(ctx: Context) {
  return { processed: true }; // Breaks pipeline!
}
```

### 3. Handle Errors Gracefully

```typescript
export async function process(ctx: Context) {
  // Skip if previous errors
  if (ctx.errors.length > 0) return ctx;

  try {
    // Your logic
  } catch (error) {
    ctx.errors.push(error);
  }

  return ctx;
}
```

### 4. Use TypeScript Types

```typescript
// ✅ Good - strongly typed
interface OrderContext extends OperationContext {
  input: CreateOrderInput;
  order?: Order;
}

// ❌ Bad - any types
interface OrderContext {
  input: any;
  order: any;
}
```

### 5. Descriptive Operation Names

```typescript
// ✅ Good
getPipeline() {
  return [
    { name: 'validate-customer', operation: validateCustomer },
    { name: 'check-inventory', operation: checkInventory },
    { name: 'charge-payment', operation: chargePayment },
  ];
}

// ❌ Bad
getPipeline() {
  return [
    { name: 'step1', operation: op1 },
    { name: 'step2', operation: op2 },
  ];
}
```

---

## Common Patterns

### Sequential Processing

```typescript
getPipeline() {
  return [
    { name: 'validate', operation: validate },
    { name: 'process', operation: process },
    { name: 'finalize', operation: finalize },
  ];
}
```

### Conditional Operations

```typescript
export async function processPayment(ctx: OrderContext) {
  // Skip if total is zero
  if (ctx.input.total === 0) return ctx;

  // Process payment
  const charge = await stripe.charges.create({...});
  ctx.results.charge = charge;

  return ctx;
}
```

### Non-Critical Side Effects

```typescript
getPipeline() {
  return [
    { name: 'create-order', operation: createOrder, critical: true },
    { name: 'send-email', operation: sendEmail, critical: false },
    { name: 'track-analytics', operation: trackAnalytics, critical: false },
  ];
}
```

---

## Summary

The Golden Orchestrator pattern provides:

- ✅ **Structure** - Clear, predictable flow
- ✅ **Testability** - Isolated, single-responsibility functions
- ✅ **Observability** - Automatic metrics
- ✅ **Reliability** - Error handling, timeouts
- ✅ **Maintainability** - Separation of concerns
- ✅ **Performance Tracking** - Per-operation timing

Use it for complex workflows. Use direct Prisma access for simple queries.

**Generate a service and see it in action:**

```bash
npm run generate
```
