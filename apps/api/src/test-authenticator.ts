// Test support only: nothing under src/index.ts imports this, so it is not bundled.
//
// A software WebAuthn authenticator that produces the exact bytes a browser hands back from
// `navigator.credentials.create()` / `.get()` — a P-256 key pair from WebCrypto, `none`
// attestation, real `clientDataJSON`, `authenticatorData` and DER-encoded ES256 signatures — so
// the api's passkey procedures run their real `@simplewebauthn/server` verification in tests,
// never a mock of it. Every knob a refusal test needs (origin, RP ID, flags, counter, user handle,
// challenge) is an option, so each test changes exactly one thing.
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { cose, isoBase64URL, isoCBOR, isoUint8Array } from "@simplewebauthn/server/helpers"

/** Where the test server's auth and account apps live (see `start()` in test-server.ts). */
export const TEST_AUTH_ORIGIN = "http://auth.example.com"
export const TEST_ACCOUNT_ORIGIN = "http://account.example.com"
/** The test server's relying party id. */
export const TEST_RP_ID = "example.com"

/** What the library's helpers take and return: bytes over a plain (never shared) ArrayBuffer. */
type Bytes = Uint8Array<ArrayBuffer>

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40

/** One credential held by the software authenticator: its key pair and its own counter. */
export type SoftCredential = {
  /** Base64url credential id (the `id` / `rawId` the browser reports). */
  id: string
  rawId: Bytes
  keyPair: CryptoKeyPair
  /** The user handle the relying party gave at registration (`options.user.id`, base64url). */
  userHandle: string
  /** The signature counter this authenticator reports next; 0 means "no counter" (passkeys). */
  counter: number
}

type CeremonyOptions = {
  /** `clientDataJSON.origin`; defaults to the auth app (sign-in) or account app (register). */
  origin?: string
  /** Hashed into `authenticatorData.rpIdHash`; defaults to the options' own RP id. */
  rpId?: string
  /** The user-verification flag; true by default (a passkey verifies its user). */
  userVerified?: boolean
  /** `clientDataJSON.challenge`; defaults to the options' own challenge. */
  challenge?: string
}

const sha256 = async (data: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data))

const uint32 = (value: number) => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value)
  return bytes
}

const encodeClientData = (
  type: "webauthn.create" | "webauthn.get",
  challenge: string,
  origin: string
) => isoUint8Array.fromUTF8String(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

/** The credential's public key as a COSE EC2 map — what `attestedCredentialData` carries. */
async function cosePublicKey(publicKey: CryptoKey): Promise<Bytes> {
  // Raw form: 0x04 || x (32 bytes) || y (32 bytes).
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey))
  const key = new Map<number, number | Bytes>([
    [cose.COSEKEYS.kty, cose.COSEKTY.EC2],
    [cose.COSEKEYS.alg, cose.COSEALG.ES256],
    [cose.COSEKEYS.crv, cose.COSECRV.P256],
    [cose.COSEKEYS.x, raw.slice(1, 33)],
    [cose.COSEKEYS.y, raw.slice(33, 65)],
  ])
  return isoCBOR.encode(key)
}

/** One DER INTEGER from a fixed-width big-endian value: leading zeros dropped, sign byte added. */
function derInteger(bytes: Bytes): Bytes {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  let body = bytes.slice(start)
  if ((body[0] ?? 0) & 0x80) body = isoUint8Array.concat([new Uint8Array([0]), body])
  return isoUint8Array.concat([new Uint8Array([0x02, body.length]), body])
}

/** WebCrypto's ECDSA signature is raw r || s; WebAuthn carries it as a DER SEQUENCE. */
export function derSignature(raw: Bytes): Bytes {
  const half = raw.length / 2
  const r = derInteger(raw.slice(0, half))
  const s = derInteger(raw.slice(half))
  return isoUint8Array.concat([new Uint8Array([0x30, r.length + s.length]), r, s])
}

async function authenticatorData(input: {
  rpId: string
  flags: number
  counter: number
  attested?: { rawId: Bytes; publicKey: Bytes }
}): Promise<Bytes> {
  const parts = [await sha256(isoUint8Array.fromUTF8String(input.rpId))]
  parts.push(new Uint8Array([input.flags]), uint32(input.counter))
  if (input.attested) {
    const { rawId, publicKey } = input.attested
    const length = new Uint8Array([(rawId.length >> 8) & 0xff, rawId.length & 0xff])
    // AAGUID all zeros: a `none` attestation names no authenticator model.
    parts.push(new Uint8Array(16), length, rawId, publicKey)
  }
  return isoUint8Array.concat(parts)
}

/**
 * What `navigator.credentials.create()` would answer for `options`: a brand-new credential
 * (returned alongside, for later assertions) and its `none`-attestation registration response.
 */
export async function createCredential(
  options: PublicKeyCredentialCreationOptionsJSON,
  ceremony: CeremonyOptions & {
    transports?: AuthenticatorTransportFuture[]
    /** Re-register this credential (its id and key pair) rather than mint a new one. */
    reuse?: SoftCredential
  } = {}
): Promise<{ credential: SoftCredential; response: RegistrationResponseJSON }> {
  const keyPair =
    ceremony.reuse?.keyPair ??
    ((await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair)
  const rawId = ceremony.reuse?.rawId ?? crypto.getRandomValues(new Uint8Array(16))
  const id = isoBase64URL.fromBuffer(rawId)
  const userVerified = ceremony.userVerified ?? true
  const authData = await authenticatorData({
    rpId: ceremony.rpId ?? options.rp.id ?? TEST_RP_ID,
    flags: FLAG_UP | FLAG_AT | (userVerified ? FLAG_UV : 0),
    counter: 0,
    attested: { rawId, publicKey: await cosePublicKey(keyPair.publicKey) },
  })
  const attestationObject = isoCBOR.encode(
    new Map<string, string | Bytes | Map<string, never>>([
      ["fmt", "none"],
      ["attStmt", new Map<string, never>()],
      ["authData", authData],
    ])
  )
  const clientData = encodeClientData(
    "webauthn.create",
    ceremony.challenge ?? options.challenge,
    ceremony.origin ?? TEST_ACCOUNT_ORIGIN
  )
  return {
    credential: { id, rawId, keyPair, userHandle: options.user.id, counter: 0 },
    response: {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientData),
        attestationObject: isoBase64URL.fromBuffer(attestationObject),
        transports: ceremony.transports ?? ["internal", "hybrid"],
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    },
  }
}

/**
 * What `navigator.credentials.get()` would answer for `options` with `credential`: a signed
 * assertion. `counter` overrides the credential's own (which is then left alone); otherwise the
 * credential's counter is reported as-is — 0 for a passkey that keeps none. `userHandle: null`
 * omits it; `sign` swaps in another key pair (a forgery).
 */
export async function getAssertion(
  options: PublicKeyCredentialRequestOptionsJSON,
  credential: SoftCredential,
  ceremony: CeremonyOptions & {
    counter?: number
    userHandle?: string | null
    signWith?: CryptoKeyPair
  } = {}
): Promise<AuthenticationResponseJSON> {
  const userVerified = ceremony.userVerified ?? true
  const authData = await authenticatorData({
    rpId: ceremony.rpId ?? options.rpId ?? TEST_RP_ID,
    flags: FLAG_UP | (userVerified ? FLAG_UV : 0),
    counter: ceremony.counter ?? credential.counter,
  })
  const clientData = encodeClientData(
    "webauthn.get",
    ceremony.challenge ?? options.challenge,
    ceremony.origin ?? TEST_AUTH_ORIGIN
  )
  const signed = isoUint8Array.concat([authData, await sha256(clientData)])
  const raw = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      (ceremony.signWith ?? credential.keyPair).privateKey,
      signed
    )
  )
  const userHandle =
    ceremony.userHandle === undefined ? credential.userHandle : (ceremony.userHandle ?? undefined)
  return {
    id: credential.id,
    rawId: credential.id,
    type: "public-key",
    response: {
      clientDataJSON: isoBase64URL.fromBuffer(clientData),
      authenticatorData: isoBase64URL.fromBuffer(authData),
      signature: isoBase64URL.fromBuffer(derSignature(raw)),
      ...(userHandle === undefined ? {} : { userHandle }),
    },
    clientExtensionResults: {},
    authenticatorAttachment: "platform",
  }
}
