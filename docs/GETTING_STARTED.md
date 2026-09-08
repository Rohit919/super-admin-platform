# 🚀 Getting Started

## Quick Start

### One-Command Setup

Run the automated setup script:

```bash
./setup.sh
```

This will:

- ✅ Check Node.js version (requires 18+)
- ✅ Create `.env` file from template
- ✅ Install all dependencies
- ✅ Generate Prisma client
- ✅ Start Docker services (PostgreSQL, Prometheus, Grafana)
- ✅ Run database migrations
- ✅ Generate Grafana dashboards

Then start the dev server:

```bash
npm run dev
```

**That's it!** Your API is now running at:

- **API**: http://localhost:3000/api/v1
- **Swagger**: http://localhost:3000/documentation
- **Metrics**: http://localhost:3000/metrics
- **Grafana**: http://localhost:3001 (admin/admin)

---

### Manual Setup (Optional)

If you prefer manual setup or the script doesn't work:

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Generate Prisma client
npx prisma generate

# 4. Start Docker services
npm run docker:up

# 5. Run migrations
npm run db:migrate

# 6. Start dev server
npm run dev
```

---

## 🎨 Generate Your First Service

The fastest way to create a new service with the Golden Orchestrator pattern:

### Interactive Generator (Recommended)

```bash
npm run generate

? What do you want to generate? Service
? Service name: Order
? Service type: CRUD (entity management: users, orders, products)
? Operations: validate,create,notify
? Include Prisma model? Yes
? Include API route? Yes
? Include tests? Yes

✨ CRUD Service created successfully!
  ✓ Created 14 files (~600 lines)
  ✓ Complete with tests
  ✓ Ready in 2 minutes!
```

### Service Types

The generator supports **two service patterns**:

| Type            | Use Case                                           | Default Operations          | Prisma |
| --------------- | -------------------------------------------------- | --------------------------- | ------ |
| **CRUD**        | Entity management (users, orders, products)        | validate, create, notify    | ✅ Yes |
| **Calculation** | Compute operations (scoring, analysis, transforms) | validate, calculate, format | ❌ No  |

### CLI Generator (Non-Interactive)

For scripting or quick generation without prompts:

```bash
# CRUD service
node scripts/gen-service.mjs Order crud validate create notify

# Calculation service
node scripts/gen-service.mjs Scoring calculation validate calculate format

# Uses defaults if operations omitted
node scripts/gen-service.mjs User crud
```

This creates:

```
src/services/order/
├── index.ts                    # Service facade
├── orchestrator.ts             # Pipeline orchestrator
├── types/index.ts              # TypeScript types
├── operations/                 # Pure functions
│   ├── validate.ts
│   ├── process.ts
│   └── notify.ts
└── __tests__/                  # Co-located tests ⭐
    ├── operations/
    │   ├── validate.test.ts
    │   ├── process.test.ts
    │   └── notify.test.ts
    ├── orchestrator.test.ts
    └── integration.test.ts

src/routes/order/
└── index.ts                    # API routes
```

---

## 📝 Next Steps

### 1. Implement Business Logic

Edit the generated operations in `src/services/order/operations/`:

```typescript
// src/services/order/operations/validate.ts
export async function validate(context: OrderPipelineContext) {
  const errors: string[] = [];

  // Add your validation logic
  if (!context.input.customerId) {
    errors.push("Customer ID required");
  }

  if (errors.length > 0) {
    context.errors.push(new Error(`Validation: ${errors.join(", ")}`));
  }

  return context; // Always return context
}
```

### 2. Update Types

```typescript
// src/services/order/types/index.ts
export interface CreateOrderInput {
  customerId: string;
  items: OrderItem[];
  total: number;
}
```

### 3. Run Database Migration

```bash
npm run db:migrate
```

### 4. Register Route in App

```typescript
// src/app.ts
import orderRoutes from "./routes/order/index";

// Add to API routes:
await fastify.register(orderRoutes, { prefix: "/orders" });
```

### 5. Run Tests

```bash
npm test order
```

---

## 🎯 Available Routes

### Public Routes (No Auth)

- `GET /api/v1/health` - Health check
- `GET /api/v1/ready` - Readiness probe
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Register

### Protected Routes (Auth Required)

- `GET /api/v1/users/me` - Get current user
- `POST /api/v1/todos` - Create todo (uses Golden Orchestrator ⭐)
- `GET /api/v1/todos` - List todos
- `POST /api/v1/examples` - Create example (direct Prisma access)
- `GET /api/v1/examples` - List examples

---

## 🛠️ Common Commands

### Daily Workflow (Like DriftOS!)

```bash
# Start everything (one command!)
make up              # Starts Docker + migrations + dashboards

# Start dev server (in another terminal)
make dev

# Open Grafana
make grafana

# Stop everything
make down
```

### All Available Commands

```bash
# Quick Start
make up              # 🎯 Start everything
make dev             # Start dev server
make grafana         # Open Grafana
make down            # Stop all services

# Testing
make test            # Run all tests
make test-watch      # Watch mode
make lint            # Run linter
make typecheck       # Type check

# Database
make db-migrate      # Run migrations
make db-studio       # Open Prisma Studio
make db-push         # Push schema
make db-reset        # Reset DB (WARNING)

# Generators
make generate        # Generate service
make dashboards      # Generate Grafana dashboards

# Cleanup
make clean           # Clean build artifacts
make docker-clean    # Remove volumes (WARNING)

# Help
make help            # Show all commands
```

### Or Using npm Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production

# Database
npm run db:migrate       # Run migrations
npm run db:studio        # Open Prisma Studio

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run lint             # Run linter

# Docker
npm run docker:up        # Start services
npm run docker:down      # Stop services

# Generator
npm run generate         # Generate service
```

---

## 🧪 Testing the API

### Automated Tests

Run the complete API test suite:

```bash
make test-api
```

This tests:

- Health checks
- User registration & authentication
- Protected endpoints
- Todo creation (Golden Orchestrator)
- Performance metrics

### Manual Testing

**Using Swagger UI:**

```
http://localhost:3000/documentation
```

**Using cURL:**

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Create Todo (with token)
curl -X POST http://localhost:3000/api/v1/todos \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Test todo","userId":"user-123"}'
```

---

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Deep dive into the Golden Orchestrator pattern
- **[../README.md](../README.md)** - Main repository README

---

## 🎓 Learn by Example

The best way to learn is by studying the included example:

### Todo Service (Golden Orchestrator Pattern)

```
src/services/todo/
├── index.ts                    # Service facade (singleton)
├── orchestrator.ts             # Pipeline orchestrator
├── types/index.ts              # TypeScript interfaces
├── operations/                 # Pure functions
│   ├── validate-input.ts       # Operation 1
│   ├── create-todo.ts          # Operation 2
│   └── notify-creation.ts      # Operation 3
└── __tests__/                  # Tests
```

**Key concepts demonstrated:**

- Pipeline-based orchestration
- Pure operation functions
- Automatic performance tracking
- Error handling
- Testing patterns

Study this service, then use `npm run generate` to create your own!

---

## 🐛 Troubleshooting

### "Cannot find module"

```bash
npm install
npm run typecheck
```

### Database connection errors

```bash
npm run docker:up
# Wait for PostgreSQL to be ready
npm run db:migrate
```

### Port already in use

```bash
# Change PORT in .env file
PORT=3001 npm run dev
```

### TypeScript errors

```bash
npm run typecheck
# Fix errors shown
```

---

## 💡 Tips

### 1. Start Simple

Generate a basic service first, understand the pattern, then add complexity.

### 2. Use Direct Access for Simple CRUD

Not everything needs the orchestrator pattern. Simple database queries can use direct Prisma access (see `/examples` route).

### 3. Tests Are Generated

Every generated service includes complete tests. Implement the TODOs and you're done!

### 4. Performance Tracking is Automatic

Every orchestrator automatically tracks per-operation performance. Check Grafana!

### 5. Hot Reload Works

Changes to TypeScript files automatically reload the server.

---

## 🎉 You're Ready!

1. ✅ Run `npm run generate`
2. ✅ Create your first service
3. ✅ Implement the operations
4. ✅ Run tests
5. ✅ Start building!

**Happy coding!** 🚀
