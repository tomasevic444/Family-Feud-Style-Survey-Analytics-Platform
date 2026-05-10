import logging
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

class ModelSingleton:
    """
    Singleton class to ensure the heavy AI model is loaded only once
    across the application lifecycle.
    """
    _instance = None
    _models = {}
    _default_model_id = "sentence-transformers/all-MiniLM-L6-v2"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelSingleton, cls).__new__(cls)
            logger.info("Loading SBERT model cache singleton.")
        return cls._instance

    def get_model(self, model_name: str | None = None):
        model_id = model_name or self._default_model_id
        if model_id in self._models:
            return self._models[model_id]
        logger.info("Loading SBERT model (%s)...", model_id)
        model = SentenceTransformer(model_id, trust_remote_code=True)
        self._models[model_id] = model
        logger.info("SBERT model loaded successfully (%s).", model_id)
        return model

model_loader = ModelSingleton()