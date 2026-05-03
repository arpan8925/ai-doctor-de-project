"""Deterministic red-flag rules — the safety layer the LLM is NOT allowed to override.

Each rule fires on a regex match against either the patient's free-text input
or the running transcript of detected symptoms. When a rule fires:

  1. `state.red_flag_active = True` (caps clarification score at 50).
  2. The action becomes `"escalate"` regardless of what the model thinks.
  3. The PDN engine surfaces a synthesized urgent-care UI to the patient.

These rules are intentionally narrow and high-precision. False negatives are
unfortunate; false positives are fine — escalating a non-emergency to "see a
doctor" is much safer than missing a real one. Sourcing: standard primary-care
red-flag protocols (Oxford Handbook of Clinical Medicine, NICE referral
guidelines), distilled to plain-text patterns appropriate for the patient's
own description.

Each rule's `rationale` is paper-citable and shown to the user as the *reason*
escalation is recommended.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RedFlagRule:
    id: str
    pattern: re.Pattern[str]
    label: str          # short title shown to the user
    rationale: str      # one-sentence patient-facing explanation
    severity: str = "emergency"  # "emergency" → ER now; "urgent" → same-day GP


def _re(pat: str) -> re.Pattern[str]:
    return re.compile(pat, re.IGNORECASE)


RULES: tuple[RedFlagRule, ...] = (
    # ── Cardiac ────────────────────────────────────────────────
    RedFlagRule(
        id="acs_classic",
        pattern=_re(r"\bchest\s+(pain|tight|pressure|crush)\b.*\b(arm|jaw|shoulder|sweat|cold[-\s]sweat|breathless|short(ness)?\s+of\s+breath)\b"),
        label="Possible heart attack",
        rationale="Chest pain radiating to arm/jaw, with sweating or breathlessness, can be a heart attack.",
    ),
    RedFlagRule(
        id="acs_severe_chest",
        pattern=_re(r"\b(severe|crushing|squeez(ing|y)|elephant on (my )?chest)\b.*\bchest\b"),
        label="Severe chest pain",
        rationale="Severe or crushing chest pain needs to be ruled out as a heart attack today.",
    ),

    # ── Stroke (FAST) ──────────────────────────────────────────
    RedFlagRule(
        id="stroke_fast",
        pattern=_re(r"\b(face\s+(droop|sag)|one[-\s]sided\s+(weak|numb)|slurr(ed|ing)\s+speech|can'?t\s+speak|sudden\s+(weak|numb))\b"),
        label="Possible stroke",
        rationale="Sudden face droop, one-sided weakness, or slurred speech can be a stroke. Time matters.",
    ),

    # ── Anaphylaxis ────────────────────────────────────────────
    RedFlagRule(
        id="anaphylaxis",
        pattern=_re(r"\b(swelling|swollen)\b.*\b(throat|tongue|lips|face)\b|\bthroat\s+closing\b|\bcan'?t\s+breathe\b.*\b(rash|hives|sting|bite|food)\b"),
        label="Possible anaphylaxis",
        rationale="Swelling of the throat/tongue with difficulty breathing after an exposure is a life-threatening allergic reaction.",
    ),

    # ── Neuro: thunderclap headache, meningitis ────────────────
    RedFlagRule(
        id="thunderclap_headache",
        pattern=_re(r"\b(sudden(est)?|worst)\b.*\bheadache\b|\bthunderclap\b|\bworst\s+headache\s+of\s+my\s+life\b"),
        label="Sudden severe headache",
        rationale="A sudden, worst-ever headache can be bleeding in the brain and needs emergency imaging.",
    ),
    RedFlagRule(
        id="meningitis",
        pattern=_re(r"\bneck\s+(stiff|stiffness)\b|\bphotophobia\b.*\b(fever|headache)\b|\b(rash|spots)\b.*\b(don'?t\s+blanch|won'?t\s+blanch|press a glass)\b"),
        label="Possible meningitis",
        rationale="A stiff neck with fever and headache, or a non-blanching rash, can mean meningitis.",
    ),

    # ── Severe respiratory ─────────────────────────────────────
    RedFlagRule(
        id="resp_failure",
        pattern=_re(r"\b(blue\s+(lips|fingertips)|cyanos|lips?\s+turning\s+blue|gasping\s+for\s+air)\b"),
        label="Severe breathing trouble",
        rationale="Blue lips or gasping for air means oxygen levels are dangerously low.",
    ),

    # ── Sepsis triad ───────────────────────────────────────────
    RedFlagRule(
        id="sepsis",
        pattern=_re(r"\bfever\b.*\b(confus|disorient|drowsy|slurr|lethargy|barely awake|cold(\s+and)?\s+clammy)\b"),
        label="Possible sepsis",
        rationale="Fever combined with confusion or drowsiness can mean a severe infection in the bloodstream.",
    ),

    # ── Severe abdominal / GI ──────────────────────────────────
    RedFlagRule(
        id="severe_abdo",
        pattern=_re(r"\b(severe|excruciating|tearing)\b.*\b(abdomen|belly|stomach|tummy)\s+pain\b|\brigid\s+(abdomen|belly)\b"),
        label="Severe abdominal pain",
        rationale="Sudden severe or tearing belly pain can be appendicitis, a perforated ulcer, or aortic dissection.",
    ),
    RedFlagRule(
        id="gi_bleed",
        pattern=_re(r"\b(vomit(ing)?\s+blood|coffee\s+ground\s+vomit|black\s+tarry\s+stool|melena|fresh\s+blood\s+in\s+stool)\b"),
        label="Internal bleeding",
        rationale="Vomiting blood or black tarry stools means bleeding inside the stomach or gut.",
    ),

    # ── Pregnancy ──────────────────────────────────────────────
    RedFlagRule(
        id="pregnancy_bleed",
        pattern=_re(r"\bpregnan\w+\b.*\b(bleed|bleeding|spotting|clots|severe\s+pain)\b|\b(bleed|bleeding|spotting)\b.*\bpregnan\w+\b"),
        label="Bleeding in pregnancy",
        rationale="Bleeding during pregnancy needs urgent assessment to rule out miscarriage or ectopic pregnancy.",
    ),

    # ── Mental health ──────────────────────────────────────────
    RedFlagRule(
        id="suicidal_ideation",
        pattern=_re(r"\b(want\s+to\s+(die|kill\s+myself)|kill(ing)?\s+myself|suicid(e|al)|end\s+(my\s+)?life|don'?t\s+want\s+to\s+live)\b"),
        label="Crisis support",
        rationale="Thoughts of suicide are a medical emergency. You deserve immediate human support.",
    ),

    # ── Trauma / bleeding ──────────────────────────────────────
    RedFlagRule(
        id="severe_bleeding",
        pattern=_re(r"\b(bleed(ing)?\s+(heavily|won'?t\s+stop|profusely|spurt)|gush(ing)?\s+blood|soaked\s+through)\b"),
        label="Heavy uncontrolled bleeding",
        rationale="Bleeding that won't stop with 10 minutes of pressure needs immediate medical care.",
    ),

    # ── Loss of consciousness / seizure ────────────────────────
    RedFlagRule(
        id="loss_of_consciousness",
        pattern=_re(r"\b(passed\s+out|fainted|collapsed|unconscious|black(ed)?\s+out|first\s+ever\s+seizure)\b"),
        label="Loss of consciousness",
        rationale="Fainting or losing consciousness — especially the first time — needs evaluation today.",
    ),

    # ── Pediatric (very young children) ────────────────────────
    RedFlagRule(
        id="infant_fever",
        pattern=_re(r"\b(baby|infant|newborn|<\s*3\s*month|under\s+(3|three)\s+months?)\b.*\bfever\b"),
        label="Fever in a young infant",
        rationale="Any fever in a baby under 3 months needs same-day medical assessment.",
    ),

    # ── Diabetic emergencies ──────────────────────────────────
    RedFlagRule(
        id="dka",
        pattern=_re(r"\b(diabet\w*)\b.*\b(deep\s+breathing|fruity\s+breath|vomit|drowsy|confus)\b"),
        label="Possible diabetic crisis",
        rationale="In a person with diabetes, deep breathing, fruity breath, or confusion can mean ketoacidosis.",
    ),

    # ── Eye / vision ───────────────────────────────────────────
    RedFlagRule(
        id="vision_loss",
        pattern=_re(r"\b(sudden\s+(loss|loss\s+of)|lost)\s+(vision|sight)\b|\bcurtain\s+over\s+(my\s+)?eye\b"),
        label="Sudden vision loss",
        rationale="Sudden loss of vision can be a stroke of the eye and is time-sensitive.",
    ),
)


# Negation guard — if any of these words appear within ~40 chars BEFORE a match,
# we treat the match as a denial ("no chest pain", "no neck stiffness", "denies
# fever") and skip it. This is a primary-care-grade NegEx — good enough to
# eliminate the common false positives without bringing in a full NLP stack.
_NEGATION_RE = re.compile(
    r"\b(no|not|none|never|without|denies?|deny|negative\s+for|absent|free\s+of)\b",
    re.IGNORECASE,
)
_NEG_WINDOW = 40


def detect(text: str) -> RedFlagRule | None:
    """Return the first matching rule, with simple negation handling."""
    for rule in RULES:
        for m in rule.pattern.finditer(text):
            preceding = text[max(0, m.start() - _NEG_WINDOW) : m.start()]
            if _NEGATION_RE.search(preceding):
                continue  # negated — skip this occurrence
            return rule
    return None


def detect_in_transcript(transcript: list[dict]) -> RedFlagRule | None:
    """Detect a red flag in any individual user message (most-recent first).

    Concatenating messages would cross-contaminate negations across turns —
    e.g. "no fever" in turn 4 could mate with "headache" from turn 1.
    """
    for m in reversed(transcript):
        if m.get("role") != "user":
            continue
        rule = detect(m.get("content", "") or "")
        if rule:
            return rule
    return None
