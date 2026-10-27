import mongoose from "mongoose";
const { Schema } = mongoose;

const studyPlanSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    onboardingProfile: {
      targetCompanies: { type: String, default: "" },
      topicsCovered: { type: String, default: "" },
      weakTopics: { type: String, default: "" },
      skillLevel: { type: String, default: "" },
      dailyTime: { type: String, default: "" },
      schedule: { type: String, default: "" },
    },
    plan: {
      title: { type: String, default: "Your DSA Preparation Plan" },
      dailyTarget: { type: String, default: "" },
      focusAreas: { type: String, default: "" },
      schedule: [
        {
          day: { type: String, required: true },
          topic: { type: String, required: true },
          task: { type: String, required: true },
        },
      ],
      dailyRoutine: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

const StudyPlan = mongoose.model("StudyPlan", studyPlanSchema);
export default StudyPlan;
