# hacker_chat

A modern real-time chat application built with Next.js 14+.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Authentication:** Clerk
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **File Storage:** AWS S3

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the environment variables
3. Install dependencies:
   ```bash
   npm install
   ```
4. Initialize the database:
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```
5. Run the development server:
   ```bash
   npm run dev
   ```

## Features

- Authentication
- Real-time messaging
- Channel/DM organization
- File sharing & search
- User presence & status
- Thread support
- Emoji reactions

## Project Structure

```
chatgenius/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── _auth/
│   │   ├── _main/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   ├── lib/
│   └── types/
├── prisma/
│   └── schema.prisma
├── public/
├── config/
├── .gitignore
├── .env
├── README.md
├── next.config.js
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint 