# GymDesk - Gym Management System

## Overview

GymDesk is a comprehensive gym management system designed for efficient member tracking, payment processing, attendance monitoring, and revenue analytics. The application provides a data-heavy dashboard interface built with Material Design principles, prioritizing functionality and rapid data access for gym administrators.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Wouter for lightweight client-side routing (alternative to React Router)
- Single Page Application (SPA) architecture

**UI Component Library**
- Shadcn/ui components built on Radix UI primitives (headless, accessible components)
- Tailwind CSS for utility-first styling with custom design tokens
- Class Variance Authority (CVA) for component variant management
- Material Design adapted approach as specified in design guidelines

**State Management & Data Fetching**
- TanStack Query (React Query) for server state management, caching, and synchronization
- React Hook Form with Zod for form state management and validation
- Local component state with React hooks

**Design System**
- Custom Tailwind configuration with extended color palette and spacing system
- Inter font (Google Fonts) as primary typeface
- Consistent spacing primitives (2, 4, 6, 8 Tailwind units)
- Light/Dark theme support via custom theme provider

### Backend Architecture

**Server Framework**
- Express.js for HTTP server and API routing
- TypeScript for type safety across the stack
- ESM module system throughout the application

**API Design**
- RESTful API endpoints organized by resource
- JSON request/response format
- Centralized error handling
- Request logging middleware for API calls

**Key API Resources**
- `/api/dashboard/stats` - Dashboard metrics aggregation
- `/api/students` - Student CRUD operations
- `/api/payments` - Payment processing and history
- `/api/attendance` - Attendance tracking and reporting
- `/api/income/stats` - Revenue analytics

### Database Architecture

**ORM & Database**
- Drizzle ORM for type-safe database operations
- PostgreSQL as the primary database (via Neon serverless)
- WebSocket connection support for serverless environments

**Schema Design**
- **Students Table**: Core member data (id, registerNo, name, phone, joinDate, expiryDate)
- **Payments Table**: Financial transactions (tokenNumber, date, studentId, amount, paymentMethod, duration)
- **Attendance Table**: Daily check-ins (date, registerNo, studentName, timeIn)
- Serial IDs for primary keys
- Normalized structure with foreign key relationships via registerNo and studentId
- Timestamp tracking (createdAt) on all tables

**Data Validation**
- Drizzle-Zod integration for runtime schema validation
- Shared schema definitions between client and server
- Insert schemas that omit auto-generated fields (id, createdAt)

### Development & Production Environment

**Development Tooling**
- TSX for TypeScript execution in development
- Vite dev server with HMR
- Replit-specific plugins for runtime error overlays and development banners

**Build Process**
- Vite builds client code to `dist/public`
- ESBuild bundles server code to `dist`
- Separate build commands for client and server
- Production starts compiled Node.js bundle

**Path Aliases**
- `@/*` → Client source files
- `@shared/*` → Shared schema and types
- `@assets/*` → Static assets

## External Dependencies

### Database & Hosting
- **Neon Database**: Serverless PostgreSQL with WebSocket support
- Database URL configured via environment variable (`DATABASE_URL`)
- Drizzle Kit for schema migrations (`db:push` command)

### UI Component Libraries
- **Radix UI**: Comprehensive set of accessible, unstyled components (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, label, popover, radio-group, select, separator, slider, switch, tabs, toast, tooltip, etc.)
- **Lucide React**: Icon library for consistent iconography
- **CMDK**: Command palette component
- **Embla Carousel**: Carousel/slider functionality
- **Vaul**: Drawer component implementation

### Form & Validation
- **React Hook Form**: Performant form state management
- **Zod**: TypeScript-first schema validation
- **@hookform/resolvers**: Integration layer between React Hook Form and Zod

### Styling & Design
- **Tailwind CSS**: Utility-first CSS framework
- **PostCSS**: CSS processing with Autoprefixer
- **tailwind-merge**: Utility for merging Tailwind classes
- **class-variance-authority**: Component variant management

### Session Management
- **connect-pg-simple**: PostgreSQL session store for Express
- Session data stored in PostgreSQL for persistence

### Utilities
- **date-fns**: Date manipulation and formatting
- **nanoid**: Unique ID generation
- **ws**: WebSocket client for Neon database connections

### Development Dependencies
- **TypeScript**: Type system and compiler
- **Vite Plugins**: 
  - @vitejs/plugin-react for React support
  - @replit/vite-plugin-runtime-error-modal for error overlays
  - @replit/vite-plugin-cartographer for navigation
  - @replit/vite-plugin-dev-banner for development indicators