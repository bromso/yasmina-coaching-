Add a new shadcn/ui component to the shared UI package.

## Usage
`/add-component <component-name>`

## Instructions

1. Run `bunx shadcn@latest add $ARGUMENTS -c packages/ui`
2. Verify the component was added to `packages/ui/src/components/`
3. Check if the component needs to be exported in `packages/ui/package.json`
4. Report success and show how to import the component:
   ```tsx
   import { ComponentName } from "@repo/ui/components/component-name"
   ```

## Common Components
- button, card, dialog, dropdown-menu, form, input, label
- select, tabs, table, toast, tooltip, popover, sheet
- accordion, alert, avatar, badge, calendar, checkbox
- command, context-menu, hover-card, menubar, navigation-menu
- progress, radio-group, scroll-area, separator, skeleton
- slider, switch, textarea, toggle, toggle-group
