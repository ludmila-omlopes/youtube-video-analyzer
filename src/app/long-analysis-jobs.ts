import type {
  GetLongAnalysisJobToolOutput,
  LongToolInput,
  StartLongAnalysisJobToolOutput,
} from "../lib/schemas.js";

export interface LongAnalysisJobs {
  enqueueLongAnalysis(input: LongToolInput): Promise<StartLongAnalysisJobToolOutput>;
  getLongAnalysisJob(jobId: string): Promise<GetLongAnalysisJobToolOutput>;
}
