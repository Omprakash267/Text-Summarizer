from flask import Flask, jsonify, make_response, request
from spacy.matcher import PhraseMatcher

try:
    from .abstractive_summarizer import abstractive_summary
    from .extractive_summarizer import extractive_summary
    from .nlp_utils import get_nlp
except ImportError:  # running as a script from within backend/
    from abstractive_summarizer import abstractive_summary
    from extractive_summarizer import extractive_summary
    from nlp_utils import get_nlp

app = Flask(__name__)
nlp = get_nlp()

SYMPTOM_KEYWORDS = [
    "pain",
    "difficulty",
    "fever",
    "cough",
    "headache",
    "fatigue",
    "nausea",
    "dizziness",
    "shortness of breath",
    "chest pain",
]

MEDICATION_KEYWORDS = [
    "aspirin",
    "paracetamol",
    "acetaminophen",
    "ibuprofen",
    "metformin",
    "insulin",
]

PRESCRIPTION_TRIGGERS = [
    "prescribed",
    "prescribe",
    "rx",
    "take",
    "tablet",
    "capsule",
    "twice daily",
    "once daily",
    "daily",
    "bd",
    "od",
    "bid",
    "tid",
]

_symptom_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
_symptom_matcher.add("SYMPTOM", [nlp.make_doc(k) for k in SYMPTOM_KEYWORDS])

_medication_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
_medication_matcher.add("MEDICATION", [nlp.make_doc(k) for k in MEDICATION_KEYWORDS])


def extract_medical_entities(text: str):
    doc = nlp(text)

    symptoms = set()
    medications = set()

    for _, start, end in _symptom_matcher(doc):
        symptoms.add(doc[start:end].text.lower())

    for _, start, end in _medication_matcher(doc):
        medications.add(doc[start:end].text.lower())

    return {
        "Symptom": sorted(symptoms),
        "Medication": sorted(medications),
    }


def classify_note_type(text: str, entities: dict) -> str:
    text_lower = text.lower()
    if entities.get("Medication") or any(trigger in text_lower for trigger in PRESCRIPTION_TRIGGERS):
        return "Prescription"
    if entities.get("Symptom"):
        return "Clinical Note"
    return "Clinical Note"


def format_analysis_output(note_type: str, entities: dict) -> str:
    lines = [f"Note Type: {note_type}", "", "Entities:"]

    symptom_vals = entities.get("Symptom") or []
    medication_vals = entities.get("Medication") or []

    if symptom_vals:
        lines.append(f"Symptom → {', '.join(symptom_vals)}")
    if medication_vals:
        lines.append(f"Medication → {', '.join(medication_vals)}")

    return "\n".join(lines).rstrip() + "\n"


def _get_text_from_request():
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return None, (jsonify({"error": "No text provided"}), 400)

    text = (data["text"] or "").strip()
    if len(text) == 0:
        return None, (jsonify({"error": "Empty text"}), 400)

    return text, None


@app.route("/analyze", methods=["POST"])
def analyze():
    text, error = _get_text_from_request()
    if error:
        return error

    entities = extract_medical_entities(text)
    note_type = classify_note_type(text, entities)
    formatted = format_analysis_output(note_type, entities)

    return jsonify(
        {
            "note_type": note_type,
            "entities": entities,
            "output": formatted,
        }
    )


@app.route("/analyze/text", methods=["POST"])
def analyze_text():
    text, error = _get_text_from_request()
    if error:
        return error

    entities = extract_medical_entities(text)
    note_type = classify_note_type(text, entities)
    formatted = format_analysis_output(note_type, entities)

    response = make_response(formatted, 200)
    response.mimetype = "text/plain"
    response.headers["Content-Type"] = "text/plain; charset=utf-8"
    return response


def extract_entities(text):
    # Backwards-compat helper used by /ner.
    entities = extract_medical_entities(text)
    return {"symptoms": entities["Symptom"], "conditions": []}


@app.route("/ner", methods=["POST"])
def ner():
    text, error = _get_text_from_request()
    if error:
        return error

    extracted = extract_medical_entities(text)
    note_type = classify_note_type(text, extracted)
    formatted = format_analysis_output(note_type, extracted)

    prediction = "symptom" if extracted["Symptom"] else "condition"
    all_entities = sorted(set(extracted["Symptom"]) | set(extracted["Medication"]))

    return jsonify(
        {
            "Note Type": note_type,
            "Entities": extracted,
            "output": formatted,
            "Prediction": prediction,
            "EntitiesFlat": all_entities,
        }
    )

@app.before_request
def _handle_preflight():
    if request.method == "OPTIONS":
        return make_response("", 204)

@app.after_request
def _add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

@app.route("/", methods=["GET"])
def index():
    return jsonify(
        {
            "name": "NLP Text Summarizer API",
            "status": "ok",
            "endpoints": {
                "health": "GET /health",
                "extractive": "POST /summarize/extractive",
                "abstractive": "POST /summarize/abstractive",
                "analyze": "POST /analyze",
                "analyze_text": "POST /analyze/text",
                "ner_legacy": "POST /ner",
            },
            "frontend": "Open frontend/index.html in your browser (it calls this API on :5000).",
        }
    )


@app.route("/favicon.ico", methods=["GET"])
def favicon():
    return make_response("", 204)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "running"})

@app.route("/summarize/extractive", methods=["POST"])
def extractive():
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "No text provided"}), 400

    text = data["text"].strip()
    try:
        num_sentences = int(data.get("num_sentences", 3))
    except Exception:
        num_sentences = 3
    num_sentences = max(1, min(10, num_sentences))

    if len(text) == 0:
        return jsonify({"error": "Empty text"}), 400

    summary = extractive_summary(text, num_sentences)
    return jsonify({"summary": summary, "method": "extractive"})

@app.route("/summarize/abstractive", methods=["POST"])
def abstractive():
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "No text provided"}), 400

    text = data["text"].strip()
    if len(text) == 0:
        return jsonify({"error": "Empty text"}), 400

    try:
        summary = abstractive_summary(text)
    except Exception as e:
        return jsonify({
            "error": "Abstractive model unavailable. If this is the first run, ensure you have internet access to download the model (facebook/bart-large-cnn) or pre-download it and set SUMMARIZER_MODEL / Transformers cache.",
            "details": str(e),
        }), 503

    return jsonify({"summary": summary, "method": "abstractive"})

if __name__ == "__main__":
    # Threaded server prevents long-running requests (e.g., first-time model downloads)
    # from blocking health checks and other endpoints.
    app.run(debug=True, port=5000, threaded=True, use_reloader=False)
