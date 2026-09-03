#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// kb-sync — populate the Qjo Knowledge Base collection in Qdrant Cloud.
//
//   QDRANT_URL=https://… QDRANT_API_KEY=… npm run kb:sync            # upsert
//   QDRANT_URL=… QDRANT_API_KEY=… npm run kb:sync -- --recreate      # rebuild
//
// Requires embedding credentials (HUGGINGFACE_API_KEYS by default, same
// provider selection as the server). The collection is created with the
// model's native dimensions and Cosine distance. Re-run after editing
// knowledge/qkb-v1.json — point IDs are stable (entry order), so upserts
// overwrite cleanly.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const crypto = require('crypto');

const { createEmbeddingsService } = require('../src/services/embeddings');
const { loadKnowledgeDirectory, entryEmbedText, entryPayload } = require('../src/services/knowledgeBase');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const COLLECTION = process.env.QDRANT_KB_COLLECTION || 'qjo_kb_v1';
const QDRANT_URL = process.env.QDRANT_URL || '';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const RECREATE = process.argv.includes('--recreate');

function stableCacheKey(namespace, value) {
  return `${namespace}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}`;
}

const memoryCache = new Map();
const embeddingsService = createEmbeddingsService({
  embeddingKeys: String(process.env.EMBEDDING_API_KEYS || process.env.EMBEDDING_API_KEY || '').split(',').map(s => s.trim()).filter(Boolean),
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'openai',
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL || '',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  huggingFaceKeys: String(process.env.HUGGINGFACE_API_KEYS || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY || '').split(',').map(s => s.trim()).filter(Boolean),
  huggingFaceModel: process.env.HUGGINGFACE_EMBEDDING_MODEL || 'intfloat/multilingual-e5-base',
  huggingFaceUrl: process.env.HUGGINGFACE_EMBEDDING_URL || '',
  stableCacheKey,
  cacheGet: (cache, key) => cache.get(key),
  cacheSet: (cache, key, value) => cache.set(key, value),
  cache: memoryCache
});

async function embedAll(texts) {
  const vectors = [];
  const batchSize = 24;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    process.stdout.write(`  embedding ${Math.min(i + batch.length, texts.length)}/${texts.length}\n`);
    const result = await embeddingsService.callEmbeddingProvider(batch, { roles: batch.map(() => 'passage') });
    if (!result.vectors || result.vectors.length !== batch.length) throw new Error('Embedding provider returned an unexpected vector count.');
    vectors.push(...result.vectors);
  }
  return vectors;
}

async function main() {
  if (!QDRANT_URL) {
    console.error('✗ QDRANT_URL is not set. Create a free cluster at cloud.qdrant.io, then run:');
    console.error('  QDRANT_URL=… QDRANT_API_KEY=… npm run kb:sync');
    process.exit(1);
  }
  let QdrantClient;
  try {
    ({ QdrantClient } = require('@qdrant/js-client-rest'));
  } catch {
    console.error('✗ @qdrant/js-client-rest is not installed. Run: npm install');
    process.exit(1);
  }

  const { version, entries } = loadKnowledgeDirectory(KNOWLEDGE_DIR);
  console.log(`→ Loaded ${entries.length} entries (${version}) from ${path.relative(process.cwd(), KNOWLEDGE_DIR)}`);

  const texts = entries.map(entryEmbedText);
  const vectors = await embedAll(texts);
  const dims = vectors[0].length;
  console.log(`→ Embedded with ${embeddingsService.getEmbeddingProviderName()} (${dims} dims)`);

  const client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
  const exists = await client.collectionExists(COLLECTION);
  if (exists.exists && RECREATE) {
    console.log(`→ Deleting existing collection "${COLLECTION}" (--recreate)`);
    await client.deleteCollection(COLLECTION);
  }
  if (!exists.exists || RECREATE) {
    console.log(`→ Creating collection "${COLLECTION}" (size ${dims}, Cosine)`);
    await client.createCollection(COLLECTION, { vectors: { size: dims, distance: 'Cosine' } });
  }

  const points = entries.map((entry, i) => ({
    id: i + 1,
    vector: vectors[i],
    payload: { ...entryPayload(entry), layer: entry.layer, kbVersion: version }
  }));

  const upsertBatch = 64;
  for (let i = 0; i < points.length; i += upsertBatch) {
    await client.upsert(COLLECTION, { points: points.slice(i, i + upsertBatch), wait: true });
    process.stdout.write(`  upserted ${Math.min(i + upsertBatch, points.length)}/${points.length}\n`);
  }

  const info = await client.getCollection(COLLECTION);
  console.log(`✓ KB sync complete: "${COLLECTION}" now has ${info.points_count} points (expected ${points.length}).`);
  if (Number(info.points_count) !== points.length) {
    console.error('✗ Point count mismatch — re-run with --recreate.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('✗ kb-sync failed:', error?.message || error);
  process.exit(1);
});
