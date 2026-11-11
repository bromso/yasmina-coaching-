import type { Locale } from "@repo/i18n/locales"
import type { LegalDoc } from "@/content/legal-notice"

/**
 * Template privacy policy, in Swedish (the site's default) and English: the same sections, facts
 * and placeholders in both, the Swedish written as Swedish privacy texts are (personuppgiftsansvarig,
 * rättslig grund, lagringstid, de registrerades rättigheter, IMY), not word for word. Replace every
 * `[Placeholder]` in both languages and have counsel review them before publishing.
 */
const en: LegalDoc = {
  title: "Privacy policy",
  metaTitle: "Privacy",
  updatedAt: "2026-11-11",
  sections: [
    {
      id: "what-we-collect",
      title: "What we collect",
      paragraphs: [
        "Account data: your email address, name and a hash of your password. Sign-in data: the browser and IP address of each session.",
        "Waitlist data: the email address you submit and where you submitted it.",
        "Support requests: the email address, optional name, topic, message and help-center page you submit through our contact form, plus a hash of your IP address used only to limit abuse.",
        "Contact requests: when you write through the contact page (/kontakt), we store who you are writing for (yourself or an organisation), what you want help with and how soon, the optional description of your situation, your name, email address, optional phone number, your organisation and role if you write for one, how you prefer to be contacted, the page you wrote from, the language of the page, when you gave your consent to be contacted about the request and whether you also ticked the separate newsletter box, plus a hash of your IP address used only to limit abuse. Only Yasmina and our team can see a request, together with the notes and the follow-up status they add to it. We use it only to answer you. A request is tied to the email address you wrote from, not to any account, and is deleted 12 months after it arrived — or sooner, at once, if you ask us to delete it by writing to [Contact email]. The newsletter choice is only stored: we do not send a newsletter today, and will ask again before we ever do.",
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
        "The legal basis for each purpose is [legal basis — for example the contract with you, your consent, or our legitimate interest in answering a request you sent], as counsel decides it.",
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
        "We keep account data while your account exists and delete it when you delete the account. Expired sessions are removed. Support requests are kept until an operator deletes them; the IP hash on a request is erased once it is resolved. Contact requests from the contact page are deleted automatically 12 months after they arrived.",
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
        "Depending on the law of [Jurisdiction], you may have the right to access, correct, export or delete your data, and to object to its use. You can also complain to the supervisory authority — in Sweden, the Swedish Authority for Privacy Protection (IMY).",
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
        "We record which pages are visited and the product events that matter to running the service — such as signing up, verifying an email, creating a workspace, inviting someone, changing plan or sending the contact form — in our own database. A visitor is counted with a one-day hash computed from an IP address and browser that are discarded immediately and never stored; only the hash is kept, and it cannot identify you or follow you from one day to the next. We also record the host of the site that referred you, never the full page you came from.",
        "Product events are recorded by our servers when you take the action, so they are linked to your account (and, where there is one, your workspace) whatever you choose in the cookie banner.",
        "Sending the contact form records one event with only the three choices you picked (who you are writing for, what you want help with and how soon) — never your name, email address, message or any account.",
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
      paragraphs: [
        "The data controller is [Company]. Questions about this policy: [Contact email], [Company].",
      ],
    },
  ],
}

const sv: LegalDoc = {
  title: "Integritetspolicy",
  metaTitle: "Integritet",
  updatedAt: "2026-11-11",
  sections: [
    {
      id: "what-we-collect",
      title: "Vilka personuppgifter vi samlar in",
      paragraphs: [
        "Kontouppgifter: din e-postadress, ditt namn och ett hashvärde av ditt lösenord. Inloggningsuppgifter: webbläsare och IP-adress för varje session.",
        "Väntelistan: den e-postadress du lämnar och var du lämnade den.",
        "Supportärenden: den e-postadress, det namn (frivilligt), det ämne, det meddelande och den sida i hjälpcentret som du skickar via vårt kontaktformulär, samt ett hashvärde av din IP-adress som bara används för att begränsa missbruk.",
        "Kontaktförfrågningar: när du skriver via kontaktsidan (/kontakt) sparar vi vem du skriver för (dig själv eller en organisation), vad du vill ha hjälp med och hur bråttom det är, den frivilliga beskrivningen av din situation, ditt namn, din e-postadress, ditt telefonnummer om du anger det, din organisation och roll om du skriver för en organisation, hur du helst vill bli kontaktad, vilken sida du skrev från, sidans språk, när du gav ditt samtycke till att bli kontaktad om förfrågan och om du även kryssade i den separata rutan för nyhetsbrev, samt ett hashvärde av din IP-adress som bara används för att begränsa missbruk. Bara Yasmina och vårt team kan se en förfrågan, tillsammans med de anteckningar och den uppföljningsstatus de lägger till. Vi använder den bara för att svara dig. En förfrågan är knuten till den e-postadress du skrev från, inte till något konto, och raderas 12 månader efter att den kom in, eller tidigare, direkt, om du ber oss radera den genom att skriva till [Contact email]. Valet om nyhetsbrev sparas bara: vi skickar inget nyhetsbrev i dag, och vi frågar dig igen innan vi någonsin gör det.",
        "Jobbansökningar: om du söker en tjänst via vår jobbsida sparar vi ditt namn, din e-postadress, en länk och en kommentar om du anger dem, och ditt CV, samt ett hashvärde av din IP-adress som bara används för att begränsa missbruk. Bara de som rekryterar hos oss kan se eller ladda ned CV:t. Vi sparar en ansökan i 6 månader, sedan raderas den och CV:t. En ansökan är knuten till den e-postadress du sökte med, inte till något konto, så att radera ditt konto påverkar inte en ansökan du har skickat.",
        "Aviseringar: ditt konto har en inkorg för aviseringar om sådant som har hänt kontot, till exempel att du har bjudits in till en arbetsyta, att din roll har ändrats eller att en arbetsyta numera kräver tvåstegsverifiering, aldrig någon annans e-postadress. En avisering du har läst raderas 30 dagar efter att den kom, och varje avisering, läst eller inte, raderas 90 dagar efter att den kom. Dina aviseringar ingår i din dataexport. Du kan stänga av e-postkopian av vissa av dem, nämligen en ändrad roll, att du tas bort från en arbetsyta eller att en arbetsytas abonnemang ändras, i dina aviseringsinställningar eller via avregistreringslänken i själva mejlet. Mejl som behövs för att ditt konto eller dina arbetsytor ska fungera, som en inbjudan eller ett nödvändigt säkerhetssteg, kommer alltid fram.",
      ],
    },
    {
      id: "how-we-use-it",
      title: "Hur vi använder dem",
      paragraphs: [
        "För att driva tjänsterna: logga in dig, hålla ditt konto säkert och skicka de mejl du ber om, till exempel för att återställa lösenordet.",
        "Vi skickar inga marknadsföringsmejl utan ditt separata samtycke.",
        "Den rättsliga grunden för varje ändamål är [rättslig grund, till exempel avtalet med dig, ditt samtycke eller vårt berättigade intresse av att besvara en förfrågan du har skickat], så som en jurist bedömer det.",
      ],
    },
    {
      id: "sharing",
      title: "Vem vi delar dem med",
      paragraphs: [
        "[Company] säljer inte personuppgifter. Vi delar dem bara med leverantörer som driftar eller levererar tjänsterna åt oss (personuppgiftsbiträden), under avtal som skyddar uppgifterna.",
      ],
    },
    {
      id: "retention",
      title: "Lagringstid",
      paragraphs: [
        "Vi sparar kontouppgifter så länge ditt konto finns och raderar dem när du raderar kontot. Utgångna sessioner tas bort. Supportärenden sparas tills en administratör raderar dem; hashvärdet av IP-adressen tas bort när ärendet är löst. Kontaktförfrågningar från kontaktsidan raderas automatiskt 12 månader efter att de kom in.",
      ],
    },
    {
      id: "audit-logs",
      title: "Granskningsloggar",
      paragraphs: [
        "Vi för en intern logg över säkerhetsrelevanta händelser på konton och arbetsytor: vem som gjorde vad, när, eventuellt angivet skäl och, där de finns, nätverksuppgifter (IP-adressen och webbläsaren för den session som gjorde det).",
        "Den omfattar varje administrativ ändring av en arbetsyta, oavsett vem som gör den: att den skapas, ändringar av medlemskap, medlemmars roller och inbjudningar (den inbjudna adressen maskerad), dess namn och logotyp, att ägarskapet överlåts, att abonnemanget ändras, dess API-nycklar och webhooks och om den kräver tvåstegsverifiering. Den omfattar också åtgärder som vårt team gör i våra administrationsverktyg (till exempel att stänga av ett konto, avsluta dess sessioner, återställa dess tvåstegsverifiering, ta bort dess passkeys eller hantera ett supportärende eller en jobbansökan), varje ändring av ditt konto eller din arbetsyta medan någon i vårt supportteam är inloggad som du, och vissa ändringar av ditt eget konto som du eller våra system gör: att du byter e-postadress för inloggning, att ett sådant byte avbryts eller ångras (loggat med den gamla och den nya adressen maskerade), att ditt konto raderas när respitperioden har gått ut, och att ett overifierat konto tas bort när den som äger e-postadressen tar tillbaka adressen.",
        'En arbetsytas egna administratörer och ägare kan se de senaste 90 dagarnas ändringar av arbetsytan i sina kontoinställningar, även vem som gjorde varje ändring: medlemmens namn och, så länge personen fortfarande är medlem i arbetsytan, hens e-postadress. En ändring som vårt supportteam gjorde medan det var inloggat som en medlem visas som medlemmens, märkt "av support". Den vyn visar aldrig någon IP-adress eller webbläsare. Administratörer och ägare kan också se om varje medlem har tvåstegsverifiering eller en passkey, bara ja eller nej, aldrig vilken metod.',
        "Som standard sparar vi nätverksuppgifterna i 90 dagar och resten av posten i 365 dagar, sedan raderas de. Om vi ändrar de tiderna uppdaterar vi det här avsnittet så att det står vilka de är.",
        "En säkerhetskopia som togs innan en post raderades kan fortfarande innehålla en kopia av den så länge vi sparar säkerhetskopian.",
      ],
    },
    {
      id: "your-rights",
      title: "Dina rättigheter",
      paragraphs: [
        "Beroende på lagen i [Jurisdiction] har du som registrerad rätt att få tillgång till, rätta, exportera eller radera dina uppgifter och att invända mot hur de används. Du kan också lämna klagomål till tillsynsmyndigheten, i Sverige Integritetsskyddsmyndigheten (IMY).",
        "Du kan när som helst begära en export eller radera ditt konto under Data och integritet i dina kontoinställningar, utan att behöva skriva till oss. Exporten är en fil med din profil, dina inloggningsmetoder och sessioner, de arbetsytor du tillhör, e-postadresserna till dem du har bjudit in, dina anteckningar, dina aviseringar och den senaste aktiviteten på ditt konto, även skäl som någon i vårt supportteam har angett för en åtgärd på ditt konto. När du raderar kontot schemaläggs det för borttagning om 7 dagar (logga in igen före dess för att avbryta), sedan raderas kontot och de här uppgifterna, liksom varje arbetsyta där du är den enda medlemmen. Fyra saker finns kvar: anteckningar du har skrivit i arbetsytor som du delar med andra stannar i arbetsytan, visade som skrivna av en raderad användare; loggen över åtgärder på ditt konto (vad som gjordes, när och eventuellt skäl) sparas utan kopplingen till ditt konto; ett supportärende du har skickat behåller sin adress och sitt meddelande, utan koppling till ditt konto; och kopior som de leverantörer vi använder redan har, till exempel för betalningar, felrapportering eller statistik, omfattas inte av raderingen utan följer leverantörernas egna lagringstider.",
        "Skriv till [Contact email] om något som den här sidan inte tar upp.",
      ],
    },
    {
      id: "cookies",
      title: "Kakor",
      paragraphs: [
        "Vi använder en sessionskaka för att hålla dig inloggad och en samtyckeskaka för att komma ihåg ditt val om kakor. Båda är nödvändiga. Vi använder ingen statistikkaka; se Statistik nedan för vad vi registrerar i stället.",
      ],
    },
    {
      id: "analytics",
      title: "Statistik",
      paragraphs: [
        "Vi registrerar vilka sidor som besöks och de händelser som spelar roll för att driva tjänsten, till exempel att någon registrerar sig, bekräftar en e-postadress, skapar en arbetsyta, bjuder in någon, byter abonnemang eller skickar kontaktformuläret, i vår egen databas. En besökare räknas med ett hashvärde som gäller en dag och beräknas från en IP-adress och en webbläsare som kastas direkt och aldrig sparas. Bara hashvärdet sparas, och det kan inte identifiera dig eller följa dig från en dag till nästa. Vi registrerar också värdnamnet på den webbplats som hänvisade dig, aldrig hela sidan du kom ifrån.",
        "Händelser registreras av våra servrar när du gör något, så de är kopplade till ditt konto (och, där det finns en, din arbetsyta) oavsett vad du väljer i kakbannern.",
        "När du skickar kontaktformuläret registreras en händelse med bara de tre val du gjorde (vem du skriver för, vad du vill ha hjälp med och hur bråttom det är), aldrig ditt namn, din e-postadress, ditt meddelande eller något konto.",
        "Det Godkänn alla lägger till är ditt kontos och din arbetsytas id på dina sidvisningar och på de händelser din webbläsare skickar, så att vi kan se vilka sidor en inloggad kund besöker. Med Bara nödvändiga förblir de anonyma.",
        "Vi registrerar aldrig IP-adress, webbläsarens user agent, ditt namn, din e-postadress eller något du skriver i ett formulär som en del av detta.",
        "[Company] sparar de här uppgifterna i [90] dagar och sparar sedan bara dagliga summor. [Vi skickar samma sidvisningar och händelser vidare till [PostHog/Plausible] för våra egna översikter, även de händelser som är kopplade till konton och, med Godkänn alla, id:na på dina sidvisningar. Ta bort den här meningen om ni inte aktiverar någon leverantör.]",
      ],
    },
    {
      id: "api-access",
      title: "API-åtkomst",
      paragraphs: [
        "En arbetsytas administratörer och ägare kan skapa API-nycklar som låter externa verktyg och skript ansluta till arbetsytan. En nyckel gör bara det som administratören som skapade den valde att tillåta: läsa arbetsytans namn, slug och abonnemang; läsa medlemmars användar-id, namn, roller och när de gick med; eller läsa och skriva anteckningar, även författarnas namn och id. Inget ges som standard, och en nyckel får aldrig tillgång till e-postadresser.",
        "Ett anslutet verktyg agerar som arbetsytan, inte som en enskild person. Arbetsytan, och den som driver verktyget, ansvarar för vad verktyget gör och vad det sparar när det har läst uppgifter med en nyckel. Den här policyn gäller vad vi delar med verktyget, inte vad det gör efteråt.",
        "Vi sparar en nyckels namn, vilka behörigheter den fick, vem som skapade den och när den skapades, senast användes och går ut eller återkallades. Själva nyckeln sparar vi aldrig efter att den har skapats, bara ett envägshashvärde, så att inte ens vi kan läsa den, och ett kort prefix som visas för administratörer så att de känner igen nyckeln och som inte går att använda för sig. En administratör kan när som helst återkalla en nyckel, och då slutar den fungera direkt.",
        "En arbetsytas administratörer och ägare kan också registrera egna webhook-mottagare: adresser som vi skickar en signerad avisering till när något som de har valt att prenumerera på händer i arbetsytan, som att en anteckning skapas, att en medlem går med eller lämnar, att en roll ändras, att arbetsytan byter namn eller logotyp eller att en API-nyckel skapas eller återkallas. Det vi skickar är samma uppgifter som vårt API skulle returnera för samma sak, aldrig någon e-postadress, och bara för de händelser administratören valde när mottagaren lades till. Inget skickas som standard.",
        "Mottagaren är administratörens eget val, och arbetsytan, och den som driver det som tar emot trafiken, ansvarar för vad som händer med uppgifterna när de har kommit fram, på samma sätt som för en API-nyckel. Vi sparar varje mottagares adress, vilka händelser den prenumererar på, vem som skapade den och en kort logg över varje leveransförsök (när, om det lyckades och varför inte, om det misslyckades), i 30 dagar, aldrig innehållet i det som skickades eller togs emot. En avisering som inte har kunnat levereras än väntar i vår kö för att försökas igen, och en som aldrig kom fram sparas där, med innehåll, i upp till 30 dagar innan den raderas. Vi sparar en signeringsnyckel för varje mottagare så att mottagaren kan kontrollera att en avisering verkligen kommer från oss. Vi sparar den så att den kan användas för att signera, och en administratör kan byta ut den. Om administratören tar bort mottagaren, vilket går när som helst, slutar leveranserna till den direkt.",
      ],
    },
    {
      id: "contact",
      title: "Kontakt",
      paragraphs: [
        "Personuppgiftsansvarig är [Company]. Frågor om den här policyn: [Contact email], [Company].",
      ],
    },
  ],
}

/** Both languages, one shape: the same section ids, in the same order. */
export const PRIVACY: Record<Locale, LegalDoc> = { sv, en }

export const privacyFor = (locale: Locale): LegalDoc => PRIVACY[locale]

/** The English template, as the earlier callers and tests read it. */
export const privacy = en
