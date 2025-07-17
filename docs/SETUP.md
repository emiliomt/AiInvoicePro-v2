
# Setup Guide

## Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=your_postgresql_connection_string

# Authentication
SESSION_SECRET=your_session_secret
REPLIT_DOMAINS=your-repl-name.yourusername.repl.co
ISSUER_URL=https://replit.com/oidc
REPL_ID=your_repl_id

# AI Services
OPENAI_API_KEY=your_openai_api_key

# Development
NODE_ENV=development
```

## Database Setup

1. Run migrations:
   ```bash
   npx drizzle-kit push:pg
   ```

2. Verify tables are created:
   ```bash
   npm run db:studio
   ```

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push database schema changes
- `npm run db:studio` - Open database studio
