from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


SUPPORTED_EMBEDDING_MODELS = [
    "sentence-transformers/all-MiniLM-L6-v2",
    "BAAI/bge-m3",
    "intfloat/multilingual-e5-large-instruct",
]


class ProcessingConfig(BaseModel):
    run_label: Optional[str] = Field(default=None, max_length=120)
    clustering_method: Literal[
        "agglomerative_threshold",
        "kmeans_auto_k",
        "kmeans_fixed_k",
    ] = "agglomerative_threshold"
    distance_threshold: float = Field(default=1.0, ge=0.01, le=5.0)
    min_k: int = Field(default=2, ge=2, le=200)
    max_k: int = Field(default=40, ge=2, le=500)
    fixed_k: Optional[int] = Field(default=None, ge=2, le=500)
    embedding_model: str = Field(default="sentence-transformers/all-MiniLM-L6-v2")
    excluded_words: List[str] = Field(default_factory=list)
    use_excluded_words: bool = False

    @field_validator("run_label")
    @classmethod
    def normalize_run_label(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        return s or None

    @field_validator("embedding_model")
    @classmethod
    def validate_embedding_model(cls, v: str) -> str:
        if v not in SUPPORTED_EMBEDDING_MODELS:
            raise ValueError(f"Unsupported embedding model '{v}'")
        return v

    @field_validator("excluded_words")
    @classmethod
    def normalize_excluded_words(cls, v: List[str]) -> List[str]:
        out: List[str] = []
        seen = set()
        for item in v:
            s = " ".join(str(item).strip().lower().split())
            if not s:
                continue
            if s in seen:
                continue
            seen.add(s)
            out.append(s)
        return out

    @model_validator(mode="after")
    def validate_k_constraints(self) -> "ProcessingConfig":
        if self.min_k > self.max_k:
            raise ValueError("min_k must be <= max_k")
        if self.clustering_method == "kmeans_fixed_k" and self.fixed_k is None:
            raise ValueError("fixed_k is required when clustering_method='kmeans_fixed_k'")
        return self

