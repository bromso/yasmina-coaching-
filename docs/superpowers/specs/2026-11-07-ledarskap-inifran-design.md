# Ledarskap inifrån: nytt tjänstespår på www

Datum: 2026-11-07. Status: godkänd av beställaren 2026-11-07.

## Avsikt

Yasmina Petersson (socionom, psykoterapi steg 1, systemisk/narrativ utbildning, åtta år som
enhetschef, internationellt certifierad yogalärare 200 h + 50 h yin yoga) vill erbjuda personlig
utveckling på djupet, med yogans filosofi som grund, bredvid dagens ledarskapscoachning. Bärande
tanke: **starkt ledarskap börjar från insidan.**

Det en klient ska gå därifrån med (beställarens ord): stärkt, självsäkrare, större tro på sig själv
och sin förmåga, har hittat sin egen kärna, mer grundad i sina beslut, autentisk (värderingar och
handlingar hänger ihop), har hittat sitt eget och litar på det.

Arbetet ska bli undersidor som senare kan kopplas till något en klient köper.

## Mål

1. Ett nytt spår på www med egen startsida och fyra tjänstesidor.
2. Varje tjänst beskrivs som ett köpbart paket enligt en gemensam modell (start + löpande).
3. Den första delen av varje paket går att boka i den befintliga bokningen redan nu.
4. Påståenden om effekt vilar på forskning som är kontrollerad och redovisas med källor.
5. Sidorna finns på svenska (standard) och engelska, som resten av www.

## Icke-mål

- Ingen betalning byggs nu. Datamodellen ska göra det lätt att koppla på senare (en
  `OfferingKey` per köpbar sak, så att ett pris eller en Stripe-produkt kan knytas till nyckeln).
- Inga yogapass eller klasser som produkt. Yogans praktik är ett verktyg i samtalen, inte träning.
- Inget nytt bokningssystem: allt går genom dagens `booking.*` i api:t.

## Anti-mål (gör inte det här, även om det fungerar tekniskt)

- **Inga hälso- eller behandlingslöften.** Det här är coachning och utveckling, inte terapi eller
  vård. Sidorna lovar inte att bota stress, utbrändhet, ångest eller depression, och hänvisar till
  vården när någon behöver behandling.
- **Inget flum.** Yogafilosofin presenteras konkret och jordnära. Sanskrittermer förklaras med ett
  vardagligt ord första gången (t.ex. *svadhyaya*, självstudier), och används sparsamt.
- **Inga överdrivna forskningsanspråk.** Inga löften om effekter på klientens medarbetare eller team
  (forskningen visar inte det). Samband beskrivs som samband, inte som orsak.
- **Inget "ju längre desto bättre".** Forskningen visar inte att fler sessioner i sig ger större
  effekt; det är tydliga mål och regelbunden uppföljning som bär.

## Vad forskningen bär (underlag för texterna)

Kontrollerat i Consensus 2026-11-07. Texterna får säga ungefär detta, med källor på sidan
"Så vet vi" (se nedan):

- Coachning ger tydliga effekter på måluppfyllelse och självförmåga (Wang m.fl. 2021, g = 1,29
  resp. 0,59; de Haan m.fl. 2023, 37 RCT, g = 0,59; Theeboom m.fl. 2014). Integrerade upplägg som
  kombinerar flera metoder ger något större effekt än en enda metod (Wang m.fl. 2021).
- Effekten verkar inte växa med antal sessioner eller längd i sig (Jones m.fl. 2016; de Haan m.fl.
  2023; Nicolau m.fl. 2023).
- Mindfulnessträning minskar upplevd stress och ångest och ökar välmående (Bartlett m.fl. 2019,
  metaanalys av 23 RCT). Yoga på arbetsplatsen minskar upplevd stress (Valle m.fl. 2020).
- För ledare: sex veckors mindfulnessbaserad självledarskapsträning ökade självförmåga, resiliens
  och självledarskap i en RCT med 128 ledare (Tenschert m.fl. 2026). Översikter visar bättre
  självreglering men varierande kvalitet och inga belägg för effekter på medarbetarna
  (Donaldson-Feilder m.fl. 2018; Urrila 2021; Tenschert m.fl. 2024).
- Upplevd autenticitet hänger ihop med välmående (r = 0,40) och arbetsengagemang (r = 0,37) i en
  metaanalys med 75 studier och 36 533 deltagare (Sutton 2020). Mål som stämmer med egna värderingar
  uppnås oftare och ger mer välmående (Sheldon m.fl. 2001). Begreppet autenticitet är omdiskuterat
  (Jongman-Sereno & Leary 2019) — skriv om att leva i linje med sina värderingar snarare än om ett
  "sant jag".

Fullständiga referenser och länkar: se slutet av dokumentet.

## Informationsarkitektur

Startsida för spåret: **Ledarskap inifrån** (en: *Leading from within*), rubrikidé "Starkt
ledarskap börjar från insidan".

| Sida | Sökväg | Innehåll |
|---|---|---|
| Spårets startsida | `/inifran` | Grundtanken, vad klienten går därifrån med, hur yogan används, de fyra tjänsterna, modellen start + löpande, Yasminas yogacertifiering, länk till "Så vet vi" |
| Transformativ coachning | `/inifran/coachning` | Enskild coachning för ledare och privatpersoner: kärna, värderingar, beslut, självförtroende |
| Mentorskap | `/inifran/mentorskap` | Längre relation, glesare och längre träffar, erfarenhet från tjugo år i yrket |
| Livsstilsförändring | `/inifran/livsstil` | Vanor, återhämtning och stress, med en personlig övningsplan (andning, yin, meditation, visualisering) |
| Inifrån-gruppen | `/inifran/grupp` | Löpande grupp: yogafilosofi, praktik och samtal om ledarskap och liv |
| Så vet vi | `/inifran/forskning` | Vad forskningen säger och inte säger, med källor |

Sökvägarna är svenska och desamma på båda språken (språket styrs av cookien, som i dag).

"Helhetsorienterad personlig utveckling", "förena yoga och ledarskap" och "transformativ coachning"
är teman för hela spåret och syns i startsidans text; de blir inte egna produkter, eftersom de inte
går att skilja från de fyra tjänsterna utan att dubblera dem.

### Yogan i praktiken (samma på alla tjänstesidor)

Kärnan är samtalet. Yogans principer är ramverket, till exempel *yamas* och *niyamas* som
värderingsarbete, *svadhyaya* (självstudier) som reflektion och *dharma* som riktning. Övningar
(andning, kort rörelse, yin, meditation, visualisering) används när de hjälper klienten att landa
och känna efter, aldrig som prestation. Inga förkunskaper i yoga krävs.

## Paket och betalningsmodell

Gemensam modell (beställarens: "så länge en klient betalar och mål inte uppnås så fortsätter
coachningen"):

- **Startpaket** (engångs): ett längre första samtal (90 min) där målen sätts och skrivs ned, och en
  plan för uppföljning.
- **Löpande medlemskap** (per månad): ett fast antal träffar i månaden. Avstämning mot målen var
  tredje månad, där målen kan revideras.
- **Avslut**: när målen är nådda eller när klienten vill. Ingen bindningstid efter startpaketet.

| Tjänst | Startpaket | Löpande per månad |
|---|---|---|
| Transformativ coachning | Startsamtal 90 min | 2 samtal à 60 min |
| Mentorskap | Startsamtal 90 min | 1 samtal à 90 min + kontakt via mejl mellan träffarna |
| Livsstilsförändring | Startsamtal 90 min + personlig övningsplan | 2 samtal à 60 min, planen revideras |
| Inifrån-gruppen | (inget) | 2 gruppträffar à 120 min |

Platser: i Varberg eller på video för enskilt; grupp i Varberg eller på video (per tillfälle).
Målgrupp: både privatpersoner och de som får det betalt av arbetsgivare.

**Priser: se Öppna frågor.** Sidan visar ett pris per startpaket och per månad om de finns, annars
raden "Pris bekräftas skriftligt före första samtalet" som i dag.

## Bokning (kopplingen till något köpbart)

Nya nycklar i `OFFERINGS` (`packages/api-contract/src/booking-limits.ts`), så att varje köpbar del
har en egen nyckel som betalning senare kan kopplas till:

| Nyckel | Typ | Längd | Används till |
|---|---|---|---|
| `inner_start_coaching` | instant | 90 min | Startpaket, transformativ coachning |
| `inner_start_mentoring` | instant | 90 min | Startpaket, mentorskap |
| `inner_start_lifestyle` | instant | 90 min | Startpaket, livsstilsförändring |
| `inner_session` | instant | 60 min | Löpande samtal för medlemmar (coachning, livsstil) |
| `inner_mentoring_session` | instant | 90 min | Löpande mentorssamtal |
| `inner_group` | group | 120 min | Inifrån-gruppens träffar (Yasmina lägger ut dem som gruppevent, gärna som veckoserie) |

Audiences: `private` och `organisation`. Locations: `varberg`, `video`.

**Gruppträffar hålls isär (mitt beslut).** I dag saknar `group_events` en kolumn för vilket
erbjudande en träff hör till, så `booking.groupEvents` listar alla träffar. En ny migration lägger
till `group_events.offering` (standard `group` för befintliga rader); kontraktet, adminformuläret i
`apps/auth` (`/admin/bookings/groups`, ett val "Gruppcoachning / Inifrån-gruppen") och
`booking.groupEvents` (filter per erbjudande) följer med. Det är en utökning av dagens bokning, inte
ett nytt system. Inifrån-gruppen finns bredvid dagens gruppcoachning, ersätter den inte.

**Medlemssamtalen är öppna men dolda (mitt beslut).** `inner_session` och
`inner_mentoring_session` är `instant` och går att boka för den som har länken; de visas inte i
`/book`-katalogen, märks "för dig som redan är med" och länkas från tjänstesidorna och
bekräftelsemejlet efter startsamtalet. Ingen spärr byggs nu: Yasmina kan avboka en bokning från
någon som inte är medlem i adminkalendern. Spärr (medlemslista per mejladress) kommer med betalningen.

Varje tjänstesida har "Boka startsamtal" som primär knapp (till `/book/<startnyckel>`) och
"Är du redan med? Boka ditt nästa samtal" som sekundär. Gruppsidan länkar till `/book/inner_group`.
Medlemskapet i sig sätts upp manuellt av Yasmina efter startsamtalet tills betalning finns.

Bokningskatalogen `/book` får en egen rubrik för spåret så att de nya nycklarna inte blandas med
ledarskapscoachningen.

## Design

Samma uttryck som resten av www (kräm/kol, Fraunces-rubriker, rundade kort, solglöd, mjuka
reveal-rörelser som respekterar reduced motion). Startsidan för spåret följer hemsidans rytm: hero
med foto, ett citat/påstående, de fyra tjänsterna som fotokort, "yogan i praktiken", modellen
start + löpande som en enkel tidslinje, certifieringen, FAQ, CTA.

Bilder: i första hand befintliga (`portrait-park`, `portrait-outdoors`, `session-lounge`,
`portrait-study`). Nya bilder med lugn/natur/yoga-känsla får genereras eller hämtas om det behövs,
med samma konvertering som i dag (JPEG + WebP, två storlekar, originalen i `assets/originals/`).

Navigation: "Inifrån" läggs till i `NAV` och dess fyra tjänster i navigationens karusell.
Hemsidan får en kort sektion som presenterar spåret och länkar till `/inifran`.

## Språk

Allt innehåll i två språk med samma form (`Record<Locale, …>`), svenska som standard, enligt
mönstret i `src/content/home.tsx` och `booking.tsx`. Ton: varm, rak, "du", inga utropstecken, inga
AI-klichéer (se copywriting-skillens regler).

## Kvalitet

- Varje ny sida i a11y-manifestet (`apps/e2e/a11y/routes.ts`) och i `PUBLIC_ROUTES`.
- Bundle-budgetar för nya routes läggs till via `perf:update` med granskad diff.
- Inget scrollar i sidled vid 320 px. Innehållstester: sv/en har samma nycklar, inga "!".
- E2E: en resa från `/inifran` till en tjänstesida och vidare till bokning av startsamtal.
- `docs/architecture/booking.md` och www-README uppdateras med de nya nycklarna och sidorna.

## Beslut jag har tagit (beställaren kan ändra)

- Namnet "Ledarskap inifrån" / "Leading from within" och sökvägen `/inifran`.
- Fyra tjänster; "helhet", "transformativ" och "yoga + ledarskap" som teman, inte produkter.
- Paketinnehållet i tabellen ovan (antal och längd på träffar).
- Startsamtal 90 min för alla enskilda tjänster.
- En gemensam forskningssida i stället för forskningsrutor på varje sida.

## Beställarens svar (2026-11-07)

1. **Startsamtalet är betalt och är första steget** på spårets sidor. Det kostnadsfria
   introsamtalet finns kvar för ledarskapscoachningen men används inte här. (Tolkning av "Ja".)
2. **Pris: ca 1 200 kr per timme**, ändrat samma dag till **1 500 kr per timme**, med rabatt beroende på vad som ingår och hur mycket som köps.
3. **Yogacertifieringen är via Yoga Alliance.**
4. **Besluten ovan är godkända** (namn, `/inifran`, fyra tjänster, paketinnehåll).

## Priser (beräknade från 1 500 kr/h)

Grundregel: 1 500 kr per timme (beställarens ändring 2026-11-07, ersätter 1 200 kr/h). Rabatten
växer med åtagandet:

| Köp | Rabatt |
|---|---|
| Enstaka timme, startsamtal | 0 % |
| Löpande medlemskap per månad | 10 % |
| Förbetalt tre månader | 15 % |

| Paket | Timmar | Pris |
|---|---|---|
| Startsamtal (alla enskilda tjänster) | 1,5 | 2 250 kr |
| Transformativ coachning, per månad | 2 | 2 700 kr (3 mån förbetalt: 7 650 kr) |
| Mentorskap, per månad | 1,5 + mejlkontakt | 2 025 kr (3 mån: 5 738 kr) |
| Livsstilsförändring, per månad (övningsplan ingår) | 2 | 2 700 kr (3 mån: 7 650 kr) |
| Inifrån-gruppen, per person och månad | 4 (i grupp) | 1 980 kr (3 mån: 5 610 kr) |

Priserna räknas i koden från timpris och rabatt (en funktion i innehållsfilen), så att en ändring
av timpriset eller en rabattnivå slår igenom överallt; belopp avrundas till hela kronor. Visas med
"inkl. moms" för privatpersoner; för organisationer står samma belopp "exkl. moms" (se tolkningar).

Certifieringen skrivs "Certifierad yogalärare, registrerad hos Yoga Alliance (200 timmar), med 50
timmar fördjupning i yin yoga". Inget år och ingen skola anges.

## Tolkningar att bekräfta

- Gruppens pris per person (1 980 kr/mån) är mitt förslag: 550 kr per person och timme, eftersom
  1 500 kr/h gäller enskilt.
- 1 500 kr/h tolkas som priset privatpersoner betalar, inklusive moms.
- Rabattnivåerna 10 % och 15 % är mitt förslag.

## Referenser

Kontrollerade mot Crossref 2026-11-07. Årtalen är tryckår; i texten ovan står ibland år för publicering online.

1. Wang, Q., Lai, Y.-L., Xu, X. & McDowall, A. (2022). The effectiveness of workplace coaching: a meta-analysis of contemporary psychologically informed coaching approaches. Journal of Work-Applied Management, 14(1), 77–101. <https://doi.org/10.1108/JWAM-04-2021-0030>
2. de Haan, E. & Nilsson, V. O. (2023). What can we know about the effectiveness of coaching? A meta-analysis based only on randomized controlled trials. Academy of Management Learning & Education, 22(4), 641–661. <https://doi.org/10.5465/amle.2022.0107>
3. Theeboom, T., Beersma, B. & van Vianen, A. E. M. (2014). Does coaching work? A meta-analysis on the effects of coaching on individual level outcomes in an organizational context. The Journal of Positive Psychology, 9(1), 1–18. <https://doi.org/10.1080/17439760.2013.837499>
4. Jones, R. J., Woods, S. A. & Guillaume, Y. R. F. (2016). The effectiveness of workplace coaching: a meta-analysis of learning and performance outcomes from coaching. Journal of Occupational and Organizational Psychology, 89(2), 249–277. <https://doi.org/10.1111/joop.12119>
5. Nicolau, A., Candel, O. S., Constantin, T. & Kleingeld, A. (2023). The effects of executive coaching on behaviors, attitudes, and personal characteristics: a meta-analysis of randomized control trial studies. Frontiers in Psychology, 14, 1089797. <https://doi.org/10.3389/fpsyg.2023.1089797>
6. Bartlett, L., Martin, A., Neil, A. L., Memish, K., Otahal, P., Kilpatrick, M. & Sanderson, K. (2019). A systematic review and meta-analysis of workplace mindfulness training randomized controlled trials. Journal of Occupational Health Psychology, 24(1), 108–126. <https://doi.org/10.1037/ocp0000146>
7. Della Valle, E., Palermi, S., Aloe, I., Marcantonio, R., Spera, R., Montagnani, S. & Sirico, F. (2020). Effectiveness of workplace yoga interventions to reduce perceived stress in employees: a systematic review and meta-analysis. Journal of Functional Morphology and Kinesiology, 5(2), 33. <https://doi.org/10.3390/jfmk5020033>
8. Tenschert, J., Liegl, S., Peters, M. & Furtner, M. (2026). Mindfulness-based self-leadership training to enhance leaders' self-efficacy and resilience: a randomised controlled intervention study. Leadership & Organization Development Journal, 47(8), 1565–1589. <https://doi.org/10.1108/lodj-05-2025-0394>
9. Donaldson-Feilder, E., Lewis, R. & Yarker, J. (2019). What outcomes have mindfulness and meditation interventions for managers and leaders achieved? A systematic review. European Journal of Work and Organizational Psychology, 28(1), 11–29. <https://doi.org/10.1080/1359432X.2018.1542379>
10. Urrila, L. I. (2022). From personal wellbeing to relationships: a systematic review on the impact of mindfulness interventions and practices on leaders. Human Resource Management Review, 32(3), 100837. <https://doi.org/10.1016/j.hrmr.2021.100837>
11. Tenschert, J., Furtner, M. & Peters, M. (2025). The effects of self-leadership and mindfulness training on leadership development: a systematic review. Management Review Quarterly, 75(4), 2811–2862. <https://doi.org/10.1007/s11301-024-00448-7>
12. Sutton, A. (2020). Living the good life: a meta-analysis of authenticity, well-being and engagement. Personality and Individual Differences, 153, 109645. <https://doi.org/10.1016/j.paid.2019.109645>
13. Sheldon, K. M. & Houser-Marko, L. (2001). Self-concordance, goal attainment, and the pursuit of happiness: can there be an upward spiral? Journal of Personality and Social Psychology, 80(1), 152–165. <https://doi.org/10.1037/0022-3514.80.1.152>
14. Jongman-Sereno, K. P. & Leary, M. R. (2019). The enigma of being yourself: a critical examination of the concept of authenticity. Review of General Psychology, 23(1), 133–142. <https://doi.org/10.1037/gpr0000157>
