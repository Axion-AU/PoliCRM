# UI Components

Reusable components in `components/ui/`.

## Button

```tsx
import { Button } from "./components/ui/button";

<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

## Modal

```tsx
import { Modal, ModalFooter } from "./components/ui/modal";

const [isOpen, setIsOpen] = useState(false);

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Edit Person"
  size="lg"
>
  <form>{/* Form content */}</form>
  <ModalFooter>
    <Button variant="ghost" onClick={() => setIsOpen(false)}>
      Cancel
    </Button>
    <Button onClick={handleSave}>Save</Button>
  </ModalFooter>
</Modal>;
```

**Props:**

- `isOpen` - Boolean to control visibility
- `onClose` - Callback when modal closes
- `title` - Header text
- `size` - `sm`, `md`, `lg`, or `xl`

## Dropdown

```tsx
import { Dropdown } from "./components/ui/dropdown";

<Dropdown
  label="Status"
  options={[
    { value: "verified", label: "Verified" },
    { value: "pending", label: "Pending" },
  ]}
  value={selectedStatus}
  onChange={setSelectedStatus}
  multiple // Optional: allow multi-select
/>;
```

## ActionMenu

```tsx
import { ActionMenu, ActionMenuItem } from "./components/ui/dropdown";

<ActionMenu
  trigger={
    <button>
      <MoreHorizontal />
    </button>
  }
>
  <ActionMenuItem icon={<Edit3 />} onClick={handleEdit}>
    Edit
  </ActionMenuItem>
  <ActionMenuItem icon={<Trash2 />} onClick={handleDelete} danger>
    Delete
  </ActionMenuItem>
</ActionMenu>;
```

## Skeleton

Loading placeholders:

```tsx
import { Skeleton, SkeletonCard, SkeletonTable } from "./components/ui/skeleton";

// Basic skeleton
<Skeleton className="h-4 w-32" />

// Card loading state
<SkeletonCard />

// Table loading state
<SkeletonTable rows={5} />
```

## Input

```tsx
import { Input } from "./components/ui/input";

<Input
  type="email"
  placeholder="Enter email..."
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>;
```

## Card Pattern

Use the `.card` class for consistent card styling:

```tsx
<div className="card p-6">
  <h3 className="text-lg font-semibold text-foreground">Title</h3>
  <p className="text-muted-foreground">Description</p>
</div>
```

The card class applies:

- Dark background (`bg-card`)
- Border (`border-border`)
- Rounded corners (`rounded-xl`)
- Subtle shadow
