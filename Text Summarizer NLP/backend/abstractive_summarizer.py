import os
from transformers import pipeline

_summarizer = None

def _get_summarizer():
    global _summarizer
    if _summarizer is not None:
        return _summarizer

    model_name = os.getenv("SUMMARIZER_MODEL", "facebook/bart-large-cnn")
    _summarizer = pipeline(
        "summarization",
        model=model_name,
        tokenizer=model_name,
    )
    return _summarizer

def abstractive_summary(text: str, max_length: int = 150, min_length: int = 40) -> str:
    # BART has a token limit — truncate long inputs
    if len(text.split()) > 900:
        text = " ".join(text.split()[:900])

    summarizer = _get_summarizer()
    result = summarizer(
        text,
        max_length=max_length,
        min_length=min_length,
        do_sample=False
    )

    return result[0]["summary_text"]
