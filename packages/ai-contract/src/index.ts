import { type ContractRouterClient, oc } from "@orpc/contract"
import { SummarizeInputSchema, SummarySchema } from "./summarize"

export * from "./chat"
export * from "./dev"
export * from "./summarize"

/**
 * Structured (non-chat) endpoints. apps/ai implements them; clients type themselves against this
 * contract. Chat is not here: it uses the AI SDK's own UI message stream at POST /chat.
 */
export const contract = {
  summarize: oc
    .route({ method: "POST", path: "/summarize", summary: "Summarize text" })
    .errors({
      GENERATION_FAILED: { status: 502, message: "The model could not produce a valid result" },
    })
    .input(SummarizeInputSchema)
    .output(SummarySchema),
}

export type Contract = typeof contract

/** Type for `createORPCClient(link)` pointed at apps/ai's /rpc. */
export type AiClient = ContractRouterClient<Contract>
