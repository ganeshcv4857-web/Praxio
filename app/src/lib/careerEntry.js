// PROTOTYPE DATA: how school students typically enter each career (India).
// Keyed by the existing career ids (src/lib/careers.js). Used only to interpret Career Fit
// for school stages; it never affects any score.
//   streams: recommended 11th/12th streams (SCHOOL_STREAMS ids), most direct first
//   degrees: common undergraduate entry degrees
//   exams:   common entrance exams for those degrees
//   explore: low-cost ways to try the field while still in school

export const CAREER_ENTRY = {
  'software-eng': { streams: ['pcm', 'pcmb'], degrees: ['B.Tech / B.E. in CSE or IT', 'BCA', 'B.Sc Computer Science'], exams: ['JEE Main', 'State engineering CETs', 'CUET (for B.Sc/BCA)'], explore: ['Try a free beginner programming course', 'Build a small game or website'] },
  'data-science': { streams: ['pcm', 'pcmb'], degrees: ['B.Tech (CSE / AI & DS)', 'B.Sc Statistics / Mathematics', 'BCA'], exams: ['JEE Main', 'State CETs', 'CUET', 'ISI admission test'], explore: ['Learn spreadsheet charts with real data', 'Try a beginner Python course'] },
  'ai-ml': { streams: ['pcm', 'pcmb'], degrees: ['B.Tech (CSE / AI & ML)', 'B.Sc Mathematics + CS'], exams: ['JEE Main', 'JEE Advanced', 'State CETs'], explore: ['Strengthen maths fundamentals', 'Try a beginner AI course'] },
  cybersecurity: { streams: ['pcm'], degrees: ['B.Tech (CSE / Cyber Security)', 'BCA', 'B.Sc Computer Science'], exams: ['JEE Main', 'State CETs', 'CUET'], explore: ['Learn how the internet works', 'Try a beginner CTF puzzle site'] },
  'cloud-devops': { streams: ['pcm'], degrees: ['B.Tech (CSE / IT)', 'BCA'], exams: ['JEE Main', 'State CETs', 'CUET'], explore: ['Learn basic Linux commands', 'Host a simple website for free'] },
  'embedded-iot': { streams: ['pcm'], degrees: ['B.Tech / B.E. in ECE or EEE'], exams: ['JEE Main', 'State engineering CETs'], explore: ['Build an Arduino or electronics kit project'] },
  vlsi: { streams: ['pcm'], degrees: ['B.Tech / B.E. in ECE or EEE'], exams: ['JEE Main', 'JEE Advanced', 'State CETs'], explore: ['Study digital logic basics', 'Build simple circuits'] },
  robotics: { streams: ['pcm'], degrees: ['B.Tech in Mechanical, Mechatronics, ECE or Robotics'], exams: ['JEE Main', 'State CETs'], explore: ['Join or start a robotics club', 'Try a robotics kit'] },
  'core-mech': { streams: ['pcm'], degrees: ['B.Tech / B.E. in Mechanical or Production', 'Diploma in Mechanical Engineering'], exams: ['JEE Main', 'State CETs', 'Polytechnic entrance'], explore: ['Take apart and rebuild simple machines', 'Try free CAD software'] },
  'civil-infra': { streams: ['pcm'], degrees: ['B.Tech / B.E. in Civil', 'Diploma in Civil Engineering', 'B.Arch (related)'], exams: ['JEE Main', 'State CETs', 'NATA (for B.Arch)'], explore: ['Visit a construction site with an adult', 'Sketch building plans'] },
  'energy-sustainability': { streams: ['pcm'], degrees: ['B.Tech in EEE, Mechanical, Chemical or Energy Engineering', 'B.Sc Environmental Science'], exams: ['JEE Main', 'State CETs', 'CUET'], explore: ['Do a home energy-use project', 'Learn how solar panels work'] },
  biomedical: { streams: ['pcmb', 'pcb', 'pcm'], degrees: ['B.Tech Biomedical / Biotechnology', 'B.Sc Biotechnology'], exams: ['JEE Main', 'State CETs', 'CUET'], explore: ['Read about medical devices', 'Join a science fair with a health project'] },
  'product-management': { streams: ['pcm', 'commerce'], degrees: ['B.Tech (any branch)', 'BBA', 'B.Des'], exams: ['JEE Main', 'CUET', 'IPMAT', 'UCEED / NID (design)'], explore: ['Interview friends about an app they use', 'Join a business or tech club'] },
  'ux-design': { streams: ['pcm', 'humanities', 'commerce'], degrees: ['B.Des (Interaction / Communication Design)', 'B.Tech CSE + design electives'], exams: ['UCEED', 'NID DAT', 'NIFT', 'CUET'], explore: ['Redesign an app screen on paper', 'Try free design tools'] },
  'research-academia': { streams: ['pcm', 'pcmb', 'pcb'], degrees: ['B.S./B.Sc at IISER/IISc/NISER', 'B.Tech (any branch)', 'Integrated M.Sc'], exams: ['IISER Aptitude Test', 'NEST', 'JEE Advanced', 'CUET'], explore: ['Science olympiads', 'A science-fair research project'] },
  entrepreneurship: { streams: ['pcm', 'commerce', 'humanities'], degrees: ['B.Tech (any branch)', 'BBA', 'B.Com'], exams: ['JEE Main', 'CUET', 'IPMAT'], explore: ['Run a small school stall or service', 'Join an entrepreneurship club'] },
  'consulting-analyst': { streams: ['commerce', 'pcm', 'humanities'], degrees: ['B.Com / BBA', 'B.Tech (any branch)', 'BA Economics'], exams: ['CUET', 'IPMAT', 'JEE Main'], explore: ['Debate or case-study clubs', 'Learn spreadsheet basics'] },
  'quant-finance': { streams: ['pcm', 'commerce'], degrees: ['B.Tech (CSE / Maths & Computing)', 'B.Stat / B.Math (ISI)', 'B.Sc Mathematics / Economics'], exams: ['JEE Advanced', 'ISI admission test', 'CMI entrance', 'CUET'], explore: ['Maths olympiads', 'Track a few stocks on paper'] },
};
