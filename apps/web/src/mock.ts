import type {
  DifferentialItem,
  PatientProfile,
  VitalSeries,
} from "./types";

// Mock patient — wired to real onboarding form in Week 4.
export const MOCK_PATIENT: PatientProfile = {
  name: "Asha Patel",
  age: 34,
  sex: "F",
  locale: "en-IN",
  watchLinked: true,
  allergies: ["Penicillin"],
};

// Mock vitals — wired to Google Fit / smartwatch CSV in Week 9.
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const MOCK_VITALS: VitalSeries[] = [
  {
    label: "Heart rate",
    unit: "bpm",
    values: range(24).map((i) => 72 + Math.round(8 * Math.sin(i / 3) + (i > 16 ? 14 : 0))),
    normalRange: [60, 100],
    status: "watch",
  },
  {
    label: "SpO₂",
    unit: "%",
    values: range(24).map((i) => 97 + (i % 4 === 0 ? -1 : 0)),
    normalRange: [95, 100],
    status: "normal",
  },
  {
    label: "Sleep",
    unit: "h/night",
    values: [7.1, 6.8, 7.4, 5.2, 6.0, 4.8, 4.2],
    normalRange: [7, 9],
    status: "alert",
  },
  {
    label: "Steps",
    unit: "/day",
    values: [6200, 7100, 5400, 4900, 3200, 2100, 2800],
    normalRange: [5000, 12000],
    status: "watch",
  },
];

// Mock differential — replaced by real distribution in Week 3 (PDN engine).
export const MOCK_DIFFERENTIAL: DifferentialItem[] = [
  { name: "Migraine", icd10: "G43.9", probability: 0.62 },
  { name: "Tension headache", icd10: "G44.2", probability: 0.21 },
  { name: "Sinusitis", icd10: "J32.9", probability: 0.11 },
  { name: "Meningitis", icd10: "G03.9", probability: 0.04 },
  { name: "Other", probability: 0.02 },
];

export const QUICK_SYMPTOM_CHIPS = [
  "Fever",
  "Cough",
  "Headache",
  "Chest pain",
  "Stomach pain",
  "Rash",
  "Shortness of breath",
  "Dizziness",
  "Sore throat",
  "Body ache",
];

export const BODY_REGIONS = [
  { id: "head", label: "Head", emoji: "🧠" },
  { id: "chest", label: "Chest", emoji: "🫁" },
  { id: "abdomen", label: "Abdomen", emoji: "🫀" },
  { id: "back", label: "Back", emoji: "🦴" },
  { id: "limbs", label: "Arms/Legs", emoji: "🦵" },
  { id: "skin", label: "Skin", emoji: "✋" },
];
