#!/usr/bin/env node
/**
 * smart-coding-mcp 리인덱싱 스크립트 (shell 직접 실행용)
 * MCP 서버 없이 직접 인덱싱, 로그 출력
 *
 * 사용법:
 *   node reindex.js /path/to/workspace [--force]
 *
 * 환경 변수는 MCP config와 동일하게 설정 필요.
 */
import { loadConfig } from "./lib/config.js";
import { createCache } from "./lib/cache-factory.js";
import { createEmbedder } from "./lib/mrl-embedder.js";
import { CodebaseIndexer } from "./features/index-codebase.js";
import { parseArgs } from "util";

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        force: { type: "boolean", short: "f", default: false },
        help: { type: "boolean", short: "h", default: false },
    },
});

if (values.help) {
    console.log(`
smart-coding-mcp 리인덱싱 (shell 직접 실행)

Usage:
  node reindex.js [workspace_path] [--force]

Options:
  -f, --force   전체 재인덱싱 (캐시 무시)
  -h, --help    도움말

Environment:
  MCP config의 env를 그대로 사용합니다.
  SMART_CODING_EMBEDDING_PROVIDER, SMART_CODING_GEMINI_BATCH_SIZE 등
  `);
    process.exit(0);
}

const workspaceDir = positionals[0] || process.cwd();
const force = values.force;

function log(msg) {
    const ts = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    console.log(`[${ts}] ${msg}`);
}

async function main() {
    log(`🚀 Reindex 시작: ${workspaceDir}`);
    log(`   force=${force}`);

    // 1. 설정 로드
    const config = await loadConfig(workspaceDir);
    log(`   searchDirectory: ${config.searchDirectory}`);
    log(`   cacheDirectory: ${config.cacheDirectory}`);
    log(`   extensions: ${config.fileExtensions?.length || "?"} types`);
    log(`   excludePatterns: ${config.excludePatterns?.length || "?"} patterns`);
    console.log();

    // 2. 임베더 로드
    log("🧠 임베더 로딩...");
    const embedder = await createEmbedder(config);
    log(`   model: ${embedder.modelName} (${embedder.dimension}d, device: ${embedder.device})`);

    // 3. 캐시 로드
    log("💾 캐시 로딩...");
    const cache = createCache(config);
    await cache.load();

    const statsBefore = cache.getStats?.() || {};
    log(`   캐시 항목: ${statsBefore.totalEntries ?? "?"}`);

    // 4. 인덱서 생성 & 실행
    log("📁 인덱싱 시작...");
    console.log();

    const t0 = Date.now();
    const indexer = new CodebaseIndexer(embedder, cache, config);
    const result = await indexer.indexAll(force);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    console.log();
    log("🎉 완료!");
    log(`   파일: ${result.filesProcessed ?? "?"}개`);
    log(`   청크: ${result.chunksProcessed ?? "?"}개`);
    log(`   새로운 파일: ${result.newFiles ?? "?"}개`);
    log(`   업데이트: ${result.updatedFiles ?? "?"}개`);
    log(`   스킵: ${result.skippedFiles ?? "?"}개`);
    log(`   삭제: ${result.deletedFiles ?? "?"}개`);
    log(`   소요: ${elapsed}s`);

    // 5. 캐시 저장
    if (cache.save) {
        await cache.save();
        log("💾 캐시 저장 완료");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error(`\n❌ 에러: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
