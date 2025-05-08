# backend/app/nlp/nlp_pipeline.py
import re
import string
import logging
from typing import List

from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
# TextBlob can be used for spell checking
from textblob import TextBlob
# FuzzyWuzzy for string similarity
from fuzzywuzzy import fuzz 

logger = logging.getLogger(__name__)

# Get the NLTK English stopwords set
try:
    STOPWORDS_EN = set(stopwords.words('english'))
except LookupError:
    logger.warning("NLTK stopwords not found. Please run nltk.download('stopwords').")
    STOPWORDS_EN = set() # Fallback to empty set


def preprocess_text(text: str, remove_stopwords: bool = False) -> str:
    """
    Basic text preprocessing: lowercase, remove punctuation, tokenize, remove stopwords (optional).
    Returns the processed text as a single string (space-separated tokens).
    """
    if not isinstance(text, str):
        return "" # Handle non-string input gracefully

    # 1. Lowercase
    text = text.lower()

    # 2. Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))

    # 3. Tokenize (split into words)
    tokens = word_tokenize(text)

    # 4. Remove stopwords and filter empty tokens
    if remove_stopwords:
        tokens = [word for word in tokens if word not in STOPWORDS_EN and word]
    else:
         tokens = [word for word in tokens if word] # Just filter empty tokens if not removing stopwords

    # 5. Join tokens back into a string 
    # Returning as string is simpler for initial spell check/fuzzy match
    return " ".join(tokens)

def basic_spell_check(text: str) -> str:
    """
    Applies basic spell checking using TextBlob.
    Note: TextBlob's spell check is basic and might require training/dictionaries
          for better accuracy on specific terms.
    """
    if not text:
        return ""
    try:
        # TextBlob works best on phrases/sentences
        blob = TextBlob(text)
        # Correct the whole phrase/sentence
        corrected_text = str(blob.correct())
        return corrected_text
    except Exception as e:
        logger.error(f"Error during spell check for '{text}': {e}")
        return text # Return original text on error


def calculate_similarity(text1: str, text2: str) -> int:
    """
    Calculates a similarity score between two strings using FuzzyWuzzy (Levenshtein).
    Returns a score between 0 and 100.
    """
    if not text1 or not text2:
        return 0 # No similarity if one string is empty
    # Use token_sort_ratio for better results with word order variations
    return fuzz.token_sort_ratio(text1, text2)


# --- Main Grouping Logic (Stub) ---
def group_responses(raw_answers: List[str]):
    """
    Placeholder function for the main response grouping logic.
    Takes a list of raw answer strings.
    TODO: Implement the actual clustering algorithm here.
    """
    logger.info(f"Starting grouping for {len(raw_answers)} responses.")

    # Example: Preprocess all answers
    processed_answers = [preprocess_text(ans) for ans in raw_answers]
    logger.info(f"Preprocessed answers: {processed_answers[:10]}...") # Log first 10

    # Example: Apply basic spell check
    spell_checked_answers = [basic_spell_check(ans) for ans in processed_answers]
    logger.info(f"Spell checked answers: {spell_checked_answers[:10]}...") # Log first 10


    # TODO: Implement clustering based on similarity (calculate_similarity) and embeddings

    # --- Dummy Grouping ---
    # For now, just return a dummy structure
    # In reality, this would be the output of your clustering algorithm
    dummy_grouped_results = {
        "Dummy Group 1": ["answer 1 variation A", "answer 1 variation B"],
        "Dummy Group 2": ["another answer C"],
    }
    logger.info(f"Finished dummy grouping.")

    return dummy_grouped_results # This structure will need to match your future Pydantic model