import type { LegalSection } from "@repo/ui/blocks/legal-page"

/** Template privacy policy. Replace every `[Placeholder]` and have counsel review before publishing. */
export const privacy: { updatedAt: string; sections: LegalSection[] } = {
  updatedAt: "2026-10-21",
  sections: [
    {
      id: "what-we-collect",
      title: "What we collect",
      paragraphs: [
        "Account data: your email address, name and a hash of your password. Sign-in data: the browser and IP address of each session.",
        "Waitlist data: the email address you submit and where you submitted it.",
        "Support requests: the email address, optional name, topic, message and help-center page you submit through our contact form, plus a hash of your IP address used only to limit abuse.",
        "Job applications: if you apply for a role through our jobs site, we store your name, email address, optional link and note, and your CV, plus a hash of your IP address used only to limit abuse. Only our hiring team can view or download the CV. We keep an application for 6 months, after which it and the CV are deleted. An application is tied to the email address you applied with, not to any account, so deleting your account has no effect on an application you sent.",
        "Notifications: your account has an in-app notification inbox for things that happened to it — such as being invited to a workspace, a role change, or a workspace now requiring two-step verification — never another person's email address. Once you have read a notification it is deleted 30 days after it arrived, and every notification, read or not, is deleted 90 days after it arrived; your notifications are included in your data export. You can turn off the email copy of some of these — a role change, being removed from a workspace, or a workspace's plan changing — from your notification settings or the unsubscribe link in the email itself; emails that keep your account or workspaces working, such as an invitation or a required security step, always arrive.",
      ],
    },
    {
      id: "how-we-use-it",
      title: "How we use it",
      paragraphs: [
        "To run the services: signing you in, keeping your account secure and sending the emails you ask for, such as password resets.",
        "We do not send marketing email without your separate opt-in.",
      ],
    },
    {
      id: "sharing",
      title: "Sharing",
      paragraphs: [
        "[Company] does not sell personal data. We share it only with providers that host or deliver the services for us, under agreements that protect it.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      paragraphs: [
        "We keep account data while your account exists and delete it when you delete the account. Expired sessions are removed. Support requests are kept until an operator deletes them; the IP hash on a request is erased once it is resolved.",
      ],
    },
    {
      id: "audit-logs",
      title: "Audit logs",
      paragraphs: [
        "We keep an internal record of security-relevant actions on accounts and workspaces: who did what, when, any reason given, and, where available, network details (the IP address and browser of the session that did it).",
        "It covers every administrative change made to a workspace, whoever makes it — its creation, changes to its membership, members' roles and invitations (the invited address masked), its name and logo, a transfer of its ownership, a change of its plan, its API keys and webhooks, and whether it requires two-step verification — as well as actions our team takes through our admin tools (such as suspending an account, ending its sessions, resetting its two-step verification, removing its passkeys or handling a support request or job application); any change made to your account or workspace while a member of our support team is signed in as you; and certain changes to your own account that you or our systems make: a change of your sign-in email address, cancelling or undoing one (recorded with the old and new addresses masked), the deletion of your account once its grace period ends, and the removal of an unverified account when the owner of its email address takes that address back.",
        "A workspace's own admins and owners can see the last 90 days of these workspace changes from their account settings, including who made each one: the member's name and, while they are still a member of the workspace, their email address. A change our support team made while signed in as a member shows as that member's, marked \"by support\". That view never includes an IP address or browser. Admins and owners can also see whether each member currently has two-step verification or a passkey — yes or no only, never which method they use.",
        "By default we keep the network details for 90 days and the rest of the entry for 365 days, after which they are deleted. If we change these periods, we will update this section to say what they are.",
        "A backup taken before an entry is deleted may still hold a copy of it for as long as we keep that backup.",
      ],
    },
    {
      id: "your-rights",
      title: "Your rights",
      paragraphs: [
        "Depending on the law of [Jurisdiction], you may have the right to access, correct, export or delete your data, and to object to its use.",
        "You can request an export or delete your account any time from Data & privacy in your account settings — no need to write in for either. The export is a single file with your profile, sign-in methods and sessions, the workspaces you belong to, the email addresses of anyone you invited, your notes, your notifications, and your account's recent activity, including any reason a member of our support team gave for acting on your account. Deleting schedules your account for removal in 7 days — sign in again before then to cancel it — after which your account and this data are deleted, along with any workspace where you are the only member. Four things stay: notes you wrote in workspaces shared with others remain with that workspace, shown as written by a deleted user; the record of actions taken on your account (what was done, when, and any reason given) is kept without the link to your account; any support request you sent us keeps its address and message, de-linked from your account; and copies already held by the service providers we use, such as for payments, error reporting or analytics, are outside this deletion and follow those providers' own retention.",
        "Write to [Contact email] for anything this page does not cover.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      paragraphs: [
        "We use a session cookie to keep you signed in and a consent cookie to remember your cookie choice. Both are necessary. We do not use an analytics cookie — see Analytics below for what we record instead.",
      ],
    },
    {
      id: "analytics",
      title: "Analytics",
      paragraphs: [
        "We record which pages are visited and the product events that matter to running the service — such as signing up, verifying an email, creating a workspace, inviting someone or changing plan — in our own database. A visitor is counted with a one-day hash computed from an IP address and browser that are discarded immediately and never stored; only the hash is kept, and it cannot identify you or follow you from one day to the next. We also record the host of the site that referred you, never the full page you came from.",
        "Product events are recorded by our servers when you take the action, so they are linked to your account (and, where there is one, your workspace) whatever you choose in the cookie banner.",
        "What Accept all adds is your account and workspace id on your pageviews and on the events your browser sends, so we can see which pages a signed-in customer visits. With Necessary only, those stay anonymous.",
        "We never record an IP address, browser user agent, your name, email address or anything you type into a form as part of this.",
        "[Company] keeps this data for [90] days and keeps only daily totals after that. [We forward the same pageviews and events to [PostHog/Plausible] for our own dashboards, including the account-linked product events and, with Accept all, the ids on your pageviews — delete this sentence if you do not enable a provider.]",
      ],
    },
    {
      id: "api-access",
      title: "API access",
      paragraphs: [
        "A workspace's admins and owners can create API keys that let outside tools and scripts connect to that workspace. A key only does what the admin who created it chose to let it do: read the workspace's name, slug and plan; read members' user ids, names, roles and when they joined; or read and write notes, including their authors' names and ids — nothing is granted by default, and a key is never given access to email addresses.",
        "A connected tool acts as the workspace, not as any one person. The workspace — and whoever operates the tool it is connected to — is responsible for what that tool does and what it stores once it reads data through a key; this policy covers what we share with it, not what it does afterward.",
        "We keep a key's name, the scopes it was given, who created it, and when it was created, last used and expires or was revoked. We never store the key itself after it is created — only a one-way hash, so even we cannot read it back, plus a short prefix of it, shown to admins so they can recognise the key, which is useless on its own. An admin can revoke a key at any time, which stops it working immediately.",
        "A workspace's admins and owners can also register their own webhook endpoints: URLs we send a signed notification to whenever something they chose to subscribe to happens in that workspace — a note created, a member joining or leaving, a role changing, the workspace being renamed or its logo changed, an API key being created or revoked. What we send is the same information our API would return for that thing, never an email address, and only for the events the admin picked when they added the endpoint; nothing is sent by default.",
        "The endpoint is the admin's own choice of destination, and the workspace — and whoever operates whatever receives that endpoint's traffic — is responsible for what happens to the data once it arrives there, the same way as for an API key. We keep each endpoint's URL, the events it is subscribed to, who created it, and a short record of each delivery attempt (when, whether it succeeded, and why not if it did not), kept 30 days — never the body of what was sent or received. A notification that could not be delivered yet waits in our queue to be retried, and one that never got through is kept there, content included, for up to 30 days before it is deleted. We keep a signing secret for each endpoint so the receiver can confirm a notification really came from us; we store it so that it can be used to sign, and an admin can replace it. Deleting the endpoint, which an admin can do at any time, stops deliveries to it immediately.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: ["Questions about this policy: [Contact email], [Company]."],
    },
  ],
}
