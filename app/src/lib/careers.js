// Career-domain catalog. Bump CATALOG_VERSION whenever weights or domains change:
// stored recommendations record the version they were scored against.
//
// `weights` are relative importances over features from features.js; scoring.js
// normalises them, so only their ratios matter. `branches` feeds `branch_fit`.
// `roadmap` is the pathway view: phases with a rough duration, then next steps.

export const CATALOG_VERSION = '2026-10-07.1';

export const CAREERS = [
  {
    id: 'software-eng',
    name: 'Software Engineering',
    summary: 'Design, build and maintain software products and the systems behind them.',
    branches: ['cse', 'ece', 'eee'],
    weights: { int_software: 3, apt_programming: 3, apt_logical: 2, pref_coding: 2.5, tr_persistence: 1, pref_screen: 1, pref_applied: 1, branch_fit: 1 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['One language in depth (Python, Java or TypeScript)', 'Data structures & algorithms basics', 'Git, the command line, debugging'] },
        { title: 'Build real things', duration: '3–8 months', items: ['A full-stack web app with auth and a database', 'Testing and code review habits', 'Contribute to one open-source project'] },
        { title: 'Depth', duration: '8–18 months', items: ['Systems design fundamentals', 'Pick a specialty: backend, frontend, mobile or systems', 'Internship or a sizeable freelance project'] },
      ],
      nextSteps: ['Pick one language and finish a structured course this month', 'Ship a small project publicly on GitHub', 'Solve 2–3 algorithm problems a week to build fluency'],
    },
  },
  {
    id: 'data-science',
    name: 'Data Science & Analytics',
    summary: 'Turn messy data into decisions using statistics, experimentation and visualisation.',
    branches: ['cse', 'ece', 'eee', 'chem', 'bio', 'mech', 'civil', 'aero', 'other'],
    weights: { int_data_ai: 3, apt_quant: 3, apt_logical: 1.5, apt_programming: 1.5, tr_curiosity: 1.5, apt_verbal: 1, int_business: 1, pref_screen: 0.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Statistics & probability refresher', 'Python with pandas and SQL', 'Data visualisation basics'] },
        { title: 'Applied analysis', duration: '3–8 months', items: ['3 end-to-end analyses on public datasets', 'A/B testing and causal-inference basics', 'Dashboards (e.g. Metabase or Power BI)'] },
        { title: 'Specialise', duration: '8–18 months', items: ['Machine learning fundamentals', 'Domain focus: product, finance, healthcare or operations', 'Analytics internship or research assistantship'] },
      ],
      nextSteps: ['Take a stats course alongside SQL practice', 'Publish one analysis notebook with clear written conclusions', 'Find a campus or local dataset problem to solve'],
    },
  },
  {
    id: 'ai-ml',
    name: 'AI / Machine Learning Engineering',
    summary: 'Build, train and deploy machine-learning models and AI-powered systems.',
    branches: ['cse', 'ece', 'eee'],
    weights: { int_data_ai: 3, apt_quant: 2.5, apt_programming: 2.5, tr_curiosity: 1.5, int_research: 1, pref_coding: 1.5, tr_persistence: 1, branch_fit: 1 },
    roadmap: {
      phases: [
        { title: 'Maths & code', duration: '0–4 months', items: ['Linear algebra, calculus, probability', 'Python, NumPy, PyTorch basics', 'Classic ML: regression, trees, evaluation'] },
        { title: 'Deep learning', duration: '4–10 months', items: ['Neural networks, CNNs, transformers', 'Reproduce one paper end to end', 'Working with LLM APIs and retrieval'] },
        { title: 'Production & depth', duration: '10–24 months', items: ['Model deployment and monitoring (MLOps)', 'A specialty: vision, NLP, RL or applied LLMs', 'Research internship or a substantial open project'] },
      ],
      nextSteps: ['Start a structured ML course and do every exercise', 'Train and deploy one small model behind an API', 'Read one paper a fortnight and write a summary'],
    },
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    summary: 'Protect systems and data by finding, exploiting and fixing weaknesses.',
    branches: ['cse', 'ece'],
    weights: { int_security: 3.5, apt_logical: 2, apt_programming: 1.5, tr_detail: 2, tr_curiosity: 1.5, tr_persistence: 1, branch_fit: 0.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Networking (TCP/IP, DNS, HTTP)', 'Linux administration', 'Scripting in Python or Bash'] },
        { title: 'Offence & defence', duration: '3–9 months', items: ['Web vulnerabilities (OWASP Top 10)', 'Capture-the-flag competitions', 'Security monitoring and incident basics'] },
        { title: 'Specialise', duration: '9–18 months', items: ['Pick a track: pentesting, cloud security, forensics, appsec', 'An entry certification (e.g. Security+ or eJPT)', 'Bug bounty or security internship'] },
      ],
      nextSteps: ['Set up a home lab with a vulnerable VM', 'Join a beginner CTF platform and solve weekly', 'Learn networking fundamentals properly first'],
    },
  },
  {
    id: 'cloud-devops',
    name: 'Cloud & DevOps / SRE',
    summary: 'Run reliable, scalable infrastructure and automate how software ships.',
    branches: ['cse', 'ece', 'eee'],
    weights: { int_software: 2, apt_logical: 2, apt_programming: 1.5, tr_detail: 2, pref_stability: 1, pref_team: 1, tr_persistence: 1, branch_fit: 0.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Linux, networking, shell scripting', 'Git and CI basics', 'One cloud provider’s core services'] },
        { title: 'Automation', duration: '3–8 months', items: ['Docker and Kubernetes', 'Infrastructure as code (Terraform)', 'Monitoring, logging and alerting'] },
        { title: 'Reliability', duration: '8–18 months', items: ['SRE practices: SLOs, incident response', 'A cloud associate certification', 'Run a real service for a club or project'] },
      ],
      nextSteps: ['Deploy a personal project with a CI/CD pipeline', 'Containerise an app and run it on a free cloud tier', 'Learn Linux deeply — it underpins everything here'],
    },
  },
  {
    id: 'embedded-iot',
    name: 'Embedded Systems & IoT',
    summary: 'Program the hardware inside devices, from microcontrollers to connected sensors.',
    branches: ['ece', 'eee', 'cse', 'mech'],
    weights: { int_electronics: 3, apt_programming: 2, apt_logical: 1.5, pref_hands_on: 2, tr_detail: 1.5, int_software: 1, branch_fit: 1.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['C programming and pointers', 'Digital electronics refresher', 'Arduino / ESP32 starter projects'] },
        { title: 'Real embedded work', duration: '3–9 months', items: ['ARM Cortex-M with bare-metal and an RTOS', 'Communication protocols: I2C, SPI, UART, CAN', 'PCB design basics (KiCad)'] },
        { title: 'Systems', duration: '9–18 months', items: ['Embedded Linux', 'Low-power and connected IoT design', 'Hardware-team internship or competition'] },
      ],
      nextSteps: ['Buy a dev board and build a sensor project', 'Get comfortable with C and reading datasheets', 'Join a robotics or hardware club'],
    },
  },
  {
    id: 'vlsi',
    name: 'VLSI & Chip Design',
    summary: 'Design and verify the integrated circuits that power modern electronics.',
    branches: ['ece', 'eee'],
    weights: { int_electronics: 3.5, apt_logical: 2, apt_quant: 1.5, tr_detail: 2.5, tr_persistence: 1.5, pref_study: 1, branch_fit: 2 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–4 months', items: ['Digital logic and CMOS fundamentals', 'Verilog / SystemVerilog', 'Computer architecture basics'] },
        { title: 'Design & verification', duration: '4–12 months', items: ['RTL design projects on an FPGA', 'Verification with UVM basics', 'Timing analysis and synthesis concepts'] },
        { title: 'Specialise', duration: '12–24 months', items: ['Pick a track: RTL, verification, physical design or analog', 'Consider an M.Tech/MS — common in this field', 'Semiconductor internship'] },
      ],
      nextSteps: ['Write and simulate small Verilog modules this month', 'Get an FPGA board and implement a simple processor', 'Find a faculty member doing VLSI research'],
    },
  },
  {
    id: 'robotics',
    name: 'Robotics & Automation',
    summary: 'Combine mechanics, electronics and software to build machines that sense and act.',
    branches: ['mech', 'ece', 'eee', 'aero', 'cse'],
    weights: { int_mechanical: 2, int_electronics: 1.5, int_software: 1.5, apt_spatial: 1.5, apt_programming: 1.5, pref_hands_on: 2, tr_creativity: 1, tr_persistence: 1, branch_fit: 1 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–4 months', items: ['Kinematics and control theory basics', 'Python/C++ and Linux', 'Microcontroller and motor projects'] },
        { title: 'Integration', duration: '4–12 months', items: ['ROS 2 fundamentals', 'Sensors, computer vision and SLAM', 'Build a mobile robot end to end'] },
        { title: 'Depth', duration: '12–24 months', items: ['Pick a track: manipulation, autonomy, industrial automation', 'Robotics competitions (e.g. Robocon)', 'Lab or industry internship'] },
      ],
      nextSteps: ['Join or start a robotics team', 'Do a ROS 2 tutorial series in simulation', 'Build a small line-following or obstacle-avoiding robot'],
    },
  },
  {
    id: 'core-mech',
    name: 'Mechanical Design & Manufacturing',
    summary: 'Design physical products and the processes that make them.',
    branches: ['mech', 'aero', 'chem'],
    weights: { int_mechanical: 3.5, apt_spatial: 2.5, apt_quant: 1, pref_hands_on: 2, tr_detail: 1.5, pref_applied: 1, branch_fit: 2 },
    roadmap: {
      phases: [
        { title: 'Tools', duration: '0–3 months', items: ['CAD (SolidWorks or Fusion 360)', 'Engineering drawing & GD&T', 'Materials and manufacturing processes'] },
        { title: 'Analysis', duration: '3–9 months', items: ['FEA / simulation (ANSYS)', 'Design-for-manufacture projects', 'Prototype with 3D printing or machining'] },
        { title: 'Industry', duration: '9–18 months', items: ['Student build teams (SAE, Baja, Formula Student)', 'Lean manufacturing / quality basics', 'Plant or design-office internship'] },
      ],
      nextSteps: ['Get certified in one CAD tool', 'Join a vehicle or build team', 'Redesign a real product you use and document it'],
    },
  },
  {
    id: 'civil-infra',
    name: 'Civil & Infrastructure Engineering',
    summary: 'Plan, design and build structures, transport and urban systems.',
    branches: ['civil'],
    weights: { int_infrastructure: 3.5, apt_spatial: 2, apt_quant: 1.5, tr_detail: 1.5, pref_hands_on: 1.5, pref_stability: 1, branch_fit: 2.5 },
    roadmap: {
      phases: [
        { title: 'Tools', duration: '0–3 months', items: ['AutoCAD and a BIM tool (Revit)', 'Structural analysis refresher', 'Codes and standards in your region'] },
        { title: 'Applied design', duration: '3–9 months', items: ['STAAD.Pro / ETABS design projects', 'Site visits and project-management basics', 'GIS for planning'] },
        { title: 'Specialise', duration: '9–24 months', items: ['Pick a track: structures, transport, water, geotech', 'Public-sector exams or a master’s if relevant', 'Site or consultancy internship'] },
      ],
      nextSteps: ['Learn a BIM tool this semester', 'Arrange a site visit with a local contractor', 'Model a small structure end to end'],
    },
  },
  {
    id: 'energy-sustainability',
    name: 'Energy & Sustainability',
    summary: 'Work on renewable energy, efficiency and climate-focused engineering.',
    branches: ['eee', 'mech', 'chem', 'civil'],
    weights: { int_sustainability: 3.5, apt_quant: 1.5, int_research: 1, tr_curiosity: 1, int_electronics: 1, int_mechanical: 1, pref_hands_on: 1, branch_fit: 1.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Energy systems and thermodynamics refresher', 'Solar / wind fundamentals', 'Life-cycle and carbon-accounting basics'] },
        { title: 'Applied', duration: '3–9 months', items: ['Simulation tools (PVsyst, HOMER)', 'An energy audit of a campus building', 'Power electronics or battery systems basics'] },
        { title: 'Specialise', duration: '9–24 months', items: ['Pick a track: renewables, storage, efficiency, policy', 'Climate-tech internship', 'Consider a focused master’s'] },
      ],
      nextSteps: ['Run an energy audit for a hostel or lab', 'Take an online course in renewable systems', 'Follow two climate-tech companies and study their engineering'],
    },
  },
  {
    id: 'biomedical',
    name: 'Biomedical & Health Technology',
    summary: 'Apply engineering to medicine: devices, diagnostics, imaging and health data.',
    branches: ['bio', 'ece', 'eee', 'mech', 'chem'],
    weights: { int_bio: 3.5, tr_detail: 1.5, int_research: 1, int_electronics: 1, int_data_ai: 1, tr_curiosity: 1, pref_study: 1, branch_fit: 1.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–4 months', items: ['Human physiology for engineers', 'Biosignals and instrumentation', 'Regulatory basics for medical devices'] },
        { title: 'Projects', duration: '4–12 months', items: ['Build a biosignal (ECG/EMG) acquisition project', 'Medical imaging or health-data analysis', 'Collaborate with a hospital or bio lab'] },
        { title: 'Specialise', duration: '12–24 months', items: ['Pick a track: devices, imaging, bioinformatics, health AI', 'A master’s is common in this field', 'Med-tech internship'] },
      ],
      nextSteps: ['Find a professor or clinician to shadow', 'Do a small biosignal project with a cheap sensor', 'Take an intro bioinformatics or physiology course'],
    },
  },
  {
    id: 'product-management',
    name: 'Product Management',
    summary: 'Decide what to build and why, working between users, engineers and business.',
    branches: ['cse', 'ece', 'eee', 'mech', 'civil', 'chem', 'bio', 'aero', 'other'],
    weights: { int_business: 2, int_design: 1.5, tr_sociability: 2, apt_verbal: 2, pref_team: 2, int_software: 1, apt_logical: 1, tr_creativity: 1 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Product thinking: problems, users, metrics', 'Basic analytics and SQL', 'Writing clear specs'] },
        { title: 'Practice', duration: '3–9 months', items: ['Run user interviews for a real product', 'Lead a student team building a product', 'Write product teardowns'] },
        { title: 'Break in', duration: '9–24 months', items: ['Often starts via engineering, analytics or design roles', 'Associate PM programmes or startup roles', 'Build a portfolio of decisions and outcomes'] },
      ],
      nextSteps: ['Interview 5 users of an app you like and write up what you learned', 'Lead the product side of a hackathon team', 'Read one product case study a week'],
    },
  },
  {
    id: 'ux-design',
    name: 'UI / UX & Product Design',
    summary: 'Research users and design how digital products look, feel and work.',
    branches: ['cse', 'other', 'mech', 'ece'],
    weights: { int_design: 3.5, tr_creativity: 2.5, apt_spatial: 1.5, apt_verbal: 1, tr_sociability: 1, pref_screen: 1 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Visual design: type, colour, layout', 'Figma fluency', 'UX research methods'] },
        { title: 'Portfolio', duration: '3–9 months', items: ['3 case studies showing the process, not just screens', 'Usability testing with real users', 'Basic HTML/CSS to work with engineers'] },
        { title: 'Depth', duration: '9–18 months', items: ['Interaction design and prototyping', 'Design systems and accessibility', 'Design internship or freelance clients'] },
      ],
      nextSteps: ['Redesign one flow in an app you use, with user testing', 'Start a portfolio site', 'Get critique from a design community'],
    },
  },
  {
    id: 'research-academia',
    name: 'Research & Academia',
    summary: 'Push the frontier of knowledge in a field through a master’s/PhD and research roles.',
    branches: ['cse', 'ece', 'eee', 'mech', 'civil', 'chem', 'bio', 'aero', 'other'],
    weights: { int_research: 3.5, pref_research: 2.5, pref_study: 2.5, tr_curiosity: 2, tr_persistence: 1.5, apt_quant: 1, apt_verbal: 1 },
    roadmap: {
      phases: [
        { title: 'Explore', duration: '0–6 months', items: ['Read survey papers in 2–3 areas', 'Approach faculty for a research project', 'Strengthen maths for your area'] },
        { title: 'Contribute', duration: '6–18 months', items: ['A semester-long research project', 'Aim for a workshop paper or poster', 'Summer research internship'] },
        { title: 'Apply onward', duration: '18–30 months', items: ['Prepare for GRE/GATE where relevant', 'Strong recommendation letters', 'Apply to master’s / PhD programmes'] },
      ],
      nextSteps: ['Email two professors whose work interests you', 'Read and summarise three recent papers', 'Learn LaTeX and a reference manager'],
    },
  },
  {
    id: 'entrepreneurship',
    name: 'Entrepreneurship & Startups',
    summary: 'Start or join an early-stage company and build something from nothing.',
    branches: ['cse', 'ece', 'eee', 'mech', 'civil', 'chem', 'bio', 'aero', 'other'],
    weights: { tr_risk: 3, pref_novelty: 2.5, int_business: 2, tr_creativity: 2, tr_sociability: 1.5, tr_persistence: 1.5, apt_verbal: 1 },
    roadmap: {
      phases: [
        { title: 'Learn by doing', duration: '0–6 months', items: ['Talk to customers about a real problem', 'Build a scrappy prototype', 'Learn startup basics: validation, unit economics'] },
        { title: 'Get reps', duration: '6–18 months', items: ['Join an early-stage startup or incubator', 'Launch something and get first users', 'Learn to pitch and raise small grants'] },
        { title: 'Commit', duration: '18+ months', items: ['Find co-founders with complementary skills', 'Accelerator applications', 'Build a financial safety net before going full-time'] },
      ],
      nextSteps: ['Join the campus E-cell or incubator', 'Interview 10 people about one problem you care about', 'Ship a tiny product and charge for it'],
    },
  },
  {
    id: 'consulting-analyst',
    name: 'Technology Consulting & Business Analysis',
    summary: 'Help organisations solve problems with technology, analysis and clear recommendations.',
    branches: ['cse', 'ece', 'eee', 'mech', 'civil', 'chem', 'bio', 'aero', 'other'],
    weights: { int_business: 3, apt_verbal: 2.5, tr_sociability: 2, apt_logical: 1.5, pref_team: 1.5, apt_quant: 1, pref_stability: 0.5 },
    roadmap: {
      phases: [
        { title: 'Foundations', duration: '0–3 months', items: ['Structured problem solving and case frameworks', 'Excel and SQL for analysis', 'Business writing and presenting'] },
        { title: 'Practice', duration: '3–9 months', items: ['Case competitions', 'Consult for a student society or local business', 'Learn an industry deeply'] },
        { title: 'Break in', duration: '9–18 months', items: ['Analyst internships', 'Process and requirements analysis skills', 'Build a network in the field'] },
      ],
      nextSteps: ['Practise one business case a week with a partner', 'Join the consulting or finance club', 'Turn a past project into a one-page recommendation memo'],
    },
  },
  {
    id: 'quant-finance',
    name: 'Quantitative Finance',
    summary: 'Use maths, statistics and code to model markets and manage risk.',
    branches: ['cse', 'ece', 'eee', 'mech', 'other'],
    weights: { int_finance: 3.5, apt_quant: 3, apt_programming: 1.5, apt_logical: 1.5, tr_detail: 1, tr_risk: 1, pref_screen: 0.5 },
    roadmap: {
      phases: [
        { title: 'Maths', duration: '0–4 months', items: ['Probability and statistics in depth', 'Linear algebra and optimisation', 'Python for numerical work'] },
        { title: 'Finance', duration: '4–10 months', items: ['Markets, derivatives and pricing basics', 'Backtest a simple trading strategy', 'Time-series analysis'] },
        { title: 'Depth', duration: '10–24 months', items: ['Stochastic calculus basics', 'Quant competitions and puzzles', 'Quant research or trading internship'] },
      ],
      nextSteps: ['Work through a probability puzzle book', 'Backtest one strategy on historical data', 'Read an intro to options pricing'],
    },
  },
];

export const CAREER_BY_ID = Object.fromEntries(CAREERS.map((c) => [c.id, c]));
