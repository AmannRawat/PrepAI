import mongoose from "mongoose";

const SourceProvenanceSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      trim: true,
    },
    timeframe: {
      type: String,
      default: "all-time",
      trim: true,
    },
    frequency: {
      type: Number,
      default: 0,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const companyQuestionSchema = new mongoose.Schema(
  {
    problemSlug: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      required: true,
      index: true,
      default: "Medium",
    },
    topics: {
      type: [String],
      default: [],
      index: true,
    },
    frequency: {
      type: Number,
      default: 0,
      index: true,
    },
    acceptanceRate: {
      type: Number,
      default: 0,
    },
    recency: {
      type: String,
      default: "all-time",
      trim: true,
    },
    recencyScore: {
      type: Number,
      default: 5,
      index: true,
    },
    sources: {
      type: [String],
      default: [],
    },
    sourceProvenance: {
      type: [SourceProvenanceSchema],
      default: [],
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "company_questions",
  }
);

// Idempotent upsert uniqueness: each problem has exactly one document per company
companyQuestionSchema.index({ problemSlug: 1, company: 1 }, { unique: true });

// Performance queries for company-specific retrieval and ranking
companyQuestionSchema.index({ company: 1, recencyScore: 1, frequency: -1 });
companyQuestionSchema.index({ company: 1, difficulty: 1, frequency: -1 });
companyQuestionSchema.index({ company: 1, topics: 1, frequency: -1 });

const CompanyQuestion =
  mongoose.models.CompanyQuestion ||
  mongoose.model("CompanyQuestion", companyQuestionSchema);

export default CompanyQuestion;
