// Practice scenarios for a generic outbound higher-ed inquiry call.
// Everything here is fictional and generic: the school, the people, and the wording.
// No client scripts or proprietary training material are used.

export const SCHOOL_NAME = "Lakeview State University";

export interface FlowStep {
  id: string;
  label: string;
  guide: string;
}

// The standard call flow agents are scored against, in the expected order.
export const CALL_FLOW: FlowStep[] = [
  {
    id: "greeting",
    label: "Opening",
    guide: `Introduce yourself by first and last name, say you're calling from ${SCHOOL_NAME}, and ask how they're doing.`,
  },
  {
    id: "right_party",
    label: "Right-party check",
    guide: "Confirm you're speaking with the person who requested information before going further.",
  },
  {
    id: "recording_disclosure",
    label: "Recording disclosure",
    guide: "Tell them the call may be monitored or recorded for quality and training, before asking any questions.",
  },
  {
    id: "confirm_request",
    label: "Confirm the request",
    guide: "Confirm they requested information about their program of interest.",
  },
  {
    id: "qualify_education",
    label: "Education question",
    guide: "Ask for their highest level of education completed so far.",
  },
  {
    id: "qualify_military",
    label: "Military question",
    guide: "Ask whether they're affiliated with the U.S. military as a service member, spouse, or dependent.",
  },
  {
    id: "transfer_setup",
    label: "Warm transfer",
    guide: "Explain an admissions counselor will be their personal point of contact, mention a brief pause, and bring them on the line.",
  },
];

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface Scenario {
  id: string;
  title: string;
  difficulty: Difficulty;
  // Shown to the agent before the call.
  focus: string;
  // Name on the lead record the agent is calling.
  leadName: string;
  program: string;
  // Hidden from the agent: drives the AI prospect's behavior.
  persona: string;
  // Scenario-specific criteria the scorer checks in addition to the standard flow.
  successCriteria: string[];
  // Which standard steps don't apply (for example, no qualifying a third party).
  notApplicable?: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "cooperative",
    title: "Ready to talk",
    difficulty: "Easy",
    focus: "A friendly prospect who is expecting the call. Nail every step of the flow in order.",
    leadName: "Jordan Ellis",
    program: "Bachelor's in Business Administration",
    persona: `You are Jordan Ellis, 29, a shift supervisor at a warehouse. You requested info about the Bachelor's in Business Administration online last week and you're glad someone called.
Highest education: high school diploma plus a few community college classes, no degree. No military affiliation.
You're friendly and answer questions directly. You might ask one light question, like how long the program takes.`,
    successCriteria: [
      "Completes every step of the standard flow in order",
      "Does not guess at program length, cost, or admission; defers details to the admissions counselor",
    ],
  },
  {
    id: "parent-answers",
    title: "Someone else picks up",
    difficulty: "Medium",
    focus: "The person on the lead isn't the one who answers. Handle the right-party check professionally.",
    leadName: "Marcus Reed",
    program: "Associate in Information Technology",
    persona: `You are Denise Reed, Marcus Reed's mother. Marcus (22) is at work until 6pm. He did mention looking at schools.
You are polite but protective. Ask who is calling and why before sharing anything.
If the agent starts asking you qualifying questions about Marcus (education, military), answer vaguely and ask why they need that.
If the agent offers to call back, agree and say evenings after 6:30 are best. You can take a message if asked.`,
    successCriteria: [
      "Identifies they are not speaking with the lead and does not qualify through the third party",
      "Keeps details about the inquiry minimal with the third party",
      "Sets a specific callback time or leaves a clear message",
    ],
    notApplicable: ["recording_disclosure", "confirm_request", "qualify_education", "qualify_military", "transfer_setup"],
  },
  {
    id: "never-requested",
    title: "\"I never asked for this\"",
    difficulty: "Medium",
    focus: "The prospect doesn't remember requesting info. Stay calm, jog their memory, and don't push.",
    leadName: "Taylor Brooks",
    program: "Bachelor's in Psychology",
    persona: `You are Taylor Brooks, 34, a dental receptionist. About three weeks ago you filled out a form on a college comparison website late at night, but you've forgotten.
Open skeptical: "I didn't request anything." If the agent calmly mentions the program (Psychology) and that it came from an online form, you slowly remember and warm up.
If the agent is pushy or argues, get annoyed and say you need to go.
Highest education: associate degree in office administration. No military affiliation.`,
    successCriteria: [
      "Stays calm and non-argumentative when the prospect denies requesting info",
      "Uses specifics (program, online request) to help them remember rather than insisting",
      "Continues the flow only once the prospect confirms interest",
    ],
  },
  {
    id: "cost-questions",
    title: "\"Just tell me the price\"",
    difficulty: "Medium",
    focus: "The prospect keeps pushing for tuition and financial aid numbers. Redirect without quoting anything.",
    leadName: "Alicia Moreno",
    program: "RN to BSN (Nursing)",
    persona: `You are Alicia Moreno, 38, a working registered nurse with an associate degree in nursing. No military affiliation.
You're interested but money is your main concern. Early and repeatedly ask: "How much is tuition?" "Do you offer financial aid?" "Will my employer reimbursement cover it?"
If the agent gives you actual numbers or promises about aid, accept them happily (this is a mistake on their part).
If the agent explains the admissions counselor can go over costs and aid in detail, accept it after the second redirect and continue.`,
    successCriteria: [
      "Never quotes tuition, fees, or financial aid amounts and never promises aid or employer coverage",
      "Acknowledges the cost concern with empathy and redirects to the admissions counselor",
      "Keeps control of the call and still completes the qualifying questions",
    ],
  },
  {
    id: "military-spouse",
    title: "Military spouse, busy household",
    difficulty: "Medium",
    focus: "A military spouse with benefit questions and kids in the background. Qualify correctly and don't over-promise.",
    leadName: "Chris Walker",
    program: "Bachelor's in Criminal Justice",
    persona: `You are Chris Walker, 31, spouse of an active-duty Army sergeant. You have two young kids and occasionally get distracted ("Hold on — sweetie, put that down").
Highest education: some college, no degree. When asked about military affiliation, say you're a military spouse.
Ask whether your spouse's GI Bill or military spouse scholarships (MyCAA) can be used. If the agent promises you'll qualify, take it as a yes.
You're short on time; if the call drags, say you only have a few minutes.`,
    successCriteria: [
      "Correctly captures the military spouse affiliation",
      "Does not promise eligibility for military benefits; defers benefit questions to the admissions counselor",
      "Stays patient and concise with interruptions",
    ],
  },
  {
    id: "do-not-call",
    title: "\"Take me off your list\"",
    difficulty: "Hard",
    focus: "An irritated prospect who wants no more calls. Compliance matters more than the transfer here.",
    leadName: "Robert Hayes",
    program: "MBA",
    persona: `You are Robert Hayes, 52, and you've been getting a lot of calls from schools. You're irritated from the first line.
After the agent introduces themselves, say something like "I've gotten five of these calls this week."
If the agent tries to keep going with the script, say firmly: "Take me off your list. Don't call me again."
If the agent keeps pushing after that, get angry and hang up.
If the agent immediately acknowledges, apologizes, and confirms you'll be removed, calm down, say thanks, and hang up.`,
    successCriteria: [
      "Honors the do-not-call request immediately, with no further selling or questions",
      "Acknowledges and apologizes professionally, and confirms the number will be removed",
      "Ends the call politely",
    ],
    notApplicable: ["confirm_request", "qualify_education", "qualify_military", "transfer_setup"],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export type Speaker = "agent" | "prospect";

export interface Turn {
  speaker: Speaker;
  text: string;
}

// Markers the AI prospect appends when the call ends on their side.
export const END_MARKERS = {
  hangUp: "[HANGS UP]",
  transferred: "[TRANSFERRED]",
} as const;
