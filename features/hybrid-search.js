import path from "path";
import { cosineSimilarity } from "../lib/utils.js";

export class HybridSearch {
  constructor(embedder, cache, config, indexer = null) {
    this.embedder = embedder;
    this.cache = cache;
    this.config = config;
    this.indexer = indexer; // Reference to indexer for status checking
  }

  async search(query, maxResults, scopePath = "") {
    const hasAnnSearch = typeof this.cache?.searchByVector === "function";

    // Show warning if indexing is still in progress but we have some results
    let indexingWarning = null;
    if (this.indexer?.indexingStatus?.inProgress) {
      indexingWarning = `⚠️ Indexing in progress (${this.indexer.indexingStatus.percentage}% complete). Results shown are from partially indexed codebase.\n\n`;
    }

    // Generate query embedding
    const queryEmbed = await this.embedder(query, { pooling: "mean", normalize: true });
    const queryVector = Array.from(queryEmbed.data);

    // Build Milvus filter for scoped search
    const filter = scopePath ? `file like '${scopePath.replace(/'/g, "\\'")}%'` : null;

    if (hasAnnSearch) {
      const annTopK = Math.max(maxResults * 5, 20);
      const candidates = await this.cache.searchByVector(queryVector, annTopK, filter);

      const scoredChunks = candidates.map((chunk) => {
        // Base semantic score from provider (Milvus or fallback cache) plus lexical boost.
        let score = Number(chunk.score || 0) * this.config.semanticWeight;

        const lowerQuery = query.toLowerCase();
        const lowerContent = String(chunk.content || "").toLowerCase();

        if (lowerContent.includes(lowerQuery)) {
          score += this.config.exactMatchBoost;
        } else {
          const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
          const matchedWords = queryWords.filter(
            (word) => word.length > 2 && lowerContent.includes(word)
          ).length;
          const lexicalBoost = queryWords.length > 0 ? (matchedWords / queryWords.length) * 0.3 : 0;
          score += lexicalBoost;
        }

        return { ...chunk, score };
      });

      const results = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      if (results.length === 0) {
        const stats = typeof this.cache?.getStats === "function"
          ? await this.cache.getStats().catch(() => null)
          : null;
        const totalChunks = Number(stats?.totalChunks || 0);

        if (totalChunks === 0) {
          if (this.indexer?.indexingStatus?.inProgress) {
            return {
              results: [],
              message: `Indexing in progress (${this.indexer.indexingStatus.percentage}% complete). Search available but results may be incomplete. Please wait for indexing to finish for full coverage.`
            };
          }
          return {
            results: [],
            message: "No code has been indexed yet. Please wait for initial indexing to complete."
          };
        }
      }

      return { results, message: null, indexingWarning };
    }

    // Legacy fallback: in-memory vector scoring.
    const vectorStore = this.cache.getVectorStore();

    if (vectorStore.length === 0) {
      if (this.indexer?.indexingStatus?.inProgress) {
        return {
          results: [],
          message: `Indexing in progress (${this.indexer.indexingStatus.percentage}% complete). Search available but results may be incomplete. Please wait for indexing to finish for full coverage.`
        };
      }
      return {
        results: [],
        message: "No code has been indexed yet. Please wait for initial indexing to complete."
      };
    }

    const scoredChunks = vectorStore.map((chunk) => {
      let score = cosineSimilarity(queryVector, chunk.vector) * this.config.semanticWeight;

      const lowerQuery = query.toLowerCase();
      const lowerContent = chunk.content.toLowerCase();

      if (lowerContent.includes(lowerQuery)) {
        score += this.config.exactMatchBoost;
      } else {
        const queryWords = lowerQuery.split(/\s+/);
        const matchedWords = queryWords.filter((word) =>
          word.length > 2 && lowerContent.includes(word)
        ).length;
        score += (matchedWords / queryWords.length) * 0.3;
      }

      return { ...chunk, score };
    });

    const results = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return { results, message: null, indexingWarning };
  }

  formatResults(results) {
    if (results.length === 0) {
      return "No matching code found for your query.";
    }

    return results.map((r, idx) => {
      const relPath = path.relative(this.config.searchDirectory, r.file);
      return `## Result ${idx + 1} (Relevance: ${(r.score * 100).toFixed(1)}%)\n` +
        `**File:** \`${relPath}\`\n` +
        `**Lines:** ${r.startLine}-${r.endLine}\n\n` +
        "```" + path.extname(r.file).slice(1) + "\n" +
        r.content + "\n" +
        "```\n";
    }).join("\n");
  }
}

// MCP Tool definition for this feature
export function getToolDefinition(config) {
  return {
    name: "a_semantic_search",
    description: "Performs intelligent hybrid code search combining semantic understanding with exact text matching. Ideal for finding code by meaning (e.g., 'authentication logic', 'database queries') even with typos or variations. Returns the most relevant code snippets with file locations and line numbers.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be natural language (e.g., 'where do we handle user login') or specific terms"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: from config)",
          default: config.maxResults
        },
        scopePath: {
          type: "string",
          description: "Limit search to files under this absolute path prefix (e.g., '/path/to/subfolder'). Empty string searches all.",
          default: ""
        }
      },
      required: ["query"]
    },
    annotations: {
      title: "Semantic Code Search",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  };
}

// Tool handler
export async function handleToolCall(request, hybridSearch) {
  const query = request.params.arguments.query;
  const maxResults = request.params.arguments.maxResults || hybridSearch.config.maxResults;
  const scopePath = request.params.arguments.scopePath || "";

  const { results, message, indexingWarning } = await hybridSearch.search(query, maxResults, scopePath);

  if (message) {
    return {
      content: [{ type: "text", text: message }]
    };
  }

  let formattedText = hybridSearch.formatResults(results);

  // Prepend indexing warning if present
  if (indexingWarning) {
    formattedText = indexingWarning + formattedText;
  }

  return {
    content: [{ type: "text", text: formattedText }]
  };
}
