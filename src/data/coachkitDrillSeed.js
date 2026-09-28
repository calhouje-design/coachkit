/** Canonical CoachKit drill-card seed. Field names match drill-seeds-v1.json. */
export const drillSeedFile = {
  "schemaVersion": "coachkit-drill-card-v1-camel",
  "coordSpace": "normalized_0_1",
  "coordNote": "x right, y down inside grass field box; distances/strokes reference player/cone ids",
  "letterSheetFields": [
    "number",
    "title",
    "category",
    "ageBand",
    "difficulty",
    "durationMin",
    "diagram",
    "diagramCredit",
    "purpose",
    "setup",
    "coachingPoints",
    "playersLabel",
    "focus",
    "progressions",
    "legend"
  ],
  "detailsOnlyFields": [
    "howToRun",
    "commonMistakes",
    "regressions",
    "fewerPlayers",
    "equipment",
    "block",
    "timeBlock"
  ],
  "teamDefaults": {
    "team": "U8 Passers",
    "ageGroup": "U8 boys, ages 7-8",
    "rosterSize": 10,
    "coachesLine": "Head Coach: Lazear; Assistant Coach: Jared Calhoun",
    "parentFacingSignature": "Assistant Coach Jared Calhoun"
  },
  "practiceWrapperHint": {
    "title": "Practice 1 - Example",
    "driveDoc": "https://docs.google.com/document/d/1cM_v2fNsWZUiMmerJHWCxjeoxsGAtI5eWn1h3UZ9tlA/edit",
    "drivePdf": "https://drive.google.com/file/d/1jJUUHVCLRsG8r-sxunLxPYO_urdfRWHH/view"
  },
  "seedNote": "camelCase CoachKit schema for in-flight Round Three build. Drive/content.py stays snake_case; adapter maps if needed.",
  "drills": [
    {
      "id": "triangle-passing",
      "number": 3,
      "title": "Triangle Passing",
      "category": "PASSING",
      "ageBand": "U6–ADULT",
      "difficulty": "BEGINNER",
      "durationMin": 10,
      "playersLabel": "3+",
      "focus": "PASSING",
      "block": "PASSING",
      "timeBlock": "10 min",
      "purpose": "Improve passing accuracy, first touch, movement and timing.",
      "setup": [
        "3 cones in a triangle, 8 yards apart on each side.",
        "1 player at each cone (A, B, C); ball starts at A.",
        "Pass A→B→C→A and follow your pass to the next cone.",
        "Keep the triangle shape; replace empty cones as you rotate."
      ],
      "coachingPoints": [
        "Weight of pass into feet",
        "Receive across body / open hips",
        "Check shoulder before receiving",
        "Move after the pass (follow your pass)",
        "Use both feet"
      ],
      "progressions": [
        "Increase distance to 10–12 yards.",
        "Limit to 1-touch passing.",
        "Add a passive defender in the middle.",
        "Must use weak foot only."
      ],
      "regressions": [
        "Shrink to 6 yards.",
        "Two-touch required (stop, then pass).",
        "Coach stands in the middle as a quiet defender who does not steal."
      ],
      "fewerPlayers": "Only 2 players? Use 2 cones and bounce passes off a third cone, or coach fills the third vertex.",
      "howToRun": [
        "Show the pattern once: pass, then follow your pass to that cone.",
        "Play continuous for 60–90 seconds, then rest 20 seconds.",
        "Switch starting player / ball every round so everyone opens the pattern.",
        "Cue quality over speed for the first 2 rounds, then add a progression."
      ],
      "commonMistakes": [
        {
          "mistake": "Pass too hard or bouncing",
          "fix": "\"Pass so they can take it with one soft touch.\""
        },
        {
          "mistake": "Standing still after the pass",
          "fix": "\"Pass and go — fill the cone you played to.\""
        },
        {
          "mistake": "Receiving square / closed",
          "fix": "\"Open your hips; first touch toward the next pass.\""
        },
        {
          "mistake": "Only using the strong foot",
          "fix": "\"Next round: other foot only.\""
        }
      ],
      "diagram": {
        "coordSpace": "normalized_0_1",
        "fieldAspect": "grass",
        "cones": [
          {
            "id": "cA",
            "x": 0.5,
            "y": 0.18
          },
          {
            "id": "cB",
            "x": 0.22,
            "y": 0.78
          },
          {
            "id": "cC",
            "x": 0.78,
            "y": 0.78
          }
        ],
        "players": [
          {
            "id": "pA",
            "label": "A",
            "x": 0.5,
            "y": 0.28,
            "hasBall": true
          },
          {
            "id": "pB",
            "label": "B",
            "x": 0.28,
            "y": 0.7,
            "hasBall": false
          },
          {
            "id": "pC",
            "label": "C",
            "x": 0.72,
            "y": 0.7,
            "hasBall": false
          }
        ],
        "distances": [
          {
            "from": "cA",
            "to": "cB",
            "label": "8 YDS"
          },
          {
            "from": "cB",
            "to": "cC",
            "label": "8 YDS"
          },
          {
            "from": "cC",
            "to": "cA",
            "label": "8 YDS"
          }
        ],
        "strokes": [
          {
            "type": "pass",
            "from": "pA",
            "to": "pB"
          },
          {
            "type": "pass",
            "from": "pB",
            "to": "pC"
          },
          {
            "type": "pass",
            "from": "pC",
            "to": "pA"
          },
          {
            "type": "run",
            "from": "pA",
            "to": "cB"
          },
          {
            "type": "run",
            "from": "pB",
            "to": "cC"
          },
          {
            "type": "run",
            "from": "pC",
            "to": "cA"
          }
        ]
      },
      "diagramCredit": {
        "title": "Triangle Passing reference (Jared style target)",
        "url": null,
        "note": "Structured diagram authored to match Jared's Triangle Passing printable reference JPG."
      },
      "legend": [
        {
          "symbol": "dashed_arrow",
          "meaning": "PASS"
        },
        {
          "symbol": "solid_arrow",
          "meaning": "RUN"
        },
        {
          "symbol": "squiggle_arrow",
          "meaning": "DRIBBLE"
        },
        {
          "symbol": "ball",
          "meaning": "BALL"
        },
        {
          "symbol": "cone",
          "meaning": "CONE"
        },
        {
          "symbol": "blue_player",
          "meaning": "PLAYER"
        }
      ]
    },
    {
      "id": "pass-through-the-gates",
      "number": 3,
      "title": "Pass Through the Gates",
      "category": "PASSING",
      "ageBand": "U8",
      "difficulty": "BEGINNER",
      "durationMin": 9,
      "playersLabel": "10 (5 pairs)",
      "focus": "PASSING",
      "block": "PASSING",
      "timeBlock": "0:20–0:29 · 9 min",
      "purpose": "Passing with the inside of the foot, stopping the ball, moving right after you pass, and talking to a teammate.",
      "setup": [
        "Area: 25 x 25 yd main grid. Gates widened to 3 yards (2 cones each).",
        "Equipment: 1 ball per pair (5 balls); spare balls outside the grid.",
        "Players: 5 pairs. Each pair starts at its own gate, one player on each side, 3–5 yards apart.",
        "Optional middle triangle of poles/cones — skip if you only have disc cones."
      ],
      "coachingPoints": [
        "Plant foot next to the ball, toes pointing at your partner.",
        "Lock your ankle; hit the middle of the ball with the inside of your foot.",
        "Receiver: on your toes; soft first touch toward the next gate.",
        "Say your partner's name before you pass."
      ],
      "progressions": [
        "2 touches max.",
        "One pair (no ball) are gate goalies who block gates with their feet.",
        "Partners farther apart (6–8 yd)."
      ],
      "regressions": [
        "Gates 4 yd wide.",
        "Partners closer (3 yd).",
        "Stop the ball fully before passing."
      ],
      "fewerPlayers": "Odd number? One group of 3 passes in a triangle through the gates, or the coach partners with one player.",
      "howToRun": [
        "Demo with one pair (30 sec): inside-of-foot pass through the gate; partner stops it; both jog to a new gate.",
        "Round 1 (60 sec): pass through as many gates as you can. Count out loud. No same gate twice in a row.",
        "Rest 30 sec. Ask what helped them get more (talking, moving, first touch).",
        "Round 2: beat your score.",
        "Round 3: 2 passes at each gate (pass and pass back), then move.",
        "Round 4: other foot only. Switch partners and repeat one round."
      ],
      "commonMistakes": [
        {
          "mistake": "Toe-poking the ball",
          "fix": "\"Show me the flat side of your foot. Pass like a mini-golf putter.\""
        },
        {
          "mistake": "Pass too hard or too soft",
          "fix": "\"Pass it so your partner can stop it with one touch.\""
        },
        {
          "mistake": "Standing still after passing",
          "fix": "\"Pass and move! Find the next gate before the ball gets there.\""
        },
        {
          "mistake": "Ball bounces off the receiver",
          "fix": "\"Soft foot, like catching an egg.\""
        }
      ],
      "diagram": {
        "coordSpace": "normalized_0_1",
        "fieldAspect": "grass",
        "note": "Simplified seed diagram — 3 sample gates + one pair. Full practice uses ~11 gates.",
        "cones": [
          {
            "id": "g1a",
            "x": 0.3,
            "y": 0.35
          },
          {
            "id": "g1b",
            "x": 0.38,
            "y": 0.35
          },
          {
            "id": "g2a",
            "x": 0.55,
            "y": 0.55
          },
          {
            "id": "g2b",
            "x": 0.63,
            "y": 0.55
          },
          {
            "id": "g3a",
            "x": 0.35,
            "y": 0.7
          },
          {
            "id": "g3b",
            "x": 0.43,
            "y": 0.7
          }
        ],
        "players": [
          {
            "id": "p1",
            "label": "1",
            "x": 0.34,
            "y": 0.22,
            "hasBall": true
          },
          {
            "id": "p2",
            "label": "2",
            "x": 0.34,
            "y": 0.48,
            "hasBall": false
          }
        ],
        "distances": [
          {
            "from": "g1a",
            "to": "g1b",
            "label": "3 YD"
          }
        ],
        "strokes": [
          {
            "type": "pass",
            "from": "p1",
            "to": "p2"
          },
          {
            "type": "run",
            "from": "p1",
            "to": "g2a"
          },
          {
            "type": "run",
            "from": "p2",
            "to": "g2b"
          }
        ]
      },
      "diagramCredit": {
        "title": "Passing Through The Gate | Passing Drill - QuickStartSoccer.com",
        "url": "https://quickstartsoccer.com/passing-through-the-gate/"
      },
      "legend": [
        {
          "symbol": "dashed_arrow",
          "meaning": "PASS"
        },
        {
          "symbol": "solid_arrow",
          "meaning": "RUN"
        },
        {
          "symbol": "squiggle_arrow",
          "meaning": "DRIBBLE"
        },
        {
          "symbol": "ball",
          "meaning": "BALL"
        },
        {
          "symbol": "cone",
          "meaning": "CONE"
        },
        {
          "symbol": "blue_player",
          "meaning": "PLAYER"
        }
      ],
      "sourcePractice": "Practice 1 - Example (U8 Passers)"
    },
    {
      "id": "traffic-lights",
      "number": 1,
      "title": "Traffic Lights (Stop & Go)",
      "category": "WARM-UP",
      "ageBand": "U8",
      "difficulty": "BEGINNER",
      "durationMin": 10,
      "playersLabel": "10",
      "focus": "DRIBBLING",
      "block": "WARM-UP",
      "timeBlock": "0:00–0:10 · 10 min",
      "purpose": "Keeping the ball close, stopping it fast, looking up, and listening. Warms up legs and gets lots of touches.",
      "setup": [
        "Area: main grid 25 x 25 yards, cone on each corner.",
        "The 11 gates for the next drill can already be set inside; players just dribble around them.",
        "Equipment: 1 ball per player, 4 corner cones.",
        "Players: all 10 inside the grid, each with a ball. Coach on one edge where everyone can see and hear."
      ],
      "coachingPoints": [
        "Tiny touches: \"Keep the ball on a leash.\"",
        "Look up between touches: \"Find the empty space.\"",
        "Use both feet and all parts: inside, outside, and the sole."
      ],
      "progressions": [
        "Add a fake call (\"BLUE!\" = do nothing).",
        "PURPLE = left foot only.",
        "Coach is a \"police car\" who tries to tap balls away."
      ],
      "regressions": [
        "Use only GREEN and RED.",
        "Walking-pace dribble.",
        "Bigger space."
      ],
      "fewerPlayers": "Shrink the grid to about 20 x 20 yd so it still feels busy.",
      "howToRun": [
        "Arrival (0:00–0:03): free dribble. Start as soon as 2 kids show up; late arrivals join in. Ask \"How many touches can you get?\"",
        "Call the lights (0:03–0:10): GREEN = dribble fast. YELLOW = slow, tiny touches. RED = stop, foot on top of the ball.",
        "Every 1–2 minutes add one new call: TURN! = pull back and go the other way. KNEE!/ELBOW!/NOSE! = stop with that body part. GATE! = dribble through a gate.",
        "Between rounds (15 sec): 20 toe taps, then 10 side-to-side windshield wipers.",
        "Keep it fun: last player to stop on RED does 5 toe taps. Nobody sits out."
      ],
      "commonMistakes": [
        {
          "mistake": "Kicking the ball far ahead and chasing it",
          "fix": "\"Tiny touches. Every step touches the ball.\""
        },
        {
          "mistake": "Head down, bumping into teammates",
          "fix": "Hold up fingers: \"How many fingers am I showing?\""
        },
        {
          "mistake": "Stopping the ball with a hand or heel",
          "fix": "Demo the sole stop: \"Foot on top, like a lid on a jar.\""
        }
      ],
      "diagram": {
        "coordSpace": "normalized_0_1",
        "fieldAspect": "grass",
        "note": "Simplified seed — players free-dribbling in grid; lights are coach calls, not field markers.",
        "cones": [
          {
            "id": "c1",
            "x": 0.1,
            "y": 0.1
          },
          {
            "id": "c2",
            "x": 0.9,
            "y": 0.1
          },
          {
            "id": "c3",
            "x": 0.1,
            "y": 0.9
          },
          {
            "id": "c4",
            "x": 0.9,
            "y": 0.9
          }
        ],
        "players": [
          {
            "id": "p1",
            "label": "1",
            "x": 0.35,
            "y": 0.4,
            "hasBall": true
          },
          {
            "id": "p2",
            "label": "2",
            "x": 0.55,
            "y": 0.55,
            "hasBall": true
          },
          {
            "id": "p3",
            "label": "3",
            "x": 0.7,
            "y": 0.35,
            "hasBall": true
          },
          {
            "id": "p4",
            "label": "4",
            "x": 0.4,
            "y": 0.7,
            "hasBall": true
          }
        ],
        "distances": [
          {
            "from": "c1",
            "to": "c2",
            "label": "25 YD"
          }
        ],
        "strokes": [
          {
            "type": "dribble",
            "from": "p1",
            "to": "p2"
          },
          {
            "type": "dribble",
            "from": "p3",
            "to": "p4"
          }
        ]
      },
      "diagramCredit": {
        "title": "Football/Soccer: Traffic Lights (Technical: Dribbling and RWB, Beginner) (SportSessionPlanner.com)",
        "url": "https://www.sportsessionplanner.com/s/XLRO/Traffic-Lights.html"
      },
      "legend": [
        {
          "symbol": "dashed_arrow",
          "meaning": "PASS"
        },
        {
          "symbol": "solid_arrow",
          "meaning": "RUN"
        },
        {
          "symbol": "squiggle_arrow",
          "meaning": "DRIBBLE"
        },
        {
          "symbol": "ball",
          "meaning": "BALL"
        },
        {
          "symbol": "cone",
          "meaning": "CONE"
        },
        {
          "symbol": "blue_player",
          "meaning": "PLAYER"
        }
      ],
      "sourcePractice": "Practice 1 - Example (U8 Passers)"
    }
  ]
};

export const coachkitDrillSeed = drillSeedFile.drills;
export const drillTeamDefaults = drillSeedFile.teamDefaults;
