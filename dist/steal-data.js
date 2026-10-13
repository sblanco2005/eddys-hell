/* Eddy's Hell × Steal — exercise library, gear and split rules.
 * Ported from the Steal app (flora-dove-finch-cobalt.grok.me). 93 moves, each with a
 * demo YouTube clip + start timestamp. Pure data, no DOM. */
(function () {
  "use strict";
  window.StealData = {
    GEAR: [
      {
        "id": "bar",
        "label": "Bar and rack",
        "items": [
          {
            "id": "barbell",
            "label": "Barbell"
          },
          {
            "id": "rack",
            "label": "Squat / power rack"
          },
          {
            "id": "ez-bar",
            "label": "EZ bar"
          },
          {
            "id": "trap-bar",
            "label": "Trap bar"
          },
          {
            "id": "smith",
            "label": "Smith machine"
          },
          {
            "id": "landmine",
            "label": "Landmine"
          }
        ]
      },
      {
        "id": "benches",
        "label": "Benches",
        "items": [
          {
            "id": "bench",
            "label": "Flat bench"
          },
          {
            "id": "incline-bench",
            "label": "Incline bench"
          },
          {
            "id": "preacher",
            "label": "Preacher bench"
          }
        ]
      },
      {
        "id": "free",
        "label": "Free weights",
        "items": [
          {
            "id": "dumbbells",
            "label": "Dumbbells"
          },
          {
            "id": "kettlebells",
            "label": "Kettlebells"
          },
          {
            "id": "bands",
            "label": "Bands"
          }
        ]
      },
      {
        "id": "cables",
        "label": "Cables and bars",
        "items": [
          {
            "id": "cables",
            "label": "Cable station"
          },
          {
            "id": "lat-pulldown",
            "label": "Lat pulldown"
          },
          {
            "id": "pullup-bar",
            "label": "Pull-up bar"
          },
          {
            "id": "dip-station",
            "label": "Dip station"
          }
        ]
      },
      {
        "id": "machines",
        "label": "Machines",
        "items": [
          {
            "id": "chest-press-machine",
            "label": "Chest press machine"
          },
          {
            "id": "incline-press-machine",
            "label": "Incline press machine"
          },
          {
            "id": "pec-deck",
            "label": "Pec deck"
          },
          {
            "id": "shoulder-press-machine",
            "label": "Shoulder press machine"
          },
          {
            "id": "row-machine",
            "label": "Seated row"
          },
          {
            "id": "leg-press",
            "label": "Leg press"
          },
          {
            "id": "hack-squat",
            "label": "Hack squat"
          },
          {
            "id": "leg-curl",
            "label": "Leg curl"
          },
          {
            "id": "leg-extension",
            "label": "Leg extension"
          },
          {
            "id": "calf-raise",
            "label": "Calf raise"
          }
        ]
      },
      {
        "id": "hyrox",
        "label": "Hyrox / cardio",
        "items": [
          {
            "id": "rower",
            "label": "Rower"
          },
          {
            "id": "assault-runner",
            "label": "Assault runner"
          },
          {
            "id": "slam-ball",
            "label": "Slam balls"
          },
          {
            "id": "jump-box",
            "label": "Jump box"
          },
          {
            "id": "ski-erg",
            "label": "SkiErg"
          },
          {
            "id": "sled",
            "label": "Sled"
          }
        ]
      }
    ],
    SPLITS: [
      {
        "id": "push",
        "label": "Push",
        "blurb": "Chest, shoulders, triceps"
      },
      {
        "id": "pull",
        "label": "Pull",
        "blurb": "Back and biceps"
      },
      {
        "id": "legs",
        "label": "Legs",
        "blurb": "Squat, hinge, calves"
      },
      {
        "id": "full",
        "label": "Full",
        "blurb": "One heavy from each"
      },
      {
        "id": "hyrox",
        "label": "Hyrox",
        "blurb": "Race stations and engine work"
      }
    ],
    MUSCLES: ["chest","shoulders","triceps","back","biceps","quads","hamstrings","glutes","calves","core","cardio"],
    SPLIT_RULES: {"push":[["bb-bench","smith-bench","chest-press","db-bench","floor-press","pushup"],["bb-incline","bb-incline-flat","incline-machine","db-incline","db-incline-flat","cable-press"],["bb-ohp","db-ohp","db-ohp-stand","shoulder-machine","landmine-press"],["cable-fly","pec-deck","db-fly"],["cable-lateral","db-lateral","band-lateral"],["dips","cable-pushdown","french-ez","french-db","overhead-ez","skull-ez","skull-bb","db-overhead","bench-dip"]],"pull":[["pullup","chinup","rack-pullup","lat-pd"],["bb-row","seated-row","cable-row","chest-db-row","db-row","band-row"],["bb-dead","trap-dead","bb-rdl","db-rdl"],["chest-db-row","db-row","cable-row","band-row"],["ez-curl","bb-curl","preacher-curl","db-curl","cable-curl"],["hanging-knee","cable-crunch","plank"]],"legs":[["bb-squat","smith-squat","hack","leg-press","goblet","bw-squat"],["bb-dead","trap-dead","bb-rdl","db-rdl","leg-curl"],["split-squat","db-lunge","leg-ext"],["hip-thrust","glute-bridge"],["leg-curl","db-rdl"],["machine-calf","bb-calf","db-calf","bw-calf"]],"full":[["bb-squat","smith-squat","hack","leg-press","goblet","bw-squat"],["bb-bench","smith-bench","chest-press","db-bench","pushup"],["bb-row","seated-row","cable-row","db-row","band-row"],["bb-dead","bb-rdl","trap-dead","db-rdl"],["bb-ohp","db-ohp","db-ohp-stand","shoulder-machine"],["plank","cable-crunch","hanging-knee"]],"hyrox":[["assault-run"],["row"],["ski"],["slam"],["wall-ball"],["box-jump","box-step"],["sled-push"],["farmers-kb","farmers-db"],["bb-jump","burpee"],["kb-swing","db-lunge"]]},
    LIB: [
      {"id":"bb-bench","name":"Barbell bench press","muscle":"chest","equipment":"barbell","needs":["rack","barbell","bench"],"isBarbell":true,"sets":4,"reps":"5-8","videoId":"ysUTNll8JQ8","start":59},
      {"id":"smith-bench","name":"Smith bench press","muscle":"chest","equipment":"smith","needs":["smith","bench"],"isBarbell":false,"sets":4,"reps":"6-10","videoId":"rT7DgCr-3pg","start":28},
      {"id":"chest-press","name":"Chest press machine","muscle":"chest","equipment":"machine","needs":["chest-press-machine"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"xUm0BiZCWlQ","start":20},
      {"id":"db-bench","name":"Dumbbell bench press","muscle":"chest","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"VmB1G1K7v94","start":20},
      {"id":"floor-press","name":"Dumbbell floor press","muscle":"chest","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"VmB1G1K7v94","start":20},
      {"id":"pushup","name":"Push-up","muscle":"chest","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":3,"reps":"8-15","videoId":"IODxDxX7oi4","start":32},
      {"id":"bb-incline","name":"Incline barbell press","muscle":"chest","equipment":"barbell","needs":["rack","barbell","incline-bench"],"isBarbell":true,"sets":3,"reps":"6-10","videoId":"SrqOu55lrYU","start":23},
      {"id":"bb-incline-flat","name":"Incline barbell press","muscle":"chest","equipment":"barbell","needs":["rack","barbell","bench"],"isBarbell":true,"sets":3,"reps":"6-10","videoId":"SrqOu55lrYU","start":23},
      {"id":"incline-machine","name":"Incline press machine","muscle":"chest","equipment":"machine","needs":["incline-press-machine"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"ig0NyNlSce4","start":15},
      {"id":"db-incline","name":"Incline dumbbell press","muscle":"chest","equipment":"dumbbells","needs":["dumbbells","incline-bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"8iPEnn-ltC8","start":15},
      {"id":"db-incline-flat","name":"Incline dumbbell press","muscle":"chest","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"8iPEnn-ltC8","start":15},
      {"id":"cable-press","name":"Low-to-high cable press","muscle":"chest","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"Iwe6AmxVf7o","start":20},
      {"id":"cable-fly","name":"Cable fly","muscle":"chest","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"Iwe6AmxVf7o","start":20},
      {"id":"pec-deck","name":"Pec deck","muscle":"chest","equipment":"machine","needs":["pec-deck"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"g3T7LsEeDWQ","start":0},
      {"id":"db-fly","name":"Dumbbell fly","muscle":"chest","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"eozdVDA78K0","start":20},
      {"id":"bb-decline","name":"Decline barbell press","muscle":"chest","equipment":"barbell","needs":["rack","barbell","bench"],"isBarbell":true,"sets":3,"reps":"6-10","videoId":"LfyQBUKR8SE","start":21},
      {"id":"db-decline","name":"Decline dumbbell press","muscle":"chest","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"LfyQBUKR8SE","start":21},
      {"id":"bb-ohp","name":"Standing barbell press","muscle":"shoulders","equipment":"barbell","needs":["rack","barbell"],"isBarbell":true,"sets":3,"reps":"5-8","videoId":"2yjwXTZQDDI","start":20},
      {"id":"db-ohp","name":"Seated dumbbell press","muscle":"shoulders","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"qEwKCR5JCog","start":15},
      {"id":"db-ohp-stand","name":"Standing dumbbell press","muscle":"shoulders","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"qEwKCR5JCog","start":15},
      {"id":"shoulder-machine","name":"Shoulder press machine","muscle":"shoulders","equipment":"machine","needs":["shoulder-press-machine"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"qEwKCR5JCog","start":15},
      {"id":"landmine-press","name":"Landmine press","muscle":"shoulders","equipment":"landmine","needs":["landmine","barbell"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"gH7PDepHNck","start":0},
      {"id":"cable-lateral","name":"Cable lateral raise","muscle":"shoulders","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"3VcKaXpzqRo","start":8},
      {"id":"db-lateral","name":"Dumbbell lateral raise","muscle":"shoulders","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"3VcKaXpzqRo","start":8},
      {"id":"band-lateral","name":"Band lateral raise","muscle":"shoulders","equipment":"bands","needs":["bands"],"isBarbell":false,"sets":3,"reps":"12-20","videoId":"3VcKaXpzqRo","start":8},
      {"id":"face-pull","name":"Face pull","muscle":"shoulders","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"rep-qVOkqgk","start":34},
      {"id":"db-rear-fly","name":"Rear delt fly","muscle":"shoulders","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"LsT-bR_zxLo","start":0},
      {"id":"dips","name":"Dip","muscle":"triceps","equipment":"dip-station","needs":["dip-station"],"isBarbell":false,"sets":3,"reps":"6-12","videoId":"2z8JmcrW-As","start":15},
      {"id":"cable-pushdown","name":"Cable pushdown","muscle":"triceps","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"2-LAMcpzODU","start":12},
      {"id":"skull-ez","name":"EZ-bar skull crusher","muscle":"triceps","equipment":"ez-bar","needs":["ez-bar","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"d_KZxkY_0cM","start":15},
      {"id":"skull-bb","name":"Barbell skull crusher","muscle":"triceps","equipment":"barbell","needs":["barbell","bench"],"isBarbell":true,"sets":3,"reps":"8-12","videoId":"d_KZxkY_0cM","start":15},
      {"id":"db-overhead","name":"Dumbbell overhead extension","muscle":"triceps","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"d_KZxkY_0cM","start":15},
      {"id":"bench-dip","name":"Bench dip","muscle":"triceps","equipment":"bench","needs":["bench"],"isBarbell":false,"sets":3,"reps":"8-15","videoId":"2z8JmcrW-As","start":15},
      {"id":"close-grip","name":"Close-grip bench press","muscle":"triceps","equipment":"barbell","needs":["rack","barbell","bench"],"isBarbell":true,"sets":3,"reps":"6-10","videoId":"UYJsFzqdgK4","start":20},
      {"id":"french-ez","name":"EZ-bar French press","muscle":"triceps","equipment":"ez-bar","needs":["ez-bar","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"d_KZxkY_0cM","start":15},
      {"id":"french-db","name":"Dumbbell French press","muscle":"triceps","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"MO_03opCc0g","start":15},
      {"id":"overhead-ez","name":"Overhead EZ-bar extension","muscle":"triceps","equipment":"ez-bar","needs":["ez-bar"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"priRWVpDV8c","start":12},
      {"id":"bb-squat","name":"Barbell back squat","muscle":"quads","equipment":"barbell","needs":["rack","barbell"],"isBarbell":true,"sets":4,"reps":"5-8","videoId":"ultWZbUMPL8","start":25},
      {"id":"smith-squat","name":"Smith squat","muscle":"quads","equipment":"smith","needs":["smith"],"isBarbell":false,"sets":4,"reps":"6-10","videoId":"ultWZbUMPL8","start":25},
      {"id":"hack","name":"Hack squat","muscle":"quads","equipment":"machine","needs":["hack-squat"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"rYgNArpwE7E","start":10},
      {"id":"leg-press","name":"Leg press","muscle":"quads","equipment":"machine","needs":["leg-press"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"IZxyjW7MPJQ","start":20},
      {"id":"goblet","name":"Goblet squat","muscle":"quads","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"MeIiIdhvXT4","start":20},
      {"id":"split-squat","name":"Bulgarian split squat","muscle":"quads","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"2C-uNgKwPLE","start":12},
      {"id":"bw-squat","name":"Bodyweight squat","muscle":"quads","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":3,"reps":"12-20","videoId":"aclHkVaku9U","start":10},
      {"id":"front-squat","name":"Front squat","muscle":"quads","equipment":"barbell","needs":["rack","barbell"],"isBarbell":true,"sets":3,"reps":"5-8","videoId":"tlfahNdNPPI","start":25},
      {"id":"leg-ext","name":"Leg extension","muscle":"quads","equipment":"machine","needs":["leg-extension"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"rYgNArpwE7E","start":10},
      {"id":"bb-dead","name":"Conventional deadlift","muscle":"hamstrings","equipment":"barbell","needs":["barbell"],"isBarbell":true,"sets":4,"reps":"5-8","videoId":"n454SpMZRt8","start":106},
      {"id":"trap-dead","name":"Trap-bar deadlift","muscle":"hamstrings","equipment":"trap-bar","needs":["trap-bar"],"isBarbell":true,"sets":4,"reps":"5-8","videoId":"TU2xZ7s4jus","start":20},
      {"id":"bb-rdl","name":"Romanian deadlift","muscle":"hamstrings","equipment":"barbell","needs":["barbell"],"isBarbell":true,"sets":3,"reps":"6-10","videoId":"jEy_czb3RKA","start":20},
      {"id":"db-rdl","name":"Dumbbell RDL","muscle":"hamstrings","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"jEy_czb3RKA","start":20},
      {"id":"good-morning","name":"Good morning","muscle":"hamstrings","equipment":"barbell","needs":["rack","barbell"],"isBarbell":true,"sets":3,"reps":"8-12","videoId":"f23vXjoG2e8","start":20},
      {"id":"leg-curl","name":"Lying leg curl","muscle":"hamstrings","equipment":"machine","needs":["leg-curl"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"1Tq3QdYUuHs","start":10},
      {"id":"db-lunge","name":"Walking lunge","muscle":"glutes","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"D7KaRcUTQeE","start":15},
      {"id":"hip-thrust","name":"Barbell hip thrust","muscle":"glutes","equipment":"barbell","needs":["barbell","bench"],"isBarbell":true,"sets":3,"reps":"8-12","videoId":"xDmFkJxPzeM","start":30},
      {"id":"glute-bridge","name":"Glute bridge","muscle":"glutes","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"OUgsJ8-Vi0E","start":10},
      {"id":"pullup","name":"Pull-up","muscle":"back","equipment":"pullup-bar","needs":["pullup-bar"],"isBarbell":false,"sets":3,"reps":"5-10","videoId":"ZLGfThbM-dE","start":0},
      {"id":"rack-pullup","name":"Rack pull-up","muscle":"back","equipment":"rack","needs":["rack"],"isBarbell":false,"sets":3,"reps":"5-10","videoId":"eGo4IYlbE5g","start":20},
      {"id":"lat-pd","name":"Lat pulldown","muscle":"back","equipment":"lat-pulldown","needs":["lat-pulldown"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"CAwf7n6Luuc","start":15},
      {"id":"bb-row","name":"Barbell row","muscle":"back","equipment":"barbell","needs":["barbell"],"isBarbell":true,"sets":3,"reps":"6-10","videoId":"dcFqlPnqlfo","start":0},
      {"id":"seated-row","name":"Seated row","muscle":"back","equipment":"machine","needs":["row-machine"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"GZbfZ033f74","start":12},
      {"id":"cable-row","name":"Cable row","muscle":"back","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"GZbfZ033f74","start":12},
      {"id":"chest-db-row","name":"Chest-supported dumbbell row","muscle":"back","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"fgSyNdEsqlM","start":0},
      {"id":"db-row","name":"One-arm dumbbell row","muscle":"back","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"pYcpY20QaE8","start":15},
      {"id":"band-row","name":"Band row","muscle":"back","equipment":"bands","needs":["bands"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"pYcpY20QaE8","start":15},
      {"id":"chinup","name":"Chin-up","muscle":"back","equipment":"pullup-bar","needs":["pullup-bar"],"isBarbell":false,"sets":3,"reps":"5-10","videoId":"bZ6Ysk9jf6E","start":15},
      {"id":"bb-shrug","name":"Barbell shrug","muscle":"back","equipment":"barbell","needs":["barbell"],"isBarbell":true,"sets":3,"reps":"10-15","videoId":"jTVbilkxSAk","start":20},
      {"id":"bb-curl","name":"Barbell curl","muscle":"biceps","equipment":"barbell","needs":["barbell"],"isBarbell":true,"sets":3,"reps":"8-12","videoId":"ykJmrZ5v0Oo","start":12},
      {"id":"ez-curl","name":"EZ-bar curl","muscle":"biceps","equipment":"ez-bar","needs":["ez-bar"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"ykJmrZ5v0Oo","start":12},
      {"id":"db-curl","name":"Dumbbell curl","muscle":"biceps","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"ykJmrZ5v0Oo","start":12},
      {"id":"cable-curl","name":"Cable curl","muscle":"biceps","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"ykJmrZ5v0Oo","start":12},
      {"id":"preacher-curl","name":"Preacher curl","muscle":"biceps","equipment":"ez-bar","needs":["ez-bar","preacher"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"I90Pu35wfVY","start":8},
      {"id":"hammer-curl","name":"Hammer curl","muscle":"biceps","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"zC3nLlEvin4","start":15},
      {"id":"incline-curl","name":"Incline dumbbell curl","muscle":"biceps","equipment":"dumbbells","needs":["dumbbells","bench"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"soxrZlIl35U","start":20},
      {"id":"machine-calf","name":"Calf raise machine","muscle":"calves","equipment":"machine","needs":["calf-raise"],"isBarbell":false,"sets":3,"reps":"10-15","videoId":"-M4-G8p8fmc","start":10},
      {"id":"bb-calf","name":"Standing calf raise","muscle":"calves","equipment":"barbell","needs":["rack","barbell"],"isBarbell":true,"sets":3,"reps":"10-15","videoId":"-M4-G8p8fmc","start":10},
      {"id":"db-calf","name":"Dumbbell calf raise","muscle":"calves","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"-M4-G8p8fmc","start":10},
      {"id":"bw-calf","name":"Single-leg calf raise","muscle":"calves","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":3,"reps":"12-20","videoId":"-M4-G8p8fmc","start":10},
      {"id":"cable-crunch","name":"Cable crunch","muscle":"core","equipment":"cables","needs":["cables"],"isBarbell":false,"sets":3,"reps":"12-15","videoId":"tQgNAIzcjlk","start":15},
      {"id":"hanging-knee","name":"Hanging knee raise","muscle":"core","equipment":"pullup-bar","needs":["pullup-bar"],"isBarbell":false,"sets":3,"reps":"8-12","videoId":"Pr1ieGZ5atk","start":10},
      {"id":"plank","name":"Plank","muscle":"core","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":3,"reps":"30-45s","videoId":"ASdvN_XEl_c","start":10},
      {"id":"assault-run","name":"Assault runner intervals","muscle":"cardio","equipment":"assault-runner","needs":["assault-runner"],"isBarbell":false,"sets":5,"reps":"500m","videoId":"LU6mPPLSc_c","start":8},
      {"id":"row","name":"Row intervals","muscle":"cardio","equipment":"rower","needs":["rower"],"isBarbell":false,"sets":5,"reps":"500m","videoId":"4zWu1yuJ0_g","start":0},
      {"id":"ski","name":"SkiErg intervals","muscle":"cardio","equipment":"ski-erg","needs":["ski-erg"],"isBarbell":false,"sets":4,"reps":"500m","videoId":"B0lIgT5PHc8","start":0},
      {"id":"slam","name":"Slam ball","muscle":"cardio","equipment":"slam-ball","needs":["slam-ball"],"isBarbell":false,"sets":4,"reps":"15","videoId":"ePo39a3mSfk","start":0},
      {"id":"wall-ball","name":"Wall ball","muscle":"cardio","equipment":"slam-ball","needs":["slam-ball"],"isBarbell":false,"sets":4,"reps":"20","videoId":"fpUD0mcFp_0","start":0},
      {"id":"box-jump","name":"Box jump","muscle":"cardio","equipment":"jump-box","needs":["jump-box"],"isBarbell":false,"sets":4,"reps":"10","videoId":"NBY9-kTuHEk","start":0},
      {"id":"box-step","name":"Box step-over","muscle":"cardio","equipment":"jump-box","needs":["jump-box"],"isBarbell":false,"sets":4,"reps":"12","videoId":"NBY9-kTuHEk","start":0},
      {"id":"sled-push","name":"Sled push","muscle":"cardio","equipment":"sled","needs":["sled"],"isBarbell":false,"sets":4,"reps":"20m","videoId":"yKAxMSmHrd0","start":0},
      {"id":"farmers-kb","name":"Farmers carry","muscle":"cardio","equipment":"kettlebells","needs":["kettlebells"],"isBarbell":false,"sets":4,"reps":"40m","videoId":"p5MNNosenJc","start":0},
      {"id":"farmers-db","name":"Farmers carry","muscle":"cardio","equipment":"dumbbells","needs":["dumbbells"],"isBarbell":false,"sets":4,"reps":"40m","videoId":"p5MNNosenJc","start":0},
      {"id":"bb-jump","name":"Burpee broad jump","muscle":"cardio","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":4,"reps":"20m","videoId":"W5gc1Inyha0","start":0},
      {"id":"burpee","name":"Burpee","muscle":"cardio","equipment":"bodyweight","needs":["bodyweight"],"isBarbell":false,"sets":4,"reps":"10","videoId":"auBLPXO8Fww","start":0},
      {"id":"kb-swing","name":"Kettlebell swing","muscle":"cardio","equipment":"kettlebells","needs":["kettlebells"],"isBarbell":false,"sets":4,"reps":"15","videoId":"vdezTMulJ-k","start":0}
    ],
  };

  /* p11: expanded library (no demo clips). pattern = movement pattern for Replace suggestions. */
  window.StealData.LIB.push(
    {"id": "x-barbell-lunge", "name": "Barbell lunge", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "lunge"},
    {"id": "x-barbell-walking-lunge", "name": "Barbell walking lunge", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-barbell-reverse-lunge", "name": "Barbell reverse lunge", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "lunge"},
    {"id": "x-barbell-split-squat", "name": "Barbell split squat", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "lunge"},
    {"id": "x-barbell-step-up", "name": "Barbell step-up", "muscle": "quads", "equipment": "barbell", "needs": ["barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "lunge"},
    {"id": "x-barbell-bulgarian-split-squat", "name": "Barbell Bulgarian split squat", "muscle": "quads", "equipment": "barbell", "needs": ["barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "lunge"},
    {"id": "x-dumbbell-lunge", "name": "Dumbbell lunge", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-dumbbell-walking-lunge", "name": "Dumbbell walking lunge", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-dumbbell-reverse-lunge", "name": "Dumbbell reverse lunge", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-dumbbell-step-up", "name": "Dumbbell step-up", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-dumbbell-bulgarian-split-squat", "name": "Dumbbell Bulgarian split squat", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-dumbbell-split-squat", "name": "Dumbbell split squat", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-lateral-lunge", "name": "Lateral lunge", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-curtsy-lunge", "name": "Curtsy lunge", "muscle": "glutes", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-bodyweight-lunge", "name": "Bodyweight lunge", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "lunge"},
    {"id": "x-reverse-lunge", "name": "Reverse lunge", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "lunge"},
    {"id": "x-jumping-lunge", "name": "Jumping lunge", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-kettlebell-lunge", "name": "Kettlebell lunge", "muscle": "quads", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-kettlebell-goblet-squat", "name": "Kettlebell goblet squat", "muscle": "quads", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-smith-lunge", "name": "Smith lunge", "muscle": "quads", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-smith-split-squat", "name": "Smith split squat", "muscle": "quads", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "lunge"},
    {"id": "x-pause-squat", "name": "Pause squat", "muscle": "quads", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "squat"},
    {"id": "x-box-squat", "name": "Box squat", "muscle": "quads", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "squat"},
    {"id": "x-safety-bar-squat", "name": "Safety bar squat", "muscle": "quads", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "6", "pattern": "squat"},
    {"id": "x-zercher-squat", "name": "Zercher squat", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "6", "pattern": "squat"},
    {"id": "x-high-bar-squat", "name": "High-bar squat", "muscle": "quads", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "6", "pattern": "squat"},
    {"id": "x-low-bar-squat", "name": "Low-bar squat", "muscle": "quads", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "squat"},
    {"id": "x-overhead-squat", "name": "Overhead squat", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "squat"},
    {"id": "x-dumbbell-squat", "name": "Dumbbell squat", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-sumo-squat", "name": "Sumo squat", "muscle": "glutes", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-landmine-squat", "name": "Landmine squat", "muscle": "quads", "equipment": "landmine", "needs": ["landmine", "barbell"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-smith-front-squat", "name": "Smith front squat", "muscle": "quads", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "squat"},
    {"id": "x-belt-squat", "name": "Belt squat", "muscle": "quads", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-pendulum-squat", "name": "Pendulum squat", "muscle": "quads", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-reverse-hack-squat", "name": "Reverse hack squat", "muscle": "glutes", "equipment": "machine", "needs": ["hack-squat"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-single-leg-leg-press", "name": "Single-leg leg press", "muscle": "quads", "equipment": "machine", "needs": ["leg-press"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-pistol-squat", "name": "Pistol squat", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "6", "pattern": "squat"},
    {"id": "x-jump-squat", "name": "Jump squat", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-wall-sit", "name": "Wall sit", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "45s", "pattern": "squat"},
    {"id": "x-sissy-squat", "name": "Sissy squat", "muscle": "quads", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "squat"},
    {"id": "x-single-leg-leg-extension", "name": "Single-leg leg extension", "muscle": "quads", "equipment": "machine", "needs": ["leg-extension"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "knee-ext"},
    {"id": "x-seated-leg-curl", "name": "Seated leg curl", "muscle": "hamstrings", "equipment": "machine", "needs": ["leg-curl"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "knee-flex"},
    {"id": "x-single-leg-leg-curl", "name": "Single-leg leg curl", "muscle": "hamstrings", "equipment": "machine", "needs": ["leg-curl"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "knee-flex"},
    {"id": "x-nordic-curl", "name": "Nordic curl", "muscle": "hamstrings", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "6", "pattern": "knee-flex"},
    {"id": "x-stability-ball-leg-curl", "name": "Stability ball leg curl", "muscle": "hamstrings", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "knee-flex"},
    {"id": "x-sumo-deadlift", "name": "Sumo deadlift", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "hinge"},
    {"id": "x-deficit-deadlift", "name": "Deficit deadlift", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "hinge"},
    {"id": "x-rack-pull", "name": "Rack pull", "muscle": "back", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "hinge"},
    {"id": "x-stiff-leg-deadlift", "name": "Stiff-leg deadlift", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "hinge"},
    {"id": "x-single-leg-romanian-deadlift", "name": "Single-leg Romanian deadlift", "muscle": "hamstrings", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hinge"},
    {"id": "x-kettlebell-romanian-deadlift", "name": "Kettlebell Romanian deadlift", "muscle": "hamstrings", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hinge"},
    {"id": "x-kettlebell-deadlift", "name": "Kettlebell deadlift", "muscle": "hamstrings", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hinge"},
    {"id": "x-dumbbell-deadlift", "name": "Dumbbell deadlift", "muscle": "hamstrings", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hinge"},
    {"id": "x-smith-romanian-deadlift", "name": "Smith Romanian deadlift", "muscle": "hamstrings", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hinge"},
    {"id": "x-cable-pull-through", "name": "Cable pull-through", "muscle": "glutes", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hinge"},
    {"id": "x-back-extension", "name": "Back extension", "muscle": "hamstrings", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hinge"},
    {"id": "x-45-degree-hyperextension", "name": "45-degree hyperextension", "muscle": "hamstrings", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hinge"},
    {"id": "x-reverse-hyperextension", "name": "Reverse hyperextension", "muscle": "glutes", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hinge"},
    {"id": "x-glute-ham-raise", "name": "Glute-ham raise", "muscle": "hamstrings", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "knee-flex"},
    {"id": "x-dumbbell-hip-thrust", "name": "Dumbbell hip thrust", "muscle": "glutes", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hip-ext"},
    {"id": "x-smith-hip-thrust", "name": "Smith hip thrust", "muscle": "glutes", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hip-ext"},
    {"id": "x-hip-thrust-machine", "name": "Hip thrust machine", "muscle": "glutes", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hip-ext"},
    {"id": "x-single-leg-hip-thrust", "name": "Single-leg hip thrust", "muscle": "glutes", "equipment": "bodyweight", "needs": ["bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "hip-ext"},
    {"id": "x-barbell-glute-bridge", "name": "Barbell glute bridge", "muscle": "glutes", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "10", "pattern": "hip-ext"},
    {"id": "x-single-leg-glute-bridge", "name": "Single-leg glute bridge", "muscle": "glutes", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hip-ext"},
    {"id": "x-cable-kickback", "name": "Cable kickback", "muscle": "glutes", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hip-ext"},
    {"id": "x-glute-kickback-machine", "name": "Glute kickback machine", "muscle": "glutes", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "hip-ext"},
    {"id": "x-donkey-kick", "name": "Donkey kick", "muscle": "glutes", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "hip-ext"},
    {"id": "x-hip-abduction-machine", "name": "Hip abduction machine", "muscle": "glutes", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "abduction"},
    {"id": "x-hip-adduction-machine", "name": "Hip adduction machine", "muscle": "quads", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "adduction"},
    {"id": "x-banded-lateral-walk", "name": "Banded lateral walk", "muscle": "glutes", "equipment": "bands", "needs": ["bands"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "abduction"},
    {"id": "x-cable-hip-abduction", "name": "Cable hip abduction", "muscle": "glutes", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "abduction"},
    {"id": "x-frog-pump", "name": "Frog pump", "muscle": "glutes", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "20", "pattern": "hip-ext"},
    {"id": "x-seated-calf-raise", "name": "Seated calf raise", "muscle": "calves", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "calf"},
    {"id": "x-leg-press-calf-raise", "name": "Leg press calf raise", "muscle": "calves", "equipment": "machine", "needs": ["leg-press"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "calf"},
    {"id": "x-smith-calf-raise", "name": "Smith calf raise", "muscle": "calves", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "calf"},
    {"id": "x-barbell-calf-raise", "name": "Barbell calf raise", "muscle": "calves", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "12", "pattern": "calf"},
    {"id": "x-donkey-calf-raise", "name": "Donkey calf raise", "muscle": "calves", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "calf"},
    {"id": "x-tibialis-raise", "name": "Tibialis raise", "muscle": "calves", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "calf"},
    {"id": "x-close-grip-barbell-bench-press", "name": "Close-grip barbell bench press", "muscle": "triceps", "equipment": "barbell", "needs": ["rack", "barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "h-push"},
    {"id": "x-paused-bench-press", "name": "Paused bench press", "muscle": "chest", "equipment": "barbell", "needs": ["rack", "barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "h-push"},
    {"id": "x-floor-press", "name": "Floor press", "muscle": "chest", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "h-push"},
    {"id": "x-spoto-press", "name": "Spoto press", "muscle": "chest", "equipment": "barbell", "needs": ["rack", "barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "6", "pattern": "h-push"},
    {"id": "x-smith-incline-press", "name": "Smith incline press", "muscle": "chest", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "incline-push"},
    {"id": "x-smith-decline-press", "name": "Smith decline press", "muscle": "chest", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "h-push"},
    {"id": "x-neutral-grip-dumbbell-press", "name": "Neutral-grip dumbbell press", "muscle": "chest", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-single-arm-dumbbell-bench-press", "name": "Single-arm dumbbell bench press", "muscle": "chest", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-dumbbell-squeeze-press", "name": "Dumbbell squeeze press", "muscle": "chest", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-decline-push-up", "name": "Decline push-up", "muscle": "chest", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "h-push"},
    {"id": "x-incline-push-up", "name": "Incline push-up", "muscle": "chest", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "h-push"},
    {"id": "x-diamond-push-up", "name": "Diamond push-up", "muscle": "triceps", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "h-push"},
    {"id": "x-weighted-push-up", "name": "Weighted push-up", "muscle": "chest", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-deficit-push-up", "name": "Deficit push-up", "muscle": "chest", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-chest-dip", "name": "Chest dip", "muscle": "chest", "equipment": "dip-station", "needs": ["dip-station"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-machine-fly", "name": "Machine fly", "muscle": "chest", "equipment": "machine", "needs": ["pec-deck"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "fly"},
    {"id": "x-incline-dumbbell-fly", "name": "Incline dumbbell fly", "muscle": "chest", "equipment": "dumbbells", "needs": ["dumbbells", "incline-bench"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "fly"},
    {"id": "x-high-to-low-cable-fly", "name": "High-to-low cable fly", "muscle": "chest", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "fly"},
    {"id": "x-low-to-high-cable-fly", "name": "Low-to-high cable fly", "muscle": "chest", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "fly"},
    {"id": "x-single-arm-cable-fly", "name": "Single-arm cable fly", "muscle": "chest", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "fly"},
    {"id": "x-band-chest-press", "name": "Band chest press", "muscle": "chest", "equipment": "bands", "needs": ["bands"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "h-push"},
    {"id": "x-dumbbell-pullover", "name": "Dumbbell pullover", "muscle": "back", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "pullover"},
    {"id": "x-cable-pullover", "name": "Cable pullover", "muscle": "back", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "pullover"},
    {"id": "x-landmine-floor-press", "name": "Landmine floor press", "muscle": "chest", "equipment": "landmine", "needs": ["landmine", "barbell"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-seated-barbell-press", "name": "Seated barbell press", "muscle": "shoulders", "equipment": "barbell", "needs": ["barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "v-push"},
    {"id": "x-push-press", "name": "Push press", "muscle": "shoulders", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "5", "pattern": "v-push"},
    {"id": "x-behind-the-neck-press", "name": "Behind-the-neck press", "muscle": "shoulders", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "v-push"},
    {"id": "x-smith-shoulder-press", "name": "Smith shoulder press", "muscle": "shoulders", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-push"},
    {"id": "x-arnold-press", "name": "Arnold press", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-push"},
    {"id": "x-single-arm-dumbbell-press", "name": "Single-arm dumbbell press", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-push"},
    {"id": "x-kettlebell-press", "name": "Kettlebell press", "muscle": "shoulders", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "v-push"},
    {"id": "x-half-kneeling-landmine-press", "name": "Half-kneeling landmine press", "muscle": "shoulders", "equipment": "landmine", "needs": ["landmine", "barbell"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-push"},
    {"id": "x-pike-push-up", "name": "Pike push-up", "muscle": "shoulders", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-push"},
    {"id": "x-handstand-push-up", "name": "Handstand push-up", "muscle": "shoulders", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "6", "pattern": "v-push"},
    {"id": "x-machine-lateral-raise", "name": "Machine lateral raise", "muscle": "shoulders", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "lateral"},
    {"id": "x-lean-away-lateral-raise", "name": "Lean-away lateral raise", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "lateral"},
    {"id": "x-seated-lateral-raise", "name": "Seated lateral raise", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "lateral"},
    {"id": "x-dumbbell-front-raise", "name": "Dumbbell front raise", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "front-raise"},
    {"id": "x-plate-front-raise", "name": "Plate front raise", "muscle": "shoulders", "equipment": "barbell", "needs": ["barbell"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "front-raise"},
    {"id": "x-cable-front-raise", "name": "Cable front raise", "muscle": "shoulders", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "front-raise"},
    {"id": "x-barbell-upright-row", "name": "Barbell upright row", "muscle": "shoulders", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "10", "pattern": "upright-row"},
    {"id": "x-cable-upright-row", "name": "Cable upright row", "muscle": "shoulders", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "upright-row"},
    {"id": "x-dumbbell-upright-row", "name": "Dumbbell upright row", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "upright-row"},
    {"id": "x-reverse-pec-deck", "name": "Reverse pec deck", "muscle": "shoulders", "equipment": "machine", "needs": ["pec-deck"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "rear-delt"},
    {"id": "x-cable-rear-delt-fly", "name": "Cable rear delt fly", "muscle": "shoulders", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "rear-delt"},
    {"id": "x-band-pull-apart", "name": "Band pull-apart", "muscle": "shoulders", "equipment": "bands", "needs": ["bands"], "isBarbell": false, "sets": 3, "reps": "20", "pattern": "rear-delt"},
    {"id": "x-bent-over-rear-delt-raise", "name": "Bent-over rear delt raise", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "rear-delt"},
    {"id": "x-y-raise", "name": "Y-raise", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "rear-delt"},
    {"id": "x-cuban-press", "name": "Cuban press", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "rotator"},
    {"id": "x-cable-external-rotation", "name": "Cable external rotation", "muscle": "shoulders", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "rotator"},
    {"id": "x-weighted-pull-up", "name": "Weighted pull-up", "muscle": "back", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "5", "pattern": "v-pull"},
    {"id": "x-neutral-grip-pull-up", "name": "Neutral-grip pull-up", "muscle": "back", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "v-pull"},
    {"id": "x-wide-grip-pull-up", "name": "Wide-grip pull-up", "muscle": "back", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "v-pull"},
    {"id": "x-assisted-pull-up", "name": "Assisted pull-up", "muscle": "back", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-pull"},
    {"id": "x-negative-pull-up", "name": "Negative pull-up", "muscle": "back", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "5", "pattern": "v-pull"},
    {"id": "x-wide-grip-lat-pulldown", "name": "Wide-grip lat pulldown", "muscle": "back", "equipment": "machine", "needs": ["lat-pulldown"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-pull"},
    {"id": "x-close-grip-lat-pulldown", "name": "Close-grip lat pulldown", "muscle": "back", "equipment": "machine", "needs": ["lat-pulldown"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "v-pull"},
    {"id": "x-single-arm-lat-pulldown", "name": "Single-arm lat pulldown", "muscle": "back", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "v-pull"},
    {"id": "x-straight-arm-pulldown", "name": "Straight-arm pulldown", "muscle": "back", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "pullover"},
    {"id": "x-pendlay-row", "name": "Pendlay row", "muscle": "back", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "6", "pattern": "h-pull"},
    {"id": "x-yates-row", "name": "Yates row", "muscle": "back", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "h-pull"},
    {"id": "x-t-bar-row", "name": "T-bar row", "muscle": "back", "equipment": "landmine", "needs": ["landmine", "barbell"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "h-pull"},
    {"id": "x-meadows-row", "name": "Meadows row", "muscle": "back", "equipment": "landmine", "needs": ["landmine", "barbell"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-seal-row", "name": "Seal row", "muscle": "back", "equipment": "barbell", "needs": ["barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "h-pull"},
    {"id": "x-smith-row", "name": "Smith row", "muscle": "back", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-machine-row", "name": "Machine row", "muscle": "back", "equipment": "machine", "needs": ["row-machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-chest-supported-machine-row", "name": "Chest-supported machine row", "muscle": "back", "equipment": "machine", "needs": ["row-machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-single-arm-cable-row", "name": "Single-arm cable row", "muscle": "back", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "h-pull"},
    {"id": "x-kroc-row", "name": "Kroc row", "muscle": "back", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "h-pull"},
    {"id": "x-kettlebell-row", "name": "Kettlebell row", "muscle": "back", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-inverted-row", "name": "Inverted row", "muscle": "back", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-renegade-row", "name": "Renegade row", "muscle": "back", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "h-pull"},
    {"id": "x-dumbbell-shrug", "name": "Dumbbell shrug", "muscle": "back", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "shrug"},
    {"id": "x-trap-bar-shrug", "name": "Trap-bar shrug", "muscle": "back", "equipment": "trap-bar", "needs": ["trap-bar"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "shrug"},
    {"id": "x-cable-shrug", "name": "Cable shrug", "muscle": "back", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "shrug"},
    {"id": "x-smith-shrug", "name": "Smith shrug", "muscle": "back", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "shrug"},
    {"id": "x-hammer-strength-row", "name": "Hammer strength row", "muscle": "back", "equipment": "machine", "needs": ["row-machine"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-pull"},
    {"id": "x-rack-chin-up", "name": "Rack chin-up", "muscle": "back", "equipment": "barbell", "needs": ["rack", "barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "v-pull"},
    {"id": "x-concentration-curl", "name": "Concentration curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-spider-curl", "name": "Spider curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells", "incline-bench"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-drag-curl", "name": "Drag curl", "muscle": "biceps", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "10", "pattern": "curl"},
    {"id": "x-reverse-curl", "name": "Reverse curl", "muscle": "biceps", "equipment": "ez-bar", "needs": ["ez-bar"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-zottman-curl", "name": "Zottman curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "curl"},
    {"id": "x-cross-body-hammer-curl", "name": "Cross-body hammer curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "curl"},
    {"id": "x-rope-hammer-curl", "name": "Rope hammer curl", "muscle": "biceps", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-bayesian-cable-curl", "name": "Bayesian cable curl", "muscle": "biceps", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-machine-preacher-curl", "name": "Machine preacher curl", "muscle": "biceps", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-dumbbell-preacher-curl", "name": "Dumbbell preacher curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "curl"},
    {"id": "x-band-curl", "name": "Band curl", "muscle": "biceps", "equipment": "bands", "needs": ["bands"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "curl"},
    {"id": "x-chin-up-curl-hold", "name": "Chin-up curl hold", "muscle": "biceps", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "20s", "pattern": "curl"},
    {"id": "x-wrist-curl", "name": "Wrist curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "forearm"},
    {"id": "x-reverse-wrist-curl", "name": "Reverse wrist curl", "muscle": "biceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "forearm"},
    {"id": "x-rope-pushdown", "name": "Rope pushdown", "muscle": "triceps", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "tri-ext"},
    {"id": "x-straight-bar-pushdown", "name": "Straight-bar pushdown", "muscle": "triceps", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "tri-ext"},
    {"id": "x-single-arm-cable-pushdown", "name": "Single-arm cable pushdown", "muscle": "triceps", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "tri-ext"},
    {"id": "x-overhead-cable-extension", "name": "Overhead cable extension", "muscle": "triceps", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "tri-ext"},
    {"id": "x-dumbbell-skull-crusher", "name": "Dumbbell skull crusher", "muscle": "triceps", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "tri-ext"},
    {"id": "x-dumbbell-kickback", "name": "Dumbbell kickback", "muscle": "triceps", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "tri-ext"},
    {"id": "x-jm-press", "name": "JM press", "muscle": "triceps", "equipment": "barbell", "needs": ["rack", "barbell", "bench"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "tri-ext"},
    {"id": "x-tate-press", "name": "Tate press", "muscle": "triceps", "equipment": "dumbbells", "needs": ["dumbbells", "bench"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "tri-ext"},
    {"id": "x-tricep-dip-machine", "name": "Tricep dip machine", "muscle": "triceps", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "tri-ext"},
    {"id": "x-close-grip-push-up", "name": "Close-grip push-up", "muscle": "triceps", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "h-push"},
    {"id": "x-weighted-dip", "name": "Weighted dip", "muscle": "triceps", "equipment": "dip-station", "needs": ["dip-station"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "h-push"},
    {"id": "x-smith-close-grip-press", "name": "Smith close-grip press", "muscle": "triceps", "equipment": "smith", "needs": ["smith"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "h-push"},
    {"id": "x-hanging-leg-raise", "name": "Hanging leg raise", "muscle": "core", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "core-flex"},
    {"id": "x-toes-to-bar", "name": "Toes-to-bar", "muscle": "core", "equipment": "pullup-bar", "needs": ["pullup-bar"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "core-flex"},
    {"id": "x-captain-s-chair-leg-raise", "name": "Captain's chair leg raise", "muscle": "core", "equipment": "dip-station", "needs": ["dip-station"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "core-flex"},
    {"id": "x-ab-wheel-rollout", "name": "Ab wheel rollout", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "anti-ext"},
    {"id": "x-barbell-rollout", "name": "Barbell rollout", "muscle": "core", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "anti-ext"},
    {"id": "x-dead-bug", "name": "Dead bug", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "anti-ext"},
    {"id": "x-hollow-hold", "name": "Hollow hold", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "30s", "pattern": "anti-ext"},
    {"id": "x-side-plank", "name": "Side plank", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "30s", "pattern": "anti-lat"},
    {"id": "x-copenhagen-plank", "name": "Copenhagen plank", "muscle": "core", "equipment": "bodyweight", "needs": ["bench"], "isBarbell": false, "sets": 3, "reps": "20s", "pattern": "anti-lat"},
    {"id": "x-pallof-press", "name": "Pallof press", "muscle": "core", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "anti-rot"},
    {"id": "x-band-pallof-press", "name": "Band Pallof press", "muscle": "core", "equipment": "bands", "needs": ["bands"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "anti-rot"},
    {"id": "x-cable-woodchop", "name": "Cable woodchop", "muscle": "core", "equipment": "cables", "needs": ["cables"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "rotation"},
    {"id": "x-landmine-rotation", "name": "Landmine rotation", "muscle": "core", "equipment": "landmine", "needs": ["landmine", "barbell"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "rotation"},
    {"id": "x-russian-twist", "name": "Russian twist", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "20", "pattern": "rotation"},
    {"id": "x-crunch", "name": "Crunch", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "core-flex"},
    {"id": "x-decline-sit-up", "name": "Decline sit-up", "muscle": "core", "equipment": "bodyweight", "needs": ["bench"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "core-flex"},
    {"id": "x-sit-up", "name": "Sit-up", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "core-flex"},
    {"id": "x-bicycle-crunch", "name": "Bicycle crunch", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "20", "pattern": "rotation"},
    {"id": "x-reverse-crunch", "name": "Reverse crunch", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "core-flex"},
    {"id": "x-v-up", "name": "V-up", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "12", "pattern": "core-flex"},
    {"id": "x-ab-crunch-machine", "name": "Ab crunch machine", "muscle": "core", "equipment": "machine", "needs": ["machine"], "isBarbell": false, "sets": 3, "reps": "15", "pattern": "core-flex"},
    {"id": "x-mountain-climber", "name": "Mountain climber", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "30s", "pattern": "core-flex"},
    {"id": "x-suitcase-carry", "name": "Suitcase carry", "muscle": "core", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "40m", "pattern": "carry"},
    {"id": "x-kettlebell-suitcase-carry", "name": "Kettlebell suitcase carry", "muscle": "core", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "40m", "pattern": "carry"},
    {"id": "x-overhead-carry", "name": "Overhead carry", "muscle": "shoulders", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "40m", "pattern": "carry"},
    {"id": "x-front-rack-carry", "name": "Front rack carry", "muscle": "core", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "40m", "pattern": "carry"},
    {"id": "x-trap-bar-carry", "name": "Trap-bar carry", "muscle": "core", "equipment": "trap-bar", "needs": ["trap-bar"], "isBarbell": false, "sets": 3, "reps": "40m", "pattern": "carry"},
    {"id": "x-sandbag-carry", "name": "Sandbag carry", "muscle": "core", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 3, "reps": "40m", "pattern": "carry"},
    {"id": "x-sled-pull", "name": "Sled pull", "muscle": "hamstrings", "equipment": "sled", "needs": ["sled"], "isBarbell": false, "sets": 3, "reps": "20m", "pattern": "carry"},
    {"id": "x-sled-drag", "name": "Sled drag", "muscle": "quads", "equipment": "sled", "needs": ["sled"], "isBarbell": false, "sets": 3, "reps": "20m", "pattern": "carry"},
    {"id": "x-kettlebell-clean", "name": "Kettlebell clean", "muscle": "hamstrings", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "power"},
    {"id": "x-kettlebell-snatch", "name": "Kettlebell snatch", "muscle": "hamstrings", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "power"},
    {"id": "x-kettlebell-turkish-get-up", "name": "Kettlebell Turkish get-up", "muscle": "core", "equipment": "kettlebells", "needs": ["kettlebells"], "isBarbell": false, "sets": 3, "reps": "3", "pattern": "carry"},
    {"id": "x-power-clean", "name": "Power clean", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "3", "pattern": "power"},
    {"id": "x-hang-clean", "name": "Hang clean", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "3", "pattern": "power"},
    {"id": "x-clean-and-jerk", "name": "Clean and jerk", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "2", "pattern": "power"},
    {"id": "x-snatch", "name": "Snatch", "muscle": "hamstrings", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "2", "pattern": "power"},
    {"id": "x-thruster", "name": "Thruster", "muscle": "quads", "equipment": "barbell", "needs": ["barbell"], "isBarbell": true, "sets": 3, "reps": "8", "pattern": "power"},
    {"id": "x-dumbbell-thruster", "name": "Dumbbell thruster", "muscle": "quads", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "10", "pattern": "power"},
    {"id": "x-dumbbell-snatch", "name": "Dumbbell snatch", "muscle": "shoulders", "equipment": "dumbbells", "needs": ["dumbbells"], "isBarbell": false, "sets": 3, "reps": "8", "pattern": "power"},
    {"id": "x-medicine-ball-slam", "name": "Medicine ball slam", "muscle": "cardio", "equipment": "slam-ball", "needs": ["slam-ball"], "isBarbell": false, "sets": 4, "reps": "12", "pattern": "power"},
    {"id": "x-treadmill-run", "name": "Treadmill run", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "10 min", "pattern": "cardio"},
    {"id": "x-incline-treadmill-walk", "name": "Incline treadmill walk", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "15 min", "pattern": "cardio"},
    {"id": "x-stationary-bike", "name": "Stationary bike", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "10 min", "pattern": "cardio"},
    {"id": "x-air-bike", "name": "Air bike", "muscle": "cardio", "equipment": "assault-runner", "needs": ["assault-runner"], "isBarbell": false, "sets": 4, "reps": "10 min", "pattern": "cardio"},
    {"id": "x-stair-climber", "name": "Stair climber", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "10 min", "pattern": "cardio"},
    {"id": "x-elliptical", "name": "Elliptical", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "10 min", "pattern": "cardio"},
    {"id": "x-jump-rope", "name": "Jump rope", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "2 min", "pattern": "cardio"},
    {"id": "x-sprint", "name": "Sprint", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "30s", "pattern": "cardio"},
    {"id": "x-jumping-jack", "name": "Jumping jack", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "30s", "pattern": "cardio"},
    {"id": "x-high-knees", "name": "High knees", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "30s", "pattern": "cardio"},
    {"id": "x-battle-ropes", "name": "Battle ropes", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "30s", "pattern": "cardio"},
    {"id": "x-bear-crawl", "name": "Bear crawl", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "20m", "pattern": "cardio"},
    {"id": "x-shuttle-run", "name": "Shuttle run", "muscle": "cardio", "equipment": "bodyweight", "needs": ["bodyweight"], "isBarbell": false, "sets": 4, "reps": "30s", "pattern": "cardio"}
  );
})();
