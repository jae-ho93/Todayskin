FACEPART_NAMES = {
    0: "face_whole",
    1: "forehead",
    2: "glabellus",
    3: "l_perocular",
    4: "r_perocular",
    5: "l_cheek",
    6: "r_cheek",
    7: "lip",
    8: "chin",
}

# Final label schema, decided after auditing every annotation/equipment field
# across Training+Validation (17,370 frontal label files): `acne` is the only
# field that is null 100% of the time, so it's dropped entirely. Everything
# else here is populated in 100% of files -- no imputation needed.
#
# classification: {label_key: num_classes} (label ints are 0-indexed grades)
# regression: [equipment_key, ...]
LABEL_SCHEMA = {
    0: {  # face_whole
        "classification": {},
        "regression": ["pigmentation_count"],
    },
    1: {  # forehead
        "classification": {"forehead_pigmentation": 6, "forehead_wrinkle": 7},
        "regression": ["forehead_moisture"] +
                      [f"forehead_elasticity_R{i}" for i in range(10)] +
                      [f"forehead_elasticity_Q{i}" for i in range(4)],
    },
    2: {  # glabellus
        "classification": {"glabellus_wrinkle": 7},
        "regression": [],
    },
    3: {  # l_perocular
        "classification": {"l_perocular_wrinkle": 7},
        "regression": [f"l_perocular_wrinkle_{s}" for s in
                        ["Ra", "Rmax", "Rt", "Rz=Rtm", "Rp", "Rv", "Rq", "R3z"]],
    },
    4: {  # r_perocular
        "classification": {"r_perocular_wrinkle": 7},
        "regression": [f"r_perocular_wrinkle_{s}" for s in
                        ["Ra", "Rmax", "Rt", "Rz=Rtm", "Rp", "Rv", "Rq", "R3z"]],
    },
    5: {  # l_cheek
        "classification": {"l_cheek_pore": 6, "l_cheek_pigmentation": 6},
        "regression": ["l_cheek_moisture"] +
                      [f"l_cheek_elasticity_R{i}" for i in range(10)] +
                      [f"l_cheek_elasticity_Q{i}" for i in range(4)] +
                      ["l_cheek_pore"],
    },
    6: {  # r_cheek
        "classification": {"r_cheek_pore": 6, "r_cheek_pigmentation": 6},
        "regression": ["r_cheek_moisture"] +
                      [f"r_cheek_elasticity_R{i}" for i in range(10)] +
                      [f"r_cheek_elasticity_Q{i}" for i in range(4)] +
                      ["r_cheek_pore"],
    },
    7: {  # lip
        "classification": {"lip_dryness": 5},
        "regression": [],
    },
    8: {  # chin
        "classification": {"chin_sagging": 7},
        "regression": ["chin_moisture"] +
                      [f"chin_elasticity_R{i}" for i in range(10)] +
                      [f"chin_elasticity_Q{i}" for i in range(4)],
    },
}
