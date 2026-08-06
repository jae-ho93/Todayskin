"""Deterministic 0-100 scoring from raw classification grades, computed in
code (not by the LLM) so the number is reproducible and consistent -- Gemini
gets the score as given context to narrate around, not something to invent.

Grade 0 (best, per the AI Hub convention) -> 100. Max grade (worst) -> 0.
Regression measurements aren't scored: unlike grades they don't all share a
"higher is worse" direction (moisture: higher is better; pigmentation
count: higher is worse), so folding them in would need per-metric direction
metadata we don't have a clean source for yet.
"""
from regions import LABEL_SCHEMA


def grade_to_score(grade: int, max_grade: int) -> int:
    if max_grade == 0:
        return 100
    return round(100 * (1 - grade / max_grade))


def compute_scores(results: dict) -> dict:
    """results: the dict returned by SkinAnalyzer.analyze(), keyed by
    facepart name. Returns {part_name: score} for faceparts that have at
    least one classification label, plus "overall": the average of those."""
    part_scores = {}
    for part_id, schema in LABEL_SCHEMA.items():
        if not schema["classification"]:
            continue  # e.g. face_whole -- no grade to score
        part_name = _facepart_name(part_id)
        grades = results.get(part_name, {}).get("classification", {})
        label_scores = [
            grade_to_score(grades[name], n_classes - 1)
            for name, n_classes in schema["classification"].items()
            if name in grades
        ]
        if label_scores:
            part_scores[part_name] = round(sum(label_scores) / len(label_scores))

    overall = round(sum(part_scores.values()) / len(part_scores)) if part_scores else None
    return {"parts": part_scores, "overall": overall}


def _facepart_name(part_id: int) -> str:
    from regions import FACEPART_NAMES
    return FACEPART_NAMES[part_id]
