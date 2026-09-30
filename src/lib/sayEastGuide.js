/** SAY East quick rules, missed rules, and official links. Restored from the Rules tab. */

export function sayDivisionKey(age) {
  const n = Number(String(age || "").replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 6) return "U6 / Instructional";
  if (n <= 8) return "U8 / Passers";
  if (n <= 10) return "U10 / Wings";
  if (n <= 12) return "U12 / Strikers";
  if (n <= 14) return "U14 / Kickers";
  if (n <= 16) return "U16 / Minors";
  return "U19 / Seniors";
}

export function sayDivision(age) {
  return SAY_EAST_DIVISIONS[sayDivisionKey(age)] || SAY_EAST_DIVISIONS["U10 / Wings"];
}

// -- SAY East Play-Time Rules (SAY Rule 12) --
// Every player present must play approximately half the game.
// Source: SAY East Playing Laws Rulebook (Updated Jan 2026), Rule 12
export const SAY_PLAY_TIME = {
  "U6 / Instructional": { minFraction: 1.0, note: "All players play the entire game (Instructional only)" },
  "U8 / Passers":       { minFraction: 0.5, note: "SAY Rule 12: Every player must play - half the game" },
  "U10 / Wings":        { minFraction: 0.5, note: "SAY Rule 12: Every player must play - half the game" },
  "U12 / Strikers":     { minFraction: 0.5, note: "SAY Rule 12: Every player must play - half the game" },
  "U14 / Kickers":      { minFraction: 0.5, note: "SAY Rule 12: Every player must play - half the game" },
  "U16 / Minors":       { minFraction: 0.5, note: "SAY Rule 12: Every player must play - half the game" },
  "U19 / Seniors":      { minFraction: 0.5, note: "SAY Rule 12: Every player must play - half the game" },
};

// -- SAY East League Rules --
// Source: SAY East Playing Laws Rulebook (Updated Jan 2026) + SAY National Playing Laws (2024/2026)
// SAY East specific exceptions: Silver Matrix age chart, SAY East formats, GK punting allowed, no blowouts
export const SAY_EAST_DIVISIONS = {
  "U6 / Instructional": {
    divisionName: "Instructional", ageRange: "Ages 4-5",
    format: "4v4", ballSize: 3,
    fieldLength: "25-35 yds", fieldWidth: "15-25 yds",
    goalSize: "4-6 ft",
    heading: false, offside: false, slideTackle: false, buildOut: false,
    gkPunt: false, throwIns: false, penaltyKick: false, yellowRedCards: false,
    periods: 4, periodMin: 8,
    quickRules: [
      { icon:"", text:"Development only - score is NOT kept", important: true },
      { icon:"", text:"No heading - IFK awarded to opponents if it occurs", important: true },
      { icon:"", text:"4 x 8 min quarters (32 min total)" },
      { icon:"", text:"Kick-ins replace throw-ins (no throw-ins)" },
      { icon:"", text:"No offside rule applies" },
      { icon:"", text:"All players play the entire game" },
      { icon:"", text:"GK may NOT punt - roll or throw only" },
      { icon:"", text:"No yellow or red cards - verbal guidance only" },
      { icon:"", text:"Size 3 ball" },
      { icon:"", text:"Small field: 25-35 x 15-25 yards" },
    ],
    unknownRules: [
      "Coaches are often allowed near the field to guide young players - SAY encourages teaching moments",
      "Even 'accidental' heading results in an IFK for the other team at this age",
      "No penalty kicks in Instructional play - all free kicks are indirect",
      "If a team is winning by more than 5 goals, SAY East's 'no blowout' rule requires adjustments - coaches must act",
      "The build-out line is NOT used at U6/Instructional; it begins at U8/Passers",
      "Referees at this age are there to educate, not just officiate - expect teaching stoppages",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
    ]
  },

  "U8 / Passers": {
    divisionName: "Passers", ageRange: "Ages 6-7 (Silver Matrix)",
    format: "6v6 (SAY East)", ballSize: 3,
    fieldLength: "55-65 yds", fieldWidth: "35-45 yds",
    goalSize: "12-18 ft wide x 6-7 ft high",
    heading: false, offside: false, slideTackle: false, buildOut: true,
    gkPunt: true, throwIns: true, penaltyKick: false, yellowRedCards: true,
    periods: 4, periodMin: 10,
    quickRules: [
      { icon:"", text:"No heading - IFK awarded to opponents", important: true },
      { icon:"", text:"Build-out line: all opponents must retreat on GK ball or goal kick", important: true },
      { icon:"", text:"4 x 10 min quarters (40 min total). Halves are 2 x 20" },
      { icon:"", text:"SAY East: 6v6 format (spring & fall)" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"GK may punt (SAY East exception to national rule)" },
      { icon:"", text:"No offside rule - open play encouraged" },
      { icon:"", text:"Unlimited subs: goal kicks, after goals, injuries, between periods, cautions" },
      { icon:"", text:"Size 3 ball" },
      { icon:"", text:"6v6 field: 55-65 x 35-45 yards" },
    ],
    unknownRules: [
      "SAY East uses 6v6 format, not the SAY national standard of 7v7 - plan your roster accordingly",
      "Build-out line: when the GK has the ball OR on a goal kick, all opponents must retreat behind the build-out line before the ball is played",
      "GK cannot score directly from a punt (ball must touch another player first)",
      "No penalty kicks at this age - direct free kicks from outside the penalty area only",
      "SAY East 'no blowout' rule: winning by more than 5 goals is a violation - coaches must rotate and adjust",
      "A player ejected (Red Card for fighting) is suspended for the next 2 games per SAY East rules",
      "Players who re-enter after subbing are fully allowed - re-entry is unlimited",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
    ]
  },

  "U10 / Wings": {
    divisionName: "Wings", ageRange: "Ages 8-9 (Silver Matrix)",
    format: "8v8 (SAY East)", ballSize: 4,
    fieldLength: "55-65 yds", fieldWidth: "35-45 yds",
    goalSize: "12-18 ft wide x 6-7 ft high",
    heading: false, offside: false, slideTackle: false, buildOut: true,
    gkPunt: true, throwIns: true, penaltyKick: true, yellowRedCards: true,
    periods: 4, periodMin: 15,
    quickRules: [
      { icon:"", text:"No heading - IFK awarded to opponents", important: true },
      { icon:"", text:"Build-out line used - opponents retreat on GK possession / goal kicks", important: true },
      { icon:"", text:"4 x 15 min quarters (60 min total)" },
      { icon:"", text:"SAY East: 8v8 format (spring & fall)" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"GK may punt (SAY East exception)" },
      { icon:"", text:"No offside rule at this age" },
      { icon:"", text:"Unlimited substitutions (with referee permission)" },
      { icon:"", text:"Yellow & red cards apply" },
      { icon:"", text:"Size 4 ball" },
      { icon:"", text:"7v7 small-sided field: 55-65 x 35-45 yards" },
    ],
    unknownRules: [
      "SAY East uses 8v8 format - this is larger than the national 7v7 standard",
      "Build-out line is still active: opponents must retreat when GK has the ball or on goal kicks",
      "Even though penalty kicks are possible, they are taken from the 7v7 penalty mark (10 yards), not the full 12 yards",
      "No offside is called at Wings - the build-out line is the only positional restriction",
      "SAY East 'no blowout' rule: winning margin over 5 goals requires coaches to adjust strategy",
      "A red card for fighting means a 2-game suspension under SAY East rules",
      "Goal kick ball does not have to leave the penalty area to be in play (SAY rule)",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
    ]
  },

  "U12 / Strikers": {
    divisionName: "Strikers", ageRange: "Ages 10-11 (Silver Matrix)",
    format: "9v9 (SAY East)", ballSize: 4,
    fieldLength: "70-80 yds", fieldWidth: "45-55 yds",
    goalSize: "18-21 ft wide x 6-7 ft high",
    heading: false, offside: true, slideTackle: false, buildOut: false,
    gkPunt: true, throwIns: true, penaltyKick: true, yellowRedCards: true,
    periods: 4, periodMin: 20,
    quickRules: [
      { icon:"", text:"NO heading - banned in games & practices through U12", important: true },
      { icon:"", text:"Full offside rule applies (from defensive line, whole field)", important: true },
      { icon:"", text:"4 x 20 min quarters (80 min total)" },
      { icon:"", text:"SAY East: 9v9 format (spring & fall)" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"GK may punt (SAY East exception)" },
      { icon:"", text:"No build-out line at this age - full field offside" },
      { icon:"", text:"Unlimited substitutions with referee permission" },
      { icon:"", text:"Full yellow/red card system" },
      { icon:"", text:"Size 4 ball" },
      { icon:"", text:"9v9 field: 70-80 x 45-55 yards" },
    ],
    unknownRules: [
      "Heading is STILL banned at U12 - any deliberate header results in an IFK for the other team, even in games and at practice",
      "This is the first SAY age group where the full FIFA offside rule applies from the defensive line",
      "No build-out line at Strikers - opponents no longer need to retreat for GK possession",
      "SAY East 'no blowout' rule still applies - win margin over 5 is a violation",
      "Slide tackling: SAY rules do not expressly prohibit it but refs may restrict it locally - ask your referee before games",
      "Penalty mark is at 10 yards (9v9 field), not the full 12-yard FIFA spot",
      "Red card for fighting = 2-game suspension under SAY East rules",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
    ]
  },

  "U14 / Kickers": {
    divisionName: "Kickers", ageRange: "Ages 12-13 (Silver Matrix)",
    format: "9v9 (spring) / 11v11 (fall) - SAY East", ballSize: 5,
    fieldLength: "80130 yds (11v11) / 7080 yds (9v9)", fieldWidth: "50100 yds (11v11)",
    goalSize: "24 ft wide x 8 ft high (11v11)",
    heading: true, offside: true, slideTackle: true, buildOut: false,
    gkPunt: true, throwIns: true, penaltyKick: true, yellowRedCards: true,
    periods: 2, periodMin: 35,
    quickRules: [
      { icon:"", text:"Heading is allowed - limit practice headers per SAY policy", important: true },
      { icon:"", text:"Full offside rule (FIFA standard from defensive line)" },
      { icon:"", text:"2 x 35 min halves (70 min total)" },
      { icon:"", text:"SAY East: 9v9 spring / 11v11 fall" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"GK may punt" },
      { icon:"", text:"Unlimited substitutions with referee permission" },
      { icon:"", text:"Full yellow/red card system - cards carry across games" },
      { icon:"", text:"Size 5 ball" },
      { icon:"", text:"Full-sided field (11v11): 80-130 x 50-100 yards" },
    ],
    unknownRules: [
      "Heading is now allowed but SAY limits practice headers to max 1520 reps and 30 minutes per week at U14",
      "SAY East uses 9v9 in spring and 11v11 in fall - confirm format with your district coordinator each season",
      "Yellow cards can accumulate across games - check your district's suspension threshold (often 3 yellows = 1 game ban)",
      "Slide tackling is permitted at U14+ under SAY rules - referees will still penalize dangerous challenges",
      "Penalty kicks are from the full 12-yard FIFA spot on 11v11 fields",
      "SAY East 'no blowout' rule still technically applies - coaches should manage score differential sportsmanly",
      "Red card for fighting = 2-game suspension (SAY East local rule, same for all divisions)",
      "GK cannot be replaced by a field player mid-play without referee notification - must wait for a stoppage",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
      { label: "FIFA Laws of the Game (IFAB)", url: "https://www.theifab.com/laws-of-the-game" },
    ]
  },

  "U16 / Minors": {
    divisionName: "Minors", ageRange: "Ages 14-15 (Silver Matrix)",
    format: "11v11", ballSize: 5,
    fieldLength: "80-130 yds", fieldWidth: "50-100 yds",
    goalSize: "24 ft wide x 8 ft high",
    heading: true, offside: true, slideTackle: true, buildOut: false,
    gkPunt: true, throwIns: true, penaltyKick: true, yellowRedCards: true,
    periods: 2, periodMin: 40,
    quickRules: [
      { icon:"", text:"Full SAY/FIFA Laws of the Game apply", important: true },
      { icon:"", text:"2 x 40 min halves (80 min total)" },
      { icon:"", text:"Heading fully allowed - no practice limits" },
      { icon:"", text:"Full offside rule - FIFA standard" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"Unlimited substitutions with referee permission" },
      { icon:"", text:"Yellow/red cards - accumulation rules apply" },
      { icon:"", text:"Size 5 ball" },
      { icon:"", text:"Full-sided field: 80-130 x 50-100 yards" },
    ],
    unknownRules: [
      "No heading restrictions at U16 - practice and game headers are unlimited",
      "Referees at this level are expected to use a stricter interpretation of Laws 12 (fouls) and 11 (offside)",
      "A player ejected (Red Card for fighting) is suspended for 2 games - SAY East local rule",
      "Goal kicks: ball is in play once it is kicked and clearly moves - does not need to leave the penalty area",
      "GK has 6 seconds to distribute from hands before an IFK is awarded to opponents",
      "Yellow card accumulation suspensions apply - confirm threshold with your district",
      "Coaches receiving a red card must leave the vicinity of the field",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
      { label: "IFAB Laws of the Game", url: "https://www.theifab.com/laws-of-the-game" },
    ]
  },

  "U19 / Seniors": {
    divisionName: "Seniors", ageRange: "Ages 16-18 (Silver Matrix)",
    format: "11v11", ballSize: 5,
    fieldLength: "80-130 yds", fieldWidth: "50-100 yds",
    goalSize: "24 ft wide x 8 ft high",
    heading: true, offside: true, slideTackle: true, buildOut: false,
    gkPunt: true, throwIns: true, penaltyKick: true, yellowRedCards: true,
    periods: 2, periodMin: 45,
    quickRules: [
      { icon:"", text:"Full SAY/FIFA Laws of the Game apply", important: true },
      { icon:"", text:"2 x 45 min halves (90 min total)" },
      { icon:"", text:"Heading fully allowed" },
      { icon:"", text:"Full offside rule - FIFA standard" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"Unlimited substitutions with referee permission" },
      { icon:"", text:"Full yellow/red card system - suspensions carry across games" },
      { icon:"", text:"Size 5 ball" },
      { icon:"", text:"Full-sided field: 80-130 x 50-100 yards" },
    ],
    unknownRules: [
      "SAY Seniors is for ages 1618 - this is the highest SAY recreational division",
      "SAY Rule 12 still applies at Seniors - every player must get approximately half the game",
      "A player receiving a red card for fighting is suspended for 2 games per SAY East rules",
      "The 'no blowout' culture is still encouraged at SAY East, even at the senior level",
      "Deliberate handball leading to the prevention of a goal can result in a Red Card (DOGSO-H)",
      "GK is allowed 6 seconds to release the ball from hands - IFK awarded if exceeded",
      "Coaches can be cautioned or sent off by the referee for misconduct on the sideline",
    ],
    officialLinks: [
      { label: "SAY East Official Site", url: "https://www.sayeast.org" },
      { label: "SAY National Playing Laws (2024)", url: "https://www.saysoccer.org/Default.aspx?tabid=733802" },
      { label: "SAY East Rulebook PDF (Jan 2026)", url: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf" },
      { label: "IFAB Laws of the Game", url: "https://www.theifab.com/laws-of-the-game" },
    ]
  },
};
