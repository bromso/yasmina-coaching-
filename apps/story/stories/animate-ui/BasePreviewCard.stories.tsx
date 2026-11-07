import {
  PreviewCard,
  PreviewCardPanel,
  PreviewCardTrigger,
} from "@repo/ui/components/animate-ui/components/base/preview-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Preview Card",
  component: PreviewCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PreviewCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <PreviewCard>
      <PreviewCardTrigger
        render={
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium underline underline-offset-4"
          >
            Hover to preview
          </a>
        }
      />
      <PreviewCardPanel>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Preview Card</h4>
          <p className="text-sm text-muted-foreground">
            This card appears when hovering over the trigger element, providing a quick preview of
            additional content.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground">Hover-based preview</span>
          </div>
        </div>
      </PreviewCardPanel>
    </PreviewCard>
  ),
}

export const WithRichContent: Story = {
  render: () => (
    <PreviewCard>
      <PreviewCardTrigger
        render={
          <a
            href="https://example.com/users/jane-doe"
            className="text-sm font-medium underline underline-offset-4"
          >
            View user profile
          </a>
        }
      />
      <PreviewCardPanel>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
            JD
          </div>
          <div>
            <h4 className="text-sm font-semibold">Jane Doe</h4>
            <p className="text-xs text-muted-foreground">Software Engineer</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Building great user experiences with React and TypeScript.
        </p>
      </PreviewCardPanel>
    </PreviewCard>
  ),
}
