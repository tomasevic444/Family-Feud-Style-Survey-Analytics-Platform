# backend/app/nlp/nlp_pipeline.py
import re
import string
import logging
from typing import List, Dict, Tuple

from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from textblob import TextBlob
from fuzzywuzzy import fuzz 
logger = logging.getLogger(__name__)

# --- NLTK Setup ---
try:
    STOPWORDS_EN = set(stopwords.words('english'))
except LookupError:
    logger.warning("NLTK stopwords not found. Please ensure 'stopwords' is downloaded.")
    STOPWORDS_EN = set()


try:
    word_tokenize("test sentence") 
except LookupError:
    logger.warning("NLTK 'punkt' tokenizer not found. Please ensure 'punkt' is downloaded.")

try:
    TextBlob("test").correct()
except LookupError as e:
    logger.warning(f"TextBlob NLTK resource missing: {e}. Download might be needed (e.g., 'averaged_perceptron_tagger', 'wordnet', 'omw-1.4').")


# --- Preprocessing Functions ---
def preprocess_text(text: str, remove_stopwords: bool = False) -> str:
    """
    Basic text preprocessing: lowercase, remove punctuation, tokenize, remove stopwords (optional).
    Returns the processed text as a single string (space-separated tokens).
    """
    if not isinstance(text, str):
        return ""

    text = text.lower()
    text = text.translate(str.maketrans('', '', string.punctuation))
    tokens = word_tokenize(text)

    if remove_stopwords:
        tokens = [word for word in tokens if word not in STOPWORDS_EN and word]
    else:
        tokens = [word for word in tokens if word]

    return " ".join(tokens)

def basic_spell_check(text: str) -> str:
    """
    Applies basic spell checking using TextBlob.
    """
    if not text:
        return ""
    try:
        blob = TextBlob(text)
        corrected_text = str(blob.correct())
        return corrected_text
    except Exception as e:
        logger.error(f"Error during spell check for '{text}': {e}")
        return text

def calculate_similarity(text1: str, text2: str) -> int:
    """
    Calculates a similarity score between two strings using FuzzyWuzzy.
    Returns a score between 0 and 100.
    """
    if not text1 or not text2:
        return 0
    # Using token_sort_ratio handles differences in word order and tokenizes before comparing.
    # WRatio is also good as it tries several methods and picks the best.
    return fuzz.WRatio(text1, text2)

# --- Main Grouping Logic ---
def group_responses(raw_answers: List[str], similarity_threshold: int = 85) -> List[Dict[str, any]]:
    """
    Groups raw survey responses based on lexical similarity.

    Args:
        raw_answers: A list of raw answer strings.
        similarity_threshold: The FuzzWuzzy score (0-100) above which answers are considered similar.

    Returns:
        A list of dictionaries, where each dictionary represents a group:
        {
            "canonical_name": str,  // The representative name for the group
            "count": int,           // Number of answers in this group
            "raw_answers_in_group": List[str] // Original raw answers that belong to this group
        }
    """
    logger.info(f"Starting grouping for {len(raw_answers)} responses with threshold {similarity_threshold}.")

    if not raw_answers:
        return []

    # 1. Preprocess and spell-check answers
    processed_data: List[Tuple[str, str]] = []
    for original_ans in raw_answers:
        # Only process non-empty strings
        if original_ans and original_ans.strip():
            preprocessed_ans = preprocess_text(original_ans, remove_stopwords=False) # Keep stopwords for now
            # Spell check can be slow, consider its impact on performance
            # spell_checked_ans = basic_spell_check(preprocessed_ans)
            # For now, let's use preprocessed without intense spell check for speed
            processed_data.append((original_ans, preprocessed_ans))
        else:
            # Handle empty or whitespace-only strings if necessary, or filter them earlier
            logger.debug(f"Skipping empty or whitespace-only answer: '{original_ans}'")


    logger.info(f"Preprocessed {len(processed_data)} non-empty answers.")
    if not processed_data:
        return []

    groups: List[Dict[str, any]] = []
    # Keep track of answers that have already been assigned to a group
    assigned_indices = [False] * len(processed_data)

    for i in range(len(processed_data)):
        if assigned_indices[i]:
            continue # Skip if this answer is already in a group

        original_ans_i, processed_ans_i = processed_data[i]

        # Start a new group with the current answer
        # The first answer in a new group becomes its initial canonical name (using its processed form)
        # and we store its original form.
        current_group_canonical_name = processed_ans_i # Use processed for comparison
        current_group_raw_answers = [original_ans_i] # Store original
        assigned_indices[i] = True

        # Iterate through the rest of the answers to find similar ones
        for j in range(i + 1, len(processed_data)):
            if assigned_indices[j]:
                continue # Skip if already assigned

            original_ans_j, processed_ans_j = processed_data[j]
            similarity_score = calculate_similarity(processed_ans_i, processed_ans_j)

            if similarity_score >= similarity_threshold:
                current_group_raw_answers.append(original_ans_j)
                assigned_indices[j] = True

        # Add the newly formed group to our list of groups
        groups.append({
            "canonical_name": current_group_canonical_name, # This will be the processed version of the first item
            "count": len(current_group_raw_answers),
            "raw_answers_in_group": current_group_raw_answers # List of original answer strings
        })

    logger.info(f"Finished grouping. Found {len(groups)} groups.")

    groups.sort(key=lambda x: x["count"], reverse=True)

    return groups

# --- Example Usage (for testing this file directly) ---
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    test_answers = [
        "Eggs", "eggs", "EGGS!", " Eggs ", "Bacon and eggs",
        "Pancakes", "pancake", "Cereal", "Brekfast Cereal", "Toast",
        "toast.", "Oatmeal", "Porridge", "Yogurt", "Fruit",
        "bagel", "Doughnut", "my dog", "the dog", "a dog", "", None
    ]
    grouped = group_responses(test_answers, similarity_threshold=85)
    for group in grouped:
        print(f"Group: {group['canonical_name']} (Count: {group['count']})")
        print(f"  Raw answers: {group['raw_answers_in_group']}")
        print("-" * 20)