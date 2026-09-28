/** Locked Coach Assistant drill cards. Field names match the seed JSON. */
export const coachkitDrillSeed = [
  {
    "number": 3,
    "name": "Triangle Passing",
    "block": "Passing",
    "time_block": "10 min",
    "purpose": "Improve passing accuracy, first touch, movement and timing.",
    "setup": [
      "3 cones in a triangle",
      "8 yards between cones",
      "1 ball; 3+ players (rotate extras in)"
    ],
    "diagram": {
      "kind": "svg",
      "players": [
        {
          "id": "A",
          "x": 50,
          "y": 18,
          "label": "A"
        },
        {
          "id": "B",
          "x": 22,
          "y": 78,
          "label": "B"
        },
        {
          "id": "C",
          "x": 78,
          "y": 78,
          "label": "C"
        }
      ],
      "cones": [
        {
          "x": 50,
          "y": 22
        },
        {
          "x": 22,
          "y": 82
        },
        {
          "x": 78,
          "y": 82
        }
      ],
      "distances": [
        {
          "from": "A",
          "to": "B",
          "label": "8 YDS"
        },
        {
          "from": "B",
          "to": "C",
          "label": "8 YDS"
        },
        {
          "from": "C",
          "to": "A",
          "label": "8 YDS"
        }
      ],
      "strokes": [
        {
          "type": "pass",
          "from": "A",
          "to": "B"
        },
        {
          "type": "pass",
          "from": "B",
          "to": "C"
        },
        {
          "type": "pass",
          "from": "C",
          "to": "A"
        }
      ],
      "ballAt": "A"
    },
    "diagram_credit": "Diagram created for this plan (Triangle Passing reference style)",
    "how_to_run": [
      "Players stand at cones A, B, C with one ball at A.",
      "Pass A→B→C→A around the triangle using inside of the foot.",
      "Follow your pass or stay and receive; coach chooses one pattern for the round.",
      "After 2–3 minutes reverse direction."
    ],
    "coaching_points": [
      "Weight of pass into feet",
      "First touch in the right direction",
      "Open body to the next player",
      "Call for the ball before it arrives"
    ],
    "progressions": {
      "easier": [
        "Shorter distance (6 yd)",
        "Two-touch allowed every receive"
      ],
      "harder": [
        "Increase distance (10–12 yd)",
        "One-touch only",
        "Add a weak-foot round"
      ],
      "fewer_players": "Keep 3 on cones; extras rest 30 sec then swap in"
    },
    "common_mistakes": [
      {
        "mistake": "Passing to space past the player",
        "fix": "Aim at the back foot; pass to feet."
      },
      {
        "mistake": "Flat body square to the ball",
        "fix": "Open hips toward the next cone before the ball arrives."
      }
    ],
    "legend": [
      {
        "symbol": "pass",
        "meaning": "PASS"
      },
      {
        "symbol": "run",
        "meaning": "RUN"
      },
      {
        "symbol": "dribble",
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
        "symbol": "player",
        "meaning": "PLAYER"
      }
    ],
    "age_band": "U6–ADULT",
    "difficulty": "BEGINNER",
    "players_label": "3+",
    "focus": "PASSING"
  },
  {
    "number": 1,
    "name": "Pass Through the Gates",
    "block": "Passing 1",
    "time_block": "0:20-0:29 · 9 min",
    "purpose": "Passing with the inside of the foot, stopping the ball, moving right after you pass, and talking to a teammate.",
    "setup": [
      "Area: same 25 x 25 yd main grid. Step each gate's cones apart so gates are 3 yards wide.",
      "Equipment: 1 ball per pair (5 balls). Spare balls sit outside the grid.",
      "Players: 5 pairs. Each pair starts at its own gate, one player on each side of it, 3-5 yards apart.",
      "Note: the picture also shows a middle triangle of poles. That is optional; skip it if you only have cones."
    ],
    "diagram": {
      "kind": "svg",
      "players": [
        {
          "id": "P1",
          "x": 30,
          "y": 50,
          "label": "1"
        },
        {
          "id": "P2",
          "x": 70,
          "y": 50,
          "label": "2"
        }
      ],
      "cones": [
        {
          "x": 45,
          "y": 40
        },
        {
          "x": 55,
          "y": 40
        },
        {
          "x": 45,
          "y": 60
        },
        {
          "x": 55,
          "y": 60
        }
      ],
      "distances": [],
      "strokes": [
        {
          "type": "pass",
          "from": "P1",
          "to": "P2"
        }
      ],
      "ballAt": "P1",
      "note": "Pairs pass through 3-yd gates in 25x25 grid"
    },
    "diagram_credit": "Passing Through The Gate | Passing Drill - QuickStartSoccer.com — https://quickstartsoccer.com/passing-through-the-gate/",
    "how_to_run": [
      "Demo with one pair (30 sec): plant foot next to the ball, pass with the inside of the foot through the gate, partner stops it, then both jog to a new gate.",
      "Round 1 (60 sec): pass through as many gates as you can. Count out loud. No same gate twice in a row.",
      "Rest 30 sec. Ask: \"What helped you get more?\" (talking, moving fast, a good first touch).",
      "Round 2: beat your score.",
      "Round 3: 2 passes at each gate (pass and pass back), then move.",
      "Round 4: other foot only. Then switch partners and repeat one round."
    ],
    "coaching_points": [
      "Plant foot next to the ball, toes pointing at your partner.",
      "Lock your ankle and hit the middle of the ball with the inside of your foot. Follow through at your partner.",
      "Receiver: on your toes, stop it with the inside of your foot, first touch toward the next gate.",
      "Say your partner's name before you pass."
    ],
    "progressions": {
      "easier": [
        "Gates 4 yd wide.",
        "Partners closer (3 yd).",
        "Stop the ball fully before passing."
      ],
      "harder": [
        "2 touches max.",
        "One pair (no ball) are \"gate goalies\" who block gates with their feet.",
        "Partners farther apart (6-8 yd)."
      ],
      "fewer_players": "Odd number? Make one group of 3 that passes in a triangle through the gates, or the coach partners with one player."
    },
    "common_mistakes": [
      {
        "mistake": "Toe-poking the ball.",
        "fix": "\"Show me the flat side of your foot. Pass like a mini-golf putter.\""
      },
      {
        "mistake": "Pass too hard or too soft.",
        "fix": "\"Pass it so your partner can stop it with one touch.\""
      },
      {
        "mistake": "Standing still after passing.",
        "fix": "\"Pass and move! Find the next gate before the ball gets there.\""
      },
      {
        "mistake": "Ball bounces off the receiver.",
        "fix": "\"Soft foot, like catching an egg.\""
      }
    ],
    "legend": [
      {
        "symbol": "pass",
        "meaning": "PASS"
      },
      {
        "symbol": "run",
        "meaning": "RUN"
      },
      {
        "symbol": "dribble",
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
        "symbol": "player",
        "meaning": "PLAYER"
      }
    ],
    "age_band": "U8",
    "difficulty": "BEGINNER",
    "players_label": "10",
    "focus": "PASSING"
  },
  {
    "number": 2,
    "name": "Traffic Lights (Stop & Go)",
    "block": "Warm-up",
    "time_block": "0:00-0:10 · 10 min",
    "purpose": "Keeping the ball close, stopping it fast, looking up, and listening. It also warms up legs and gets lots of touches.",
    "setup": [
      "Area: the main grid, 25 x 25 yards, with a cone on each corner.",
      "The 11 gates for the next drill can already be set out inside. Players just dribble around them.",
      "Equipment: 1 ball per player, 4 corner cones.",
      "Players: all 10 inside the grid, each with a ball. Coach stands on one edge where everyone can see and hear.",
      "Note: the picture shows a circle with red/amber/green cones. We use the square main grid; colored cones are optional."
    ],
    "diagram": {
      "kind": "svg",
      "players": [
        {
          "id": "P",
          "x": 50,
          "y": 50,
          "label": "P"
        }
      ],
      "cones": [
        {
          "x": 15,
          "y": 15
        },
        {
          "x": 85,
          "y": 15
        },
        {
          "x": 15,
          "y": 85
        },
        {
          "x": 85,
          "y": 85
        }
      ],
      "distances": [],
      "strokes": [
        {
          "type": "dribble",
          "from": "P",
          "to": "P",
          "path": [
            [
              50,
              50
            ],
            [
              60,
              40
            ],
            [
              55,
              60
            ]
          ]
        }
      ],
      "ballAt": "P",
      "note": "All players dribble in 25x25 main grid"
    },
    "diagram_credit": "Football/Soccer: Traffic Lights (Technical: Dribbling and RWB, Beginner) (SportSessionPlanner.com) — https://www.sportsessionplanner.com/s/XLRO/Traffic-Lights.html",
    "how_to_run": [
      "Arrival (0:00-0:03): free dribble in the grid. Start as soon as 2 kids show up; late arrivals just join in. Ask \"How many touches can you get?\"",
      "Call the lights (0:03-0:10): GREEN = dribble fast. YELLOW = slow, tiny touches. RED = stop, foot on top of the ball.",
      "Every 1-2 minutes add one new call: TURN! = pull the ball back and go the other way. KNEE! (or ELBOW!, NOSE!) = stop the ball with that body part. GATE! = dribble through a gate.",
      "Between rounds (15 sec): 20 toe taps, then 10 side-to-side \"windshield wipers.\"",
      "Keep it fun: the last player to stop on RED does 5 toe taps. Nobody sits out."
    ],
    "coaching_points": [
      "Tiny touches: \"Keep the ball on a leash.\"",
      "Look up between touches: \"Find the empty space.\"",
      "Use both feet and all parts: inside, outside, and the sole."
    ],
    "progressions": {
      "easier": [
        "Use only GREEN and RED.",
        "Walking-pace dribble.",
        "Bigger space."
      ],
      "harder": [
        "Add a fake call (\"BLUE!\" = do nothing).",
        "PURPLE = left foot only.",
        "Coach is a \"police car\" who tries to tap balls away."
      ],
      "fewer_players": "Shrink the grid to about 20 x 20 yd so it still feels busy."
    },
    "common_mistakes": [
      {
        "mistake": "Kicking the ball far ahead and chasing it.",
        "fix": "\"Tiny touches. Every step touches the ball.\""
      },
      {
        "mistake": "Head down, bumping into teammates.",
        "fix": "Hold up fingers: \"How many fingers am I showing?\""
      },
      {
        "mistake": "Stopping the ball with a hand or heel.",
        "fix": "Demo the sole stop: \"Foot on top, like a lid on a jar.\""
      }
    ],
    "legend": [
      {
        "symbol": "pass",
        "meaning": "PASS"
      },
      {
        "symbol": "run",
        "meaning": "RUN"
      },
      {
        "symbol": "dribble",
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
        "symbol": "player",
        "meaning": "PLAYER"
      }
    ],
    "age_band": "U8",
    "difficulty": "BEGINNER",
    "players_label": "10",
    "focus": "WARM-UP"
  }
];
