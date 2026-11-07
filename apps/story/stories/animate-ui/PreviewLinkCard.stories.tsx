import {
  PreviewLinkCard,
  PreviewLinkCardContent,
  PreviewLinkCardImage,
  PreviewLinkCardTrigger,
} from "@repo/ui/components/animate-ui/components/radix/preview-link-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/PreviewLinkCard",
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
    <p className="text-sm">
      Check out{" "}
      <PreviewLinkCard
        href="https://github.com"
        src="https://github.githubassets.com/images/modules/site/social-cards/github-social.png"
      >
        <PreviewLinkCardTrigger asChild>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            GitHub
          </a>
        </PreviewLinkCardTrigger>
        <PreviewLinkCardContent>
          <PreviewLinkCardImage alt="GitHub preview" />
        </PreviewLinkCardContent>
      </PreviewLinkCard>{" "}
      for more information.
    </p>
  ),
}

export const MultipleLinks: Story = {
  render: () => (
    <p className="text-sm leading-relaxed max-w-md">
      We use tools like{" "}
      <PreviewLinkCard
        href="https://vercel.com"
        src="https://assets.vercel.com/image/upload/front/vercel/dps.png"
      >
        <PreviewLinkCardTrigger asChild>
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            Vercel
          </a>
        </PreviewLinkCardTrigger>
        <PreviewLinkCardContent>
          <PreviewLinkCardImage alt="Vercel preview" />
        </PreviewLinkCardContent>
      </PreviewLinkCard>{" "}
      for deployments and{" "}
      <PreviewLinkCard href="https://react.dev" src="https://react.dev/images/og-home.png">
        <PreviewLinkCardTrigger asChild>
          <a
            href="https://react.dev"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            React
          </a>
        </PreviewLinkCardTrigger>
        <PreviewLinkCardContent>
          <PreviewLinkCardImage alt="React preview" />
        </PreviewLinkCardContent>
      </PreviewLinkCard>{" "}
      for building user interfaces.
    </p>
  ),
}
