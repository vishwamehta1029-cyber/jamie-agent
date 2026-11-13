// DEMO DATA ONLY. Everything here is fictional.
// The real knowledge base is private and lives only in the production database.
// To run Jamie for yourself, replace these entries with your own facts, then hit /<secret>/seed once.

export const SEED_DATA: any = {
  facts: [
    { category: "identity", fact: "Name: Alex Rivera", source: "told_me" },
    { category: "identity", fact: "Based in Seattle, WA", source: "told_me" },
    { category: "contact", fact: "Email: alex@example.com", source: "told_me" },
    { category: "logistics", fact: "Start date: two weeks from the application date", source: "told_me" },
    { category: "logistics", fact: "Salary: enter the target from the posting range; if there is no range, enter the default target", source: "told_me" },
    { category: "logistics", fact: "Open to relocation. Prefers remote first", source: "told_me" },
    { category: "logistics", fact: "Authorized to work in the US", source: "told_me" },
    { category: "eeo", fact: "EEO: prefer not to say", source: "told_me" },
    { category: "rules", fact: "Every custom answer must be approved before submitting", source: "told_me" },
    { category: "rules", fact: "Skip roles that require more than 3 years of experience", source: "told_me" },
    { category: "preferences", fact: "No em dashes in anything written", source: "told_me" },
    { category: "resume_routing", fact: "Forward Deployed and Solutions Engineer roles: Resume_AgenticAI.pdf", source: "told_me" },
    { category: "resume_routing", fact: "AI Engineer roles: Resume_AI_Engineer.pdf", source: "told_me" },
    { category: "resume_routing", fact: "GTM roles: Resume_GTM.pdf", source: "told_me" },
    { category: "summary", fact: "Builds agentic AI tools with Claude and MCP for go-to-market teams", source: "resume" },
    { category: "experience", fact: "Forward Deployed Engineer at Example Co (remote, 2026 to present)", source: "resume" },
    { category: "project", fact: "Built an outreach agent that drafts emails from CRM data", source: "resume" },
    { category: "skills", fact: "TypeScript, Python, SQL, Postgres, MCP, Claude", source: "resume" },
    { category: "education", fact: "B.S. Economics, Example University", source: "resume" },
  ],
  lessons: [
    { topic: "style", lesson: "Keep bullets short: six to eight words each" },
    { topic: "outreach", lesson: "Portfolio links in emails always include a thumbnail image" },
    { topic: "tracking", lesson: "Log every submitted custom answer for later review" },
  ],
  applications: [
    ["Northwind", "Forward Deployed Engineer", ""],
    ["Orbit Labs", "AI Engineer", ""],
  ],
  in_progress: [["Lumen & Co", "GTM Engineer", "Waiting on approval for custom answers"]],
  answers: [
    {
      question: "Outreach email template",
      question_type: "other",
      role_type: "any",
      approved: true,
      reusable: true,
      answer:
        "Hi [FIRST NAME],\n\nI just applied for the [role] role at [COMPANY].\n\n- I build agentic AI tools with Claude and MCP\n- Startup builder, at home in ambiguity\n\nPortfolio: [PORTFOLIO LINK + THUMBNAIL]\n\n[CTA]\n\nThanks,\nAlex",
    },
  ],
};
