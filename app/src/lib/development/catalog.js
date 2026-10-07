// PROTOTYPE COURSE CATALOG (hackathon): curated and static. No live scraping.
// Prices are approximate INR (₹0 = free to audit; certificates may cost extra) and
// URLs point at provider home/learning pages rather than specific course listings.
//
// Course:     { id, kind:'course', title, provider, url, careers[], price, duration, difficulty,
//               description, prerequisites[], modules[] }
// Module:     { id, title, skills[], project: { title, brief, requirements[] } }
//   — every module carries the practical project it unlocks (the template that
//     the AI may customise, never replace).
// Programme:  { id, kind:'programme', title, ..., educationLevel, steps[] } — higher study.
//
// Career ids are the existing Module 1 ids (src/lib/careers.js); no second taxonomy.

const m = (id, title, skills, [ptitle, brief, requirements]) => ({
  id, title, skills, project: { title: ptitle, brief, requirements },
});

const course = (c) => ({ kind: 'course', prerequisites: [], ...c });

export const COURSES = [
  // ------------------------------------------------------------ programming / CS
  course({
    id: 'py-foundations', title: 'Python Programming Foundations', provider: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn',
    careers: ['software-eng', 'data-science', 'ai-ml', 'cybersecurity', 'cloud-devops', 'robotics', 'research-academia', 'quant-finance', 'biomedical', 'energy-sustainability'],
    price: 0, duration: '6 weeks', difficulty: 'beginner',
    description: 'Core Python: syntax, functions, files and object-oriented programming.',
    modules: [
      m('py-basics', 'Python basics & control flow', ['Python', 'Control flow'], ['Grade Calculator CLI', 'Build a command-line tool that reads marks for several subjects and reports grades and averages.', ['Accept input for at least 5 subjects', 'Use conditionals to map marks to grades', 'Print a clear summary with average and highest subject']]),
      m('py-functions', 'Functions & modules', ['Functions', 'Modular code'], ['Unit Converter Library', 'Write a small reusable module of conversion functions and a script that uses it.', ['At least 6 conversion functions with docstrings', 'Organise code into an importable module', 'A demo script that calls the module']]),
      m('py-files', 'Files & CSV data', ['File I/O', 'CSV'], ['Expense Tracker', 'Track personal expenses stored in a CSV file and report spending by category.', ['Read and write a CSV file', 'Summarise totals per category', 'Handle a missing or malformed file gracefully']]),
      m('py-oop', 'Object-oriented Python', ['OOP', 'Classes'], ['Library Management System', 'Model books, members and loans with classes.', ['At least three classes with clear responsibilities', 'Borrow and return operations with validation', 'Show inheritance or composition somewhere meaningful']]),
    ],
  }),
  course({
    id: 'dsa-essentials', title: 'Data Structures & Algorithms', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['software-eng', 'ai-ml', 'quant-finance', 'cloud-devops'], prerequisites: ['py-foundations'],
    price: 1000, duration: '8 weeks', difficulty: 'intermediate',
    description: 'The data structures and algorithms every software engineer relies on.',
    modules: [
      m('dsa-arrays', 'Arrays, strings & hashing', ['Arrays', 'Hash maps'], ['Word Frequency Analyzer', 'Analyse a text file and report the most frequent words efficiently.', ['Use a hash map for counting', 'Return the top-k words', 'State the time complexity of your solution in the README']]),
      m('dsa-linear', 'Stacks, queues & linked lists', ['Linked lists', 'Stacks', 'Queues'], ['Browser History Simulator', 'Implement back/forward navigation like a web browser.', ['Implement the structures yourself (no library deque)', 'Support visit, back and forward', 'Include example runs']]),
      m('dsa-graphs', 'Trees & graphs', ['Graphs', 'BFS/DFS', 'Trees'], ['Campus Route Finder', 'Find shortest walking routes between buildings on a campus map.', ['Model the campus as a graph', 'Use BFS or Dijkstra for shortest paths', 'Print the route, not just its length']]),
      m('dsa-sorting', 'Sorting & searching', ['Sorting', 'Binary search'], ['Leaderboard Engine', 'Maintain a ranked leaderboard with fast lookups.', ['Implement one sorting algorithm yourself', 'Use binary search for rank lookup', 'Compare timings against the built-in sort']]),
    ],
  }),
  course({
    id: 'web-fullstack', title: 'Full-Stack Web Development', provider: 'The Odin Project', url: 'https://www.theodinproject.com',
    careers: ['software-eng', 'ux-design', 'product-management', 'entrepreneurship', 'cloud-devops'],
    price: 0, duration: '12 weeks', difficulty: 'beginner',
    description: 'HTML, CSS, JavaScript, APIs and React — enough to build and ship real web apps.',
    modules: [
      m('web-layout', 'HTML & CSS layout', ['HTML', 'CSS', 'Responsive design'], ['Responsive Portfolio Page', 'Build a personal portfolio page that works on phone and desktop.', ['Semantic HTML structure', 'Flexbox or grid layout', 'Responsive at phone and desktop widths']]),
      m('web-js', 'JavaScript & the DOM', ['JavaScript', 'DOM'], ['Quiz Game', 'Build a browser quiz that tracks score and shows results.', ['Render questions dynamically from data', 'Handle user input with event listeners', 'Show a final score screen']]),
      m('web-apis', 'REST APIs', ['REST APIs', 'Fetch', 'Async JavaScript'], ['Weather Dashboard', 'Build a weather dashboard that consumes a public REST API and displays live weather data.', ['Call a public weather REST API', 'Handle loading and error states', 'Display current conditions and a short forecast']]),
      m('web-react', 'React state management', ['React', 'State management'], ['Task Manager App', 'Build an interactive task manager using React state.', ['Add, complete and delete tasks', 'Filter by status using state', 'Persist tasks in localStorage']]),
    ],
  }),
  course({
    id: 'backend-systems', title: 'Backend Engineering with Databases', provider: 'Udemy', url: 'https://www.udemy.com',
    careers: ['software-eng', 'cloud-devops', 'product-management'], prerequisites: ['web-fullstack'],
    price: 3500, duration: '8 weeks', difficulty: 'intermediate',
    description: 'Databases, authentication, testing and the basics of system design.',
    modules: [
      m('be-sql', 'Relational databases', ['SQL', 'Data modelling'], ['Event Booking API', 'Design a database and API for booking seats at college events.', ['Normalised schema with at least 3 tables', 'CRUD endpoints for events and bookings', 'Prevent double-booking a seat']]),
      m('be-auth', 'Authentication & sessions', ['Authentication', 'Security basics'], ['Secure Notes Service', 'Build a notes API where users only see their own notes.', ['Sign-up and login with hashed passwords', 'Token or session-based auth', 'Authorisation check on every note route']]),
      m('be-testing', 'Automated testing', ['Testing', 'CI'], ['Tested URL Shortener', 'Build a URL shortener with a meaningful test suite.', ['Unit tests for core logic', 'At least one integration test of an endpoint', 'Tests run automatically on push (CI)']]),
      m('be-design', 'System design basics', ['System design', 'Caching'], ['Scalable Leaderboard Design', 'Design and prototype a leaderboard service that handles many reads.', ['Architecture diagram in the README', 'Add a caching layer', 'Explain how it would scale to 1M users']]),
    ],
  }),

  // ------------------------------------------------------------ data / AI
  course({
    id: 'sql-analytics', title: 'SQL for Data Analysis', provider: 'Kaggle Learn', url: 'https://www.kaggle.com/learn',
    careers: ['data-science', 'ai-ml', 'consulting-analyst', 'product-management', 'software-eng'],
    price: 0, duration: '3 weeks', difficulty: 'beginner',
    description: 'Query real datasets: filtering, aggregation, joins and window functions.',
    modules: [
      m('sql-select', 'SELECT, filtering & sorting', ['SQL', 'Filtering'], ['Movie Database Explorer', 'Answer ten questions about a public movie dataset using SQL.', ['Load the dataset into SQLite or Postgres', 'Write at least 10 queries with WHERE and ORDER BY', 'Document each question and its answer']]),
      m('sql-aggregate', 'Aggregations & GROUP BY', ['Aggregation', 'GROUP BY'], ['Sales Summary Report', 'Produce a monthly sales summary from transaction data.', ['Aggregate by month and category', 'Use HAVING for at least one filter', 'Present results as tables or charts']]),
      m('sql-joins', 'SQL joins', ['SQL joins', 'Relational data'], ['Student Database Insights', 'Analyse a student database using JOIN queries and produce meaningful insights.', ['Use INNER and LEFT joins across at least 3 tables', 'Answer 5 questions that require joins', 'Explain one surprising insight']]),
      m('sql-window', 'Window functions', ['Window functions', 'Ranking'], ['Cricket Stats Ranker', 'Rank players and compute rolling averages from match data.', ['Use RANK or ROW_NUMBER', 'Compute a rolling average with a window frame', 'Compare against a GROUP BY approach']]),
    ],
  }),
  course({
    id: 'stats-probability', title: 'Statistics & Probability', provider: 'Khan Academy', url: 'https://www.khanacademy.org',
    careers: ['data-science', 'ai-ml', 'quant-finance', 'research-academia', 'biomedical'],
    price: 0, duration: '6 weeks', difficulty: 'beginner',
    description: 'Descriptive statistics, probability, distributions and hypothesis testing.',
    modules: [
      m('st-descriptive', 'Descriptive statistics', ['Descriptive statistics', 'Distributions'], ['Class Marks Analysis', 'Summarise a marks dataset and describe its distribution.', ['Compute mean, median, spread and outliers', 'Plot a histogram and box plot', 'Interpret the shape of the distribution']]),
      m('st-probability', 'Probability', ['Probability', 'Simulation'], ['Monte Carlo Dice Lab', 'Estimate probabilities by simulation and compare with theory.', ['Simulate at least two probability problems', 'Compare simulated vs exact answers', 'Show convergence as trials increase']]),
      m('st-hypothesis', 'Hypothesis testing', ['Hypothesis testing', 'A/B testing'], ['A/B Test Analyzer', 'Decide whether a website change improved sign-ups.', ['State null and alternative hypotheses', 'Run an appropriate statistical test', 'Explain the result and its limitations']]),
    ],
  }),
  course({
    id: 'data-analysis-python', title: 'Data Analysis with Python', provider: 'Kaggle Learn', url: 'https://www.kaggle.com/learn',
    careers: ['data-science', 'ai-ml', 'biomedical', 'energy-sustainability', 'quant-finance'], prerequisites: ['py-foundations'],
    price: 0, duration: '5 weeks', difficulty: 'beginner',
    description: 'NumPy, Pandas, cleaning and visualisation for real datasets.',
    modules: [
      m('da-numpy', 'NumPy & Pandas', ['NumPy', 'Pandas'], ['City Air Quality Explorer', 'Load and explore an air-quality dataset with Pandas.', ['Load data into a DataFrame', 'Use vectorised NumPy/Pandas operations', 'Answer three questions about the data']]),
      m('da-cleaning', 'Data cleaning', ['Data cleaning', 'Missing values'], ['Messy Survey Cleaner', 'Clean a messy survey dataset into an analysis-ready table.', ['Handle missing values with a stated strategy', 'Fix inconsistent categories and types', 'Show before/after data quality checks']]),
      m('da-viz', 'Data visualisation', ['Data visualisation', 'Matplotlib'], ['Cricket Performance Dashboard', 'Visualise player performance trends across seasons.', ['At least four different chart types', 'Clear titles, labels and units', 'One chart that tells a specific story']]),
      m('da-eda', 'Exploratory data analysis', ['EDA', 'Insight communication'], ['Startup Funding EDA', 'Explore a startup funding dataset and report key insights.', ['Univariate and bivariate analysis', 'At least three written insights backed by charts', 'A short executive summary']]),
    ],
  }),
  course({
    id: 'ml-foundations', title: 'Machine Learning Foundations', provider: 'Coursera (audit)', url: 'https://www.coursera.org',
    careers: ['ai-ml', 'data-science', 'quant-finance', 'research-academia', 'biomedical'], prerequisites: ['data-analysis-python', 'stats-probability'],
    price: 0, duration: '8 weeks', difficulty: 'beginner',
    description: 'Supervised learning from first principles: regression, classification and evaluation.',
    modules: [
      m('ml-prep', 'Data preparation for ML', ['Data preparation', 'Feature scaling'], ['Housing Data Pipeline', 'Prepare a housing dataset for modelling.', ['Train/test split before any fitting', 'Scale and encode features correctly', 'Explain how you avoided data leakage']]),
      m('ml-linreg', 'Linear regression', ['Linear Regression', 'Model Evaluation'], ['Student Performance Predictor', 'Build a model that predicts student performance using relevant features and linear regression.', ['Load and clean a dataset', 'Perform exploratory analysis', 'Train a linear regression model', 'Evaluate predictions with suitable metrics', 'Explain the model coefficients']]),
      m('ml-classification', 'Classification', ['Classification', 'Logistic Regression'], ['Loan Approval Classifier', 'Predict whether a loan application is approved.', ['Train at least two classifiers', 'Handle class imbalance if present', 'Report precision, recall and a confusion matrix']]),
      m('ml-evaluation', 'Model evaluation & tuning', ['Model Evaluation', 'Cross-validation'], ['Model Comparison Report', 'Compare several models fairly on one problem.', ['Use k-fold cross-validation', 'Tune hyperparameters for one model', 'Justify the final model choice']]),
    ],
  }),
  course({
    id: 'ml-pg-certificate', title: 'PG Certificate in Applied Machine Learning', provider: 'University executive programme', url: 'https://www.coursera.org',
    careers: ['ai-ml', 'data-science'], prerequisites: ['ml-foundations'],
    price: 150000, duration: '6 months', difficulty: 'intermediate',
    description: 'Structured, mentored programme with industry projects and a capstone.',
    modules: [
      m('mlc-features', 'Feature engineering', ['Feature engineering'], ['Credit Risk Features', 'Engineer features that improve a credit-risk model.', ['Create at least 5 new features', 'Measure the improvement over a baseline', 'Explain why each feature helps']]),
      m('mlc-ensembles', 'Ensemble methods', ['Random Forest', 'Gradient Boosting'], ['Crop Yield Forecaster', 'Forecast crop yield with tree ensembles.', ['Compare random forest and gradient boosting', 'Interpret feature importance', 'Report error on a held-out set']]),
      m('mlc-deploy', 'Model deployment', ['Model deployment', 'APIs'], ['Deployed Prediction API', 'Serve a trained model behind a web API.', ['Wrap the model in a REST endpoint', 'Validate inputs', 'Deploy to a free hosting tier']]),
    ],
  }),
  course({
    id: 'deep-learning', title: 'Practical Deep Learning', provider: 'fast.ai', url: 'https://course.fast.ai',
    careers: ['ai-ml', 'research-academia', 'robotics', 'biomedical'], prerequisites: ['ml-foundations'],
    price: 0, duration: '10 weeks', difficulty: 'intermediate',
    description: 'Neural networks, computer vision, NLP and modern LLM applications.',
    modules: [
      m('dl-nn', 'Neural networks', ['Neural networks', 'PyTorch'], ['Handwritten Digit Recogniser', 'Train a neural network to recognise handwritten digits.', ['Build and train a network in PyTorch', 'Plot training and validation loss', 'Report test accuracy']]),
      m('dl-cv', 'Computer vision', ['Computer Vision', 'CNNs'], ['Plant Disease Classifier', 'Build a basic image classification application for plant leaf diseases.', ['Use a CNN or transfer learning', 'Augment the training data', 'Simple interface to classify a new image']]),
      m('dl-nlp', 'NLP & transformers', ['NLP', 'Transformers'], ['Review Sentiment Analyzer', 'Classify product reviews as positive or negative with a transformer.', ['Fine-tune or use a pretrained transformer', 'Evaluate on held-out reviews', 'Show examples of errors and why they happen']]),
      m('dl-llm', 'LLM applications', ['LLM Engineering', 'Retrieval'], ['Course Notes Q&A Bot', 'Answer questions over your own course notes using retrieval + an LLM.', ['Chunk and embed your documents', 'Retrieve relevant passages per question', 'Show sources alongside answers']]),
    ],
  }),
  course({
    id: 'mlops', title: 'MLOps Zoomcamp', provider: 'DataTalks.Club', url: 'https://datatalks.club',
    careers: ['ai-ml', 'cloud-devops', 'data-science'], prerequisites: ['ml-foundations'],
    price: 0, duration: '8 weeks', difficulty: 'advanced',
    description: 'Taking models to production: tracking, serving and monitoring.',
    modules: [
      m('mlops-tracking', 'Experiment tracking', ['Experiment tracking', 'MLflow'], ['Tracked Model Experiments', 'Track experiments for a model with MLflow or similar.', ['Log parameters, metrics and artefacts', 'Compare at least 5 runs', 'Register the best model']]),
      m('mlops-serving', 'Model serving', ['Model serving', 'Docker'], ['Containerised Model Service', 'Serve a model from a Docker container.', ['Dockerfile for the service', 'Health-check and predict endpoints', 'Instructions to run it locally']]),
      m('mlops-monitoring', 'Monitoring', ['Model monitoring', 'Data drift'], ['Drift Monitor', 'Detect data drift for a deployed model.', ['Compare live vs training distributions', 'Raise an alert on drift', 'Visualise drift over time']]),
    ],
  }),
  course({
    id: 'bi-dashboards', title: 'Business Intelligence with Power BI', provider: 'Microsoft Learn', url: 'https://learn.microsoft.com/training',
    careers: ['data-science', 'consulting-analyst', 'product-management'],
    price: 0, duration: '4 weeks', difficulty: 'beginner',
    description: 'Model data and build dashboards that decision-makers use.',
    modules: [
      m('bi-model', 'Data modelling', ['Data modelling', 'DAX'], ['Retail Data Model', 'Model a retail dataset into a star schema.', ['Fact and dimension tables', 'At least three calculated measures', 'Document relationships']]),
      m('bi-dashboard', 'Dashboard design', ['Dashboards', 'Data visualisation'], ['Hostel Mess Feedback Dashboard', 'Build a dashboard from mess feedback data for hostel administrators.', ['Key metrics at a glance', 'Filters by date and meal', 'Publish screenshots and the file in the repo']]),
      m('bi-story', 'Storytelling with data', ['Data storytelling', 'Communication'], ['Insight Brief', 'Turn a dashboard into a one-page recommendation.', ['Three insights with supporting visuals', 'One clear recommendation', 'Written for a non-technical reader']]),
    ],
  }),

  // ------------------------------------------------------------ security
  course({
    id: 'sec-foundations', title: 'Cyber Security Foundations', provider: 'TryHackMe', url: 'https://tryhackme.com',
    careers: ['cybersecurity', 'cloud-devops'],
    price: 5000, duration: '8 weeks', difficulty: 'beginner',
    description: 'Networking, Linux, web vulnerabilities and cryptography through hands-on labs.',
    modules: [
      m('sec-network', 'Networking basics', ['Networking', 'TCP/IP'], ['Home Network Mapper', 'Map and document devices and open ports on a lab network.', ['Scan a lab/VM network you own', 'Explain each open service found', 'Recommend hardening steps']]),
      m('sec-linux', 'Linux for security', ['Linux', 'Permissions'], ['Log Watchdog Script', 'Write a script that flags suspicious login attempts in auth logs.', ['Parse a sample auth log', 'Detect brute-force patterns', 'Output a readable alert report']]),
      m('sec-web', 'Web vulnerabilities (OWASP)', ['OWASP Top 10', 'Web security'], ['Vulnerable App Audit', 'Find and fix vulnerabilities in an intentionally vulnerable web app (e.g. DVWA).', ['Exploit at least three vulnerabilities in a lab', 'Explain each root cause', 'Show the fixed code or configuration']]),
      m('sec-crypto', 'Cryptography basics', ['Cryptography', 'Hashing'], ['Password Vault', 'Build a small password vault that encrypts secrets at rest.', ['Use a vetted crypto library (no homemade crypto)', 'Derive keys from a master password', 'Explain your threat model']]),
    ],
  }),
  course({
    id: 'sec-offensive', title: 'Penetration Testing Professional Track', provider: 'Hack The Box Academy', url: 'https://academy.hackthebox.com',
    careers: ['cybersecurity'], prerequisites: ['sec-foundations'],
    price: 20000, duration: '4 months', difficulty: 'intermediate',
    description: 'Structured offensive-security path with lab machines and reporting.',
    modules: [
      m('pt-recon', 'Reconnaissance & scanning', ['Reconnaissance', 'Nmap'], ['Recon Automation Tool', 'Automate reconnaissance against a lab target.', ['Chain at least two recon tools', 'Produce a structured findings file', 'Only target lab machines you are authorised to test']]),
      m('pt-exploit', 'Exploitation', ['Exploitation', 'Privilege escalation'], ['Lab Machine Write-up', 'Compromise a retired lab machine and write it up.', ['Document each step with evidence', 'Explain the vulnerability chain', 'Suggest remediations']]),
      m('pt-report', 'Professional reporting', ['Security reporting', 'Risk rating'], ['Pentest Report', 'Write a professional report for a lab engagement.', ['Executive summary', 'Findings rated by severity', 'Clear remediation guidance']]),
    ],
  }),

  // ------------------------------------------------------------ cloud
  course({
    id: 'cloud-foundations', title: 'Cloud Practitioner Essentials', provider: 'AWS Skill Builder', url: 'https://skillbuilder.aws',
    careers: ['cloud-devops', 'software-eng', 'cybersecurity', 'ai-ml'],
    price: 0, duration: '4 weeks', difficulty: 'beginner',
    description: 'Core cloud services, identity and access, deployment and cost.',
    modules: [
      m('cl-core', 'Core cloud services', ['Cloud computing', 'Compute & storage'], ['Static Site on the Cloud', 'Host a static website using cloud object storage and a CDN.', ['Deploy using object storage', 'Serve over HTTPS via a CDN', 'Document the architecture']]),
      m('cl-iam', 'Identity & access', ['IAM', 'Least privilege'], ['Least-Privilege Policy Lab', 'Design IAM roles for a small team and verify them.', ['Separate roles for dev, ops and read-only', 'Policies follow least privilege', 'Show tests that denied actions fail']]),
      m('cl-deploy', 'Deploying applications', ['Deployment', 'Serverless'], ['Serverless Feedback Form', 'Build a feedback form backed by a serverless function and database.', ['Serverless function handles submissions', 'Data stored in a managed database', 'Infrastructure steps documented']]),
    ],
  }),
  course({
    id: 'devops-containers', title: 'DevOps: Containers, CI/CD & Kubernetes', provider: 'KodeKloud', url: 'https://kodekloud.com',
    careers: ['cloud-devops', 'software-eng'], prerequisites: ['cloud-foundations'],
    price: 12000, duration: '3 months', difficulty: 'intermediate',
    description: 'Docker, pipelines, Kubernetes and infrastructure as code with labs.',
    modules: [
      m('do-docker', 'Docker', ['Docker', 'Containers'], ['Containerised Web App', 'Containerise a multi-service app with Docker Compose.', ['Dockerfile per service', 'Compose file wiring services together', 'Small final image sizes (explain how)']]),
      m('do-cicd', 'CI/CD pipelines', ['CI/CD', 'GitHub Actions'], ['Automated Deploy Pipeline', 'Build a pipeline that tests and deploys on every push.', ['Run tests in CI', 'Build and push an image', 'Deploy automatically on main']]),
      m('do-k8s', 'Kubernetes', ['Kubernetes', 'Orchestration'], ['Kubernetes Microservice', 'Run a small service on a local Kubernetes cluster.', ['Deployment, Service and ConfigMap manifests', 'Scale replicas and show it working', 'Rolling update without downtime']]),
      m('do-iac', 'Infrastructure as code', ['Terraform', 'Infrastructure as code'], ['Terraform Environment', 'Provision a small environment with Terraform.', ['Reusable variables and outputs', 'Plan and apply documented', 'Destroy cleanly']]),
    ],
  }),

  // ------------------------------------------------------------ electronics
  course({
    id: 'embedded-c', title: 'Embedded Systems with C', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['embedded-iot', 'robotics', 'vlsi', 'biomedical', 'energy-sustainability'],
    price: 1000, duration: '8 weeks', difficulty: 'beginner',
    description: 'Programming microcontrollers in C: GPIO, timers, protocols and interrupts.',
    modules: [
      m('emb-c', 'C & pointers for embedded', ['Embedded C', 'Pointers'], ['Ring Buffer Library', 'Implement a ring buffer suitable for embedded use.', ['Fixed-size, no dynamic allocation', 'Unit tests on a PC', 'Explain memory layout']]),
      m('emb-gpio', 'GPIO & timers', ['GPIO', 'Timers'], ['Traffic Light Controller', 'Control a traffic light sequence with timers on a microcontroller or simulator.', ['Timer-driven state changes (no busy waiting)', 'Pedestrian button input', 'Video or simulator screenshots in the README']]),
      m('emb-serial', 'Serial protocols (UART, I2C, SPI)', ['UART', 'I2C', 'SPI'], ['Sensor Data Logger', 'Read a sensor over I2C and log readings over UART.', ['Read an I2C sensor', 'Stream formatted readings over UART', 'Handle sensor read errors']]),
      m('emb-interrupts', 'Interrupts', ['Interrupts', 'Real-time'], ['Reaction Time Game', 'Build a reaction-time game driven by interrupts.', ['Interrupt-driven button handling', 'Debouncing', 'Measure and display reaction time']]),
    ],
  }),
  course({
    id: 'iot-systems', title: 'IoT Systems & Edge Devices', provider: 'Coursera', url: 'https://www.coursera.org',
    careers: ['embedded-iot', 'energy-sustainability', 'robotics'], prerequisites: ['embedded-c'],
    price: 4000, duration: '6 weeks', difficulty: 'intermediate',
    description: 'Sensors, connectivity, RTOS and low-power design for connected devices.',
    modules: [
      m('iot-sensors', 'Sensors & data acquisition', ['Sensors', 'Data acquisition'], ['Smart Plant Monitor', 'Monitor soil moisture and light for a plant.', ['Read two sensors', 'Calibrate readings', 'Trigger an alert below a threshold']]),
      m('iot-mqtt', 'MQTT & cloud connectivity', ['MQTT', 'IoT cloud'], ['Classroom Occupancy Tracker', 'Publish occupancy data to a dashboard over MQTT.', ['Publish via MQTT', 'Live dashboard of readings', 'Handle reconnects']]),
      m('iot-rtos', 'RTOS basics', ['RTOS', 'Task scheduling'], ['Multitask Weather Station', 'Run sensing, display and upload as separate RTOS tasks.', ['At least three tasks', 'Use a queue or semaphore', 'Explain task priorities']]),
    ],
  }),
  course({
    id: 'digital-verilog', title: 'Digital Design with Verilog', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['vlsi', 'embedded-iot'],
    price: 1000, duration: '8 weeks', difficulty: 'beginner',
    description: 'Digital logic, Verilog HDL, state machines and testbenches.',
    modules: [
      m('dv-logic', 'Digital logic', ['Digital logic', 'Combinational circuits'], ['4-bit ALU', 'Design and simulate a 4-bit ALU.', ['Support at least 6 operations', 'Testbench covering all operations', 'Waveform screenshots']]),
      m('dv-verilog', 'Verilog fundamentals', ['Verilog', 'RTL'], ['UART Transmitter in Verilog', 'Implement a UART transmitter in RTL.', ['Parameterised baud rate', 'Simulated transmission of a byte', 'Synthesisable code']]),
      m('dv-fsm', 'Finite state machines', ['FSM design'], ['Vending Machine FSM', 'Design a vending machine controller as an FSM.', ['State diagram in the README', 'Handles change and invalid inputs', 'Testbench for each path']]),
      m('dv-testbench', 'Testbenches & verification', ['Verification', 'Testbenches'], ['Self-checking FIFO Testbench', 'Write a self-checking testbench for a FIFO.', ['Randomised stimulus', 'Automatic pass/fail checks', 'Coverage of full/empty corner cases']]),
    ],
  }),
  course({
    id: 'vlsi-pro', title: 'VLSI Design & Verification Programme', provider: 'VLSI training institute', url: 'https://nptel.ac.in',
    careers: ['vlsi'], prerequisites: ['digital-verilog'],
    price: 80000, duration: '5 months', difficulty: 'intermediate',
    description: 'Industry-style RTL, SystemVerilog/UVM verification and physical design exposure.',
    modules: [
      m('vp-rtl', 'RTL design', ['RTL design', 'Pipelining'], ['Pipelined RISC-V Core', 'Implement a simple pipelined RISC-V core.', ['At least 5 pipeline stages', 'Hazard handling', 'Run a small test program']]),
      m('vp-uvm', 'SystemVerilog & UVM', ['SystemVerilog', 'UVM'], ['UVM Environment for an APB Slave', 'Build a UVM verification environment.', ['Agent, driver, monitor and scoreboard', 'Constrained-random tests', 'Functional coverage report']]),
      m('vp-sta', 'Synthesis & timing', ['Synthesis', 'Static timing analysis'], ['Timing Closure Study', 'Synthesise a design and fix timing violations.', ['Report initial slack', 'Apply at least two fixes', 'Explain each trade-off']]),
    ],
  }),

  // ------------------------------------------------------------ robotics / mech / civil / energy / bio
  course({
    id: 'robotics-ros', title: 'Robotics with ROS 2', provider: 'ROS 2 tutorials', url: 'https://docs.ros.org',
    careers: ['robotics', 'embedded-iot'], prerequisites: ['py-foundations'],
    price: 0, duration: '10 weeks', difficulty: 'intermediate',
    description: 'ROS 2, kinematics, perception and path planning in simulation.',
    modules: [
      m('ros-basics', 'ROS 2 fundamentals', ['ROS 2', 'Publish/subscribe'], ['Turtle Patrol Node', 'Make a simulated robot patrol a route with ROS 2 nodes.', ['Publisher and subscriber nodes', 'A launch file', 'Parameters for speed and route']]),
      m('ros-kinematics', 'Kinematics', ['Kinematics', 'Robot arms'], ['2-Link Arm Simulator', 'Simulate forward and inverse kinematics of a 2-link arm.', ['Forward kinematics implementation', 'Inverse kinematics for reachable points', 'Visualise the arm moving']]),
      m('ros-perception', 'Sensors & perception', ['Perception', 'Sensor fusion'], ['Obstacle Detector', 'Detect obstacles from simulated lidar or camera data.', ['Process sensor messages', 'Publish detected obstacles', 'Visualise in RViz']]),
      m('ros-planning', 'Path planning', ['Path planning', 'A*'], ['Warehouse Path Planner', 'Plan collision-free paths in a warehouse grid.', ['Implement A* or similar', 'Avoid static obstacles', 'Compare with a naive approach']]),
    ],
  }),
  course({
    id: 'cad-design', title: 'CAD & Product Design', provider: 'Autodesk Fusion (education)', url: 'https://www.autodesk.com/education',
    careers: ['core-mech', 'robotics', 'civil-infra', 'energy-sustainability'],
    price: 0, duration: '6 weeks', difficulty: 'beginner',
    description: 'Parametric modelling, assemblies, drawings and basic simulation.',
    modules: [
      m('cad-parts', 'Parametric parts', ['CAD', 'Parametric modelling'], ['Phone Stand Design', 'Design a parametric phone stand that adapts to phone sizes.', ['Fully constrained sketches', 'Parameters for width and angle', 'Export images and model files to the repo']]),
      m('cad-assembly', 'Assemblies & joints', ['Assemblies', 'Mechanisms'], ['Gear Train Assembly', 'Model a gear train with correct ratios.', ['At least three gears with joints', 'Animate motion', 'Explain the gear ratio']]),
      m('cad-drawings', 'Engineering drawings', ['Engineering drawing', 'GD&T'], ['Bracket Drawing Set', 'Produce manufacturing drawings for a bracket.', ['Orthographic views with dimensions', 'Tolerances on critical features', 'Title block and notes']]),
      m('cad-fea', 'Simulation & FEA', ['FEA', 'Stress analysis'], ['Shelf Bracket Stress Study', 'Analyse a shelf bracket under load and improve it.', ['Run a static stress study', 'Identify the weak point', 'Redesign and compare results']]),
    ],
  }),
  course({
    id: 'manufacturing', title: 'Manufacturing Processes & Lean', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['core-mech', 'entrepreneurship'], prerequisites: ['cad-design'],
    price: 1000, duration: '8 weeks', difficulty: 'intermediate',
    description: 'Processes, design for manufacture and lean improvement methods.',
    modules: [
      m('mf-process', 'Process selection', ['Manufacturing processes', 'Process selection'], ['Process Selection Study', 'Choose manufacturing processes for a product at three volumes.', ['Compare at least three processes', 'Cost per part estimate', 'Justify the choice per volume']]),
      m('mf-dfm', 'Design for manufacture', ['DFM', 'Cost reduction'], ['DFM Redesign', 'Redesign a part to be cheaper to manufacture.', ['Before/after models', 'List of DFM changes', 'Estimated cost impact']]),
      m('mf-lean', 'Lean & quality', ['Lean', 'Quality control'], ['Canteen Queue Kaizen', 'Apply lean tools to reduce canteen queue time.', ['Value-stream map of the current process', 'Data collected on wait times', 'Proposed improvements with expected impact']]),
    ],
  }),
  course({
    id: 'civil-bim', title: 'BIM & Structural Design', provider: 'Autodesk Revit (education)', url: 'https://www.autodesk.com/education',
    careers: ['civil-infra'],
    price: 0, duration: '8 weeks', difficulty: 'beginner',
    description: 'Drafting, BIM modelling, structural analysis and estimation.',
    modules: [
      m('cv-draft', 'AutoCAD drafting', ['AutoCAD', 'Drafting'], ['Hostel Floor Plan', 'Draft a dimensioned floor plan for a hostel wing.', ['Layers and line types used correctly', 'Full dimensions and labels', 'Export drawings to the repo']]),
      m('cv-bim', 'BIM modelling', ['BIM', 'Revit'], ['Two-Storey Building Model', 'Model a two-storey building in BIM.', ['Walls, floors, roof and openings', 'Generated sections and schedules', 'Rendered views']]),
      m('cv-structure', 'Structural analysis', ['Structural analysis', 'STAAD.Pro'], ['Footbridge Analysis', 'Analyse a simple footbridge under pedestrian load.', ['Model loads and supports', 'Report member forces', 'Check against code limits']]),
      m('cv-estimate', 'Estimation & planning', ['Estimation', 'Project planning'], ['Classroom Block Estimate', 'Estimate quantities and schedule for a classroom block.', ['Bill of quantities', 'Cost estimate with rates', 'Gantt chart schedule']]),
    ],
  }),
  course({
    id: 'renewable-energy', title: 'Renewable Energy Systems', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['energy-sustainability'],
    price: 1000, duration: '8 weeks', difficulty: 'beginner',
    description: 'Solar PV, wind, energy audits and storage.',
    modules: [
      m('re-solar', 'Solar PV design', ['Solar PV', 'System sizing'], ['Rooftop Solar Sizer', 'Size a rooftop solar system for a home or hostel.', ['Estimate load from real usage', 'Size panels and inverter', 'Payback period calculation']]),
      m('re-audit', 'Energy auditing', ['Energy audit', 'Efficiency'], ['Lab Energy Audit', 'Audit the energy use of a lab or hostel floor.', ['Measured or estimated consumption by device', 'Top three savings opportunities', 'Cost and CO2 impact']]),
      m('re-storage', 'Energy storage', ['Battery storage', 'Modelling'], ['Battery Backup Simulator', 'Simulate a battery backing up solar for a day.', ['Hourly generation and load profile', 'Battery state-of-charge model', 'Recommend battery size']]),
    ],
  }),
  course({
    id: 'biomed-signals', title: 'Biomedical Signals & Devices', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['biomedical'],
    price: 1000, duration: '8 weeks', difficulty: 'beginner',
    description: 'Physiology for engineers, biosignals, processing and device regulation.',
    modules: [
      m('bm-physio', 'Physiology for engineers', ['Physiology', 'Biosignals'], ['Heart Rate Explainer', 'Build an interactive explainer of the cardiac cycle and ECG.', ['Annotated ECG waveform', 'Explain each wave physiologically', 'Simple interactive element']]),
      m('bm-signal', 'Biosignal processing', ['Signal processing', 'Filtering'], ['ECG Heart-Rate Detector', 'Detect heart rate from a public ECG recording.', ['Filter noise from the signal', 'Detect R-peaks', 'Report heart rate and compare with labels']]),
      m('bm-device', 'Medical device design & regulation', ['Medical devices', 'Regulation'], ['Device Risk File', 'Write a risk analysis for a simple wearable monitor.', ['Identify hazards and severity', 'Mitigations for each', 'Map to the relevant regulatory class']]),
    ],
  }),

  // ------------------------------------------------------------ product / design / business / research / finance
  course({
    id: 'ux-foundations', title: 'UX Design Professional Certificate', provider: 'Google (Coursera)', url: 'https://www.coursera.org',
    careers: ['ux-design', 'product-management'],
    price: 12000, duration: '6 months', difficulty: 'beginner',
    description: 'Research, wireframing, prototyping and usability testing with a portfolio.',
    modules: [
      m('ux-research', 'UX research', ['User research', 'Interviews'], ['Canteen App Research', 'Research how students order food on campus.', ['Interview at least 5 students', 'Affinity map of findings', 'Two personas grounded in the data']]),
      m('ux-wireframe', 'Wireframing in Figma', ['Wireframing', 'Figma'], ['Library Booking Wireframes', 'Wireframe a library seat-booking flow.', ['Low-fidelity wireframes for the full flow', 'Annotated design decisions', 'Link to the Figma file']]),
      m('ux-prototype', 'Prototyping', ['Prototyping', 'Interaction design'], ['Interactive Prototype', 'Turn your wireframes into a clickable high-fidelity prototype.', ['Consistent visual style', 'Interactive prototype link', 'Accessibility checks (contrast, sizes)']]),
      m('ux-testing', 'Usability testing', ['Usability testing', 'Iteration'], ['Usability Test & Iterate', 'Test your prototype and improve it.', ['Test with at least 4 users', 'Prioritised list of issues', 'Before/after screens of fixes']]),
    ],
  }),
  course({
    id: 'figma-free', title: 'UI Design Basics', provider: 'Figma Learn', url: 'https://help.figma.com/hc/en-us/categories/360002051613',
    careers: ['ux-design'],
    price: 0, duration: '3 weeks', difficulty: 'beginner',
    description: 'Free introduction to visual design and Figma.',
    modules: [
      m('fg-visual', 'Visual design principles', ['Visual design', 'Typography'], ['Event Poster Series', 'Design three posters for a college fest using one visual system.', ['Consistent type scale and colours', 'Clear hierarchy', 'Explain your choices']]),
      m('fg-components', 'Components & auto layout', ['Figma components', 'Design systems'], ['Mini Design System', 'Build a small component library.', ['Buttons, inputs and cards as components', 'Variants for states', 'Usage notes']]),
    ],
  }),
  course({
    id: 'product-mgmt', title: 'Product Management Fundamentals', provider: 'Product School', url: 'https://productschool.com',
    careers: ['product-management', 'entrepreneurship', 'consulting-analyst'],
    price: 8000, duration: '6 weeks', difficulty: 'beginner',
    description: 'Discovery, metrics, specs and roadmaps.',
    modules: [
      m('pm-discovery', 'Problem discovery', ['Customer discovery', 'Problem framing'], ['Campus Problem Discovery', 'Find and validate a real problem students face.', ['At least 8 user conversations', 'Problem statement with evidence', 'Prioritised opportunities']]),
      m('pm-metrics', 'Product metrics', ['Product metrics', 'Analytics'], ['Metrics Tree for a Food App', 'Define the metrics that matter for a food-delivery app.', ['North-star metric', 'Driver metrics tree', 'How each would be measured']]),
      m('pm-spec', 'Writing specs', ['PRDs', 'Requirements'], ['Feature PRD', 'Write a product requirements document for one feature.', ['Problem, goals and non-goals', 'User stories with acceptance criteria', 'Success metrics']]),
      m('pm-roadmap', 'Roadmapping', ['Roadmapping', 'Prioritisation'], ['Quarterly Roadmap', 'Plan a quarter for a student app using a prioritisation framework.', ['Score items with RICE or similar', 'Roadmap with rationale', 'Risks and dependencies']]),
    ],
  }),
  course({
    id: 'problem-solving', title: 'Structured Problem Solving for Business', provider: 'edX (audit)', url: 'https://www.edx.org',
    careers: ['consulting-analyst', 'product-management', 'entrepreneurship'],
    price: 0, duration: '5 weeks', difficulty: 'beginner',
    description: 'Problem structuring, spreadsheet modelling, business writing and presenting.',
    modules: [
      m('ps-structure', 'Problem structuring', ['Issue trees', 'Hypothesis-driven thinking'], ['Mess Food Waste Case', 'Structure the problem of food waste in a hostel mess.', ['Issue tree that is MECE', 'Hypotheses to test', 'Data you would collect']]),
      m('ps-excel', 'Spreadsheet modelling', ['Excel modelling', 'Scenario analysis'], ['Cafe Break-even Model', 'Model when a campus cafe would break even.', ['Inputs separated from calculations', 'Three scenarios', 'Sensitivity on the key driver']]),
      m('ps-present', 'Presenting recommendations', ['Business writing', 'Presentation'], ['Recommendation Deck', 'Turn an analysis into a 6-slide recommendation.', ['Clear storyline (answer first)', 'One message per slide', 'Supporting data on every slide']]),
    ],
  }),
  course({
    id: 'startup-school', title: 'Startup School', provider: 'Y Combinator', url: 'https://www.startupschool.org',
    careers: ['entrepreneurship', 'product-management'],
    price: 0, duration: '8 weeks', difficulty: 'beginner',
    description: 'How to find a problem, build an MVP and get first users.',
    modules: [
      m('ss-discovery', 'Customer discovery', ['Customer discovery', 'Validation'], ['Problem Validation Log', 'Validate a startup problem with real conversations.', ['At least 10 interviews logged', 'Evidence for or against the problem', 'Decision on whether to proceed']]),
      m('ss-mvp', 'Building an MVP', ['MVP', 'Rapid prototyping'], ['One-Week MVP', 'Ship the smallest version of your idea that someone can use.', ['Working MVP link', 'At least 3 real users tried it', 'What you learned from them']]),
      m('ss-economics', 'Unit economics', ['Unit economics', 'Pricing'], ['Unit Economics Model', 'Model the unit economics of your idea.', ['CAC, LTV and margin estimates', 'Clear assumptions', 'What must be true to work']]),
    ],
  }),
  course({
    id: 'research-methods', title: 'Research Methodology', provider: 'NPTEL', url: 'https://nptel.ac.in',
    careers: ['research-academia', 'biomedical', 'ai-ml', 'energy-sustainability', 'vlsi'],
    price: 0, duration: '8 weeks', difficulty: 'intermediate',
    description: 'Literature review, experimental design, scientific writing and reproducibility.',
    modules: [
      m('rm-literature', 'Literature review', ['Literature review', 'Research synthesis'], ['Mini Survey Paper', 'Write a short survey of 8–10 papers in an area you like.', ['Organised taxonomy of approaches', 'Comparison table', 'Open problems identified']]),
      m('rm-experiment', 'Experimental design', ['Experimental design', 'Statistics'], ['Controlled Experiment', 'Design and run a small controlled experiment.', ['Clear hypothesis and variables', 'Controls and repetition', 'Statistical analysis of results']]),
      m('rm-reproduce', 'Reproducing a paper', ['Reproducibility', 'Scientific writing'], ['Paper Reproduction', 'Reproduce one key result from a published paper.', ['Re-implement the method', 'Compare your numbers with the paper', 'Report in LaTeX with discussion']]),
    ],
  }),
  course({
    id: 'quant-foundations', title: 'Quantitative Finance Foundations', provider: 'QuantInsti', url: 'https://www.quantinsti.com',
    careers: ['quant-finance'], prerequisites: ['stats-probability', 'py-foundations'],
    price: 30000, duration: '3 months', difficulty: 'intermediate',
    description: 'Time series, backtesting, options pricing and risk.',
    modules: [
      m('qf-timeseries', 'Time-series analysis', ['Time series', 'Returns'], ['NIFTY Returns Study', 'Analyse the return characteristics of an index.', ['Compute log returns and volatility', 'Test for stationarity', 'Discuss fat tails']]),
      m('qf-backtest', 'Backtesting strategies', ['Backtesting', 'Trading strategies'], ['Moving-Average Backtester', 'Backtest a moving-average crossover strategy.', ['Avoid look-ahead bias', 'Include transaction costs', 'Report Sharpe ratio and drawdown']]),
      m('qf-options', 'Options pricing', ['Options pricing', 'Black-Scholes'], ['Option Pricer', 'Price options with Black-Scholes and Monte Carlo.', ['Implement both methods', 'Compare results', 'Plot price vs volatility']]),
      m('qf-risk', 'Risk metrics', ['Value at Risk', 'Risk management'], ['Portfolio VaR Report', 'Estimate the Value at Risk of a sample portfolio.', ['Historical and parametric VaR', 'Backtest the VaR', 'Explain limitations']]),
    ],
  }),
  course({
    id: 'quant-free', title: 'Financial Markets', provider: 'Yale (Coursera, audit)', url: 'https://www.coursera.org',
    careers: ['quant-finance', 'consulting-analyst'],
    price: 0, duration: '7 weeks', difficulty: 'beginner',
    description: 'Free overview of markets, risk, and financial instruments.',
    modules: [
      m('fm-markets', 'Markets & instruments', ['Financial markets', 'Instruments'], ['Market Instruments Explainer', 'Build a notebook explaining and charting major instruments.', ['Cover equities, bonds and derivatives', 'Real data charts for each', 'Plain-language explanations']]),
      m('fm-risk', 'Risk & diversification', ['Diversification', 'Portfolio theory'], ['Diversification Simulator', 'Show how diversification changes portfolio risk.', ['Simulate portfolios of increasing size', 'Plot risk vs number of assets', 'Explain the result']]),
    ],
  }),
];

// Higher-study programmes. These are pathway stages (milestones), not module-tracked courses.
export const PROGRAMMES = {
  mtech: {
    id: 'mtech', kind: 'programme', title: 'M.Tech (via GATE, government institute)', provider: 'IITs / NITs',
    price: 200000, duration: '2 years', educationLevel: 1,
    steps: ['Prepare for GATE in your final year', 'Apply to IITs/NITs with research groups in your area', 'Choose a thesis aligned with your target role'],
  },
  ms_abroad: {
    id: 'ms_abroad', kind: 'programme', title: 'MS abroad', provider: 'International universities',
    price: 3000000, duration: '2 years', educationLevel: 1,
    steps: ['Take GRE/TOEFL or IELTS', 'Build research or project experience for applications', 'Look for assistantships to offset cost'],
  },
  mba: {
    id: 'mba', kind: 'programme', title: 'MBA (after 2–3 years of work)', provider: 'IIMs / business schools',
    price: 1500000, duration: '2 years', educationLevel: 1,
    steps: ['Work 2–3 years in an engineering or analyst role', 'Prepare for CAT/GMAT', 'Target programmes with strong product/consulting outcomes'],
  },
  phd: {
    id: 'phd', kind: 'programme', title: 'PhD (stipend-funded)', provider: 'IITs / IISc / universities abroad',
    price: 100000, duration: '4–5 years', educationLevel: 3,
    steps: ['Get research experience with a faculty mentor', 'Prepare GATE/GRE and a research statement', 'Apply for funded positions (stipend covers living costs)'],
  },
};

// Learning tracks per career: ordered stages; each stage lists alternative courses
// (pathway logic picks one by budget/pathway type). `programme` is the higher-study
// route for this career; `specialisation` is the stage taken alongside/after it.
export const CAREER_TRACKS = {
  'software-eng': { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Core CS', options: ['dsa-essentials'] },
    { title: 'Web development', options: ['web-fullstack'] },
    { title: 'Backend & systems', options: ['backend-systems'] },
  ], specialisation: { title: 'Cloud & deployment', options: ['cloud-foundations', 'devops-containers'] } },
  'data-science': { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Data', options: ['sql-analytics', 'data-analysis-python'] },
    { title: 'Statistics', options: ['stats-probability'] },
    { title: 'Machine learning', options: ['ml-foundations', 'ml-pg-certificate'] },
  ], specialisation: { title: 'Business intelligence', options: ['bi-dashboards'] } },
  'ai-ml': { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Data', options: ['data-analysis-python', 'sql-analytics'] },
    { title: 'Statistics', options: ['stats-probability'] },
    { title: 'Machine learning', options: ['ml-foundations', 'ml-pg-certificate'] },
  ], specialisation: { title: 'Specialisation: deep learning & LLMs', options: ['deep-learning', 'mlops'] } },
  cybersecurity: { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Security fundamentals', options: ['sec-foundations'] },
    { title: 'Cloud security', options: ['cloud-foundations'] },
    { title: 'Offensive security', options: ['sec-offensive'] },
  ], specialisation: { title: 'Specialisation', options: ['devops-containers'] } },
  'cloud-devops': { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Cloud fundamentals', options: ['cloud-foundations'] },
    { title: 'Containers & CI/CD', options: ['devops-containers'] },
  ], specialisation: { title: 'MLOps', options: ['mlops'] } },
  'embedded-iot': { programme: 'mtech', stages: [
    { title: 'Embedded foundations', options: ['embedded-c'] },
    { title: 'Digital design', options: ['digital-verilog'] },
    { title: 'Connected devices', options: ['iot-systems'] },
  ], specialisation: { title: 'Robotics integration', options: ['robotics-ros'] } },
  vlsi: { programme: 'mtech', stages: [
    { title: 'Digital design', options: ['digital-verilog'] },
    { title: 'Embedded systems', options: ['embedded-c'] },
    { title: 'Industry RTL & verification', options: ['vlsi-pro'] },
  ], specialisation: { title: 'Research skills', options: ['research-methods'] } },
  robotics: { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Embedded control', options: ['embedded-c'] },
    { title: 'Mechanical design', options: ['cad-design'] },
    { title: 'Robot software', options: ['robotics-ros'] },
  ], specialisation: { title: 'Perception with deep learning', options: ['deep-learning'] } },
  'core-mech': { programme: 'mtech', stages: [
    { title: 'Design tools', options: ['cad-design'] },
    { title: 'Manufacturing', options: ['manufacturing'] },
  ], specialisation: { title: 'Automation', options: ['robotics-ros'] } },
  'civil-infra': { programme: 'mtech', stages: [
    { title: 'Design & BIM', options: ['civil-bim'] },
    { title: 'Design tools', options: ['cad-design'] },
  ], specialisation: { title: 'Sustainable infrastructure', options: ['renewable-energy'] } },
  'energy-sustainability': { programme: 'mtech', stages: [
    { title: 'Energy systems', options: ['renewable-energy'] },
    { title: 'Data for energy', options: ['data-analysis-python'] },
    { title: 'Connected devices', options: ['embedded-c'] },
  ], specialisation: { title: 'Research skills', options: ['research-methods'] } },
  biomedical: { programme: 'mtech', stages: [
    { title: 'Biomedical foundations', options: ['biomed-signals'] },
    { title: 'Programming', options: ['py-foundations'] },
    { title: 'Health data', options: ['data-analysis-python'] },
  ], specialisation: { title: 'Medical AI', options: ['ml-foundations', 'deep-learning'] } },
  'product-management': { programme: 'mba', stages: [
    { title: 'Product thinking', options: ['product-mgmt'] },
    { title: 'Data for decisions', options: ['sql-analytics'] },
    { title: 'Design', options: ['ux-foundations'] },
    { title: 'Building', options: ['web-fullstack'] },
  ], specialisation: { title: 'Business analysis', options: ['problem-solving'] } },
  'ux-design': { programme: 'mtech', stages: [
    { title: 'Visual design', options: ['figma-free'] },
    { title: 'UX process', options: ['ux-foundations'] },
    { title: 'Front-end basics', options: ['web-fullstack'] },
  ], specialisation: { title: 'Product thinking', options: ['product-mgmt'] } },
  'research-academia': { programme: 'phd', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Statistics', options: ['stats-probability'] },
    { title: 'Research methods', options: ['research-methods'] },
  ], specialisation: { title: 'Research area', options: ['ml-foundations', 'deep-learning'] } },
  entrepreneurship: { programme: 'mba', stages: [
    { title: 'Startup fundamentals', options: ['startup-school'] },
    { title: 'Building', options: ['web-fullstack'] },
    { title: 'Business skills', options: ['problem-solving'] },
  ], specialisation: { title: 'Product', options: ['product-mgmt'] } },
  'consulting-analyst': { programme: 'mba', stages: [
    { title: 'Problem solving', options: ['problem-solving'] },
    { title: 'Data analysis', options: ['sql-analytics'] },
    { title: 'Dashboards', options: ['bi-dashboards'] },
  ], specialisation: { title: 'Finance', options: ['quant-free'] } },
  'quant-finance': { programme: 'mtech', stages: [
    { title: 'Foundations', options: ['py-foundations'] },
    { title: 'Probability & statistics', options: ['stats-probability'] },
    { title: 'Markets', options: ['quant-free', 'quant-foundations'] },
    { title: 'Quantitative methods', options: ['quant-foundations'] },
  ], specialisation: { title: 'Machine learning', options: ['ml-foundations'] } },
};

export const COURSE_BY_ID = Object.fromEntries(COURSES.map((c) => [c.id, c]));

export function findModule(courseId, moduleId) {
  return COURSE_BY_ID[courseId]?.modules.find((md) => md.id === moduleId) ?? null;
}

/** All skills a course teaches (union of module skills, in order). */
export const courseSkills = (c) => [...new Set(c.modules.flatMap((md) => md.skills))];

export const formatPrice = (p) =>
  p === 0 ? 'Free' : p >= 100000 ? `₹${(p / 100000).toFixed(p % 100000 ? 1 : 0)}L` : `₹${p.toLocaleString('en-IN')}`;
