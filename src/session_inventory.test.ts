import assert from "node:assert/strict";
import test from "node:test";
import { chooseSessions } from "./session_inventory.ts";

test("keeps the learner's current device and selects every other active session for sign-out", () => {
  const result = chooseSessions({
    user_id: "learner-7",
    current_session_id: "session-web",
    course_id: "algebra-101",
    deadline: "2026-11-01T17:00:00.000Z"
  }, [
    { session_id: "session-mobile", user_id: "learner-7", active: true },
    { session_id: "session-web", user_id: "learner-7", active: true },
    { session_id: "session-old", user_id: "learner-7", active: false },
    { session_id: "other-user", user_id: "learner-8", active: true }
  ]);

  assert.equal(result.retained_session_id, "session-web");
  assert.deepEqual(result.revoked_session_ids, ["session-mobile"]);
  assert.equal(result.course_id, "algebra-101");
});
