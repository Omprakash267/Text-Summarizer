from __future__ import annotations

import spacy

_NLP = None


def get_nlp():
    global _NLP
    if _NLP is not None:
        return _NLP

    try:
        _NLP = spacy.load("en_core_web_sm")
        return _NLP
    except Exception:
        # Fallback that keeps the server working without requiring a model download.
        # Provides sentence boundaries via the sentencizer component.
        nlp = spacy.blank("en")
        if "sentencizer" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")
        _NLP = nlp
        return _NLP

