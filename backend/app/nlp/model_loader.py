import logging
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

class ModelSingleton:
    """
    Singleton class to ensure the heavy AI model is loaded only once
    across the application lifecycle.
    """
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelSingleton, cls).__new__(cls)
            logger.info(" Loading SBERT model (all-MiniLM-L6-v2)... This happens only once.")
            

            cls._model = SentenceTransformer('all-MiniLM-L6-v2')
            
            logger.info(" SBERT model loaded successfully.")
        return cls._instance

    def get_model(self):
        return self._model

model_loader = ModelSingleton()