from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

try:
    from .nlp_utils import get_nlp
except ImportError:  # running as a script from within backend/
    from nlp_utils import get_nlp

def extractive_summary(text: str, num_sentences: int = 3) -> str:
    try:
        num_sentences = int(num_sentences)
    except Exception:
        num_sentences = 3
    num_sentences = max(1, num_sentences)

    nlp = get_nlp()
    doc = nlp(text)
    sentences = [sent.text.strip() for sent in doc.sents if len(sent.text.strip()) > 10]

    if len(sentences) <= num_sentences:
        return " ".join(sentences)

    # TF-IDF scoring
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(sentences)

    # Score each sentence by sum of its TF-IDF values
    scores = np.array(tfidf_matrix.sum(axis=1)).flatten()

    # Pick top N sentences and preserve original order
    top_indices = np.argsort(scores)[::-1][:num_sentences]
    top_indices = sorted(top_indices)

    summary = " ".join([sentences[i] for i in top_indices])
    return summary
