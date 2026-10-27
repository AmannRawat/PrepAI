import mongoose from "mongoose";

const SourceSnapshotSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
    },
    repo: {
      type: String,
      required: true,
    },
    commitSha: {
      type: String,
      default: "HEAD",
    },
    branch: {
      type: String,
      default: "main",
    },
    status: {
      type: String,
      default: "success",
    },
    filesScanned: {
      type: Number,
      default: 0,
    },
    recordsParsed: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const catalogSyncLogSchema = new mongoose.Schema(
  {
    syncId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["in_progress", "success", "partial", "failed"],
      default: "in_progress",
      index: true,
    },
    sourceSnapshots: {
      type: [SourceSnapshotSchema],
      default: [],
    },
    metrics: {
      imported: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      totalProcessed: { type: Number, default: 0 },
      totalInCatalog: { type: Number, default: 0 },
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "catalog_sync_logs",
  }
);

const CatalogSyncLog =
  mongoose.models.CatalogSyncLog ||
  mongoose.model("CatalogSyncLog", catalogSyncLogSchema);

export default CatalogSyncLog;
