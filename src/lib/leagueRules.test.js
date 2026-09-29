import test from "node:test";
import assert from "node:assert/strict";
import {
  AGES,
  LEAGUE_RULES,
  resolveSetup,
  tableRule,
  unverifiedCells,
  defaultSlots,
  gkFullPeriodReason,
} from "./leagueRules.js";

test("age list includes the odd ages and U18 through U19", () => {
  assert.deepEqual(AGES, [
    "U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19",
  ]);
});

test("US Soccer defaults follow the small-sided chart", () => {
  const u6 = tableRule("us-soccer", "U7");
  assert.equal(u6.playersOnField, 4);
  assert.equal(u6.gk, false);
  assert.equal(u6.periods, 4);
  assert.equal(u6.periodMinutes, 10);
  assert.equal(u6.verified, true);
  const u8 = tableRule("us-soccer", "U8");
  assert.equal(u8.playersOnField, 4);
  assert.equal(u8.gk, false);
  const u10 = tableRule("us-soccer", "U10");
  assert.equal(u10.playersOnField, 7);
  assert.equal(u10.gk, true);
  assert.equal(u10.periods, 2);
  assert.equal(u10.periodMinutes, 25);
  const u12 = tableRule("us-soccer", "U12");
  assert.equal(u12.playersOnField, 9);
  assert.equal(u12.periodMinutes, 30);
  assert.equal(tableRule("us-soccer", "U13").periodMinutes, 35);
  assert.equal(tableRule("us-soccer", "U16").periodMinutes, 40);
  assert.equal(tableRule("us-soccer", "U19").periodMinutes, 45);
  assert.equal(tableRule("us-soccer", "U19").gk, true);
});

test("SAY East keeps Cincinnati sizes and flags the unverified cells", () => {
  const u6 = tableRule("say-east", "U6");
  assert.equal(u6.playersOnField, 4);
  assert.equal(u6.gk, false);
  assert.equal(u6.periodMinutes, 8);
  assert.equal(u6.verified, true);
  for (const age of ["U7", "U8"]) {
    const row = tableRule("say-east", age);
    assert.equal(row.playersOnField, 6);
    assert.equal(row.gk, false);
    assert.equal(row.periodMinutes, 10);
    assert.equal(row.verified, false);
  }
  assert.equal(tableRule("say-east", "U9").playersOnField, 8);
  assert.equal(tableRule("say-east", "U9").gk, true);
  assert.equal(tableRule("say-east", "U11").playersOnField, 9);
  const fall = tableRule("say-east", "U13", "fall");
  const spring = tableRule("say-east", "U14", "spring");
  assert.equal(fall.playersOnField, 11);
  assert.equal(spring.playersOnField, 9);
  assert.equal(spring.gk, true);
  for (const age of ["U15", "U16", "U17", "U18", "U19"]) {
    const row = tableRule("say-east", age);
    assert.equal(row.playersOnField, 11);
    assert.equal(row.verified, false);
    assert.equal(row.periodMinutes, 20);
  }
});

test("Ohio uses US Soccer only where the state card is missing", () => {
  const u6 = tableRule("ohio", "U6");
  assert.equal(u6.verified, false);
  assert.equal(u6.playersOnField, 4);
  assert.equal(u6.gk, false);
  const u8 = tableRule("ohio", "U8");
  assert.equal(u8.playersOnField, 5);
  assert.equal(u8.gk, false);
  assert.equal(u8.periodMinutes, 10);
  assert.equal(u8.verified, false);
  assert.equal(tableRule("ohio", "U10").playersOnField, 7);
  assert.equal(tableRule("ohio", "U10").periods, 2);
  assert.equal(tableRule("ohio", "U10").periodMinutes, 25);
  assert.equal(tableRule("ohio", "U12").playersOnField, 9);
  assert.equal(tableRule("ohio", "U14").periodMinutes, 35);
  assert.equal(tableRule("ohio", "U16").periodMinutes, 40);
  assert.equal(tableRule("ohio", "U18").periodMinutes, 45);
  assert.equal(tableRule("ohio", "U9").verified, true);
});

test("every organization has a row for every age", () => {
  for (const org of ["us-soccer", "say-east", "ohio"]) {
    for (const age of AGES) {
      const row = LEAGUE_RULES[org][age];
      assert.ok(row, `${org} ${age}`);
      assert.ok(row.playersOnField >= 4 && row.playersOnField <= 11);
      assert.ok([2, 4].includes(row.periods));
    }
  }
});

test("custom settings win and a legacy team without an org keeps its old game", () => {
  const custom = resolveSetup({
    league: "U12",
    format: "9v9",
    settings: {
      org: "custom",
      custom: { playersOnField: 5, gk: false, periods: 3, periodMinutes: 25 },
    },
  });
  assert.equal(custom.orgId, "custom");
  assert.equal(custom.playersOnField, 5);
  assert.equal(custom.gk, false);
  assert.equal(custom.periods, 3);
  assert.equal(custom.periodType, "periods");
  assert.equal(custom.periodMinutes, 25);
  assert.equal(custom.slots.includes("GK"), false);
  assert.equal(custom.slots.length, 5);

  const legacy = resolveSetup({
    league: "U8 / Passers",
    format: "6v6",
    settings: { quarterMinutes: null },
  });
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.orgId, null);
  assert.equal(legacy.age, "U8");
  assert.equal(legacy.playersOnField, 6);
  assert.equal(legacy.gk, true);
  assert.equal(legacy.periods, 4);
  assert.equal(legacy.periodMinutes, 12);
  assert.equal(legacy.slots[0], "GK");

  const fresh = resolveSetup({
    league: "U8",
    format: "4v4",
    settings: {},
  });
  assert.equal(fresh.legacy, false);
  assert.equal(fresh.orgId, "us-soccer");
  assert.equal(fresh.gk, false);
  assert.equal(fresh.playersOnField, 4);
  assert.equal(fresh.periodMinutes, 10);

  const sayHalves = resolveSetup({
    league: "U10",
    format: "8v8",
    settings: { org: "say-east", periods: 2 },
  });
  assert.equal(sayHalves.periods, 2);
  assert.equal(sayHalves.periodType, "halves");
  assert.equal(sayHalves.periodMinutes, 24);
  assert.equal(sayHalves.gk, true);

  const spring = resolveSetup({
    league: "U13",
    format: "9v9",
    settings: { org: "say-east", saySeason: "spring" },
  });
  assert.equal(spring.showSeason, true);
  assert.equal(spring.playersOnField, 9);
  assert.equal(spring.gk, true);
  assert.equal(spring.periods, 4);
  assert.equal(spring.periodMinutes, 15);
});

test("unverified cells are the ones the rulebooks do not settle", () => {
  const flags = unverifiedCells().map(row => `${row.orgId}:${row.age}`);
  assert.deepEqual(flags.sort(), [
    "ohio:U6",
    "ohio:U7",
    "ohio:U8",
    "say-east:U15",
    "say-east:U16",
    "say-east:U17",
    "say-east:U18",
    "say-east:U19",
    "say-east:U7",
    "say-east:U8",
  ].sort());
});

test("no-GK slots stay off the goal and a half still names one full period", () => {
  assert.deepEqual(defaultSlots(4, false), ["LD", "RD", "LM", "RM"]);
  assert.equal(defaultSlots(11, true).filter(pos => pos === "GK").length, 1);
  assert.match(gkFullPeriodReason("halves"), /whole half/);
  assert.match(gkFullPeriodReason("quarters"), /whole quarter/);
  assert.match(gkFullPeriodReason("periods"), /whole period/);
});
