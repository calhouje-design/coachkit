import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { AvailabilityMark, RosterAvailabilityButtons } from "../components/AvailabilityMark.js";
import {
  markInjured,
  markOut,
  settleAvailability,
  withoutReturnAt,
  showDoneForToday,
  toggleRosterInjured,
  toggleRosterOut,
} from "./playerStatus.js";

const done = {
  id: "p7",
  name: "Remi Stone",
  number: "7",
  out: true,
  injured: false,
  doneForToday: true,
};

test("out and injured writes clear a stale done-for-today mark", () => {
  const injured = markInjured(done, { midGameInjury: true, injuredInQuarter: 2, returnQuarter: null });
  assert.equal(injured.injured, true);
  assert.equal(injured.out, false);
  assert.equal(injured.doneForToday, false);
  assert.equal(injured.injuredInQuarter, 2);

  const backOut = markOut({ ...done, injured: true, out: false }, { midGameInjury: false, injuredInQuarter: 3, returnQuarter: null });
  assert.equal(backOut.out, true);
  assert.equal(backOut.injured, false);
  assert.equal(backOut.doneForToday, false);
  assert.equal(backOut.midGameInjury, false);

  const fromRosterInj = toggleRosterInjured(done);
  assert.equal(fromRosterInj.injured, true);
  assert.equal(fromRosterInj.out, false);
  assert.equal(fromRosterInj.doneForToday, false);

  const fromRosterOut = toggleRosterOut({ ...done, out: false, injured: true });
  assert.equal(fromRosterOut.out, true);
  assert.equal(fromRosterOut.injured, false);
  assert.equal(fromRosterOut.doneForToday, false);

  const renamed = settleAvailability(done, { ...done, name: "Remi S." });
  assert.equal(renamed.doneForToday, true);
  assert.equal(renamed.name, "Remi S.");

  const cleared = settleAvailability(done, { ...done, out: false, injured: false, doneForToday: true });
  assert.equal(cleared.doneForToday, false);
  assert.equal(cleared.out, false);

  const returning = {
    ...done,
    out: false,
    injured: false,
    doneForToday: false,
    returnQuarter: 2,
    returnAt: { quarter: 2, half: "back" },
  };
  const injuredAgain = markInjured(returning, { midGameInjury: true, injuredInQuarter: 2, returnQuarter: null });
  assert.equal(injuredAgain.returnQuarter, null);
  assert.equal(injuredAgain.returnAt, undefined);
  const toggled = toggleRosterOut(returning);
  assert.equal(toggled.out, true);
  assert.equal(toggled.returnAt, undefined);
  assert.equal(toggled.returnQuarter, 2);
  const whole = markOut({ ...returning, returnAt: undefined }, { returnQuarter: 3 });
  assert.equal(whole.returnQuarter, 3);
  assert.equal(whole.returnAt, undefined);
  assert.equal(withoutReturnAt(returning).returnAt, undefined);
});

test("the done-for-today badge renders only while the player is out or injured", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const paint = (player) => act(async () => {
    root.render(createElement(AvailabilityMark, { player }));
  });

  await paint(done);
  assert.equal(host.querySelector("[data-testid='done-for-today']")?.textContent, "Done for today");
  assert.equal(showDoneForToday(done), true);

  await paint({ ...done, out: false, injured: true });
  assert.equal(host.querySelector("[data-testid='done-for-today']")?.textContent, "Done for today");

  await paint({ ...done, out: false, injured: false });
  assert.equal(host.querySelector("[data-testid='done-for-today']"), null);
  assert.equal(showDoneForToday({ ...done, out: false, injured: false }), false);

  await paint({ ...done, doneForToday: false });
  assert.equal(host.querySelector("[data-testid='done-for-today']"), null);

  function Card({ initial, which }) {
    const [player, setPlayer] = useState(initial);
    return createElement("div", null,
      createElement(AvailabilityMark, { player }),
      createElement(RosterAvailabilityButtons, { player, onUpdate: setPlayer }),
      createElement("span", { "data-testid": "which" }, which),
    );
  }
  const click = async (testId) => {
    await act(async () => {
      host.querySelector(`[data-testid='${testId}']`).dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });
  };

  await act(async () => {
    root.render(createElement(Card, { initial: done, which: "out" }));
  });
  assert.equal(host.querySelector("[data-testid='done-for-today']")?.textContent, "Done for today");
  await click("roster-out");
  assert.equal(host.querySelector("[data-testid='done-for-today']"), null);
  assert.equal(host.querySelector("[data-testid='roster-out']").textContent, "Out");

  await act(async () => {
    root.render(createElement(Card, { key: "inj", initial: done, which: "inj" }));
  });
  assert.equal(host.querySelector("[data-testid='done-for-today']")?.textContent, "Done for today");
  await click("roster-inj");
  assert.equal(host.querySelector("[data-testid='done-for-today']"), null);
  assert.equal(host.querySelector("[data-testid='roster-inj']").textContent, "Return");

  await act(async () => {
    root.unmount();
  });
  host.remove();
});
