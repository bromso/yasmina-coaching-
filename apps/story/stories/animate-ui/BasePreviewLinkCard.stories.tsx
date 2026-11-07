import {
  PreviewLinkCard,
  PreviewLinkCardImage,
  PreviewLinkCardPanel,
  PreviewLinkCardTrigger,
} from "@repo/ui/components/animate-ui/components/base/preview-link-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Preview Link Card",
  component: PreviewLinkCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PreviewLinkCard>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <PreviewLinkCard
      href="https://github.com"
      src="https://placehold.co/400x200/e2e8f0/64748b?text=Link+Preview"
    >
      <PreviewLinkCardTrigger
        render={
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium underline underline-offset-4"
          >
            Hover to preview link
          </a>
        }
      />
      <PreviewLinkCardPanel>
        <PreviewLinkCardImage alt="Link preview" className="w-full h-32 object-cover" />
        <div className="p-3 space-y-1">
          <h4 className="text-sm font-semibold">GitHub</h4>
          <p className="text-xs text-muted-foreground">
            Where the world builds software. Millions of developers use GitHub to build, ship, and
            maintain their software.
          </p>
        </div>
      </PreviewLinkCardPanel>
    </PreviewLinkCard>
  ),
}

export const TextOnly: Story = {
  render: () => (
    <PreviewLinkCard href="https://example.com/docs/api">
      <PreviewLinkCardTrigger
        render={
          <a
            href="https://example.com/docs/api"
            className="text-sm font-medium underline underline-offset-4"
          >
            Documentation link
          </a>
        }
      />
      <PreviewLinkCardPanel>
        <div className="p-3 space-y-1">
          <h4 className="text-sm font-semibold">API Documentation</h4>
          <p className="text-xs text-muted-foreground">
            Comprehensive reference for all available endpoints, parameters, and response formats.
          </p>
        </div>
      </PreviewLinkCardPanel>
    </PreviewLinkCard>
  ),
}
