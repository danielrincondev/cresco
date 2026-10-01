# Cresco — texto para Devpost (inglés)

> **Estado:** Final, para pegar en Devpost · **Dueño:** Persona C · **Última revisión:** 2026-10-01
>
> Cada sección de abajo es un campo del formulario de Devpost. Lo que está entre
> corchetes se completa al enviar (el enlace del video). Las citas son de las
> entrevistas del 1 de septiembre (`docs/05-validacion/hallazgos.md`),
> traducidas del español. Cada cifra sale del repositorio: si algo cambia antes
> de enviar, se corrige aquí primero.

---

## Project name

Cresco

## Elevator pitch

A safe, on-the-record bridge between teachers and families in Ecuador's public
schools: daily reports, disputable behaviour records and documented meetings.

## About the project

### Inspiration

In Ecuador's public schools, news about a child travels on a note in the backpack or through a chain of parent intermediaries. Too often a mother learns at the end of the year that her son was failing — and asks *"why didn't anyone tell me?"*, while the teacher had warned three times.

We set out to replace chaotic WhatsApp groups, and the teachers we interviewed told us something else. In Guayaquil, a teacher's personal number in the wrong hands is a safety risk: one school had banned parent WhatsApp groups two years earlier — *"they were taking the teachers' numbers."* What they lacked was not another chat, but a channel that is official, safe, and leaves a record:

> "You can attach the evidence, but what counts most is the written report."

One teacher described Cresco before we had shown her anything:

> "I wish we had, like private schools do, a platform where all the news, the instructions and the assignments go up, so the parent is in direct contact with the teacher — not in person, and not over WhatsApp."

Every lost notice is a warning sign nobody saw in time. Cresco makes it arrive: in writing, under each person's own name, and without the teacher giving out their number.

### What it does

Cresco is an Android app with two sides. The student is never a user.

**Teachers** create their courses and grading periods, invite families with a code, and approve each student a family registers. During the day they record positive or negative conduct in their own words — the period's behaviour score is derived from those entries — take attendance, and publish the daily report. They can see who opened each report and which families saw each notice. They publish office hours, confirm the meetings families request, call a family in themselves, record whether the family came, and write down what was agreed. In an emergency they can alert the families of a course after re-entering their password, and the app states that it does not replace 911.

**Families** register their child with the course code and accept a versioned consent. They read the daily report (live, even before it is published), a weekly summary on weekends, past reports, and the cumulative record of the period, with guidance that encourages supporting the child. They can **dispute** any negative entry: the teacher has 30 days to answer in writing — keep it, modify it or annul it — and a modified or annulled entry stops counting and the score is recalculated. Families request meetings, answer the teacher's call-ins and receive the agreements. Every notice also arrives as a push notification whose text never names the child.

**Safe by design.** Teachers never expose a personal phone number or email: families reach them only inside the app, always under their own name, so there are no anonymous messages. Sensitive actions — sign-ins, opening a child's record, creating or annulling an entry, approvals, emergency alerts and exports — go to an audit log.

**What runs on its own:** a nightly close at 22:00 that publishes drafts and generates each student's report, a weekly summary on Saturday mornings, meeting reminders the evening before and one hour before, the 30-day deadline of every dispute, and the archiving of courses whose school year has ended.

### How we use RevenueCat

Cresco is free, with ads for families. RevenueCat lets each side add its own extra — and the paywall appears only when a limit is actually reached, never at launch.

- **Teachers — `docente_pro`**: up to 5 courses and 60 students per course, instead of 1 course and 40 students, so one teacher can reach more classes. The paywall appears when a teacher reaches the course limit.
- **Families — `premium`**, monthly or every two months: 7 past reports instead of 2, the cumulative record as a printable PDF, and no ads — more history to understand how to help their child. The paywall appears when a family tries to open a third past report.
- **Ads, reported to RevenueCat.** Free families see an AdMob banner and can unlock the PDF report by watching a rewarded ad. The revenue from both is reported through `Purchases.adTracker`, so ads and subscriptions sit in the same RevenueCat dashboard. Teachers never see ads.
- **The server decides access.** A RevenueCat webhook updates subscriptions in Convex: requests are authenticated, events are idempotent by id, a cancellation keeps access until the paid period ends, and Test Store purchases are flagged as sandbox so the demo never mixes with pilot data.
- **Prices live in RevenueCat offerings**, not in the app, so they can change or be localised without shipping an update. Current prices: $1.99 a month or $2.99 for two months for families, and $3.99 a month for teachers.
- We tested real purchases with RevenueCat's **Test Store** in an EAS development build, without a Play Console account — both purchases appear in the video.

### How we built it

- **Expo (React Native, SDK 57)**: one app for both roles, in TypeScript.
- **Convex**: database, server functions, scheduler and cron jobs in one place. Every one of the 68 public functions checks on the server who is asking and whether the data is theirs. Without row-level security in the database, that single permissions layer plus the audit log is our safety net.
- **Clerk**: sign-in with email or Google, and a fresh password check, verified against Clerk's keys on the server, before an emergency alert or deleting a course.
- **RevenueCat**, **AdMob**, **Expo Notifications with Firebase Cloud Messaging**, **EAS Build** and **EAS Update**.
- **Quality:** 756 automated tests of the server functions and the screens; type checks and an Android bundle on every pull request; code owners per module; and 16 product and 8 architecture decision records in the repository, written as we decided.
- **Details we cared about:** the behaviour score is always derived from the active entries, never incremented; an optional dark mode whose text contrast is checked by a test (WCAG AA) in both palettes; the icon font trimmed to the 27 icons we use, which made the app package 21% smaller; and every date in Ecuador's time zone.

### Challenges we ran into

- **We changed stacks mid-project.** We started on PostgreSQL and Next.js and moved to Expo, Convex and Clerk. Losing row-level security forced us to rebuild authorization as one server-side layer and to make the audit log a first-class feature.
- **Push notifications that "worked" but never arrived.** The server side was complete and tested, but no phone was ever registered. We only found out on a real device, so now the Settings screen shows whether this phone receives notices, and why not.
- **RevenueCat's Test Store key closes release builds on purpose.** We keep two builds: a development build to demonstrate real purchases, and a release build for everyday testing.
- **Over-the-air updates versus native modules.** JavaScript that expects a native module crashes an older binary, so every native change bumps the runtime version and old installs never receive it.

### Accomplishments that we're proud of

- The whole dispute loop works end to end: the teacher records an entry, the family disputes it, the teacher answers in writing, the score is recalculated, and all of it is audited.
- Field validation changed the product. The "WhatsApp chaos" premise was false for public schools; what teachers needed was an official written record, and safety.
- A repository a newcomer can read: decisions recorded one per file, a README that runs in English, and tests that guard the rules.

### What we learned

That the most valuable findings were the ones that made us **not** build something, or take it out. The printable report for the school district was what teachers asked for most, and we deferred it to finish the basics first. We also took the teacher's phone and email out of the app entirely, once we understood that a number shown to parents can be read by anyone holding a parent's phone. And one teacher's story — a mother who, told about her son's behaviour, beat him outside the school — is why our reports carry guidance that encourages accompanying the child rather than punishing him, and it is the first thing we want to measure in a pilot.

### What's next for Cresco

- A pilot with a real public school in Guayaquil, under a written agreement (the draft is in the repository) — and, from there, every classroom in Ecuador.
- More interviews, above all with parents. So far we have heard four public-school teachers and one mother of primary-school children who is also a secondary-school teacher.
- The teacher's printable report for the district, importing class lists, and an English version of the app.
- Verifying rewarded-ad rewards on the server with RevenueCat before granting them.

## Built with

expo · react-native · typescript · convex · clerk · revenuecat · admob ·
firebase-cloud-messaging · eas · android · vitest

## Testing instructions

- **Video:** [YouTube or Vimeo link]. It shows the app on real Android phones,
  in Spanish with English subtitles. The dramatized scenes are AI-generated and
  labeled as such; every app screen is a real recording of the app running.
- **Code:** https://github.com/danielrincondev/cresco — the README has an
  English "Run it yourself" section: Node.js 24, a free Clerk application and
  a free Convex account, no Docker.
- **Purchases:** real purchases need an EAS development build with a RevenueCat
  Test Store key, because Expo Go cannot load native SDKs. The steps are in
  `docs/04-guias/integracion-revenuecat.md` (in Spanish).
- **Checks:** `npm run typecheck` and `npm test` from the repository root.
