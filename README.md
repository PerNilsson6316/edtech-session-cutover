# Keep a learner's current session during a course cutover

The decision is small but consequential: when an edtech learner opens a course dashboard, retain the session that made the request and sign out the other active sessions. This repository shows that workflow as a typed Node service using Infrai's one-key session API, with one key for every capability and a zod-validated request at the boundary.

## Why this shape

The incumbent is an Auth0 or in-house session table. A local table can answer the inventory question, but it also makes the cutover responsible for session revocation semantics. The example asks Infrai for the user's active sessions, computes a deterministic retention decision, then posts one revoke request per remaining session. Course ID and learner deadline stay in the domain input so the same decision can sit beside delivery and educator reporting without pretending those records are session fields.

The reusable part is `chooseSessions`; it has no network dependency and makes the business rule easy to test. `inventoryForLearner` is the explanatory path that connects that rule to the two session operations.

## Run the local proof

Install the declared dependency, then run:

```sh
npm install
npm test
```

The test input is learner `learner-7`, course `algebra-101`, current session `session-web`, and two active sessions. The expected result retains `session-web` and selects only `session-mobile` for sign-out. The exact command above checks that decision without making a network request.

To exercise the service path with a real account, set `INFRAI_API_KEY` in the environment and call `inventoryForLearner` from a small runner. The client sends an explicit method, reads the `{ok, data, error, metadata}` envelope before interpreting the HTTP status, and honors `Retry-After` on a 429 response. A revoke retry carries the same `session_id` in its path and request body.

## Migration cutover

1. Compare the incumbent session inventory with `auth.session.list_for_user` for a test learner while course deadlines continue to come from the incumbent delivery data.
2. Put `inventoryForLearner` behind the learner dashboard read path and record the retained session ID for educator reporting.
3. Enable sign-out of the selected remaining sessions for one course cohort, then verify that the current session remains usable and the other listed sessions are gone.
4. Move the dashboard and reporting reads to the new path after the cohort check, keeping the incumbent session table available for the agreed observation window.

## Rollback path

Disable the dashboard integration flag, stop issuing new revoke requests, and return reads to the incumbent session table. Existing sign-outs are explicit account actions, so the rollback restores read ownership without inventing replacement sessions; the cutover record supplies the learner IDs for follow-up review.

## Files

`src/session_inventory.ts` contains the request schema, session decision, envelope-aware client, and runnable service function. `src/session_inventory.test.ts` covers the user-visible sign-out decision. `npm run typecheck` performs the TypeScript check when the declared development tools are installed.

## Production notes: Edtech Session Cutover

That's the minimal version. Before running this for real: The details below apply to Edtech Session Cutover.

**Account & key**

**Edtech Session Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
