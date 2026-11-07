# nextjs-route-handlers output assertions

For prompt "add a POST handler at /api/contact in apps/www that validates email":

- [ ] New file at `apps/www/src/app/api/contact/route.ts`
- [ ] Exports `async function POST(request: Request)`
- [ ] Validates input with Zod (`z.object({...}).safeParse(...)`)
- [ ] Returns `NextResponse.json(...)`
- [ ] On validation failure, returns 400 status

For prompt "create a server action with next-safe-action for newsletter signup":

- [ ] New file at `apps/www/src/lib/actions/newsletter.ts` (or similar)
- [ ] File starts with `"use server"`
- [ ] Uses `actionClient.schema(...).action(...)` pattern
- [ ] If `apps/www/src/lib/safe-action.ts` doesn't exist, it's created
- [ ] Action's `parsedInput` is used (not raw input)
