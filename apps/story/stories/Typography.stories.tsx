import {
  Blockquote,
  H1,
  H2,
  H3,
  H4,
  InlineCode,
  Large,
  Lead,
  List,
  ListItem,
  Muted,
  Paragraph,
  Small,
  Typography,
} from "@repo/ui/components/typography"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Typography/Typography",
  component: Typography,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "h1",
        "h2",
        "h3",
        "h4",
        "p",
        "lead",
        "large",
        "small",
        "muted",
        "blockquote",
        "code",
        "list",
      ],
      description: "Typography variant that determines the visual style",
    },
    tone: {
      control: "select",
      options: ["default", "muted", "primary", "secondary", "destructive", "success", "warning"],
      description: "Color tone of the typography",
    },
    size: {
      control: "select",
      options: ["inherit", "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"],
      description: "Override the font size",
    },
    weight: {
      control: "select",
      options: ["inherit", "normal", "medium", "semibold", "bold", "extrabold"],
      description: "Override the font weight",
    },
    align: {
      control: "select",
      options: ["inherit", "left", "center", "right", "justify"],
      description: "Text alignment",
    },
    wrap: {
      control: "select",
      options: ["inherit", "wrap", "nowrap", "balance", "pretty"],
      description: "Text wrapping behavior",
    },
    as: {
      control: "text",
      description: "Render as a different HTML element",
    },
    asChild: {
      control: "boolean",
      description: "Merge props onto child element",
    },
  },
} satisfies Meta<typeof Typography>

export default meta
type Story = StoryObj<typeof meta>

/* -----------------------------------------------------------------------------
 * Default & Interactive
 * -------------------------------------------------------------------------- */

export const Default: Story = {
  args: {
    children: "The quick brown fox jumps over the lazy dog.",
    variant: "p",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas.getByText("The quick brown fox jumps over the lazy dog.")

    await expect(text).toBeInTheDocument()
  },
}

export const Interactive: Story = {
  args: {
    children: "Customize this text with the controls panel",
    variant: "h2",
    tone: "default",
    size: "inherit",
    weight: "inherit",
    align: "inherit",
  },
}

/* -----------------------------------------------------------------------------
 * Heading Variants
 * -------------------------------------------------------------------------- */

export const Headings: Story = {
  render: () => (
    <div className="space-y-4">
      <H1>Heading 1 - The quick brown fox</H1>
      <H2>Heading 2 - The quick brown fox</H2>
      <H3>Heading 3 - The quick brown fox</H3>
      <H4>Heading 4 - The quick brown fox</H4>
    </div>
  ),
}

export const Heading1: Story = {
  render: () => <H1>This is a Heading 1</H1>,
}

export const Heading2: Story = {
  render: () => <H2>This is a Heading 2</H2>,
}

export const Heading3: Story = {
  render: () => <H3>This is a Heading 3</H3>,
}

export const Heading4: Story = {
  render: () => <H4>This is a Heading 4</H4>,
}

/* -----------------------------------------------------------------------------
 * Paragraph Variants
 * -------------------------------------------------------------------------- */

export const ParagraphVariants: Story = {
  render: () => (
    <div className="space-y-6 max-w-prose">
      <Lead>
        This is a lead paragraph. It&apos;s typically used as an introductory text with larger,
        muted styling to draw attention.
      </Lead>
      <Paragraph>
        This is a standard paragraph. It has comfortable line height for extended reading. Lorem
        ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
        labore et dolore magna aliqua.
      </Paragraph>
      <Large>This is large text, useful for emphasis or subheadings.</Large>
      <Small>This is small text, perfect for captions or metadata.</Small>
      <Muted>This is muted text, great for secondary information or hints.</Muted>
    </div>
  ),
}

export const LeadParagraph: Story = {
  render: () => (
    <Lead>
      A design system is a collection of reusable components, guided by clear standards, that can be
      assembled together to build any number of applications.
    </Lead>
  ),
}

export const MutedText: Story = {
  render: () => <Muted>Enter your email address to receive notifications.</Muted>,
}

/* -----------------------------------------------------------------------------
 * Tone Variants
 * -------------------------------------------------------------------------- */

export const Tones: Story = {
  render: () => (
    <div className="space-y-2">
      <Typography tone="default">Default tone - standard text color</Typography>
      <Typography tone="muted">Muted tone - secondary text color</Typography>
      <Typography tone="primary">Primary tone - brand color</Typography>
      <Typography tone="secondary">Secondary tone - accent color</Typography>
      <Typography tone="destructive">Destructive tone - error/danger color</Typography>
      <Typography tone="success">Success tone - positive color</Typography>
      <Typography tone="warning">Warning tone - caution color</Typography>
    </div>
  ),
}

/* -----------------------------------------------------------------------------
 * Size Variants
 * -------------------------------------------------------------------------- */

export const Sizes: Story = {
  render: () => (
    <div className="space-y-2">
      <Typography size="xs">Extra small text (xs)</Typography>
      <Typography size="sm">Small text (sm)</Typography>
      <Typography size="base">Base text (base)</Typography>
      <Typography size="lg">Large text (lg)</Typography>
      <Typography size="xl">Extra large text (xl)</Typography>
      <Typography size="2xl">2XL text</Typography>
      <Typography size="3xl">3XL text</Typography>
      <Typography size="4xl">4XL text</Typography>
    </div>
  ),
}

/* -----------------------------------------------------------------------------
 * Weight Variants
 * -------------------------------------------------------------------------- */

export const Weights: Story = {
  render: () => (
    <div className="space-y-2">
      <Typography weight="normal">Normal weight</Typography>
      <Typography weight="medium">Medium weight</Typography>
      <Typography weight="semibold">Semibold weight</Typography>
      <Typography weight="bold">Bold weight</Typography>
      <Typography weight="extrabold">Extrabold weight</Typography>
    </div>
  ),
}

/* -----------------------------------------------------------------------------
 * Alignment
 * -------------------------------------------------------------------------- */

export const Alignment: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-md border p-4 rounded-lg">
      <Typography align="left">Left aligned text</Typography>
      <Typography align="center">Center aligned text</Typography>
      <Typography align="right">Right aligned text</Typography>
      <Typography align="justify">
        Justified text spreads words evenly across each line. This is most noticeable with longer
        paragraphs that span multiple lines.
      </Typography>
    </div>
  ),
}

/* -----------------------------------------------------------------------------
 * Blockquote & Code
 * -------------------------------------------------------------------------- */

export const BlockquoteExample: Story = {
  render: () => (
    <Blockquote>
      &ldquo;Design is not just what it looks like and feels like. Design is how it works.&rdquo;
      <br />
      <Small>— Steve Jobs</Small>
    </Blockquote>
  ),
}

export const InlineCodeExample: Story = {
  render: () => (
    <Paragraph>
      Run <InlineCode>npm install</InlineCode> to install dependencies, then{" "}
      <InlineCode>npm run dev</InlineCode> to start the development server.
    </Paragraph>
  ),
}

/* -----------------------------------------------------------------------------
 * Lists
 * -------------------------------------------------------------------------- */

export const UnorderedList: Story = {
  render: () => (
    <List>
      <ListItem>First item in the list</ListItem>
      <ListItem>Second item with more content</ListItem>
      <ListItem>Third item</ListItem>
      <ListItem>Fourth and final item</ListItem>
    </List>
  ),
}

export const OrderedList: Story = {
  render: () => (
    <List ordered>
      <ListItem>Clone the repository</ListItem>
      <ListItem>Install dependencies</ListItem>
      <ListItem>Configure environment variables</ListItem>
      <ListItem>Start the development server</ListItem>
    </List>
  ),
}

/* -----------------------------------------------------------------------------
 * Complete Example
 * -------------------------------------------------------------------------- */

export const CompleteExample: Story = {
  render: () => (
    <article className="max-w-prose space-y-0">
      <H1>Getting Started with the Design System</H1>
      <Lead>
        A comprehensive guide to using our typography components for building consistent and
        accessible user interfaces.
      </Lead>

      <H2>Introduction</H2>
      <Paragraph>
        Typography is one of the most important aspects of any design system. It helps establish
        visual hierarchy, guide users through content, and create a cohesive brand experience.
      </Paragraph>

      <H3>Key Features</H3>
      <List>
        <ListItem>Semantic HTML elements for accessibility</ListItem>
        <ListItem>Flexible variant system with CVA</ListItem>
        <ListItem>Dark mode support out of the box</ListItem>
        <ListItem>Responsive sizing with Tailwind</ListItem>
      </List>

      <Blockquote>
        &ldquo;Good typography is invisible. Bad typography is everywhere.&rdquo;
        <br />
        <Small>— Oliver Reichenstein</Small>
      </Blockquote>

      <H3>Installation</H3>
      <Paragraph>
        Import the components from <InlineCode>@repo/ui/components/typography</InlineCode> and start
        using them in your application.
      </Paragraph>

      <Muted>Last updated: January 2026</Muted>
    </article>
  ),
}

/* -----------------------------------------------------------------------------
 * Polymorphic Usage
 * -------------------------------------------------------------------------- */

export const PolymorphicAs: Story = {
  render: () => (
    <div className="space-y-4">
      <Typography variant="h2" as="span">
        H2 styling rendered as span
      </Typography>
      <Typography variant="p" as="div">
        Paragraph styling rendered as div
      </Typography>
      <Typography variant="small" as="label">
        Small styling rendered as label
      </Typography>
    </div>
  ),
}

export const AsChildComposition: Story = {
  render: () => (
    <H2 asChild tone="primary">
      <a href="https://example.com" className="hover:underline">
        This heading is actually a link
      </a>
    </H2>
  ),
}
