import { useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import AuthGate from "./components/AuthGate.jsx";
import UserMenu from "./components/UserMenu.jsx";

// -- localStorage persistence helper --
function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch { /* storage full */ }
  }, [key, state]);
  return [state, setState];
}

// 
// DATA LAYER
// 

// SAY East division names & age mappings (Silver Matrix, birth-year based Aug 1Jul 31)
// Instructional=U6(ages4-5), Passers=U8(6-7), Wings=U10(8-9),
// Strikers=U12(10-11), Kickers=U14(12-13), Minors=U16(14-15), Seniors=U19(16-18)
const LEAGUES = [
  "U6 / Instructional",
  "U8 / Passers",
  "U10 / Wings",
  "U12 / Strikers",
  "U14 / Kickers",
  "U16 / Minors",
  "U19 / Seniors",
];
const FORMATS = ["4v4","5v5","6v6","7v7","8v8","9v9","11v11"];
const ALL_POSITIONS = ["GK","LD","CD","RD","LM","CM","RM","LF","CF","RF"];

// Short label for the league dropdown ("U8 / Passers" -> "U8")
function leagueShortLabel(l){ return (l || "").split(" / ")[0]; }

// SAY East default format per league (auto-applied when league changes)
const LEAGUE_DEFAULT_FORMAT = {
  "U6 / Instructional": "4v4",
  "U8 / Passers":       "6v6",
  "U10 / Wings":        "8v8",
  "U12 / Strikers":     "9v9",
  "U14 / Kickers":      "9v9",
  "U16 / Minors":       "11v11",
  "U19 / Seniors":      "11v11",
};
function leagueDefaultFormat(l){ return LEAGUE_DEFAULT_FORMAT[l] || "6v6"; }

// Position rule: 1 in a row = center, 2 = left/right (no center), 3 = L/C/R, 4 = L/C/C/R, etc.
const POSITIONS_BY_FORMAT = {
  "4v4":  ["GK","CD","CM","CF"],                                    // 1-1-1
  "5v5":  ["GK","LD","RD","CM","CF"],                               // 2-1-1
  "6v6":  ["GK","LD","RD","LM","RM","CF"],                          // 2-2-1
  "7v7":  ["GK","LD","RD","LM","CM","RM","CF"],                     // 2-3-1
  "8v8":  ["GK","LD","CD","RD","LM","CM","RM","CF"],                // 3-3-1 (SAY East U10 default)
  "9v9":  ["GK","LD","CD","RD","LM","CM","RM","LF","RF"],           // 3-3-2
  "11v11":["GK","LB","CB","CB","RB","LM","CM","CM","RM","LF","RF"], // 4-4-2
};

// Human-readable label for display in position tiles
const POS_LABEL = {
  GK:"GK", LB:"LB", RB:"RB", CB:"CB",
  LD:"LD", RD:"RD", CD:"CD",
  LM:"LM", RM:"RM", CM:"CM",
  LF:"LF", RF:"RF", CF:"CF",
  // legacy fallbacks
  DEF:"DEF", MID:"MID", FWD:"FWD", CAM:"CAM", CDM:"CDM",
  LW:"LW", RW:"RW", ST:"ST", Wing:"W",
};

// Field x/y positions for the SVG diagram
const FIELD_BASE = {
  GK:{x:50,y:88},
  CB:{x:50,y:72}, CD:{x:50,y:72}, LD:{x:25,y:72}, RD:{x:75,y:72},
  LB:{x:22,y:75}, RB:{x:78,y:75},
  DEF:{x:50,y:72},
  CDM:{x:50,y:58}, CM:{x:50,y:50}, LM:{x:22,y:50}, RM:{x:78,y:50},
  MID:{x:50,y:50}, CAM:{x:50,y:38},
  LW:{x:18,y:32}, RW:{x:82,y:32},
  LF:{x:28,y:22}, RF:{x:72,y:22}, CF:{x:50,y:18},
  FWD:{x:50,y:22}, ST:{x:50,y:18}, Wing:{x:20,y:30},
};

// -- SAY East Play-Time Rules (SAY Rule 12) --
// Every player present must play approximately half the game.
// Source: SAY East Playing Laws Rulebook (Updated Jan 2026), Rule 12
const PLAY_TIME_RULES = {
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
const LEAGUE_RULES = {
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
    periods: 4, periodMin: 12,
    quickRules: [
      { icon:"", text:"No heading - IFK awarded to opponents", important: true },
      { icon:"", text:"Build-out line: all opponents must retreat on GK ball or goal kick", important: true },
      { icon:"", text:"4 x 12 min quarters (48 min total)" },
      { icon:"", text:"SAY East: 6v6 format (spring & fall)" },
      { icon:"", text:"Every player must play - half the game (SAY Rule 12)" },
      { icon:"", text:"GK may punt (SAY East exception to national rule)" },
      { icon:"", text:"No offside rule - open play encouraged" },
      { icon:"", text:"Unlimited subs: goal kicks, after goals, injuries, between periods, cautions" },
      { icon:"", text:"Size 3 ball" },
      { icon:"", text:"7v7 small-sided field: 55-65 x 35-45 yards" },
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

// Player skill ratings (1-5 per category)
const SKILL_CATEGORIES = ["Speed","Technique","Positioning","Teamwork","Effort"];

// 
// DRILL LIBRARY  30+ drills with diagram descriptions & images
// 
const DRILLS = [
  {
    id:"d1", name:"Rondo 4v2", category:"Possession", skills:["Passing","First Touch"],
    ageMin:"U8", ageMax:"Adult", difficulty:"Beginner", duration:12,
    image:"https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=400&q=80",
    setup:"1010 grid. 4 on outside, 2 inside.",
    instructions:"Outside players keep possession. Each defender switch after losing the ball twice or 90 seconds.",
    coaching:"Open body shape. Quick 1-touch when possible. Move to give passing angles.",
    progressions:["Shrink grid to 88","3-touch max","One-touch only","Add 3v3 in center"],
    equipment:["8 cones","1 ball per group"]
  },
  {
    id:"d2", name:"1v1 Defending Gates", category:"Defense", skills:["Defending","1v1"],
    ageMin:"U8", ageMax:"Adult", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&q=80",
    setup:"1515 grid with 4 small cone gates on edges.",
    instructions:"Attacker dribbles through any gate. Defender prevents this. Switch every 90s.",
    coaching:"Defender: jockey, stay goal-side, wait for touch. Don't dive in.",
    progressions:["Add second attacker","Limit dribble touches","Score points system"],
    equipment:["8 cones","1 ball"]
  },
  {
    id:"d3", name:"Triangle Passing", category:"Passing", skills:["Passing","Movement"],
    ageMin:"U6", ageMax:"Adult", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80",
    setup:"3 cones in triangle, 8 yards apart.",
    instructions:"AB, B one-touch to C, C dribbles to A's cone. Rotate. Both directions.",
    coaching:"Weight of pass. First touch direction. Arrive early to cone.",
    progressions:["Add 4th player","Two balls","Add defender"],
    equipment:["3 cones","1 ball"]
  },
  {
    id:"d4", name:"Shooting Circuit", category:"Shooting", skills:["Shooting","First Touch"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Intermediate", duration:15,
    image:"https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80",
    setup:"3 stations around penalty area: cross, through ball, dribble & shoot.",
    instructions:"Rotate every 5 min. Station 1: volley from cross. Station 2: first-time finish. Station 3: beat mannequin and shoot.",
    coaching:"Plant foot beside ball. Lean over it. Strike through center. Follow through.",
    progressions:["Add GK","Time pressure","Score only with weak foot"],
    equipment:["12 balls","3 mannequins","2 goals"]
  },
  {
    id:"d5", name:"3v3 + GK Small-Sided", category:"Scrimmage", skills:["All"],
    ageMin:"U8", ageMax:"Adult", difficulty:"Beginner", duration:20,
    image:"https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80",
    setup:"2535 grid, small goals, GK each end.",
    instructions:"3v3 + GK. Free subs every 4 mins. Winner stays, loser rotates.",
    coaching:"Width, depth, communication. GK distribution. Quick transitions.",
    progressions:["No GK","Add neutral player","Goals only from crosses"],
    equipment:["4 cones","2 small goals","5 balls"]
  },
  {
    id:"d6", name:"GK Distribution Drill", category:"Goalkeeping", skills:["Goalkeeping"],
    ageMin:"U8", ageMax:"Adult", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=400&q=80",
    setup:"GK in goal. 5 colored cones at 15/20/25 yard intervals.",
    instructions:"Coach calls color. GK distributes to that cone. Alternate serve types: ground, aerial, low drive.",
    coaching:"Quick release. Accuracy over power. Communicate before release.",
    progressions:["Moving targets","Under time pressure","GK kicks only"],
    equipment:["5 cones (different colors)","6 balls"]
  },
  {
    id:"d7", name:"Transition Counter Attack", category:"Fitness", skills:["Speed","Transition"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Intermediate", duration:15,
    image:"https://images.unsplash.com/photo-1551280857-2b9bbe52acf4?w=400&q=80",
    setup:"Full half of field. Two teams of 5.",
    instructions:"When possession switches, team must be behind halfway in 4 seconds. Coach counts. Deduct point for slow transitions.",
    coaching:"Immediate counter-press. Sprint to recover shape. Don't walk after losing the ball.",
    progressions:["Shorten time to 3s","Add neutral zone","Extra attacker on counter"],
    equipment:["Bibs","4 cones","4 balls"]
  },
  {
    id:"d8", name:"Dribbling Obstacle Course", category:"Dribbling", skills:["Dribbling","Ball Control"],
    ageMin:"U6", ageMax:"U14", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80",
    setup:"10 cones weaving pattern, 25 yards long. Speed gate at end.",
    instructions:"Dribble through with right foot, return with left. Race format for motivation.",
    coaching:"Ball close to feet. Head up. Both feet used equally.",
    progressions:["Add defenders at end","Tighter spacing","Ball mastery tricks between gates"],
    equipment:["10 cones","1 ball per player"]
  },
  {
    id:"d9", name:"Crossing & Finishing", category:"Shooting", skills:["Crossing","Shooting","Movement"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Intermediate", duration:15,
    image:"https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80",
    setup:"Wide channel cones, 2 forwards in box, 1 winger.",
    instructions:"Winger drives to byline. Crosses to near/far post. Forwards make runs. Rotate positions every 6 crosses.",
    coaching:"Crosser: low driven or whipped ball. Striker: time run, attack near post first.",
    progressions:["Add CB","GK in goal","Scoring competition"],
    equipment:["10 balls","4 cones","1 goal"]
  },
  {
    id:"d10", name:"Pressing Triggers", category:"Defense", skills:["Pressing","Teamwork"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Advanced", duration:12,
    image:"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&q=80",
    setup:"3020 grid. Defensive team of 4. 5 attackers keep possession.",
    instructions:"Coach calls trigger: 'GK', 'backward pass', 'miscontrol'. Defenders press immediately on trigger.",
    coaching:"Compact shape. Cover shadow. Ball-near player presses  others support.",
    progressions:["No trigger calls  players read it","Wider grid","Add goals to counter-attack"],
    equipment:["8 cones","2 balls","bibs"]
  },
  {
    id:"d11", name:"Wall Pass / One-Two", category:"Passing", skills:["Combination Play","Passing"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Intermediate", duration:10,
    image:"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80",
    setup:"Two rows of cones 12 yards apart. Pairs of players.",
    instructions:"Player A passes to B, B one-touches back, A runs onto it. Switch. Add mini defender to make it live.",
    coaching:"Weight of pass into feet. Return pass into space. Time the run.",
    progressions:["Add passive defender","Speed competition","Link to shooting"],
    equipment:["6 cones","1 ball per pair"]
  },
  {
    id:"d12", name:"Heading Fundamentals", category:"Heading", skills:["Heading"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=400&q=80",
    setup:"Pairs, 8 yards apart. Coach serves high balls.",
    instructions:"Toss-head-catch pairs drill. Progress to heading to target gate. Defensive and attacking headers.",
    coaching:"Eyes open. Attack the ball. Neck firm. Use forehead center.",
    progressions:["Moving cross heading","Contested heading","Defensive clearance","Flick-on"],
    equipment:["6 balls","4 cones"]
  },
  {
    id:"d13", name:"Goalkeeper Shot Stopping", category:"Goalkeeping", skills:["Goalkeeping","Reactions"],
    ageMin:"U8", ageMax:"Adult", difficulty:"Intermediate", duration:12,
    image:"https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=400&q=80",
    setup:"GK in goal. Servers at 16-18 yards.",
    instructions:"Serve low, mid-height, high shots in sequence. GK distributes after each save. Reaction saves off the post.",
    coaching:"Set position. Move feet to get behind ball. Strong hands. Spring off ground.",
    progressions:["Add second ball immediately after save","Crosses combined with shots","Penalty simulation"],
    equipment:["12 balls","1 goal"]
  },
  {
    id:"d14", name:"Possession 5v2 Rondo", category:"Possession", skills:["Passing","First Touch","Decision Making"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Intermediate", duration:12,
    image:"https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=400&q=80",
    setup:"1212 grid. 5 outside, 2 press.",
    instructions:"2-touch max. If defenders win ball they join outside and two worst performers go in.",
    coaching:"Constant movement. Create triangles. Switch point of attack. Never square pass under pressure.",
    progressions:["1-touch only","Directional rondo (score through gates)","Add 3rd defender"],
    equipment:["8 cones","1 ball"]
  },
  {
    id:"d15", name:"Weak Foot Challenge", category:"Dribbling", skills:["Ball Control","Weak Foot"],
    ageMin:"U6", ageMax:"U16", difficulty:"Beginner", duration:8,
    image:"https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80",
    setup:"Open space. Each player with ball.",
    instructions:"All passing, dribbling, shooting done with weaker foot only. Friendly competition  most successful passes in 3 minutes.",
    coaching:"No rush. Slow controlled touches. Celebrate effort not just success.",
    progressions:["Dribble races weak foot","Shoot on goal weak foot only","1v1 weak foot"],
    equipment:["1 ball per player","4 cones"]
  },
  {
    id:"d16", name:"Build-Out Line Practice", category:"Possession", skills:["Teamwork","Positioning"],
    ageMin:"U8", ageMax:"U12", difficulty:"Beginner", duration:12,
    image:"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80",
    setup:"Full small-sided field with build-out line marked.",
    instructions:"GK gets ball. All opponents retreat. Team must build out before crossing. Practice the restart sequence.",
    coaching:"Players move to create angles. GK communicates. No rushing over the line.",
    progressions:["Passive defenders at line","Defenders can press once ball crosses","Time the build-out"],
    equipment:["Cones for build-out line","1 ball","small goals"]
  },
  {
    id:"d17", name:"Speed & Agility Ladder", category:"Fitness", skills:["Speed","Agility"],
    ageMin:"U6", ageMax:"Adult", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&q=80",
    setup:"Agility ladder flat on ground. Cones at end for direction change.",
    instructions:"Various footwork patterns: in-in-out-out, lateral, high knees. End each pattern with a sprint to cone.",
    coaching:"Quick feet. Stay on toes. Pump arms. Eyes forward not on feet.",
    progressions:["With ball at end","Race format","Combine with pass/shoot at end"],
    equipment:["1 agility ladder","4 cones"]
  },
  {
    id:"d18", name:"Positional Rotation Scrimmage", category:"Scrimmage", skills:["Positioning","Teamwork","Decision Making"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Intermediate", duration:20,
    image:"https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80",
    setup:"Half field. Teams of 6-8.",
    instructions:"Every 5 mins, coach calls rotation  all field players shift position clockwise. GK stays.",
    coaching:"Adaptability. Learn what teammates need. Call for ball constantly.",
    progressions:["Free play after rotation period","Score bonus for play from new position","Coach assigns specific formations"],
    equipment:["Bibs","4 cones","2 goals","4 balls"]
  },
  {
    id:"d19", name:"Headers & Volleys", category:"Shooting", skills:["Heading","Shooting","Aerial"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Advanced", duration:12,
    image:"https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80",
    setup:"18-yard box. Servers wide with balls. GK in goal.",
    instructions:"Server crosses, player chooses header or volley. Rotate server/shooter every 6 attempts.",
    coaching:"Commit to the ball early. Call your shot type. GK communication.",
    progressions:["Compete for points","Add CB to contest","Vary delivery heights/speeds"],
    equipment:["12 balls","1 goal","bibs"]
  },
  {
    id:"d20", name:"Throw-In Techniques", category:"Passing", skills:["Throw-ins","Rules"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Beginner", duration:8,
    image:"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80",
    setup:"Sideline. Pairs of players.",
    instructions:"Practice legal throw-in technique. Both feet on ground, ball behind/over head. Target near and far.",
    coaching:"Both feet on or behind line. Full arc over head. Accuracy before distance.",
    progressions:["Long throw specialist training","Throw-in to set piece combination","Pressure  defender marks receiver"],
    equipment:["4 balls","cones marking sideline"]
  },
  {
    id:"d21", name:"Shadow Play  Shape & Movement", category:"Possession", skills:["Positioning","Teamwork"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Advanced", duration:15,
    image:"https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=400&q=80",
    setup:"Full field. Two full teams.",
    instructions:"No opposition. Team moves ball through set phases of play. Coach directs positioning. No pressure.",
    coaching:"Compactness. Width and depth. Movement on and off the ball. Verbal communication.",
    progressions:["Add passive defenders","Add pressing team","Live play from shadow positions"],
    equipment:["4 balls","bibs","cones","2 goals"]
  },
  {
    id:"d22", name:"Defensive Shape  4-block", category:"Defense", skills:["Defending","Teamwork","Positioning"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Advanced", duration:12,
    image:"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&q=80",
    setup:"Half field. Defensive team of 4 vs 5 attackers.",
    instructions:"Defensive block maintains compact shape. Ball-side press, cover side tracks runner. Stay connected.",
    coaching:"Step together. Never let gaps form centrally. Communicate: 'press', 'hold', 'cover'.",
    progressions:["Add midfield line","Live full-sided","Counter on winning the ball"],
    equipment:["Bibs","cones","1 goal","4 balls"]
  },
  {
    id:"d23", name:"Free Kick Combination", category:"Set Pieces", skills:["Set Pieces","Shooting","Teamwork"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Intermediate", duration:12,
    image:"https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80",
    setup:"Balls placed 22-30 yards from goal. Wall set up. GK in place.",
    instructions:"Practice 3 set free kick routines: dummy run, layoff, direct. Rotate who takes.",
    coaching:"Commit to routine. Timing of runners. Shooter: pick corner, trust technique.",
    progressions:["Contested wall","Vary positions","Score competition across routines"],
    equipment:["8 balls","mannequins or players as wall","1 goal"]
  },
  {
    id:"d24", name:"Corner Kick Routines", category:"Set Pieces", skills:["Set Pieces","Heading","Teamwork"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Intermediate", duration:10,
    image:"https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80",
    setup:"Corner flags, full goal, GK.",
    instructions:"Practice 2 attacking corner routines (near post flick, far post delivery). Also: defending corners  zonal vs man-mark.",
    coaching:"Delivery consistency. Runners attack space not the ball. Defenders: don't ball-watch.",
    progressions:["Live defense","Mix in short corners","Score competition"],
    equipment:["10 balls","1 full goal","bibs"]
  },
  {
    id:"d25", name:"Fun Ball Mastery (U6-U8)", category:"Dribbling", skills:["Ball Control","Fun"],
    ageMin:"U6", ageMax:"U8", difficulty:"Beginner", duration:10,
    image:"https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80",
    setup:"Open space. Each child with ball.",
    instructions:"Follow the coach: toe taps, sole rolls, inside-outside, 'stop the ball' freeze. Make it a game  coach calls animal movements.",
    coaching:"Make it FUN. Every child should be laughing. Praise all attempts.",
    progressions:["Add freeze tag with ball","Musical cones","Coach says (Simon says)"],
    equipment:["1 ball per child","10 cones"]
  },
  {
    id:"d26", name:"Nutmeg Challenge", category:"Dribbling", skills:["1v1","Dribbling","Confidence"],
    ageMin:"U8", ageMax:"U14", difficulty:"Beginner", duration:8,
    image:"https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80",
    setup:"Pairs. Defender stands with feet shoulder-width apart.",
    instructions:"Attacker tries to pass ball through defender's legs. 5 attempts, switch. Progress to live 1v1 where nutmeg = 2 points.",
    coaching:"Quick touch. Change of pace. Disguise direction.",
    progressions:["Moving defender","Live 1v1","Nutmeg tournament"],
    equipment:["1 ball per pair"]
  },
  {
    id:"d27", name:"Long Ball & Settle", category:"Passing", skills:["Long Passing","First Touch","Aerial"],
    ageMin:"U12", ageMax:"Adult", difficulty:"Intermediate", duration:10,
    image:"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80",
    setup:"Two groups, 35-40 yards apart.",
    instructions:"Player A drives a long ball. Player B must settle in 1-2 touches and return. Compete for cleanest first touch.",
    coaching:"Non-kicking foot direction. Strike through center. Receiver: soften the touch, cushion it.",
    progressions:["Add defender at receiver end","Settle then beat defender","Vary delivery  lofted and driven"],
    equipment:["8 balls","cones"]
  },
  {
    id:"d28", name:"Juggling Progression", category:"Ball Control", skills:["Ball Control","Technique"],
    ageMin:"U6", ageMax:"Adult", difficulty:"Beginner", duration:8,
    image:"https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80",
    setup:"Open space. 1 ball per player.",
    instructions:"Progression: 1 touch & catch  2 touches  alternating feet  knees  head. Personal best counting.",
    coaching:"Relax. Small touches. Strike through center of ball. No rushing.",
    progressions:["Juggle while moving","Partner juggling","Tricks competition"],
    equipment:["1 ball per player"]
  },
  {
    id:"d29", name:"Penalty Kick Simulation", category:"Shooting", skills:["Shooting","Mental","Pressure"],
    ageMin:"U10", ageMax:"Adult", difficulty:"Intermediate", duration:10,
    image:"https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80",
    setup:"Penalty spot. Full-size or small goal. GK.",
    instructions:"Each player takes a penalty. Elimination format  miss = out. Discuss pre-kick routine first.",
    coaching:"Decide where you're shooting BEFORE the run-up. Commit fully. Trust your technique.",
    progressions:["Walk-up routine","Shootout simulation","Coach adds verbal pressure"],
    equipment:["8 balls","1 goal"]
  },
  {
    id:"d30", name:"4-Goal Game", category:"Scrimmage", skills:["Decision Making","Speed","Teamwork"],
    ageMin:"U8", ageMax:"Adult", difficulty:"Intermediate", duration:20,
    image:"https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80",
    setup:"4030 grid. 4 small goals (2 per team at each end).",
    instructions:"Each team defends 2 goals and attacks 2. Creates constant decision-making and switching play.",
    coaching:"Change point of attack. Track two threats. Communication critical.",
    progressions:["Limit touches","Goals from crosses only","Expand to 5 goals"],
    equipment:["4 small goals","8 cones","4 balls","bibs"]
  },
];

const SKILL_TAGS = [...new Set(DRILLS.flatMap(d => d.skills))].sort();
const CATEGORIES = [...new Set(DRILLS.map(d => d.category))].sort();
const DIFFICULTIES = ["Beginner","Intermediate","Advanced"];

// 
// PRACTICE TEMPLATES BY AGE + FOCUS
// 
function generatePractice(league, focus, skills, duration, allDrills) {
  // Map short age codes to full LEAGUES strings for comparison
  const AGE_MAP = {
    "U6":"U6 / Instructional","U8":"U8 / Passers","U10":"U10 / Wings",
    "U12":"U12 / Strikers","U14":"U14 / Kickers","U16":"U16 / Minors",
    "U19":"U19 / Seniors","Adult":"U19 / Seniors",
  };
  const leagueIdx = LEAGUES.indexOf(league);

  // Filter drills eligible for this age group
  const eligible = allDrills.filter(d => {
    const minIdx = LEAGUES.indexOf(AGE_MAP[d.ageMin] || d.ageMin || "U6 / Instructional");
    const maxIdx = LEAGUES.indexOf(AGE_MAP[d.ageMax] || d.ageMax || "U19 / Seniors");
    const lo = minIdx === -1 ? 0 : minIdx;
    const hi = maxIdx === -1 ? LEAGUES.length - 1 : maxIdx;
    return leagueIdx >= lo && leagueIdx <= hi;
  });

  // Fallback: if filter still yields nothing, use all drills
  const pool = eligible.length > 0 ? eligible : allDrills;

  const isYoung = leagueIdx <= 1; // U6, U8

  // Categorise pool
  const warmupCandidates  = pool.filter(d => ["Dribbling","Passing","Fitness","Ball Control"].includes(d.category));
  const focusCandidates   = pool.filter(d =>
    d.category === focus || (skills.length > 0 && d.skills.some(s => skills.includes(s)))
  );
  const scrimmagePool     = pool.filter(d => d.category === "Scrimmage");
  const generalPool       = pool.filter(d => !["Scrimmage"].includes(d.category));

  // Pick drills  shuffle each pool so we get variety on repeated generates
  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

  const warmup = shuffle(warmupCandidates)[0] || shuffle(generalPool)[0];

  // Main drills: from focus candidates, excluding warmup
  const mainPool = shuffle(focusCandidates.length > 0 ? focusCandidates : generalPool)
    .filter(d => d.id !== warmup?.id);

  // Number of main drills based on duration
  const mainCount = duration <= 30 ? 1 : duration <= 60 ? 2 : 3;
  const mainDrills = mainPool.slice(0, mainCount);

  // If not enough focus drills, pad from general pool
  while (mainDrills.length < mainCount) {
    const extra = shuffle(generalPool).find(d =>
      d.id !== warmup?.id && !mainDrills.find(m => m.id === d.id)
    );
    if (!extra) break;
    mainDrills.push(extra);
  }

  const scrimmage = shuffle(scrimmagePool)[0];

  // Time allocation
  const warmupTime    = isYoung ? 8 : 10;
  const cooldownTime  = 5;
  const scrimmageTime = scrimmage ? (isYoung ? 10 : Math.min(20, Math.round(duration * 0.25))) : 0;
  const mainTotal     = duration - warmupTime - cooldownTime - scrimmageTime;
  const perMain       = mainDrills.length > 0 ? Math.max(8, Math.round(mainTotal / mainDrills.length)) : mainTotal;

  // Build sections
  const sections = [];
  if (warmup) sections.push({ type:"Warm-Up", drill:warmup, time:warmupTime });

  mainDrills.forEach((d, i) => {
    const label = i === 0 ? "Main Activity" : i === 1 ? "Secondary Activity" : "Extension Activity";
    sections.push({ type:label, drill:d, time:perMain });
  });

  if (scrimmage) sections.push({ type:"Scrimmage / Game", drill:scrimmage, time:scrimmageTime });
  sections.push({ type:"Cool Down", drill:null, time:cooldownTime, notes:"Stretching, water, recap key points from today." });

  return sections;
}

// 
// UTILITIES
// 
function uid() { return Math.random().toString(36).slice(2,9); }

function computePlayTime(players, lineupsByQuarter, totalQuarters) {
  const counts = {};
  players.forEach(p => { counts[p.id] = 0; });
  for (let q = 1; q <= totalQuarters; q++) {
    const lineup = lineupsByQuarter[q];
    if (!lineup) continue;
    lineup.starters.forEach(slot => {
      if (slot.player) counts[slot.player.id] = (counts[slot.player.id] || 0) + 1;
    });
  }
  return counts;
}

/**
 * WHOLE-GAME SCHEDULER
 * Plans all 4 quarters at once so every eligible player is guaranteed
 * their minimum play-time quota before higher-rated players get extra time.
 *
 * Algorithm:
 * 1. Each quarter needs `slotsPerQuarter` players on the field.
 * 2. Total field-slots across 4 quarters = slotsPerQuarter  4.
 * 3. Each active player gets at least `minQ` quarters guaranteed.
 * 4. Remaining slots are distributed to highest-rated players.
 * 5. Within each quarter, players are sorted to best-fit positions.
 * 6. Players who sat last quarter get priority for the next one (rotation).
 */
function scheduleWholeGame(players, format, league, lockedLineups = {}, fromQuarter = 1) {
  const TOTAL_Q  = 4;
  const slots    = POSITIONS_BY_FORMAT[format] || POSITIONS_BY_FORMAT["7v7"];
  const slotsPerQ = slots.length;
  const rule     = PLAY_TIME_RULES[league] || { minFraction: 0.5 };
  const minQ     = Math.ceil(rule.minFraction * TOTAL_Q); // e.g. 2 of 4 quarters

  // Shuffle active players so bonus-slot distribution isn't biased
  // by roster order  every fresh plan gives a different player the extra quarter
  const shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const active = shuffle(players.filter(p => !p.injured && !p.out));

  // Count play time already locked in from previous quarters
  const alreadyPlayed = {};
  active.forEach(p => { alreadyPlayed[p.id] = 0; });
  for (let q = 1; q < fromQuarter; q++) {
    const l = lockedLineups[q];
    if (!l) continue;
    l.starters.forEach(s => {
      if (s.player && alreadyPlayed[s.player.id] !== undefined)
        alreadyPlayed[s.player.id]++;
    });
  }

  // Quarters remaining to schedule
  const remainingQs = [];
  for (let q = fromQuarter; q <= TOTAL_Q; q++) remainingQs.push(q);
  const R = remainingQs.length; // number of quarters we're planning

  // Total field-slots to fill across remaining quarters
  const totalSlots = slotsPerQ * R;

  // Assign each player a quota for the REMAINING quarters
  // minQ total  but subtract what they've already played
  const quota = {};
  active.forEach(p => {
    const remaining = Math.max(0, minQ - alreadyPlayed[p.id]);
    quota[p.id] = Math.min(remaining, R); // can't exceed remaining quarters
  });

  // How many total guaranteed slots are spoken for?
  const guaranteedTotal = Object.values(quota).reduce((a, b) => a + b, 0);
  // Remaining free slots go to top-rated players
  const freeSlots = Math.max(0, totalSlots - guaranteedTotal);

  // Rate players
  const rated = [...active].sort((a, b) => getOverallRating(b) - getOverallRating(a));

  // Distribute free slots to highest rated players (round-robin from top)
  const bonusQ = {};
  active.forEach(p => { bonusQ[p.id] = 0; });
  let remaining = freeSlots;
  let round = 0;
  while (remaining > 0) {
    let distributed = false;
    for (const p of rated) {
      const totalAssigned = quota[p.id] + bonusQ[p.id];
      if (totalAssigned < R) {
        bonusQ[p.id]++;
        remaining--;
        distributed = true;
        if (remaining === 0) break;
      }
    }
    if (!distributed) break; // all players maxed out
    round++;
    if (round > 100) break; // safety
  }

  // Final quarters-per-player for remaining schedule
  const qCount = {};
  active.forEach(p => { qCount[p.id] = quota[p.id] + bonusQ[p.id]; });

  // -- QUARTER-BY-QUARTER ASSIGNMENT --
  // Build each quarter's field one slot at a time, quarter in order.
  // Key rule: a player who sat the PREVIOUS quarter is picked FIRST
  // (they have the highest "bench debt"). This guarantees no one
  // sits back-to-back unless every other eligible player is already
  // used up for that quarter.

  const quarterId = {}; // playerId  Set of quarters they play
  active.forEach(p => { quarterId[p.id] = new Set(); });

  // Track how many quarters each player still NEEDS to play
  const qRemaining = {};
  active.forEach(p => { qRemaining[p.id] = qCount[p.id]; });

  // For each quarter, who sat the immediately previous quarter?
  // Seed with locked lineups context for the quarter before fromQuarter.
  const prevQ0 = fromQuarter - 1;
  let sLastQ = new Set( // players benched in the quarter just before we start
    prevQ0 >= 1 && lockedLineups[prevQ0]
      ? active
          .filter(p => !lockedLineups[prevQ0].starters.some(s => s.player?.id === p.id))
          .map(p => p.id)
      : []
  );

  for (const q of remainingQs) {
    const spotsLeft = slotsPerQ;
    const chosen = []; // player ids picked for this quarter

    // Eligible = still has remaining quota > 0 AND hasn't been assigned this quarter
    const eligible = () => active.filter(p =>
      qRemaining[p.id] > 0 && !chosen.includes(p.id)
    );

    // -- Pass 1: fill from players who sat LAST quarter first --
    // Sort bench-debtors by remaining quota desc (highest need first),
    // then by rating desc as tiebreaker
    const debtors = eligible()
      .filter(p => sLastQ.has(p.id))
      .sort((a, b) => qRemaining[b.id] - qRemaining[a.id] || getOverallRating(b) - getOverallRating(a));

    for (const p of debtors) {
      if (chosen.length >= spotsLeft) break;
      chosen.push(p.id);
    }

    // -- Pass 2: fill remaining spots with players who have most quota left 
    const others = eligible()
      .sort((a, b) => qRemaining[b.id] - qRemaining[a.id] || getOverallRating(b) - getOverallRating(a));

    for (const p of others) {
      if (chosen.length >= spotsLeft) break;
      chosen.push(p.id);
    }

    // Commit chosen players to this quarter
    chosen.forEach(id => {
      quarterId[id].add(q);
      qRemaining[id]--;
    });

    // Who sat this quarter? They get priority next quarter.
    sLastQ = new Set(active.filter(p => !chosen.includes(p.id)).map(p => p.id));
  }

  // Build lineups for each remaining quarter
  const result = { ...lockedLineups };

  // Track the last position each player was assigned (to avoid back-to-back repeats)
  // Seed from the last locked quarter if replanning mid-game
  const lastPos = {}; // playerId -> position string they played most recently
  const prevLockedQ = fromQuarter - 1;
  if (prevLockedQ >= 1 && lockedLineups[prevLockedQ]) {
    lockedLineups[prevLockedQ].starters.forEach(s => {
      if (s.player) lastPos[s.player.id] = s.pos;
    });
  }

  for (const q of remainingQs) {
    const starters_pool = active.filter(p => quarterId[p.id].has(q));
    const bench_pool    = active.filter(p => !quarterId[p.id].has(q));

    // For each player starting this quarter, pick a random allowed position
    // that differs from their last position (if they have other options).
    const playerPosThisQ = {}; // playerId -> chosen position for this quarter
    for (const p of starters_pool) {
      const allowed = p.positions && p.positions.length > 0
        ? p.positions
        : ["CM"]; // fallback if somehow empty
      // Prefer positions that aren't the same as last quarter
      const fresh = allowed.filter(pos => pos !== lastPos[p.id]);
      const pool  = fresh.length > 0 ? fresh : allowed;
      playerPosThisQ[p.id] = pool[Math.floor(Math.random() * pool.length)];
    }

    // Now assign players to the formation slots.
    // Slots are defined by the formation (e.g. GK, LD, RD, LM, RM, CF).
    // For each slot, find the best unassigned player whose chosen position
    // matches that slot. Fallback to any unassigned player.
    const assigned = new Set();

    // Shuffle starters_pool so tie-breaking is random (not roster-order biased)
    const shuffledPool = [...starters_pool].sort(() => Math.random() - 0.5);

    const starters = slots.map(slotPos => {
      // Pass 1: player whose randomly chosen position matches this slot exactly
      let pick = shuffledPool.find(p => !assigned.has(p.id) && playerPosThisQ[p.id] === slotPos);
      // Pass 2: player whose allowed positions include this slot
      if (!pick) pick = shuffledPool.find(p => !assigned.has(p.id) && (p.positions||[]).includes(slotPos));
      // Pass 3: any unassigned player (guaranteed fill)
      if (!pick) pick = shuffledPool.find(p => !assigned.has(p.id));
      if (pick) {
        assigned.add(pick.id);
        // Record the actual slot position they ended up in (not just their chosen one)
        lastPos[pick.id] = slotPos;
      }
      return { pos: slotPos, player: pick || null };
    });

    result[q] = { starters, bench: bench_pool };
  }

  return result;
}

// Single-quarter wrapper (used for manual regen of one quarter only)
function autoLineupWithRanking(players, format, quarter, lineupsByQuarter, totalQuarters, league) {
  const all = scheduleWholeGame(players, format, league, lineupsByQuarter, quarter);
  return all[quarter];
}

function getOverallRating(player) {
  if (!player.ratings) return 0;
  const vals = Object.values(player.ratings).filter(v => v > 0);
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
}

// 
// STYLE CONSTANTS
// 
const C = {
  bg:       "#0a0d0f",
  surface:  "rgba(255,255,255,0.04)",
  border:   "rgba(255,255,255,0.08)",
  gold:     "#e8a020",
  goldDark: "#b87818",
  green:    "#1e4d2b",
  text:     "#e8e4dc",
  muted:    "#7a7570",
  danger:   "#c0392b",
  warn:     "#d35400",
  ok:       "#27ae60",
};

const IS = {
  background: `rgba(255,255,255,0.06)`,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.text,
  padding: "8px 11px",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const SS = { ...IS, cursor: "pointer" };

function Btn({ children, onClick, sm, danger, warn, primary, ghost, disabled, full, style:sx }) {
  const bg = danger ? C.danger : warn ? C.warn : primary ? `linear-gradient(135deg,${C.gold},${C.goldDark})` : ghost ? "transparent" : "rgba(255,255,255,0.1)";
  const col = primary ? "#0a0d0f" : C.text;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: sm ? "5px 11px" : "9px 18px",
      borderRadius: 7, border: ghost ? `1px solid ${C.border}` : "none",
      cursor: disabled ? "not-allowed" : "pointer",
      fontWeight: 600, fontSize: sm ? 11 : 13,
      fontFamily: "inherit",
      background: bg, color: col,
      opacity: disabled ? 0.45 : 1,
      width: full ? "100%" : undefined,
      transition: "opacity 0.15s",
      ...sx,
    }}>{children}</button>
  );
}

const lbl = {
  display: "block", fontSize: 10, color: C.muted, marginBottom: 5,
  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
};

function Card({ children, style: sx }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "14px 16px", ...sx,
    }}>{children}</div>
  );
}

function StarRating({ value, onChange, max=5, size=16 }) {
  const starPath = "M10 1.5l2.59 5.96L19 8.13l-5 4.36L15.5 19 10 15.77 4.5 19 6 12.49 1 8.13l6.41-.67z";
  return (
    <div style={{ display:"flex", gap: 2, alignItems:"center" }}>
      {Array.from({length:max},(_,i) => {
        const filled = i < value;
        const next = value === i+1 ? 0 : i+1;   // click same rank to clear
        return (
          <button key={i} type="button" onClick={() => onChange(next)}
            title={`${i+1} of ${max}`} aria-label={`Rate ${i+1}`}
            style={{
              background:"none", border:"none", cursor:"pointer",
              padding: 2, lineHeight: 0, display:"inline-flex",
            }}>
            <svg width={size} height={size} viewBox="0 0 20 20" style={{display:"block"}}>
              <path d={starPath}
                fill={filled ? C.gold : "none"}
                stroke={filled ? C.gold : "rgba(255,255,255,0.35)"}
                strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// 
// SOCCER FIELD with DRAG & DROP
// 
function SoccerField({ lineup, onSwap, format, quarter }) {
  const [dragging, setDragging] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!lineup) return (
    <div style={{
      background: C.surface, borderRadius: 12, minHeight: 320,
      border: `2px dashed ${C.border}`, display:"flex", alignItems:"center",
      justifyContent:"center", color: C.muted, fontSize: 13, textAlign:"center", padding: 20,
    }}>
      Generate or load a lineup<br/>to see the field view
    </div>
  );

  const slots = lineup.starters || [];
  const totalByPos = {};
  slots.forEach(s => { totalByPos[s.pos] = (totalByPos[s.pos]||0)+1; });
  const idxByPos = {};

  return (
    <div style={{ position:"relative", width:"100%", maxWidth:320, margin:"0 auto", userSelect:"none" }}>
      <svg viewBox="0 0 320 480" style={{ width:"100%", display:"block", borderRadius:10 }}>
        <rect x="5" y="5" width="310" height="470" rx="8" fill="#1e4d1a" stroke="#fff" strokeWidth="1.5"/>
        <rect x="5" y="5" width="310" height="470" rx="8" fill="url(#grass)"/>
        <defs>
          <pattern id="grass" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="#1e4d1a"/>
            <rect width="10" height="20" fill="#1a4518"/>
          </pattern>
          <linearGradient id="qpill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4c442"/><stop offset="100%" stopColor="#b87818"/>
          </linearGradient>
          <linearGradient id="qpill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5dadec"/><stop offset="100%" stopColor="#2471a3"/>
          </linearGradient>
          <linearGradient id="qpill3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c88ce0"/><stop offset="100%" stopColor="#7d3c98"/>
          </linearGradient>
          <linearGradient id="qpill4" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec7063"/><stop offset="100%" stopColor="#a93226"/>
          </linearGradient>
          <filter id="qpillshadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.7"/>
          </filter>
        </defs>
        <line x1="5" y1="242" x2="315" y2="242" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeDasharray="5,4"/>
        <circle cx="160" cy="242" r="42" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>
        <circle cx="160" cy="242" r="3" fill="rgba(255,255,255,0.8)"/>
        <rect x="80" y="5" width="160" height="75" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>
        <rect x="110" y="5" width="100" height="38" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>
        <rect x="135" y="5" width="50" height="14" fill="rgba(255,255,255,0.15)"/>
        <rect x="80" y="400" width="160" height="75" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>
        <rect x="110" y="437" width="100" height="38" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>
        <rect x="135" y="461" width="50" height="14" fill="rgba(255,255,255,0.15)"/>
        <circle cx="160" cy="415" r="3" fill="rgba(255,255,255,0.6)"/>
        <circle cx="160" cy="65" r="3" fill="rgba(255,255,255,0.6)"/>
        {/* Quarter callout  color-coded pill in top-left */}
        {quarter && (
          <g filter="url(#qpillshadow)">
            <rect x="12" y="12" width="62" height="34" rx="8" fill={`url(#qpill${quarter})`}/>
            <rect x="12" y="12" width="62" height="34" rx="8" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1.5"/>
            <rect x="12" y="12" width="62" height="34" rx="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" transform="translate(0,1)"/>
            <text x="43" y="36" textAnchor="middle" fill="#0a0d0f"
              fontFamily="Arial, sans-serif" fontWeight="900" fontSize="20" letterSpacing="0.5">Q{quarter}</text>
          </g>
        )}
      </svg>

      {slots.map((slot, idx) => {
        const pos = slot.pos;
        if (!idxByPos[pos]) idxByPos[pos] = 0;
        const posIdx = idxByPos[pos];
        const total = totalByPos[pos];
        const base = FIELD_BASE[pos] || {x:50,y:50};
        const spread = total > 1 ? (posIdx - (total-1)/2) * (52/total) : 0;
        const fx = base.x + spread * 0.7;
        idxByPos[pos]++;

        const px = 5 + (fx/100)*310;
        const py = 5 + (base.y/100)*470;
        const isDraggingThis = dragging === idx;
        const isHovered = hoverIdx === idx;
        const rating = slot.player ? getOverallRating(slot.player) : 0;

        return (
          <div key={idx}
            draggable={!!slot.player}
            onDragStart={() => setDragging(idx)}
            onDragEnd={() => { setDragging(null); setHoverIdx(null); }}
            onDragOver={e => { e.preventDefault(); setHoverIdx(idx); }}
            onDrop={e => { e.preventDefault(); if (dragging !== null && dragging !== idx) { onSwap(dragging, idx); } setDragging(null); setHoverIdx(null); }}
            style={{
              position:"absolute",
              left:`calc(${(px/320)*100}% - 22px)`,
              top:`calc(${(py/480)*100}% - 26px)`,
              textAlign:"center", width:44,
              cursor: slot.player ? "grab" : "default",
              opacity: isDraggingThis ? 0.4 : 1,
              zIndex: isDraggingThis ? 10 : 1,
              transition: "opacity 0.15s",
            }}>
            <div style={{
              width: 38, height: 38, borderRadius:"50%", margin:"0 auto",
              background: isHovered && dragging !== null && dragging !== idx
                ? `linear-gradient(135deg,#fff,${C.gold})`
                : slot.player
                  ? `linear-gradient(135deg,${C.gold},${C.goldDark})`
                  : "rgba(255,255,255,0.1)",
              border: isHovered && dragging !== null ? `2px solid #fff` : "2px solid rgba(255,255,255,0.8)",
              display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", boxShadow: slot.player ? "0 2px 10px rgba(0,0,0,0.6)" : "none",
              transition: "all 0.15s",
            }}>
              {slot.player ? (
                <>
                  <div style={{fontSize:8,color:"#1a1a1a",lineHeight:1,fontWeight:700}}>{slot.player.number}</div>
                  <div style={{fontSize:7,color:"#2a1a0a",lineHeight:1,maxWidth:34,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600}}>
                    {slot.player.name?.split(" ")[0]}
                  </div>
                  {rating > 0 && <div style={{fontSize:6,color:"#2a1a0a",lineHeight:1}}>{"".repeat(Math.round(rating))}</div>}
                </>
              ) : <span style={{color:"rgba(255,255,255,0.4)",fontSize:10}}></span>}
            </div>
            <div style={{fontSize:8,color:"#fff",fontWeight:700,textShadow:"0 1px 3px rgba(0,0,0,0.9)",marginTop:2,letterSpacing:"0.03em"}}>{pos}</div>
          </div>
        );
      })}
    </div>
  );
}

// 
// MID-GAME INJURY BANNER
// 
function InjuryAlert({ player, quarter, onDismiss }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, [player.id]);

  if (!visible) return null;
  return (
    <div style={{
      position:"fixed", top:16, right:16, zIndex:9999,
      background:"linear-gradient(135deg,#7b0000,#c0392b)",
      border:"2px solid #e74c3c",
      borderRadius:12, padding:"14px 18px", maxWidth:300,
      boxShadow:"0 8px 32px rgba(199,57,45,0.5)",
      animation:"slideIn 0.3s ease",
    }}>
      <style>{`@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:24,lineHeight:1}}></span>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:14,color:"#fff",marginBottom:2}}>Mid-Game Injury</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.85)"}}>
            <b>#{player.number} {player.name}</b> marked injured in Q{quarter}.<br/>
            Remaining quarters will auto-regenerate.
          </div>
        </div>
        <button onClick={()=>{setVisible(false);onDismiss();}} style={{
          background:"none",border:"none",color:"rgba(255,255,255,0.6)",
          cursor:"pointer",fontSize:16,lineHeight:1,padding:0,
        }}></button>
      </div>
    </div>
  );
}

//
// WEATHER BUTTON  compact game-day weather check (used in App header)
//
function WeatherButton() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const fetchWeather = () => {
    if (!navigator.geolocation) { setErr("Geo not supported"); return; }
    setLoading(true); setErr(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,wind_speed_10m,precipitation_probability,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
        const r = await fetch(url);
        const j = await r.json();
        const c = j.current || {};
        const codeMap = { 0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Cloudy",45:"Foggy",48:"Foggy",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm" };
        setWeather({
          temp: Math.round(c.temperature_2m),
          feels: Math.round(c.apparent_temperature),
          wind: Math.round(c.wind_speed_10m),
          precip: c.precipitation_probability ?? 0,
          desc: codeMap[c.weather_code] || "Unknown",
        });
        setLoading(false);
      } catch (e) { setErr("Fetch failed"); setLoading(false); }
    }, () => { setErr("Location denied"); setLoading(false); });
  };

  if (loading) return <div style={{fontSize:11,color:C.muted,padding:"4px 10px"}}>Loading</div>;
  if (err) return (
    <button onClick={fetchWeather} style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:"#e74c3c",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{err}  retry</button>
  );
  if (!weather) return (
    <button onClick={fetchWeather} style={{
      padding:"6px 12px",borderRadius:7,
      border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",
      color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.03em",textTransform:"uppercase",
    }}>Game Day Weather</button>
  );
  return (
    <div onClick={fetchWeather} title="Click to refresh" style={{
      display:"flex",alignItems:"center",gap:8,padding:"4px 10px",
      background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,
      cursor:"pointer",fontFamily:"inherit",
    }}>
      <div style={{textAlign:"left"}}>
        <div style={{fontSize:14,fontWeight:800,color:C.text,lineHeight:1}}>{weather.temp}F</div>
        <div style={{fontSize:9,color:C.muted,lineHeight:1.2,marginTop:1}}>{weather.desc}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:1,alignItems:"flex-end",fontSize:9,color:C.muted}}>
        <div>{weather.wind} mph</div>
        <div>{weather.precip}% rain</div>
      </div>
    </div>
  );
}

//
// PLAYER EDIT PANEL  inline editor for a single player (used in Play Time tracker)
//
function PlayerEditPanel({ player, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState(player.name);
  const [num,  setNum]  = useState(player.number);

  const saveBasics = () => onUpdate({ ...player, name, number: num });
  const togglePosition = (pos) => {
    const cur = player.positions || [];
    const next = cur.includes(pos) ? cur.filter(x => x !== pos) : [...cur, pos];
    onUpdate({ ...player, name, number: num, positions: next });
  };
  const setRating = (cat, val) => {
    onUpdate({ ...player, ratings: { ...(player.ratings || {}), [cat]: val } });
  };

  const overall = getOverallRating(player);
  const positions = player.positions || [];

  return (
    <div style={{
      marginTop: 6, padding: "10px 10px 10px",
      background: "rgba(0,0,0,0.25)",
      borderRadius: 6, border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={saveBasics}
            style={{ ...IS, fontSize: 11, padding: "5px 8px", width: "100%" }} />
        </div>
        <div style={{ width: 50, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>#</div>
          <input value={num} onChange={e => setNum(e.target.value)} onBlur={saveBasics}
            style={{ ...IS, fontSize: 11, padding: "5px 8px", width: "100%" }} />
        </div>
      </div>

      <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Positions</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
        {ALL_POSITIONS.map(p => (
          <button key={p} onClick={() => togglePosition(p)} style={{
            padding: "3px 7px", borderRadius: 3, border: "none", cursor: "pointer",
            fontSize: 9, fontWeight: 700, fontFamily: "inherit",
            background: positions.includes(p) ? C.gold : "rgba(255,255,255,0.08)",
            color: positions.includes(p) ? "#0a0d0f" : C.muted,
          }}>{p}</button>
        ))}
      </div>

      <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Skill Ratings</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", marginBottom: 10 }}>
        {SKILL_CATEGORIES.map(cat => (
          <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 10, color: C.text }}>{cat}</div>
            <StarRating value={(player.ratings || {})[cat] || 0} onChange={v => setRating(cat, v)} />
          </div>
        ))}
      </div>
      {overall > 0 && (
        <div style={{ fontSize: 10, color: C.gold, marginBottom: 8, textAlign: "right" }}>
          Overall: {overall.toFixed(1)} / 5
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => { onDelete(player.id); onClose(); }} style={{
          flex: 1, padding: "6px 10px", borderRadius: 5,
          border: "1px solid rgba(192,57,43,0.6)", cursor: "pointer",
          fontSize: 10, fontWeight: 800, fontFamily: "inherit",
          background: "rgba(192,57,43,0.85)", color: "#fff",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Delete from Roster</button>
        <button onClick={onClose} style={{
          padding: "6px 14px", borderRadius: 5,
          border: `1px solid ${C.border}`, cursor: "pointer",
          fontSize: 10, fontWeight: 800, fontFamily: "inherit",
          background: "rgba(255,255,255,0.06)", color: C.text,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Done</button>
      </div>
    </div>
  );
}

//
// TAB: GAME DAY
//
function TabGame({ format, league, onLeagueChange, onFormatChange, players, setPlayers, addPlayer, removePlayer, lineupsByQuarter, setLineupsByQuarter }) {
  const [quarter,       setQuarter]       = useState(1);
  const [injuryAlerts,  setInjuryAlerts]  = useState([]);
  const [justRegenned,  setJustRegenned]  = useState(false);
  const [showRotation,  setShowRotation]  = useState(false);
  const [showFormations,setShowFormations]= useState(false);
  const [activeFormation,setActiveFormation]=useState("2-2-1");
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [rosterSort,    setRosterSort]    = useState("name"); // name | rating | position
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newName,       setNewName]       = useState("");
  const [newNum,        setNewNum]        = useState("");
  const swipeTouchStart = useRef(null);

  // When format changes, reset to a valid strategy for the new player count
  useEffect(() => {
    const templates = FORMATION_TEMPLATES[format] || [];
    if (templates.length === 0) return;
    const stillValid = templates.some(t => t.name === activeFormation);
    if (!stillValid) setActiveFormation(templates[0].name);
  }, [format]);

  // Roster helpers exposed inside the Play Time tracker
  const updatePlayer = (p) => setPlayers(prev => prev.map(x => x.id === p.id ? p : x));
  const handleAddPlayer = () => {
    if (!newName.trim() || !addPlayer) return;
    addPlayer({
      name: newName.trim(),
      number: newNum || String(players.length + 1),
      positions: [...ALL_POS_DEFAULT],
      injured: false, out: false, ratings: {},
    });
    setNewName(""); setNewNum("");
  };

  // -- SCORE TRACKER ----
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [opponent,  setOpponent]  = useState("");
  const [editOpp,   setEditOpp]   = useState(false);

  // -- SHARE LINEUP --
  const [showShare, setShowShare] = useState(false);
  const shareCanvasRef = useRef(null);

  const totalQuarters = 4;
  const rule   = PLAY_TIME_RULES[league] || { minFraction: 0, note: "" };
  const minQ   = Math.ceil(rule.minFraction * totalQuarters);

  const playCounts     = computePlayTime(players, lineupsByQuarter, totalQuarters);
  const currentLineup  = lineupsByQuarter[quarter] || null;
  const active         = players.filter(p => !p.injured && !p.out);
  const needed         = (POSITIONS_BY_FORMAT[format] || []).length;
  const midGameInjured = players.filter(p => p.midGameInjury);
  const allPlanned     = [1,2,3,4].every(q => !!lineupsByQuarter[q]);

  // Check if anyone is below min quota (across planned quarters)
  const violations = active.filter(p => {
    const played = playCounts[p.id] || 0;
    return allPlanned && played < minQ && !p.midGameInjury;
  });

  // -- Plan entire game from scratch (or from a quarter onwards) --
  const planWholeGame = (fromQ = 1) => {
    // Full replanning from Q1 = completely fresh slate, no locked quarters
    // Partial replanning (fromQ > 1) = keep earlier quarters, redo the rest
    const locked = {};
    if (fromQ > 1) {
      for (let q = 1; q < fromQ; q++) {
        if (lineupsByQuarter[q]) locked[q] = lineupsByQuarter[q];
      }
    }
    const result = scheduleWholeGame(players, format, league, locked, fromQ);
    setLineupsByQuarter(result);
    setJustRegenned(true);
    setTimeout(() => setJustRegenned(false), 2500);
  };

  // -- Regen remaining quarters (respects locked earlier quarters) --
  const regenRemaining = (fromQuarter, updatedPlayers, baseLineups) => {
    const locked = {};
    for (let q = 1; q < fromQuarter; q++) {
      if (baseLineups[q]) locked[q] = baseLineups[q];
    }
    const result = scheduleWholeGame(updatedPlayers, format, league, locked, fromQuarter);
    // Merge locked earlier quarters with the newly-planned remaining ones
    setLineupsByQuarter({ ...locked, ...result });
    setJustRegenned(true);
    setTimeout(() => setJustRegenned(false), 2500);
  };

  // -- Injury: pull player from current Q, regen rest --
  const markMidGameInjury = (playerId) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const updatedPlayers = players.map(p =>
      p.id === playerId
        ? { ...p, injured: true, midGameInjury: true, injuredInQuarter: quarter }
        : p
    );
    setPlayers(updatedPlayers);
    setInjuryAlerts(prev => [...prev, { player, quarter, id: Date.now() }]);

    // Pull from current quarter immediately  sub in first bench player
    const currentL = lineupsByQuarter[quarter];
    let baseLineups = { ...lineupsByQuarter };
    if (currentL) {
      const benchAvail = (currentL.bench || []).filter(p => p.id !== playerId);
      const sub = benchAvail[0] || null;
      const newStarters = currentL.starters.map(slot => {
        if (slot.player?.id !== playerId) return slot;
        return sub ? { ...slot, player: sub } : { ...slot, player: null };
      });
      const newBench = benchAvail.slice(sub ? 1 : 0);
      baseLineups[quarter] = { starters: newStarters, bench: newBench };
    }

    // Regen Q+1 onwards without this player
    const locked = {};
    for (let q = 1; q <= quarter; q++) {
      if (baseLineups[q]) locked[q] = baseLineups[q];
    }
    const result = scheduleWholeGame(updatedPlayers, format, league, locked, quarter + 1);
    setLineupsByQuarter({ ...baseLineups, ...result });
    setJustRegenned(true);
    setTimeout(() => setJustRegenned(false), 2500);
  };

  const clearMidGameInjury = (playerId) => {
    const updatedPlayers = players.map(p =>
      p.id === playerId
        ? { ...p, injured: false, midGameInjury: false, injuredInQuarter: null }
        : p
    );
    setPlayers(updatedPlayers);
    regenRemaining(quarter, updatedPlayers, lineupsByQuarter);
  };

  const handleSwap = (idxA, idxB) => {
    if (!currentLineup) return;
    const newStarters = [...currentLineup.starters];
    const temp = newStarters[idxA];
    newStarters[idxA] = newStarters[idxB];
    newStarters[idxB] = temp;
    setLineupsByQuarter(prev => ({ ...prev, [quarter]: { ...currentLineup, starters: newStarters } }));
  };

  const onFieldIds = new Set(
    (currentLineup?.starters || []).filter(s => s.player).map(s => s.player.id)
  );

  // Build rotation grid: rows = players, cols = Q1Q4
  const allTrackedPlayers = [...active, ...midGameInjured];
  const rotationGrid = allTrackedPlayers.map(p => ({
    player: p,
    quarters: [1,2,3,4].map(q => {
      const lineup = lineupsByQuarter[q];
      if (!lineup) return "unplanned";
      const onField = lineup.starters.some(s => s.player?.id === p.id);
      return onField ? "on" : "bench";
    }),
    totalPlanned: [1,2,3,4].filter(q => {
      const l = lineupsByQuarter[q];
      return l && l.starters.some(s => s.player?.id === p.id);
    }).length,
  }));

  return (
    <div>
      {/* Injury alerts */}
      {injuryAlerts.map(alert => (
        <InjuryAlert key={alert.id} player={alert.player} quarter={alert.quarter}
          onDismiss={() => setInjuryAlerts(prev => prev.filter(a => a.id !== alert.id))}/>
      ))}

      {/* SCORE TRACKER */}
      <div style={{
        background:"linear-gradient(135deg,rgba(30,77,26,0.4),rgba(10,13,15,0.6))",
        border:`1px solid rgba(232,160,32,0.25)`,
        borderRadius:14, padding:"14px 16px", marginBottom:12,
      }}>
        {/* Opponent name */}
        <div style={{textAlign:"center",marginBottom:10}}>
          {editOpp ? (
            <input
              autoFocus
              value={opponent}
              onChange={e=>setOpponent(e.target.value)}
              onBlur={()=>setEditOpp(false)}
              onKeyDown={e=>e.key==="Enter"&&setEditOpp(false)}
              placeholder="Opponent name"
              style={{...IS, textAlign:"center", fontSize:13, maxWidth:200, padding:"4px 10px"}}
            />
          ) : (
            <div onClick={()=>setEditOpp(true)} style={{
              fontSize:12,color:C.muted,cursor:"pointer",display:"inline-flex",
              alignItems:"center",gap:5,
            }}>
              {opponent||"Tap to set opponent"} <span style={{fontSize:10,opacity:0.5}}></span>
            </div>
          )}
        </div>
        {/* Score display */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
          {/* Home (Us) */}
          <div style={{textAlign:"center",flex:1}}>
            <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>Us</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <button onClick={()=>setHomeScore(s=>Math.max(0,s-1))} style={{
                width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",
                background:"rgba(255,255,255,0.08)",color:C.text,fontSize:20,fontWeight:300,lineHeight:1,
              }}>-</button>
              <div style={{fontSize:52,fontWeight:900,color:C.gold,lineHeight:1,minWidth:56,textAlign:"center",
                textShadow:`0 0 30px ${C.gold}66`}}>{homeScore}</div>
              <button onClick={()=>setHomeScore(s=>s+1)} style={{
                width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",
                background:"rgba(39,174,96,0.2)",color:C.ok,fontSize:20,fontWeight:700,lineHeight:1,
              }}>+</button>
            </div>
          </div>

          {/* Divider */}
          <div style={{fontSize:28,color:"rgba(255,255,255,0.15)",fontWeight:200,padding:"0 8px",alignSelf:"center"}}>:</div>

          {/* Away (Them) */}
          <div style={{textAlign:"center",flex:1}}>
            <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
              {opponent||"Them"}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <button onClick={()=>setAwayScore(s=>Math.max(0,s-1))} style={{
                width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",
                background:"rgba(255,255,255,0.08)",color:C.text,fontSize:20,fontWeight:300,lineHeight:1,
              }}>-</button>
              <div style={{fontSize:52,fontWeight:900,color:homeScore>awayScore?C.text:homeScore<awayScore?"#e74c3c":C.text,
                lineHeight:1,minWidth:56,textAlign:"center"}}>{awayScore}</div>
              <button onClick={()=>setAwayScore(s=>s+1)} style={{
                width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",
                background:"rgba(231,76,60,0.15)",color:"#e74c3c",fontSize:20,fontWeight:700,lineHeight:1,
              }}>+</button>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10}}>
          <div style={{fontSize:11,fontWeight:700,
            color:homeScore>awayScore?C.ok:homeScore<awayScore?"#e74c3c":C.muted}}>
            {homeScore>awayScore?" Winning":homeScore<awayScore?" Trailing":" Tied"}
            {homeScore-awayScore>5 && <span style={{color:"#e67e22"}}>   Blowout Rule</span>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{setHomeScore(0);setAwayScore(0);}} style={{
              padding:"4px 10px",borderRadius:6,border:`1px solid ${C.border}`,
              background:"transparent",color:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            }}>Reset Score</button>
          </div>
        </div>
      </div>

      {/* Success flash */}
      {justRegenned && (
        <div style={{
          background:"rgba(39,174,96,0.12)", border:"1px solid rgba(39,174,96,0.35)",
          borderRadius:9, padding:"10px 14px", marginBottom:14,
          fontSize:12, color:"#2ecc71", fontWeight:600,
        }}>
           All quarters planned  every eligible player meets the minimum play-time rule.
        </div>
      )}

      {/* Play-time violation warning */}
      {violations.length > 0 && (
        <div style={{
          background:"rgba(211,84,0,0.1)", border:"1px solid rgba(211,84,0,0.35)",
          borderRadius:9, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.gold,
        }}>
           <b>{violations.length} player{violations.length>1?"s":""}</b> still below the {minQ}-quarter minimum:&nbsp;
          {violations.map(p=>p.name.split(" ")[0]).join(", ")}. Hit <b>Plan Full Game</b> to fix.
        </div>
      )}

      {/* Mid-game injury strip */}
      {midGameInjured.length > 0 && (
        <div style={{
          background:"rgba(120,0,0,0.2)", border:"1px solid rgba(231,76,60,0.4)",
          borderRadius:10, padding:"10px 14px", marginBottom:14,
        }}>
          <div style={{fontSize:11,color:"#e74c3c",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>
             Mid-Game Injuries
          </div>
          {midGameInjured.map(p => (
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:"1px solid rgba(231,76,60,0.12)"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:"#7b0000",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,flexShrink:0}}>{p.number}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:"#e74c3c",fontWeight:600}}>{p.name}</div>
                <div style={{fontSize:10,color:"rgba(231,76,60,0.65)"}}>Injured Q{p.injuredInQuarter}  remaining quarters adjusted</div>
              </div>
              <button onClick={() => clearMidGameInjury(p.id)} style={{
                background:"rgba(39,174,96,0.15)",border:"1px solid rgba(39,174,96,0.35)",
                borderRadius:6,cursor:"pointer",fontSize:11,color:"#2ecc71",
                padding:"3px 9px",fontWeight:600,fontFamily:"inherit",
              }}> Return</button>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>

        {/* -- LEFT PANEL (Play Time, Strategy, etc.) -- */}
        <div style={{flex:"1 1 320px",minWidth:0,maxWidth:400}}>

          {/* League + Format selectors  above Strategy */}
          <Card style={{marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{...lbl,marginBottom:4}}>League</label>
                <select value={league} onChange={e=>onLeagueChange&&onLeagueChange(e.target.value)}
                  style={{...SS,width:"100%",fontSize:12,padding:"6px 8px"}}>
                  {LEAGUES.map(l=><option key={l} value={l}>{leagueShortLabel(l)}</option>)}
                </select>
              </div>
              <div>
                <label style={{...lbl,marginBottom:4,display:"flex",alignItems:"center",gap:4}}>
                  <span>Format</span>
                  {format !== leagueDefaultFormat(league) && (
                    <span style={{fontSize:8,color:C.gold,fontWeight:700,letterSpacing:"0.04em"}}>OVERRIDE</span>
                  )}
                </label>
                <select value={format} onChange={e=>onFormatChange&&onFormatChange(e.target.value)}
                  style={{...SS,width:"100%",fontSize:12,padding:"6px 8px"}}>
                  {FORMATS.map(f=><option key={f} value={f}>{f}{f===leagueDefaultFormat(league)?"  default":""}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Strategy / Formation Picker  minimized */}
          <Card style={{marginBottom:14}}>
            {(() => {
              const templates = FORMATION_TEMPLATES[format] || [];
              const active = templates.find(t => t.name === activeFormation) || templates[0];
              const handleApply = () => {
                const tmpl = templates.find(t => t.name === activeFormation) || active;
                if (!tmpl) return;
                const customSlots = tmpl.slots;
                if (lineupsByQuarter[quarter]) {
                  const allAvail = [
                    ...(lineupsByQuarter[quarter].starters||[]).filter(s=>s.player).map(s=>s.player),
                    ...(lineupsByQuarter[quarter].bench||[]),
                  ];
                  const assigned = new Set();
                  const newStarters = customSlots.map(pos => {
                    let best = allAvail.find(p => !assigned.has(p.id) && (p.positions||[]).includes(pos));
                    if (!best) best = allAvail.find(p => !assigned.has(p.id));
                    if (best) assigned.add(best.id);
                    return { pos, player: best || null };
                  });
                  const newBench = allAvail.filter(p => !assigned.has(p.id));
                  setLineupsByQuarter(prev => ({ ...prev, [quarter]: { starters: newStarters, bench: newBench } }));
                }
              };
              return (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
                    <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Strategy</div>
                    <div style={{fontSize:20,fontWeight:900,color:C.gold,letterSpacing:"0.02em"}}>
                      {active ? active.name : "  "}
                    </div>
                  </div>
                  <select value={activeFormation} onChange={e=>setActiveFormation(e.target.value)}
                    style={{...SS, width:"100%", marginBottom:8, fontSize:12, padding:"7px 8px"}}>
                    {templates.map(t => (
                      <option key={t.name} value={t.name}>{t.name}  {t.label}</option>
                    ))}
                  </select>
                  {active && (
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:10,padding:"6px 9px",background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:6}}>
                      {active.desc}
                    </div>
                  )}
                  <Btn primary full onClick={handleApply}>Apply to Q{quarter}</Btn>
                </div>
              );
            })()}
          </Card>

          {/* Quarter tabs */}
          <label style={lbl}>Viewing Quarter</label>
          <div style={{display:"flex",gap:5,marginBottom:14}}>
            {[1,2,3,4].map(q => {
              const hasLineup = !!lineupsByQuarter[q];
              const hasInjury = midGameInjured.some(p => p.injuredInQuarter === q);
              return (
                <button key={q} onClick={() => setQuarter(q)} style={{
                  flex:1, padding:"7px 0", borderRadius:7, border:"none", cursor:"pointer",
                  fontWeight:700, fontSize:13, fontFamily:"inherit",
                  background: quarter===q ? `linear-gradient(135deg,${C.gold},${C.goldDark})` : C.surface,
                  color: quarter===q ? "#0a0d0f" : C.text,
                  boxShadow: hasLineup ? `0 0 0 1px ${hasInjury?"#e74c3c55":C.gold+"44"}` : "none",
                }}>
                  Q{q}
                  <span style={{display:"block",fontSize:8,lineHeight:1.2,opacity:0.75,marginTop:1}}>
                    {hasLineup ? (hasInjury ? "" : "") : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {/* PRIMARY ACTION */}
          <div style={{marginBottom:14}}>
            <Btn primary full onClick={() => planWholeGame(1)} style={{marginBottom:6,padding:"11px 18px",fontSize:13}}>
               Plan Full Game (Q1Q4)
            </Btn>
            <div style={{fontSize:10,color:C.muted,lineHeight:1.5,textAlign:"center"}}>
              Schedules all 4 quarters at once, guaranteeing every player gets {minQ} quarter{minQ!==1?"s":""} of play.
            </div>
          </div>

          {/* Secondary: regen from current quarter */}
          {allPlanned && (
            <Btn full ghost onClick={() => planWholeGame(quarter)} style={{marginBottom:14,fontSize:11}}>
               Replan Q{quarter}Q4 (keep Q1{quarter>1?`Q${quarter-1}`:""})
            </Btn>
          )}

          {/* Play-time tracker + roster manager */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Play Time</div>
              {allPlanned
                ? <div style={{fontSize:9,fontWeight:700,color:violations.length===0?C.ok:C.gold,background:violations.length===0?"rgba(39,174,96,0.15)":"rgba(211,84,0,0.15)",padding:"2px 7px",borderRadius:4}}>
                    {violations.length===0?" ALL MET":" VIOLATIONS"}
                  </div>
                : <div style={{fontSize:9,color:C.muted}}>not fully planned</div>
              }
            </div>

            {/* Sort + add roster controls */}
            <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
              <span style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginRight:2}}>Sort</span>
              {[["name","A-Z"],["rating","Rating"],["position","Pos"]].map(([k,label])=>(
                <button key={k} onClick={()=>setRosterSort(k)} style={{
                  padding:"2px 8px",borderRadius:4,border:"none",cursor:"pointer",
                  fontSize:9,fontWeight:700,fontFamily:"inherit",letterSpacing:"0.04em",
                  background:rosterSort===k?C.gold:"rgba(255,255,255,0.06)",
                  color:rosterSort===k?"#0a0d0f":C.muted,textTransform:"uppercase",
                }}>{label}</button>
              ))}
              <button onClick={()=>setShowAddPlayer(s=>!s)} style={{
                marginLeft:"auto",padding:"2px 8px",borderRadius:4,
                border:`1px solid ${C.border}`,cursor:"pointer",
                fontSize:9,fontWeight:800,fontFamily:"inherit",letterSpacing:"0.04em",
                background:showAddPlayer?C.gold:"rgba(255,255,255,0.06)",
                color:showAddPlayer?"#0a0d0f":C.gold,textTransform:"uppercase",
              }}>{showAddPlayer?"  Close":"+ Add Player"}</button>
            </div>

            {/* Add player form */}
            {showAddPlayer && (
              <div style={{
                display:"flex",gap:4,marginBottom:10,padding:"8px",
                background:"rgba(232,160,32,0.06)",border:"1px solid rgba(232,160,32,0.2)",
                borderRadius:6,
              }}>
                <input value={newName} onChange={e=>setNewName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAddPlayer()}
                  placeholder="Player name"
                  style={{...IS,fontSize:11,padding:"5px 8px",flex:"1 1 auto",minWidth:0}}/>
                <input value={newNum} onChange={e=>setNewNum(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAddPlayer()}
                  placeholder="#"
                  style={{...IS,fontSize:11,padding:"5px 8px",width:42,flex:"0 0 42px"}}/>
                <button onClick={handleAddPlayer} style={{
                  padding:"5px 10px",borderRadius:5,border:"none",cursor:"pointer",
                  fontSize:11,fontWeight:800,fontFamily:"inherit",
                  background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,color:"#0a0d0f",
                }}>Add</button>
              </div>
            )}

            {/* Player rows */}
            {(() => {
              const sortedAll = [...players].sort((a,b)=>{
                if (rosterSort==="rating") return getOverallRating(b)-getOverallRating(a);
                if (rosterSort==="position") return (a.positions?.[0]||"Z").localeCompare(b.positions?.[0]||"Z");
                return a.name.localeCompare(b.name);
              });
              if (sortedAll.length===0) return (
                <div style={{textAlign:"center",color:C.muted,fontSize:11,padding:"16px 0"}}>
                  Add players above to get started.
                </div>
              );
              return sortedAll.map(p => {
                const isMGI     = !!p.midGameInjury;
                const isInjured = !!p.injured;
                const isOut     = !!p.out;
                const isInactive = isInjured || isOut;
                const planned = rotationGrid.find(r=>r.player.id===p.id)?.totalPlanned ?? 0;
                const target  = minQ;
                const pct     = target > 0 ? Math.min(1, planned / target) : 1;
                const ok      = planned >= target || target === 0 || isMGI || isInactive;
                const isEditing = editingPlayerId === p.id;
                const tinyBtn = {
                  padding:"2px 6px", fontSize:9, fontWeight:800, fontFamily:"inherit",
                  borderRadius:3, cursor:"pointer", letterSpacing:"0.04em",
                  border:`1px solid ${C.border}`, background:"rgba(255,255,255,0.05)",
                  color:C.muted, lineHeight:1.4, textTransform:"uppercase",
                };
                const nameColor = isMGI ? "#e74c3c"
                                : isInjured ? "#e74c3c"
                                : isOut ? "#e67e22"
                                : ok ? C.text : C.gold;
                return (
                  <div key={p.id} style={{
                    marginBottom:7,
                    opacity:isMGI?0.55:isInactive?0.7:1,
                    paddingBottom:isEditing?2:0,
                    borderBottom:isEditing?`1px solid ${C.border}`:"none",
                  }}>
                    {/* Name + status row */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:3,gap:6}}>
                      <span style={{color:nameColor,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:"1 1 auto",minWidth:0}}>
                        {p.name} <span style={{color:C.muted}}>#{p.number}</span>
                      </span>
                      {isInjured ? (
                        <span style={{fontSize:9,fontWeight:800,color:"#e74c3c",background:"rgba(231,76,60,0.15)",padding:"2px 6px",borderRadius:3,letterSpacing:"0.04em"}}>INJ</span>
                      ) : isOut ? (
                        <span style={{fontSize:9,fontWeight:800,color:"#e67e22",background:"rgba(230,126,34,0.15)",padding:"2px 6px",borderRadius:3,letterSpacing:"0.04em"}}>OUT</span>
                      ) : (
                        <span style={{fontSize:10,color:ok?C.ok:C.gold,fontWeight:700,flexShrink:0}}>
                          {allPlanned ? `${planned}/${target}Q` : ""}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{display:"flex",gap:4,marginBottom:isEditing?6:4}}>
                      <button onClick={()=>setEditingPlayerId(isEditing?null:p.id)} style={{...tinyBtn,
                        color:isEditing?"#0a0d0f":C.gold,
                        background:isEditing?C.gold:"rgba(232,160,32,0.08)",
                        borderColor:"rgba(232,160,32,0.4)"}}>{isEditing?"Done":"Edit"}</button>
                      <button onClick={()=>{
                        if (p.injured) {
                          // Un-mark injury  if it was a mid-game pull, regen remaining quarters with player back
                          if (p.midGameInjury) clearMidGameInjury(p.id);
                          else setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,injured:false}:x));
                        } else {
                          // Mark injured  if any lineup is planned, do a mid-game pull + auto-replan
                          if (Object.keys(lineupsByQuarter).length > 0) {
                            markMidGameInjury(p.id);
                          } else {
                            setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,injured:true,out:false}:x));
                          }
                        }
                      }}
                        style={{...tinyBtn,
                          color:isInjured?"#fff":"#e74c3c",
                          background:isInjured?"rgba(231,76,60,0.85)":"rgba(231,76,60,0.08)",
                          borderColor:"rgba(231,76,60,0.4)"}}>Inj</button>
                      <button onClick={()=>{
                        if (p.out) {
                          // Un-mark out
                          setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,out:false}:x));
                          // If lineups exist, regen so player returns to rotation
                          if (Object.keys(lineupsByQuarter).length > 0) {
                            const updated = players.map(x=>x.id===p.id?{...x,out:false}:x);
                            regenRemaining(quarter, updated, lineupsByQuarter);
                          }
                        } else {
                          // Mark out  if lineups exist, pull and replan (same as injury)
                          if (Object.keys(lineupsByQuarter).length > 0) {
                            markMidGameInjury(p.id);
                            // markMidGameInjury sets injured:true; flip to out:true instead
                            setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,injured:false,midGameInjury:false,out:true}:x));
                          } else {
                            setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,out:true,injured:false}:x));
                          }
                        }
                      }}
                        style={{...tinyBtn,
                          color:isOut?"#0a0d0f":"#e67e22",
                          background:isOut?"#e67e22":"rgba(230,126,34,0.10)",
                          borderColor:"rgba(230,126,34,0.4)"}}>Out</button>
                    </div>

                    {/* Expanded edit panel */}
                    {isEditing && (
                      <PlayerEditPanel
                        player={p}
                        onUpdate={updatePlayer}
                        onDelete={removePlayer}
                        onClose={()=>setEditingPlayerId(null)}
                      />
                    )}

                    {/* Per-quarter position tiles + progress  only for active players */}
                    {!isInactive && !isEditing && (
                      <>
                        <div style={{display:"flex",gap:3,marginBottom:3}}>
                          {[1,2,3,4].map(q => {
                            const entry = rotationGrid.find(r=>r.player.id===p.id);
                            const status = entry ? entry.quarters[q-1] : "unplanned";
                            const qLineup = lineupsByQuarter[q];
                            const slot = qLineup?.starters?.find(s=>s.player?.id===p.id);
                            const posLabel = status==="on" && slot ? (POS_LABEL[slot.pos] || slot.pos) : status==="bench" ? "" : "?";
                            const bg = status==="on" ? C.ok : status==="bench" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)";
                            const textColor = status==="on" ? "#0a0d0f" : "rgba(255,255,255,0.3)";
                            const isActiveQ = quarter===q;
                            return (
                              <div key={q} onClick={()=>setQuarter(q)}
                                title={`Q${q}: ${status==="on"?posLabel:status}`}
                                style={{
                                  flex:1, height:20, borderRadius:3, background:bg,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:status==="on"?7:9, color:textColor,
                                  fontWeight:800, cursor:"pointer", letterSpacing:"0.02em",
                                  border:isActiveQ?"1px solid rgba(255,255,255,0.35)":"1px solid transparent",
                                  boxShadow:isActiveQ?"0 0 0 1px rgba(255,255,255,0.1)":"none",
                                }}>
                                {posLabel}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2}}>
                          <div style={{height:"100%",width:`${pct*100}%`,borderRadius:2,transition:"width 0.4s",
                            background:isMGI?"#e74c3c":ok?C.ok:C.gold}}/>
                        </div>
                      </>
                    )}
                  </div>
                );
              });
            })()}
          </Card>

          {/* Bench this quarter */}
          {currentLineup?.bench?.length > 0 && (
            <Card>
              <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.05em"}}> Q{quarter} Bench</div>
              {currentLineup.bench.map(p => (
                <div key={p.id} style={{fontSize:12,color:C.text,padding:"4px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>#{p.number} {p.name}</span>
                  <span style={{fontSize:10,color:C.muted}}>{(p.positions||[]).slice(0,2).join(", ")}</span>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* -- FIELD -- */}
        <div style={{flex:"2 1 320px",minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}>
            <div style={{fontSize:11,color:C.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}>
              Q{quarter} Field  Drag to Swap
            </div>
            <button onClick={()=>setShowShare(true)} style={{
              padding:"5px 11px",borderRadius:6,
              border:`1px solid ${C.gold}55`,
              background:`linear-gradient(135deg,rgba(232,160,32,0.18),rgba(184,120,24,0.10))`,
              color:C.gold,fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:"inherit",
              letterSpacing:"0.05em",textTransform:"uppercase",flexShrink:0,
            }}>Share Lineup</button>
          </div>
          {!allPlanned && !currentLineup && (
            <div style={{
              background:C.surface, borderRadius:12, minHeight:200,
              border:`2px dashed ${C.border}`, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:12, padding:24,
            }}>
              <div style={{fontSize:32}}></div>
              <div style={{fontSize:13,color:C.muted,textAlign:"center",lineHeight:1.6}}>
                Hit <b style={{color:C.gold}}>Plan Full Game</b> to schedule all 4 quarters at once,<br/>
                guaranteeing fair play time for every player.
              </div>
              <Btn primary onClick={() => planWholeGame(1)}> Plan Full Game</Btn>
            </div>
          )}
          {/* Swipeable field  swipe left = next quarter, right = previous */}
          {(()=>{
            return (
              <div
                onTouchStart={e=>{ swipeTouchStart.current = e.touches[0].clientX; }}
                onTouchEnd={e=>{
                  if (swipeTouchStart.current===null) return;
                  const dx = e.changedTouches[0].clientX - swipeTouchStart.current;
                  swipeTouchStart.current = null;
                  if (Math.abs(dx) < 40) return;
                  if (dx < 0 && quarter < 4) setQuarter(q=>q+1);
                  if (dx > 0 && quarter > 1) setQuarter(q=>q-1);
                }}
                style={{position:"relative",userSelect:"none"}}
              >
                {/* Quarter nav bar */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,padding:"0 2px"}}>
                  <button onClick={()=>setQuarter(q=>Math.max(1,q-1))} disabled={quarter===1} style={{
                    background:"none",border:"none",cursor:quarter===1?"default":"pointer",
                    color:quarter===1?"rgba(255,255,255,0.1)":C.gold,fontSize:22,padding:"0 6px",lineHeight:1,
                  }}></button>
                  <div style={{fontSize:11,color:C.muted,fontWeight:600}}>
                    Q{quarter} Field View <span style={{opacity:0.4}}> swipe or tap arrows</span>
                  </div>
                  <button onClick={()=>setQuarter(q=>Math.min(4,q+1))} disabled={quarter===4} style={{
                    background:"none",border:"none",cursor:quarter===4?"default":"pointer",
                    color:quarter===4?"rgba(255,255,255,0.1)":C.gold,fontSize:22,padding:"0 6px",lineHeight:1,
                  }}></button>
                </div>
                {/* Pip dots */}
                <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:8}}>
                  {[1,2,3,4].map(q=>(
                    <div key={q} onClick={()=>setQuarter(q)} style={{
                      width:q===quarter?20:6,height:6,borderRadius:3,cursor:"pointer",
                      background:q===quarter?C.gold:"rgba(255,255,255,0.15)",
                      transition:"all 0.2s",
                    }}/>
                  ))}
                </div>
                <SoccerField lineup={currentLineup} onSwap={handleSwap} format={format} quarter={quarter}/>
              </div>
            );
          })()}
          {midGameInjured.length > 0 && (
            <div style={{marginTop:10,padding:"7px 12px",borderRadius:7,
              background:"rgba(120,0,0,0.15)",border:"1px solid rgba(231,76,60,0.2)",
              fontSize:11,color:"rgba(231,76,60,0.75)",textAlign:"center",lineHeight:1.5}}>
              Open slots left by injured players. Use  Return if they recover.
            </div>
          )}
        </div>
      </div>

      {/* GAME STATUS  bottom of Game Day tab */}
      <Card style={{marginTop:18}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Game Status</div>
        <div style={{fontSize:12,color:C.text,marginBottom:3}}>{active.length} active  {needed} per side</div>
        {active.length > needed && (
          <div style={{fontSize:11,color:C.muted}}>{active.length - needed} rotating through bench</div>
        )}
        {players.filter(p=>p.injured&&!p.midGameInjury).length > 0 && (
          <div style={{fontSize:11,color:"#e74c3c",marginTop:3}}> {players.filter(p=>p.injured&&!p.midGameInjury).length} pre-game injured</div>
        )}
        {midGameInjured.length > 0 && (
          <div style={{fontSize:11,color:"#e74c3c",marginTop:3}}> {midGameInjured.length} mid-game injur{midGameInjured.length>1?"ies":"y"}</div>
        )}
        {minQ > 0 && <div style={{fontSize:11,color:C.muted,marginTop:3}}>Min: {minQ}Q per player ({rule.minFraction*100|0}%)</div>}
      </Card>

      {/* Share Lineup Modal */}
      {showShare && (
        <ShareLineupModal
          players={players}
          lineupsByQuarter={lineupsByQuarter}
          quarter={quarter}
          homeScore={homeScore}
          awayScore={awayScore}
          opponent={opponent}
          league={league}
          onClose={()=>setShowShare(false)}
        />
      )}
    </div>
  );
}

// 
// SHARE LINEUP MODAL  canvas PNG for screenshotting
// 
function ShareLineupModal({ players, lineupsByQuarter, quarter, homeScore, awayScore, opponent, league, onClose }) {
  const canvasRef = useRef(null);

  const FBASE = {
    GK:{x:50,y:88},LD:{x:22,y:75},CD:{x:50,y:72},RD:{x:78,y:75},
    LM:{x:18,y:52},CM:{x:50,y:50},RM:{x:82,y:52},
    LF:{x:28,y:22},CF:{x:50,y:18},RF:{x:72,y:22},
  };

  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  };

  const drawField = (ctx, fx, fy, fw, fh, qNum) => {
    const fg = ctx.createLinearGradient(fx,fy,fx,fy+fh);
    fg.addColorStop(0,"#1e4d1a"); fg.addColorStop(1,"#163d13");
    ctx.fillStyle=fg; roundRect(ctx,fx,fy,fw,fh,8); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=1.2;
    roundRect(ctx,fx,fy,fw,fh,8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx+8,fy+fh/2); ctx.lineTo(fx+fw-8,fy+fh/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx+fw/2,fy+fh/2,28,0,Math.PI*2); ctx.stroke();
    ctx.strokeRect(fx+fw*0.28,fy+4,fw*0.44,42);
    ctx.strokeRect(fx+fw*0.28,fy+fh-46,fw*0.44,42);
    // Quarter pill (per-quarter color gradient, prominent)
    const QCOLORS = {
      1: ["#f4c442","#b87818"], // gold
      2: ["#5dadec","#2471a3"], // blue
      3: ["#c88ce0","#7d3c98"], // purple
      4: ["#ec7063","#a93226"], // coral/red
    };
    const qc = QCOLORS[qNum] || QCOLORS[1];
    const qGrad = ctx.createLinearGradient(fx+8, fy+8, fx+8, fy+30);
    qGrad.addColorStop(0, qc[0]); qGrad.addColorStop(1, qc[1]);
    ctx.fillStyle=qGrad; roundRect(ctx,fx+8,fy+8,42,22,5); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.lineWidth=1; roundRect(ctx,fx+8,fy+8,42,22,5); ctx.stroke();
    ctx.fillStyle="#0a0d0f"; ctx.font="900 14px Arial, sans-serif"; ctx.textAlign="center";
    ctx.fillText("Q"+qNum,fx+29,fy+24);
    const lineup = lineupsByQuarter[qNum];
    if (lineup && lineup.starters) {
      lineup.starters.forEach(function(slot) {
        const fb = FBASE[slot.pos]||{x:50,y:50};
        const px = fx+(fb.x/100)*fw;
        const py = fy+(fb.y/100)*fh;
        const grad = ctx.createRadialGradient(px,py,1,px,py,15);
        grad.addColorStop(0,"#f5c86a"); grad.addColorStop(1,"#b87818");
        ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(px,py,15,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(255,255,255,0.85)"; ctx.lineWidth=1.2; ctx.stroke();
        const num=slot.player?slot.player.number:"?";
        ctx.fillStyle="#0a0d0f"; ctx.font="900 12px Arial, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(num,px,py);
        ctx.textBaseline="alphabetic";
        const fname=slot.player?slot.player.name.split(" ")[0].slice(0,7):"";
        ctx.fillStyle="#fff"; ctx.font="bold 9px Arial, sans-serif"; ctx.fillText(fname,px,py+25);
        ctx.fillStyle="#ffe066"; ctx.font="900 9px Arial, sans-serif"; ctx.fillText(slot.pos,px,py-19);
      });
    } else {
      ctx.fillStyle="rgba(255,255,255,0.25)"; ctx.font="bold 12px Arial, sans-serif"; ctx.textAlign="center";
      ctx.fillText("Not planned",fx+fw/2,fy+fh/2+3);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Render at high DPR for crisp output (sharp on screen, sharp PNG download)
    const DPR = Math.max(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const W = 600, H = 920;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = "100%";
    canvas.style.height = "auto";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle="#0c1409"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#1a2518"; ctx.fillRect(0,0,W,70);
    ctx.fillStyle="#e8a020"; ctx.beginPath(); ctx.arc(36,35,18,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#0a0d0f"; ctx.font="900 14px Arial, sans-serif"; ctx.textAlign="center"; ctx.fillText("CK",36,40);
    ctx.fillStyle="#e8e4dc"; ctx.font="bold 18px Arial, sans-serif"; ctx.textAlign="left"; ctx.fillText("CoachKit",64,29);
    ctx.fillStyle="#a8a39e"; ctx.font="11px Arial, sans-serif"; ctx.fillText("SAY East Youth Soccer",64,46);
    ctx.fillStyle="#e8a020"; ctx.font="bold 13px Arial, sans-serif"; ctx.textAlign="right"; ctx.fillText(league,W-14,29);
    ctx.fillStyle="#a8a39e"; ctx.font="11px Arial, sans-serif"; ctx.fillText(new Date().toLocaleDateString(),W-14,46);
    ctx.fillStyle="rgba(232,160,32,0.1)"; roundRect(ctx,12,78,W-24,52,7); ctx.fill();
    ctx.strokeStyle="rgba(232,160,32,0.35)"; ctx.lineWidth=1; roundRect(ctx,12,78,W-24,52,7); ctx.stroke();
    ctx.textAlign="center";
    ctx.fillStyle="#a8a39e"; ctx.font="bold 11px Arial, sans-serif"; ctx.fillText("US",W/2-70,94);
    ctx.fillStyle=opponent?"#e8e4dc":"#a8a39e"; ctx.fillText((opponent||"THEM").toUpperCase(),W/2+70,94);
    ctx.fillStyle="#e8a020"; ctx.font="900 30px Arial, sans-serif"; ctx.fillText(homeScore,W/2-70,121);
    ctx.fillStyle="#666"; ctx.font="bold 20px Arial, sans-serif"; ctx.fillText(":",W/2,116);
    ctx.fillStyle=homeScore<awayScore?"#e74c3c":"#e8e4dc"; ctx.font="900 30px Arial, sans-serif"; ctx.fillText(awayScore,W/2+70,121);
    var pad=10, fw=(W-pad*3)/2, fh=330;
    [[1,0,0],[2,1,0],[3,0,1],[4,1,1]].forEach(function(qc) {
      var q=qc[0], col=qc[1], row=qc[2];
      drawField(ctx, pad+col*(fw+pad), 136+row*(fh+pad), fw, fh, q);
    });
    var benchY=136+2*(fh+pad)+6;
    ctx.fillStyle="#141a12"; roundRect(ctx,12,benchY,W-24,76,5); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.08)"; roundRect(ctx,12,benchY,W-24,76,5); ctx.stroke();
    ctx.fillStyle="#e8a020"; ctx.font="bold 11px Arial, sans-serif"; ctx.textAlign="left";
    ctx.fillText("BENCH",20,benchY+16);
    var bench=(lineupsByQuarter[1]&&lineupsByQuarter[1].bench)||[];
    bench.forEach(function(p,i) {
      var bx=20+(i%6)*((W-40)/6);
      var by=benchY+24+Math.floor(i/6)*22;
      ctx.fillStyle="rgba(255,255,255,0.06)"; roundRect(ctx,bx,by,(W-40)/6-3,18,3); ctx.fill();
      ctx.fillStyle="#e8e4dc"; ctx.font="bold 10px Arial, sans-serif"; ctx.textAlign="left";
      ctx.fillText("#"+p.number+" "+p.name.split(" ")[0],bx+5,by+12);
    });
    ctx.fillStyle="#666"; ctx.font="bold 10px Arial, sans-serif"; ctx.textAlign="center";
    ctx.fillText("CoachKit - "+league+" - "+new Date().toLocaleDateString(),W/2,H-9);
  }, [lineupsByQuarter, homeScore, awayScore, opponent, league]);

  const handleDownload = function() {
    var a = document.createElement("a");
    a.download = "CoachKit_AllQuarters_Lineup.png";
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.88)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:"#141a12",borderRadius:16,width:"100%",maxWidth:520,
        border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden",maxHeight:"92vh",display:"flex",flexDirection:"column"}}
        onClick={function(e){e.stopPropagation();}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
          <div style={{fontSize:15,fontWeight:800,color:"#e8a020"}}>Share Lineup - All 4 Quarters</div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
            borderRadius:6,cursor:"pointer",color:"#e8e4dc",fontSize:13,fontWeight:700,padding:"4px 12px",fontFamily:"inherit",
          }}>Close</button>
        </div>
        <div style={{padding:"14px 16px",overflow:"auto"}}>
          <div style={{fontSize:11,color:"#7a7570",marginBottom:10,lineHeight:1.5}}>
            All 4 quarters on one image. Tap Save Image to download and share.
          </div>
          <div style={{borderRadius:8,overflow:"hidden",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)",background:"#0c1409"}}>
            <canvas ref={canvasRef} style={{width:"100%",height:"auto",display:"block"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleDownload} style={{
              flex:1,padding:"10px",borderRadius:7,border:"none",cursor:"pointer",
              background:"linear-gradient(135deg,#e8a020,#b87818)",color:"#0a0d0f",
              fontWeight:700,fontSize:13,fontFamily:"inherit",
            }}>Save Image</button>
            <button onClick={onClose} style={{
              padding:"10px 18px",borderRadius:7,border:"1px solid rgba(255,255,255,0.08)",
              cursor:"pointer",background:"transparent",color:"#7a7570",fontSize:13,fontFamily:"inherit",
            }}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabRoster({ players, addPlayer, updatePlayer, removePlayer, format }) {
  const [newName, setNewName] = useState("");
  const [newNum,  setNewNum]  = useState("");
  const [sort,    setSort]    = useState("name"); // name | rating | position

  const handleAdd = () => {
    if (!newName.trim()) return;
    addPlayer({ name:newName.trim(), number:newNum||String(players.length+1), positions:[...ALL_POS_DEFAULT], injured:false, out:false, ratings:{} });
    setNewName(""); setNewNum("");
  };

  const sorted = [...players].sort((a,b) => {
    if (sort==="rating") return getOverallRating(b)-getOverallRating(a);
    if (sort==="position") return (a.positions?.[0]||"Z").localeCompare(b.positions?.[0]||"Z");
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={newName} onChange={e=>setNewName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleAdd()}
          placeholder="Player name" style={{...IS,flex:"1 1 140px",width:"auto"}}/>
        <input value={newNum} onChange={e=>setNewNum(e.target.value)}
          placeholder="#" style={{...IS,width:55,flex:"0 0 55px"}}/>
        <Btn primary onClick={handleAdd}>+ Add</Btn>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[["name","A-Z"],["rating",""],["position","Pos"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSort(k)} style={{
              padding:"4px 10px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontFamily:"inherit",
              background:sort===k?C.gold:"rgba(255,255,255,0.08)",
              color:sort===k?"#0a0d0f":C.muted,fontWeight:600,
            }}>{l}</button>
          ))}
        </div>
      </div>
      {players.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>Add your roster above to get started.</div>}
      {sorted.map(p=>(
        <PlayerRow key={p.id} player={p} onUpdate={updatePlayer} onRemove={()=>removePlayer(p.id)}/>
      ))}
    </div>
  );
}

function PlayerRow({ player, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName]   = useState(player.name);
  const [num,  setNum]    = useState(player.number);
  const [pos,  setPos]    = useState(player.positions||[]);
  const rating = getOverallRating(player);

  const save = () => onUpdate({...player, name, number:num, positions:pos});
  const togglePosition = (p) => {
    const next = pos.includes(p) ? pos.filter(x=>x!==p) : [...pos,p];
    setPos(next);
    onUpdate({...player, name, number:num, positions:next});
  };

  const setRating = (cat, val) => {
    const newRatings = {...(player.ratings||{}), [cat]:val};
    onUpdate({...player, ratings:newRatings});
  };

  const sc = player.injured?"#e74c3c":player.out?"#e67e22":C.ok;

  return (
    <div style={{
      background:C.surface, borderRadius:10, padding:"10px 14px", marginBottom:8,
      border:`1px solid ${player.injured||player.out?"rgba(220,80,60,0.3)":C.border}`,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{
          width:36,height:36,borderRadius:"50%",flexShrink:0,
          background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontWeight:700,fontSize:13,color:"#0a0d0f",
        }}>{player.number||"#"}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:13,color:C.text}}>{player.name}</div>
          <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {(player.positions||[]).join(", ")||"No position"}
            {rating>0 && <span style={{marginLeft:8,color:C.gold}}>{"".repeat(Math.round(rating))}</span>}
          </div>
        </div>
        <div style={{fontSize:9,fontWeight:700,color:sc,background:`${sc}22`,padding:"2px 7px",borderRadius:4}}>
          {player.injured?"INJURED":player.out?"OUT":"ACTIVE"}
        </div>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>setExpanded(!expanded)} style={{
            padding:"5px 10px",borderRadius:6,border:`1px solid rgba(255,255,255,0.15)`,
            cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
            background:"rgba(255,255,255,0.08)",color:C.text,
          }}>{expanded?"Hide":"Edit"}</button>
          <button onClick={()=>onUpdate({...player,injured:!player.injured,out:false})} style={{
            padding:"5px 10px",borderRadius:6,border:`1px solid ${player.injured?"#e74c3c":"rgba(255,255,255,0.15)"}`,
            cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
            background:player.injured?"rgba(231,76,60,0.25)":"rgba(255,255,255,0.08)",
            color:player.injured?"#e74c3c":C.muted,
          }}>{player.injured?"Return":"Inj"}</button>
          <button onClick={()=>onUpdate({...player,out:!player.out,injured:false})} style={{
            padding:"5px 10px",borderRadius:6,border:`1px solid ${player.out?"#e67e22":"rgba(255,255,255,0.15)"}`,
            cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
            background:player.out?"rgba(230,126,34,0.25)":"rgba(255,255,255,0.08)",
            color:player.out?"#e67e22":C.muted,
          }}>{player.out?"Active":"Out"}</button>
          <button onClick={onRemove} style={{
            padding:"5px 10px",borderRadius:6,border:"1px solid rgba(192,57,43,0.4)",
            cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
            background:"rgba(192,57,43,0.15)",color:"#e74c3c",
          }}>Del</button>
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{flex:1}}>
              <label style={lbl}>Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} style={IS} onBlur={save}/>
            </div>
            <div style={{width:60}}>
              <label style={lbl}>#</label>
              <input value={num} onChange={e=>setNum(e.target.value)} style={IS} onBlur={save}/>
            </div>
          </div>

          <label style={lbl}>Positions</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
            {ALL_POSITIONS.map(p=>(
              <button key={p} onClick={()=>togglePosition(p)} style={{
                padding:"3px 8px",borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,fontFamily:"inherit",
                background:pos.includes(p)?C.gold:"rgba(255,255,255,0.08)",
                color:pos.includes(p)?"#0a0d0f":C.muted,
              }}>{p}</button>
            ))}
          </div>

          <label style={lbl}>Player Ratings (factors into auto-lineup priority)</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {SKILL_CATEGORIES.map(cat=>(
              <div key={cat}>
                <div style={{fontSize:11,color:C.muted,marginBottom:3}}>{cat}</div>
                <StarRating value={(player.ratings||{})[cat]||0} onChange={v=>setRating(cat,v)}/>
              </div>
            ))}
          </div>
          {rating>0 && (
            <div style={{fontSize:11,color:C.gold}}>Overall: {"".repeat(Math.round(rating))} ({rating.toFixed(1)}/5)</div>
          )}
        </div>
      )}
    </div>
  );
}

// 
// TAB: RULES
// 
function TabRules({ league, setLeague, setFormat }) {
  const [view, setView] = useState("quick");
  const r = LEAGUE_RULES[league] || LEAGUE_RULES["U10 / Wings"];

  return (
    <div>
      {/* SAY East badge */}
      <div style={{
        display:"flex",alignItems:"center",gap:10,marginBottom:14,
        background:"rgba(232,160,32,0.07)",border:"1px solid rgba(232,160,32,0.2)",
        borderRadius:10,padding:"10px 14px",
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:C.gold,letterSpacing:"0.06em"}}>SAY EAST CINCINNATI - OFFICIAL RULES</div>
          <div style={{fontSize:11,color:C.muted}}>Source: SAY East Playing Laws Rulebook (Updated Jan 2026) - Silver Matrix age chart</div>
        </div>
      </div>

      {/* Division selector */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {LEAGUES.map(l=>(
          <button key={l} onClick={()=>{ setLeague(l); if(setFormat) setFormat(leagueDefaultFormat(l)); }} style={{
            padding:"5px 13px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
            background:league===l?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
            color:league===l?"#0a0d0f":C.muted,
            boxShadow:league===l?`0 2px 8px ${C.gold}44`:"none",
          }}>{leagueShortLabel(l)}</button>
        ))}
      </div>

      {/* Division header */}
      <div style={{
        background:`linear-gradient(135deg,rgba(232,160,32,0.12),rgba(184,120,24,0.06))`,
        border:`1px solid rgba(232,160,32,0.25)`,
        borderRadius:12,padding:"14px 18px",marginBottom:16,
      }}>
        <div style={{fontSize:18,fontWeight:800,color:C.gold,marginBottom:2}}>
          {leagueShortLabel(league)}{r.divisionName ? `  ${r.divisionName}` : ""}
        </div>
        {r.ageRange && <div style={{fontSize:11,color:C.muted,marginBottom:10}}>{r.ageRange}</div>}

        {/* Key spec badges */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            ["Format",   r.format || ""],
            ["Ball",     `Size ${r.ballSize}`],
            ["Field",    r.fieldLength ? `${r.fieldLength} x ${r.fieldWidth}` : ""],
            ["Goals",    r.goalSize || ""],
            ["Duration", r.periods === 4 ? `4 x ${r.periodMin} min quarters` : `2 x ${r.periodMin} min halves`],
          ].map(([k,v])=>(
            <div key={k} style={{background:"rgba(0,0,0,0.35)",borderRadius:7,padding:"5px 11px",fontSize:11}}>
              <span style={{color:C.muted}}>{k}: </span><span style={{color:C.text,fontWeight:700}}>{v}</span>
            </div>
          ))}
        </div>

        {/* Rule flags row */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          {[
            ["Heading",      r.heading      ? "Allowed" : "Banned"],
            ["Offside",      r.offside      ? "Full rule" : "None"],
            ["Build-Out",    r.buildOut     ? "Active" : "Not used"],
            ["Slide Tackle", r.slideTackle  ? "Allowed" : "Restricted"],
            ["GK Punt",      r.gkPunt       ? "Allowed (SAY East)" : "Not allowed"],
            ["Cards",        r.yellowRedCards ? "Full system" : "No cards"],
          ].map(([k,v])=>(
            <div key={k} style={{background:"rgba(0,0,0,0.25)",borderRadius:6,padding:"4px 9px",fontSize:11}}>
              <span style={{color:C.muted}}>{k}: </span><span style={{color:C.text,fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* View tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14}}>
        {[["quick","Quick Reference"],["unknown","Easily Missed Rules"],["links","Official Links"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
            background:view===k?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
            color:view===k?"#0a0d0f":C.muted,
          }}>{l}</button>
        ))}
      </div>

      {view==="quick" && (
        <div>
          {r.quickRules.map((rule,i)=>(
            <div key={i} style={{
              display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",
              marginBottom:6,borderRadius:9,
              background: rule.important?"rgba(232,160,32,0.08)":C.surface,
              border:`1px solid ${rule.important?"rgba(232,160,32,0.25)":C.border}`,
            }}>
              {rule.icon && <span style={{fontSize:18,lineHeight:1,flexShrink:0}}>{rule.icon}</span>}
              <div style={{fontSize:13,color:rule.important?C.text:C.muted,fontWeight:rule.important?600:400}}>{rule.text}</div>
              {rule.important && <div style={{marginLeft:"auto",fontSize:9,color:C.gold,fontWeight:700,flexShrink:0}}>KEY</div>}
            </div>
          ))}
          {/* Min play time */}
          <div style={{
            display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",
            marginBottom:6,borderRadius:9,
            background:"rgba(39,174,96,0.08)",border:"1px solid rgba(39,174,96,0.2)",
          }}>
            <div>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>Min Play Time (SAY Rule 12)</div>
              <div style={{fontSize:12,color:C.muted}}>{PLAY_TIME_RULES[league]?.note||"Check local rules"}</div>
            </div>
          </div>
          {/* No blowout rule */}
          <div style={{
            display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",
            borderRadius:9,background:"rgba(211,84,0,0.06)",border:"1px solid rgba(211,84,0,0.2)",
          }}>
            <div>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>No Blowout Rule (SAY East)</div>
              <div style={{fontSize:12,color:C.muted}}>Winning by more than 5 goals is a violation. Coaches must have a plan to manage score - rotate, adjust tactics, avoid running up the score.</div>
            </div>
            <div style={{marginLeft:"auto",fontSize:9,color:C.warn,fontWeight:700,flexShrink:0}}>KEY</div>
          </div>
        </div>
      )}

      {view==="unknown" && (
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
            Rules frequently misunderstood by coaches and parents in SAY East.
          </div>
          {(r.unknownRules||[]).map((rule,i)=>(
            <div key={i} style={{
              display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",
              marginBottom:8,borderRadius:9,background:C.surface,border:`1px solid ${C.border}`,
            }}>
              <div style={{
                width:22,height:22,borderRadius:"50%",flexShrink:0,
                background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:700,color:"#0a0d0f"
              }}>{i+1}</div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{rule}</div>
            </div>
          ))}
        </div>
      )}

      {view==="links" && (
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
            Official SAY East and SAY National rulebooks for {league}:
          </div>
          {(r.officialLinks||[]).map((link,i)=>(
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{
              display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
              marginBottom:8,borderRadius:9,
              background:C.surface,border:`1px solid ${C.border}`,
              textDecoration:"none",transition:"border-color 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:C.text,fontWeight:600}}>{link.label}</div>
                <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{link.url}</div>
              </div>
              <span style={{color:C.gold,fontSize:14}}></span>
            </a>
          ))}
          <div style={{fontSize:11,color:C.muted,marginTop:12,lineHeight:1.6,padding:"10px 14px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
             Rules may vary by local league, state association, or competition. Always verify with your specific league administrator.
          </div>
        </div>
      )}
    </div>
  );
}

// 
// TAB: DRILLS
// 
function TabDrills({ drills, league, addCustomDrill, removeCustomDrill }) {
  const [catFilter,   setCatFilter]   = useState("All");
  const [skillFilter, setSkillFilter] = useState("All");
  const [diffFilter,  setDiffFilter]  = useState("All");
  const [ageFilter,   setAgeFilter]   = useState(false);
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [modalDrill,  setModalDrill]  = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [newDrill,    setNewDrill]    = useState({name:"",category:"Passing",skills:[],ageMin:"U6",ageMax:"Adult",difficulty:"Beginner",duration:10,instructions:"",coaching:"",progressions:[],equipment:[]});
  const [progInput,   setProgInput]   = useState("");
  const [equipInput,  setEquipInput]  = useState("");

  const ageOrder = LEAGUES;
  const leagueIdx = ageOrder.indexOf(league);

  const filtered = drills.filter(d => {
    if (catFilter!=="All" && d.category!==catFilter) return false;
    if (skillFilter!=="All" && !d.skills.includes(skillFilter)) return false;
    if (diffFilter!=="All" && d.difficulty!==diffFilter) return false;
    if (ageFilter) {
      const minI = ageOrder.indexOf(d.ageMin||"U6");
      const maxI = ageOrder.indexOf(d.ageMax||"Adult");
      if (leagueIdx < minI || leagueIdx > maxI) return false;
    }
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.skills.join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const addProg = () => { if (progInput.trim()) { setNewDrill(d=>({...d,progressions:[...d.progressions,progInput.trim()]})); setProgInput(""); } };
  const addEquip = () => { if (equipInput.trim()) { setNewDrill(d=>({...d,equipment:[...d.equipment,equipInput.trim()]})); setEquipInput(""); } };

  return (
    <div>
      {/* Filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder=" Search drills" style={{...IS,width:"auto",flex:"1 1 140px"}}/>
        <Btn sm primary onClick={()=>setShowAdd(!showAdd)}>+ Custom</Btn>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {["All",...CATEGORIES].map(c=>(
            <FilterPill key={c} label={c} active={catFilter===c} onClick={()=>setCatFilter(c)}/>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        <FilterPill label="All Ages" active={!ageFilter} onClick={()=>setAgeFilter(false)}/>
        <FilterPill label={`Age: ${league}`} active={ageFilter} onClick={()=>setAgeFilter(true)}/>
        {DIFFICULTIES.map(d=><FilterPill key={d} label={d} active={diffFilter===d} onClick={()=>setDiffFilter(diffFilter===d?"All":d)}/>)}
      </div>

      {/* Add custom drill */}
      {showAdd && (
        <Card style={{marginBottom:14,border:`1px solid rgba(232,160,32,0.25)`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:12}}>Add Custom Drill</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Name</label>
              <input value={newDrill.name} onChange={e=>setNewDrill(d=>({...d,name:e.target.value}))} style={IS} placeholder="Drill name"/>
            </div>
            <div>
              <label style={lbl}>Category</label>
              <select value={newDrill.category} onChange={e=>setNewDrill(d=>({...d,category:e.target.value}))} style={SS}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Difficulty</label>
              <select value={newDrill.difficulty} onChange={e=>setNewDrill(d=>({...d,difficulty:e.target.value}))} style={SS}>
                {DIFFICULTIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Age Min</label>
              <select value={newDrill.ageMin} onChange={e=>setNewDrill(d=>({...d,ageMin:e.target.value}))} style={SS}>
                {LEAGUES.map(l=><option key={l} value={l}>{leagueShortLabel(l)}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Duration (min)</label>
              <input type="number" value={newDrill.duration} onChange={e=>setNewDrill(d=>({...d,duration:+e.target.value}))} style={IS}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Instructions</label>
              <textarea value={newDrill.instructions} onChange={e=>setNewDrill(d=>({...d,instructions:e.target.value}))} rows={3} style={{...IS,resize:"vertical"}}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Coaching Points</label>
              <textarea value={newDrill.coaching} onChange={e=>setNewDrill(d=>({...d,coaching:e.target.value}))} rows={2} style={{...IS,resize:"vertical"}}/>
            </div>
            <div>
              <label style={lbl}>Progressions</label>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                <input value={progInput} onChange={e=>setProgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addProg()} style={{...IS,flex:1}} placeholder="Add progression"/>
                <Btn sm onClick={addProg}>+</Btn>
              </div>
              {newDrill.progressions.map((p,i)=><div key={i} style={{fontSize:11,color:C.muted,marginBottom:2}}> {p}</div>)}
            </div>
            <div>
              <label style={lbl}>Equipment</label>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                <input value={equipInput} onChange={e=>setEquipInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEquip()} style={{...IS,flex:1}} placeholder="Add equipment"/>
                <Btn sm onClick={addEquip}>+</Btn>
              </div>
              {newDrill.equipment.map((e,i)=><div key={i} style={{fontSize:11,color:C.muted,marginBottom:2}}> {e}</div>)}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <Btn primary sm onClick={()=>{ addCustomDrill(newDrill); setShowAdd(false); setNewDrill({name:"",category:"Passing",skills:[],ageMin:"U6",ageMax:"Adult",difficulty:"Beginner",duration:10,instructions:"",coaching:"",progressions:[],equipment:[]}); }}> Save Drill</Btn>
            <Btn sm onClick={()=>setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{fontSize:11,color:C.muted,marginBottom:10}}>{filtered.length} drill{filtered.length!==1?"s":""} shown</div>

      {filtered.map(drill=>(
        <DrillCard key={drill.id} drill={drill} expanded={expanded===drill.id}
          onToggle={()=>setExpanded(expanded===drill.id?null:drill.id)}
          onRemove={drill.custom?()=>removeCustomDrill(drill.id):null}
          onOpenModal={setModalDrill}/>
      ))}
      <DrillModal drill={modalDrill} onClose={()=>setModalDrill(null)}/>
    </div>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"3px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",
      background:active?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
      color:active?"#0a0d0f":C.muted,
    }}>{label}</button>
  );
}

// 
// DRILL DETAIL MODAL
// 
function DrillModal({ drill, onClose }) {
  if (!drill) return null;
  const diffColor = drill.difficulty==="Advanced"?C.warn:drill.difficulty==="Intermediate"?C.gold:C.ok;
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:9999,
      background:"rgba(0,0,0,0.85)",
      display:"flex",alignItems:"flex-end",justifyContent:"center",
      padding:0,
    }} onClick={onClose}>
      <div style={{
        background:"#141a12",borderRadius:"18px 18px 0 0",
        width:"100%",maxWidth:600,maxHeight:"92vh",
        overflow:"auto",border:`1px solid ${C.border}`,
        borderBottom:"none",
      }} onClick={e=>e.stopPropagation()}>
        {/* Image */}
        {drill.image && (
          <div style={{position:"relative"}}>
            <img src={drill.image} alt={drill.name}
              style={{width:"100%",height:200,objectFit:"cover",borderRadius:"18px 18px 0 0",display:"block"}}/>
            <div style={{
              position:"absolute",inset:0,
              background:"linear-gradient(to bottom, transparent 40%, #141a12 100%)",
              borderRadius:"18px 18px 0 0",
            }}/>
            <button onClick={onClose} style={{
              position:"absolute",top:12,right:12,
              width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",
              background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:18,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>X</button>
          </div>
        )}
        {!drill.image && (
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px 0"}}>
            {/* Mini field diagram */}
            <svg width="80" height="56" viewBox="0 0 80 56" style={{borderRadius:5,flexShrink:0}}>
              <rect width="80" height="56" rx="4" fill="#1e4d1a"/>
              <rect x="2" y="2" width="76" height="52" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <line x1="2" y1="28" x2="78" y2="28" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <circle cx="40" cy="28" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <rect x="25" y="2" width="30" height="12" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
              <rect x="25" y="42" width="30" height="12" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
              <text x="40" y="32" textAnchor="middle" fill="#e8a020" fontSize="7" fontWeight="bold">{drill.category}</text>
            </svg>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:6,cursor:"pointer",color:C.text,fontSize:12,fontWeight:700,padding:"4px 12px"}}>Close</button>
          </div>
        )}

        <div style={{padding:"16px 20px 32px"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.text,lineHeight:1.2}}>{drill.name}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                {drill.category}  {drill.duration} min  {drill.ageMin}{drill.ageMax||"Adult"}
              </div>
            </div>
            <span style={{
              fontSize:10,fontWeight:800,color:diffColor,
              background:`${diffColor}22`,padding:"4px 10px",borderRadius:6,flexShrink:0,marginLeft:8,
            }}>{drill.difficulty}</span>
          </div>

          {/* Skills */}
          {(drill.skills||[]).length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:16}}>
              {drill.skills.map(s=>(
                <span key={s} style={{
                  fontSize:10,background:"rgba(255,255,255,0.08)",
                  color:C.muted,padding:"3px 8px",borderRadius:4,fontWeight:600,
                }}>{s}</span>
              ))}
            </div>
          )}

          {/* Setup */}
          {drill.setup && (
            <div style={{marginBottom:16,padding:"12px 14px",background:"rgba(30,77,43,0.2)",borderRadius:9,border:"1px solid rgba(39,174,96,0.2)"}}>
              <div style={{fontSize:10,color:C.ok,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}> Setup</div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.7}}>{drill.setup}</div>
            </div>
          )}

          {/* Instructions */}
          {drill.instructions && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:C.gold,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}> Instructions</div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.8}}>{drill.instructions}</div>
            </div>
          )}

          {/* Coaching Points */}
          {drill.coaching && (
            <div style={{marginBottom:16,padding:"12px 14px",background:"rgba(232,160,32,0.07)",borderRadius:9,border:"1px solid rgba(232,160,32,0.15)"}}>
              <div style={{fontSize:10,color:C.gold,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}> Coaching Points</div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.8}}>{drill.coaching}</div>
            </div>
          )}

          {/* Progressions */}
          {(drill.progressions||[]).length>0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:C.gold,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}> Progressions</div>
              {drill.progressions.map((p,i)=>(
                <div key={i} style={{
                  display:"flex",gap:8,alignItems:"flex-start",marginBottom:6,
                  padding:"8px 12px",background:C.surface,borderRadius:7,
                }}>
                  <span style={{color:C.gold,fontWeight:800,fontSize:12,flexShrink:0}}></span>
                  <span style={{fontSize:13,color:C.muted,lineHeight:1.5}}>{p}</span>
                </div>
              ))}
            </div>
          )}

          {/* Equipment */}
          {(drill.equipment||[]).length>0 && (
            <div style={{padding:"12px 14px",background:C.surface,borderRadius:9,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}> Equipment</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {drill.equipment.map((e,i)=>(
                  <span key={i} style={{
                    fontSize:12,color:C.text,
                    background:"rgba(255,255,255,0.06)",
                    padding:"4px 10px",borderRadius:5,
                  }}> {e}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DrillCard({ drill, expanded, onToggle, onRemove, onOpenModal }) {
  const diffColor = drill.difficulty==="Advanced"?C.warn:drill.difficulty==="Intermediate"?C.gold:C.ok;
  return (
    <div style={{
      background:C.surface,borderRadius:10,marginBottom:8,
      border:`1px solid ${drill.custom?"rgba(232,160,32,0.2)":C.border}`,
      overflow:"hidden",
    }}>
      <div style={{padding:"10px 14px",cursor:"pointer",display:"flex",gap:10,alignItems:"center"}} onClick={onToggle}>
        {drill.image && (
          <div style={{width:48,height:48,borderRadius:7,overflow:"hidden",flexShrink:0}}>
            <img src={drill.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
        )}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:13,color:C.text}}>
            {drill.name}
            {drill.custom && <span style={{marginLeft:6,fontSize:9,background:"rgba(232,160,32,0.2)",color:C.gold,padding:"1px 5px",borderRadius:3,fontWeight:700}}>CUSTOM</span>}
          </div>
          <div style={{fontSize:11,color:C.muted}}>{drill.category}  {drill.duration}min  {drill.ageMin}{drill.ageMax||"Adult"}</div>
          <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
            {(drill.skills||[]).slice(0,4).map(s=>(
              <span key={s} style={{fontSize:9,background:"rgba(255,255,255,0.08)",color:C.muted,padding:"1px 5px",borderRadius:3}}>{s}</span>
            ))}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:700,color:diffColor,background:`${diffColor}22`,padding:"2px 6px",borderRadius:3}}>{drill.difficulty}</span>
          <span style={{fontSize:11,color:C.muted}}>{expanded?"":""}</span>
        </div>
      </div>

      {expanded && (
        <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px"}}>
          {drill.setup && (
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:8}}>
              <span style={{color:C.gold,fontWeight:700}}>Setup: </span>{drill.setup}
            </div>
          )}
          <div style={{fontSize:12,color:C.text,lineHeight:1.6,marginBottom:10}}>
            {(drill.instructions||"").slice(0,140)}{(drill.instructions||"").length>140?"":""}
          </div>
          <div style={{display:"flex",gap:6}}>
            <Btn sm primary onClick={e=>{e.stopPropagation();onOpenModal&&onOpenModal(drill);}}>
               Full Details
            </Btn>
            {onRemove && <Btn sm danger onClick={onRemove}> Remove</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

// 
// TAB: PRACTICE GENERATOR
// 
const FOCUS_AREAS = ["General","Passing","Dribbling","Shooting","Defense","Possession","Fitness","Set Pieces","Goalkeeping","Heading"];

function TabPractice({ drills, league }) {
  const [focus,      setFocus]      = useState("General");
  const [skills,     setSkills]     = useState([]);
  const [duration,   setDuration]   = useState(60);
  const [plan,       setPlan]       = useState(null);
  const [notes,      setNotes]      = useState("");
  const [swapDrill,  setSwapDrill]  = useState(null);
  const [modalDrill, setModalDrill] = useState(null);

  const isYoung = LEAGUES.indexOf(league) <= 1; // U6, U8
  const level = LEAGUES.indexOf(league) <= 2 ? "Beginner" : LEAGUES.indexOf(league) <= 4 ? "Intermediate" : "Advanced";

  const generate = () => {
    const sections = generatePractice(league, focus, skills, duration, drills);
    setPlan({ focus, skills, duration, sections, league });
    setNotes("");
  };

  const swapDrillInPlan = (sectionIdx, newDrill) => {
    setPlan(prev => {
      const sections = [...prev.sections];
      sections[sectionIdx] = { ...sections[sectionIdx], drill: newDrill };
      return { ...prev, sections };
    });
    setSwapDrill(null);
  };

  const toggleSkill = s => setSkills(prev => prev.includes(s)?prev.filter(x=>x!==s):[...prev,s]);

  const ageOrder = LEAGUES;
  const leagueIdx = ageOrder.indexOf(league);

  return (
    <div>
      {/* Config */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,marginBottom:12,alignItems:"flex-end"}}>
          <div>
            <label style={lbl}>Focus Area</label>
            <select value={focus} onChange={e=>setFocus(e.target.value)} style={SS}>
              {FOCUS_AREAS.map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Duration (minutes)</label>
            <select value={duration} onChange={e=>setDuration(+e.target.value)} style={SS}>
              {[30,45,60,75,90].map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <Btn primary onClick={generate}> Generate</Btn>
        </div>
        <div>
          <label style={lbl}>Skill Focus Tags (optional  refines drill selection)</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {SKILL_TAGS.map(s=>(
              <FilterPill key={s} label={s} active={skills.includes(s)} onClick={()=>toggleSkill(s)}/>
            ))}
          </div>
        </div>
      </Card>

      {/* Age level indicator */}
      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
        <div style={{fontSize:11,color:C.muted}}>Practice level for <b style={{color:C.text}}>{league}</b>:</div>
        <div style={{
          fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:4,
          background:level==="Beginner"?`${C.ok}22`:level==="Intermediate"?`${C.gold}22`:`${C.warn}22`,
          color:level==="Beginner"?C.ok:level==="Intermediate"?C.gold:C.warn,
        }}>{level} Level</div>
        {isYoung && <div style={{fontSize:11,color:C.muted}}> Fun-focused  Short activities  Simple instructions</div>}
      </div>

      {plan && (
        <div>
          {/* Header */}
          <div style={{
            background:`linear-gradient(135deg,rgba(232,160,32,0.1),rgba(30,77,43,0.1))`,
            border:`1px solid rgba(232,160,32,0.2)`,
            borderRadius:12,padding:"14px 18px",marginBottom:14,
          }}>
            <div style={{fontWeight:800,fontSize:16,color:C.gold}}>{plan.league} Practice  {plan.focus}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>
              {plan.sections.reduce((s,x)=>s+x.time,0)} min total
               {plan.sections.filter(s=>s.drill).length} activities
              {plan.skills.length>0 && `  Skill focus: ${plan.skills.join(", ")}`}
            </div>
          </div>

          {/* Sections */}
          {plan.sections.map((sec, i) => (
            <div key={i} style={{
              display:"flex",gap:12,marginBottom:10,
              background:C.surface,borderRadius:10,padding:"12px 14px",
              border:`1px solid ${C.border}`,
            }}>
              <div style={{
                width:34,height:34,borderRadius:"50%",flexShrink:0,
                background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:800,fontSize:12,color:"#0a0d0f",
              }}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:12,color:C.gold,marginBottom:2}}>
                  {sec.type} <span style={{color:C.muted,fontWeight:400}}>({sec.time} min)</span>
                </div>
                {sec.drill ? (
                  <>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      {sec.drill.image && <img src={sec.drill.image} alt="" style={{width:36,height:36,borderRadius:5,objectFit:"cover",flexShrink:0}}/>}
                      <div style={{flex:1,cursor:"pointer"}} onClick={()=>setModalDrill(sec.drill)}>
                        <div style={{fontSize:13,color:C.text,fontWeight:600}}>{sec.drill.name} <span style={{fontSize:10,color:C.gold}}></span></div>
                        <div style={{fontSize:11,color:C.muted}}>{sec.drill.category}  {sec.drill.difficulty}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:6}}>
                      {(sec.drill.instructions||"").slice(0,120)}{sec.drill.instructions?.length>120?"":""}
                    </div>
                    {swapDrill===i ? (
                      <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:10,marginBottom:6}}>
                        <div style={{fontSize:11,color:C.gold,marginBottom:6,fontWeight:700}}>Swap drill:</div>
                        <div style={{maxHeight:180,overflowY:"auto"}}>
                          {drills.filter(d=>{
                            const minI=ageOrder.indexOf(d.ageMin||"U6");
                            const maxI=ageOrder.indexOf(d.ageMax||"Adult");
                            return leagueIdx>=minI && leagueIdx<=maxI && d.id!==sec.drill.id;
                          }).map(d=>(
                            <div key={d.id} onClick={()=>swapDrillInPlan(i,d)}
                              style={{padding:"5px 8px",borderRadius:5,cursor:"pointer",fontSize:12,color:C.text,marginBottom:2,
                                background:"rgba(255,255,255,0.04)"}}
                              onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,0.1)"}
                              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
                              {d.name} <span style={{color:C.muted,fontSize:10}}>({d.category})</span>
                            </div>
                          ))}
                        </div>
                        <Btn sm onClick={()=>setSwapDrill(null)} style={{marginTop:6}}> Cancel</Btn>
                      </div>
                    ) : (
                      <Btn sm ghost onClick={()=>setSwapDrill(i)}> Swap Drill</Btn>
                    )}
                  </>
                ) : (
                  <div style={{fontSize:12,color:C.muted}}>{sec.notes||"Cool down, stretching, and Q&A with players."}</div>
                )}
              </div>
            </div>
          ))}

          <div style={{marginTop:12}}>
            <label style={lbl}>Coach Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)}
              placeholder="Add notes for this session" rows={3}
              style={{...IS,resize:"vertical"}}/>
          </div>
        </div>
      )}
      <DrillModal drill={modalDrill} onClose={()=>setModalDrill(null)}/>
    </div>
  );
}

// 
// MAIN APP
// 
const TABS = [
  {id:"game",     icon:"", label:"Game Day"},
  {id:"season",   icon:"", label:"Season"},
  {id:"team",     icon:"", label:"Team"},
  {id:"rules",    icon:"", label:"Rules"},
  {id:"drills",   icon:"", label:"Drills"},
  {id:"practice", icon:"", label:"Practice"},
];

// FORMATION TEMPLATES per format
const FORMATION_TEMPLATES = {
  // 4v4 = GK + 3 field players
  "4v4": [
    { name:"1-1-1", label:"Balanced",  desc:"One each: defender, mid, forward. Classic simple shape.", slots:["GK","CD","CM","CF"] },
    { name:"2-1",   label:"Defensive", desc:"Two defenders, one forward. Hold and counter.", slots:["GK","LD","RD","CF"] },
    { name:"1-2",   label:"Attacking", desc:"One defender, two forwards. High pressure up top.", slots:["GK","CD","LF","RF"] },
  ],

  // 5v5 = GK + 4 field players
  "5v5": [
    { name:"2-1-1", label:"Balanced",  desc:"Two defenders, one mid, one forward.", slots:["GK","LD","RD","CM","CF"] },
    { name:"1-2-1", label:"Mid Heavy", desc:"Diamond shape  -  one def, two mids, one fwd.", slots:["GK","CD","LM","RM","CF"] },
    { name:"2-2",   label:"Compact",   desc:"Two lines of two. Hard to break down.", slots:["GK","LD","RD","LF","RF"] },
    { name:"1-1-2", label:"Attacking", desc:"One def, one mid, two fwds. Aggressive.", slots:["GK","CD","CM","LF","RF"] },
  ],

  // 6v6 = GK + 5 field players (SAY East U8 format)
  "6v6": [
    { name:"2-2-1", label:"Balanced",   desc:"Standard shape. Two defenders, two mids, one forward. Best all-around for U8.", slots:["GK","LD","RD","LM","RM","CF"] },
    { name:"2-1-2", label:"Wide Attack", desc:"Two defenders, one holding mid, two forwards. Spread the attack wide.", slots:["GK","LD","RD","CM","LF","RF"] },
    { name:"3-2",   label:"Defensive",  desc:"Three defenders, two forwards. Pack the back, hit on counter.", slots:["GK","LD","CD","RD","LF","RF"] },
    { name:"1-3-1", label:"Mid Control",desc:"One sweeper, three mids, one striker. Dominate the middle.", slots:["GK","CD","LM","CM","RM","CF"] },
    { name:"2-0-3", label:"All Attack", desc:"Two defenders, no mid, three forwards. Full attack  -  risky but fun.", slots:["GK","LD","RD","LF","CF","RF"] },
    { name:"3-1-1", label:"Park Bus",   desc:"Three defenders, one mid, one forward. Ultra defensive.", slots:["GK","LD","CD","RD","CM","CF"] },
  ],

  // 7v7 = GK + 6 field players
  "7v7": [
    { name:"3-2-1", label:"Classic",    desc:"Three defenders, two mids, one striker. Most common 7v7 shape.", slots:["GK","LD","CD","RD","LM","RM","CF"] },
    { name:"2-3-1", label:"Mid Heavy",  desc:"Two defenders, three mids, one striker. Control the middle.", slots:["GK","LD","RD","LM","CM","RM","CF"] },
    { name:"2-2-2", label:"Balanced",   desc:"Two defenders, two mids, two forwards. Symmetric and flexible.", slots:["GK","LD","RD","LM","RM","LF","RF"] },
    { name:"3-1-2", label:"Counter",    desc:"Three defenders, one mid, two forwards. Fast break style.", slots:["GK","LD","CD","RD","CM","LF","RF"] },
    { name:"2-1-3", label:"Attacking",  desc:"Two defenders, one mid, three forwards. High press, all-out attack.", slots:["GK","LD","RD","CM","LF","CF","RF"] },
    { name:"1-3-2", label:"Overload Mid",desc:"One sweeper, three mids, two forwards. Overwhelm in midfield.", slots:["GK","CD","LM","CM","RM","LF","RF"] },
  ],

  // 8v8 = GK + 7 field players
  "8v8": [
    { name:"3-3-1", label:"Classic",    desc:"Three defenders, three mids, one striker. Standard 8v8.", slots:["GK","LD","CD","RD","LM","CM","RM","CF"] },
    { name:"3-2-2", label:"Balanced",   desc:"Three defenders, two mids, two forwards. Width in attack.", slots:["GK","LD","CD","RD","LM","RM","LF","RF"] },
    { name:"4-2-1", label:"Defensive",  desc:"Four defenders, two mids, one striker. Protect the back.", slots:["GK","LD","CD","CD","RD","LM","RM","CF"] },
    { name:"2-3-2", label:"Mid Press",  desc:"Two defenders, three mids, two forwards. Press high and wide.", slots:["GK","LD","RD","LM","CM","RM","LF","RF"] },
    { name:"2-2-3", label:"Attacking",  desc:"Two defenders, two mids, three forwards. Commit to attack.", slots:["GK","LD","RD","LM","RM","LF","CF","RF"] },
    { name:"3-1-3", label:"Diamond Fwd",desc:"Three defenders, one holding mid, three forwards.", slots:["GK","LD","CD","RD","CM","LF","CF","RF"] },
  ],

  // 9v9 = GK + 8 field players (SAY East U10/U12/U14)
  "9v9": [
    { name:"3-3-2", label:"Classic",     desc:"Three defenders, three mids, two forwards. Most common 9v9 shape.", slots:["GK","LD","CD","RD","LM","CM","RM","LF","RF"] },
    { name:"4-3-1", label:"Defensive",   desc:"Four defenders, three mids, one striker. Solid back four.", slots:["GK","LD","CD","CD","RD","LM","CM","RM","CF"] },
    { name:"3-2-3", label:"Attacking",   desc:"Three defenders, two mids, three forwards. Go for goal.", slots:["GK","LD","CD","RD","LM","RM","LF","CF","RF"] },
    { name:"4-2-2", label:"Wide",        desc:"Four defenders, two central mids, two wide forwards.", slots:["GK","LD","CD","CD","RD","LM","RM","LF","RF"] },
    { name:"3-4-1", label:"Mid Control", desc:"Three defenders, four mids, one striker. Overload midfield.", slots:["GK","LD","CD","RD","LM","CM","CM","RM","CF"] },
    { name:"2-4-2", label:"Total Mid",   desc:"Two defenders, four mids, two forwards. Dominate the middle.", slots:["GK","LD","RD","LM","CM","CM","RM","LF","RF"] },
    { name:"3-1-4", label:"All Out",     desc:"Three defenders, one mid anchor, four forwards. High risk.", slots:["GK","LD","CD","RD","CM","LF","LF","RF","RF"] },
  ],

  // 11v11 = GK + 10 field players
  "11v11": [
    { name:"4-4-2", label:"Classic Flat",  desc:"The most famous formation. Two banks of four, two strikers. Simple and effective.", slots:["GK","LB","CB","CB","RB","LM","CM","CM","RM","LF","RF"] },
    { name:"4-3-3", label:"Attacking",     desc:"Four defenders, three mids, three forwards. Dominant when midfield wins.", slots:["GK","LB","CB","CB","RB","LM","CM","RM","LF","CF","RF"] },
    { name:"4-2-3-1",label:"Modern",       desc:"Two holding mids protect the back four. Three attacking mids behind one striker.", slots:["GK","LB","CB","CB","RB","CM","CM","LM","CF","RM","RF"] },
    { name:"3-5-2", label:"Wing Backs",    desc:"Three defenders, five mids (with wing backs), two strikers.", slots:["GK","LB","CB","RB","LM","CM","CM","CM","RM","LF","RF"] },
    { name:"5-3-2", label:"Defensive",     desc:"Five defenders (three centre-backs, two wing backs), three mids, two strikers.", slots:["GK","LB","CB","CB","CB","RB","LM","CM","RM","LF","RF"] },
    { name:"4-1-4-1",label:"Holding Mid",  desc:"Single defensive mid in front of back four. Four mids, one striker.", slots:["GK","LB","CB","CB","RB","CM","LM","CM","RM","CF","CF"] },
    { name:"3-4-3", label:"All Attack",    desc:"Three defenders, four mids, three forwards. Maximum offensive output.", slots:["GK","LB","CB","RB","LM","CM","CM","RM","LF","CF","RF"] },
    { name:"4-5-1", label:"Defensive Mid", desc:"Four defenders, five mids, one striker. Control possession and frustrate.", slots:["GK","LB","CB","CB","RB","LM","CM","CM","CM","RM","CF"] },
  ],
};

const ALL_POS_DEFAULT = ["GK","LD","CD","RD","LM","CM","RM","LF","CF","RF"];

const SAMPLE_PLAYERS = [
  {id:"p1", name:"John Smith",      number:"1",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p2", name:"Wes Johnson",     number:"2",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p3", name:"Jaxon Williams",  number:"3",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p4", name:"Remi Brown",      number:"4",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p5", name:"Sean Jones",      number:"5",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p6", name:"Henry Davis",     number:"6",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p7", name:"Jude Garcia",     number:"7",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p8", name:"Trey Miller",     number:"8",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
  {id:"p9", name:"Maddox Anderson", number:"9",  positions:[...ALL_POS_DEFAULT], injured:false,out:false,ratings:{}, parentName:"", parentPhone:"", devNotes:""},
];

export default function App() {
  return (
    <AuthGate>
      <CoachKitApp />
    </AuthGate>
  );
}

function CoachKitApp() {
  const { user } = useUser();
  const pfx = user?.id ? `ck_${user.id}_` : "ck_guest_";

  const [tab,             setTab]             = useState("game");
  const [league,          setLeague]          = useState("U8 / Passers");
  const [format,          setFormat]          = useState("6v6");
  const [lineupsByQuarter,setLineupsByQuarter]= usePersistedState(pfx+"lineups", {});

  const [players,            setPlayers]            = usePersistedState(pfx+"players",      SAMPLE_PLAYERS);
  const [customDrills,       setCustomDrills]       = usePersistedState(pfx+"customDrills", []);
  const [playerStats,        setPlayerStats]        = usePersistedState(pfx+"playerStats",  (() => { const s={}; SAMPLE_PLAYERS.forEach(p=>{s[p.id]={goals:0,assists:0,gamesPlayed:0};}); return s; })());
  const [games,              setGames]              = usePersistedState(pfx+"games",         []);
  const [practiceAttendance, setPracticeAttendance] = usePersistedState(pfx+"practiceAtt",  {});
  const [practiceDates,      setPracticeDates]      = usePersistedState(pfx+"practiceDates",[]);

  const allDrills = [...DRILLS, ...customDrills];

  const addPlayer    = p  => {
    const pid = uid();
    setPlayers(prev => [...prev, {...p, id:pid}]);
    setPlayerStats(prev => ({...prev, [pid]:{goals:0,assists:0,gamesPlayed:0}}));
  };
  const updatePlayer = p  => setPlayers(prev => prev.map(x => x.id===p.id?p:x));
  const removePlayer = id => {
    setPlayers(prev => prev.filter(x=>x.id!==id));
    setPlayerStats(prev => { const n={...prev}; delete n[id]; return n; });
  };
  const addCustomDrill    = d => setCustomDrills(prev=>[...prev,{...d,id:uid(),custom:true,image:null}]);
  const removeCustomDrill = id=> setCustomDrills(prev=>prev.filter(d=>d.id!==id));

  const handleLeagueChange = l => {
    setLeague(l);
    setFormat(leagueDefaultFormat(l));   // auto-apply SAY East default; coach can still override
    setLineupsByQuarter({});
  };
  const handleFormatChange = f => { setFormat(f); setLineupsByQuarter({}); };

  const injured      = players.filter(p=>p.injured).length;
  const midGameCount = players.filter(p=>p.midGameInjury).length;
  const out          = players.filter(p=>p.out).length;

  return (
    <div style={{
      minHeight:"100vh",
      background: C.bg,
      fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
      color: C.text,
    }}>
      {/* HEADER */}
      <div style={{
        background:"linear-gradient(180deg,#111810 0%,#0c140a 100%)",
        borderBottom:`1px solid rgba(232,160,32,0.18)`,
        position:"sticky",top:0,zIndex:100,
      }}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,padding:"12px 0 8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{
                width:44,height:44,borderRadius:11,
                overflow:"hidden",
                boxShadow:`0 4px 12px ${C.gold}44`,
                flexShrink:0,
              }}>
                <img
                  src="https://raw.githubusercontent.com/calhouje-design/coachkit/main/logo.png"
                  alt="CoachKit"
                  style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                  onError={e=>{e.target.style.display="none"; e.target.parentElement.style.background=`linear-gradient(135deg,${C.gold},${C.goldDark})`; e.target.parentElement.innerHTML+="<span style='color:#0a0d0f;font-weight:900;font-size:16px;font-family:Arial'>CK</span>";}}
                />
              </div>
              <div>
                <div style={{fontSize:19,fontWeight:800,color:C.text,letterSpacing:"-0.01em"}}>CoachKit</div>
                <div style={{fontSize:9,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase"}}>Youth Soccer Manager</div>
              </div>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <WeatherButton />
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <Stat label="Roster"   val={players.length}    color={C.text}/>
                {injured>0&&<Stat label=" Injured" val={injured} color="#e74c3c"/>}
                {midGameCount>0&&<Stat label=" Mid-Game" val={midGameCount} color="#e74c3c"/>}
                {out>0    &&<Stat label=" Out"     val={out}     color="#e67e22"/>}
                <UserMenu />
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{display:"flex",gap:0,overflowX:"auto",scrollbarWidth:"none"}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:"8px 14px",border:"none",cursor:"pointer",fontWeight:600,
                fontSize:12,background:"transparent",whiteSpace:"nowrap",fontFamily:"inherit",
                color:tab===t.id?C.gold:C.muted,
                borderBottom:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent",
                transition:"color 0.15s",
              }}>{t.icon} {t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px"}}>
        {tab==="game"     && <TabGame     format={format} league={league} onLeagueChange={handleLeagueChange} onFormatChange={handleFormatChange} players={players} setPlayers={setPlayers} addPlayer={addPlayer} removePlayer={removePlayer} lineupsByQuarter={lineupsByQuarter} setLineupsByQuarter={setLineupsByQuarter}/>}
        {tab==="season"   && <TabSeason   players={players} playerStats={playerStats} setPlayerStats={setPlayerStats} games={games} setGames={setGames} practiceDates={practiceDates} setPracticeDates={setPracticeDates} practiceAttendance={practiceAttendance} setPracticeAttendance={setPracticeAttendance}/>}
        {tab==="team"     && <TabTeam     players={players} updatePlayer={updatePlayer} league={league} games={games}/>}
        {tab==="rules"    && <TabRules    league={league} setLeague={setLeague} setFormat={setFormat}/>}
        {tab==="drills"   && <TabDrills   drills={allDrills} league={league} addCustomDrill={addCustomDrill} removeCustomDrill={removeCustomDrill}/>}
        {tab==="practice" && <TabPractice drills={allDrills} league={league}/>}
      </div>
    </div>
  );
}

// 
// TAB: SEASON STATS
// 
function TabSeason({ players, playerStats, setPlayerStats, games, setGames, practiceDates, setPracticeDates, practiceAttendance, setPracticeAttendance }) {
  const [view, setView] = useState("stats"); // stats | games | practice
  const [editGame, setEditGame] = useState(null);
  const [newGame, setNewGame] = useState({date:"",opponent:"",homeScore:"",oppScore:"",notes:""});
  const [showAddGame, setShowAddGame] = useState(false);
  const [newPractice, setNewPractice] = useState({date:"",notes:""});
  const [showAddPractice, setShowAddPractice] = useState(false);
  const [editStatPlayer, setEditStatPlayer] = useState(null);

  const wins   = games.filter(g=>g.homeScore>g.oppScore).length;
  const losses = games.filter(g=>g.homeScore<g.oppScore).length;
  const draws  = games.filter(g=>g.homeScore===g.oppScore).length;
  const totalGoals = games.reduce((s,g)=>s+Number(g.homeScore||0),0);
  const totalConceded = games.reduce((s,g)=>s+Number(g.oppScore||0),0);

  const updateStat = (pid, field, val) => {
    setPlayerStats(prev=>({...prev,[pid]:{...prev[pid],[field]:Math.max(0,Number(val)||0)}}));
  };

  const saveGame = () => {
    if (!newGame.opponent) return;
    setGames(prev=>[...prev,{...newGame,id:uid(),homeScore:Number(newGame.homeScore)||0,oppScore:Number(newGame.oppScore)||0}]);
    setNewGame({date:"",opponent:"",homeScore:"",oppScore:"",notes:""});
    setShowAddGame(false);
  };

  const savePractice = () => {
    if (!newPractice.date) return;
    const id = uid();
    setPracticeDates(prev=>[...prev,{...newPractice,id}]);
    // Init attendance for all players
    const att = {};
    players.forEach(p=>{att[p.id]=false;});
    setPracticeAttendance(prev=>({...prev,[id]:att}));
    setNewPractice({date:"",notes:""});
    setShowAddPractice(false);
  };

  const toggleAttendance = (practiceId, playerId) => {
    setPracticeAttendance(prev=>({
      ...prev,
      [practiceId]:{...prev[practiceId],[playerId]:!prev[practiceId]?.[playerId]},
    }));
  };

  const practiceAttCount = (pid) => practiceDates.filter(pr=>practiceAttendance[pr.id]?.[pid]).length;

  const sortedByGoals = [...players].sort((a,b)=>(playerStats[b.id]?.goals||0)-(playerStats[a.id]?.goals||0));

  return (
    <div>
      {/* Season record banner */}
      <div style={{
        display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16,
        background:"rgba(232,160,32,0.06)",border:"1px solid rgba(232,160,32,0.2)",
        borderRadius:12,padding:"14px 16px",
      }}>
        {[
          {label:"Wins",   val:wins,   color:C.ok},
          {label:"Draws",  val:draws,  color:C.gold},
          {label:"Losses", val:losses, color:"#e74c3c"},
          {label:"Goals",  val:totalGoals,    color:C.text},
          {label:"Conceded",val:totalConceded, color:C.muted},
        ].map(({label,val,color})=>(
          <div key={label} style={{textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:800,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Sub tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14}}>
        {[["stats"," Player Stats"],["games"," Game Log"],["practice"," Practice Log"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
            background:view===k?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
            color:view===k?"#0a0d0f":C.muted,
          }}>{l}</button>
        ))}
      </div>

      {/* PLAYER STATS */}
      {view==="stats" && (
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
            Tap a player to edit their stats. Stats are cumulative for the current season.
          </div>
          {/* Header row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 60px 60px",gap:6,padding:"4px 10px",marginBottom:4}}>
            {["Player","Goals","Assists","Games","Prac"].map(h=>(
              <div key={h} style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",textAlign:h==="Player"?"left":"center"}}>{h}</div>
            ))}
          </div>
          {sortedByGoals.map(p=>{
            const st = playerStats[p.id]||{goals:0,assists:0,gamesPlayed:0};
            const prac = practiceAttCount(p.id);
            const isEditing = editStatPlayer===p.id;
            return (
              <div key={p.id} style={{
                background:C.surface,borderRadius:9,padding:"10px 12px",marginBottom:6,
                border:`1px solid ${isEditing?C.gold:C.border}`,
              }}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 60px 60px",gap:6,alignItems:"center"}}
                  onClick={()=>setEditStatPlayer(isEditing?null:p.id)}>
                  <div style={{cursor:"pointer"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>{p.name.split(" ")[0]} <span style={{color:C.muted,fontWeight:400}}>#{p.number}</span></div>
                    <div style={{fontSize:10,color:C.muted}}>{(p.positions||[]).slice(0,2).join(", ")}</div>
                  </div>
                  {[["goals",st.goals],["assists",st.assists],["gamesPlayed",st.gamesPlayed],["prac",prac]].map(([field,val])=>(
                    <div key={field} style={{textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:800,color:field==="goals"?C.gold:C.text}}>{val}</div>
                    </div>
                  ))}
                </div>
                {isEditing && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                    {[["goals"," Goals"],["assists"," Assists"],["gamesPlayed"," Games"]].map(([field,label])=>(
                      <div key={field} style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,color:C.muted}}>{label}</span>
                        <button onClick={()=>updateStat(p.id,field,(st[field]||0)-1)} style={{
                          width:22,height:22,borderRadius:4,border:"none",cursor:"pointer",
                          background:"rgba(255,255,255,0.1)",color:C.text,fontWeight:700,fontSize:13,lineHeight:1,
                        }}>-</button>
                        <span style={{fontSize:15,fontWeight:700,color:C.gold,minWidth:18,textAlign:"center"}}>{st[field]||0}</span>
                        <button onClick={()=>updateStat(p.id,field,(st[field]||0)+1)} style={{
                          width:22,height:22,borderRadius:4,border:"none",cursor:"pointer",
                          background:"rgba(255,255,255,0.1)",color:C.text,fontWeight:700,fontSize:13,lineHeight:1,
                        }}>+</button>
                      </div>
                    ))}
                    <button onClick={()=>setEditStatPlayer(null)} style={{
                      marginLeft:"auto",padding:"3px 10px",borderRadius:5,border:"none",cursor:"pointer",
                      background:C.gold,color:"#0a0d0f",fontSize:11,fontWeight:700,fontFamily:"inherit",
                    }}>Done</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* GAME LOG */}
      {view==="games" && (
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <Btn primary onClick={()=>setShowAddGame(true)}>+ Add Game</Btn>
          </div>
          {showAddGame && (
            <Card style={{marginBottom:12,border:`1px solid ${C.gold}44`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:10}}>New Game Result</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div><label style={lbl}>Date</label><input type="date" value={newGame.date} onChange={e=>setNewGame(p=>({...p,date:e.target.value}))} style={IS}/></div>
                <div><label style={lbl}>Opponent</label><input value={newGame.opponent} onChange={e=>setNewGame(p=>({...p,opponent:e.target.value}))} placeholder="Team name" style={IS}/></div>
                <div><label style={lbl}>Our Score</label><input type="number" min="0" value={newGame.homeScore} onChange={e=>setNewGame(p=>({...p,homeScore:e.target.value}))} style={IS}/></div>
                <div><label style={lbl}>Their Score</label><input type="number" min="0" value={newGame.oppScore} onChange={e=>setNewGame(p=>({...p,oppScore:e.target.value}))} style={IS}/></div>
              </div>
              <div style={{marginBottom:10}}><label style={lbl}>Notes</label><input value={newGame.notes} onChange={e=>setNewGame(p=>({...p,notes:e.target.value}))} placeholder="Key moments, lessons..." style={IS}/></div>
              <div style={{display:"flex",gap:8}}>
                <Btn primary onClick={saveGame}>Save Game</Btn>
                <Btn ghost onClick={()=>setShowAddGame(false)}>Cancel</Btn>
              </div>
            </Card>
          )}
          {games.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>No games logged yet.</div>}
          {[...games].sort((a,b)=>b.date.localeCompare(a.date)).map(g=>{
            const result = g.homeScore>g.oppScore?"W":g.homeScore<g.oppScore?"L":"D";
            const resultColor = result==="W"?C.ok:result==="L"?"#e74c3c":C.gold;
            return (
              <div key={g.id} style={{
                display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                background:C.surface,borderRadius:9,marginBottom:6,border:`1px solid ${C.border}`,
              }}>
                <div style={{
                  width:32,height:32,borderRadius:7,flexShrink:0,
                  background:`${resultColor}22`,border:`1px solid ${resultColor}44`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:800,fontSize:14,color:resultColor,
                }}>{result}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>vs {g.opponent}</div>
                  <div style={{fontSize:11,color:C.muted}}>{g.date}  <b style={{color:g.homeScore>g.oppScore?C.ok:"#e74c3c"}}>{g.homeScore}</b>  {g.oppScore}</div>
                  {g.notes && <div style={{fontSize:11,color:C.muted,marginTop:2,fontStyle:"italic"}}>{g.notes}</div>}
                </div>
                <button onClick={()=>setGames(prev=>prev.filter(x=>x.id!==g.id))} style={{
                  background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",
                  fontSize:16,lineHeight:1,padding:"4px 6px",
                }}></button>
              </div>
            );
          })}
        </div>
      )}

      {/* PRACTICE LOG */}
      {view==="practice" && (
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <Btn primary onClick={()=>setShowAddPractice(true)}>+ Add Practice</Btn>
          </div>
          {showAddPractice && (
            <Card style={{marginBottom:12,border:`1px solid ${C.gold}44`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:10}}>New Practice Session</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div><label style={lbl}>Date</label><input type="date" value={newPractice.date} onChange={e=>setNewPractice(p=>({...p,date:e.target.value}))} style={IS}/></div>
                <div><label style={lbl}>Notes</label><input value={newPractice.notes} onChange={e=>setNewPractice(p=>({...p,notes:e.target.value}))} placeholder="Focus area..." style={IS}/></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn primary onClick={savePractice}>Save</Btn>
                <Btn ghost onClick={()=>setShowAddPractice(false)}>Cancel</Btn>
              </div>
            </Card>
          )}
          {practiceDates.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>No practices logged yet.</div>}
          {[...practiceDates].sort((a,b)=>b.date.localeCompare(a.date)).map(pr=>{
            const att = practiceAttendance[pr.id]||{};
            const present = players.filter(p=>att[p.id]).length;
            return (
              <Card key={pr.id} style={{marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{pr.date}</div>
                    {pr.notes && <div style={{fontSize:11,color:C.muted}}>{pr.notes}</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.ok}}>{present}/{players.length} present</div>
                    <button onClick={()=>setPracticeDates(prev=>prev.filter(x=>x.id!==pr.id))} style={{
                      background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",fontSize:14,
                    }}></button>
                  </div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {players.map(p=>{
                    const here = att[p.id]||false;
                    return (
                      <button key={p.id} onClick={()=>toggleAttendance(pr.id,p.id)} style={{
                        padding:"4px 9px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",
                        background:here?`rgba(39,174,96,0.2)`:"rgba(255,255,255,0.06)",
                        color:here?C.ok:C.muted,
                        outline:here?`1px solid ${C.ok}33`:"none",
                      }}>
                        {here?" ":""}{p.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 
// TAB: TEAM MANAGEMENT
// 
function TabTeam({ players, updatePlayer, league, games }) {
  const [view, setView] = useState("contacts"); // contacts | schedule | dev
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [newScheduleItem, setNewScheduleItem] = useState({date:"",type:"game",opponent:"",location:"",notes:""});
  const [schedule, setSchedule] = useState([
    {id:"s1",date:"2026-03-22",type:"game",opponent:"FC Milford",location:"East Side Park, Field 2",notes:"Bring extra water"},
    {id:"s2",date:"2026-03-25",type:"practice",opponent:"",location:"SAY East Complex",notes:"Focus on positioning"},
    {id:"s3",date:"2026-03-29",type:"game",opponent:"Blue Wave SC",location:"Lunken Fields",notes:"Away game  carpool"},
  ]);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const saveEvent = () => {
    if (!newScheduleItem.date) return;
    setSchedule(prev=>[...prev,{...newScheduleItem,id:uid()}]);
    setNewScheduleItem({date:"",type:"game",opponent:"",location:"",notes:""});
    setShowAddEvent(false);
  };

  return (
    <div>
      {/* Sub tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
        {[["contacts"," Parent Contacts"],["schedule"," Schedule"],["dev"," Dev Notes"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
            background:view===k?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
            color:view===k?"#0a0d0f":C.muted,
          }}>{l}</button>
        ))}
        <button onClick={()=>setShowPrintModal(true)} style={{
          marginLeft:"auto",padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,
          cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
          background:"transparent",color:C.muted,display:"flex",alignItems:"center",gap:5,
        }}> Print Lineup</button>
      </div>

      {/* CONTACTS */}
      {view==="contacts" && (
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
            Parent/guardian contact info. Tap a row to edit.
          </div>
          {players.map(p=>{
            const isEditing = editPlayer===p.id;
            return (
              <div key={p.id} style={{
                background:C.surface,borderRadius:9,padding:"10px 14px",marginBottom:6,
                border:`1px solid ${isEditing?C.gold:C.border}`,cursor:"pointer",
              }} onClick={()=>setEditPlayer(isEditing?null:p.id)}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{
                    width:32,height:32,borderRadius:"50%",flexShrink:0,
                    background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontWeight:700,fontSize:12,color:"#0a0d0f",
                  }}>{p.number}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>{p.name}</div>
                    <div style={{fontSize:11,color:C.muted}}>
                      {p.parentName||<span style={{fontStyle:"italic",opacity:0.5}}>No contact info</span>}
                      {p.parentPhone&&`  ${p.parentPhone}`}
                    </div>
                  </div>
                  <span style={{fontSize:11,color:C.muted}}>{isEditing?"":""}</span>
                </div>
                {isEditing && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}
                    onClick={e=>e.stopPropagation()}>
                    <div>
                      <label style={lbl}>Parent / Guardian Name</label>
                      <input defaultValue={p.parentName||""} onBlur={e=>updatePlayer({...p,parentName:e.target.value})}
                        style={IS} placeholder="Full name"/>
                    </div>
                    <div>
                      <label style={lbl}>Phone Number</label>
                      <input defaultValue={p.parentPhone||""} onBlur={e=>updatePlayer({...p,parentPhone:e.target.value})}
                        style={IS} placeholder="513-555-0100"/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SCHEDULE */}
      {view==="schedule" && (
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <Btn primary onClick={()=>setShowAddEvent(true)}>+ Add Event</Btn>
          </div>
          {showAddEvent && (
            <Card style={{marginBottom:12,border:`1px solid ${C.gold}44`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:10}}>New Event</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div><label style={lbl}>Date</label><input type="date" value={newScheduleItem.date} onChange={e=>setNewScheduleItem(p=>({...p,date:e.target.value}))} style={IS}/></div>
                <div>
                  <label style={lbl}>Type</label>
                  <select value={newScheduleItem.type} onChange={e=>setNewScheduleItem(p=>({...p,type:e.target.value}))} style={SS}>
                    <option value="game">Game</option>
                    <option value="practice">Practice</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div><label style={lbl}>Opponent / Title</label><input value={newScheduleItem.opponent} onChange={e=>setNewScheduleItem(p=>({...p,opponent:e.target.value}))} placeholder="Team / event name" style={IS}/></div>
                <div><label style={lbl}>Location</label><input value={newScheduleItem.location} onChange={e=>setNewScheduleItem(p=>({...p,location:e.target.value}))} placeholder="Field name, address" style={IS}/></div>
              </div>
              <div style={{marginBottom:10}}><label style={lbl}>Notes</label><input value={newScheduleItem.notes} onChange={e=>setNewScheduleItem(p=>({...p,notes:e.target.value}))} placeholder="Reminders, carpool notes..." style={IS}/></div>
              <div style={{display:"flex",gap:8}}>
                <Btn primary onClick={saveEvent}>Save</Btn>
                <Btn ghost onClick={()=>setShowAddEvent(false)}>Cancel</Btn>
              </div>
            </Card>
          )}
          {[...schedule].sort((a,b)=>a.date.localeCompare(b.date)).map(ev=>{
            const typeIcon = ev.type==="game"?"":ev.type==="practice"?"":"";
            const typeColor = ev.type==="game"?C.gold:ev.type==="practice"?C.ok:C.muted;
            const isPast = ev.date < new Date().toISOString().slice(0,10);
            return (
              <div key={ev.id} style={{
                display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",
                background:C.surface,borderRadius:9,marginBottom:6,
                border:`1px solid ${C.border}`,
                opacity:isPast?0.55:1,
              }}>
                <div style={{
                  width:36,height:36,borderRadius:8,flexShrink:0,
                  background:`${typeColor}18`,border:`1px solid ${typeColor}33`,
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                }}>
                  <div style={{fontSize:14}}>{typeIcon}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>
                      {ev.type==="game"?`vs ${ev.opponent}`:ev.opponent||ev.type.charAt(0).toUpperCase()+ev.type.slice(1)}
                    </div>
                    <div style={{fontSize:10,color:typeColor,fontWeight:700,textTransform:"uppercase"}}>{ev.type}</div>
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>{ev.date}{ev.location&&`  ${ev.location}`}</div>
                  {ev.notes&&<div style={{fontSize:11,color:C.muted,marginTop:2,fontStyle:"italic"}}>{ev.notes}</div>}
                </div>
                <button onClick={()=>setSchedule(prev=>prev.filter(x=>x.id!==ev.id))} style={{
                  background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",fontSize:14,flexShrink:0,
                }}></button>
              </div>
            );
          })}
        </div>
      )}

      {/* DEV NOTES */}
      {view==="dev" && (
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
            Private development notes per player  what to work on, progress, observations.
          </div>
          {players.map(p=>(
            <div key={p.id} style={{
              background:C.surface,borderRadius:9,padding:"12px 14px",marginBottom:8,
              border:`1px solid ${C.border}`,
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{
                  width:30,height:30,borderRadius:"50%",flexShrink:0,
                  background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:700,fontSize:11,color:"#0a0d0f",
                }}>{p.number}</div>
                <div style={{fontWeight:600,fontSize:13,color:C.text}}>{p.name}</div>
                <div style={{fontSize:10,color:C.muted,marginLeft:"auto"}}>{(p.positions||[]).slice(0,2).join(", ")}</div>
              </div>
              <textarea
                defaultValue={p.devNotes||""}
                onBlur={e=>updatePlayer({...p,devNotes:e.target.value})}
                placeholder="Notes for this player... (e.g. needs work on left foot, great leadership, wants to try GK)"
                rows={2}
                style={{
                  ...IS, resize:"vertical", lineHeight:1.5, fontSize:12,
                  color:C.muted,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* PRINT LINEUP MODAL */}
      {showPrintModal && <PrintLineupModal players={players} onClose={()=>setShowPrintModal(false)}/>}
    </div>
  );
}

// 
// PRINT LINEUP MODAL
// 
function PrintLineupModal({ players, onClose }) {
  const [quarter, setQuarter] = useState(1);
  // We'll get the lineup from window if passed; for standalone we recreate the field
  // The modal shows a field diagram with player names  user can print via browser
  const activePlayers = players.filter(p=>!p.injured&&!p.out);

  const handlePrint = () => {
    const printContent = document.getElementById("print-lineup-content");
    if (!printContent) return;
    const win = window.open("","_blank","width=800,height=600");
    win.document.write(`<html><head><title>Lineup Card</title>
      <style>
        body{margin:0;background:#fff;font-family:Georgia,serif;}
        .field{position:relative;width:340px;height:520px;background:linear-gradient(180deg,#1e4d1a,#1a4518);border-radius:12px;margin:0 auto;}
        .player-dot{position:absolute;text-align:center;transform:translate(-50%,-50%);}
        .circle{width:48px;height:48px;border-radius:50%;background:#e8a020;display:flex;align-items:center;justify-content:center;flex-direction:column;margin:0 auto;border:2px solid #fff;}
        .num{font-size:10px;font-weight:800;color:#0a0d0f;}
        .name{font-size:8px;color:#1a1a1a;font-weight:600;white-space:nowrap;}
        .pos-label{font-size:9px;color:#fff;font-weight:700;margin-top:2px;text-shadow:0 1px 3px rgba(0,0,0,0.9);}
        h1{text-align:center;font-size:18px;color:#0a0d0f;margin:16px 0 4px;}
        .meta{text-align:center;font-size:12px;color:#555;margin-bottom:12px;}
        .bench{max-width:340px;margin:12px auto 0;padding:10px;border:1px solid #ddd;border-radius:8px;}
        .bench h3{font-size:13px;margin:0 0 6px;color:#333;}
        .bench-player{display:inline-block;margin:2px 4px;font-size:11px;background:#f5f5f5;padding:2px 8px;border-radius:4px;}
      </style></head><body>
      ${printContent.innerHTML}
      </body></html>`);
    win.document.close();
    setTimeout(()=>win.print(),400);
  };

  // Build a field diagram with the active roster spread across positions
  // We use sample positions for the first 11 slots
  const fieldPositions = [
    {pos:"GK",x:50,y:90},{pos:"DEF",x:25,y:75},{pos:"DEF",x:50,y:72},{pos:"DEF",x:75,y:75},
    {pos:"MID",x:20,y:52},{pos:"MID",x:50,y:50},{pos:"MID",x:80,y:52},
    {pos:"FWD",x:25,y:28},{pos:"FWD",x:50,y:22},{pos:"FWD",x:75,y:28},{pos:"CAM",x:50,y:38},
  ];

  const assignedPositions = fieldPositions.slice(0,activePlayers.length);
  const bench = activePlayers.slice(assignedPositions.length);
  const starters = activePlayers.slice(0,assignedPositions.length);
  const today = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:9000,
      background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,
    }}>
      <div style={{
        background:"#1a1f1a",borderRadius:14,maxWidth:500,width:"100%",
        maxHeight:"90vh",overflow:"auto",border:`1px solid ${C.border}`,
      }}>
        <div style={{
          display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"14px 18px",borderBottom:`1px solid ${C.border}`,
        }}>
          <div style={{fontSize:15,fontWeight:800,color:C.gold}}> Print Lineup Card</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:20}}></button>
        </div>

        <div style={{padding:"16px 18px"}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.6}}>
            A printable field diagram with player positions. Click <b style={{color:C.text}}>Print</b> to open the print dialog.
          </div>

          {/* Preview */}
          <div id="print-lineup-content">
            <h1 style={{textAlign:"center",fontSize:18,color:"#e8e4dc",margin:"0 0 4px",fontFamily:"Georgia,serif"}}> Lineup Card</h1>
            <div style={{textAlign:"center",fontSize:11,color:C.muted,marginBottom:14}}>{today}  {activePlayers.length} players active</div>

            {/* Field diagram */}
            <div style={{position:"relative",width:300,height:450,margin:"0 auto",
              background:"linear-gradient(180deg,#1e4d1a,#1a4518)",borderRadius:10,
              border:"2px solid rgba(255,255,255,0.3)"}}>
              {/* Field lines */}
              <div style={{position:"absolute",top:"50%",left:10,right:10,height:1,background:"rgba(255,255,255,0.4)"}}/>
              <div style={{position:"absolute",top:10,left:"25%",right:"25%",height:60,border:"1px solid rgba(255,255,255,0.4)"}}/>
              <div style={{position:"absolute",bottom:10,left:"25%",right:"25%",height:60,border:"1px solid rgba(255,255,255,0.4)"}}/>

              {starters.map((p,i)=>{
                const fp = assignedPositions[i];
                if (!fp) return null;
                const px = (fp.x/100)*300;
                const py = (fp.y/100)*450;
                return (
                  <div key={p.id} style={{
                    position:"absolute",left:px,top:py,transform:"translate(-50%,-50%)",
                    textAlign:"center",width:50,
                  }}>
                    <div style={{
                      width:36,height:36,borderRadius:"50%",margin:"0 auto",
                      background:"linear-gradient(135deg,#e8a020,#b87818)",
                      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",
                      border:"2px solid rgba(255,255,255,0.8)",boxShadow:"0 2px 8px rgba(0,0,0,0.5)",
                    }}>
                      <div style={{fontSize:9,fontWeight:800,color:"#0a0d0f",lineHeight:1}}>{p.number}</div>
                      <div style={{fontSize:6,color:"#2a1a0a",lineHeight:1,fontWeight:600,maxWidth:32,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {p.name.split(" ")[0]}
                      </div>
                    </div>
                    <div style={{fontSize:7,color:"#fff",fontWeight:700,textShadow:"0 1px 2px rgba(0,0,0,0.9)",marginTop:1}}>{fp.pos}</div>
                  </div>
                );
              })}
            </div>

            {/* Bench */}
            {bench.length>0&&(
              <div style={{marginTop:14,padding:"10px 12px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:C.gold,marginBottom:6}}> Bench</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {bench.map(p=>(
                    <div key={p.id} style={{
                      padding:"3px 8px",borderRadius:4,background:"rgba(255,255,255,0.08)",
                      fontSize:11,color:C.text,
                    }}>#{p.number} {p.name.split(" ")[0]}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Roster list */}
            <div style={{marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
              {activePlayers.map(p=>(
                <div key={p.id} style={{
                  display:"flex",gap:6,alignItems:"center",padding:"3px 6px",
                  borderRadius:4,background:"rgba(255,255,255,0.04)",fontSize:11,
                }}>
                  <span style={{color:C.gold,fontWeight:700,minWidth:22}}>#{p.number}</span>
                  <span style={{color:C.text}}>{p.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{marginTop:16,display:"flex",gap:8}}>
            <Btn primary full onClick={handlePrint}> Print</Btn>
            <Btn ghost onClick={onClose}>Close</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}


function Stat({label,val,color}) {
  return (
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:16,fontWeight:800,color,lineHeight:1}}>{val}</div>
      <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
    </div>
  );
}
