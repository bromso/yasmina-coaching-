import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@repo/ui/components/button"
import { Checkbox } from "@repo/ui/components/checkbox"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form"
import { Input } from "@repo/ui/components/input"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useForm } from "react-hook-form"
import { expect, userEvent, within } from "storybook/test"
import { z } from "zod"

const meta = {
  title: "Components/Inputs/Form",
  component: Form,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Form>

export default meta
// Every story renders its own form from `render` and takes no args, so stories are not bound
// to the component's required props.
type Story = StoryObj

const formSchema = z.object({
  username: z.string().min(2, {
    message: "Username must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
})

export const Default: Story = {
  render: function Render() {
    const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        username: "",
        email: "",
      },
    })

    function onSubmit(values: z.infer<typeof formSchema>) {
      console.log(values)
    }

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-[350px] space-y-6">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="johndoe" {...field} />
                </FormControl>
                <FormDescription>This is your public display name.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="john@example.com" type="email" {...field} />
                </FormControl>
                <FormDescription>We'll never share your email.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </form>
      </Form>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const usernameInput = canvas.getByPlaceholderText("johndoe")
    const emailInput = canvas.getByPlaceholderText("john@example.com")
    const submitButton = canvas.getByRole("button", { name: /submit/i })

    await expect(usernameInput).toBeInTheDocument()
    await expect(emailInput).toBeInTheDocument()

    await userEvent.type(usernameInput, "testuser")
    await userEvent.type(emailInput, "test@example.com")

    await expect(usernameInput).toHaveValue("testuser")
    await expect(emailInput).toHaveValue("test@example.com")
    await expect(submitButton).toBeEnabled()
  },
}

const checkboxFormSchema = z.object({
  terms: z.boolean().refine((value) => value === true, {
    message: "You must accept the terms and conditions.",
  }),
  newsletter: z.boolean().default(false),
})

export const WithCheckboxes: Story = {
  render: function Render() {
    // `newsletter` has a schema default, so the form's input type differs from its parsed output.
    const form = useForm<
      z.input<typeof checkboxFormSchema>,
      unknown,
      z.output<typeof checkboxFormSchema>
    >({
      resolver: zodResolver(checkboxFormSchema),
      defaultValues: {
        terms: false,
        newsletter: false,
      },
    })

    function onSubmit(values: z.output<typeof checkboxFormSchema>) {
      console.log(values)
    }

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-[350px] space-y-6">
          <FormField
            control={form.control}
            name="terms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Accept terms and conditions</FormLabel>
                  <FormDescription>
                    You agree to our Terms of Service and Privacy Policy.
                  </FormDescription>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newsletter"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Subscribe to newsletter</FormLabel>
                  <FormDescription>Get updates on new features and tips.</FormDescription>
                </div>
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </form>
      </Form>
    )
  },
}

const simpleSchema = z.object({
  name: z.string().min(1, "Name is required"),
})

export const WithValidation: Story = {
  render: function Render() {
    const form = useForm<z.infer<typeof simpleSchema>>({
      resolver: zodResolver(simpleSchema),
      defaultValues: {
        name: "",
      },
    })

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(() => {})} className="w-[350px] space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter your name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
          <p className="text-muted-foreground text-xs">
            Try submitting with an empty field to see validation.
          </p>
        </form>
      </Form>
    )
  },
}
