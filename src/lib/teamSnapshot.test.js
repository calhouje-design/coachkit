import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGameDay,
  normalizeSettings,
  resolveCloudSnapshot,
  snapshotFromStorage,
} from "./teamSnapshot.js";

test("missing settings stay at the coach defaults", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.subMode, true);
  assert.equal(settings.autoRegen, true);
  assert.equal(settings.quarterMinutes, null);
});

test("a real swap or injury flag is kept with the in-progress game", () => {
  const gameDay = normalizeGameDay({ realPeriodEvents: { 2: ["a", "b", "a"], 0: ["nope"] } });
  assert.deepEqual(gameDay.realPeriodEvents, { 2: ["a", "b"] });
  assert.deepEqual(normalizeGameDay({}).realPeriodEvents, {});
});

test("explicit settings survive normalization", () => {
  const settings = normalizeSettings({ subMode: false, autoRegen: false, quarterMinutes: 8 });
  assert.equal(settings.subMode, false);
  assert.equal(settings.autoRegen, false);
  assert.equal(settings.quarterMinutes, 8);
});

test("legacy localStorage keys become the in-progress game until a gameDay blob exists", () => {
  const store = {
    formation: "3-2-1",
    homeScore: 2,
    awayScore: 1,
    opponent: "FC Milford",
    minuteBank: { p1: 4 },
    subMode: false,
    schedule: [{ id: "s2", date: "2026-10-02", type: "game", opponent: "Blue" }],
  };
  const snap = snapshotFromStorage((key, fallback) => (key in store ? store[key] : fallback));
  assert.equal(snap.gameDay.formation, "3-2-1");
  assert.equal(snap.gameDay.homeScore, 2);
  assert.equal(snap.gameDay.opponent, "FC Milford");
  assert.equal(snap.gameDay.minuteBank.p1, 4);
  assert.equal(snap.settings.subMode, false);
  assert.equal(snap.schedule.length, 1);
});

test("a saved gameDay blob wins over older split keys", () => {
  const store = {
    gameDay: { formation: "2-3-1", homeScore: 0, awayScore: 0, opponent: "" },
    formation: "4-3-3",
    homeScore: 9,
  };
  const snap = snapshotFromStorage((key, fallback) => (key in store ? store[key] : fallback));
  assert.equal(snap.gameDay.formation, "2-3-1");
  assert.equal(snap.gameDay.homeScore, 0);
});

test("without a durable row, local settings and schedule are kept", () => {
  const resolved = resolveCloudSnapshot({
    durablePresent: false,
    team: { name: "Wolves", league: "U10 / Wings", format: "7v7" },
    players: [{ id: "p1", name: "Ada" }],
    lineups: {},
    games: [],
    settings: { subMode: true },
    gameDay: { homeScore: 5 },
    schedule: [],
  }, {
    settings: { subMode: false, autoRegen: false, quarterMinutes: 12 },
    gameDay: { formation: "2-3-1", homeScore: 1, opponent: "City" },
    schedule: [{ id: "a", date: "2026-10-01", type: "practice" }],
    league: "ignored",
  });
  assert.equal(resolved.teamName, "Wolves");
  assert.equal(resolved.league, "U10 / Wings");
  assert.equal(resolved.players[0].name, "Ada");
  assert.equal(resolved.settings.subMode, false);
  assert.equal(resolved.settings.quarterMinutes, 12);
  assert.equal(resolved.gameDay.homeScore, 1);
  assert.equal(resolved.gameDay.opponent, "City");
  assert.equal(resolved.schedule[0].id, "a");
});

test("a durable row wins even when the live game was cleared", () => {
  const resolved = resolveCloudSnapshot({
    durablePresent: true,
    team: { name: "Wolves", league: "U8 / Passers", format: "6v6" },
    players: [],
    settings: { subMode: true, autoRegen: true, quarterMinutes: null },
    gameDay: normalizeGameDay({}),
    schedule: [],
  }, {
    settings: { subMode: false },
    gameDay: { homeScore: 4, opponent: "Old" },
    schedule: [{ id: "local", date: "2026-09-01", type: "game" }],
  });
  assert.equal(resolved.settings.subMode, true);
  assert.equal(resolved.gameDay.homeScore, 0);
  assert.equal(resolved.gameDay.opponent, "");
  assert.equal(resolved.schedule.length, 0);
});

test("a back-half notice survives reload until the coach dismisses it", () => {
  const sentence = "Couldn't keep Wes as 2nd-half only in Q3; he's available for the whole quarter. Adjust if needed.";
  const saved = normalizeGameDay({ backHalfNotice: sentence });
  assert.equal(saved.backHalfNotice, sentence);
  const reloaded = normalizeGameDay(JSON.parse(JSON.stringify(saved)));
  assert.equal(reloaded.backHalfNotice, sentence);
  assert.equal(normalizeGameDay({ backHalfNotice: "  " }).backHalfNotice, null);
  assert.equal(normalizeGameDay({ ...reloaded, backHalfNotice: null }).backHalfNotice, null);
});
