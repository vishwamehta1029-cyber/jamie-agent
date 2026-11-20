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
    "linkedin.com/in/vishwa10",
    "github.com/vishwamehta1029-cyber",
    "vishwamehta.vercel.app"
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
   "text": "Forward Deployed Engineer who builds and deploys production GenAI applications (agentic workflows, RAG systems, tool-using agents) in Python, integrating Claude and GPT via APIs and MCP. Owns use case evaluation through production deployment and support, including a Fortune 500 AI-adoption rollout. Ships fast in ambiguous environments."
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
   "text": "AI Engineer who designs, builds, and deploys GenAI and agentic AI for enterprise needs: RAG pipelines, tool-calling agents, agent memory, and multi-agent workflows in Python, with Claude and GPT via APIs and MCP. Experienced with data pipelines, embeddings, vector databases, prompt design, and human-in-the-loop evaluation."
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
   "text": "GTM-focused engineer building automation and AI workflows for marketing, outreach, and customer support with Make, n8n, Python, Claude and OpenAI APIs, and MCP. Turns engagement data into GTM actions and builds RAG chatbots that answer only from source docs."
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
   "text": "Designed, built, and deployed a production agentic workflow (Python, Claude API, MCP) that turns raw engagement data into targeted outreach actions through tool calls; drove a 54% lift in impressions"
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
   "text": "Built Relay, an AI agent that automates a 6-step outbound workflow end to end, from account research to outbound activation, with human-in-the-loop review; used company-wide"
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
   "text": "Built and deployed a production RAG chatbot (LLM integration, REST API, semantic search) that lets customers retrieve relevant codes with a single question"
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
   "text": "Built an n8n RAG support chatbot: Google Drive docs, recursive chunking, OpenAI embeddings and Supabase (pgvector); answers only from what it retrieves"
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
   "text": "Built an MVP Streamlit app (Python, Supabase) that ingests survey, photo, and voice-note inputs and runs automated gap analysis for business leaders"
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
   "text": "Built a Make automation for LinkedIn and Microsoft Teams campaign announcements, saving 2 hours of manual work per week"
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
   "text": "Own AI and GTM solutions from use case evaluation through deployment and support, turning ambiguous requirements into KPIs and working tools with Marketing, Product, and leadership"
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
   "text": "Worked directly with enterprise stakeholders on a Fortune 500 AI-adoption rollout; found the root cause of a 5-day manual reporting workflow and re-engineered the pipeline, cutting processing time by ~80%"
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
   "text": "Authored and tested prompts for an LLM-integrated automation that generated 1,000+ customized, metric-based insights; led onboarding for non-technical teams, with recommendations adopted by 100+ employees"
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
   "text": "Built and maintained Python and SQL ETL pipelines into Azure SQL, automating self-serve BI reports and key metrics across client engagements"
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
   "text": "Queried large-scale SQL datasets with Python to surface engagement, churn, and behavior trends; ran root-cause and gap analysis with Product and Engineering and led UAT for data accuracy"
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
   "text": "Analyzed 50,000+ patient, caregiver, and clinician posts to find sentiment trends, unmet needs, and misinformation patterns; turned findings into stakeholder recommendations"
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
   "name": "Jamie, personal AI agent",
   "link": "github.com/vishwamehta1029-cyber/jamie-agent",
   "stack": "TypeScript, MCP, Postgres, Vercel"
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
   "text": "Personal agent and second brain shared by Claude and ChatGPT through a TypeScript MCP server on Vercel and a persistent Postgres memory; 26 tools for facts, answers, lessons and handoffs"
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
   "name": "Matchstick Studio, RAG pipeline for on-brand marketing images",
   "link": "",
   "stack": "Python, embeddings, vector search"
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
   "text": "Crawls any website into a vector knowledge base; the LLM writes copy grounded only in source content, composited into brand templates with real fonts and colors"
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
   "link": "campaign-request-orchestrator.vercel.app",
   "stack": "React, Vercel, OpenAI API"
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
   "text": "Deployed LLM agent that breaks campaign requests into tasks and executes them through tool calling and API integration"
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
   "link": "",
   "stack": "Snowflake, Dynamic Tables, Cortex Agents, AWS S3"
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
   "text": "Three-tier declarative pipeline loading ~1B order records from S3, with monitoring queries, a semantic view, and a Cortex Agent for conversational querying"
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
   "degree": "B.S. Quantitative Economics and Econometrics (STEM); B.A. Psychology",
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
