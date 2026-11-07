import {
  FlipCard,
  type FlipCardData,
} from "@repo/ui/components/animate-ui/components/community/flip-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleUser: FlipCardData = {
  name: "Jane Doe",
  username: "janedoe",
  image: "https://i.pravatar.cc/150?u=janedoe",
  bio: "Full-stack developer passionate about building beautiful user interfaces and open-source software.",
  stats: {
    following: 245,
    followers: 1280,
    posts: 87,
  },
  socialLinks: {
    linkedin: "https://linkedin.com",
    github: "https://github.com",
    twitter: "https://twitter.com",
  },
}

const meta = {
  title: "Animate UI/Community/FlipCard",
  component: FlipCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    data: sampleUser,
  },
} satisfies Meta<typeof FlipCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithoutPosts: Story = {
  args: {
    data: {
      ...sampleUser,
      name: "Alex Smith",
      username: "alexsmith",
      image: "https://i.pravatar.cc/150?u=alexsmith",
      bio: "Designer and illustrator based in San Francisco.",
      stats: {
        following: 120,
        followers: 540,
      },
    },
  },
}

export const WithoutSocialLinks: Story = {
  args: {
    data: {
      ...sampleUser,
      name: "Sam Wilson",
      username: "samwilson",
      image: "https://i.pravatar.cc/150?u=samwilson",
      bio: "Minimalist at heart.",
      socialLinks: undefined,
    },
  },
}

export const PartialSocials: Story = {
  args: {
    data: {
      ...sampleUser,
      name: "Robin Chen",
      username: "robinchen",
      image: "https://i.pravatar.cc/150?u=robinchen",
      bio: "Open source contributor and coffee enthusiast.",
      socialLinks: {
        github: "https://github.com",
      },
    },
  },
}

export const LongBio: Story = {
  args: {
    data: {
      ...sampleUser,
      bio: "Full-stack developer with 10+ years of experience in React, TypeScript, and Node.js. Passionate about performance optimization, accessibility, and developer experience.",
    },
  },
}

export const MultipleCards: Story = {
  render: () => (
    <div className="flex gap-4">
      <FlipCard
        data={{
          name: "Alice",
          username: "alice",
          image: "https://i.pravatar.cc/150?u=alice",
          bio: "Frontend engineer",
          stats: { following: 100, followers: 500, posts: 30 },
          socialLinks: { github: "https://github.com" },
        }}
      />
      <FlipCard
        data={{
          name: "Bob",
          username: "bob",
          image: "https://i.pravatar.cc/150?u=bob",
          bio: "Backend developer",
          stats: { following: 200, followers: 800 },
          socialLinks: { twitter: "https://twitter.com" },
        }}
      />
    </div>
  ),
}
