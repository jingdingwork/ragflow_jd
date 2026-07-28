export interface ITestRetrievalRequestBody {
  question: string;
  similarity_threshold: number;
  vector_similarity_weight: number;
  rerank_id?: string;
  top_k?: number;
  use_kg?: boolean;
  highlight?: boolean;
  kb_id?: string[];
  meta_data_filter?: {
    logic?: string;
    method?: string;
    manual?: Array<{
      key: string;
      op: string;
      value: string;
    }>;
    semi_auto?: string[];
  };
}

export interface IFetchKnowledgeListRequestBody {
  owner_ids?: string[];
}

export interface IFetchKnowledgeListRequestParams {
  id?: string;
  page?: number;
  page_size?: number;
  ext?: {
    keywords?: string;
    owner_ids?: string[];
    parser_id?: string;
    /** Visibility bucket: 'company' (company-wide) or 'dept' (everything else). */
    scope?: string;
  };
}

export interface IFetchDocumentListRequestBody {
  suffix?: string[];
  // Backend reads this as the query param `run` (TaskStatus values, e.g. "4"
  // = failed). Must be named `run`, not `run_status`, or the status filter is
  // silently dropped and filtering by status returns nothing.
  run?: string[];
  return_empty_metadata?: boolean;
  metadata?: Record<string, string[]>;
  /** Virtual-folder scope: "" = root, "a/b" = that folder; omit for flat list. */
  folder?: string;
  /** When true, include documents in descendant folders too. */
  folder_recursive?: boolean;
}
