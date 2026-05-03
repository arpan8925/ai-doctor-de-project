export type Role = "user" | "ai";

export type Message = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
};

export type Attachment = {
  id: string;
  name: string;
  kind: "image" | "pdf";
  size: number;
};

export type DifferentialItem = {
  name: string;
  icd10?: string;
  probability: number; // 0..1
};

export type RedFlag = {
  rule_id: string;
  label: string;
  rationale: string;
  severity: string;
};

export type ChatResponse = {
  ui: string;
  score: number;
  action: "ask" | "request_labs" | "commit" | "escalate" | string;
  differential: DifferentialItem[];
  red_flag?: RedFlag | null;
};

export type VitalSeries = {
  label: string;
  unit: string;
  values: number[]; // most-recent last
  normalRange: [number, number];
  status: "normal" | "watch" | "alert";
};

export type RecentSession = {
  id: string;
  patientName: string;
  startedAt: number;
  topDiagnosis: string;
  status: "active" | "awaiting_labs" | "closed";
  score: number;
};

export type PatientProfile = {
  name: string;
  age: number;
  sex: "M" | "F" | "O";
  locale: string;
  watchLinked: boolean;
  allergies: string[];
};
