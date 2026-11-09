/**
 * The photos a post can use as its `cover`, copied from www's `public/media/` at 800 px on the
 * long side: `/media/<name>-800.jpg` (the `cover.src` to write) beside a `.webp` of the same name,
 * which the post page serves first. The alt text is www's own, in both languages; a post copies
 * the one in its language into `cover.alt`.
 */
export type CoverImage = {
  width: number
  height: number
  alt: { sv: string; en: string }
}

export const COVERS: Record<string, CoverImage> = {
  "portrait-office": {
    width: 597,
    height: 800,
    alt: {
      sv: "Yasmina Petersson i mörkblå kavaj ler mot kameran i ett ljust kontor med bokhylla och gröna växter bakom sig.",
      en: "Yasmina Petersson in a navy blazer smiles at the camera in a bright office with a bookcase and green plants behind her.",
    },
  },
  "portrait-study": {
    width: 597,
    height: 800,
    alt: {
      sv: "Yasmina Petersson sitter i ett arbetsrum med böcker, en tänd lampa och ett skrivbord vid fönstret, och ler.",
      en: "Yasmina Petersson sits in a study with books, a lit lamp and a desk by the window, smiling.",
    },
  },
  "portrait-park": {
    width: 597,
    height: 800,
    alt: {
      sv: "Yasmina Petersson i grön kavaj står i en lummig park med en gångväg bakom sig.",
      en: "Yasmina Petersson in a green blazer stands in a leafy park with a footpath behind her.",
    },
  },
  "portrait-outdoors": {
    width: 597,
    height: 800,
    alt: {
      sv: "Yasmina Petersson står utomhus framför en kontorsbyggnad med träd och ler mot kameran.",
      en: "Yasmina Petersson stands outdoors in front of an office building with trees and smiles at the camera.",
    },
  },
  "portrait-library": {
    width: 644,
    height: 800,
    alt: {
      sv: "Yasmina Petersson i mörkblå kavaj ler mot kameran i ett ljust bibliotek med bokhyllor och läsbord.",
      en: "Yasmina Petersson in a navy blazer smiles at the camera in a bright library with bookshelves and reading tables.",
    },
  },
  "session-lounge": {
    width: 800,
    height: 597,
    alt: {
      sv: "Yasmina Petersson lyssnar på en klient i ett coachingsamtal i ett ljust rum med fåtöljer, växter och två kaffekoppar på bordet.",
      en: "Yasmina Petersson listens to a client in a coaching session in a bright room with armchairs, plants and two coffee cups on the table.",
    },
  },
  "workshop-whiteboard": {
    width: 800,
    height: 600,
    alt: {
      sv: "Yasmina Petersson står vid en whiteboard full av lappar och leder en workshop för en grupp chefer runt bord.",
      en: "Yasmina Petersson stands at a whiteboard covered in notes and leads a workshop for a group of managers seated at tables.",
    },
  },
  "workshop-table": {
    width: 800,
    height: 447,
    alt: {
      sv: "Yasmina Petersson talar med en grupp som arbetar tillsammans runt ett bord i en verkstad.",
      en: "Yasmina Petersson talks with a group working together around a table in a workshop space.",
    },
  },
  "workshop-standing": {
    width: 800,
    height: 447,
    alt: {
      sv: "Yasmina Petersson står lutad mot en arbetsbänk i en ljus verkstadslokal och ler.",
      en: "Yasmina Petersson leans against a workbench in a bright workshop space and smiles.",
    },
  },
  "keynote-stage": {
    width: 800,
    height: 447,
    alt: {
      sv: "Yasmina Petersson håller ett föredrag om framtidens ledarskap på en liten scen med träpanel och en skärm bakom sig.",
      en: "Yasmina Petersson gives a talk on the leadership of the future on a small wood-panelled stage with a screen behind her.",
    },
  },
  "keynote-audience": {
    width: 800,
    height: 597,
    alt: {
      sv: "Yasmina Petersson talar med headset framför en stor publik i en konferenssal.",
      en: "Yasmina Petersson speaks with a headset in front of a large audience in a conference hall.",
    },
  },
  "inner-meditation": {
    width: 800,
    height: 600,
    alt: {
      sv: "Yasmina Petersson sitter med korslagda ben på en dyna i ett ljust rum med trähyllor och en bonsai, med slutna ögon och händerna vilande på knäna.",
      en: "Yasmina Petersson sits cross-legged on a cushion in a bright room with wooden shelves and a bonsai, eyes closed and hands resting on her knees.",
    },
  },
  "inner-greenhouse": {
    width: 800,
    height: 600,
    alt: {
      sv: "Yasmina Petersson ler mot en klient vid ett träbord i ett växthus fullt av gröna växter, med en anteckningsbok i händerna.",
      en: "Yasmina Petersson smiles at a client across a wooden table in a greenhouse full of plants, holding a notebook.",
    },
  },
  "inner-cafe": {
    width: 800,
    height: 600,
    alt: {
      sv: "Yasmina Petersson lyssnar och ler mot en person mittemot sig vid ett bord på ett kafé, med en kaffekopp i handen.",
      en: "Yasmina Petersson listens and smiles at the person opposite her at a café table, a coffee cup in her hand.",
    },
  },
}

/** `/media/<name>-800.jpg` → its photo, or `undefined` for any other path. */
export function coverOf(src: string): (CoverImage & { webp: string }) | undefined {
  const name = src.match(/^\/media\/([a-z-]+)-800\.jpg$/)?.[1]
  const cover = name ? COVERS[name] : undefined
  return cover && name ? { ...cover, webp: `/media/${name}-800.webp` } : undefined
}
