// GENERATED: docs.plus's own conversion code, bundled alone. Do not edit by hand.
//
// From https://github.com/docs-plus/docs.plus (MIT) at a9b0c69, the commit the editors trial measured:
// apps/hocuspocus.server/src/modules/document-conversion/domain/{docxImport,conversionSchema,portableJson}.ts
// and what they import inside the repository. Packages stay imports (pinned below); the server's
// logger and metrics, which this code reaches, are replaced by stand-ins that do nothing.
// Rebuilt with esbuild --bundle --format=esm --packages=external (see server/docs-plus.ts).
// deno-lint-ignore-file
// @ts-nocheck
// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/docxImport.ts
import { isImageUrl } from "npm:@docs.plus/extension-hypermultimedia@2.2.0";
import mammoth from "npm:mammoth@1.13.0";

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/documentHtml.ts
import { DOMParser, DOMSerializer, Node as PMNode } from "npm:@tiptap/pm@3.32.0/model";
import { parseHTML } from "npm:linkedom@0.18.13";

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/conversionSchema.ts
import { Hyperlink as Hyperlink2 } from "npm:@docs.plus/extension-hyperlink@2.2.0";
import { getSchema as getSchema2 } from "npm:@tiptap/core@3.32.0";
import Highlight2 from "npm:@tiptap/extension-highlight@3.32.0";

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/lib/migration-extensions.ts
import { HyperMultimediaKit } from "npm:@docs.plus/extension-hypermultimedia@2.2.0";
import { InlineCode } from "npm:@docs.plus/extension-inline-code@2.2.0";
import { getSchema } from "npm:@tiptap/core@3.32.0";
import { Extension, Mark, Node } from "npm:@tiptap/core@3.32.0";
import Heading from "npm:@tiptap/extension-heading@3.32.0";
import { TaskItem, TaskList } from "npm:@tiptap/extension-list@3.32.0";
import Subscript from "npm:@tiptap/extension-subscript@3.32.0";
import Superscript from "npm:@tiptap/extension-superscript@3.32.0";
import { Table, TableCell, TableHeader, TableRow } from "npm:@tiptap/extension-table@3.32.0";
import { StarterKit } from "npm:@tiptap/starter-kit@3.32.0";
var MigrationHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "toc-id": { default: null }
    };
  }
});
var MediaUploadPlaceholderNode = Node.create({
  name: "mediaUploadPlaceholder",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      progress: { default: 0 },
      fileName: { default: "" },
      fileType: { default: "image" },
      uploadId: { default: "" },
      localUrl: { default: null },
      width: { default: null },
      height: { default: null }
    };
  }
});
var Hyperlink = Mark.create({
  name: "hyperlink",
  addAttributes() {
    return {
      href: { default: null },
      target: { default: null },
      rel: { default: null },
      class: { default: null },
      title: { default: null },
      image: { default: null }
    };
  }
});
var StoredWebappAttrs = Extension.create({
  name: "migrationStoredWebappAttrs",
  addGlobalAttributes() {
    return [
      { types: ["paragraph"], attributes: { paragraphStyle: { default: null } } },
      { types: ["table", "hyperlink"], attributes: { "toc-id": { default: null } } }
    ];
  }
});
var Highlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return { color: { default: null } };
  }
});
var migrationExtensions = [
  StarterKit.configure({ heading: false }),
  MigrationHeading,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  InlineCode,
  Superscript,
  Subscript,
  HyperMultimediaKit.configure({
    // Inline, matching the webapp (TipTap.tsx). Content expressions are only
    // evaluated by an explicit `.check()`, never by toYdoc/fromYdoc, so this is
    // byte-identical on every transform path. The inline setting exists so a schema
    // built from this set validates paragraph-wrapped images the way the editor does.
    Image: { inline: true },
    Video: true,
    Audio: true,
    Youtube: true,
    Vimeo: true,
    SoundCloud: true,
    Spotify: true,
    Loom: true,
    X: true
  }),
  MediaUploadPlaceholderNode,
  Hyperlink,
  Highlight,
  StoredWebappAttrs
];

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/conversionSchema.ts
var STUB_MARKS = /* @__PURE__ */ new Set(["hyperlink", "highlight"]);
var renderExtensions = [
  ...migrationExtensions.filter((extension) => !STUB_MARKS.has(extension.name)),
  Hyperlink2,
  Highlight2
];
var parseExtensions = renderExtensions.map(
  (extension) => extension.name === "starterKit" ? extension.configure({ link: false }) : extension
);
var renderSchema = null;
var parseSchema = null;
var getRenderSchema = () => renderSchema ??= getSchema2(renderExtensions);
var getParseSchema = () => parseSchema ??= getSchema2(parseExtensions);

// .scratch/docsplus/stub-pino.js
var noop = () => {
};
var logger = new Proxy({}, { get: (_t, k) => k === "child" ? () => logger : noop });
var pino = () => logger;
pino.stdSerializers = { err: (e) => e, req: (r) => r, res: (r) => r };
var stub_pino_default = pino;

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/lib/logger.ts
var isDevelopment = process.env.NODE_ENV === "development";
var baseLevel = (process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info")).toLowerCase();
var validLevels = /* @__PURE__ */ new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
var envLevel = (value, fallback) => {
  const lvl = (value || "").toLowerCase();
  return validLevels.has(lvl) ? lvl : fallback;
};
var logger2 = stub_pino_default({
  level: baseLevel,
  transport: isDevelopment ? {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: false
    }
  } : void 0,
  base: {
    env: process.env.NODE_ENV,
    app: "hocuspocus-server"
  },
  timestamp: () => `,"time":"${(/* @__PURE__ */ new Date()).toISOString()}"`,
  serializers: {
    err: stub_pino_default.stdSerializers.err,
    req: stub_pino_default.stdSerializers.req,
    res: stub_pino_default.stdSerializers.res
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "token",
      "accessToken",
      "refreshToken",
      // Pino matches top-level keys only; an OAuth body or an HTTP client error nests them.
      "access_token",
      "refresh_token",
      "*.access_token",
      "*.refresh_token",
      "*.headers.authorization",
      "err.config.headers.Authorization"
    ],
    censor: "[REDACTED]"
  }
});
var httpLogger = logger2.child(
  { module: "http" },
  { level: envLevel(process.env.HTTP_LOG_LEVEL, baseLevel) }
);
var dbLogger = logger2.child(
  { module: "database" },
  { level: envLevel(process.env.DB_LOG_LEVEL, baseLevel) }
);
var redisLogger = logger2.child(
  { module: "redis" },
  { level: envLevel(process.env.REDIS_LOG_LEVEL, "error") }
  // default: only errors
);
var queueLogger = logger2.child(
  { module: "queue" },
  { level: envLevel(process.env.QUEUE_LOG_LEVEL, baseLevel) }
);
var restApiLogger = logger2.child(
  { service: "rest-api" },
  { level: envLevel(process.env.REST_LOG_LEVEL, "error") }
  // default: only errors
);
var wsLogger = logger2.child(
  { service: "websocket" },
  { level: envLevel(process.env.WS_LOG_LEVEL, baseLevel) }
);
var workerLogger = logger2.child(
  { service: "worker" },
  { level: envLevel(process.env.WORKER_LOG_LEVEL, baseLevel) }
);
var documentsControllerLogger = logger2.child(
  { module: "documents-controller" },
  { level: envLevel(process.env.DOCUMENTS_CONTROLLER_LOG_LEVEL, baseLevel) }
);
var documentsServiceLogger = logger2.child(
  { module: "documents-service" },
  { level: envLevel(process.env.DOCUMENTS_SERVICE_LOG_LEVEL, baseLevel) }
);
var mediaServiceLogger = logger2.child(
  { module: "media-service" },
  { level: envLevel(process.env.MEDIA_SERVICE_LOG_LEVEL, baseLevel) }
);
var conversionLogger = logger2.child(
  { module: "document-conversion" },
  { level: envLevel(process.env.CONVERSION_LOG_LEVEL, baseLevel) }
);
var storageLocalLogger = logger2.child(
  { module: "storage-local" },
  { level: envLevel(process.env.STORAGE_LOCAL_LOG_LEVEL, baseLevel) }
);
var storageS3Logger = logger2.child(
  { module: "storage-s3" },
  { level: envLevel(process.env.STORAGE_S3_LOG_LEVEL, baseLevel) }
);
var jwtLogger = logger2.child(
  { module: "jwt" },
  { level: envLevel(process.env.JWT_LOG_LEVEL, baseLevel) }
);
var emailLogger = logger2.child(
  { module: "email" },
  { level: envLevel(process.env.EMAIL_LOG_LEVEL, baseLevel) }
);
var pushLogger = logger2.child(
  { module: "push" },
  { level: envLevel(process.env.PUSH_LOG_LEVEL, baseLevel) }
);
var adminLogger = logger2.child(
  { module: "admin" },
  { level: envLevel(process.env.ADMIN_LOG_LEVEL, baseLevel) }
);

// .scratch/docsplus/stub-prom.js
var Metric = class {
  inc() {
  }
  dec() {
  }
  set() {
  }
  observe() {
  }
  labels() {
    return this;
  }
  startTimer() {
    return () => 0;
  }
};
var Counter = class extends Metric {
};
var Gauge = class extends Metric {
};
var Histogram = class extends Metric {
};
var Registry = class {
  metrics() {
    return "";
  }
  registerMetric() {
  }
  setDefaultLabels() {
  }
  get contentType() {
    return "text/plain";
  }
};
var collectDefaultMetrics = () => {
};

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/package.json
var package_default = {
  name: "@docs.plus/hocuspocus",
  version: "2.2.0",
  private: true,
  description: "Hocuspocus is a suite of tools to bring collaboration to your application. It's based on Y.js (by Kevin Jahns), which is amazing to sync and merge changes from clients in real-time. But you can also use it to build offline-first apps, and sync changes later. We'll make sure to resolve conflicts and keep everything in sync, always.",
  main: "src/index.ts",
  scripts: {
    "dev:rest": "NODE_ENV=development bun --env-file=../../.env.local --watch src/index.ts",
    "dev:ws": "NODE_ENV=development bun --env-file=../../.env.local --watch src/hocuspocus.server.ts",
    "dev:worker": "NODE_ENV=development bun --env-file=../../.env.local --watch src/hocuspocus.worker.ts",
    "start:rest": "NODE_ENV=production bun scripts/start-production.ts",
    "start:ws": "NODE_ENV=production bun src/hocuspocus.server.ts",
    "start:worker": "NODE_ENV=production bun src/hocuspocus.worker.ts",
    build: "bun build src/index.ts src/hocuspocus.server.ts src/hocuspocus.worker.ts --outdir=dist --target=bun",
    typecheck: "tsc --noEmit",
    test: "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "test:e2e": "bun scripts/e2e-store-pipeline.ts",
    "test:e2e:limits": "bun scripts/e2e-backend-limits.ts",
    "test:e2e:content-inject": "bun --env-file=../../.env.local scripts/e2e-content-inject.ts",
    "test:e2e:change-attribution": "bun --env-file=../../.env.local scripts/e2e-change-attribution.ts",
    "test:e2e:document-changes": "bun --env-file=../../.env.local scripts/e2e-document-changes.ts",
    "test:e2e:duplicate-media": "PERSIST_TO_LOCAL_STORAGE=true bun --env-file=../../.env.local scripts/e2e-duplicate-media.ts",
    "test:e2e:occupancy": "REDIS_DB=15 bun --env-file=../../.env.local scripts/e2e-document-occupancy.ts",
    "doctor:observability": "bun scripts/smoke-observability.ts",
    "prisma:generate": "bun --env-file=../../.env.local x prisma generate --schema=./prisma/schema.prisma",
    "prisma:migrate": "bun --env-file=../../.env.local x prisma migrate dev",
    "prisma:migrate:deploy": "bun --env-file=../../.env.local x prisma migrate deploy --schema=./prisma/schema.prisma",
    "migrate:nested-to-flat": "bun --env-file=../../.env.local src/scripts/migrate-nested-to-flat.ts",
    "migrate:nested-to-flat:dry": "bun --env-file=../../.env.local src/scripts/migrate-nested-to-flat.ts --dry-run",
    "migrate:media-node-names": "bun --env-file=../../.env.local src/scripts/migrate-media-node-names.ts",
    "migrate:media-node-names:dry": "bun --env-file=../../.env.local src/scripts/migrate-media-node-names.ts --dry-run"
  },
  keywords: [],
  author: "Hossein Marzban",
  type: "module",
  devDependencies: {
    "@types/web-push": "^3.6.4",
    "bun-types": "catalog:",
    "pino-pretty": "^13.2.0",
    prisma: "^6.19.3"
  },
  dependencies: {
    "@docs.plus/email-templates": "workspace:*",
    "@docs.plus/extension-hyperlink": "workspace:*",
    "@docs.plus/extension-hypermultimedia": "workspace:*",
    "@docs.plus/extension-inline-code": "workspace:*",
    "@hocuspocus/extension-database": "catalog:",
    "@hocuspocus/extension-logger": "catalog:",
    "@hocuspocus/extension-redis": "catalog:",
    "@hocuspocus/extension-throttle": "catalog:",
    "@hocuspocus/server": "catalog:",
    "@hocuspocus/transformer": "catalog:",
    "@hono/zod-validator": "^0.9.1",
    "@modelcontextprotocol/server": "2.3.1",
    "@prisma/adapter-pg": "^6.19.3",
    "@prisma/client": "^6.19.3",
    "@sentry/bun": "^11.9.0",
    "@supabase/supabase-js": "catalog:",
    "@tiptap/core": "catalog:",
    "@tiptap/extension-heading": "catalog:",
    "@tiptap/extension-highlight": "catalog:",
    "@tiptap/extension-list": "catalog:",
    "@tiptap/extension-subscript": "catalog:",
    "@tiptap/extension-superscript": "catalog:",
    "@tiptap/extension-table": "catalog:",
    "@tiptap/markdown": "catalog:",
    "@tiptap/pm": "catalog:",
    "@tiptap/starter-kit": "catalog:",
    "@turbodocx/html-to-docx": "1.23.1",
    bullmq: "^6.3.12",
    hono: "^4.13.13",
    ioredis: "^6.0.0",
    isbot: "^5.2.2",
    linkedom: "0.18.13",
    mammoth: "1.13.0",
    metascraper: "5.50.6",
    "metascraper-author": "5.50.6",
    "metascraper-date": "5.50.6",
    "metascraper-description": "5.50.6",
    "metascraper-image": "5.50.6",
    "metascraper-lang": "5.50.6",
    "metascraper-logo": "5.50.6",
    "metascraper-publisher": "5.50.6",
    "metascraper-title": "5.50.6",
    "metascraper-url": "5.50.6",
    mime: "^4.1.0",
    nodemailer: "^10.2.1",
    pele: "1.8.0",
    pino: "^10.4.0",
    "prom-client": "^15.1.3",
    "rate-limiter-flexible": "^11.2.1",
    "short-unique-id": "^5.3.2",
    slugify: "^1.6.9",
    "web-push": "^3.6.7",
    yjs: "catalog:",
    zod: "^4.6.7"
  }
};

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/lib/metrics.ts
var register = new Registry();
collectDefaultMetrics({ register });
var buildInfo = new Gauge({
  name: "docsplus_build_info",
  help: "Build metadata for the running service (always 1)",
  labelNames: ["version", "service"],
  registers: [register]
});
buildInfo.set(
  {
    version: process.env.GIT_HASH || package_default.version,
    service: process.env.SENTRY_ROLE || "hocuspocus"
  },
  1
);
var httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register]
});
var httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register]
});
var activeConnectionsProvider = null;
var wsActiveConnections = new Gauge({
  name: "ws_active_connections",
  help: "Currently open WebSocket connections",
  registers: [register],
  collect() {
    if (activeConnectionsProvider) this.set(activeConnectionsProvider());
  }
});
var wsConnectionsTotal = new Counter({
  name: "ws_connections_total",
  help: "Total WebSocket connections opened",
  registers: [register]
});
var wsAuthRejectionsTotal = new Counter({
  name: "ws_auth_rejections_total",
  help: "Total WebSocket authentication rejections",
  labelNames: ["reason"],
  registers: [register]
});
var wsMessagesTotal = new Counter({
  name: "ws_messages_total",
  help: "Inbound collaboration messages by protocol type",
  labelNames: ["type"],
  registers: [register]
});
var wsAwarenessUpdatesTotal = new Counter({
  name: "ws_awareness_updates_total",
  help: "Total awareness (presence/cursor) update events",
  registers: [register]
});
var wsAwarenessFramesDroppedTotal = new Counter({
  name: "ws_awareness_frames_dropped_total",
  help: "Awareness frames refused over the size budget",
  registers: [register]
});
var activeDocumentsProvider = null;
var wsActiveDocuments = new Gauge({
  name: "ws_active_documents",
  help: "Documents currently loaded in server memory",
  registers: [register],
  collect() {
    if (activeDocumentsProvider) this.set(activeDocumentsProvider());
  }
});
var documentLoadDuration = new Histogram({
  name: "document_load_duration_seconds",
  help: "Document load time in seconds (fetch + decode)",
  buckets: [5e-3, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});
var documentPersistDuration = new Histogram({
  name: "document_persist_duration_seconds",
  help: "Hocuspocus store-hook duration in seconds (enqueue overhead, not DB write)",
  buckets: [1e-3, 5e-3, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});
var documentPersistFallbackTotal = new Counter({
  name: "document_persist_fallback_total",
  help: "Document saves that bypassed the queue and wrote directly to Postgres",
  registers: [register]
});
var documentStoreRejectionsTotal = new Counter({
  name: "document_store_rejections_total",
  help: "Document saves the store hook abandoned rather than rethrow, by reason",
  labelNames: ["reason"],
  registers: [register]
});
var documentExportImagesDroppedTotal = new Counter({
  name: "document_export_images_dropped_total",
  help: "Images removed from a document export rather than embedded, by reason",
  labelNames: ["reason"],
  registers: [register]
});
var statelessRelayDroppedTotal = new Counter({
  name: "stateless_relay_dropped_total",
  help: "Stateless relay payloads refused before broadcast, by reason",
  labelNames: ["reason"],
  registers: [register]
});
var documentContentApplyTotal = new Counter({
  name: "document_content_apply_total",
  help: "Document Content API applies by mode and outcome",
  labelNames: ["mode", "outcome"],
  registers: [register]
});
var documentOccupancyReadsTotal = new Counter({
  name: "document_occupancy_reads_total",
  help: "Occupancy reads taken before a content-change fan-out, by outcome",
  labelNames: ["outcome"],
  registers: [register]
});
var documentOccupancyWritesTotal = new Counter({
  name: "document_occupancy_writes_total",
  help: "Occupancy set writes by operation and outcome",
  labelNames: ["op", "outcome"],
  registers: [register]
});
var contentChangeFanoutTotal = new Counter({
  name: "content_change_fanout_total",
  help: "Content-change fan-outs after a save, by outcome",
  labelNames: ["outcome"],
  registers: [register]
});
var documentLastLeftStampsTotal = new Counter({
  name: "document_last_left_stamps_total",
  help: "Last left stamp attempts made when a document session closed, by outcome",
  labelNames: ["outcome"],
  registers: [register]
});
var rateLimitFailOpenTotal = new Counter({
  name: "rate_limit_fail_open_total",
  help: "Requests allowed through because the rate limiter could not decide, by reason",
  labelNames: ["reason", "bucket"],
  registers: [register]
});
var retentionLeaseTotal = new Counter({
  name: "retention_lease_total",
  help: "Retention sweep attempts by lease outcome",
  labelNames: ["outcome"],
  registers: [register]
});
var revertCooldownTotal = new Counter({
  name: "revert_cooldown_total",
  help: "history.revert cooldown decisions, by outcome",
  labelNames: ["outcome"],
  registers: [register]
});
var authTokenCacheLookupsTotal = new Counter({
  name: "auth_token_cache_lookups_total",
  help: "Supabase token verifications served from cache or sent to Auth, by result",
  labelNames: ["result"],
  registers: [register]
});
var ydocUpdateBytes = new Histogram({
  name: "ydoc_update_bytes",
  help: "Size in bytes of each applied Y.Doc update",
  buckets: [64, 256, 1024, 4096, 16384, 65536, 262144, 1048576],
  registers: [register]
});
var documentSnapshotBytes = new Histogram({
  name: "document_snapshot_bytes",
  help: "Size in bytes of each stored document snapshot",
  buckets: [256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864],
  registers: [register]
});
var jobDuration = new Histogram({
  name: "job_duration_seconds",
  help: "Background job processing time in seconds",
  labelNames: ["queue", "status"],
  registers: [register]
});
var jobsTotal = new Counter({
  name: "jobs_total",
  help: "Total background jobs processed",
  labelNames: ["queue", "status"],
  registers: [register]
});
var queueJobs = new Gauge({
  name: "queue_jobs",
  help: "Jobs per queue by state (depth)",
  labelNames: ["queue", "state"],
  registers: [register]
});
var pgmqMessagesTotal = new Counter({
  name: "pgmq_messages_total",
  help: "Total pgmq messages handled by the consumers",
  labelNames: ["queue", "status"],
  registers: [register]
});
var pgmqLastSuccessfulPoll = new Gauge({
  name: "pgmq_last_successful_poll_timestamp_seconds",
  help: "Unix time of the last successful pgmq queue read",
  labelNames: ["queue"],
  registers: [register]
});
var pgmqQueueLength = new Gauge({
  name: "pgmq_queue_length",
  help: "Messages currently sitting in each pgmq queue",
  labelNames: ["queue"],
  registers: [register]
});
var pgmqOldestMessageAge = new Gauge({
  name: "pgmq_oldest_message_age_seconds",
  help: "Age of the oldest message in each pgmq queue",
  labelNames: ["queue"],
  registers: [register]
});
var cronJobLastSuccess = new Gauge({
  name: "cron_job_last_success_timestamp_seconds",
  help: "Unix time of the last successful pg_cron job run",
  labelNames: ["jobname"],
  registers: [register]
});
var mediaWorkspaceMaxUsagePercent = new Gauge({
  name: "media_workspace_max_usage_percent",
  help: "Highest media storage quota usage across all workspaces",
  registers: [register]
});
var metricsContentType = register.contentType;

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/types.ts
var MAX_IMPORT_BYTES = 10 * 1024 * 1024;
var MAX_INFLATED_IMPORT_BYTES = 4 * MAX_IMPORT_BYTES;
var MAX_MARKDOWN_CHARS = 64 * 1024;
var MAX_EXPORT_IMAGE_BYTES = 10 * 1024 * 1024;
var MAX_EXPORT_INLINED_BYTES = 8 * 1024 * 1024;

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/lib/isRecord.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/mapNodes.ts
var mapNodes = (doc, swap) => {
  const content = [];
  const stack = [
    { source: Array.isArray(doc.content) ? doc.content : [], target: content }
  ];
  while (stack.length > 0) {
    const { source, target } = stack.pop();
    for (const child of source) {
      if (!isRecord(child)) continue;
      const swapped = swap(child);
      if (swapped === "drop") continue;
      if (swapped) {
        target.push(swapped);
        continue;
      }
      const copy = { ...child };
      if (Array.isArray(child.content)) {
        const nested = [];
        copy.content = nested;
        stack.push({ source: child.content, target: nested });
      }
      target.push(copy);
    }
  }
  return { ...doc, content };
};

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/portableJson.ts
var EMBED_NODE_TYPES = /* @__PURE__ */ new Set([
  "youtube",
  "vimeo",
  "loom",
  "x",
  "spotify",
  "soundcloud",
  "video",
  "audio"
]);
var MEDIA_UPLOAD_PLACEHOLDER = "mediaUploadPlaceholder";
var embedToParagraph = (node) => {
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const src = typeof attrs.src === "string" ? attrs.src : "";
  const caption = typeof attrs.caption === "string" ? attrs.caption.trim() : "";
  const label = caption || src;
  if (label.length === 0) return { type: "paragraph" };
  const text = { type: "text", text: label };
  if (src.length > 0) text.marks = [{ type: "hyperlink", attrs: { href: src } }];
  return { type: "paragraph", content: [text] };
};
var toPortableJson = (doc) => mapNodes(doc, (node) => {
  if (node.type === MEDIA_UPLOAD_PLACEHOLDER) return "drop";
  if (typeof node.type === "string" && EMBED_NODE_TYPES.has(node.type)) {
    return embedToParagraph(node);
  }
  return null;
});

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/documentHtml.ts
var FULL_DOCUMENT = /^\s*(?:<!doctype[^>]*>\s*)?<html[\s>]/i;
var parseDocumentHtml = (html) => {
  const source = FULL_DOCUMENT.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`;
  const { document } = parseHTML(source);
  const parsed = DOMParser.fromSchema(getParseSchema()).parse(document.body);
  return parsed.toJSON();
};

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/ensureTitleHeading.ts
var TITLE_LEVEL = 1;
var inlineText = (node) => {
  if (!Array.isArray(node.content)) return "";
  return node.content.map((child) => isRecord(child) && typeof child.text === "string" ? child.text : "").join("");
};
var asTitleHeading = (node) => ({
  ...node,
  attrs: { ...isRecord(node.attrs) ? node.attrs : {}, level: TITLE_LEVEL }
});
var promotedHeading = (node) => ({
  type: "heading",
  attrs: { level: TITLE_LEVEL },
  content: Array.isArray(node.content) ? node.content.map((child) => {
    if (!isRecord(child)) return child;
    const stripped = { ...child };
    delete stripped.marks;
    return stripped;
  }) : []
});
var synthesizedHeading = (fallbackTitle) => {
  const title = fallbackTitle.trim();
  const heading = { type: "heading", attrs: { level: TITLE_LEVEL } };
  if (title.length > 0) heading.content = [{ type: "text", text: title }];
  return heading;
};
var ensureTitleHeading = (doc, fallbackTitle) => {
  const content = Array.isArray(doc.content) ? doc.content : [];
  const [first, ...rest] = content;
  if (isRecord(first) && first.type === "heading") {
    return { doc: { ...doc, content: [asTitleHeading(first), ...rest] }, branch: "already-heading" };
  }
  if (isRecord(first) && first.type === "paragraph" && inlineText(first).trim().length > 0) {
    return {
      doc: { ...doc, content: [promotedHeading(first), ...rest] },
      branch: "promoted-paragraph"
    };
  }
  return {
    doc: { ...doc, content: [synthesizedHeading(fallbackTitle), ...content] },
    branch: "synthesized"
  };
};
var titleHeadingText = (doc) => {
  const [first] = Array.isArray(doc.content) ? doc.content : [];
  return isRecord(first) ? inlineText(first).trim() : "";
};
var titleHeadingWarning = (branch, title) => {
  if (branch === "promoted-paragraph") {
    return {
      code: "title-promoted-paragraph",
      message: `The document opened on a paragraph, so "${title}" became its title.`
    };
  }
  if (branch === "synthesized") {
    return {
      code: "title-synthesized",
      message: `The document opened on no usable text, so its title was set to "${title}".`
    };
  }
  return null;
};

// ../../editors_trial/repos/docs-plus/apps/hocuspocus.server/src/modules/document-conversion/domain/docxImport.ts
var DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p.Title => h1:fresh",
  "p[style-name='Subtitle'] => p:fresh",
  "p.Subtitle => p:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p.Quote => blockquote:fresh",
  "u => u",
  "strike => s"
];
var toWarning = (message) => ({
  code: message.type === "error" ? "media-placeholder-dropped" : "unsupported-element",
  message: message.message
});
var importDocx = async (buffer, { fallbackTitle, uploadImage }) => {
  let position = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    const index = ++position;
    let src;
    try {
      src = await uploadImage(await image.readAsBuffer(), image.contentType);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Image ${index} (${image.contentType}) could not be uploaded: ${reason}`);
    }
    if (!isImageUrl(src)) {
      throw new Error(`Image ${index} was dropped: ${src} is not a readable image URL.`);
    }
    return { src };
  });
  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer },
    { styleMap: DOCX_STYLE_MAP, convertImage }
  );
  const { doc, branch } = ensureTitleHeading(parseDocumentHtml(html), fallbackTitle);
  const title = titleHeadingText(doc) || fallbackTitle.trim();
  const warnings = messages.map(toWarning);
  const titled = titleHeadingWarning(branch, title);
  if (titled) warnings.push(titled);
  return { content: doc, title, warnings };
};
export {
  getRenderSchema,
  importDocx,
  toPortableJson
};
