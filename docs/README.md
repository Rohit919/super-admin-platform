# 📚 Documentation

## Start Here

- **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Setup, first service, common commands
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Golden Orchestrator pattern explained
- **[AUTOMATIC_DASHBOARDS.md](./AUTOMATIC_DASHBOARDS.md)** - Auto-generated Grafana dashboards

That's it! Everything you need to build production-ready Fastify services.

---

## Quick Links

### New to the Project?

→ **[GETTING_STARTED.md](./GETTING_STARTED.md)**

### Want to Understand the Architecture?

→ **[ARCHITECTURE.md](./ARCHITECTURE.md)**

### Need the Main README?

→ **[../README.md](../README.md)**

---

## Generator Quick Reference

```bash
# Interactive (recommended)
npm run generate

# CLI (non-interactive)
node scripts/gen-service.mjs Order crud
node scripts/gen-service.mjs Scoring calculation
```

**Service Types:**

- **CRUD** - Entity management with Prisma
- **Calculation** - Compute operations without database

---

**Happy coding!** 🚀
