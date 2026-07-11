export type DetectedFaqItem = {
  question: string;
  normalized_question: string;
  suggested_answer: string;
  category: string;
  evidence_count: number;
  confidence: number;
};

export type FaqDetectionAiResult = {
  detected_faqs: DetectedFaqItem[];
};
