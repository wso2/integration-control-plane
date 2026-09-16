---
name: cloud-frontend-debug
description: Debug unexpected frontend behavior and inefficiency on the Cloud product path only — infinite or duplicate network requests, a page or component that feels slow, memory usage climbing over time, unnecessary re-renders, or mount/unmount cycling. Use this whenever a developer reports something like "the network tab is flooded", "this page keeps calling the same API", "the app freezes/crashes after a while", "this got slow after my change", or any similar inefficiency/crash report on Cloud — even if they don't name the underlying cause (render loop, leaked timer, stale closure, etc). Not for backend bugs, infra/deploy issues, or "this feature doesn't behave as designed" reports.
---

# Cloud Frontend Debugging Skill

## Scope — when this applies

Use this skill only for:

- The **Cloud** product path (not WIP/ICP).
- **Frontend-caused** unexpected behavior or inefficiency — not backend bugs, not infra/deploy issues, not "this feature doesn't work as designed."

Typical symptoms a developer will describe (their words, not the real cause):

- Infinite / non-stop network requests when a page is open.
- The app becomes very slow on a certain page.
- The same network request keeps firing unnecessarily, e.g. when moving from one component to another.
- A page crash or frozen/unresponsive tab.
- Memory usage climbing the longer a page stays open.
- General "something feels off" performance complaints.

The developer will only ever describe what they _see_ (network tab, sluggish UI, a crash). They will not know if the real cause is a render loop, a mount/unmount cycle, a leaked timer, a stale closure, etc. Finding that real cause is this skill's job — never take the developer's guess about the cause at face value, only their description of the symptom.

If the report doesn't fit this shape (a backend error, a design/product question, a one-off typo bug), say so and hand it back rather than forcing it through this flow.

## Ground rule: evidence before theory

This is the most important rule. Do not state a root cause, and do not apply a fix, until you have direct evidence for it — real console output, a real network payload, real code you've read line by line. A theory that "sounds right" is not a finding.

Specifically avoid these failure patterns (all of which happened in a past investigation and cost real time):

- Proposing a mechanism without testing it first.
- Stating a fact about a response (e.g. "it's a 404") without having actually seen it — always get the real status/body from the user.
- Guessing what a backend "probably" does or needs — if backend behavior matters, either ask for the backend repo and read the actual code path, or ask the user to confirm from a real request/response.
- Shipping a fix for a partial theory, then patching it again once more evidence comes in. Get the full picture first, fix once.
- Treating a plausible story as confirmed just because it's the first one that fits.

If you're ever uncertain, ask a question. Never fill an uncertainty with an assumption.

## Step 1 — Establish the environment

Ask the developer, before anything else:

1. Is this happening against a **local backend** (pointed at a local cluster) or against a **hosted dev/cloud environment**?
2. If local: ask for the **local path to the backend repository**. Use it — whenever a network call's server-side behavior matters, go read the actual backend code (routes → controllers → services → clients) rather than guessing what the server does.
3. If hosted: note that backend code isn't available to inspect directly — root-causing needs to lean more on request/response evidence and frontend code/logs.

## Step 2 — Get a clear, scoped picture

This is a large app — do not start reading code broadly. Narrow the problem to a specific area before investigating.

Ask the developer (as needed, don't ask what you don't need):

- What exact action did they take, in order, right before the symptom appeared?
- What exactly did they observe (slow how? requests repeating how fast? crash after how long?)?
- The exact browser URL(s) they were on — this tells you the org/project/component/page context and which source files are actually in play.
- Whether the issue happens every time, or only sometimes / only after some other action.

Use the answers to narrow scope to a specific page, component, or hook — not "somewhere in the app."

## Step 3 — Gather hard evidence, early

If the symptom involves network activity (duplicate/infinite requests, unusual calls), ask for this up front, before theorizing:

- The exact request URL(s).
- The response status code and body (not just "it failed" — the actual body/shape).
- Roughly how fast/often it repeats, and whether it ever stops.
- Whether unrelated requests join in once it starts (a sign the loop is cascading across components, not isolated to one).

Do not accept a paraphrase of a response as fact ("it 404s") — ask for the literal network tab entry if there's any ambiguity, the way a wrong assumption here previously sent an investigation in the wrong direction.

## Step 4 — Narrow further with instrumentation and isolation

When you're not sure how the app behaves at runtime (e.g. "does this re-render when X changes?", "does this mount twice?"):

- Add targeted `console.log` statements at the specific points you need visibility into (mount/unmount, effect firing, query state changes, render counts).
- Tell the developer exactly what you added and where, and ask them to reproduce the issue and paste back the console output.
- Read the output carefully before forming or revising a theory — this is your primary source of runtime truth when a debugger session isn't available to you directly.

When narrowing which component is responsible:

- Suggest commenting out specific components/hooks (one at a time) to see whether the symptom disappears — this bisects the problem down to the exact piece responsible, especially useful for figuring out which component is behind a request storm or render loop.

Clean up any temporary logs/comment-outs once the investigation concludes, whether or not a fix follows immediately.

## Step 5 — Confirm the root cause before concluding

Before stating "this is the root cause":

- You should be able to explain the _full_ mechanism — not just "component X re-fetches," but why that causes the observed symptom end-to-end (e.g. why a re-fetch leads to an unmount, why that unmount leads to a re-fetch again, why nothing breaks the cycle).
- You should have direct evidence for each link in that chain (a log line, a network entry, a line of code), not an inferred link.
- If backend behavior is part of the chain and you have the repo, you should have actually read the relevant backend code, not assumed what it does.
- If any part of the chain is still a guess, say so explicitly and go get evidence for it — do not present a partially-verified chain as a confirmed root cause.

Only once every link is backed by evidence should you state the root cause and propose a fix.

## Step 6 — Report clearly

When you do report a root cause or fix, use simple, plain English:

- What the symptom was.
- What the actual mechanism is (in a short paragraph, not jargon).
- What evidence confirms it (which log, which network response, which code path).
- What the fix changes and why that breaks the cycle.

If you were wrong about something earlier in the investigation, say so plainly rather than quietly moving past it.
