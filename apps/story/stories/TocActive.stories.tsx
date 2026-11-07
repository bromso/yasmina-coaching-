import { Toc } from "@repo/ui/blocks/toc"
import { TocActive } from "@repo/ui/blocks/toc-active"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "installation", title: "Installation" },
  { id: "usage", title: "Usage" },
]

type Position = "above" | "inside" | "below"

/** A top edge for each position, against the reading band (64px down to 30% of the viewport). */
const TOPS: Record<Position, number> = { above: -100, inside: 100, below: 5000 }

/**
 * A stand-in `IntersectionObserver` the play function drives. The test runner renders stories in
 * an iframe, where the real observer measures against the top-level viewport rather than the
 * story's own, so scrolling the story cannot be relied on to report anything. `report` pins each
 * heading's `getBoundingClientRect().top` (what `TocActive` measures) and fires the callback.
 * (The real observer and scrolling are covered by the docs e2e journey.)
 */
class FakeObserver {
  static current: FakeObserver | undefined
  readonly targets: Element[] = []
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.current = this
  }
  observe(target: Element) {
    this.targets.push(target)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
  /** Places every observed heading at the given position (unlisted ones below the band). */
  report(positions: Record<string, Position>) {
    for (const target of this.targets) {
      const top = TOPS[positions[target.id] ?? "below"]
      target.getBoundingClientRect = () => ({ top }) as DOMRect
    }
    this.callback([], this as unknown as IntersectionObserver)
  }
}

function Page() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_12rem] gap-8">
      <article>
        {sections.map((section) => (
          <section key={section.id}>
            <h2 id={section.id} className="font-semibold text-xl">
              {section.title}
            </h2>
            <p>Body text for {section.title.toLowerCase()}.</p>
          </section>
        ))}
      </article>
      <aside>
        <TocActive>
          <Toc
            items={sections.map((section) => ({
              title: section.title,
              url: `#${section.id}`,
              depth: 2,
            }))}
          />
        </TocActive>
      </aside>
    </div>
  )
}

const meta = {
  title: "Blocks/TocActive",
  component: Page,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Page>

export default meta
type Story = StoryObj<typeof meta>

/** Server-rendered (and before hydration) it is the plain Toc: no link is current. */
export const Default: Story = {}

/** The link of the section being read gets `aria-current="location"`, and only that one: the
 * first heading inside the reading band, else the last one scrolled past. */
export const HighlightsTheSectionBeingRead: Story = {
  beforeEach: () => {
    const real = window.IntersectionObserver
    window.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver
    return () => {
      window.IntersectionObserver = real
      FakeObserver.current = undefined
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = (name: string) => canvas.getByRole("link", { name })
    await waitFor(() => expect(FakeObserver.current?.targets).toHaveLength(3))
    const observer = FakeObserver.current as FakeObserver

    observer.report({ introduction: "inside", installation: "inside" })
    await expect(link("Introduction")).toHaveAttribute("aria-current", "location")
    await expect(link("Installation")).not.toHaveAttribute("aria-current")

    observer.report({ introduction: "above", installation: "above" })
    await expect(link("Installation")).toHaveAttribute("aria-current", "location")
    await expect(link("Introduction")).not.toHaveAttribute("aria-current")

    observer.report({ introduction: "above", installation: "above", usage: "inside" })
    await expect(link("Usage")).toHaveAttribute("aria-current", "location")
    await expect(canvasElement.querySelectorAll("[aria-current]")).toHaveLength(1)
  },
}
