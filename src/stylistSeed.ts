// Initial Stylist content. Resume items cite the brain facts they come from; portfolio items are the live site's text as of Nov 20, 2026.
export const STYLIST_SEED = [
 {
  "key": "header",
  "kind": "header",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "name": "Vishwa Mehta",
   "email": "vishwamehta1029@gmail.com",
   "phone": "508-654-2959",
   "location": "Seattle, WA",
   "links": [
    {
     "label": "Portfolio",
     "url": "https://vishwamehta.vercel.app/"
    },
    {
     "label": "LinkedIn",
     "url": "https://www.linkedin.com/in/vishwa10"
    },
    {
     "label": "GitHub",
     "url": "https://github.com/vishwamehta1029-cyber"
    }
   ]
  },
  "fact_ids": [
   1,
   2,
   24,
   25,
   26,
   16,
   173
  ],
  "order_no": 0
 },
 {
  "key": "summary:fde",
  "kind": "summary",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Forward Deployed Engineer who builds and ships production GenAI (agentic workflows, RAG, tool-using agents) in Python with Claude, GPT and MCP, from use case evaluation to deployment and support."
  },
  "fact_ids": [
   30
  ],
  "order_no": 0
 },
 {
  "key": "summary:ai_engineer",
  "kind": "summary",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "AI Engineer building RAG pipelines, tool-calling agents, agent memory and multi-agent workflows in Python with Claude, GPT and MCP, from idea through production support."
  },
  "fact_ids": [
   31
  ],
  "order_no": 0
 },
 {
  "key": "summary:gtm",
  "kind": "summary",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "GTM engineer building automation and AI workflows for marketing, outreach and support with Make, n8n, Python, Claude, OpenAI and MCP."
  },
  "fact_ids": [
   32
  ],
  "order_no": 0
 },
 {
  "key": "role:profundity",
  "kind": "role",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "org": "Profundity Group",
   "title": "Forward Deployed Engineer",
   "title_by_surface": {
    "resume:ai_engineer": "Forward Deployed AI Engineer",
    "resume:gtm": "Forward Deployed Engineer (GTM Engineering)"
   },
   "location": "Remote (Seattle, WA)",
   "start": "Jul 2026",
   "end": "Present"
  },
  "fact_ids": [
   34
  ],
  "order_no": 1
 },
 {
  "key": "bullet:profundity:agentic",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Built a production agentic workflow (Python, Claude API, MCP) for outreach; drove a 54% lift in impressions"
  },
  "fact_ids": [
   35
  ],
  "order_no": 1
 },
 {
  "key": "bullet:profundity:relay",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built Relay, a company-wide AI agent that runs a 6-step outbound workflow with human-in-the-loop review"
  },
  "fact_ids": [
   36
  ],
  "order_no": 2
 },
 {
  "key": "bullet:profundity:rag",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Deployed a production RAG chatbot that lets customers find relevant codes with a single question"
  },
  "fact_ids": [
   37
  ],
  "order_no": 3
 },
 {
  "key": "bullet:profundity:memory",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built a support agent with agent memory over a PostgreSQL (pgvector) vector database"
  },
  "fact_ids": [
   38
  ],
  "order_no": 4
 },
 {
  "key": "bullet:profundity:n8n",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Built an n8n RAG support chatbot (OpenAI embeddings, Supabase pgvector) that answers only from source docs"
  },
  "fact_ids": [
   39
  ],
  "order_no": 4
 },
 {
  "key": "bullet:profundity:streamlit",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built a Streamlit MVP (Python, Supabase) that turns surveys, photos and voice notes into a gap analysis"
  },
  "fact_ids": [
   40
  ],
  "order_no": 5
 },
 {
  "key": "bullet:profundity:make",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm",
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Automated LinkedIn and Microsoft Teams campaign announcements with Make, saving 2 hours a week"
  },
  "fact_ids": [
   41
  ],
  "order_no": 6
 },
 {
  "key": "bullet:profundity:own",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde",
   "resume:gtm"
  ],
  "content": {
   "text": "Own AI and GTM solutions end to end, turning ambiguous requirements into KPIs and working tools"
  },
  "fact_ids": [
   42
  ],
  "order_no": 7
 },
 {
  "key": "role:culminate",
  "kind": "role",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "org": "Culminate Strategy Group",
   "title": "Data Analyst, BI & Automation",
   "location": "Remote (Tampa, FL)",
   "start": "Jan 2025",
   "end": "Jul 2026"
  },
  "fact_ids": [
   43
  ],
  "order_no": 2
 },
 {
  "key": "bullet:culminate:f500",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Re-engineered a 5-day manual reporting workflow for a Fortune 500 AI-adoption rollout, cutting time by ~80%"
  },
  "fact_ids": [
   44
  ],
  "order_no": 1
 },
 {
  "key": "bullet:culminate:llm",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Authored prompts for an LLM automation that generated 1,000+ insights, adopted by 100+ employees"
  },
  "fact_ids": [
   45
  ],
  "order_no": 2
 },
 {
  "key": "bullet:culminate:etl",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Built Python and SQL ETL pipelines into Azure SQL that power self-serve BI reports"
  },
  "fact_ids": [
   46
  ],
  "order_no": 3
 },
 {
  "key": "role:curiouser",
  "kind": "role",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "org": "Curiouser.ai",
   "title": "Business Intelligence Analyst Intern",
   "location": "Remote (Tampa, FL)",
   "start": "May 2025",
   "end": "Aug 2025"
  },
  "fact_ids": [
   47
  ],
  "order_no": 3
 },
 {
  "key": "bullet:curiouser:sql",
  "kind": "bullet",
  "parent_key": "role:curiouser",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Analyzed large SQL datasets in Python to surface engagement and churn trends; led UAT for data accuracy"
  },
  "fact_ids": [
   48
  ],
  "order_no": 1
 },
 {
  "key": "role:stanford",
  "kind": "role",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "org": "Stanford University",
   "title": "Data Research Intern",
   "location": "Palo Alto, CA",
   "start": "Feb 2021",
   "end": "May 2021"
  },
  "fact_ids": [
   49
  ],
  "order_no": 4
 },
 {
  "key": "bullet:stanford:posts",
  "kind": "bullet",
  "parent_key": "role:stanford",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Analyzed 50,000+ patient, caregiver and clinician posts to surface unmet needs and misinformation"
  },
  "fact_ids": [
   50
  ],
  "order_no": 1
 },
 {
  "key": "project:jamie",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "name": "Jamie, personal AI agent and second brain",
   "stack": "TypeScript, MCP, Postgres, Vercel",
   "links": [
    {
     "label": "Demo video",
     "url": "https://youtu.be/6lmgMGKqaKQ"
    },
    {
     "label": "GitHub",
     "url": "https://github.com/vishwamehta1029-cyber/jamie-agent"
    }
   ]
  },
  "fact_ids": [
   173
  ],
  "order_no": 1
 },
 {
  "key": "bullet:jamie:server",
  "kind": "bullet",
  "parent_key": "project:jamie",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "TypeScript MCP server on Vercel with shared Postgres memory across Claude and ChatGPT; 26 tools"
  },
  "fact_ids": [
   173
  ],
  "order_no": 1
 },
 {
  "key": "project:matchstick",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "name": "Matchstick Studio, RAG pipeline for on-brand images",
   "stack": "Python, embeddings, vector search",
   "links": [
    {
     "label": "Demo video",
     "url": "https://lnkd.in/p/gUpQaAH8"
    }
   ]
  },
  "fact_ids": [
   51
  ],
  "order_no": 2
 },
 {
  "key": "bullet:matchstick:rag",
  "kind": "bullet",
  "parent_key": "project:matchstick",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "Crawls any website into a vector knowledge base and writes on-brand copy grounded only in its content"
  },
  "fact_ids": [
   51
  ],
  "order_no": 1
 },
 {
  "key": "project:cro",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "name": "Campaign Request Orchestrator",
   "stack": "React, Vercel, OpenAI API",
   "links": [
    {
     "label": "Live demo",
     "url": "https://campaign-request-orchestrator.vercel.app"
    },
    {
     "label": "GitHub",
     "url": "https://github.com/vishwamehta1029-cyber/campaign-request-orchestrator"
    }
   ]
  },
  "fact_ids": [
   52
  ],
  "order_no": 3
 },
 {
  "key": "bullet:cro:agent",
  "kind": "bullet",
  "parent_key": "project:cro",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "text": "LLM agent that breaks campaign requests into tasks and runs them through tool calling"
  },
  "fact_ids": [
   52
  ],
  "order_no": 1
 },
 {
  "key": "project:snowflake",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer"
  ],
  "content": {
   "name": "Snowflake autonomous SQL data pipeline for AI agents",
   "stack": "Snowflake, Dynamic Tables, Cortex Agents, AWS S3",
   "links": []
  },
  "fact_ids": [
   53
  ],
  "order_no": 4
 },
 {
  "key": "bullet:snowflake:pipe",
  "kind": "bullet",
  "parent_key": "project:snowflake",
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Declarative pipeline loading ~1B order records from S3, with a Cortex Agent for conversational queries"
  },
  "fact_ids": [
   53
  ],
  "order_no": 1
 },
 {
  "key": "skills:core",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "label": "Core",
   "items": [
    "Python",
    "SQL",
    "Claude API",
    "OpenAI API",
    "MCP",
    "Agentic workflows",
    "Tool calling",
    "RAG",
    "Embeddings",
    "Vector search",
    "Prompt engineering",
    "LLM evaluation",
    "React",
    "Git",
    "Vercel",
    "Supabase",
    "Snowflake",
    "AWS",
    "Azure SQL",
    "Tableau",
    "Power BI"
   ]
  },
  "fact_ids": [
   55
  ],
  "order_no": 1
 },
 {
  "key": "skills:ai",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "label": "AI engineering",
   "items": [
    "LangGraph",
    "LangChain",
    "Multi-agent workflows",
    "Agent memory",
    "PostgreSQL (pgvector)",
    "Pinecone",
    "FastAPI",
    "Docker",
    "CI/CD (GitHub Actions)",
    "n8n",
    "Make"
   ]
  },
  "fact_ids": [
   56
  ],
  "order_no": 2
 },
 {
  "key": "skills:fde",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "label": "Deployment",
   "items": [
    "Use case evaluation",
    "Requirements gathering",
    "MVPs and proofs of concept",
    "Technical demos",
    "Snowflake Cortex Agents",
    "Debugging"
   ]
  },
  "fact_ids": [
   58
  ],
  "order_no": 2
 },
 {
  "key": "skills:gtm",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "label": "GTM",
   "items": [
    "Make",
    "n8n",
    "Clay",
    "Salesforce",
    "Outreach automation",
    "Campaign orchestration",
    "KPI definition",
    "Stakeholder onboarding"
   ]
  },
  "fact_ids": [
   57,
   89
  ],
  "order_no": 2
 },
 {
  "key": "education:usf",
  "kind": "education",
  "parent_key": null,
  "surfaces": [
   "resume:fde",
   "resume:ai_engineer",
   "resume:gtm"
  ],
  "content": {
   "school": "University of South Florida",
   "degree": "B.S. Quantitative Economics & Econometrics (STEM), B.A. Psychology",
   "location": "Tampa, FL",
   "end": "Dec 2025"
  },
  "fact_ids": [
   33
  ],
  "order_no": 1
 },
 {
  "key": "case:jamie",
  "kind": "case",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "title": "Jamie",
   "meta": "Personal build<br>AI agent<br>2026",
   "sub": "An AI agent that learns as it goes. His first job is my job search.",
   "built": "Jamie is a remote MCP server with a shared brain, so Claude and ChatGPT both connect to the same Jamie. He works through my saved jobs, finds the right people, and drafts outreach in my voice. A Claude skill tells him how to do the work, and every action that matters waits for my yes.",
   "parts": [
    "Remote MCP server in TypeScript",
    "Shared brain in Neon Postgres",
    "Claude skill for the workflow",
    "Works in Claude and ChatGPT",
    "Gmail drafts, send on approval",
    "Bounce checks, Apollo as last resort"
   ],
   "frame": "Less like a tool, <mark>more like a person.</mark>",
   "nums": [
    [
     "45 / day",
     "hard cap on mass applications"
    ],
    [
     "250 / day",
     "hard cap on emails"
    ]
   ],
   "why": "Every fact I give him, every answer I approve, and every lesson from a task gets saved, so each session starts smarter. Guardrails live in the skill and the server, not left to judgment: nothing is submitted or sent without my yes.",
   "stack": [
    "TypeScript",
    "MCP",
    "Claude",
    "ChatGPT",
    "Neon Postgres",
    "Gmail",
    "Vercel"
   ],
   "link": [
    "View the code on GitHub ↗",
    "https://github.com/vishwamehta1029-cyber/jamie-agent"
   ]
  },
  "fact_ids": [],
  "order_no": 1
 },
 {
  "key": "case:relay",
  "kind": "case",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "title": "Relay",
   "meta": "Forward Deployed Engineer<br>Profundity Group<br>Jul 2026 to present",
   "sub": "An agentic outreach system that runs a six-step sales workflow end to end, with a person on the send button.",
   "built": "Give Relay a seller and a target company. It finds the right people, scores them on fit by company size and vertical, drafts personalized outreach from an approved template, and creates Gmail drafts that send only on command.",
   "parts": [
    "Apollo MCP prospect search",
    "Fit scoring by size and vertical",
    "Scored contacts exported to Excel",
    "Drafts locked to approved templates",
    "Gmail MCP drafts, send on command",
    "Claude API orchestration in Python"
   ],
   "frame": "Hours of lead qualification became <mark>a reviewed queue.</mark>",
   "nums": [
    [
     "6 steps",
     "outbound workflow automated end to end"
    ]
   ],
   "why": "A small team was losing hours to repetitive qualification and outreach. The agent took the steps; people kept the judgment. It is now used across the company.",
   "stack": [
    "Python",
    "Claude API",
    "MCP",
    "Apollo",
    "Gmail",
    "Excel"
   ],
   "link": [
    "View the code on GitHub ↗",
    "https://github.com/vishwamehta1029-cyber/relay-AI-AGENT-FOR-LEAD-GENERATION"
   ]
  },
  "fact_ids": [],
  "order_no": 2
 },
 {
  "key": "case:field",
  "kind": "case",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "title": "Operational Assessment Tool",
   "meta": "Forward Deployed Engineer<br>Profundity Group<br>Jul 2026 to present",
   "sub": "A field app that turns a supply chain site walk into a gap analysis while the team is still on site.",
   "built": "Consultants capture surveys, photos, and voice notes in one place during a visit. The app combines them into a single record and scores each operational area against best practice in real time.",
   "parts": [
    "Client and auditor Streamlit apps",
    "Photos and voice notes as inputs",
    "Supabase storage and Postgres",
    "Real-time gap scoring by area"
   ],
   "frame": "Findings ready <mark>during the visit,</mark> not after it.",
   "nums": [
    [
     "3 inputs",
     "surveys, photos, voice notes in one record"
    ]
   ],
   "why": "On-site insight used to live in scattered notes and get reconstructed later. Capturing it at the source made the analysis immediate and repeatable across clients.",
   "stack": [
    "Python",
    "Streamlit",
    "Supabase",
    "Postgres",
    "Plotly"
   ]
  },
  "fact_ids": [],
  "order_no": 3
 },
 {
  "key": "case:report",
  "kind": "case",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "title": "Psychometric Report Engine",
   "meta": "Data Analyst, BI &amp; AI Integration<br>Culminate Strategy Group",
   "sub": "A pipeline that writes personalized assessment reports without losing the personal part.",
   "built": "Survey responses go in. Python normalizes the inputs and maps key-value pairs, traits are scored, and an LLM writes the narrative for each respondent, rendered through Jinja2 into a designed report. I also converted visual org charts into structured datasets for ML models.",
   "parts": [
    "Python survey normalization",
    "Key-value mapping of responses",
    "Org charts parsed into datasets",
    "Jinja2 report templates",
    "LLM narrative per respondent"
   ],
   "frame": "A five-day manual workflow, <mark>now an automated pipeline.</mark>",
   "nums": [
    [
     "~80%",
     "less processing time"
    ],
    [
     "1,000+",
     "customized insights"
    ],
    [
     "100+",
     "employees adopted it"
    ]
   ],
   "why": "The value of these reports is the qualitative read, not the copy and paste. Automating the assembly kept the visual and narrative personalization intact.",
   "stack": [
    "Python",
    "pandas",
    "LLMs",
    "ReportLab",
    "Jinja2"
   ]
  },
  "fact_ids": [],
  "order_no": 4
 },
 {
  "key": "case:match",
  "kind": "case",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "title": "Matchstick Studio",
   "meta": "Personal build<br>Multimodal RAG",
   "sub": "An on-brand context pipeline that fills design templates using any company’s own website.",
   "built": "Point it at a website. It builds a brand knowledge base of copy, tone, and imagery, then fills designer-made templates with on-brand content and renders the final graphic.",
   "parts": [
    "Website ingestion into a knowledge base",
    "Supabase pgvector retrieval (moved from Chroma)",
    "FastAPI service layer",
    "Python Pillow template rendering"
   ],
   "frame": "Automate <mark>execution,</mark> not creativity.",
   "nums": [],
   "why": "Designers keep the layout and the taste. The pipeline handles the repetitive context filling that eats their week.",
   "stack": [
    "FastAPI",
    "Python",
    "Pillow",
    "RAG",
    "pgvector",
    "Supabase"
   ],
   "link": [
    "Watch the demo ↗",
    "https://lnkd.in/p/gUpQaAH8"
   ]
  },
  "fact_ids": [],
  "order_no": 5
 },
 {
  "key": "card:jamie",
  "kind": "card",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "q": "Can I build an AI agent that applies to jobs, finds the right people, and gets smarter with every task?"
  },
  "fact_ids": [],
  "order_no": 1
 },
 {
  "key": "card:relay",
  "kind": "card",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "q": "How do I automate the process of shortlisting quality leads and emailing them?"
  },
  "fact_ids": [],
  "order_no": 2
 },
 {
  "key": "card:field",
  "kind": "card",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "q": "Can I build a platform where I can run operational surveys, add photos and voice notes, and get a gap analysis once done?"
  },
  "fact_ids": [],
  "order_no": 3
 },
 {
  "key": "card:report",
  "kind": "card",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "q": "I spend hours drafting personalized, well-designed reports. Can I build a pipeline that automates this entire process?"
  },
  "fact_ids": [],
  "order_no": 4
 },
 {
  "key": "chap:1",
  "kind": "chapter",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "org": "University of South Florida",
   "when": "Graduated December 2025",
   "h3": "B.S. Quantitative Economics &amp; Econometrics, B.A. Psychology",
   "say": [],
   "chips": []
  },
  "fact_ids": [],
  "order_no": 1
 },
 {
  "key": "chap:2",
  "kind": "chapter",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "org": "Culminate Strategy Group",
   "when": "Analytics intern to Data Analyst · Jan 2025 to Jul 2026",
   "h3": "Spent my time automating my own job",
   "say": [
    "As an analyst, I spent most days drafting personalized, well-designed reports and structuring datasets for ML models.",
    "Then I automated my own job, end to end."
   ],
   "chips": [
    "Python",
    "pandas",
    "Data modeling"
   ]
  },
  "fact_ids": [],
  "order_no": 2
 },
 {
  "key": "chap:3",
  "kind": "chapter",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "org": "Curiouser.AI",
   "when": "Business Intelligence Analyst Intern · May to Aug 2025",
   "h3": "Learned firsthand what goes into building an AI company",
   "say": [
    "I saw what it takes to build an AI company: marketing, operations, backend, and fundraising."
   ],
   "chips": []
  },
  "fact_ids": [],
  "order_no": 3
 },
 {
  "key": "chap:4",
  "kind": "chapter",
  "parent_key": null,
  "surfaces": [
   "portfolio"
  ],
  "content": {
   "org": "Profundity Group · Supply chain consulting",
   "when": "Forward Deployed AI Engineer · Jul 2026 to present",
   "h3": "Zero to one, every hat",
   "say": [
    "I joined to bring AI-first problem solving to a consulting firm. We're in the 0-to-1 phase, so my scope stretched far past my title. That's what I love about startups: pick a problem, own it end to end."
   ],
   "chips": [
    "Engineering",
    "Design",
    "GTM",
    "Data"
   ]
  },
  "fact_ids": [],
  "order_no": 4
 }
] as const;
