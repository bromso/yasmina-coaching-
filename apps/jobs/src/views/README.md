# Views

Page-level compositions specific to this app. A view assembles blocks (from `@repo/ui/blocks`) and components (from `@repo/ui/components`) into a layout for one route.

**Import direction:** views may import from `@repo/ui/blocks/*`, `@repo/ui/components/*`, or local components. Views may NOT be imported by blocks or components.

## Convention

- One view per file: `<route>-view.tsx`
- Named export matching the file: `<Route>View` (PascalCase)
- Pages are thin: `page.tsx` imports a view and renders it
