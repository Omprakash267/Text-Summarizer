# NLP Text Summarizer

Summarizes articles using two methods:
- **Extractive**: TF-IDF scoring with spaCy sentence splitting
- **Abstractive**: Facebook BART model via Hugging Face

## Setup

### 1. Install dependencies
pip install -r requirements.txt

Optional (recommended): download the spaCy English model for higher-quality sentence splitting and entity extraction:
python -m spacy download en_core_web_sm

### 2. Start Backend
From the repo root (recommended):
python -m backend.app

Or from the backend folder:
cd backend
python app.py

### 3. Open Frontend
Open frontend/index.html in your browser

Sample inputs are available in `data/sample_texts.txt`.

## API Endpoints
- POST /summarize/extractive - { "text": "...", "num_sentences": 3 }
- POST /summarize/abstractive - { "text": "..." }
- POST /analyze - { "text": "..." }
- POST /analyze/text - { "text": "..." } (returns text/plain)
- POST /ner - { "text": "..." } (legacy alias)
- GET /health

## Evaluate
python -m backend.evaluate

## Author

OMPRAKASH S
