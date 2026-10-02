import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useUser, useSession } from "@clerk/clerk-react";
import AuthGate from "./components/AuthGate.jsx";
import UserMenu from "./components/UserMenu.jsx";
import {
  minQuarters,
  feasibility,
  scrambleQuarterPositions,
  redrawQuarterMembership,
} from "./lib/fairPlay.js";
import {
  addMinutes,
  earnedMinutes,
  minuteGap,
  rankWhosNext,
  addPendingSwap,
  cancelOneSwap,
  parseDrop,
  resolveDragDrop,
  pullFromPlan,
  setAppearanceCreditFor,
  noteSubSegment,
  segmentAt,
  markQuarterSub,
  playCellKind,
  planBenchRotation,
  applyBenchRotation,
  retargetPair,
  pairsForDisplay,
  equityHalves,
  formatQuarterEquity,
  isGkPosition,
  goalkeeperId,
  GK_FULL_QUARTER_REASON,
  shareFieldSheet,
  sharePlayTimeSheet,
  scheduleHalfRotation,
  scheduleWholeGame,
  firstDifferentPlan,
  planHistoryKey,
  sheetMeetsMinimum,
  liveReplanGoalkeeper,
  liveReplanClockDecision,
  clockAfterPeriodSwitch,
  periodHasRealEvent,
  noteRealPeriodEvent,
  realEventsAfterUnavailable,
  realEventsAfterReturn,
  realEventPlayerIds,
  realEventsThrough,
  replanCarryForward,
  segmentsSavedForSubReplan,
  segmentsSavedForFullReplan,
  gameLogFromStrategy,
  upsertGameLog,
  playerQuarterPresence,
  planAvailability,
  returnToGame,
} from "./lib/gameDay.js";
import { FORMATION_TEMPLATES, clampPeriod, formationNameForPeriod, preservePlayedBase, reapplyBase, reshapeLineup, withPeriodOverride, withoutPeriodOverride, normalizeFormationOverrides } from "./lib/formations.js";
import { CIRCLE_DIAMETER, LABEL_GAP, LABEL_LETTER_SPACING_EM, LABEL_WIDTH_GUARD, labelProbeCss, layoutFieldPlayers, labelWidth } from "./lib/fieldLayout.js";
import { usePitchSubLines, useReportFieldLayout } from "./lib/pitchSubLines.js";
import { SAY_PLAY_TIME, sayDivision, sayDivisionKey } from "./lib/sayEastGuide.js";
import { downloadCanvas, paintFieldSheet, paintPlayTimeSheet } from "./lib/sharePaint.js";
import { useTeamCloud } from "./lib/teamCloud.js";
import { bindField, normalizeGameDay, snapshotFromStorage } from "./lib/teamSnapshot.js";
import {
  AGES,
  ORGS,
  ageNumber,
  canonicalAge,
  defaultSlots,
  formatFromCount,
  playersFromFormat,
  resolveSetup,
  rulesTabView,
  tableRule,
  gkFullPeriodReason,
} from "./lib/leagueRules.js";

// -- localStorage persistence helper --
function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored != null) return JSON.parse(stored);
    } catch { /* use the default */ }
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
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

// Ages U6–U19. Organization defaults live in src/lib/leagueRules.js.
const LEAGUES = AGES;
const FORMATS = ["4v4","5v5","6v6","7v7","8v8","9v9","10v10","11v11"];
const ALL_POSITIONS = ["GK","LD","CD","RD","LM","CM","RM","LF","CF","RF"];

function leagueShortLabel(l){ return canonicalAge(l); }

function ageIndex(code) {
  const idx = AGES.indexOf(canonicalAge(code));
  return idx === -1 ? 0 : idx;
}

// Position rule: 1 in a row = center, 2 = left/right (no center), 3 = L/C/R, 4 = L/C/C/R, etc.
const POSITIONS_BY_FORMAT = {
  "4v4":  ["GK","CD","CM","CF"],
  "5v5":  ["GK","LD","RD","CM","CF"],
  "6v6":  ["GK","LD","RD","LM","RM","CF"],
  "7v7":  ["GK","LD","RD","LM","CM","RM","CF"],
  "8v8":  ["GK","LD","CD","RD","LM","CM","RM","CF"],
  "9v9":  ["GK","LD","CD","RD","LM","CM","RM","LF","RF"],
  "10v10":["GK","LD","CD","RD","LM","CM","RM","LF","CF","RF"],
  "11v11":["GK","LB","CB","CB","RB","LM","CM","CM","RM","LF","RF"],
};

const POS_LABEL = {
  GK:"GK", LB:"LB", RB:"RB", CB:"CB",
  LD:"LD", RD:"RD", CD:"CD",
  LM:"LM", RM:"RM", CM:"CM",
  LF:"LF", RF:"RF", CF:"CF",
  DEF:"DEF", MID:"MID", FWD:"FWD", CAM:"CAM", CDM:"CDM",
  LW:"LW", RW:"RW", ST:"ST", Wing:"W",
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
  const leagueIdx = ageIndex(league);

  // Filter drills eligible for this age group
  const eligible = allDrills.filter(d => {
    const minIdx = ageIndex(d.ageMin || "U6");
    const maxIdx = d.ageMax ? ageIndex(d.ageMax) : AGES.length - 1;
    return leagueIdx >= minIdx && leagueIdx <= maxIdx;
  });

  // Fallback: if filter still yields nothing, use all drills
  const pool = eligible.length > 0 ? eligible : allDrills;

  const isYoung = ageNumber(league) <= 8;

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


// Single-quarter changes live in src/lib/fairPlay.js (scrambleQuarterPositions,
// redrawQuarterMembership). Do not call scheduleWholeGame to "redo one quarter"
// — that rebuilds the current quarter through Q4.

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

// Solid background for selects so the open dropdown is readable in all browsers
const SS = { ...IS, cursor: "pointer", background: "#141a12", color: C.text };

// Inline style for <option> elements so dropdown popup text is readable
const OPT = { background: "#141a12", color: "#e8e4dc" };

function Btn({ children, onClick, sm, danger, warn, primary, secondary, ghost, disabled, full, style:sx }) {
  const bg = danger ? C.danger
    : warn ? C.warn
    : primary ? `linear-gradient(135deg,${C.gold},${C.goldDark})`
    : secondary ? "rgba(255,255,255,0.03)"
    : ghost ? "transparent"
    : "rgba(255,255,255,0.1)";
  const col = primary ? "#0a0d0f" : C.text;
  const border = secondary
    ? "1px solid rgba(255,255,255,0.22)"
    : ghost ? `1px solid ${C.border}` : "none";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: sm ? "8px 12px" : "11px 16px",
      minHeight: sm ? 36 : 44,
      borderRadius: 8, border,
      cursor: disabled ? "not-allowed" : "pointer",
      fontWeight: primary ? 800 : 600,
      fontSize: sm ? 12 : 13,
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
    <div style={{ display:"flex", gap: 1, alignItems:"center", flexWrap:"wrap", flexShrink: 1, minWidth: 0 }}>
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
function dropTokenAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el?.closest?.("[data-drop]")?.getAttribute("data-drop") || null;
}

/** Pointer drag that works on touch. Tap is any press that stays under 10px. */
function usePitchDrag(onResolve) {
  const resolveRef = useRef(onResolve);
  resolveRef.current = onResolve;
  const dragRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const [hover, setHover] = useState(null);
  const [activeSource, setActiveSource] = useState(null);

  const pointerDown = (e, source, label) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      source, label, pointerId: e.pointerId,
      x: e.clientX, y: e.clientY, moved: false,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* already released */ }
    try { e.preventDefault(); } catch { /* passive listener */ }
  };

  const pointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    drag.moved = true;
    setGhost({ x: e.clientX, y: e.clientY, label: drag.label });
    setHover(dropTokenAt(e.clientX, e.clientY));
    setActiveSource(drag.source);
  };

  const pointerUp = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return "ignore";
    dragRef.current = null;
    const moved = drag.moved;
    setGhost(null);
    setHover(null);
    setActiveSource(null);
    if (!moved) return "tap";
    resolveRef.current(resolveDragDrop(drag.source, parseDrop(dropTokenAt(e.clientX, e.clientY))));
    return "drag";
  };

  return { pointerDown, pointerMove, pointerUp, ghost, hover, activeSource };
}

function SoccerField({ lineup, onTap, selectedIdx, quarter, periodAbbrev = "Q", drag, hoverToken, activeSource, onLayout }) {
  const rootRef = useRef(null);
  const slots = lineup?.starters || [];
  const slotKey = slots.map(slot => `${slot.pos}:${slot.player?.id || ""}:${slot.player?.name || ""}`).join("|");
  const [placed, setPlaced] = useState([]);
  useReportFieldLayout(rootRef, placed, onLayout);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !lineup) {
      setPlaced(prev => (prev.length ? [] : prev));
      return undefined;
    }
    const cache = new Map();
    const measureLabel = (text) => {
      const key = String(text ?? "");
      if (cache.has(key)) return cache.get(key);
      const probe = document.createElement("span");
      const fontFamily = getComputedStyle(el).fontFamily;
      probe.style.cssText = labelProbeCss(fontFamily);
      probe.textContent = key;
      el.appendChild(probe);
      const measured = probe.getBoundingClientRect().width;
      const width = measured > 0 ? Math.ceil(measured) + LABEL_WIDTH_GUARD : labelWidth(key);
      probe.remove();
      cache.set(key, width);
      return width;
    };
    const lay = () => {
      const width = Math.round(el.clientWidth);
      const height = Math.round(el.clientHeight);
      if (width <= 0 || height <= 0) {
        setPlaced(prev => (prev.length ? [] : prev));
        return;
      }
      setPlaced(layoutFieldPlayers(lineup.starters || [], {
        fieldWidth: width,
        fieldHeight: height,
        measureLabel,
      }));
    };
    lay();
    const observer = new ResizeObserver(lay);
    observer.observe(el);
    return () => observer.disconnect();
  }, [lineup, slotKey]);

  if (!lineup) return (
    <div ref={rootRef} style={{
      background: C.surface, borderRadius: 12, minHeight: 320,
      border: `2px dashed ${C.border}`, display:"flex", alignItems:"center",
      justifyContent:"center", color: C.muted, fontSize: 13, textAlign:"center", padding: 20,
    }}>
      Generate or load a lineup<br/>to see the field view
    </div>
  );

  return (
    <div ref={rootRef} style={{ position:"relative", width:"100%", margin:"0 auto", userSelect:"none" }}>
      <svg viewBox="0 0 320 480" style={{ width:"100%", display:"block", borderRadius:10, position:"relative", zIndex:0 }}>
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
              fontFamily="Arial, sans-serif" fontWeight="900" fontSize="20" letterSpacing="0.5">{periodAbbrev}{quarter}</text>
          </g>
        )}
      </svg>

      {slots.map((slot, idx) => {
        const pos = slot.pos;
        const spot = placed[idx];
        if (!spot) return null;
        const isHovered = hoverToken === `field:${idx}`;
        const isSelected = selectedIdx === idx;
        const isSource = activeSource?.type === "field" && activeSource.idx === idx;
        const fullName = slot.player?.name || "";

        return (
          <div key={idx}
            data-drop={`field:${idx}`}
            aria-label={fullName ? `${fullName}, ${pos}` : pos}
            onPointerDown={e => {
              if (!slot.player) return;
              drag?.pointerDown(e, { type: "field", idx }, `#${slot.player.number}`);
            }}
            onPointerMove={drag?.pointerMove}
            onPointerUp={e => {
              if (drag?.pointerUp(e) === "tap") onTap?.(idx);
            }}
            onPointerCancel={e => { drag?.pointerUp(e); }}
            style={{
              position:"absolute",
              left: spot.x,
              top: spot.y - CIRCLE_DIAMETER / 2,
              transform: "translateX(-50%)",
              textAlign:"center", width: CIRCLE_DIAMETER,
              cursor: slot.player ? "grab" : "default",
              zIndex: isSelected || isHovered || isSource ? 12 : 6,
              touchAction: "none",
              opacity: isSource ? 0.55 : 1,
            }}>
            <div
              data-sub-to={slot.player?.id || undefined}
              style={{
              width: CIRCLE_DIAMETER, height: CIRCLE_DIAMETER, borderRadius:"50%", margin:"0 auto", position:"relative", zIndex:2,
              boxSizing:"border-box",
              background: slot.player
                ? `linear-gradient(135deg,${C.gold},${C.goldDark})`
                : "rgba(255,255,255,0.1)",
              border: isHovered || isSource ? "3px solid #2ecc71" : isSelected ? "3px solid #fff" : "2px solid rgba(255,255,255,0.8)",
              display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column",
              boxShadow: isHovered
                ? "0 0 0 5px rgba(46,204,113,0.55)"
                : isSource
                  ? "0 0 0 4px rgba(46,204,113,0.4)"
                  : isSelected ? `0 0 0 3px ${C.gold}` : slot.player ? "0 2px 10px rgba(0,0,0,0.6)" : "none",
            }}>
              {slot.player ? (
                <>
                  <div style={{fontSize:9,color:"#1a1a1a",lineHeight:1,fontWeight:800}}>{slot.player.number}</div>
                  <div style={{fontSize:8,color:"#2a1a0a",lineHeight:1.1,fontWeight:800,letterSpacing:"0.03em",marginTop:1}}>{pos}</div>
                </>
              ) : <span style={{color:"rgba(255,255,255,0.4)",fontSize:10}}></span>}
            </div>
            {slot.player && spot.labelBox && (
              <div
                title={fullName}
                aria-label={fullName}
                style={{
                  position:"absolute",
                  left:"50%",
                  top: CIRCLE_DIAMETER + LABEL_GAP,
                  zIndex:3,
                  transform:"translateX(-50%)",
                  width: spot.labelBox.width,
                  maxWidth: spot.labelBox.width,
                  overflow:"hidden",
                  textOverflow:"ellipsis",
                  fontSize:9, color:"#fff", fontWeight:800,
                  background:"rgba(10,13,15,0.78)",
                  borderRadius:4, padding:"1px 4px",
                  textShadow:"0 1px 2px rgba(0,0,0,0.9)",
                  letterSpacing:`${LABEL_LETTER_SPACING_EM}em`, whiteSpace:"nowrap", lineHeight:1.2,
                  textAlign:"center",
                  boxSizing:"border-box",
                  pointerEvents:"none",
                }}
              >
                {spot.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 
// MID-GAME INJURY BANNER
// 
function InjuryAlert({ player, quarter, periodAbbrev = "Q", periodNoun = "quarters", onDismiss }) {
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
            <b>#{player.number} {player.name}</b> marked injured in {periodAbbrev}{quarter}.<br/>
            Minutes already played stay counted. Later {periodNoun} only lose this player.
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

  const revealEdit = (event) => {
    const card = event.target.closest("[data-player-card]");
    window.setTimeout(() => {
      (card || event.target)?.scrollIntoView({ block: "start", inline: "nearest" });
    }, 300);
  };

  return (
    <div data-player-edit style={{
      marginTop: 6, padding: "10px 10px 10px",
      background: "rgba(0,0,0,0.25)",
      borderRadius: 6, border: `1px solid ${C.border}`,
      maxWidth: "100%", minWidth: 0, boxSizing: "border-box", overflowX: "clip",
    }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={saveBasics} onFocus={revealEdit}
            style={{ ...IS, fontSize: 16, padding: "8px 10px", width: "100%", maxWidth: "100%" }} />
        </div>
        <div style={{ width: 64, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>#</div>
          <input value={num} onChange={e => setNum(e.target.value)} onBlur={saveBasics} onFocus={revealEdit}
            style={{ ...IS, fontSize: 16, padding: "8px 8px", width: "100%", maxWidth: "100%" }} />
        </div>
      </div>

      <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Positions</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10, maxWidth: "100%" }}>
        {ALL_POSITIONS.map(p => (
          <button key={p} onClick={() => togglePosition(p)} style={{
            padding: "6px 8px", borderRadius: 4, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit", lineHeight: 1,
            background: positions.includes(p) ? C.gold : "rgba(255,255,255,0.08)",
            color: positions.includes(p) ? "#0a0d0f" : C.muted,
          }}>{p}</button>
        ))}
      </div>

      <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Skill Ratings</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "6px 8px", marginBottom: 10, maxWidth: "100%" }}>
        {SKILL_CATEGORIES.map(cat => (
          <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.text, minWidth: 0 }}>{cat}</div>
            <StarRating size={14} value={(player.ratings || {})[cat] || 0} onChange={v => setRating(cat, v)} />
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
// SETTINGS  set-and-forget for Game Day. League and format stay here.
//
function GameSettings({
  open, onClose, subMode, onSubMode, setup, onOrgChange, onAgeChange, onFormatChange, onGkChange,
  onPeriodsChange, onSeasonChange, autoRegen, onAutoRegen, quarterMinutes, onQuarterMinutes, fairPlayLabel,
}) {
  if (!open) return null;
  const choice = (on, label, active, color) => (
    <button type="button" onClick={() => onSubMode(on)} aria-pressed={active} style={{
      flex: 1, minHeight: 48, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 800,
      border: active ? `2px solid ${color}` : `1px solid ${C.border}`,
      background: active ? `${color}22` : "transparent",
      color: active ? color : C.muted, fontSize: 13,
    }}>{label}</button>
  );
  return (
    <div role="dialog" aria-label="Settings" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.62)",
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(420px, 100%)", height: "100%", overflow: "auto",
        background: C.bg, borderLeft: `1px solid ${C.border}`, padding: "16px 16px 32px",
        boxSizing: "border-box",
      }}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14}}>
          <div style={{fontSize: 16, fontWeight: 800}}>Settings</div>
          <button type="button" onClick={onClose} style={{
            minHeight: 36, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontWeight: 700,
          }}>Done</button>
        </div>
        <div style={{fontSize: 11, color: C.muted, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8}}>Organization</div>
        <select value={setup.legacy ? "" : (setup.orgId || "us-soccer")} onChange={e => onOrgChange(e.target.value)}
          style={{...SS, width: "100%", fontSize: 16, padding: "8px 10px", marginBottom: 8}}>
          {setup.legacy && <option value="" style={OPT}>US Soccer standard (saved team)</option>}
          {ORGS.map(org => <option key={org.id} value={org.id} style={OPT}>{org.label}</option>)}
        </select>
        <div style={{fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 14}}>{setup.note}</div>
        {setup.verified === false && (
          <div style={{fontSize: 12, color: C.gold, lineHeight: 1.45, marginBottom: 14}}>
            Part of this default is unverified. Check the note before the match.
          </div>
        )}
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12}}>
          <div>
            <label style={{...lbl, marginBottom: 4}}>Age</label>
            <select value={setup.age} onChange={e => onAgeChange(e.target.value)}
              style={{...SS, width: "100%", fontSize: 16, padding: "8px 10px"}}>
              {AGES.map(age => <option key={age} value={age} style={OPT}>{age}</option>)}
            </select>
          </div>
          <div>
            <label style={{...lbl, marginBottom: 4, display: "flex", alignItems: "center", gap: 4}}>
              <span>On the field</span>
              {setup.orgId !== "custom" && setup.tablePlayers && setup.playersOnField !== setup.tablePlayers && (
                <span style={{fontSize: 8, color: C.gold, fontWeight: 700}}>OVERRIDE</span>
              )}
            </label>
            <select value={setup.format} onChange={e => onFormatChange(e.target.value)}
              style={{...SS, width: "100%", fontSize: 16, padding: "8px 10px"}}>
              {FORMATS.map(f => <option key={f} value={f} style={OPT}>{f}{setup.tablePlayers && f === formatFromCount(setup.tablePlayers) ? "  default" : ""}</option>)}
            </select>
          </div>
        </div>
        {setup.showSeason && (
          <div style={{marginBottom: 12}}>
            <label style={{...lbl, marginBottom: 4}}>SAY East season</label>
            <div style={{display: "flex", gap: 8}}>
              {[["fall", "Fall 11v11"], ["spring", "Spring 9v9"]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => onSeasonChange(id)} style={{
                  flex: 1, minHeight: 40, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 800,
                  border: setup.saySeason === id ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                  background: setup.saySeason === id ? "rgba(232,160,32,0.16)" : "transparent",
                  color: setup.saySeason === id ? C.gold : C.muted,
                }}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <label style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 13, color: C.text}}>
          <input type="checkbox" checked={!!setup.gk} onChange={e => onGkChange(e.target.checked)} style={{width: 18, height: 18}} />
          Goalkeeper {setup.orgId !== "custom" && setup.tableGk != null && setup.gk !== setup.tableGk ? "(override)" : ""}
        </label>
        <div style={{marginBottom: 12}}>
          <label style={{...lbl, marginBottom: 4}}>Periods</label>
          <select value={String(setup.periods)} onChange={e => onPeriodsChange(Number(e.target.value))}
            style={{...SS, width: "100%", fontSize: 16, padding: "8px 10px"}}>
            <option value="4" style={OPT}>4 quarters</option>
            <option value="3" style={OPT}>3 periods</option>
            <option value="2" style={OPT}>2 halves</option>
          </select>
        </div>
        <div style={{fontSize: 11, color: C.muted, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8}}>Play mode</div>
        <div style={{display: "flex", gap: 8, marginBottom: 8}}>
          {choice(true, "Half periods", subMode, "#2ecc71")}
          {choice(false, "Full periods", !subMode, C.gold)}
        </div>
        <div style={{fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 16}}>
          {subMode
            ? `Subs at the middle of each ${setup.periodNounOne}. The goalkeeper still plays the whole ${setup.periodNounOne}.`
            : `Each ${setup.periodNounOne} is planned whole. Half swaps and the sub queue stay off.`}
        </div>
        <div style={{fontSize: 12, color: C.text, lineHeight: 1.45, marginBottom: 14}}>{fairPlayLabel}</div>
        <label style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: 13, color: C.text}}>
          <input type="checkbox" checked={!!autoRegen} onChange={e => onAutoRegen(e.target.checked)} style={{width: 18, height: 18}} />
          Auto-regenerate lineup when a player is marked injured, out, or returns
        </label>
        <div style={{marginBottom: 16}}>
          <label style={{...lbl, marginBottom: 4}}>{setup.periodNounOne[0].toUpperCase() + setup.periodNounOne.slice(1)} length (minutes)</label>
          <input
            type="number"
            min="1"
            max="60"
            inputMode="numeric"
            value={quarterMinutes ?? ""}
            placeholder={String(setup.tableMinutes || setup.periodMinutes)}
            onChange={e => {
              const raw = e.target.value;
              const fallback = setup.tableMinutes || setup.periodMinutes;
              if (raw === "") onQuarterMinutes(null);
              else onQuarterMinutes(Math.max(1, Math.min(60, Number(raw) || fallback)));
            }}
            style={{...IS, fontSize: 16, padding: "8px 10px"}}
          />
          <div style={{fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4}}>
            Default is {setup.tableMinutes || setup.periodMinutes} minutes. Clear the box to use that again.
          </div>
        </div>
        <div style={{fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 16}}>
          Save game day writes this strategy, the field sheet, and the play-time sheet onto the Season game log.
        </div>
        <div style={{fontSize: 11, color: C.muted, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8}}>Weather</div>
        <WeatherButton />
      </div>
    </div>
  );
}

//
// TAB: GAME DAY
//
function shapesFor(format, gk, slots) {
  const list = (gk ? FORMATION_TEMPLATES[format] : []) || [];
  const usable = list.filter(item => item.slots?.length === slots.length && item.slots.includes("GK") === !!gk);
  if (usable.length) return usable;
  return [{ name: "Standard", label: "Standard", desc: "Default shape for this player count.", slots }];
}

function TabGame({ format, league, players, setPlayers, addPlayer, removePlayer, lineupsByQuarter, setLineupsByQuarter, storagePrefix = "ck_guest_", setGames, subMode = true, autoRegen = true, quarterMinutes = null, gameDay, setGameDay, setup }) {
  const [quarter,       setQuarterRaw]    = useState(1);
  const [injuryAlerts,  setInjuryAlerts]  = useState([]);
  const [justRegenned,  setJustRegenned]  = useState(false);
  const [showRotation,  setShowRotation]  = useState(false);
  const [showFormations,setShowFormations]= useState(false);
  const [activeFormation,setActiveFormation]=[normalizeGameDay(gameDay).formation, bindField(setGameDay, "formation", normalizeGameDay)];
  const [saveNote, setSaveNote] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [rosterSort,    setRosterSort]    = useState("name"); // name | rating | position
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newName,       setNewName]       = useState("");
  const [newNum,        setNewNum]        = useState("");
  const [swapSel, setSwapSel] = useState(null);
  const [fairWarn, setFairWarn] = useState(null);
  const [scrambleNote, setScrambleNote] = useState(null);
  const [planNote, setPlanNote] = useState(null);
  const recentPlanKeys = useRef([]);
  const [planSub, setPlanSub] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [halfFlash, setHalfFlash] = useState(false);
  const [queueNote, setQueueNote] = useState(null);
  const [running, setRunning] = useState(false);
  const [stintStart, setStintStart] = useState({});
  const [shapeOnly, setShapeOnly] = useState(false);
  const applyDragRef = useRef(() => {});
  const drag = usePitchDrag(result => applyDragRef.current(result));

  // When the player count or goalkeeper flag changes, reset to a valid shape
  useEffect(() => {
    const templates = shapesFor(format, !!setup?.gk, setup?.slots || []);
    if (templates.length === 0) return;
    const stillValid = templates.some(t => t.name === activeFormation);
    if (!stillValid) setActiveFormation(templates[0].name);
  }, [format, setup?.gk, setup?.playersOnField]);

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

  // Score, subs, and formation sync with the team. The quarter clock stays on this device
  // because it ticks every second. Saved season logs are a separate record.
  const live = normalizeGameDay(gameDay);
  const [homeScore, setHomeScore] = [live.homeScore, bindField(setGameDay, "homeScore", normalizeGameDay)];
  const [awayScore, setAwayScore] = [live.awayScore, bindField(setGameDay, "awayScore", normalizeGameDay)];
  const [opponent,  setOpponent]  = [live.opponent, bindField(setGameDay, "opponent", normalizeGameDay)];
  const [minuteBank, setMinuteBank] = [live.minuteBank, bindField(setGameDay, "minuteBank", normalizeGameDay)];
  const [appearanceCredit, setAppearanceCredit] = [live.appearanceCredit, bindField(setGameDay, "appearanceCredit", normalizeGameDay)];
  const [subSegments, setSubSegments] = [live.subSegments, bindField(setGameDay, "subSegments", normalizeGameDay)];
  const [pairPlan, setPairPlan] = [live.pairPlan, bindField(setGameDay, "pairPlan", normalizeGameDay)];
  const [subQueue, setSubQueue] = [live.subQueue, bindField(setGameDay, "subQueue", normalizeGameDay)];
  const [realPeriodEvents, setRealPeriodEvents] = [live.realPeriodEvents, bindField(setGameDay, "realPeriodEvents", normalizeGameDay)];
  const [chartFocusId, setChartFocusId] = useState(null);
  const [clockSec, setClockSec] = usePersistedState(storagePrefix+"clockSec", 0);
  const [clockByPeriod, setClockByPeriod] = usePersistedState(storagePrefix+"clockByPeriod", {});
  const [editOpp,   setEditOpp]   = useState(false);
  const clockRef = useRef(0);
  const stintRef = useRef({});
  const clocksRef = useRef(clockByPeriod || {});
  const bankRef = useRef({});
  const quarterRef = useRef(quarter);
  const lineupsRef = useRef(lineupsByQuarter);
  useEffect(() => { clockRef.current = clockSec; }, [clockSec]);
  useEffect(() => { stintRef.current = stintStart; }, [stintStart]);
  useEffect(() => { clocksRef.current = clockByPeriod || {}; }, [clockByPeriod]);
  useEffect(() => { bankRef.current = minuteBank || {}; }, [minuteBank]);
  useEffect(() => { quarterRef.current = quarter; }, [quarter]);
  useEffect(() => { lineupsRef.current = lineupsByQuarter; }, [lineupsByQuarter]);
  const halfFired = useRef(false);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setClockSec(sec => sec + 1), 1000);
    return () => clearInterval(id);
  }, [running, setClockSec]);

  // -- SHARE LINEUP --
  const [showShare, setShowShare] = useState(false);
  const shareCanvasRef = useRef(null);

  const totalQuarters = setup?.periods || 4;
  useEffect(() => {
    if (quarter > totalQuarters) setQuarterRaw(totalQuarters);
  }, [quarter, totalQuarters]);
  const periodList = Array.from({ length: totalQuarters }, (_, i) => i + 1);
  const abbr = setup?.periodAbbrev || "Q";
  const noun = setup?.periodNoun || "quarters";
  const nounOne = setup?.periodNounOne || "quarter";
  const minQ   = minQuarters(setup?.minFraction ?? 0.5, totalQuarters);

  const currentLineup  = lineupsByQuarter[quarter] || null;
  const active         = players.filter(p => !p.injured && !p.out);
  const planSlotsNow  = setup?.slots?.length ? setup.slots : defaultSlots(playersFromFormat(format) || 7, true);
  const needed         = planSlotsNow.length;
  const midGameInjured = players.filter(p => p.midGameInjury);
  const allPlanned     = periodList.every(q => !!lineupsByQuarter[q]);
  const gate           = feasibility({ activeCount: active.length, slotsPerPeriod: needed, minQ, periods: totalQuarters, subMode });

  const periodMin = Number(quarterMinutes) > 0 ? Number(quarterMinutes) : (setup?.periodMinutes || 10);
  useEffect(() => {
    const half = periodMin * 30;
    if (half <= 0) return undefined;
    if (clockSec < half) {
      halfFired.current = false;
      setHalfFlash(false);
      return undefined;
    }
    if (!running) {
      halfFired.current = true;
      return undefined;
    }
    if (halfFired.current) return undefined;
    halfFired.current = true;
    setHalfFlash(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    } catch { /* this browser does not vibrate */ }
    const id = setTimeout(() => setHalfFlash(false), 2000);
    return () => clearTimeout(id);
  }, [running, periodMin, clockSec >= periodMin * 30]);
  const minHalves = minQ * 2;
  const halvesFor = (id, lineups = lineupsByQuarter, credit = appearanceCredit, segments = subSegments) =>
    equityHalves(id, { lineups, segments, credit, quarters: periodList });

  const violations = allPlanned && minQ > 0
    ? players.filter(p => !p.injured && !p.out && !p.midGameInjury && halvesFor(p.id) < minHalves)
    : [];

  useEffect(() => { setSwapSel(null); }, [quarter]);

  const writeBank = (bank) => {
    bankRef.current = bank || {};
    try {
      const raw = localStorage.getItem(storagePrefix + "gameDay");
      const current = raw ? JSON.parse(raw) : {};
      localStorage.setItem(storagePrefix + "gameDay", JSON.stringify({ ...normalizeGameDay(current), minuteBank: bankRef.current }));
      localStorage.setItem(storagePrefix + "minuteBank", JSON.stringify(bankRef.current));
    } catch { /* storage full */ }
  };

  const bankLeave = (playerId) => {
    if (!playerId) return;
    const elapsed = clockRef.current || 0;
    const start = stintRef.current[playerId];
    const from = start == null ? elapsed : start;
    const mins = Math.max(0, (elapsed - from) / 60);
    const nextStints = { ...stintRef.current };
    delete nextStints[playerId];
    stintRef.current = nextStints;
    setStintStart(nextStints);
    if (mins > 0) {
      const nextBank = addMinutes(bankRef.current, playerId, mins);
      writeBank(nextBank);
      setMinuteBank(nextBank);
    }
  };

  const beginStint = (playerId) => {
    if (!playerId) return;
    const next = { ...stintRef.current, [playerId]: clockRef.current || 0 };
    stintRef.current = next;
    setStintStart(next);
  };

  const commitOnFieldMinutes = () => {
    const lineup = lineupsRef.current?.[quarterRef.current];
    const ids = (lineup?.starters || []).map(slot => slot.player?.id).filter(Boolean);
    ids.forEach(bankLeave);
  };

  const setQuarter = (value) => {
    const requested = typeof value === "function" ? value(quarterRef.current) : value;
    const next = clampPeriod(quarterRef.current, requested, totalQuarters);
    if (next === quarterRef.current) return;
    setRunning(false);
    commitOnFieldMinutes();
    const lineup = lineupsRef.current?.[quarterRef.current];
    const held = {};
    (lineup?.starters || []).forEach(slot => {
      if (slot.player?.id) held[slot.player.id] = clockRef.current || 0;
    });
    const switched = clockAfterPeriodSwitch(
      clocksRef.current,
      quarterRef.current,
      next,
      clockRef.current || 0,
      held,
    );
    clocksRef.current = switched.clocks;
    setClockByPeriod(switched.clocks);
    clockRef.current = switched.clockSec;
    setClockSec(switched.clockSec);
    stintRef.current = switched.stints || {};
    setStintStart(switched.stints || {});
    setQuarterRaw(next);
    setSwapSel(null);
  };

  const commitRef = useRef(() => {});
  commitRef.current = commitOnFieldMinutes;
  useEffect(() => {
    const onLeave = () => {
      commitRef.current();
      const lineup = lineupsRef.current?.[quarterRef.current];
      const next = {};
      (lineup?.starters || []).forEach(slot => {
        if (slot.player?.id) next[slot.player.id] = clockRef.current || 0;
      });
      stintRef.current = next;
      setStintStart(next);
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

  const rememberSheet = (lineups) => {
    if (!lineups || !Object.keys(lineups).some(key => lineups[key]?.starters)) return;
    const key = planHistoryKey(lineups, 1);
    recentPlanKeys.current = [key, ...recentPlanKeys.current.filter(item => item !== key)].slice(0, 5);
  };

  const notePlanResult = (nextLineups, roster = players, credit = appearanceCredit, segments = subSegments) => {
    setLineupsByQuarter(nextLineups);
    setFairWarn(null);
    setScrambleNote(null);
    setSwapSel(null);
    setPlanNote(null);
    const viol = roster.filter(p => !p.injured && !p.out && !p.midGameInjury && minQ > 0 && halvesFor(p.id, nextLineups, credit, segments) < minHalves);
    const complete = periodList.every(q => nextLineups?.[q]);
    if (viol.length === 0 && complete) {
      setJustRegenned(true);
      setTimeout(() => setJustRegenned(false), 2500);
    } else {
      setJustRegenned(false);
    }
  };

  const noteOnlyLineup = () => {
    setJustRegenned(false);
    setFairWarn(null);
    setScrambleNote(null);
    setPlanNote("Only one valid lineup for this roster.");
  };

  const warnIfShort = (nextLineups, roster = players, credit = appearanceCredit, segments = subSegments) => {
    const unplanned = periodList.filter(q => !nextLineups?.[q]).length;
    const short = roster.filter(p => {
      if (p.injured || p.out || p.midGameInjury || minQ <= 0) return false;
      const halves = halvesFor(p.id, nextLineups, credit, segments);
      return halves + unplanned * 2 < minHalves;
    });
    if (short.length) {
      const names = short.map(p => {
        const halves = halvesFor(p.id, nextLineups, credit, segments);
        return `${p.name.split(" ")[0]} ${formatQuarterEquity(halves)}/${minQ}`;
      }).join(", ");
      setFairWarn(`${names} would finish under ${minQ} of ${totalQuarters} ${noun}. A split counts as half. Other ${noun} were not changed.`);
    } else {
      setFairWarn(null);
    }
  };

  const resetLiveTracking = () => {
    writeBank({});
    setMinuteBank({});
    setAppearanceCredit({});
    setSubSegments({});
    setPairPlan({});
    setSubQueue([]);
    setRunning(false);
    clockRef.current = 0;
    setClockSec(0);
    clocksRef.current = {};
    setClockByPeriod({});
    stintRef.current = {};
    setStintStart({});
    setRealPeriodEvents({});
    setPlanSub(false);
    setQueueNote(null);
  };

  // -- Plan entire game from scratch (or from a quarter onwards) --
  const planWholeGame = (fromQ = 1, options = {}) => {
    if (!gate.ok) {
      setJustRegenned(false);
      setScrambleNote(null);
      return;
    }
    const clockStarted = running || (clockRef.current || 0) > 0;
    const realEvent = periodHasRealEvent(realPeriodEvents, fromQ);
    const decision = liveReplanClockDecision({
      liveReplan: !!options.liveReplan,
      fromQuarter: fromQ,
      quarter,
      clockStarted: fromQ === quarter && clockStarted,
      realEvent: fromQ === quarter && realEvent,
    });
    const keptRealEvents = decision.resetClock
      ? {}
      : realEventsThrough(realPeriodEvents, decision.pinGoalkeeper ? fromQ : fromQ - 1);
    if (decision.resetClock) resetLiveTracking();
    else if (fromQ === quarter) commitOnFieldMinutes();
    const locked = {};
    if (fromQ > 1) {
      for (let q = 1; q < fromQ; q++) {
        if (lineupsByQuarter[q]) locked[q] = lineupsByQuarter[q];
      }
    }
    const carried = replanCarryForward({
      resetClock: decision.resetClock,
      fromQuarter: fromQ,
      livePeriod: decision.pinGoalkeeper,
      segments: subSegments,
      credit: appearanceCredit,
      overrides: normalizeFormationOverrides(normalizeGameDay(gameDay).formationOverrides),
    });
    const nextSegments = carried.segments;
    const formatSlots = planSlotsNow;
    const templates = shapesFor(format, !!setup?.gk, formatSlots);
    const overridesNow = carried.overrides;
    if (decision.resetClock) {
      setGameDay(prev => ({ ...normalizeGameDay(prev), formationOverrides: {} }));
    }
    const slotsForName = (name) => {
      const shape = templates.find(item => item.name === name);
      return shape?.slots?.length === formatSlots.length ? shape.slots : formatSlots;
    };
    const planSlots = slotsForName(activeFormation);
    const slotsByQuarter = {};
    for (let q = fromQ; q <= totalQuarters; q++) {
      slotsByQuarter[q] = slotsForName(formationNameForPeriod(activeFormation, overridesNow, q, totalQuarters));
    }
    const creditForPlan = carried.credit;
    const liveGk = decision.pinGoalkeeper
      ? liveReplanGoalkeeper(lineupsByQuarter, fromQ, true)
      : null;
    rememberSheet(lineupsByQuarter);
    const meets = (lineups, segments) => sheetMeetsMinimum(players, lineups, segments, {
      minHalves,
      totalQuarters,
      credit: creditForPlan,
    });
    const savedSubSegments = (result) => segmentsSavedForSubReplan(
      result?.segments,
      subSegments,
      result?.lineups,
      { fromQuarter: fromQ, resetClock: decision.resetClock, livePeriod: decision.pinGoalkeeper },
    );
    const savedFullSegments = (result) => segmentsSavedForFullReplan(
      subSegments,
      result,
      { fromQuarter: fromQ, resetClock: decision.resetClock, livePeriod: decision.pinGoalkeeper },
    );
    if (subMode) {
      const chosen = firstDifferentPlan({
        currentLineups: lineupsByQuarter,
        currentPlan: { lineups: lineupsByQuarter, segments: decision.resetClock ? {} : subSegments },
        fromQuarter: fromQ,
        recentKeys: recentPlanKeys.current,
        lockGoalkeeperId: liveGk,
        fairPlay: (result) => meets(result?.lineups, savedSubSegments(result)),
        plan: (seed) => scheduleHalfRotation(players, planSlots, {
          minHalves,
          fromQuarter: fromQ,
          lockedLineups: locked,
          lockedSegments: nextSegments,
          totalQuarters,
          rate: getOverallRating,
          slotsByQuarter,
          seed,
          lockGoalkeeperId: liveGk,
        }),
      });
      if (chosen.unchanged) {
        noteOnlyLineup();
        return;
      }
      const planned = chosen.plan;
      rememberSheet(planned.lineups);
      const storedHalfSegments = savedSubSegments(planned);
      setRealPeriodEvents(keptRealEvents);
      setSubSegments(storedHalfSegments);
      notePlanResult(planned.lineups, players, creditForPlan, storedHalfSegments);
      if (!decision.resetClock && fromQ === quarter && running) {
        const next = {};
        (planned.lineups[quarter]?.starters || []).forEach(slot => {
          if (slot.player?.id) next[slot.player.id] = clockRef.current || 0;
        });
        stintRef.current = next;
        setStintStart(next);
      }
      return;
    }
    const chosen = firstDifferentPlan({
      currentLineups: lineupsByQuarter,
      currentPlan: lineupsByQuarter,
      fromQuarter: fromQ,
      recentKeys: recentPlanKeys.current,
      lockGoalkeeperId: liveGk,
      fairPlay: (result) => meets(result, savedFullSegments(result)),
      plan: (seed) => scheduleWholeGame({
        players,
        format,
        lockedLineups: locked,
        fromQuarter: fromQ,
        segments: nextSegments,
        credit: creditForPlan,
        slotOverride: planSlots,
        totalPeriods: totalQuarters,
        minFraction: setup?.minFraction ?? 0.5,
        slotsByQuarter,
        seed,
        lockGoalkeeperId: liveGk,
        rate: getOverallRating,
      }),
    });
    if (chosen.unchanged) {
      noteOnlyLineup();
      return;
    }
    const result = chosen.plan;
    rememberSheet(result);
    const storedSegments = savedFullSegments(result);
    setRealPeriodEvents(keptRealEvents);
    setSubSegments(storedSegments);
    notePlanResult(result, players, creditForPlan, storedSegments);
    if (!decision.resetClock && fromQ === quarter && running) {
      const next = {};
      (result[quarter]?.starters || []).forEach(slot => {
        if (slot.player?.id) next[slot.player.id] = clockRef.current || 0;
      });
      stintRef.current = next;
      setStintStart(next);
    }
  };

  const dropQueued = (playerId) => {
    setSubQueue(prev => (prev || []).filter(row => row.outId !== playerId && row.inId !== playerId));
  };

  const formationBundle = () => {
    const overrides = normalizeFormationOverrides(normalizeGameDay(gameDay).formationOverrides);
    const templates = shapesFor(format, !!setup?.gk, planSlotsNow);
    const slotsForName = (name) => {
      const shape = templates.find(item => item.name === name);
      return shape?.slots?.length === planSlotsNow.length ? shape.slots : planSlotsNow;
    };
    const slotsByQuarter = {};
    periodList.forEach(q => {
      slotsByQuarter[q] = slotsForName(formationNameForPeriod(activeFormation, overrides, q, totalQuarters));
    });
    return { overrides, slotsForName, slotsByQuarter };
  };
  const planSlotsFor = () => formationBundle().slotsByQuarter[quarter] || planSlotsNow;

  const syncStints = (lineup) => {
    if (!running) return;
    const next = {};
    (lineup?.starters || []).forEach(slot => {
      if (slot.player?.id) next[slot.player.id] = clockRef.current || 0;
    });
    stintRef.current = next;
    setStintStart(next);
  };

  // Injury and late scratches rebuild the sheet. Unavailable quarters stay blank.
  const markUnavailable = (playerId, mode) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    const currentL = lineupsByQuarter[quarter];
    const wasOn = !!currentL?.starters?.some(slot => slot.player?.id === playerId);
    const live = running || (clockRef.current || 0) > 0 || periodHasRealEvent(realPeriodEvents, quarter);
    if (wasOn) bankLeave(playerId);
    const updatedPlayers = players.map(p => {
      if (p.id !== playerId) return p;
      if (mode === "out") return { ...p, out: true, injured: false, midGameInjury: false, injuredInQuarter: quarter, returnQuarter: null };
      return { ...p, injured: true, out: false, midGameInjury: true, injuredInQuarter: quarter, returnQuarter: null };
    });
    setPlayers(updatedPlayers);
    dropQueued(playerId);
    if (mode === "injury") setInjuryAlerts(prev => [...prev, { player, quarter, id: Date.now() }]);
    const hasSheet = Object.keys(lineupsByQuarter).length > 0;
    if (live || (autoRegen && hasSheet)) {
      setRealPeriodEvents(prev => realEventsAfterUnavailable(prev, {
        quarter,
        live,
        playerId,
        autoRegen,
      }));
    }
    if (!hasSheet) return;
    let credit = appearanceCredit;
    if (wasOn) credit = setAppearanceCreditFor(credit, playerId, quarter, true);
    if (autoRegen) {
      const planned = planAvailability({
        autoRegen: true,
        kind: "absent",
        players: updatedPlayers,
        slots: planSlotsNow,
        slotsByQuarter: formationBundle().slotsByQuarter,
        lineups: lineupsByQuarter,
        segments: subSegments,
        absentId: playerId,
        quarter,
        minHalves,
        subMode,
        rate: getOverallRating,
        totalQuarters,
        livePeriod: live,
      });
      let segments = planned.segments;
      if (wasOn && live) segments = noteSubSegment(segments, playerId, quarter, "left");
      setAppearanceCredit(credit);
      setSubSegments(segments);
      notePlanResult(planned.lineups, updatedPlayers, credit, segments);
      syncStints(planned.lineups[quarter]);
      return;
    }
    if (!currentL) return;
    if (wasOn) {
      setAppearanceCredit(credit);
      if (live) setSubSegments(prev => noteSubSegment(prev, playerId, quarter, "left"));
    }
    const before = new Set((currentL.starters || []).map(slot => slot.player?.id).filter(Boolean));
    const next = pullFromPlan(lineupsByQuarter, playerId, quarter, totalQuarters);
    const incoming = (next[quarter]?.starters || []).map(slot => slot.player?.id).find(id => id && !before.has(id));
    if (incoming) {
      beginStint(incoming);
      if (live) {
        credit = setAppearanceCreditFor(credit, incoming, quarter, false);
        setAppearanceCredit(credit);
        setSubSegments(prev => noteSubSegment(prev, incoming, quarter, "entered"));
      }
    }
    setLineupsByQuarter(next);
    setSwapSel(null);
    setFairWarn(null);
  };

  const restorePlayer = (playerId, source = "roster") => {
    const liveReturn = running || (clockRef.current || 0) > 0 || periodHasRealEvent(realPeriodEvents, quarter);
    const hasSheet = Object.keys(lineupsByQuarter).length > 0;
    const result = returnToGame({
      source,
      autoRegen: !!autoRegen && hasSheet,
      players,
      playerId,
      quarter,
      totalQuarters,
      lineups: lineupsByQuarter,
      segments: subSegments,
      slots: planSlotsNow,
      slotsByQuarter: formationBundle().slotsByQuarter,
      subMode,
      minHalves,
      rate: getOverallRating,
      livePeriod: liveReturn,
      protectedIds: realEventPlayerIds(realPeriodEvents, quarter),
    });
    setPlayers(result.players);
    if (!result.regenerated) return;
    // The rebuild drops manual-change flags on later periods. A live Return
    // still keeps the flag already on this period.
    setRealPeriodEvents(prev => realEventsAfterReturn(prev, {
      quarter,
      regenerated: true,
    }));
    setSubSegments(result.segments);
    notePlanResult(result.lineups, result.players, appearanceCredit, result.segments);
    syncStints(result.lineups[quarter]);
  };

  const gkLocked = () => subMode || running || (clockRef.current || 0) > 0;
  const refuseGoalkeeper = () => {
    setQueueNote(setup?.gkReason || GK_FULL_QUARTER_REASON);
    setSwapSel(null);
    return true;
  };

  const handleSwap = (idxA, idxB) => {
    if (!currentLineup) return;
    const newStarters = currentLineup.starters.map(slot => ({ ...slot }));
    if (gkLocked() && (isGkPosition(newStarters[idxA]?.pos) || isGkPosition(newStarters[idxB]?.pos))) {
      refuseGoalkeeper();
      return;
    }
    const playerA = newStarters[idxA]?.player || null;
    newStarters[idxA] = { ...newStarters[idxA], player: newStarters[idxB]?.player || null };
    newStarters[idxB] = { ...newStarters[idxB], player: playerA };
    setLineupsByQuarter(prev => ({ ...prev, [quarter]: { ...currentLineup, starters: newStarters } }));
    setSwapSel(null);
    setFairWarn(null);
  };

  const swapBenchAndField = (fieldIdx, benchPlayerId, options = {}) => {
    const lineup = options.lineup || currentLineup;
    const qKey = options.quarter || quarter;
    const doBank = options.bank !== false && qKey === quarter;
    if (!lineup) return false;
    const bench = [...(lineup.bench || [])];
    const bIdx = bench.findIndex(p => p.id === benchPlayerId);
    if (bIdx < 0 || fieldIdx == null || !lineup.starters[fieldIdx]) return false;
    if (isGkPosition(lineup.starters[fieldIdx].pos) && (options.midQuarter || gkLocked())) {
      refuseGoalkeeper();
      return false;
    }
    const starters = lineup.starters.map(slot => ({ ...slot }));
    const incoming = bench[bIdx];
    const outgoing = starters[fieldIdx].player || null;
    if (outgoing?.id === incoming.id) { setSwapSel(null); return false; }
    const fullQuarterGk = isGkPosition(starters[fieldIdx].pos);
    starters[fieldIdx] = { ...starters[fieldIdx], player: incoming };
    if (outgoing) bench[bIdx] = outgoing;
    else bench.splice(bIdx, 1);
    let credit = appearanceCredit;
    let nextSegments = subSegments;
    if (!fullQuarterGk) {
      if (outgoing) credit = setAppearanceCreditFor(credit, outgoing.id, qKey, true);
      if (incoming) credit = setAppearanceCreditFor(credit, incoming.id, qKey, false);
      nextSegments = markQuarterSub(subSegments, qKey, outgoing?.id, incoming?.id);
    }
    setRealPeriodEvents(prev => noteRealPeriodEvent(prev, qKey, [outgoing?.id, incoming?.id]));
    setAppearanceCredit(credit);
    setSubSegments(nextSegments);
    if (doBank) {
      if (outgoing) bankLeave(outgoing.id);
      beginStint(incoming.id);
    }
    const nextLineup = { starters, bench };
    const nextAll = { ...lineupsByQuarter, [qKey]: nextLineup };
    setLineupsByQuarter(nextAll);
    setSwapSel(null);
    warnIfShort(nextAll, players, credit, nextSegments);
    return true;
  };

  const queueSwap = (outId, inId) => {
    if (outId && outId === goalkeeperId(currentLineup)) {
      refuseGoalkeeper();
      return;
    }
    const added = addPendingSwap(subQueue, {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      quarter,
      outId,
      inId,
    });
    if (!added.ok) { setQueueNote(added.reason); return; }
    setSubQueue(added.queue);
    setQueueNote(null);
    setSwapSel(null);
  };

  const executeSwap = (row) => {
    if (!subMode) {
      setQueueNote(`Full ${noun}. Turn on sub mode to run a half swap.`);
      return;
    }
    const lineup = lineupsByQuarter[row.quarter];
    if (!lineup) { setQueueNote(`That ${nounOne} has no lineup.`); return; }
    const fieldIdx = lineup.starters.findIndex(slot => slot.player?.id === row.outId);
    if (fieldIdx < 0) { setQueueNote(`That player is no longer on the field for that ${nounOne}.`); return; }
    if (isGkPosition(lineup.starters[fieldIdx]?.pos)) { refuseGoalkeeper(); return; }
    if (!(lineup.bench || []).some(p => p.id === row.inId)) { setQueueNote(`The sub is not on the bench for that ${nounOne}.`); return; }
    const ok = swapBenchAndField(fieldIdx, row.inId, {
      lineup,
      quarter: row.quarter,
      bank: row.quarter === quarter,
    });
    if (!ok) return;
    setSubQueue(prev => cancelOneSwap(prev, row.id));
    setQueueNote(null);
  };

  const onFieldTap = (idx) => {
    if (!currentLineup) return;
    if (!subMode && planSub) setPlanSub(false);
    if (subMode && planSub) {
      const player = currentLineup.starters[idx]?.player;
      if (!player) return;
      if (isGkPosition(currentLineup.starters[idx]?.pos)) { refuseGoalkeeper(); return; }
      if (swapSel?.type === "field" && swapSel.idx === idx) { setSwapSel(null); setQueueNote(null); return; }
      setSwapSel({ type: "field", idx, playerId: player.id });
      setQueueNote("Tap the bench player who comes on.");
      return;
    }
    if (subMode && swapSel?.type === "bench") {
      const outPlayer = currentLineup.starters[idx]?.player;
      if (!outPlayer) return;
      if (isGkPosition(currentLineup.starters[idx]?.pos)) { refuseGoalkeeper(); return; }
      setPairPlan(prev => ({
        ...(prev || {}),
        [quarter]: retargetPair(prev?.[quarter], swapSel.playerId, outPlayer.id, currentLineup),
      }));
      setSwapSel(null);
      setQueueNote(`${playerName(swapSel.playerId)} on for ${outPlayer.name}. The dotted line moved. Drag when you want them to switch now.`);
      return;
    }
    if (swapSel?.type === "field") {
      if (swapSel.idx === idx) { setSwapSel(null); return; }
      handleSwap(swapSel.idx, idx);
      return;
    }
    setSwapSel({ type: "field", idx });
  };

  const onBenchTap = (playerId) => {
    if (!subMode) {
      if (swapSel?.type === "field") {
        swapBenchAndField(swapSel.idx, playerId);
        return;
      }
      setQueueNote(`Full ${noun}. Drag a player to swap. Turn on sub mode for half swaps.`);
      return;
    }
    if (planSub) {
      if (swapSel?.type !== "field") {
        setQueueNote("Tap who leaves the field first.");
        return;
      }
      const outId = currentLineup?.starters?.[swapSel.idx]?.player?.id;
      if (!outId) { setQueueNote("Tap who leaves the field first."); return; }
      queueSwap(outId, playerId);
      return;
    }
    if (swapSel?.type === "field") {
      swapBenchAndField(swapSel.idx, playerId);
      return;
    }
    if (swapSel?.type === "bench" && swapSel.playerId === playerId) {
      setSwapSel(null);
      return;
    }
    setSwapSel({ type: "bench", playerId });
  };

  const clearSlotToBench = (fieldIdx) => {
    if (!currentLineup) return;
    if (isGkPosition(currentLineup.starters[fieldIdx]?.pos) && gkLocked()) { refuseGoalkeeper(); return; }
    const outgoing = currentLineup.starters[fieldIdx]?.player;
    if (!outgoing) return;
    bankLeave(outgoing.id);
    const starters = currentLineup.starters.map((slot, i) => i === fieldIdx ? { ...slot, player: null } : slot);
    const bench = [...(currentLineup.bench || []), outgoing];
    const nextAll = { ...lineupsByQuarter, [quarter]: { starters, bench } };
    setLineupsByQuarter(nextAll);
    setSwapSel(null);
    warnIfShort(nextAll);
  };

  const applyDrag = (result) => {
    if (!result || result.action === "none" || !currentLineup) return;
    if (result.action === "swap-field") { handleSwap(result.a, result.b); return; }
    if (result.action === "swap-bench") { swapBenchAndField(result.fieldIdx, result.playerId); return; }
    if (result.action === "bench-zone") {
      const minutes = {};
      (currentLineup.bench || []).forEach(player => {
        minutes[player.id] = earnedMinutes(player.id, {
          bank: bankRef.current,
          onField: false,
          clockSec: clockRef.current,
          stintStartSec: stintRef.current,
        });
      });
      const nextUp = rankWhosNext(currentLineup.bench || [], minutes)[0];
      if (nextUp) swapBenchAndField(result.fieldIdx, nextUp.id);
      else clearSlotToBench(result.fieldIdx);
    }
  };
  applyDragRef.current = applyDrag;

  const scramblePositions = () => {
    if (!currentLineup) return;
    const next = scrambleQuarterPositions(currentLineup);
    setLineupsByQuarter(prev => ({ ...prev, [quarter]: next }));
    setSwapSel(null);
    setFairWarn(null);
    setScrambleNote(`${abbr}${quarter} positions reshuffled. Same players stayed on the field. The goalkeeper stayed in goal.`);
  };

  const scrambleMembership = () => {
    if (!currentLineup) return;
    commitOnFieldMinutes();
    const result = redrawQuarterMembership(players, lineupsByQuarter, quarter, minQ, totalQuarters, {
      segments: subSegments,
      credit: appearanceCredit,
      lockGoalkeeper: gkLocked(),
    });
    setSwapSel(null);
    if (!result.ok) {
      if (running) {
        const next = {};
        (currentLineup.starters || []).forEach(slot => {
          if (slot.player?.id) next[slot.player.id] = clockRef.current || 0;
        });
        stintRef.current = next;
        setStintStart(next);
      }
      setScrambleNote(result.reason);
      return;
    }
    const nextAll = { ...lineupsByQuarter, [quarter]: result.lineup };
    setLineupsByQuarter(nextAll);
    setScrambleNote(`${abbr}${quarter} redrawn. The other ${noun} were left alone.`);
    warnIfShort(nextAll);
    if (running) {
      const next = {};
      (result.lineup?.starters || []).forEach(slot => {
        if (slot.player?.id) next[slot.player.id] = clockRef.current || 0;
      });
      stintRef.current = next;
      setStintStart(next);
    }
  };

  const onFieldIds = new Set(
    (currentLineup?.starters || []).filter(s => s.player).map(s => s.player.id)
  );
  const minutesById = {};
  players.forEach(p => {
    minutesById[p.id] = earnedMinutes(p.id, {
      bank: minuteBank,
      onField: onFieldIds.has(p.id),
      clockSec,
      stintStartSec: stintStart,
    });
  });
  const anyMinutes = clockSec > 0 || running || Object.values(minuteBank || {}).some(n => n > 0);
  const whosNext = rankWhosNext(currentLineup?.bench || [], minutesById);
  const pendingSwaps = (subQueue || []).filter(row => row.status === "pending");
  const longestOnField = () => {
    const on = (currentLineup?.starters || []).map(slot => slot.player).filter(Boolean);
    if (!on.length) return null;
    return [...on].sort((a, b) => (minutesById[b.id] || 0) - (minutesById[a.id] || 0) || String(a.name || "").localeCompare(String(b.name || "")))[0];
  };
  const playerName = (id) => players.find(p => p.id === id)?.name || "Player";
  const plannedNext = quarter < totalQuarters ? lineupsByQuarter[quarter + 1] : null;
  const benchPairs = currentLineup
    ? planBenchRotation(currentLineup, { minutesById, nextLineup: plannedNext })
    : [];
  const subPairs = pairsForDisplay(benchPairs, pairPlan?.[quarter], currentLineup);
  const shownPairs = subMode ? subPairs : [];
  const lineupKey = [
    (currentLineup?.starters || []).map(slot => `${slot.pos}:${slot.player?.id || ""}`).join(","),
    (currentLineup?.bench || []).map(player => player?.id || "").join(","),
  ].join("#");
  const pitchWrapRef = useRef(null);
  const [fieldLayout, setFieldLayout] = useState("");
  const subLines = usePitchSubLines(pitchWrapRef, { shownPairs, lineupKey, quarter, swapSel, fieldLayout });
  const [headerOffset, setHeaderOffset] = useState(120);
  useEffect(() => {
    const el = document.getElementById("ck-app-header");
    if (!el) return undefined;
    const measure = () => setHeaderOffset(el.getBoundingClientRect().height || 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const queueWhosNext = (benchPlayer) => {
    if (!subMode) {
      setQueueNote(`Full ${noun}. Turn on sub mode to queue a half swap.`);
      return;
    }
    const planned = shownPairs.find(pair => pair.inId === benchPlayer.id);
    const longestField = (currentLineup?.starters || [])
      .filter(slot => slot.player && !isGkPosition(slot.pos))
      .map(slot => slot.player)
      .sort((a, b) => (minutesById[b.id] || 0) - (minutesById[a.id] || 0) || String(a.name || "").localeCompare(String(b.name || "")))[0];
    const leavingId = planned?.outId || longestField?.id;
    if (!leavingId || leavingId === goalkeeperId(currentLineup)) { refuseGoalkeeper(); return; }
    queueSwap(leavingId, benchPlayer.id);
  };
  const bringBenchOn = () => {
    if (!subMode) {
      setQueueNote(`Full ${noun}. Turn on sub mode to bring the bench on.`);
      return;
    }
    if (!currentLineup || shownPairs.length === 0) {
      setQueueNote("Nobody is waiting on the bench.");
      return;
    }
    const live = running || (clockRef.current || 0) > 0;
    const rotated = applyBenchRotation(currentLineup, shownPairs);
    let credit = appearanceCredit || {};
    let segments = subSegments || {};
    shownPairs.forEach(pair => {
      if (live) bankLeave(pair.outId);
      credit = setAppearanceCreditFor(credit, pair.outId, quarter, true);
      credit = setAppearanceCreditFor(credit, pair.inId, quarter, false);
      segments = markQuarterSub(segments, quarter, pair.outId, pair.inId);
    });
    setAppearanceCredit(credit);
    setSubSegments(segments);
    setRealPeriodEvents(prev => noteRealPeriodEvent(prev, quarter, shownPairs.flatMap(pair => [pair.outId, pair.inId])));
    if (live) shownPairs.forEach(pair => beginStint(pair.inId));
    const nextAll = { ...lineupsByQuarter, [quarter]: rotated };
    setLineupsByQuarter(nextAll);
    const involved = new Set(shownPairs.flatMap(pair => [pair.inId, pair.outId]));
    setSubQueue(prev => (prev || []).filter(row => row.quarter !== quarter || (!involved.has(row.inId) && !involved.has(row.outId))));
    setSwapSel(null);
    warnIfShort(nextAll, players, credit, segments);
    const named = shownPairs.map(pair => `${playerName(pair.inId)} on for ${playerName(pair.outId)}`).join(", ");
    setQueueNote(`Bench is on: ${named}. Minutes already played stay. Other ${noun} stay.`);
  };
  const cellKind = (playerId, q, status) => {
    if (status === "unplanned") return "unplanned";
    if (status === "blank") return "blank";
    return playCellKind({ onField: status === "on", segment: segmentAt(subSegments, playerId, q) });
  };
  const quarterStory = (playerId) => {
    const bits = periodList.map(q => {
      const lineup = lineupsByQuarter[q];
      if (!lineup) return null;
      const on = lineup.starters.some(slot => slot.player?.id === playerId);
      const kind = playCellKind({ onField: on, segment: segmentAt(subSegments, playerId, q) });
      if (kind === "full") return `${abbr}${q} full ${nounOne}`;
      if (kind === "partial-on") return `${abbr}${q} came on mid-${nounOne}`;
      if (kind === "partial-off") return `${abbr}${q} played, then off`;
      return null;
    }).filter(Boolean);
    if (!bits.length) return `Still on the bench. A box turns green once they are on the field. The count is still ${noun}, not minutes.`;
    return `${bits.join(". ")}. A full ${nounOne} counts as 1. A split counts as half. Minimum is ${minQ} of ${totalQuarters}.`;
  };

  const formationTemplates = shapesFor(format, !!setup?.gk, planSlotsNow);
  const formationOverrides = normalizeFormationOverrides(normalizeGameDay(gameDay).formationOverrides);
  const activeStrategy = formationTemplates.find(t => t.name === activeFormation) || formationTemplates[0] || null;
  const periodShapeName = formationNameForPeriod(activeStrategy?.name || activeFormation, formationOverrides, quarter, totalQuarters);
  const writeOverrides = (next) => {
    setGameDay(prev => ({ ...normalizeGameDay(prev), formationOverrides: next }));
  };
  const applyFormation = (name) => {
    const tmpl = formationTemplates.find(t => t.name === name) || formationTemplates[0];
    if (!tmpl) return;
    const hasSheet = periodList.some(q => lineupsByQuarter[q]);
    if (shapeOnly && hasSheet) {
      const nextOverrides = withPeriodOverride(formationOverrides, quarter, tmpl.name, activeStrategy?.name || activeFormation, totalQuarters);
      writeOverrides(nextOverrides);
      if (lineupsByQuarter[quarter]) {
        setLineupsByQuarter(prev => ({ ...prev, [quarter]: reshapeLineup(prev[quarter], tmpl.slots) }));
      }
      setSwapSel(null);
      setFairWarn(null);
      return;
    }
    setActiveFormation(tmpl.name);
    const oldBase = activeStrategy?.name || activeFormation;
    const named = oldBase && oldBase !== tmpl.name
      ? preservePlayedBase(formationOverrides, quarter, oldBase, totalQuarters)
      : formationOverrides;
    const cleaned = withoutPeriodOverride(named, quarter);
    Object.keys(cleaned).forEach(key => {
      if (Number(key) < quarter) return;
      if (cleaned[key] === tmpl.name) delete cleaned[key];
    });
    writeOverrides(cleaned);
    if (hasSheet) {
      setLineupsByQuarter(reapplyBase(lineupsByQuarter, {
        periods: totalQuarters,
        fromPeriod: quarter,
        baseSlots: tmpl.slots,
        overrides: cleaned,
      }));
    }
    setSwapSel(null);
    setFairWarn(null);
  };
  const resetPeriodShape = () => {
    const base = formationTemplates.find(t => t.name === (activeStrategy?.name || activeFormation)) || formationTemplates[0];
    if (!base) return;
    writeOverrides(withoutPeriodOverride(formationOverrides, quarter));
    if (lineupsByQuarter[quarter]) {
      setLineupsByQuarter(prev => ({ ...prev, [quarter]: reshapeLineup(prev[quarter], base.slots) }));
    }
  };
  const modeNoted = useRef(false);
  useEffect(() => {
    if (!modeNoted.current) {
      modeNoted.current = true;
      return;
    }
    setSwapSel(null);
    if (!subMode) {
      setPlanSub(false);
      setQueueNote(`Full ${noun}. Half swaps are off. Planning uses whole ${noun}.`);
    } else {
      setQueueNote("Sub mode. Half swaps are on. Planning spreads sit time across halves.");
    }
  }, [subMode]);
  const saveStrategyToGameDay = () => {
    if (!setGames) return;
    const today = new Date().toISOString().slice(0, 10);
    const sheetInput = {
      players,
      lineups: lineupsByQuarter,
      pairPlan,
      subMode,
      segments: subSegments,
      credit: appearanceCredit,
      minQ,
    };
    const entry = gameLogFromStrategy({
      id: uid(),
      date: today,
      opponent,
      homeScore,
      oppScore: awayScore,
      formation: activeStrategy?.name || activeFormation,
      formationLabel: activeStrategy?.label || "",
      formationOverrides,
      subMode,
      format,
      league,
      periods: totalQuarters,
      periodType: setup?.periodType || "quarters",
      lineups: lineupsByQuarter,
      savedAt: new Date().toISOString(),
      sheets: {
        field: shareFieldSheet({ ...sheetInput, quarters: periodList, periodAbbrev: abbr }),
        playTime: sharePlayTimeSheet({ ...sheetInput, quarters: periodList, periodAbbrev: abbr }),
      },
    });
    setGames(prev => upsertGameLog(prev, entry));
    setSaveNote(`Saved ${entry.strategy.formation || "this strategy"} with the field sheet and the play-time sheet to the Season game log.`);
  };

  // Build rotation grid: rows = players, cols = Q1Q4
  const allTrackedPlayers = [...active, ...midGameInjured];
  const rotationGrid = allTrackedPlayers.map(p => ({
    player: p,
    quarters: periodList.map(q => {
      const lineup = lineupsByQuarter[q];
      if (!lineup) return "unplanned";
      const presence = playerQuarterPresence(lineup, p.id);
      if (presence === "on") return "on";
      if (presence === "blank") return "blank";
      return "bench";
    }),
    totalPlanned: periodList.filter(q => {
      const l = lineupsByQuarter[q];
      return l && l.starters.some(s => s.player?.id === p.id);
    }).length,
  }));

  return (
    <div>
      <div style={{
        position:"sticky", top: headerOffset, zIndex: 40,
        margin: "0 0 12px", padding: "8px 0 10px",
        background: C.bg,
      }}>
        {players.some(p => p.out || p.injured) && (
          <div style={{
            marginBottom:10, padding:"8px 10px", borderRadius:10, maxWidth:"100%", boxSizing:"border-box",
            background:"rgba(120,0,0,0.2)", border:"1px solid rgba(231,76,60,0.4)",
          }}>
            <div style={{fontSize:11, color:"#e74c3c", fontWeight:800, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em"}}>
              Return to the game
            </div>
            {players.filter(p => p.out || p.injured).map(p => (
              <div key={p.id} style={{display:"flex", alignItems:"center", gap:8, marginBottom:6, minWidth:0, flexWrap:"wrap"}}>
                <div style={{flex:"1 1 140px", minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                    #{p.number} {p.name}
                  </div>
                  <div style={{fontSize:11, color:p.out ? "#e67e22" : "#e74c3c"}}>
                    {p.out ? "Out" : `Injured ${abbr}${p.injuredInQuarter || quarter}`}
                  </div>
                </div>
                <button type="button" onClick={() => restorePlayer(p.id, "top")} style={{
                  minWidth:44, minHeight:44, padding:"0 14px", flexShrink:0,
                  borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:800,
                  border:"1px solid rgba(39,174,96,0.45)", background:"rgba(39,174,96,0.15)", color:"#2ecc71",
                }}>Return</button>
              </div>
            ))}
          </div>
        )}
        <div style={{fontSize:10, color:C.muted, fontWeight:800, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:6}}>{nounOne}</div>
        <div style={{display:"flex", border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", background:"rgba(255,255,255,0.02)"}}>
          {periodList.map(q => {
            const hasLineup = !!lineupsByQuarter[q];
            const hasInjury = midGameInjured.some(p => p.injuredInQuarter === q);
            const selected = quarter === q;
            return (
              <button key={q} onClick={() => setQuarter(q)} style={{
                flex:1, minHeight:48, border:"none", cursor:"pointer",
                borderRight: q < totalQuarters ? `1px solid ${C.border}` : "none",
                fontWeight:800, fontSize:16, fontFamily:"inherit",
                background: selected ? "rgba(232,160,32,0.16)" : "transparent",
                color: selected ? C.gold : C.text,
                boxShadow: selected ? "inset 0 -3px 0 #e8a020" : "none",
              }}>
                {abbr}{q}
                {hasLineup && (
                  <span style={{display:"block", fontSize:9, lineHeight:1.1, marginTop:2, color:hasInjury?"#e74c3c":formationOverrides[q]?C.gold:C.muted, fontWeight:700}}>
                    {hasInjury ? "inj" : formationOverrides[q] ? "shape" : "set"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {formationTemplates.length > 0 && (
          <>
          <div style={{display:"flex", gap:6, overflowX:"auto", marginTop:8, paddingBottom:2}}>
            {formationTemplates.map(t => {
              const selected = t.name === periodShapeName;
              return (
                <button key={t.name} onClick={() => applyFormation(t.name)} style={{
                  flex:"0 0 auto", minHeight:40, padding:"0 12px", borderRadius:10, cursor:"pointer",
                  fontFamily:"inherit", fontSize:13, fontWeight:800,
                  border: selected ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
                  background: selected ? "rgba(232,160,32,0.18)" : "rgba(255,255,255,0.03)",
                  color: selected ? C.gold : C.muted,
                }}>{t.name}</button>
              );
            })}
          </div>
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginTop:6}}>
            <label style={{display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.muted}}>
              <input type="checkbox" checked={shapeOnly} onChange={e => setShapeOnly(e.target.checked)} />
              Only {abbr}{quarter}
            </label>
            <span style={{fontSize:11, color:C.muted}}>Base {activeStrategy?.name || "shape"}</span>
            {formationOverrides[quarter] && (
              <>
                <span style={{fontSize:11, color:C.gold, fontWeight:800}}>{abbr}{quarter} override</span>
                <button type="button" onClick={resetPeriodShape} style={{
                  minHeight:28, padding:"2px 8px", borderRadius:6, cursor:"pointer", fontFamily:"inherit",
                  border:`1px solid ${C.border}`, background:"transparent", color:C.text, fontSize:11, fontWeight:700,
                }}>Reset to base</button>
              </>
            )}
          </div>
          </>
        )}
      </div>
      {/* Injury alerts */}
      {injuryAlerts.map(alert => (
        <InjuryAlert key={alert.id} player={alert.player} quarter={alert.quarter}
          periodAbbrev={abbr} periodNoun={noun}
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
            {homeScore>awayScore?"Winning":homeScore<awayScore?"Trailing":"Tied"}
            {homeScore-awayScore>5 && <span style={{color:"#e67e22",marginLeft:8}}>- Blowout Rule -</span>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{setHomeScore(0);setAwayScore(0);}} style={{
              padding:"4px 10px",borderRadius:6,border:`1px solid ${C.border}`,
              background:"transparent",color:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            }}>Reset Score</button>
          </div>
        </div>
      </div>

      {/* Success flash — only when the plan actually meets the quarter minimum */}
      {planNote && !justRegenned && (
        <div style={{
          background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`,
          borderRadius:9, padding:"10px 14px", marginBottom:14,
          fontSize:12, color:C.muted, fontWeight:600,
        }}>
          {planNote}
        </div>
      )}

      {justRegenned && violations.length === 0 && (
        <div style={{
          background:"rgba(39,174,96,0.12)", border:"1px solid rgba(39,174,96,0.35)",
          borderRadius:9, padding:"10px 14px", marginBottom:14,
          fontSize:12, color:"#2ecc71", fontWeight:600,
        }}>
          All {totalQuarters} {noun} planned. Every eligible player has at least {minQ} of {totalQuarters} {noun} on the field.
        </div>
      )}

      {!gate.ok && (
        <div style={{
          background:"rgba(192,57,43,0.12)", border:"1px solid rgba(192,57,43,0.45)",
          borderRadius:9, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#f5b7b1", lineHeight:1.5,
        }}>
          <b>Can’t plan yet.</b> {gate.reason} {subMode ? `Sub mode counts halves. The minimum is ${minHalves} of ${totalQuarters * 2}.` : `${noun} on the field are the unit — not clock minutes.`}
        </div>
      )}

      {/* Play-time violation warning */}
      {violations.length > 0 && (
        <div style={{
          background:"rgba(211,84,0,0.1)", border:"1px solid rgba(211,84,0,0.35)",
          borderRadius:9, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.gold,
        }}>
          <b>{violations.length} player{violations.length>1?"s":""}</b> still below {subMode ? `${minHalves} halves (${minQ} of ${totalQuarters} ${noun})` : `${minQ} of ${totalQuarters} ${noun}`} on the field:&nbsp;
          {violations.map(p=>p.name.split(" ")[0]).join(", ")}.
        </div>
      )}

      {fairWarn && (
        <div style={{
          background:"rgba(211,84,0,0.1)", border:"1px solid rgba(211,84,0,0.35)",
          borderRadius:9, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.gold, lineHeight:1.45,
        }}>
          <b>Fair-play warning.</b> {fairWarn} The change was kept.
        </div>
      )}

      <style>{`
        @media (max-width: 820px) {
          .ck-field { order: -1; width: 100%; }
          .ck-roster { order: 1; width: 100%; max-width: none !important; overflow-x: clip; }
        }
        @keyframes ckHalfFlash {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
      <div className="ck-gameday-row" style={{display:"flex",gap:18,flexWrap:"wrap"}}>

        {/* -- LEFT PANEL (Play Time, Strategy, etc.) -- */}
        <div className="ck-roster" style={{flex:"1 1 320px",minWidth:0,maxWidth:400}}>

          <Card style={{marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Plan · {abbr}{quarter}</div>
            <Btn primary full disabled={!gate.ok} onClick={() => planWholeGame(1)} style={{marginBottom:8}}>
              Plan full game
            </Btn>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.45,marginBottom:allPlanned?10:0}}>
              {subMode
                ? `Sub mode fills ${abbr}1–${abbr}${totalQuarters} in halves. Target is ${minHalves} of ${totalQuarters * 2}. Sit time is spread so two halves off in a row is avoided when the bench can come straight back on.`
                : `Full ${noun}. Target is ${minQ} of ${totalQuarters}. Half swaps stay off.`}
            </div>
            {allPlanned && (
              <Btn secondary full disabled={!gate.ok} onClick={() => planWholeGame(quarter, { liveReplan: true })}>
                Replan {abbr}{quarter}–{abbr}{totalQuarters}{quarter>1?` · keep ${abbr}1–${abbr}${quarter-1}`:""}
              </Btn>
            )}
          </Card>

          {/* Play-time tracker + roster manager */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Play Time</div>
              {allPlanned
                ? <div style={{fontSize:9,fontWeight:700,color:violations.length===0?C.ok:C.gold,background:violations.length===0?"rgba(39,174,96,0.15)":"rgba(211,84,0,0.15)",padding:"2px 7px",borderRadius:4}}>
                    {violations.length===0?`${noun.toUpperCase()} MET`:"SHORT"}
                  </div>
                : <div style={{fontSize:9,color:C.muted}}>not fully planned</div>
              }
            </div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.45,marginBottom:8}}>
              Solid green is one {nounOne}. A split box is half a {nounOne}. Gray is the bench. Minimum is {minQ} of {totalQuarters} {noun}, which is {minHalves} halves.
            </div>
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              {[
                ["Full", "#2ecc71", "#0a0d0f"],
                ["Partial", "linear-gradient(90deg, rgba(255,255,255,0.16) 0 46%, #2ecc71 46% 100%)", "#fff"],
                ["Bench", "rgba(255,255,255,0.12)", C.muted],
              ].map(([label, background, color]) => (
                <span key={label} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,color:C.muted,fontWeight:700}}>
                  <span style={{width:22,height:12,borderRadius:3,background,color,display:"inline-block"}}/>
                  {label}
                </span>
              ))}
            </div>

            {/* Sort + add roster controls */}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {[["name","A-Z"],["rating","Rating"],["position","Pos"]].map(([k,label], idx)=>(
                  <button key={k} onClick={()=>setRosterSort(k)} style={{
                    minHeight:36, padding:"0 10px", border:"none", cursor:"pointer",
                    borderRight: idx<2 ? `1px solid ${C.border}` : "none",
                    fontSize:11, fontWeight:700, fontFamily:"inherit",
                    background: rosterSort===k ? "rgba(232,160,32,0.16)" : "transparent",
                    color: rosterSort===k ? C.gold : C.muted,
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={()=>setShowAddPlayer(s=>!s)} style={{
                marginLeft:"auto", minHeight:36, padding:"0 10px", borderRadius:8,
                border:"1px solid rgba(255,255,255,0.22)", cursor:"pointer",
                fontSize:11, fontWeight:700, fontFamily:"inherit",
                background: showAddPlayer ? "rgba(255,255,255,0.08)" : "transparent",
                color: C.text,
              }}>{showAddPlayer ? "Close" : "Add player"}</button>
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
                  style={{...IS,fontSize:16,padding:"8px 10px",flex:"1 1 auto",minWidth:0}}/>
                <input value={newNum} onChange={e=>setNewNum(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAddPlayer()}
                  placeholder="#"
                  style={{...IS,fontSize:16,padding:"8px 8px",width:64,flex:"0 0 64px"}}/>
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
                const plannedHalves = halvesFor(p.id);
                const target  = minQ;
                const pct     = minHalves > 0 ? Math.min(1, plannedHalves / minHalves) : 1;
                const ok      = plannedHalves >= minHalves || target === 0 || isMGI || isInactive;
                const isEditing = editingPlayerId === p.id;
                const tinyBtn = {
                  minHeight:32, padding:"4px 8px", fontSize:10, fontWeight:700, fontFamily:"inherit",
                  borderRadius:6, cursor:"pointer",
                  border:`1px solid ${C.border}`, background:"rgba(255,255,255,0.04)",
                  color:C.muted,
                };
                const onNowKind = cellKind(p.id, quarter, (rotationGrid.find(r=>r.player.id===p.id)?.quarters[quarter-1]) || "unplanned");
                const onNow = onNowKind === "full" || onNowKind === "partial-on";
                const focused = chartFocusId === p.id;
                const nameColor = isMGI ? "#e74c3c"
                                : isInjured ? "#e74c3c"
                                : isOut ? "#e67e22"
                                : ok ? C.text : C.gold;
                return (
                  <div key={p.id} data-player-card style={{
                    marginBottom:8,
                    maxWidth:"100%",
                    minWidth:0,
                    opacity:isMGI?0.55:isInactive?0.7:1,
                    padding: focused ? "6px 6px 4px" : 0,
                    borderRadius:8,
                    background: focused ? "rgba(46,204,113,0.06)" : "transparent",
                    border: focused ? "1px solid rgba(46,204,113,0.28)" : "1px solid transparent",
                  }}>
                    {/* Name + status row */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:4,gap:6,flexWrap:"wrap",minWidth:0}}>
                      <button onClick={()=>setChartFocusId(focused?null:p.id)} style={{
                        background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"inherit",
                        color:nameColor, fontSize:12, fontWeight:700, textAlign:"left",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:"1 1 120px", minWidth:0,
                      }}>
                        {p.name} <span style={{color:C.muted,fontWeight:600}}>#{p.number}</span>
                      </button>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        {isInjured ? (
                          <span style={{fontSize:9,fontWeight:800,color:"#e74c3c",background:"rgba(231,76,60,0.15)",padding:"2px 6px",borderRadius:3}}>INJ</span>
                        ) : isOut ? (
                          <span style={{fontSize:9,fontWeight:800,color:"#e67e22",background:"rgba(230,126,34,0.15)",padding:"2px 6px",borderRadius:3}}>OUT</span>
                        ) : (
                          <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                            {onNow && <span style={{fontSize:9,fontWeight:800,color:"#0a0d0f",background:"#2ecc71",borderRadius:3,padding:"2px 5px"}}>IN</span>}
                            <span style={{fontSize:10,color:ok?"#2ecc71":C.gold,fontWeight:700}}>
                              {allPlanned ? `${formatQuarterEquity(plannedHalves)}/${target}${abbr}` : ""}
                            </span>
                          </span>
                        )}
                        {(isInjured || isOut) && (
                          <button type="button" onClick={() => restorePlayer(p.id, "roster")} style={{
                            minWidth:44, minHeight:44, padding:"0 12px", flexShrink:0,
                            borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:800,
                            border:"1px solid rgba(39,174,96,0.45)", background:"rgba(39,174,96,0.15)", color:"#2ecc71",
                          }}>Return</button>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{display:"flex",gap:4,marginBottom:isEditing?6:4}}>
                      <button onClick={()=>setEditingPlayerId(isEditing?null:p.id)} style={{...tinyBtn,
                        color:isEditing?"#0a0d0f":C.text,
                        background:isEditing?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.04)",
                        borderColor:"rgba(255,255,255,0.22)"}}>{isEditing?"Done":"Edit"}</button>
                      <button onClick={()=>{
                        if (p.injured) restorePlayer(p.id);
                        else if (Object.keys(lineupsByQuarter).length > 0) markUnavailable(p.id, "injury");
                        else setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,injured:true,out:false}:x));
                      }}
                        style={{...tinyBtn, minHeight:44, minWidth:44,
                          color:isInjured?"#fff":"#e74c3c",
                          background:isInjured?"rgba(231,76,60,0.85)":"rgba(231,76,60,0.08)",
                          borderColor:"rgba(231,76,60,0.4)"}}>Inj</button>
                      <button onClick={()=>{
                        if (p.out) restorePlayer(p.id);
                        else if (Object.keys(lineupsByQuarter).length > 0) markUnavailable(p.id, "out");
                        else setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,out:true,injured:false}:x));
                      }}
                        style={{...tinyBtn, minHeight:44, minWidth:44,
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

                    {!isEditing && (
                      <>
                        <div style={{display:"flex",gap:4,marginBottom:4}}>
                          {periodList.map(q => {
                            const entry = rotationGrid.find(r=>r.player.id===p.id);
                            const status = entry ? entry.quarters[q-1] : "unplanned";
                            const kind = cellKind(p.id, q, status);
                            const qLineup = lineupsByQuarter[q];
                            const slot = qLineup?.starters?.find(s=>s.player?.id===p.id);
                            const pos = slot ? (POS_LABEL[slot.pos] || slot.pos) : "";
                            const label = kind==="full" || kind==="partial-on" ? pos : kind==="partial-off" ? "½" : kind==="unplanned" ? "?" : "";
                            const title = kind==="full" ? `${abbr}${q} full ${nounOne}${pos?` · ${pos}`:""}`
                              : kind==="partial-on" ? `${abbr}${q} partial · came on${pos?` · ${pos}`:""}`
                              : kind==="partial-off" ? `${abbr}${q} partial · played, then off`
                              : kind==="bench" ? `${abbr}${q} bench`
                              : kind==="blank" ? `${abbr}${q} unavailable` : `${abbr}${q} not planned`;
                            const background = kind==="full" ? "#2ecc71"
                              : kind==="partial-on" ? "linear-gradient(90deg, rgba(255,255,255,0.16) 0 46%, #2ecc71 46% 100%)"
                              : kind==="partial-off" ? "linear-gradient(90deg, #2ecc71 0 46%, rgba(255,255,255,0.12) 46% 100%)"
                              : kind==="bench" ? "rgba(255,255,255,0.12)"
                              : kind==="blank" ? "transparent"
                              : "rgba(255,255,255,0.04)";
                            const textColor = kind==="full" ? "#0a0d0f"
                              : kind==="partial-on" || kind==="partial-off" ? "#fff"
                              : "rgba(255,255,255,0.35)";
                            return (
                              <div key={q} onClick={()=>{ setQuarter(q); setChartFocusId(p.id); }}
                                title={title}
                                style={{
                                  flex:1, height:28, borderRadius:4, background,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:8, color:textColor, fontWeight:800, cursor:"pointer",
                                  letterSpacing:"0.02em",
                                  textShadow: kind.startsWith("partial") ? "0 1px 2px rgba(0,0,0,0.55)" : "none",
                                  border: quarter===q ? "1px solid rgba(255,255,255,0.7)" : kind==="blank" ? "1px dashed rgba(255,255,255,0.2)" : "1px solid transparent",
                                }}>
                                {label}
                              </div>
                            );
                          })}
                        </div>
                        {focused && (
                          <div style={{fontSize:11,color:C.muted,lineHeight:1.4,marginBottom:4}}>{quarterStory(p.id)}</div>
                        )}
                        {!isInactive && (
                          <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2}}>
                            <div style={{height:"100%",width:`${pct*100}%`,borderRadius:2,transition:"width 0.4s",
                              background:isMGI?"#e74c3c":ok?"#2ecc71":C.gold}}/>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              });
            })()}
          </Card>

        </div>

        {/* -- FIELD -- */}
        <div className="ck-field" style={{flex:"2 1 320px",minWidth:0,display:"flex",flexDirection:"column"}}>
          {currentLineup && (
            <Card style={{order:2,marginTop:12,border:`1px solid ${C.gold}`,background:"rgba(232,160,32,0.06)"}}>
              <button onClick={() => setSubsOpen(v => !v)} style={{
                width:"100%", minHeight:44, display:"flex", justifyContent:"space-between", alignItems:"center",
                gap:8, marginBottom: subsOpen ? 8 : 0, padding:0, border:"none", background:"transparent",
                color:C.gold, cursor:"pointer", fontFamily:"inherit",
              }}>
                <span style={{fontSize:12,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.06em"}}>Mid-{nounOne} subs</span>
                <span style={{fontSize:12,fontWeight:800,color:C.text}}>{subsOpen ? "Hide" : "Show"}</span>
              </button>
              {!subsOpen && (
                <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>
                  {pendingSwaps.length}/3 queued.
                </div>
              )}
              {subsOpen && (
              <>
              <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <button onClick={() => {
                  if (!subMode) {
                    setQueueNote(`Full ${noun}. Turn on sub mode to queue a half swap.`);
                    return;
                  }
                  setPlanSub(v => !v);
                  setSwapSel(null);
                  setQueueNote(null);
                }} style={{
                  minHeight:36, padding:"8px 12px", borderRadius:8, cursor:"pointer", fontFamily:"inherit",
                  fontSize:12, fontWeight:800,
                  border:`1px solid ${planSub ? C.gold : "rgba(255,255,255,0.22)"}`,
                  background: planSub ? "rgba(232,160,32,0.18)" : "transparent",
                  color: planSub ? C.gold : C.text,
                  opacity: subMode ? 1 : 0.45,
                }}>{planSub ? "Plan sub: on" : "Plan sub"}</button>
              </div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.45,marginBottom:10}}>
                {!subMode
                  ? `Full ${noun}. Half swaps and the queue stay off. Drag still moves a player now.`
                  : planSub
                  ? "Tap who leaves, then who comes on. The queue shows that pair by name. Drag still swaps right away."
                  : "Drag or tap to swap now. Plan sub queues the next 2–3 swaps without moving anyone yet."}
                {" "}Changing the {nounOne} keeps minutes already played.
              </div>
              {shownPairs.length > 0 && (
                <div style={{marginBottom:12,padding:"10px",borderRadius:10,background:"rgba(0,0,0,0.2)",border:"1px solid rgba(46,204,113,0.28)"}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:4}}>Subs go in for who?</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.4,marginBottom:8}}>
                    {shownPairs.every(pair => pair.fromPlan)
                      ? `Everyone on the bench comes on, matching ${abbr}${Math.min(quarter + 1, totalQuarters)}.`
                      : "Dotted lines on the field show the same pairs. Tap a bench player, then a field player, to move a line."}
                  </div>
                  {shownPairs.map(pair => (
                    <div key={`${pair.inId}-${pair.outId}`} style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:6,flexWrap:"wrap",fontSize:13}}>
                      <span style={{fontWeight:800,color:"#2ecc71"}}>{playerName(pair.inId)}</span>
                      <span style={{fontSize:10,fontWeight:800,color:"#2ecc71",letterSpacing:"0.04em"}}>ON</span>
                      <span style={{color:C.muted}}>→</span>
                      <span style={{fontWeight:800}}>{playerName(pair.outId)}</span>
                      <span style={{fontSize:10,fontWeight:800,color:C.muted,letterSpacing:"0.04em"}}>OFF</span>
                      {pair.fromPlan && <span style={{fontSize:10,color:C.muted}}>next {nounOne}</span>}
                    </div>
                  ))}
                  <Btn secondary full onClick={bringBenchOn} style={{marginTop:4,borderColor:"rgba(46,204,113,0.45)"}}>
                    Bring the bench on
                  </Btn>
                  <div style={{fontSize:10,color:C.muted,lineHeight:1.4,marginTop:6}}>
                    This {nounOne} only. Minutes already played stay. Other {noun} stay.
                  </div>
                </div>
              )}
              <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Who’s next</div>
              {whosNext.length === 0 && <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Bench is empty.</div>}
              {whosNext.slice(0, 3).map(p => {
                const partner = shownPairs.find(pair => pair.inId === p.id);
                const offPlayer = partner ? playerName(partner.outId) : longestOnField()?.name;
                return (
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6,fontSize:12,flexWrap:"wrap"}}>
                    <span>
                      <b>{p.name}</b>
                      {offPlayer && (
                        <>
                          <span style={{color:"#2ecc71",fontWeight:800}}> on </span>
                          <span style={{color:C.muted}}>→</span>
                          <span> {offPlayer} </span>
                          <span style={{color:C.muted,fontWeight:700}}>off</span>
                        </>
                      )}
                    </span>
                    <button onClick={() => queueWhosNext(p)} style={{
                      minHeight:32, padding:"4px 8px", borderRadius:6, border:"1px solid rgba(255,255,255,0.22)", cursor:"pointer",
                      background:"transparent", color:C.text, fontSize:11, fontWeight:700, fontFamily:"inherit", flexShrink:0,
                    }}>Queue</button>
                  </div>
                );
              })}
              {!anyMinutes && whosNext.length > 0 && (
                <div style={{fontSize:10,color:C.muted,margin:"2px 0 8px"}}>This order uses {noun} on the field.</div>
              )}
              {anyMinutes && whosNext.length > 0 && (
                <div style={{fontSize:10,color:C.muted,margin:"0 0 8px"}}>
                  {whosNext.slice(0, 3).map(p => `${p.name.split(" ")[0]} ${Math.round(minutesById[p.id] || 0)}m`).join(" · ")}
                </div>
              )}
              <div style={{fontSize:11,color:C.muted,fontWeight:700,margin:"8px 0 6px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Upcoming swaps ({pendingSwaps.length}/3)</div>
              {pendingSwaps.length === 0 && <div style={{fontSize:12,color:C.muted}}>None queued. Plan sub, or bring the bench on.</div>}
              {pendingSwaps.map(row => (
                <div key={row.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap",padding:"8px",borderRadius:8,background:"rgba(0,0,0,0.18)"}}>
                  <div style={{fontSize:13,color:C.text,lineHeight:1.35}}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:2}}>{abbr}{row.quarter}</div>
                    <span style={{fontWeight:800,color:"#2ecc71"}}>{playerName(row.inId)}</span>
                    <span style={{fontSize:10,fontWeight:800,color:"#2ecc71"}}> ON </span>
                    <span style={{color:C.muted}}>→</span>
                    <span style={{fontWeight:800}}> {playerName(row.outId)}</span>
                    <span style={{fontSize:10,fontWeight:800,color:C.muted}}> OFF</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={() => executeSwap(row)} style={{
                      minHeight:36, padding:"6px 10px", borderRadius:6, border:"none", cursor:"pointer",
                      background:"#1e7a45", color:"#fff", fontSize:12, fontWeight:800, fontFamily:"inherit",
                    }}>Run now</button>
                    <button onClick={() => setSubQueue(prev => cancelOneSwap(prev, row.id))} style={{
                      minHeight:36, padding:"6px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.22)", cursor:"pointer",
                      background:"transparent", color:C.text, fontSize:12, fontWeight:700, fontFamily:"inherit",
                    }}>Cancel</button>
                  </div>
                </div>
              ))}
              {queueNote && <div style={{fontSize:11,color:C.gold,marginTop:6,lineHeight:1.4}}>{queueNote}</div>}
              {players.some(p => p.out) && (
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:6}}>Late arrival</div>
                  {players.filter(p => p.out).map(p => (
                    <button key={p.id} onClick={() => restorePlayer(p.id, "top")} style={{
                      marginRight:6, marginBottom:6, minHeight:44, minWidth:44, padding:"8px 12px", borderRadius:8, cursor:"pointer",
                      border:`1px solid ${C.border}`, background:"rgba(255,255,255,0.04)", color:C.text,
                      fontSize:13, fontWeight:700, fontFamily:"inherit",
                    }}>#{p.number} {p.name} arrived</button>
                  ))}
                </div>
              )}
              </>
              )}
            </Card>
          )}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11,color:C.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}>
              {abbr}{quarter} field
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={saveStrategyToGameDay} style={{
                minHeight:36, padding:"6px 12px", borderRadius:8, cursor:"pointer",
                fontFamily:"inherit", fontWeight:800, fontSize:11,
                border:`1px solid ${C.gold}`, background:"transparent", color:C.gold,
              }}>Save game day</button>
              <button onClick={()=>setShowShare(true)} style={{
                minHeight:36, padding:"6px 12px", borderRadius:8,
                border:"1px solid rgba(255,255,255,0.22)",
                background:"transparent",
                color:C.text, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                flexShrink:0,
              }}>Share lineup</button>
            </div>
          </div>
          {saveNote && <div style={{fontSize:11, color:C.gold, lineHeight:1.4, marginTop:-4, marginBottom:8}}>{saveNote}</div>}
          {!allPlanned && !currentLineup && (
            <div style={{
              background:C.surface, borderRadius:12, minHeight:200,
              border:`2px dashed ${C.border}`, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:12, padding:24,
            }}>
              <div style={{fontSize:13,color:C.muted,textAlign:"center",lineHeight:1.6}}>
                Hit <b style={{color:C.gold}}>Plan Full Game</b> to schedule all {totalQuarters} {noun}.<br/>
                {subMode
                  ? `Sub mode targets ${minHalves} of ${totalQuarters * 2} halves and spreads sit time.`
                  : `Full periods target ${minQ} of ${totalQuarters} on the field.`}
              </div>
              <Btn primary disabled={!gate.ok} onClick={() => planWholeGame(1)}>Plan full game</Btn>
            </div>
          )}
          <div style={{position:"relative",userSelect:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,padding:"0 2px"}}>
              <button onClick={()=>setQuarter(q=>Math.max(1,q-1))} disabled={quarter===1} style={{
                background:"none",border:"none",cursor:quarter===1?"default":"pointer",
                color:quarter===1?"rgba(255,255,255,0.1)":C.gold,fontSize:22,padding:"0 6px",lineHeight:1,
              }}>‹</button>
              <div style={{fontSize:11,color:C.muted,fontWeight:600}}>
                {abbr}{quarter} Field View <span style={{opacity:0.4}}> tap arrows</span>
              </div>
              <button onClick={()=>setQuarter(q=>clampPeriod(q, q+1, totalQuarters))} disabled={quarter>=totalQuarters} style={{
                background:"none",border:"none",cursor:quarter>=totalQuarters?"default":"pointer",
                color:quarter>=totalQuarters?"rgba(255,255,255,0.1)":C.gold,fontSize:22,padding:"0 6px",lineHeight:1,
              }}>›</button>
            </div>
            {currentLineup && (
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                <Btn sm secondary onClick={scramblePositions}>Scramble positions</Btn>
                <Btn sm secondary onClick={scrambleMembership}>Redraw who plays {abbr}{quarter}</Btn>
              </div>
            )}
            {swapSel && (
              <div style={{fontSize:12,color:C.text,textAlign:"center",marginBottom:6,lineHeight:1.4}}>
                {planSub && swapSel.type==="field"
                  ? `${playerName(swapSel.playerId)} off. Tap who comes on for ${playerName(swapSel.playerId)}.`
                  : swapSel.type==="field"
                    ? `${playerName(currentLineup?.starters?.[swapSel.idx]?.player?.id)} selected. Tap who they swap with.`
                    : `${playerName(swapSel.playerId)} on. Tap the field player they replace.`}
              </div>
            )}
            {scrambleNote && (
              <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:6,lineHeight:1.4}}>{scrambleNote}</div>
            )}
            <div ref={pitchWrapRef} style={{position:"relative", zIndex:1, display:"flex", gap:6, alignItems:"stretch"}}>
              {currentLineup && (
                <div
                  data-drop="bench-zone"
                  style={{
                    width:76, flexShrink:0, display:"flex", flexDirection:"column",
                    justifyContent:(currentLineup.bench||[]).length ? "space-evenly" : "center",
                    gap:6, padding:"8px 4px", borderRadius:10, position:"relative", zIndex:5,
                    border: drag.hover==="bench-zone" ? "2px solid #2ecc71" : "1px dashed rgba(255,255,255,0.22)",
                    background: drag.hover==="bench-zone" ? "rgba(46,204,113,0.14)" : "rgba(10,13,15,0.55)",
                    boxShadow: drag.hover==="bench-zone" ? "0 0 0 4px rgba(46,204,113,0.28)" : "none",
                  }}
                >
                  <button
                    onClick={() => {
                      if (!subMode) {
                        setQueueNote(`Full ${noun}. Turn on sub mode to run the listed swaps.`);
                        return;
                      }
                      if (shownPairs.length > 0) {
                        bringBenchOn();
                        setPlanSub(false);
                        return;
                      }
                      setPlanSub(v => !v);
                      setSwapSel(null);
                      setQueueNote(planSub ? null : "No pairs yet. Tap a bench player, then the field player they replace.");
                    }}
                    aria-pressed={subMode}
                    style={{
                      minHeight:56, borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                      fontSize:16, fontWeight:900, letterSpacing:"0.08em", lineHeight:1,
                      border: subMode ? "2px solid #2ecc71" : "2px solid rgba(232,160,32,0.9)",
                      background: subMode ? `linear-gradient(180deg,#f2c14b,${C.goldDark})` : "rgba(20,16,8,0.92)",
                      color: subMode ? "#0a0d0f" : C.gold,
                      boxShadow: subMode
                        ? (shownPairs.length ? "0 0 0 3px rgba(46,204,113,0.55), 0 6px 16px rgba(232,160,32,0.45)" : "0 0 0 3px rgba(232,160,32,0.35)")
                        : "none",
                    }}
                  >
                    <div>SUB</div>
                    <div style={{fontSize:8, fontWeight:800, letterSpacing:"0.06em", marginTop:3}}>
                      {!subMode ? `FULL ${abbr}` : shownPairs.length ? "RUN" : planSub ? "ON" : "READY"}
                    </div>
                  </button>
                  <div style={{fontSize:9, color:C.muted, fontWeight:800, textAlign:"center", letterSpacing:"0.06em"}}>BENCH</div>
                  {(currentLineup.bench||[]).length === 0 && (
                    <div style={{fontSize:10, color:C.muted, textAlign:"center", lineHeight:1.3}}>All on</div>
                  )}
                  {(currentLineup.bench||[]).map(p => {
                    const selected = swapSel?.type==="bench" && swapSel.playerId===p.id;
                    const hovered = drag.hover===`bench:${p.id}`;
                    const sourced = drag.activeSource?.type==="bench" && drag.activeSource.playerId===p.id;
                    const partner = shownPairs.find(pair => pair.inId === p.id);
                    return (
                      <div key={p.id}
                        data-drop={`bench:${p.id}`}
                        onPointerDown={e => drag.pointerDown(e, { type:"bench", playerId:p.id }, `#${p.number}`)}
                        onPointerMove={drag.pointerMove}
                        onPointerUp={e => { if (drag.pointerUp(e) === "tap") onBenchTap(p.id); }}
                        onPointerCancel={e => { drag.pointerUp(e); }}
                        style={{
                          minHeight:48, borderRadius:8, padding:"6px 4px",
                          border: hovered || sourced ? "2px solid #2ecc71" : selected ? "2px solid #2ecc71" : `1px solid ${C.border}`,
                          boxShadow: hovered ? "0 0 0 4px rgba(46,204,113,0.45)" : "none",
                          background: selected ? "rgba(46,204,113,0.16)" : "rgba(0,0,0,0.25)",
                          color:C.text, textAlign:"center", cursor:"grab", touchAction:"none",
                          opacity: sourced ? 0.55 : 1,
                        }}
                      >
                        <div style={{fontSize:13, fontWeight:800, lineHeight:1.1}}>#{p.number}</div>
                        <div style={{display:"flex", alignItems:"center", justifyContent:"flex-end", gap:3, minWidth:0}}>
                          <div style={{flex:"1 1 auto", minWidth:0, fontSize:10, fontWeight:700, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                            {(p.name || "").split(" ")[0]}
                          </div>
                          {partner && (
                            <span
                              data-sub-from={p.id}
                              aria-hidden="true"
                              style={{
                                width:8, height:8, borderRadius:"50%", flexShrink:0,
                                background:"#2ecc71",
                                boxShadow:"0 0 0 2px rgba(46,204,113,0.45)",
                              }}
                            />
                          )}
                        </div>
                        {partner && (
                          <div style={{fontSize:8, color:"#2ecc71", fontWeight:700, marginTop:2, lineHeight:1.2}}>
                            for {(playerName(partner.outId) || "").split(" ")[0]}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{flex:"1 1 auto", minWidth:0, position:"relative"}}>
                <SoccerField
                  lineup={currentLineup}
                  onTap={onFieldTap}
                  selectedIdx={swapSel?.type==="field" ? swapSel.idx : null}
                  quarter={quarter}
                  periodAbbrev={abbr}
                  drag={drag}
                  hoverToken={drag.hover}
                  activeSource={drag.activeSource}
                  onLayout={setFieldLayout}
                />
              </div>
              {subLines.length > 0 && (
                <svg style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:5, overflow:"visible"}}>
                  {subLines.map(line => (
                    <line key={line.key}
                      x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                      stroke="#2ecc71" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round"
                    />
                  ))}
                </svg>
              )}
            </div>
            {currentLineup && (
              <div style={{fontSize:11, color:C.muted, lineHeight:1.4, marginTop:8, textAlign:"center"}}>
                {subMode
                  ? "SUB runs the listed swaps. Tap a bench player, then a field player, to move a line. A green ring means release will swap."
                  : `Full ${noun}. SUB stays off until sub mode is on. Drag still swaps a player.`}
              </div>
            )}
            {queueNote && !subsOpen && (
              <div style={{fontSize:12, color:C.gold, lineHeight:1.4, marginTop:6, textAlign:"center"}}>{queueNote}</div>
            )}
          </div>
          {midGameInjured.length > 0 && (
            <div style={{marginTop:10,padding:"7px 12px",borderRadius:7,
              background:"rgba(120,0,0,0.15)",border:"1px solid rgba(231,76,60,0.2)",
              fontSize:11,color:"rgba(231,76,60,0.75)",textAlign:"center",lineHeight:1.5}}>
              Injured players keep the minutes they already played. Return puts them on this quarter’s bench.
            </div>
          )}
        </div>
      </div>
      {drag.ghost && (
        <div style={{
          position:"fixed", left:drag.ghost.x, top:drag.ghost.y, transform:"translate(-50%,-50%)",
          width:52, height:52, borderRadius:"50%", pointerEvents:"none", zIndex:10000,
          background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
          border:"3px solid #2ecc71",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontWeight:800, fontSize:12, color:"#1a1a1a",
          boxShadow:"0 0 0 6px rgba(46,204,113,0.45), 0 8px 24px rgba(0,0,0,0.45)",
        }}>
          {drag.ghost.label}
          <div style={{position:"absolute", top:"100%", marginTop:6, fontSize:11, fontWeight:800, color:"#2ecc71", whiteSpace:"nowrap", textShadow:"0 1px 2px #000"}}>
            Release to swap
          </div>
        </div>
      )}

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
        {minQ > 0 && <div style={{fontSize:11,color:C.muted,marginTop:3}}>Min: {minQ} of {totalQuarters} {noun} ({minHalves} halves, {Math.round((setup?.minFraction ?? 0.5)*100)}%). A split counts as half.</div>}
      </Card>

      {/* Share Lineup Modal */}
      {showShare && (
        <ShareLineupModal
          players={players}
          lineupsByQuarter={lineupsByQuarter}
          pairPlan={pairPlan}
          subMode={subMode}
          segments={subSegments}
          credit={appearanceCredit}
          minQ={minQ}
          quarters={periodList}
          periodAbbrev={abbr}
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

const sheetSaveBtn = {
  flex: 1,
  minHeight: 44,
  padding: "10px 12px",
  borderRadius: 7,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#e8a020,#b87818)",
  color: "#0a0d0f",
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "inherit",
};

function SheetCanvases({ field, playTime, league, opponent, homeScore, awayScore, periodAbbrev = "Q", periodCount = 4 }) {
  const fieldRef = useRef(null);
  const playRef = useRef(null);
  useEffect(() => {
    if (fieldRef.current) paintFieldSheet(fieldRef.current, { field, league, opponent, homeScore, awayScore });
    if (playRef.current) paintPlayTimeSheet(playRef.current, { playTime, league });
  }, [field, playTime, league, opponent, homeScore, awayScore]);
  return (
    <div>
      <div style={{fontSize:12,fontWeight:800,color:"#e8a020",marginBottom:6}}>Sheet 1 · Field, bench, and sub lines</div>
      <div style={{borderRadius:8,overflow:"hidden",marginBottom:8,border:"1px solid rgba(255,255,255,0.08)",background:"#0c1409"}}>
        <canvas ref={fieldRef} style={{width:"100%",height:"auto",display:"block"}} />
      </div>
      <button type="button" onClick={() => downloadCanvas(fieldRef.current, `CoachKit_Field_${periodAbbrev}1-${periodAbbrev}${periodCount}.png`)} style={{...sheetSaveBtn, width:"100%", marginBottom:16}}>
        Save field image
      </button>
      <div style={{fontSize:12,fontWeight:800,color:"#2ecc71",marginBottom:6}}>Sheet 2 · Play time</div>
      <div style={{borderRadius:8,overflow:"hidden",marginBottom:8,border:"1px solid rgba(255,255,255,0.08)",background:"#0c1409"}}>
        <canvas ref={playRef} style={{width:"100%",height:"auto",display:"block"}} />
      </div>
      <button type="button" onClick={() => downloadCanvas(playRef.current, "CoachKit_PlayTime.png")} style={{...sheetSaveBtn, width:"100%"}}>
        Save play time image
      </button>
    </div>
  );
}

function ShareLineupModal({ players, lineupsByQuarter, pairPlan, subMode, segments, credit, minQ, quarters = [1, 2, 3, 4], periodAbbrev = "Q", homeScore, awayScore, opponent, league, onClose }) {
  const field = useMemo(
    () => shareFieldSheet({ lineups: lineupsByQuarter, pairPlan, subMode, quarters, periodAbbrev }),
    [lineupsByQuarter, pairPlan, subMode, quarters, periodAbbrev],
  );
  const playTime = useMemo(
    () => sharePlayTimeSheet({ players, lineups: lineupsByQuarter, segments, credit, minQ, quarters, periodAbbrev }),
    [players, lineupsByQuarter, segments, credit, minQ, quarters, periodAbbrev],
  );
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.88)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:"#141a12",borderRadius:16,width:"100%",maxWidth:560,
        border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden",maxHeight:"92vh",display:"flex",flexDirection:"column"}}
        onClick={e => e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,0.08)",flexShrink:0,gap:8}}>
          <div style={{fontSize:15,fontWeight:800,color:"#e8a020"}}>Share lineup</div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
            borderRadius:6,cursor:"pointer",color:"#e8e4dc",fontSize:13,fontWeight:700,padding:"4px 12px",fontFamily:"inherit",
          }}>Close</button>
        </div>
        <div style={{padding:"14px 16px",overflow:"auto"}}>
          <div style={{fontSize:11,color:"#7a7570",marginBottom:12,lineHeight:1.5}}>
            Sheet 1 is the field for every period, with the bench and dotted lines to who they sub for. Sheet 2 is the green play-time bars. Save strategy to game day keeps both in the Season log.
          </div>
          <SheetCanvases
            field={field}
            playTime={playTime}
            league={league}
            opponent={opponent}
            homeScore={homeScore}
            awayScore={awayScore}
            periodAbbrev={periodAbbrev}
            periodCount={quarters.length || 4}
          />
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
    <div data-player-card style={{
      background:C.surface, borderRadius:10, padding:"10px 14px", marginBottom:8,
      border:`1px solid ${player.injured||player.out?"rgba(220,80,60,0.3)":C.border}`,
      maxWidth:"100%", minWidth:0, boxSizing:"border-box",
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
              <input value={name} onChange={e=>setName(e.target.value)} style={{...IS, fontSize:16}} onBlur={save} onFocus={e => {
                const card = e.target.closest("[data-player-card]");
                window.setTimeout(() => card?.scrollIntoView({ block: "start", inline: "nearest" }), 300);
              }}/>
            </div>
            <div style={{width:72, flexShrink:0}}>
              <label style={lbl}>#</label>
              <input value={num} onChange={e=>setNum(e.target.value)} style={{...IS, fontSize:16}} onBlur={save}/>
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
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,marginBottom:10,maxWidth:"100%"}}>
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
function TabRules({ setup }) {
  const [viewAge, setViewAge] = useState(setup.age);
  const [view, setView] = useState("quick");
  useEffect(() => { setViewAge(setup.age); }, [setup.age]);
  const rulesView = rulesTabView(setup, viewAge);
  const preview = rulesView.preview;
  const badges = rulesView.badges;
  const say = rulesView.say;
  const division = say ? sayDivision(viewAge) : null;
  const divisionKey = say ? sayDivisionKey(viewAge) : "";
  return (
    <div>
      <div style={{
        display:"flex",alignItems:"center",gap:10,marginBottom:14,
        background:"rgba(232,160,32,0.07)",border:"1px solid rgba(232,160,32,0.2)",
        borderRadius:10,padding:"10px 14px",
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:C.gold,letterSpacing:"0.06em"}}>
            {say ? "SAY EAST CINCINNATI - OFFICIAL RULES" : setup.orgLabel.toUpperCase()}
          </div>
          <div style={{fontSize:11,color:C.muted}}>
            {say
              ? "Source: SAY East Playing Laws Rulebook (Updated Jan 2026) - Silver Matrix age chart"
              : `${viewAge} · ${badges.periods} × ${badges.periodMinutes} min${badges.gk ? " · goalkeeper" : " · no goalkeeper"}`}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {AGES.map(age => (
          <button key={age} type="button" onClick={() => setViewAge(age)} style={{
            padding:"5px 13px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
            background:viewAge===age?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
            color:viewAge===age?"#0a0d0f":C.muted,
          }}>{age}</button>
        ))}
      </div>
      <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.4}}>
        Browsing ages here does not change the Game Day lineup.
      </div>
      <div style={{
        background:`linear-gradient(135deg,rgba(232,160,32,0.12),rgba(184,120,24,0.06))`,
        border:`1px solid rgba(232,160,32,0.25)`,
        borderRadius:12,padding:"14px 18px",marginBottom:16,
      }}>
        {division && (
          <>
            <div style={{fontSize:18,fontWeight:800,color:C.gold,marginBottom:2}}>
              {viewAge}{division.divisionName ? `  ${division.divisionName}` : ""}
            </div>
            {division.ageRange && <div style={{fontSize:11,color:C.muted,marginBottom:10}}>{division.ageRange}</div>}
          </>
        )}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            ["Players", `${badges.playersOnField}v${badges.playersOnField}`],
            ["Goalkeeper", badges.gk ? "Yes" : "No"],
            ...(rulesView.clock ? [] : [["Clock", `${badges.periods} × ${badges.periodMinutes} min`]]),
            ["Ball", badges.ballSize ? `Size ${badges.ballSize}` : "Coach's choice"],
            ...(division ? [
              ["Format", division.format || ""],
              ["Field", division.fieldLength ? `${division.fieldLength} x ${division.fieldWidth}` : ""],
              ["Goals", division.goalSize || ""],
            ] : []),
          ].map(([k,v]) => (
            <div key={k} style={{background:"rgba(0,0,0,0.35)",borderRadius:7,padding:"5px 11px",fontSize:11}}>
              <span style={{color:C.muted}}>{k}: </span><span style={{color:C.text,fontWeight:700}}>{v}</span>
            </div>
          ))}
          {rulesView.clock && (
            <>
              <div style={{background:"rgba(0,0,0,0.35)",borderRadius:7,padding:"5px 11px",fontSize:11}}>
                <span style={{color:C.text,fontWeight:700}}>{rulesView.clock.team}</span>
              </div>
              <div style={{background:"rgba(0,0,0,0.35)",borderRadius:7,padding:"5px 11px",fontSize:11}}>
                <span style={{color:C.text,fontWeight:700}}>{rulesView.clock.standard}</span>
              </div>
            </>
          )}
        </div>
        {division && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
            {[
              ["Heading", division.heading ? "Allowed" : "Banned"],
              ["Offside", division.offside ? "Full rule" : "None"],
              ["Build-Out", division.buildOut ? "Active" : "Not used"],
              ["Slide Tackle", division.slideTackle ? "Allowed" : "Restricted"],
              ["GK Punt", division.gkPunt ? "Allowed (SAY East)" : "Not allowed"],
              ["Cards", division.yellowRedCards ? "Full system" : "No cards"],
            ].map(([k,v]) => (
              <div key={k} style={{background:"rgba(0,0,0,0.25)",borderRadius:6,padding:"4px 9px",fontSize:11}}>
                <span style={{color:C.muted}}>{k}: </span><span style={{color:C.text,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {preview.verified === false && (
          <div style={{fontSize:12,color:C.gold,marginTop:10}}>Unverified default. The note says what the rulebook did not settle.</div>
        )}
        <div style={{fontSize:13,color:C.text,lineHeight:1.5,marginTop:12}}>{preview.note}</div>
        {badges.gk && <div style={{fontSize:12,color:C.muted,lineHeight:1.45,marginTop:8}}>{gkFullPeriodReason(preview.periodType)}</div>}
        {preview.source && (
          String(preview.source).startsWith("http") ? (
            <a href={preview.source} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:12,fontSize:12,color:C.gold}}>
              Source
            </a>
          ) : (
            <div style={{marginTop:12,fontSize:12,color:C.gold}}>{preview.source}</div>
          )
        )}
      </div>
      {division && (
        <>
          <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
            {[["quick","Quick Reference"],["unknown","Easily Missed Rules"],["links","Official Links"]].map(([k,l]) => (
              <button key={k} type="button" onClick={() => setView(k)} style={{
                padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
                background:view===k?`linear-gradient(135deg,${C.gold},${C.goldDark})`:C.surface,
                color:view===k?"#0a0d0f":C.muted,
              }}>{l}</button>
            ))}
          </div>
          {view==="quick" && (
            <div>
              {division.quickRules.map((rule,i) => (
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
              <div style={{
                display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",
                marginBottom:6,borderRadius:9,
                background:"rgba(39,174,96,0.08)",border:"1px solid rgba(39,174,96,0.2)",
              }}>
                <div>
                  <div style={{fontSize:13,color:C.text,fontWeight:600}}>Min Play Time (SAY Rule 12)</div>
                  <div style={{fontSize:12,color:C.muted}}>{SAY_PLAY_TIME[divisionKey]?.note || "Check local rules"}</div>
                </div>
              </div>
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
              {(division.unknownRules || []).map((rule,i) => (
                <div key={i} style={{
                  display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",
                  marginBottom:8,borderRadius:9,background:C.surface,border:`1px solid ${C.border}`,
                }}>
                  <div style={{
                    width:22,height:22,borderRadius:"50%",flexShrink:0,
                    background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:11,fontWeight:700,color:"#0a0d0f",
                  }}>{i+1}</div>
                  <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{rule}</div>
                </div>
              ))}
            </div>
          )}
          {view==="links" && (
            <div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                Official SAY East and SAY National rulebooks for {divisionKey}:
              </div>
              {(division.officialLinks || []).map((link,i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                  display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
                  marginBottom:8,borderRadius:9,
                  background:C.surface,border:`1px solid ${C.border}`,
                  textDecoration:"none",
                }}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:C.text,fontWeight:600}}>{link.label}</div>
                    <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{link.url}</div>
                  </div>
                </a>
              ))}
              <div style={{fontSize:11,color:C.muted,marginTop:12,lineHeight:1.6,padding:"10px 14px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
                Rules may vary by local league, state association, or competition. Always verify with your specific league administrator.
              </div>
            </div>
          )}
        </>
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

  const ageOrder = AGES;
  const leagueIdx = ageIndex(league);

  const filtered = drills.filter(d => {
    if (catFilter!=="All" && d.category!==catFilter) return false;
    if (skillFilter!=="All" && !d.skills.includes(skillFilter)) return false;
    if (diffFilter!=="All" && d.difficulty!==diffFilter) return false;
    if (ageFilter) {
      const minI = ageIndex(d.ageMin || "U6");
      const maxI = d.ageMax ? ageIndex(d.ageMax) : AGES.length - 1;
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
                {CATEGORIES.map(c=><option key={c} style={OPT}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Difficulty</label>
              <select value={newDrill.difficulty} onChange={e=>setNewDrill(d=>({...d,difficulty:e.target.value}))} style={SS}>
                {DIFFICULTIES.map(c=><option key={c} style={OPT}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Age Min</label>
              <select value={newDrill.ageMin} onChange={e=>setNewDrill(d=>({...d,ageMin:e.target.value}))} style={SS}>
                {LEAGUES.map(l=><option key={l} value={l} style={OPT}>{leagueShortLabel(l)}</option>)}
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

  const isYoung = ageNumber(league) <= 8;
  const level = ageNumber(league) <= 10 ? "Beginner" : ageNumber(league) <= 14 ? "Intermediate" : "Advanced";

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

  const ageOrder = AGES;
  const leagueIdx = ageIndex(league);

  return (
    <div>
      {/* Config */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,marginBottom:12,alignItems:"flex-end"}}>
          <div>
            <label style={lbl}>Focus Area</label>
            <select value={focus} onChange={e=>setFocus(e.target.value)} style={SS}>
              {FOCUS_AREAS.map(f=><option key={f} style={OPT}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Duration (minutes)</label>
            <select value={duration} onChange={e=>setDuration(+e.target.value)} style={SS}>
              {[30,45,60,75,90].map(d=><option key={d} style={OPT}>{d}</option>)}
            </select>
          </div>
          <Btn primary onClick={generate}> Generate</Btn>
        </div>
        <div>
          <label style={lbl}>Skill Focus Tags (optional - refines drill selection)</label>
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
        {isYoung && <div style={{fontSize:11,color:C.muted}}>Fun-focused - Short activities - Simple instructions</div>}
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
                            const minI=ageIndex(d.ageMin||"U6");
                            const maxI=d.ageMax ? ageIndex(d.ageMax) : AGES.length - 1;
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
  {id:"team",     icon:"", label:"Contacts"},
  {id:"rules",    icon:"", label:"Rules"},
  {id:"drills",   icon:"", label:"Drills"},
  {id:"practice", icon:"", label:"Practice"},
];

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
  const { isLoaded, user } = useUser();
  if (!isLoaded || !user?.id) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"}}>
        Loading your team…
      </div>
    );
  }
  return <CoachKitLoaded />;
}

function CoachKitLoaded() {
  const { user } = useUser();
  const { session } = useSession();
  const pfx = user?.id ? `ck_${user.id}_` : "ck_guest_";

  const [tab,             setTab]             = useState("game");
  const [league,          setLeague]          = usePersistedState(pfx+"league", "U8");
  const [subMode,         setSubMode]         = usePersistedState(pfx+"subMode", true);
  const [autoRegen,       setAutoRegen]       = usePersistedState(pfx+"autoRegen", true);
  const [quarterMinutes,  setQuarterMinutes]  = usePersistedState(pfx+"quarterMinutes", null);
  const [org,             setOrg]             = usePersistedState(pfx+"org", null);
  const [gkSetting,       setGkSetting]       = usePersistedState(pfx+"gk", null);
  const [periodsSetting,  setPeriodsSetting]  = usePersistedState(pfx+"periods", null);
  const [saySeason,       setSaySeason]       = usePersistedState(pfx+"saySeason", "fall");
  const [customRule,      setCustomRule]      = usePersistedState(pfx+"customRule", null);
  const [settingsOpen,    setSettingsOpen]    = useState(false);
  const [format,          setFormat]          = usePersistedState(pfx+"format", "4v4");
  const [lineupsByQuarter,setLineupsByQuarter]= usePersistedState(pfx+"lineups", {});

  const [teamName,           setTeamName]          = usePersistedState(pfx+"teamName",     "");
  const [editingTeamName,    setEditingTeamName]   = useState(false);
  const [players,            setPlayers]            = usePersistedState(pfx+"players",      SAMPLE_PLAYERS);
  const [customDrills,       setCustomDrills]       = usePersistedState(pfx+"customDrills", []);
  const [playerStats,        setPlayerStats]        = usePersistedState(pfx+"playerStats",  (() => { const s={}; SAMPLE_PLAYERS.forEach(p=>{s[p.id]={goals:0,assists:0,gamesPlayed:0};}); return s; })());
  const [games,              setGames]              = usePersistedState(pfx+"games",         []);
  const [practiceAttendance, setPracticeAttendance] = usePersistedState(pfx+"practiceAtt",  {});
  const [practiceDates,      setPracticeDates]      = usePersistedState(pfx+"practiceDates",[]);
  const [schedule,           setSchedule]           = usePersistedState(pfx+"schedule", []);
  const [gameDay,            setGameDay]            = usePersistedState(pfx+"gameDay", () => {
    const get = (key, fallback) => {
      try {
        const raw = localStorage.getItem(pfx + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };
    return snapshotFromStorage(get).gameDay;
  });

  const allDrills = [...DRILLS, ...customDrills];

  const applySnapshot = useCallback((snap) => {
    if (!snap) return;
    if (typeof snap.teamName === "string") setTeamName(snap.teamName);
    if (snap.league) setLeague(snap.league);
    if (snap.format) setFormat(snap.format);
    if (Array.isArray(snap.players)) setPlayers(snap.players);
    if (snap.lineups && typeof snap.lineups === "object") setLineupsByQuarter(snap.lineups);
    if (Array.isArray(snap.customDrills)) setCustomDrills(snap.customDrills);
    if (snap.playerStats && typeof snap.playerStats === "object") setPlayerStats(snap.playerStats);
    if (Array.isArray(snap.games)) setGames(snap.games);
    if (Array.isArray(snap.practiceDates)) setPracticeDates(snap.practiceDates);
    if (snap.practiceAttendance && typeof snap.practiceAttendance === "object") setPracticeAttendance(snap.practiceAttendance);
    if (snap.settings && typeof snap.settings === "object") {
      if (typeof snap.settings.subMode === "boolean") setSubMode(snap.settings.subMode);
      if (typeof snap.settings.autoRegen === "boolean") setAutoRegen(snap.settings.autoRegen);
      if ("quarterMinutes" in snap.settings) setQuarterMinutes(snap.settings.quarterMinutes);
      if ("org" in snap.settings) setOrg(snap.settings.org || null);
      if ("gk" in snap.settings) setGkSetting(typeof snap.settings.gk === "boolean" ? snap.settings.gk : null);
      if ("periods" in snap.settings) setPeriodsSetting(snap.settings.periods || null);
      if (snap.settings.saySeason === "spring" || snap.settings.saySeason === "fall") setSaySeason(snap.settings.saySeason);
      if ("custom" in snap.settings) setCustomRule(snap.settings.custom || null);
    }
    if (snap.gameDay && typeof snap.gameDay === "object") setGameDay(normalizeGameDay(snap.gameDay));
    if (Array.isArray(snap.schedule)) setSchedule(snap.schedule);
  }, [setTeamName, setLeague, setFormat, setPlayers, setLineupsByQuarter, setCustomDrills, setPlayerStats, setGames, setPracticeDates, setPracticeAttendance, setSubMode, setAutoRegen, setQuarterMinutes, setOrg, setGkSetting, setPeriodsSetting, setSaySeason, setCustomRule, setGameDay, setSchedule]);

  const snapshot = useMemo(() => ({
    teamName,
    league,
    format,
    players,
    lineups: lineupsByQuarter,
    customDrills,
    playerStats,
    games,
    practiceDates,
    practiceAttendance,
    settings: { subMode, autoRegen, quarterMinutes, org, gk: gkSetting, periods: periodsSetting, saySeason, custom: customRule },
    gameDay,
    schedule,
  }), [teamName, league, format, players, lineupsByQuarter, customDrills, playerStats, games, practiceDates, practiceAttendance, subMode, autoRegen, quarterMinutes, org, gkSetting, periodsSetting, saySeason, customRule, gameDay, schedule]);

  const cloud = useTeamCloud({
    userId: user?.id || "",
    email: user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "",
    getToken: () => session?.getToken() ?? Promise.resolve(null),
    snapshot,
    applySnapshot,
  });

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

  const setup = resolveSetup({
    league,
    format,
    settings: { subMode, autoRegen, quarterMinutes, org, gk: gkSetting, periods: periodsSetting, saySeason, custom: customRule },
  });

  const applyOrgAge = (nextOrg, nextAge, nextSeason) => {
    const season = nextSeason === "spring" ? "spring" : "fall";
    setOrg(nextOrg);
    setLeague(nextAge);
    setSaySeason(season);
    setGkSetting(null);
    setPeriodsSetting(null);
    setQuarterMinutes(null);
    if (nextOrg !== "custom") setFormat(formatFromCount(tableRule(nextOrg, nextAge, season).playersOnField));
    setLineupsByQuarter({});
  };
  const handleOrgChange = next => {
    if (!next) return;
    if (next === "custom") {
      setCustomRule({
        playersOnField: setup.playersOnField,
        gk: setup.gk,
        periods: setup.periods,
        periodMinutes: setup.periodMinutes,
      });
      setOrg("custom");
      setLeague(canonicalAge(league));
      return;
    }
    applyOrgAge(next, canonicalAge(league), saySeason);
  };
  const handleAgeChange = age => {
    if ((org || setup.orgId) === "custom") {
      setOrg("custom");
      setLeague(age);
      return;
    }
    applyOrgAge(org || "us-soccer", age, saySeason);
  };
  const handleFormatChange = nextFormat => {
    setFormat(nextFormat);
    setLineupsByQuarter({});
    if (org === "custom") {
      setCustomRule(prev => ({ ...(prev || {}), playersOnField: playersFromFormat(nextFormat) || setup.playersOnField }));
    }
  };
  const handleGkChange = on => {
    if (org === "custom") {
      setCustomRule(prev => ({
        ...(prev || {}),
        playersOnField: setup.playersOnField,
        periods: setup.periods,
        periodMinutes: setup.periodMinutes,
        gk: on,
      }));
    } else {
      setGkSetting(on);
    }
    setLineupsByQuarter({});
  };
  const handlePeriodsChange = count => {
    if (org === "custom") setCustomRule(prev => ({ ...(prev || {}), periods: count }));
    else {
      setPeriodsSetting(count);
      setQuarterMinutes(null);
    }
    setLineupsByQuarter({});
  };
  const handleSeasonChange = season => applyOrgAge("say-east", canonicalAge(league), season);
  const handleMinutes = value => {
    setQuarterMinutes(value);
    if (org === "custom") {
      setCustomRule(prev => ({ ...(prev || {}), periodMinutes: value || setup.periodMinutes }));
    }
  };

  return (
    <div style={{
      minHeight:"100vh",
      background: C.bg,
      fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
      color: C.text,
    }}>
      {/* HEADER */}
      <div id="ck-app-header" style={{
        background:"linear-gradient(180deg,#111810 0%,#0c140a 100%)",
        borderBottom:`1px solid rgba(232,160,32,0.18)`,
        position:"sticky",top:0,zIndex:100,
      }}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"8px 0 6px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
              <div style={{
                width:36,height:36,borderRadius:9,
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
                <div style={{fontSize:16,fontWeight:800,color:C.text,letterSpacing:"-0.01em",lineHeight:1.1}}>CoachKit</div>
                {editingTeamName ? (
                  <input
                    autoFocus value={teamName} onChange={e=>setTeamName(e.target.value)}
                    onBlur={()=>setEditingTeamName(false)}
                    onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape") setEditingTeamName(false); }}
                    placeholder="Team name"
                    style={{...IS, fontSize:11, padding:"3px 7px", width:180, marginTop:2}}
                  />
                ) : (
                  <div onClick={()=>setEditingTeamName(true)} title="Click to edit team name"
                    style={{
                      fontSize:11, color:teamName?C.gold:C.muted, fontWeight:teamName?700:400,
                      letterSpacing:"0.08em", textTransform:"uppercase", marginTop:2,
                      cursor:"pointer", padding:"2px 6px", marginLeft:-6,
                      borderRadius:4, border:"1px dashed transparent",
                      transition:"all 0.15s",
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(232,160,32,0.35)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="transparent";}}>
                    {teamName || "+ Add Team Name"}
                  </div>
                )}
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                  {cloud.status==="loading" && "Syncing team…"}
                  {cloud.status==="synced" && `Saved with ${cloud.team?.name || "your team"}`}
                  {cloud.status==="off" && "Saved on this device"}
                  {cloud.status==="error" && "Saved on this device — cloud sync paused"}
                </div>
                {cloud.teams.length > 1 && (
                  <select
                    value={cloud.team?.id || ""}
                    onChange={e => cloud.selectTeam(e.target.value)}
                    style={{...SS, fontSize:11, padding:"3px 6px", marginTop:4, width:200}}
                  >
                    {cloud.teams.map(t => (
                      <option key={t.id} value={t.id} style={OPT}>{t.name} ({t.role})</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
              <button type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)} style={{
                width:36, height:36, borderRadius:8, cursor:"pointer", fontFamily:"inherit",
                border:`1px solid ${C.border}`, background:"rgba(255,255,255,0.04)", color:C.gold,
                fontSize:18, lineHeight:1,
              }}>⚙</button>
              <UserMenu />
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
      <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px",opacity:cloud.status==="loading"?0.55:1,pointerEvents:cloud.status==="loading"?"none":"auto"}}>
        {cloud.error && (
          <div style={{marginBottom:12,padding:"10px 12px",borderRadius:8,background:"rgba(211,84,0,0.12)",border:"1px solid rgba(211,84,0,0.35)",fontSize:12,color:C.gold,lineHeight:1.45}}>
            {cloud.error}
          </div>
        )}
        {tab==="game"     && <TabGame     format={format} league={league} players={players} setPlayers={setPlayers} addPlayer={addPlayer} removePlayer={removePlayer} lineupsByQuarter={lineupsByQuarter} setLineupsByQuarter={setLineupsByQuarter} storagePrefix={pfx} setGames={setGames} subMode={subMode} autoRegen={autoRegen} quarterMinutes={quarterMinutes} gameDay={gameDay} setGameDay={setGameDay} setup={setup}/>}
        <GameSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          subMode={subMode}
          onSubMode={setSubMode}
          setup={setup}
          onOrgChange={handleOrgChange}
          onAgeChange={handleAgeChange}
          onFormatChange={handleFormatChange}
          onGkChange={handleGkChange}
          onPeriodsChange={handlePeriodsChange}
          onSeasonChange={handleSeasonChange}
          autoRegen={autoRegen}
          onAutoRegen={setAutoRegen}
          quarterMinutes={quarterMinutes}
          onQuarterMinutes={handleMinutes}
          fairPlayLabel={`Fair-play target: ${minQuarters(setup.minFraction, setup.periods)} of ${setup.periods} ${setup.periodNoun} (${minQuarters(setup.minFraction, setup.periods) * 2} halves).`}
        />
        {tab==="season"   && <TabSeason   players={players} playerStats={playerStats} setPlayerStats={setPlayerStats} games={games} setGames={setGames} practiceDates={practiceDates} setPracticeDates={setPracticeDates} practiceAttendance={practiceAttendance} setPracticeAttendance={setPracticeAttendance}/>}
        {tab==="team"     && <TabTeam     players={players} updatePlayer={updatePlayer} league={league} games={games} cloud={cloud} clerkUserId={user?.id || ""} schedule={schedule} setSchedule={setSchedule}/>}
        {tab==="rules"    && <TabRules    setup={setup}/>}
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
          {games.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40,lineHeight:1.5}}>No games logged yet. Save a strategy from Game Day, or add a result here.</div>}
          {[...games].sort((a,b)=>b.date.localeCompare(a.date)).map(g=>{
            const result = g.homeScore>g.oppScore?"W":g.homeScore<g.oppScore?"L":"D";
            const resultColor = result==="W"?C.ok:result==="L"?"#e74c3c":C.gold;
            const sheets = g.strategy?.sheets;
            return (
              <div key={g.id} style={{
                display:"flex",flexDirection:"column",alignItems:"stretch",gap:8,padding:"10px 14px",
                background:C.surface,borderRadius:9,marginBottom:6,border:`1px solid ${C.border}`,
              }}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{
                  width:32,height:32,borderRadius:7,flexShrink:0,
                  background:`${resultColor}22`,border:`1px solid ${resultColor}44`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:800,fontSize:14,color:resultColor,
                }}>{result}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>vs {g.opponent}</div>
                  <div style={{fontSize:11,color:C.muted}}>{g.date}  <b style={{color:g.homeScore>g.oppScore?C.ok:"#e74c3c"}}>{g.homeScore}</b>  {g.oppScore}</div>
                  {g.strategy && (
                    <div style={{fontSize:11, color:C.gold, fontWeight:700, marginTop:3}}>
                      {g.strategy.formation || "Strategy"}{g.strategy.formationLabel ? ` · ${g.strategy.formationLabel}` : ""} · {g.strategy.subMode ? "Sub mode" : "Full periods"}{g.strategy.format ? ` · ${g.strategy.format}` : ""}
                    </div>
                  )}
                  {sheets?.field && sheets?.playTime && (
                    <div style={{fontSize:11, color:C.gold, fontWeight:700, marginTop:3}}>Sheets saved</div>
                  )}
                  {!sheets && g.strategy?.lineups && (
                    <div style={{fontSize:11, color:C.muted, lineHeight:1.45, marginTop:4}}>
                      {Object.keys(g.strategy.lineups).map(Number).filter(q => q >= 1).sort((a, b) => a - b).map(q => {
                        const names = (g.strategy.lineups[q].starters || []).map(slot => slot.player?.name?.split(" ")[0]).filter(Boolean);
                        const mark = g.strategy.periodType === "halves" ? "H" : g.strategy.periodType === "periods" ? "P" : "Q";
                        return <div key={q}>{mark}{q}: {names.join(", ") || "open spots"}</div>;
                      })}
                    </div>
                  )}
                  {g.notes && <div style={{fontSize:11,color:C.muted,marginTop:2,fontStyle:"italic"}}>{g.notes}</div>}
                </div>
                <button onClick={()=>setGames(prev=>prev.filter(x=>x.id!==g.id))} style={{
                  background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",
                  fontSize:16,lineHeight:1,padding:"4px 6px",
                }}></button>
                </div>
                {sheets?.field && sheets?.playTime && (
                  <details>
                    <summary style={{cursor:"pointer",fontSize:12,fontWeight:700,color:C.text}}>Field sheet and play time</summary>
                    <div style={{marginTop:10}}>
                      <SheetCanvases
                        field={sheets.field}
                        playTime={sheets.playTime}
                        league={g.strategy.league || ""}
                        opponent={g.opponent}
                        homeScore={g.homeScore}
                        awayScore={g.oppScore}
                        periodAbbrev={g.strategy.periodType === "halves" ? "H" : g.strategy.periodType === "periods" ? "P" : "Q"}
                        periodCount={g.strategy.periods || sheets.field.quarters?.length || 4}
                      />
                    </div>
                  </details>
                )}
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
function CoachesCard({ cloud, clerkUserId }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setMsg("");
    try {
      await cloud.addCoach(value);
      setValue("");
      setMsg(value.includes("@")
        ? "Invite saved. They get access after signing in with that email, or sooner if you add their Clerk user id."
        : "Coach added. They will see this roster the next time they open CoachKit.");
    } catch (err) {
      setMsg(err?.message || "Could not add that coach.");
    } finally {
      setBusy(false);
    }
  };

  if (!cloud?.configured) {
    return (
      <Card style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:6}}>Coaches</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>
          Cloud sync is off until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. The roster stays on this device.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:6}}>Coaches on this team</div>
      <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:8}}>
        Your Clerk user id: <b style={{color:C.text}}>{clerkUserId || "—"}</b>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <Btn sm onClick={async () => {
          try {
            await navigator.clipboard.writeText(clerkUserId || "");
            setMsg("Copied your Clerk user id.");
          } catch {
            setMsg(clerkUserId || "");
          }
        }}>Copy my id</Btn>
      </div>
      {(cloud.members || []).map(member => (
        <div key={member.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:C.text,fontWeight:600}}>
              {member.role === "owner" ? "Owner" : "Coach"}
              {member.status === "invited" ? " · pending" : ""}
            </div>
            <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis"}}>
              {member.clerk_user_id || member.email || "Invite"}
            </div>
          </div>
          {member.role === "coach" && (
            <Btn sm danger onClick={async () => {
              try { await cloud.removeCoach(member.id); setMsg("Coach removed."); }
              catch (err) { setMsg(err?.message || "Could not remove that coach."); }
            }}>Remove</Btn>
          )}
        </div>
      ))}
      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="user_… or coach@email"
          style={{...IS, flex:"1 1 180px"}}
        />
        <Btn primary disabled={busy} onClick={submit}>{busy ? "Adding…" : "Add coach"}</Btn>
      </div>
      <div style={{fontSize:10,color:C.muted,lineHeight:1.45,marginTop:8}}>
        A Clerk user id gives access right away. An email stays pending until that person signs in and the Clerk token includes their email. The owner cannot be removed here.
      </div>
      {msg && <div style={{fontSize:12,color:C.gold,marginTop:8,lineHeight:1.4}}>{msg}</div>}
    </Card>
  );
}

function TabTeam({ players, updatePlayer, league, games, cloud, clerkUserId, schedule, setSchedule }) {
  const [view, setView] = useState("contacts"); // contacts | schedule | dev
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [newScheduleItem, setNewScheduleItem] = useState({date:"",type:"game",opponent:"",location:"",notes:""});
  const [showAddEvent, setShowAddEvent] = useState(false);

  const saveEvent = () => {
    if (!newScheduleItem.date) return;
    setSchedule(prev=>[...prev,{...newScheduleItem,id:uid()}]);
    setNewScheduleItem({date:"",type:"game",opponent:"",location:"",notes:""});
    setShowAddEvent(false);
  };

  return (
    <div>
      <CoachesCard cloud={cloud} clerkUserId={clerkUserId} />
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
                    <option value="game" style={OPT}>Game</option>
                    <option value="practice" style={OPT}>Practice</option>
                    <option value="other" style={OPT}>Other</option>
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
          {(schedule || []).length === 0 && !showAddEvent && (
            <div style={{textAlign:"center",color:C.muted,padding:28,lineHeight:1.5}}>No events yet. Add a game or practice and it stays with this team.</div>
          )}
          {[...(schedule || [])].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).map(ev=>{
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
