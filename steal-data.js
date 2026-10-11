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
})();
