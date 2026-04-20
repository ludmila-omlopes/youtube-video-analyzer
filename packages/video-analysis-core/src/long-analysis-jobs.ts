import type {
  GetLongAnalysisJobToolOutput,
  LongToolInput,
  StartLongAnalysisJobToolOutput,
} from "./youtube-core/schemas.js";

export interface LongAnalysisJobs {
  enqueueLongAnalysis(input: LongToolInput): Promise<StartLongAnalysisJobToolOutput>;
  getLongAnalysisJob(jobId: string): Promise<GetLongAnalysisJobToolOutput>;
}
