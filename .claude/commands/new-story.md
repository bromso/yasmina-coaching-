# Create Storybook Story

Generate a new Storybook story file for a component.

## Arguments
- `$ARGUMENTS` - Path to the component file (e.g., `packages/ui/src/components/button.tsx`)

## Instructions

1. **Read the component file** at the provided path to understand:
   - Component name and exports
   - Props interface/type
   - Variants and states
   - Default values

2. **Generate a story file** in `apps/story/stories/` with:
   - Proper naming: `<ComponentName>.stories.tsx`
   - Meta configuration with title and component
   - Default story showing basic usage
   - Variant stories for each prop variation
   - Interactive story with controls for all props

3. **Story template pattern**:
   ```tsx
   import type { Meta, StoryObj } from "@storybook/react"
   import { ComponentName } from "@repo/ui/components/component-name"

   const meta: Meta<typeof ComponentName> = {
     title: "Components/ComponentName",
     component: ComponentName,
     tags: ["autodocs"],
     argTypes: {
       // Define controls for props
     },
   }

   export default meta
   type Story = StoryObj<typeof meta>

   export const Default: Story = {
     args: {
       // Default props
     },
   }

   // Additional variant stories...
   ```

4. **Report** the created story file path and suggest running `/story dev` to preview.
