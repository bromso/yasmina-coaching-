import type { OfferingKey } from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import type { InnerServiceId } from "@/content/inner-pricing"

/**
 * The photographs and the clips under `public/media/`, plus every visible string the media
 * components need (alt texts, the clip toggle's labels, a caption, two column headings), in
 * Swedish and English. `mediaFor(locale)` / `clipsFor(locale)` / `mediaTextFor(locale)` pick one
 * language per request; the views pass what they need down as props, so this module never
 * reaches the client bundle.
 *
 * Each photo exists as JPEG and WebP at its full size and with its long side at 800 px
 * (`<name>-800.<ext>`, so a portrait is 597 × 800);
 * `src/components/picture.tsx` builds the `<picture>` from the name. Re-export from
 * `assets/originals/` when a crop changes.
 */

export type MediaImage = {
  /** Base name under `/media/`, without extension or the `-800` suffix. */
  name: string
  width: number
  height: number
  /** The `-800` variant's pixel size. */
  small: { width: number; height: number }
  alt: string
}

export type MediaClip = {
  /** The MP4, no audio track. */
  src: string
  /** The still the `<video>` shows before it plays, JPEG for the `poster` attribute. */
  poster: MediaImage
  width: number
  height: number
}

/** The files themselves, the same in every language. */
const IMAGES = {
  portraitOffice: {
    name: "portrait-office",
    width: 896,
    height: 1200,
    small: { width: 597, height: 800 },
  },
  portraitStudy: {
    name: "portrait-study",
    width: 1195,
    height: 1600,
    small: { width: 597, height: 800 },
  },
  portraitPark: {
    name: "portrait-park",
    width: 1195,
    height: 1600,
    small: { width: 597, height: 800 },
  },
  portraitOutdoors: {
    name: "portrait-outdoors",
    width: 896,
    height: 1200,
    small: { width: 597, height: 800 },
  },
  sessionLounge: {
    name: "session-lounge",
    width: 1600,
    height: 1195,
    small: { width: 800, height: 597 },
  },
  workshopWhiteboard: {
    name: "workshop-whiteboard",
    width: 1195,
    height: 896,
    small: { width: 800, height: 600 },
  },
  workshopTable: {
    name: "workshop-table",
    width: 1376,
    height: 768,
    small: { width: 800, height: 447 },
  },
  workshopStanding: {
    name: "workshop-standing",
    width: 1376,
    height: 768,
    small: { width: 800, height: 447 },
  },
  keynoteStage: {
    name: "keynote-stage",
    width: 1600,
    height: 893,
    small: { width: 800, height: 447 },
  },
  keynoteAudience: {
    name: "keynote-audience",
    width: 1600,
    height: 1195,
    small: { width: 800, height: 597 },
  },
  heroPoster: {
    name: "hero-poster",
    width: 1280,
    height: 720,
    small: { width: 1280, height: 720 },
  },
  aboutPoster: {
    name: "about-poster",
    width: 720,
    height: 1280,
    small: { width: 720, height: 1280 },
  },
  innerConversationPoster: {
    name: "inner-conversation-poster",
    width: 1280,
    height: 720,
    small: { width: 1280, height: 720 },
  },
  innerGroupPoster: {
    name: "inner-group-poster",
    width: 1280,
    height: 720,
    small: { width: 1280, height: 720 },
  },
  keynotePoster: {
    name: "keynote-poster",
    width: 1280,
    height: 672,
    small: { width: 1280, height: 672 },
  },
} as const satisfies Record<string, Omit<MediaImage, "alt">>

export type MediaKey = keyof typeof IMAGES

/** Every photo's alt text, per language. */
const ALT: Record<Locale, Record<MediaKey, string>> = {
  sv: {
    portraitOffice:
      "Yasmina Petersson i mörkblå kavaj ler mot kameran i ett ljust kontor med bokhylla och gröna växter bakom sig.",
    portraitStudy:
      "Yasmina Petersson sitter i ett arbetsrum med böcker, en tänd lampa och ett skrivbord vid fönstret, och ler.",
    portraitPark: "Yasmina Petersson i grön kavaj står i en lummig park med en gångväg bakom sig.",
    portraitOutdoors:
      "Yasmina Petersson står utomhus framför en kontorsbyggnad med träd och ler mot kameran.",
    sessionLounge:
      "Yasmina Petersson lyssnar på en klient i ett coachingsamtal i ett ljust rum med fåtöljer, växter och två kaffekoppar på bordet.",
    workshopWhiteboard:
      "Yasmina Petersson står vid en whiteboard full av lappar och leder en workshop för en grupp chefer runt bord.",
    workshopTable:
      "Yasmina Petersson talar med en grupp som arbetar tillsammans runt ett bord i en verkstad.",
    workshopStanding:
      "Yasmina Petersson står lutad mot en arbetsbänk i en ljus verkstadslokal och ler.",
    keynoteStage:
      "Yasmina Petersson håller ett föredrag om framtidens ledarskap på en liten scen med träpanel och en skärm bakom sig.",
    keynoteAudience:
      "Yasmina Petersson talar med headset framför en stor publik i en konferenssal.",
    heroPoster: "En ljus lobby i trä och sten där Yasmina Petersson är på väg in.",
    aboutPoster: "Yasmina Petersson ler i en solig park.",
    innerConversationPoster:
      "Yasmina Petersson i samtal med en man vid ett bord i ett ljust rum med träpanel, växter och en tänd lampa.",
    innerGroupPoster:
      "Yasmina Petersson talar i en mikrofon till en liten grupp som sitter och lyssnar i en ljus lokal.",
    keynotePoster:
      "Yasmina Petersson talar i en mikrofon på en scen inför publik i en sal med träpanel.",
  },
  en: {
    portraitOffice:
      "Yasmina Petersson in a navy blazer smiles at the camera in a bright office with a bookcase and green plants behind her.",
    portraitStudy:
      "Yasmina Petersson sits in a study with books, a lit lamp and a desk by the window, smiling.",
    portraitPark:
      "Yasmina Petersson in a green blazer stands in a leafy park with a footpath behind her.",
    portraitOutdoors:
      "Yasmina Petersson stands outdoors in front of an office building with trees and smiles at the camera.",
    sessionLounge:
      "Yasmina Petersson listens to a client in a coaching session in a bright room with armchairs, plants and two coffee cups on the table.",
    workshopWhiteboard:
      "Yasmina Petersson stands at a whiteboard covered in notes and leads a workshop for a group of managers seated at tables.",
    workshopTable:
      "Yasmina Petersson talks with a group working together around a table in a workshop space.",
    workshopStanding:
      "Yasmina Petersson leans against a workbench in a bright workshop space and smiles.",
    keynoteStage:
      "Yasmina Petersson gives a talk on the leadership of the future on a small wood-panelled stage with a screen behind her.",
    keynoteAudience:
      "Yasmina Petersson speaks with a headset in front of a large audience in a conference hall.",
    heroPoster: "A bright lobby in wood and stone, which Yasmina Petersson is walking into.",
    aboutPoster: "Yasmina Petersson smiles in a sunny park.",
    innerConversationPoster:
      "Yasmina Petersson in conversation with a man at a table in a bright, wood-panelled room with plants and a lit lamp.",
    innerGroupPoster:
      "Yasmina Petersson speaks into a microphone to a small seated group listening in a bright room.",
    keynotePoster:
      "Yasmina Petersson speaks into a microphone on a stage before an audience in a wood-panelled hall.",
  },
}

/** Every photo with its alt text in `locale`. */
export function mediaFor(locale: Locale): Record<MediaKey, MediaImage> {
  const alt = ALT[locale]
  return Object.fromEntries(
    (Object.keys(IMAGES) as MediaKey[]).map((key) => [key, { ...IMAGES[key], alt: alt[key] }])
  ) as Record<MediaKey, MediaImage>
}

/** The clips, their posters' alt texts in `locale`. */
export function clipsFor(locale: Locale) {
  const media = mediaFor(locale)
  return {
    /** Yasmina walking into a bright lobby: the home hero's background. */
    hero: { src: "/media/hero.mp4", poster: media.heroPoster, width: 1280, height: 720 },
    /** Yasmina smiling in a park: the about section's portrait. */
    about: { src: "/media/about.mp4", poster: media.aboutPoster, width: 608, height: 1080 },
    /** Yasmina in a one-to-one conversation: the coaching and mentoring pages' hero. */
    innerConversation: {
      src: "/media/inner-conversation.mp4",
      poster: media.innerConversationPoster,
      width: 1280,
      height: 720,
    },
    /** Yasmina speaking to a small group: the Inifrån group page's hero. */
    innerGroup: {
      src: "/media/inner-group.mp4",
      poster: media.innerGroupPoster,
      width: 1280,
      height: 720,
    },
    /** Yasmina on stage before an audience: the keynote's booking page. */
    keynote: {
      src: "/media/keynote.mp4",
      poster: media.keynotePoster,
      width: 1280,
      height: 672,
    },
  } satisfies Record<string, MediaClip>
}

export type ClipKey = keyof ReturnType<typeof clipsFor>

/** A Ledarskap inifrån service page whose hero is a clip rather than its photo. */
export const INNER_CLIPS: Partial<Record<InnerServiceId, ClipKey>> = {
  coaching: "innerConversation",
  mentoring: "innerConversation",
  group: "innerGroup",
}

/** A booking page that opens on a clip rather than its photo (`OFFERING_MEDIA`). */
export const OFFERING_CLIPS: Partial<Record<OfferingKey, ClipKey>> = { keynote: "keynote" }

/** The photo on each offer card of the landing page, in `home.offers.items` order. */
export const OFFER_MEDIA: readonly MediaKey[] = [
  "sessionLounge",
  "workshopTable",
  "workshopWhiteboard",
  "keynoteAudience",
]

/** One photo per bookable offering: the `/book` card and the top of `/book/<key>`. */
export const OFFERING_MEDIA: Record<OfferingKey, MediaKey> = {
  session: "sessionLounge",
  package_6: "portraitStudy",
  package_10: "portraitOffice",
  group: "workshopTable",
  workshop: "workshopWhiteboard",
  enterprise: "workshopStanding",
  keynote: "keynoteStage",
  inner_start_coaching: "portraitPark",
  inner_start_mentoring: "portraitOutdoors",
  inner_start_lifestyle: "sessionLounge",
  inner_session: "portraitStudy",
  inner_mentoring_session: "portraitOffice",
  inner_group: "workshopTable",
}

/** The strings the media and section components show. */
export type MediaText = {
  /** The clip toggle (`aria-pressed` is on while it plays). */
  clip: { play: string; pause: string }
  /** Under the photo band below the statement. */
  statementCaption: string
  /** The manifesto section's accessible name. */
  manifestoLabel: string
  /** The two column headings of the credentials section. */
  credentials: { experience: string; training: string }
}

export const MEDIA_TEXT: Record<Locale, MediaText> = {
  sv: {
    clip: { play: "Spela upp filmen", pause: "Pausa filmen" },
    statementCaption: "Ett samtal i taget: i Varberg, eller på video.",
    manifestoLabel: "Varför coaching innan något går sönder",
    credentials: { experience: "Erfarenhet", training: "Utbildning" },
  },
  en: {
    clip: { play: "Play the film", pause: "Pause the film" },
    statementCaption: "One conversation at a time: in Varberg, or by video.",
    manifestoLabel: "Why coaching before something breaks",
    credentials: { experience: "Experience", training: "Training" },
  },
}

export const mediaTextFor = (locale: Locale): MediaText => MEDIA_TEXT[locale]
