"""Maps the training pipeline's 8-facepart model output (see regions.py) onto
Todayskin's 6-facepart app contract (backend Prisma FacePart enum: forehead,
glabella, eyeArea, cheek, lips, jaw -- see backend/prisma/schema.prisma and
backend/src/modules/diagnosis/providers/inference-provider.interface.ts).

- l_perocular/r_perocular -> eyeArea, l_cheek/r_cheek -> cheek: scores (and,
  for cheek, moisture/elasticity/classification attrs) are averaged across
  the left/right pair.
- glabellus -> glabella, lip -> lips, chin -> jaw: renamed 1:1.
- face_whole is dropped (no classification grade, not part of the app schema).
- elasticity: the model predicts 10 raw Cutometer R-parameters per part
  (R0-R9). R2 (Ua/Uf, "gross elasticity") is the parameter most commonly
  reported as *the* elasticity number in Cutometer literature, so it's the
  one surfaced here, scaled from its native 0-1 ratio to 0-100 to match the
  app's moisture scale.
- grade: the app stores a free-text Korean grade string (see
  MockInferenceProvider). There's no model-native grade text, so one is
  derived from the part's deterministic 0-100 score (scoring.py) using the
  same 4-tier scale already documented in inference-provider.interface.ts's
  InferredPartMetric docstring (양호/보통/건조/매우 건조).
- note: the model actually predicts *specific* concerns per part (wrinkle,
  pigmentation, pore, dryness, sagging -- see LABEL_SCHEMA), not just one
  blended number. `grade` alone throws that away, so each attribute's own
  classification is scored and surfaced here, e.g. "주름 보통 · 색소침착 양호".
"""
from collections import defaultdict

from regions import FACEPART_NAMES, LABEL_SCHEMA
from scoring import grade_to_score

PART_LABELS = {
    "forehead": "이마",
    "glabella": "미간",
    "eyeArea": "눈가",
    "cheek": "볼",
    "lips": "입술",
    "jaw": "턱",
}

ELASTICITY_KEY = "R2"  # Ua/Uf gross elasticity ratio, 0-1 native range

NAME_TO_PART_ID = {name: pid for pid, name in FACEPART_NAMES.items()}

# classification 키(e.g. "l_cheek_pore")의 접미사 -> 사람이 읽는 한글 항목명.
ATTR_LABELS = {
    "wrinkle": "주름",
    "pigmentation": "색소침착",
    "pore": "모공",
    "dryness": "건조도",
    "sagging": "처짐",
}


def _score_to_grade(score: float) -> str:
    if score >= 75:
        return "양호"
    if score >= 50:
        return "보통"
    if score >= 25:
        return "건조"
    return "매우 건조"


def _avg(*values: float | None) -> float | None:
    present = [v for v in values if v is not None]
    if not present:
        return None
    return sum(present) / len(present)


def _elasticity(regression: dict, prefix: str) -> float | None:
    key = f"{prefix}_elasticity_{ELASTICITY_KEY}"
    value = regression.get(key)
    return value * 100 if value is not None else None


def _attr_label(classification_key: str) -> str:
    for suffix, label in ATTR_LABELS.items():
        if classification_key.endswith(suffix):
            return label
    return classification_key


def _cls_scores(model_part_name: str, classification: dict) -> dict[str, float]:
    """{한글 항목명: 0-100 score} -- 모델 facepart 하나의 원시 classification grade(정수)들을
    scoring.py와 동일한 공식(등급 0=최고 -> 100)으로 변환한다."""
    schema = LABEL_SCHEMA[NAME_TO_PART_ID[model_part_name]]["classification"]
    return {
        _attr_label(key): grade_to_score(grade, schema[key] - 1)
        for key, grade in classification.items()
    }


def _merge_cls(*cls_dicts: dict[str, float]) -> dict[str, float]:
    """같은 항목명(예: 좌/우 볼의 "모공")을 가진 점수를 평균낸다."""
    grouped: dict[str, list[float]] = defaultdict(list)
    for d in cls_dicts:
        for key, value in d.items():
            grouped[key].append(value)
    return {key: sum(values) / len(values) for key, values in grouped.items()}


def _note(attr_scores: dict[str, float]) -> str | None:
    if not attr_scores:
        return None
    return ' · '.join(
        f"{attr} {_score_to_grade(round(score))}" for attr, score in attr_scores.items()
    )


def map_to_app_schema(analysis: dict, model_version: str) -> dict:
    """analysis: SkinAnalyzer.analyze() 반환값 ({"parts": {...}, "overall_score": ...}).
    반환값은 NestJS InferenceResult(overallScore, modelVersion, parts[]) 계약과 1:1 대응한다.
    """
    parts = analysis["parts"]

    def part_score(name: str) -> float:
        return parts[name]["score"]

    def part_reg(name: str) -> dict:
        return parts[name].get("regression", {})

    def part_cls(name: str) -> dict[str, float]:
        return _cls_scores(name, parts[name].get("classification", {}))

    forehead_reg = part_reg("forehead")
    chin_reg = part_reg("chin")
    l_cheek_reg = part_reg("l_cheek")
    r_cheek_reg = part_reg("r_cheek")

    merged = {
        "forehead": {
            "score": part_score("forehead"),
            "moisture": forehead_reg.get("forehead_moisture"),
            "elasticity": _elasticity(forehead_reg, "forehead"),
            "note": _note(part_cls("forehead")),
        },
        "glabella": {
            "score": part_score("glabellus"),
            "moisture": None,
            "elasticity": None,
            "note": _note(part_cls("glabellus")),
        },
        "eyeArea": {
            "score": _avg(part_score("l_perocular"), part_score("r_perocular")),
            "moisture": None,
            "elasticity": None,
            "note": _note(_merge_cls(part_cls("l_perocular"), part_cls("r_perocular"))),
        },
        "cheek": {
            "score": _avg(part_score("l_cheek"), part_score("r_cheek")),
            "moisture": _avg(l_cheek_reg.get("l_cheek_moisture"), r_cheek_reg.get("r_cheek_moisture")),
            "elasticity": _avg(
                _elasticity(l_cheek_reg, "l_cheek"),
                _elasticity(r_cheek_reg, "r_cheek"),
            ),
            "note": _note(_merge_cls(part_cls("l_cheek"), part_cls("r_cheek"))),
        },
        "lips": {
            "score": part_score("lip"),
            "moisture": None,
            "elasticity": None,
            "note": _note(part_cls("lip")),
        },
        "jaw": {
            "score": part_score("chin"),
            "moisture": chin_reg.get("chin_moisture"),
            "elasticity": _elasticity(chin_reg, "chin"),
            "note": _note(part_cls("chin")),
        },
    }

    app_parts = []
    for part, values in merged.items():
        score = round(values["score"])
        app_parts.append({
            "part": part,
            "label": PART_LABELS[part],
            "grade": _score_to_grade(score),
            "moisture": round(values["moisture"], 1) if values["moisture"] is not None else None,
            "elasticity": round(values["elasticity"], 1) if values["elasticity"] is not None else None,
            "note": values["note"],
        })

    return {
        "overallScore": round(analysis["overall_score"]),
        "modelVersion": model_version,
        "parts": app_parts,
    }
