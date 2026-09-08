#!/bin/bash
set -e  # Exit on error

echo "🚀 Super Admin Platform Setup"
echo "======================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current version: $(node -v)"
    exit 1
fi
if [ "$NODE_VERSION" -ge 22 ]; then
    echo "⚠️  Warning: Node.js $(node -v) detected. Recommended: Node 18-20 LTS"
    echo "   Some dependencies may show warnings with Node 22+"
    echo "   Consider using: nvm use 20"
    echo ""
fi

echo "✅ Node.js version: $(node -v)"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker is not installed. You'll need it for PostgreSQL, Prometheus, and Grafana"
else
    echo "✅ Docker is installed"
fi

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created (you can customize it later)"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate

# Start Docker services if Docker is available
if command -v docker &> /dev/null; then
    echo ""
    echo "🐳 Starting Docker services (PostgreSQL, Prometheus, Grafana)..."
    npm run docker:up
    
    # Wait for PostgreSQL to be ready
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 8
    
    # Run database migrations
    echo ""
    echo "🗄️  Running database migrations..."
    npm run db:migrate
    
    # Generate Grafana dashboards
    echo ""
    echo "📊 Generating Grafana dashboards..."
    npm run generate:dashboards || echo "⚠️  No orchestrators found yet (this is normal for a fresh install)"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "🎯 Your Super Admin Platform is ready!"
echo ""
echo "🚀 Next steps:"
echo ""
echo "   # Start everything (like DriftOS!):"
echo "   make up"
echo ""
echo "   # Then in another terminal:"
echo "   make dev"
echo ""
echo "   # Open Grafana:"
echo "   make grafana"
echo ""
echo "📍 Your services will be at:"
echo "   • API:         http://localhost:3000"
echo "   • Swagger:     http://localhost:3000/documentation"
echo "   • Prometheus:  http://localhost:9090"
echo "   • Grafana:     http://localhost:3001 (System Overview + Service Dashboards)"
echo ""
echo "Happy coding! 🎉"
