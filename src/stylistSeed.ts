// Initial Stylist content. Resume items are Vishwa's own wording from her three resumes (Nov 2026) and cite the brain facts they come from;
// portfolio items are the live site's text as of Nov 20, 2026.
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
   "headline_by_surface": {
    "resume:fde": "Forward Deployed Engineer | Generative AI Applications | Agentic Workflows & RAG | Python | LLM Evaluation",
    "resume:ai_engineer": "AI Engineer | GenAI & Agentic AI | RAG Pipelines | Tool-Calling Agents | Python | LLM Evaluation",
    "resume:gtm": "GTM Engineer | GTM Automation (Make, n8n) | Agentic AI Workflows & RAG | Python & SQL"
   },
   "links": [
    {
     "label": "linkedin.com/in/vishwa10",
     "url": "https://www.linkedin.com/in/vishwa10"
    },
    {
     "label": "Portfolio",
     "url": "https://vishwamehta.vercel.app/"
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
   16,
   24,
   25,
   26,
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
   "text": "Forward Deployed Engineer who builds and deploys production GenAI applications: agentic workflows, RAG systems, and tool-using agents in Python, integrating LLMs (Claude, GPT) via APIs and MCP. Owns the end-to-end path from use case evaluation to production deployment and operational support, including work on a Fortune 500 AI-adoption rollout. Hands-on with retrieval pipelines (data prep, chunking, embeddings, semantic search), prompt authoring and testing, LLM evaluation, and grounding outputs to keep hallucination low. Clear communication with engineers, product, and business stakeholders; ships fast in ambiguous environments."
  },
  "fact_ids": [
   30,
   44
  ],
  "order_no": 0
 },
 {
  "key": "summary:ai",
  "kind": "summary",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "AI Engineer who designs, builds, and deploys GenAI and agentic AI solutions for enterprise business needs: RAG pipelines, tool-calling agents, agent memory, and multi-agent workflows in Python, with LLM integration (Claude, GPT) via APIs and MCP. Develops features from conception through production support, including a Fortune 500 AI-adoption rollout. Hands-on with data pipelines, embeddings, vector databases, prompt design, and human-in-the-loop evaluation; communicates technical concepts clearly to product teams."
  },
  "fact_ids": [
   31,
   44
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
   "bullets": [
    "GTM-focused engineer (Forward Deployed Engineer at Profundity Group) who builds automation and AI workflows for marketing, outreach, and customer support with Make, n8n, Python, Claude/OpenAI APIs, and MCP.",
    "Turns engagement data into GTM actions: shipped an agentic outreach workflow that drove a 54% lift in impressions and a Make automation for LinkedIn and Teams campaign announcements that saves 2 hours of manual work per week.",
    "Builds RAG chatbots and agents that answer customer questions only from source docs (embeddings, Supabase pgvector), turning recurring support needs into self-serve tools."
   ]
  },
  "fact_ids": [
   32,
   35,
   39,
   41
  ],
  "order_no": 0
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
   "school": "University of South Florida, Tampa, FL",
   "end": "Graduation: Dec 2025",
   "degree": "B.S. in Quantitative Economics and Econometrics (STEM), B.A. in Psychology"
  },
  "fact_ids": [
   33,
   129
  ],
  "order_no": 1
 },
 {
  "key": "skills:fde:1",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "label": "GenAI & LLM Engineering",
   "items": [
    "Agentic Workflows",
    "AI Agents",
    "Tool-Using Agents",
    "RAG",
    "Embeddings",
    "Semantic Search",
    "Vector Search",
    "Chunking",
    "Prompt Authoring/Testing",
    "LLM Evaluation",
    "Guardrails",
    "MCP"
   ]
  },
  "fact_ids": [
   186
  ],
  "order_no": 1
 },
 {
  "key": "skills:fde:2",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "label": "LLMs & Cloud AI Services",
   "items": [
    "Claude (Claude API)",
    "GPT (OpenAI API)",
    "Snowflake Cortex Agents",
    "AWS (S3, EC2, Redshift)",
    "Azure SQL",
    "Supabase",
    "Vercel"
   ]
  },
  "fact_ids": [
   186
  ],
  "order_no": 2
 },
 {
  "key": "skills:fde:3",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "label": "Software Engineering",
   "items": [
    "Python (pandas, NumPy, Streamlit)",
    "SQL",
    "APIs",
    "React",
    "Git",
    "ETL/ELT Pipelines",
    "Data Modeling",
    "Debugging",
    "Agile/Scrum",
    "JIRA",
    "UAT"
   ]
  },
  "fact_ids": [
   186
  ],
  "order_no": 3
 },
 {
  "key": "skills:fde:4",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "label": "Delivery & Data",
   "items": [
    "Use Case Evaluation",
    "Requirements Gathering",
    "MVPs/Proof-of-Concepts",
    "Technical Demos",
    "AI-Assisted Dev Tools (Claude)",
    "Snowflake (Dynamic Tables, Semantic Views)",
    "Tableau",
    "Power BI"
   ]
  },
  "fact_ids": [
   186
  ],
  "order_no": 4
 },
 {
  "key": "skills:ai:1",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "label": "GenAI & Agentic AI",
   "items": [
    "RAG Pipelines",
    "Tool-Calling Agents",
    "Multi-Agent Workflows",
    "Agent Memory",
    "LangGraph",
    "LangChain",
    "GraphRAG",
    "Embeddings",
    "Semantic Search",
    "Prompt Design",
    "LLM Integration",
    "MCP",
    "NLP (Text Classification, Entity Extraction)"
   ]
  },
  "fact_ids": [
   188
  ],
  "order_no": 1
 },
 {
  "key": "skills:ai:2",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "label": "ML & Computer Vision",
   "items": [
    "PyTorch",
    "TensorFlow",
    "Keras",
    "Model Training",
    "Validation",
    "Evaluation Metrics",
    "Feature Engineering",
    "OpenCV",
    "Roboflow",
    "Object Detection & Tracking",
    "Dataset Annotation",
    "Unsupervised Learning",
    "Segmentation",
    "Causal Impact"
   ]
  },
  "fact_ids": [
   188
  ],
  "order_no": 2
 },
 {
  "key": "skills:ai:3",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "label": "Data & Vector Databases",
   "items": [
    "Python",
    "SQL",
    "PySpark",
    "BigQuery",
    "PostgreSQL (pgvector)",
    "MongoDB (Atlas)",
    "Elasticsearch",
    "Pinecone",
    "Qdrant",
    "Snowflake (Cortex Agents, Dynamic Tables)",
    "Azure SQL",
    "Supabase",
    "ETL/ELT Pipelines",
    "Data Modeling"
   ]
  },
  "fact_ids": [
   188
  ],
  "order_no": 3
 },
 {
  "key": "skills:ai:4",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "label": "Cloud & Engineering",
   "items": [
    "GCP (Cloud Run, GKE)",
    "Azure",
    "AWS (S3, EC2, Redshift, IAM)",
    "FastAPI",
    "Flask",
    "REST APIs",
    "Docker",
    "Kubernetes",
    "CI/CD (GitHub Actions)",
    "Git (Pull Requests, Code Reviews)",
    "React",
    "Vercel",
    "Streamlit",
    "Agile/Scrum",
    "JIRA",
    "R"
   ]
  },
  "fact_ids": [
   188
  ],
  "order_no": 4
 },
 {
  "key": "skills:ai:5",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "label": "Production & Responsible AI",
   "items": [
    "Agent Monitoring (Data Drift, Retrieval Quality, Latency)",
    "Test Sets",
    "Human-in-the-Loop Review",
    "Guardrails",
    "Data Privacy",
    "Workflow Automation (n8n, Make)",
    "AI-Assisted Development (Claude Code, Cursor, Gemini)"
   ]
  },
  "fact_ids": [
   188
  ],
  "order_no": 5
 },
 {
  "key": "skills:gtm:1",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "label": "GTM Automation",
   "items": [
    "Make",
    "n8n",
    "Clay",
    "Workflow Automation",
    "Outreach Automation",
    "Campaign Orchestration",
    "LinkedIn & Microsoft Teams Automation",
    "Google Drive Integrations"
   ]
  },
  "fact_ids": [
   187
  ],
  "order_no": 1
 },
 {
  "key": "skills:gtm:2",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "label": "AI & Agents",
   "items": [
    "Claude API",
    "OpenAI API",
    "MCP",
    "Agentic Workflows",
    "AI Agents",
    "Tool Calling",
    "RAG",
    "Embeddings",
    "Vector Search (Supabase pgvector)",
    "Prompt Authoring/Testing",
    "LLM Evaluation",
    "Guardrails"
   ]
  },
  "fact_ids": [
   187
  ],
  "order_no": 2
 },
 {
  "key": "skills:gtm:3",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "label": "Data & Engineering",
   "items": [
    "Python (pandas, NumPy, Streamlit)",
    "SQL",
    "APIs",
    "React",
    "Git",
    "ETL/ELT Pipelines",
    "Snowflake",
    "AWS (S3, EC2, Redshift)",
    "Azure SQL",
    "Supabase",
    "Vercel"
   ]
  },
  "fact_ids": [
   187
  ],
  "order_no": 3
 },
 {
  "key": "skills:gtm:4",
  "kind": "skill_group",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "label": "Analytics & Delivery",
   "items": [
    "KPI Definition",
    "Requirements Gathering",
    "MVPs/Proof-of-Concepts",
    "Technical Demos",
    "Stakeholder Onboarding",
    "Tableau",
    "Power BI",
    "Agile/Scrum",
    "JIRA",
    "UAT"
   ]
  },
  "fact_ids": [
   187
  ],
  "order_no": 4
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
   "orgline": "Profundity Group (Remote - Seattle, WA)",
   "title": "Forward Deployed Engineer",
   "start": "Jul 2026",
   "end": "Present",
   "title_by_surface": {
    "resume:ai_engineer": "Forward Deployed AI Engineer",
    "resume:gtm": "Forward Deployed Engineer (GTM Engineering)"
   }
  },
  "fact_ids": [
   34
  ],
  "order_no": 1
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
   "orgline": "Culminate Strategy Group, Management Consulting (Remote - Tampa, FL)",
   "title": "Data Analyst, BI & Automation",
   "start": "Jan 2025",
   "end": "Jul 2026"
  },
  "fact_ids": [
   43
  ],
  "order_no": 2
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
   "orgline": "Curiouser.ai (Remote - Tampa, FL)",
   "title": "Business Intelligence Analyst Intern",
   "start": "May 2025",
   "end": "Aug 2025"
  },
  "fact_ids": [
   47
  ],
  "order_no": 3
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
   "orgline": "Stanford University (Palo Alto, CA)",
   "title": "Data Research Intern",
   "start": "Feb 2021",
   "end": "May 2021"
  },
  "fact_ids": [
   49
  ],
  "order_no": 4
 },
 {
  "key": "bullet:profundity:fde1",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Designed, built, and deployed a production agentic workflow (Python, Claude API, MCP) that ingests raw engagement data, extracts insight signals, and uses tool calls to generate targeted outreach actions; instrumented it end to end to tie output to business outcomes, driving a 54% lift in impressions."
  },
  "fact_ids": [
   35
  ],
  "order_no": 1
 },
 {
  "key": "bullet:profundity:fde2",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Built Relay, an AI agent that automates a 6-step outbound workflow end to end: account research, prospect identification, lead scoring, contact enrichment, personalized email drafting, and outbound activation."
  },
  "fact_ids": [
   36
  ],
  "order_no": 2
 },
 {
  "key": "bullet:profundity:fde3",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Built and deployed a production RAG-based chatbot (LLM integration, REST API, semantic search) that lets customers retrieve relevant codes with a single question, turning a recurring customer need into a reusable product feature."
  },
  "fact_ids": [
   37
  ],
  "order_no": 3
 },
 {
  "key": "bullet:profundity:fde4",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Built an MVP Streamlit application (Python, Supabase) that ingests survey, photo, and voice-note inputs and runs automated gap analysis, giving business leaders a self-service view into problem areas and cutting manual review time."
  },
  "fact_ids": [
   40
  ],
  "order_no": 4
 },
 {
  "key": "bullet:profundity:fde5",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Own AI solutions from use case evaluation through deployment and operational support; partner with Marketing, Product, and leadership to translate ambiguous requirements into defined KPIs and technical solutions."
  },
  "fact_ids": [
   42
  ],
  "order_no": 5
 },
 {
  "key": "bullet:profundity:ai1",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Designed, built, and deployed a production agentic workflow (Python, Claude API, MCP) with tool calling that ingests engagement data, extracts insight signals, and generates outreach actions; monitored agent performance, driving a 54% lift in impressions."
  },
  "fact_ids": [
   35
  ],
  "order_no": 1
 },
 {
  "key": "bullet:profundity:ai2",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built Relay, a tool-calling agent that automates a 6-step outbound workflow end to end (account research, prospect identification, lead scoring, enrichment, email drafting, activation) with human-in-the-loop review; now used company-wide."
  },
  "fact_ids": [
   36
  ],
  "order_no": 2
 },
 {
  "key": "bullet:profundity:ai3",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built and deployed RAG pipelines: a production chatbot (REST API, semantic search) that returns relevant codes from one question, and a support agent with agent memory over a PostgreSQL (pgvector) vector database."
  },
  "fact_ids": [
   37,
   38
  ],
  "order_no": 3
 },
 {
  "key": "bullet:profundity:ai4",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built an MVP Streamlit application (Python, Supabase) with data pipelines that ingest survey, photo, and voice-note inputs and run automated gap analysis, cutting manual review time for business leaders."
  },
  "fact_ids": [
   40
  ],
  "order_no": 4
 },
 {
  "key": "bullet:profundity:ai5",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built workflow automations on cloud services (Make) for team announcements, saving 2 hours of manual work weekly."
  },
  "fact_ids": [
   41
  ],
  "order_no": 5
 },
 {
  "key": "bullet:profundity:gtm1",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Designed, built, and deployed a production agentic outreach workflow (Python, Claude API, MCP) that ingests raw engagement data, extracts insight signals, and uses tool calls to generate targeted outreach actions; instrumented it end to end to tie output to business outcomes, driving a 54% lift in impressions."
  },
  "fact_ids": [
   35
  ],
  "order_no": 1
 },
 {
  "key": "bullet:profundity:gtm2",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Built a Make automation workflow that fully automates LinkedIn and Microsoft Teams campaign announcements, saving 2 hours of manual work per week."
  },
  "fact_ids": [
   41
  ],
  "order_no": 2
 },
 {
  "key": "bullet:profundity:gtm3",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Built an n8n RAG support chatbot: pulls support docs from Google Drive, chunks them with a recursive text splitter, embeds them with OpenAI, and stores them in Supabase (pgvector); an AI Agent with conversation memory searches the knowledge base and answers only from what it retrieves."
  },
  "fact_ids": [
   39
  ],
  "order_no": 3
 },
 {
  "key": "bullet:profundity:gtm4",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Built and deployed a production RAG-based chatbot (LLM integration, REST API, semantic search) that lets customers retrieve relevant codes with a single question."
  },
  "fact_ids": [
   37
  ],
  "order_no": 4
 },
 {
  "key": "bullet:profundity:gtm5",
  "kind": "bullet",
  "parent_key": "role:profundity",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Own GTM and AI solutions from use case evaluation through deployment and support; partner with Marketing, Product, and leadership to turn ambiguous requirements into KPIs and technical solutions."
  },
  "fact_ids": [
   42
  ],
  "order_no": 5
 },
 {
  "key": "bullet:culminate:fde1",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:fde",
   "resume:gtm"
  ],
  "content": {
   "text": "Worked directly with enterprise stakeholders on a Fortune 500 AI-adoption rollout; debugged the root cause of a 5-day manual reporting workflow and re-engineered the pipeline, cutting processing time by ~80%."
  },
  "fact_ids": [
   44
  ],
  "order_no": 1
 },
 {
  "key": "bullet:culminate:fde2",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:fde",
   "resume:gtm"
  ],
  "content": {
   "text": "Authored and tested prompts for an LLM-integrated automation that synthesized 1,000+ customized, metric-based insights from client data; led hands-on onboarding so non-technical teams could adopt it, with recommendations adopted by 100+ employees."
  },
  "fact_ids": [
   45
  ],
  "order_no": 2
 },
 {
  "key": "bullet:culminate:fde3",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:fde",
   "resume:gtm"
  ],
  "content": {
   "text": "Built and maintained Python ETL pipelines integrating client data into Azure SQL, automating self-serve BI reports and key performance metrics across client engagements."
  },
  "fact_ids": [
   46
  ],
  "order_no": 3
 },
 {
  "key": "bullet:culminate:ai1",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Worked directly with enterprise stakeholders on a Fortune 500 AI-adoption rollout; debugged the root cause of a 5-day manual reporting workflow and re-engineered the data pipeline, cutting processing time by ~80%."
  },
  "fact_ids": [
   44
  ],
  "order_no": 1
 },
 {
  "key": "bullet:culminate:ai2",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Designed and tested prompts for an LLM-integrated automation that generated 1,000+ customized, metric-based insights from client data; led hands-on onboarding so non-technical teams could adopt it, with recommendations adopted by 100+ employees."
  },
  "fact_ids": [
   45
  ],
  "order_no": 2
 },
 {
  "key": "bullet:culminate:ai3",
  "kind": "bullet",
  "parent_key": "role:culminate",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Built and maintained Python and SQL ETL pipelines for ingestion and transformation of client data into Azure SQL, automating self-serve BI reports and key performance metrics across client engagements."
  },
  "fact_ids": [
   46
  ],
  "order_no": 3
 },
 {
  "key": "bullet:curiouser:fde1",
  "kind": "bullet",
  "parent_key": "role:curiouser",
  "surfaces": [
   "resume:fde",
   "resume:gtm"
  ],
  "content": {
   "text": "Queried large-scale SQL datasets with Python to surface customer engagement, churn, and behavior trends; performed root-cause and gap analysis with Product and Engineering in an Agile/JIRA lifecycle, leading UAT and validation for data accuracy."
  },
  "fact_ids": [
   48
  ],
  "order_no": 1
 },
 {
  "key": "bullet:curiouser:ai1",
  "kind": "bullet",
  "parent_key": "role:curiouser",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Queried large-scale SQL datasets with Python to surface customer engagement, churn, and behavior trends; performed root-cause and gap analysis with Product and Engineering in an Agile/JIRA team, leading UAT and validation for data accuracy."
  },
  "fact_ids": [
   48
  ],
  "order_no": 1
 },
 {
  "key": "bullet:stanford:fde1",
  "kind": "bullet",
  "parent_key": "role:stanford",
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "text": "Analyzed 50,000+ patient, caregiver, and clinician posts to identify sentiment trends, unmet needs, and misinformation patterns; mapped trends via Excel/Tableau into stakeholder recommendations."
  },
  "fact_ids": [
   50
  ],
  "order_no": 1
 },
 {
  "key": "bullet:stanford:ai1",
  "kind": "bullet",
  "parent_key": "role:stanford",
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "text": "Analyzed 50,000+ patient, caregiver, and clinician posts to identify sentiment trends, unmet needs, and misinformation patterns in health care; mapped trends via Excel/Tableau into stakeholder recommendations."
  },
  "fact_ids": [
   50
  ],
  "order_no": 1
 },
 {
  "key": "bullet:stanford:gtm1",
  "kind": "bullet",
  "parent_key": "role:stanford",
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "text": "Analyzed 50,000+ patient, caregiver, and clinician posts for sentiment trends and unmet needs; mapped findings via Excel/Tableau into recommendations."
  },
  "fact_ids": [
   50
  ],
  "order_no": 1
 },
 {
  "key": "project:matchstick:fde",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "name": "RAG Pipeline for On-Brand Marketing Image Generation",
   "stack": "RAG, Embeddings, Vector Search, Chunking, LLM",
   "links": [
    {
     "label": "Demo Video",
     "url": "https://lnkd.in/p/gUpQaAH8"
    }
   ],
   "text": "Built an end-to-end RAG pipeline that crawls any website URL, handles data prep and chunking, embeds content into a knowledge base, and retrieves context for each request; the LLM writes copy grounded only in source content (guardrail against hallucinated claims), then output is deterministically composited into brand templates with real fonts and colors."
  },
  "fact_ids": [
   51
  ],
  "order_no": 1
 },
 {
  "key": "project:cro:fde",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "name": "Campaign Request Orchestrator",
   "stack": "Tool-Using Agent, React, Vercel, OpenAI API",
   "links": [
    {
     "label": "GitHub",
     "url": "https://github.com/vishwamehta1029-cyber/campaign-request-orchestrator"
    }
   ],
   "text": "Built and deployed an LLM agent that decomposes campaign requests into tasks and executes them via tool calling and API integration.",
   "name_url": "https://campaign-request-orchestrator.vercel.app"
  },
  "fact_ids": [
   52
  ],
  "order_no": 2
 },
 {
  "key": "project:snowflake:fde",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:fde"
  ],
  "content": {
   "name": "Snowflake Autonomous SQL Data Pipeline for AI Agents",
   "stack": "Snowflake CoCo, Dynamic Tables, Cortex Agents, AWS S3",
   "links": [],
   "text": "Built a three-tier declarative pipeline loading ~1B order records from AWS S3, with monitoring queries, a semantic view, and a Cortex Agent for conversational querying."
  },
  "fact_ids": [
   53
  ],
  "order_no": 3
 },
 {
  "key": "project:matchstick:ai",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "name": "RAG Pipeline for On-Brand Marketing Image Generation",
   "stack": "RAG, Embeddings, Vector Search, LLM Integration",
   "links": [
    {
     "label": "Demo Video",
     "url": "https://lnkd.in/p/gUpQaAH8"
    }
   ],
   "text": "Built an end-to-end RAG pipeline that crawls any website URL, handles ingestion and chunking, embeds content into a vector knowledge base, and retrieves context so the LLM writes copy grounded only in source content."
  },
  "fact_ids": [
   51
  ],
  "order_no": 1
 },
 {
  "key": "project:cro:ai",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "name": "Campaign Request Orchestrator",
   "stack": "Tool-Calling Agent, React, Vercel, OpenAI API",
   "links": [
    {
     "label": "GitHub",
     "url": "https://github.com/vishwamehta1029-cyber/campaign-request-orchestrator"
    }
   ],
   "text": "Built and deployed an LLM agent that decomposes campaign requests into tasks and executes them via tool calling and API integration.",
   "name_url": "https://campaign-request-orchestrator.vercel.app"
  },
  "fact_ids": [
   52
  ],
  "order_no": 2
 },
 {
  "key": "project:snowflake:ai",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:ai_engineer"
  ],
  "content": {
   "name": "Snowflake Autonomous SQL Data Pipeline for AI Agents",
   "stack": "Snowflake, Dynamic Tables, Cortex Agents, AWS S3",
   "links": [],
   "text": "Built a three-tier pipeline loading ~1B order records from AWS S3, with monitoring queries and a Cortex Agent for conversational querying."
  },
  "fact_ids": [
   53
  ],
  "order_no": 3
 },
 {
  "key": "project:matchstick:gtm",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "name": "RAG Pipeline for On-Brand Marketing Image Generation",
   "stack": "RAG, Embeddings, Vector Search, LLM",
   "links": [
    {
     "label": "Demo Video",
     "url": "https://lnkd.in/p/gUpQaAH8"
    }
   ],
   "text": "Crawls any website URL, embeds content into a knowledge base, and generates marketing copy grounded only in source content, composited into brand templates with real fonts and colors."
  },
  "fact_ids": [
   51
  ],
  "order_no": 1
 },
 {
  "key": "project:cro:gtm",
  "kind": "project",
  "parent_key": null,
  "surfaces": [
   "resume:gtm"
  ],
  "content": {
   "name": "Campaign Request Orchestrator",
   "stack": "Tool-Using Agent, React, Vercel, OpenAI API",
   "links": [
    {
     "label": "GitHub",
     "url": "https://github.com/vishwamehta1029-cyber/campaign-request-orchestrator"
    }
   ],
   "text": "Built and deployed an LLM agent that decomposes marketing campaign requests into tasks and executes them via tool calling and API integration.",
   "name_url": "https://campaign-request-orchestrator.vercel.app"
  },
  "fact_ids": [
   52
  ],
  "order_no": 2
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
];
