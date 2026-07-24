# Frontend Architecture

## Overview

The PoliCRM frontend is a React single-page application built with:

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first styling
- **Nanostores** - Lightweight state management
- **React Router** - Client-side routing
- **Lucide React** - Icon library

## Directory Structure

```
frontend/src/
├── components/
│   ├── ui/           # Reusable UI primitives
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── modal.tsx
│   │   ├── dropdown.tsx
│   │   └── skeleton.tsx
│   ├── widgets/      # Dashboard widgets
│   ├── Sidebar.tsx   # Main navigation
│   ├── Layout.tsx    # App shell
│   └── ...
├── pages/            # Route components
│   ├── Dashboard.tsx
│   ├── Members.tsx
│   ├── Queue.tsx
│   └── ...
├── services/
│   └── api.ts       # API client
├── stores/           # State management
│   ├── authStore.ts
│   ├── membersStore.ts
│   ├── statsStore.ts
│   └── tagsStore.ts
├── utils/
│   └── cn.ts        # Class name utility
└── index.css        # Global styles + design tokens
```

## Design System

### CSS Variables (Dark Theme)

```css
:root {
  --background: 222 47% 8%;
  --foreground: 210 40% 98%;
  --card: 222 47% 11%;
  --muted: 217 33% 17%;
  --primary: 238 83% 67%;
  --secondary: 217 33% 17%;
  --border: 217 33% 20%;
}
```

### Component Patterns

```tsx
// Use the `card` class for containers
<div className="card p-6">...</div>

// Use design tokens for colors
<p className="text-foreground">Primary text</p>
<p className="text-muted-foreground">Secondary text</p>

// Use lucide-react for icons
<Users className="w-5 h-5" />
```

## State Management

Using Nanostores for lightweight, atomic state:

```typescript
// stores/membersStore.ts
import { atom } from "nanostores";

export const $filters = atom({ search: "", status: [], state: "all" });

export function updateFilters(updates: Partial<Filters>) {
  $filters.set({ ...$filters.get(), ...updates });
}
```

Usage in components:

```tsx
import { useStore } from "@nanostores/react";
import { $filters, updateFilters } from "../stores/membersStore";

function MyComponent() {
  const filters = useStore($filters);

  return (
    <input
      value={filters.search}
      onChange={(e) => updateFilters({ search: e.target.value })}
    />
  );
}
```

## API Integration

All API calls go through `/api` prefix (configured in Vite proxy):

```typescript
// services/api.ts
const API_BASE = "/api";

export const membersApi = {
  getAll: (params) => apiCall(`/members?${queryParams}`),
  create: (data) => apiCall("/members", { method: "POST", body: data }),
};
```

## Routing

React Router v6 with lazy loading:

```tsx
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Members = lazy(() => import("./pages/Members"));

<Routes>
  <Route element={<Layout />}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/members" element={<Members />} />
  </Route>
</Routes>;
```
